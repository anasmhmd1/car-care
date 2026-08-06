'use server';

import {
  MaterialMovementType,
  OperationalVehicleStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { canAccessBranch } from '@/lib/auth/authorization';
import {
  bookingPermissionScopes,
  hasPermission,
  hasPermissionAcrossScopes,
} from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { canUseServiceMaterialRequirement } from '@/lib/validations/catalog-materials';
import { databaseIdSchema } from '@/lib/validations/database-id';

const RESOURCE_ROLES = [
  UserRole.OPERATIONS_MANAGER,
  UserRole.OWNER,
  UserRole.SYSTEM_SUPER_ADMIN,
] as const;

const TERMINAL_BOOKING_STATUSES = [
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
  'CLOSED',
] as const;

const FIXED_DIRECTION_MOVEMENT_TYPES: ReadonlySet<MaterialMovementType> = new Set([
  MaterialMovementType.RECEIPT,
  MaterialMovementType.RETURN,
  MaterialMovementType.CONSUMPTION,
  MaterialMovementType.WASTE,
]);

type ResourceActor = {
  id: string;
  role: UserRole;
};

export interface OperationsResourceActionResult {
  success?: true;
  message?: string;
  error?: string;
}

const optionalIdSchema = z.preprocess(
  (value) => typeof value === 'string' && value.trim() ? value.trim() : undefined,
  databaseIdSchema.optional(),
);

const nullableNonnegativeIntegerSchema = z.preprocess(
  (value) => value === '' || value === null || value === undefined ? null : value,
  z.coerce.number().int().min(0).max(1_000_000).nullable(),
);

const materialSchema = z.object({
  materialId: optionalIdSchema,
  sku: z.string().trim().toUpperCase().regex(
    /^[A-Z0-9][A-Z0-9._-]{1,63}$/,
    'كود الصنف يقبل حروفًا إنجليزية وأرقامًا وشرطة أو نقطة فقط.',
  ),
  nameAr: z.string().trim().min(2, 'اسم الصنف مطلوب.').max(140),
  nameEn: z.string().trim().max(140).optional(),
  unit: z.string().trim().min(1, 'وحدة القياس مطلوبة.').max(40),
  defaultReorderPoint: z.coerce.number().int().min(0).max(1_000_000),
  active: z.boolean(),
});

const serviceMaterialRequirementSchema = z.object({
  requirementId: optionalIdSchema,
  serviceId: databaseIdSchema,
  materialId: databaseIdSchema,
  quantity: z.coerce.number().int().min(1, 'الكمية المطلوبة يجب أن تكون أكبر من صفر.').max(1_000_000),
  required: z.boolean(),
  notes: z.string().trim().max(1_000).optional(),
});

const branchStockSchema = z.object({
  stockId: optionalIdSchema,
  branchId: databaseIdSchema,
  materialId: databaseIdSchema,
  reorderPoint: nullableNonnegativeIntegerSchema,
  reservedQuantity: z.coerce.number().int().min(0).max(1_000_000),
  initialQuantity: z.coerce.number().int().min(0).max(1_000_000),
  active: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

const inventoryMovementSchema = z.object({
  branchStockId: databaseIdSchema,
  type: z.nativeEnum(MaterialMovementType),
  quantity: z.coerce.number().int().min(-1_000_000).max(1_000_000),
  bookingId: optionalIdSchema,
  reason: z.string().trim().min(2, 'سبب الحركة مطلوب.').max(500),
}).superRefine((value, context) => {
  if (value.quantity === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['quantity'], message: 'كمية الحركة لا يمكن أن تساوي صفرًا.' });
  }
  if (FIXED_DIRECTION_MOVEMENT_TYPES.has(value.type) && value.quantity < 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['quantity'], message: 'أدخل كمية موجبة لهذا النوع من الحركات.' });
  }
});

const operationalVehicleSchema = z.object({
  operationalVehicleId: optionalIdSchema,
  branchId: databaseIdSchema,
  teamId: optionalIdSchema,
  code: z.string().trim().toUpperCase().regex(
    /^[A-Z0-9][A-Z0-9_-]{1,49}$/,
    'كود سيارة التشغيل غير صالح.',
  ),
  plateNumber: z.string().trim().max(60).optional(),
  make: z.string().trim().min(1, 'العلامة التجارية مطلوبة.').max(80),
  model: z.string().trim().min(1, 'موديل السيارة مطلوب.').max(80),
  year: z.preprocess(
    (value) => value === '' || value === null || value === undefined ? null : value,
    z.coerce.number().int().min(1950).max(2100).nullable(),
  ),
  status: z.nativeEnum(OperationalVehicleStatus),
  notes: z.string().trim().max(1_000).optional(),
});

const bookingResourceAssignmentSchema = z.object({
  bookingId: databaseIdSchema,
  employeeId: optionalIdSchema,
  operationalVehicleId: optionalIdSchema,
  clearEmployee: z.boolean(),
  clearOperationalVehicle: z.boolean(),
  reason: z.string().trim().min(3, 'سبب التخصيص مطلوب.').max(500),
}).superRefine((value, context) => {
  if (
    !value.employeeId &&
    !value.operationalVehicleId &&
    !value.clearEmployee &&
    !value.clearOperationalVehicle
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['employeeId'],
      message: 'اختر موردًا للتخصيص أو حدّد المورد الذي تريد فك تخصيصه.',
    });
  }
  if (value.employeeId && value.clearEmployee) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['clearEmployee'],
      message: 'اختر موظفًا أو فك تخصيص الموظف الحالي، وليس الإجراءين معًا.',
    });
  }
  if (value.operationalVehicleId && value.clearOperationalVehicle) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['clearOperationalVehicle'],
      message: 'اختر سيارة أو فك تخصيص سيارة التشغيل الحالية، وليس الإجراءين معًا.',
    });
  }
});

function boolField(value: FormDataEntryValue | null, fallback = false) {
  if (value === null) return fallback;
  return value === 'true' || value === 'on' || value === '1';
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function resourceActor(): Promise<ResourceActor> {
  return requireRole([...RESOURCE_ROLES]);
}

function canManageGlobalCatalog(actor: ResourceActor) {
  return actor.role === UserRole.OWNER || actor.role === UserRole.SYSTEM_SUPER_ADMIN;
}

async function canManageBranchResources(actor: ResourceActor, branchId: string) {
  const [canAccess, canManage] = await Promise.all([
    canAccessBranch(actor, branchId),
    hasPermission(actor, 'workforce.manage', { type: 'BRANCH', id: branchId }),
  ]);
  return canAccess && canManage;
}

async function canAssignBookingResources(
  actor: ResourceActor,
  booking: { branchId: string; assignedTeamId: string | null },
) {
  const [canAccess, canAssign] = await Promise.all([
    canAccessBranch(actor, booking.branchId),
    hasPermissionAcrossScopes(
      actor,
      'booking.assign',
      bookingPermissionScopes(booking),
    ),
  ]);
  return canAccess && canAssign;
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  actor: ResourceActor,
  action: string,
  entityType: string,
  entityId: string,
  beforeJson?: Prisma.InputJsonValue,
  afterJson?: Prisma.InputJsonValue,
  reason?: string,
) {
  await tx.auditLog.create({
    data: {
      actorUserId: actor.id,
      actorRole: actor.role,
      action,
      entityType,
      entityId,
      beforeJson,
      afterJson,
      reason: reason || null,
    },
  });
}

function revalidateResources(bookingId?: string) {
  revalidatePath('/operations/resources');
  revalidatePath('/operations');
  revalidatePath('/operations/workforce');
  revalidatePath('/admin');
  revalidatePath('/admin/calendar');
  revalidatePath('/admin/catalog');
  revalidatePath('/staff');
  if (bookingId) {
    revalidatePath(`/account/bookings/${bookingId}`);
    revalidatePath('/account/bookings');
  }
}

function resourceError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return 'هذه القيمة مستخدمة بالفعل في سجل آخر.';
    if (error.code === 'P2003') return 'لا يمكن تنفيذ العملية لوجود بيانات تشغيل مرتبطة.';
    if (error.code === 'P2034') return 'تغيّرت البيانات أثناء الحفظ؛ حدّث الصفحة ثم أعد المحاولة.';
  }
  console.error('Operations resource action failed:', error);
  return 'تعذر حفظ بيانات الموارد التشغيلية. تحقق من المدخلات ثم حاول مرة أخرى.';
}

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;

export async function saveOperationalMaterialAction(
  formData: FormData,
): Promise<OperationsResourceActionResult> {
  const actor = await resourceActor();
  if (!canManageGlobalCatalog(actor)) {
    return { error: 'إدارة أصناف المواد متاحة للمالك أو مدير النظام فقط.' };
  }
  const parsed = materialSchema.safeParse({
    materialId: formData.get('materialId'),
    sku: formData.get('sku'),
    nameAr: formData.get('nameAr'),
    nameEn: optionalString(formData.get('nameEn')),
    unit: formData.get('unit'),
    defaultReorderPoint: formData.get('defaultReorderPoint'),
    active: boolField(formData.get('active'), true),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات الصنف غير صالحة.' };

  try {
    const saved = await db.$transaction(async (tx) => {
      const before = parsed.data.materialId
        ? await tx.material.findUnique({ where: { id: parsed.data.materialId } })
        : null;
      if (parsed.data.materialId && !before) throw new Error('MATERIAL_NOT_FOUND');
      const data = {
        sku: parsed.data.sku,
        nameAr: parsed.data.nameAr,
        nameEn: parsed.data.nameEn || null,
        unit: parsed.data.unit,
        defaultReorderPoint: parsed.data.defaultReorderPoint,
        active: parsed.data.active,
      };
      const material = before
        ? await tx.material.update({ where: { id: before.id }, data })
        : await tx.material.create({ data });
      await writeAudit(
        tx,
        actor,
        before ? 'OPERATIONAL_MATERIAL_UPDATED' : 'OPERATIONAL_MATERIAL_CREATED',
        'Material',
        material.id,
        before ? {
          sku: before.sku,
          nameAr: before.nameAr,
          unit: before.unit,
          defaultReorderPoint: before.defaultReorderPoint,
          active: before.active,
        } : undefined,
        data,
      );
      return material;
    }, transactionOptions);
    revalidateResources();
    return { success: true, message: `تم حفظ الصنف ${saved.nameAr}.` };
  } catch (error) {
    if (error instanceof Error && error.message === 'MATERIAL_NOT_FOUND') return { error: 'صنف المادة غير موجود.' };
    return { error: resourceError(error) };
  }
}

export async function saveServiceMaterialRequirementAction(
  formData: FormData,
): Promise<OperationsResourceActionResult> {
  const actor = await resourceActor();
  if (!canManageGlobalCatalog(actor)) {
    return { error: 'تحديد مواد الخدمات متاح للمالك أو مدير النظام فقط.' };
  }
  const parsed = serviceMaterialRequirementSchema.safeParse({
    requirementId: formData.get('requirementId'),
    serviceId: formData.get('serviceId'),
    materialId: formData.get('materialId'),
    quantity: formData.get('quantity'),
    required: boolField(formData.get('required'), true),
    notes: optionalString(formData.get('notes')),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات متطلب الخدمة غير صالحة.' };

  try {
    await db.$transaction(async (tx) => {
      const before = parsed.data.requirementId
        ? await tx.serviceMaterialRequirement.findUnique({ where: { id: parsed.data.requirementId } })
        : null;
      if (parsed.data.requirementId && !before) throw new Error('REQUIREMENT_NOT_FOUND');
      if (before && before.serviceId !== parsed.data.serviceId) throw new Error('REQUIREMENT_SERVICE_IMMUTABLE');
      const [service, material] = await Promise.all([
        tx.service.findUnique({ where: { id: parsed.data.serviceId }, select: { id: true } }),
        tx.material.findUnique({ where: { id: parsed.data.materialId }, select: { id: true, active: true } }),
      ]);
      if (!service) throw new Error('SERVICE_NOT_FOUND');
      if (!material) throw new Error('MATERIAL_NOT_FOUND');
      const existingMaterialIds = new Set(before ? [before.materialId] : []);
      if (!canUseServiceMaterialRequirement(material, existingMaterialIds)) throw new Error('INACTIVE_MATERIAL');
      const data = {
        materialId: parsed.data.materialId,
        quantity: parsed.data.quantity,
        required: parsed.data.required,
        notes: parsed.data.notes || null,
      };
      const requirement = before
        ? await tx.serviceMaterialRequirement.update({ where: { id: before.id }, data })
        : await tx.serviceMaterialRequirement.create({ data: { serviceId: parsed.data.serviceId, ...data } });
      await writeAudit(
        tx,
        actor,
        before ? 'SERVICE_MATERIAL_REQUIREMENT_UPDATED' : 'SERVICE_MATERIAL_REQUIREMENT_CREATED',
        'ServiceMaterialRequirement',
        requirement.id,
        before ? {
          serviceId: before.serviceId,
          materialId: before.materialId,
          quantity: before.quantity,
          required: before.required,
          notes: before.notes,
        } : undefined,
        { serviceId: requirement.serviceId, ...data },
      );
    }, transactionOptions);
    revalidateResources();
    return { success: true, message: 'تم حفظ مواد الخدمة المطلوبة.' };
  } catch (error) {
    const messages: Record<string, string> = {
      REQUIREMENT_NOT_FOUND: 'متطلب المادة غير موجود.',
      REQUIREMENT_SERVICE_IMMUTABLE: 'لا يمكن نقل متطلب موجود إلى خدمة أخرى؛ أنشئ متطلبًا جديدًا.',
      SERVICE_NOT_FOUND: 'الخدمة غير موجودة.',
      MATERIAL_NOT_FOUND: 'صنف المادة غير موجود.',
      INACTIVE_MATERIAL: 'لا يمكن إضافة مادة موقوفة إلى الخدمة.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: resourceError(error) };
  }
}

export async function saveBranchMaterialStockAction(
  formData: FormData,
): Promise<OperationsResourceActionResult> {
  const actor = await resourceActor();
  const parsed = branchStockSchema.safeParse({
    stockId: formData.get('stockId'),
    branchId: formData.get('branchId'),
    materialId: formData.get('materialId'),
    reorderPoint: formData.get('reorderPoint'),
    reservedQuantity: formData.get('reservedQuantity'),
    initialQuantity: formData.get('initialQuantity'),
    active: boolField(formData.get('active'), true),
    reason: optionalString(formData.get('reason')),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات مخزون الفرع غير صالحة.' };
  if (!(await canManageBranchResources(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة مخزون هذا الفرع.' };
  }

  try {
    await db.$transaction(async (tx) => {
      const before = parsed.data.stockId
        ? await tx.branchMaterialStock.findUnique({ where: { id: parsed.data.stockId } })
        : null;
      if (parsed.data.stockId && !before) throw new Error('STOCK_NOT_FOUND');
      if (before && before.branchId !== parsed.data.branchId) throw new Error('STOCK_BRANCH_MISMATCH');
      if (before && before.materialId !== parsed.data.materialId) throw new Error('STOCK_MATERIAL_IMMUTABLE');
      const [branch, material] = await Promise.all([
        tx.branch.findUnique({ where: { id: parsed.data.branchId }, select: { id: true } }),
        tx.material.findUnique({ where: { id: parsed.data.materialId }, select: { id: true, active: true } }),
      ]);
      if (!branch) throw new Error('BRANCH_NOT_FOUND');
      if (!material || (!material.active && !before)) throw new Error('MATERIAL_NOT_AVAILABLE');

      const quantityOnHand = before?.quantityOnHand ?? parsed.data.initialQuantity;
      if (parsed.data.reservedQuantity > quantityOnHand) throw new Error('RESERVED_EXCEEDS_ON_HAND');
      const data = {
        reorderPoint: parsed.data.reorderPoint,
        reservedQuantity: parsed.data.reservedQuantity,
        active: parsed.data.active,
      };
      const stock = before
        ? await tx.branchMaterialStock.update({ where: { id: before.id }, data })
        : await tx.branchMaterialStock.create({
            data: {
              branchId: parsed.data.branchId,
              materialId: parsed.data.materialId,
              quantityOnHand,
              ...data,
            },
          });
      if (!before && quantityOnHand > 0) {
        await tx.inventoryMovement.create({
          data: {
            branchStockId: stock.id,
            type: MaterialMovementType.RECEIPT,
            quantityChange: quantityOnHand,
            balanceAfter: quantityOnHand,
            reason: parsed.data.reason || 'رصيد افتتاحي عند إعداد مخزون الفرع',
            createdByUserId: actor.id,
          },
        });
      }
      await writeAudit(
        tx,
        actor,
        before ? 'BRANCH_MATERIAL_STOCK_UPDATED' : 'BRANCH_MATERIAL_STOCK_CREATED',
        'BranchMaterialStock',
        stock.id,
        before ? {
          branchId: before.branchId,
          materialId: before.materialId,
          quantityOnHand: before.quantityOnHand,
          reservedQuantity: before.reservedQuantity,
          reorderPoint: before.reorderPoint,
          active: before.active,
        } : undefined,
        {
          branchId: stock.branchId,
          materialId: stock.materialId,
          quantityOnHand,
          ...data,
        },
        parsed.data.reason,
      );
    }, transactionOptions);
    revalidateResources();
    return { success: true, message: 'تم حفظ إعداد مخزون الفرع.' };
  } catch (error) {
    const messages: Record<string, string> = {
      STOCK_NOT_FOUND: 'سجل المخزون غير موجود.',
      STOCK_BRANCH_MISMATCH: 'سجل المخزون لا يتبع هذا الفرع.',
      STOCK_MATERIAL_IMMUTABLE: 'لا يمكن تغيير صنف سجل مخزون قائم؛ أنشئ سجلًا جديدًا.',
      BRANCH_NOT_FOUND: 'الفرع غير موجود.',
      MATERIAL_NOT_AVAILABLE: 'صنف المادة غير موجود أو متوقف.',
      RESERVED_EXCEEDS_ON_HAND: 'الكمية المحجوزة لا يمكن أن تتجاوز الرصيد الفعلي.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: resourceError(error) };
  }
}

export async function recordInventoryMovementAction(
  formData: FormData,
): Promise<OperationsResourceActionResult> {
  const actor = await resourceActor();
  const parsed = inventoryMovementSchema.safeParse({
    branchStockId: formData.get('branchStockId'),
    type: formData.get('type'),
    quantity: formData.get('quantity'),
    bookingId: formData.get('bookingId'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات حركة المخزون غير صالحة.' };

  const scopedStock = await db.branchMaterialStock.findUnique({
    where: { id: parsed.data.branchStockId },
    select: { branchId: true },
  });
  if (!scopedStock) return { error: 'سجل المخزون غير موجود.' };
  if (!(await canManageBranchResources(actor, scopedStock.branchId))) {
    return { error: 'غير مصرح لك بتسجيل حركة في هذا الفرع.' };
  }

  const quantityChange = (
    parsed.data.type === MaterialMovementType.CONSUMPTION || parsed.data.type === MaterialMovementType.WASTE
  ) ? -parsed.data.quantity : parsed.data.quantity;

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`inventory:${parsed.data.branchStockId}`}))`;
      const stock = await tx.branchMaterialStock.findUnique({
        where: { id: parsed.data.branchStockId },
        include: { material: { select: { nameAr: true } } },
      });
      if (!stock) throw new Error('STOCK_NOT_FOUND');
      if (!stock.active) throw new Error('STOCK_INACTIVE');
      if (parsed.data.bookingId) {
        const booking = await tx.booking.findFirst({
          where: { id: parsed.data.bookingId, branchId: stock.branchId, deletedAt: null },
          select: { id: true },
        });
        if (!booking) throw new Error('BOOKING_BRANCH_MISMATCH');
      }
      const balanceAfter = stock.quantityOnHand + quantityChange;
      if (balanceAfter < stock.reservedQuantity) throw new Error('INSUFFICIENT_STOCK');
      const [updatedStock, movement] = await Promise.all([
        tx.branchMaterialStock.update({
          where: { id: stock.id },
          data: { quantityOnHand: balanceAfter },
        }),
        tx.inventoryMovement.create({
          data: {
            branchStockId: stock.id,
            bookingId: parsed.data.bookingId || null,
            type: parsed.data.type,
            quantityChange,
            balanceAfter,
            reason: parsed.data.reason,
            createdByUserId: actor.id,
          },
        }),
      ]);
      await writeAudit(
        tx,
        actor,
        `INVENTORY_${parsed.data.type}`,
        'InventoryMovement',
        movement.id,
        {
          branchStockId: stock.id,
          quantityOnHand: stock.quantityOnHand,
          reservedQuantity: stock.reservedQuantity,
        },
        {
          branchStockId: updatedStock.id,
          materialName: stock.material.nameAr,
          quantityChange,
          balanceAfter,
          bookingId: parsed.data.bookingId || null,
        },
        parsed.data.reason,
      );
    }, transactionOptions);
    revalidateResources(parsed.data.bookingId);
    return { success: true, message: 'تم تسجيل حركة المخزون وتحديث الرصيد.' };
  } catch (error) {
    const messages: Record<string, string> = {
      STOCK_NOT_FOUND: 'سجل المخزون غير موجود.',
      STOCK_INACTIVE: 'سجل المخزون متوقف ولا يقبل حركات جديدة.',
      BOOKING_BRANCH_MISMATCH: 'الحجز المحدد لا يتبع هذا الفرع.',
      INSUFFICIENT_STOCK: 'الحركة ستجعل الرصيد أقل من الكمية المحجوزة أو سالبًا.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: resourceError(error) };
  }
}

export async function saveOperationalVehicleAction(
  formData: FormData,
): Promise<OperationsResourceActionResult> {
  const actor = await resourceActor();
  const parsed = operationalVehicleSchema.safeParse({
    operationalVehicleId: formData.get('operationalVehicleId'),
    branchId: formData.get('branchId'),
    teamId: formData.get('teamId'),
    code: formData.get('code'),
    plateNumber: optionalString(formData.get('plateNumber')),
    make: formData.get('make'),
    model: formData.get('model'),
    year: formData.get('year'),
    status: formData.get('status'),
    notes: optionalString(formData.get('notes')),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات سيارة التشغيل غير صالحة.' };
  if (!(await canManageBranchResources(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة سيارات هذا الفرع.' };
  }

  try {
    await db.$transaction(async (tx) => {
      const before = parsed.data.operationalVehicleId
        ? await tx.operationalVehicle.findUnique({ where: { id: parsed.data.operationalVehicleId } })
        : null;
      if (parsed.data.operationalVehicleId && !before) throw new Error('OPERATIONAL_VEHICLE_NOT_FOUND');
      if (
        before
        && before.branchId !== parsed.data.branchId
        && !canManageGlobalCatalog(actor)
      ) throw new Error('VEHICLE_BRANCH_TRANSFER_FORBIDDEN');
      if (before && before.branchId !== parsed.data.branchId) {
        const activeBooking = await tx.booking.findFirst({
          where: {
            operationalVehicleId: before.id,
            deletedAt: null,
            bookingStatus: { notIn: [...TERMINAL_BOOKING_STATUSES] },
          },
          select: { id: true },
        });
        if (activeBooking) throw new Error('VEHICLE_HAS_ACTIVE_BOOKINGS');
      }
      const [branch, team] = await Promise.all([
        tx.branch.findUnique({ where: { id: parsed.data.branchId }, select: { id: true } }),
        parsed.data.teamId
          ? tx.team.findFirst({
              where: { id: parsed.data.teamId, branchId: parsed.data.branchId },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);
      if (!branch) throw new Error('BRANCH_NOT_FOUND');
      if (parsed.data.teamId && !team) throw new Error('TEAM_BRANCH_MISMATCH');
      const data = {
        branchId: parsed.data.branchId,
        teamId: parsed.data.teamId || null,
        code: parsed.data.code,
        plateNumber: parsed.data.plateNumber || null,
        make: parsed.data.make,
        model: parsed.data.model,
        year: parsed.data.year,
        status: parsed.data.status,
        notes: parsed.data.notes || null,
      };
      const vehicle = before
        ? await tx.operationalVehicle.update({ where: { id: before.id }, data })
        : await tx.operationalVehicle.create({ data });
      await writeAudit(
        tx,
        actor,
        before ? 'OPERATIONAL_VEHICLE_UPDATED' : 'OPERATIONAL_VEHICLE_CREATED',
        'OperationalVehicle',
        vehicle.id,
        before ? {
          branchId: before.branchId,
          teamId: before.teamId,
          code: before.code,
          plateNumber: before.plateNumber,
          make: before.make,
          model: before.model,
          year: before.year,
          status: before.status,
          notes: before.notes,
        } : undefined,
        data,
      );
    }, transactionOptions);
    revalidateResources();
    return { success: true, message: 'تم حفظ سيارة التشغيل.' };
  } catch (error) {
    const messages: Record<string, string> = {
      OPERATIONAL_VEHICLE_NOT_FOUND: 'سيارة التشغيل غير موجودة.',
      VEHICLE_BRANCH_TRANSFER_FORBIDDEN: 'نقل السيارة بين الفروع متاح للمالك أو مدير النظام فقط.',
      VEHICLE_HAS_ACTIVE_BOOKINGS: 'لا يمكن نقل السيارة بينما لديها حجوزات تشغيلية نشطة.',
      BRANCH_NOT_FOUND: 'الفرع غير موجود.',
      TEAM_BRANCH_MISMATCH: 'الفريق المحدد لا يتبع الفرع.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: resourceError(error) };
  }
}

export async function assignBookingOperationalResourcesAction(
  formData: FormData,
): Promise<OperationsResourceActionResult> {
  const actor = await resourceActor();
  const parsed = bookingResourceAssignmentSchema.safeParse({
    bookingId: formData.get('bookingId'),
    employeeId: formData.get('employeeId'),
    operationalVehicleId: formData.get('operationalVehicleId'),
    clearEmployee: boolField(formData.get('clearEmployee')),
    clearOperationalVehicle: boolField(formData.get('clearOperationalVehicle')),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات تخصيص الموارد غير صالحة.' };
  const scopedBooking = await db.booking.findFirst({
    where: { id: parsed.data.bookingId, deletedAt: null },
    select: { branchId: true, assignedTeamId: true },
  });
  if (!scopedBooking) return { error: 'الحجز غير موجود.' };
  if (!(await canAssignBookingResources(actor, scopedBooking))) {
    return { error: 'غير مصرح لك بتخصيص الموارد لهذا الحجز.' };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${parsed.data.bookingId}`}))`;
      const booking = await tx.booking.findFirst({
        where: { id: parsed.data.bookingId, deletedAt: null },
        select: {
          id: true,
          branchId: true,
          startAt: true,
          endAt: true,
          bookingStatus: true,
          assignedTeamId: true,
          assignedEmployeeId: true,
          operationalVehicleId: true,
        },
      });
      if (!booking) throw new Error('BOOKING_NOT_FOUND');
      if (TERMINAL_BOOKING_STATUSES.includes(booking.bookingStatus as (typeof TERMINAL_BOOKING_STATUSES)[number])) {
        throw new Error('BOOKING_TERMINAL');
      }
      if (!booking.assignedTeamId) throw new Error('BOOKING_TEAM_REQUIRED');

      const resourceLockKeys = [
        booking.assignedEmployeeId && `booking-resource:employee:${booking.assignedEmployeeId}`,
        booking.operationalVehicleId && `booking-resource:vehicle:${booking.operationalVehicleId}`,
        parsed.data.employeeId && `booking-resource:employee:${parsed.data.employeeId}`,
        parsed.data.operationalVehicleId && `booking-resource:vehicle:${parsed.data.operationalVehicleId}`,
      ].filter((key): key is string => Boolean(key));
      for (const key of [...new Set(resourceLockKeys)].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      }

      const nextEmployeeId = parsed.data.clearEmployee
        ? null
        : parsed.data.employeeId ?? booking.assignedEmployeeId;
      const nextOperationalVehicleId = parsed.data.clearOperationalVehicle
        ? null
        : parsed.data.operationalVehicleId ?? booking.operationalVehicleId;
      if (
        nextEmployeeId === booking.assignedEmployeeId &&
        nextOperationalVehicleId === booking.operationalVehicleId
      ) {
        throw new Error('RESOURCE_ASSIGNMENT_UNCHANGED');
      }

      if (parsed.data.employeeId) {
        const employee = await tx.user.findFirst({
          where: {
            id: parsed.data.employeeId,
            role: UserRole.EMPLOYEE,
            active: true,
            deletedAt: null,
            branchMemberships: { some: { branchId: booking.branchId } },
            teamMemberships: { some: { teamId: booking.assignedTeamId } },
          },
          select: { id: true },
        });
        if (!employee) throw new Error('EMPLOYEE_NOT_IN_ASSIGNED_TEAM');
        const conflict = await tx.booking.findFirst({
          where: {
            id: { not: booking.id },
            assignedEmployeeId: employee.id,
            deletedAt: null,
            bookingStatus: { notIn: [...TERMINAL_BOOKING_STATUSES] },
            startAt: { lt: booking.endAt },
            endAt: { gt: booking.startAt },
          },
          select: { bookingNumber: true },
        });
        if (conflict) throw new Error('EMPLOYEE_TIME_CONFLICT:' + conflict.bookingNumber);
      }

      if (parsed.data.operationalVehicleId) {
        const vehicle = await tx.operationalVehicle.findFirst({
          where: {
            id: parsed.data.operationalVehicleId,
            branchId: booking.branchId,
            status: OperationalVehicleStatus.ACTIVE,
            OR: [{ teamId: null }, { teamId: booking.assignedTeamId }],
          },
          select: { id: true },
        });
        if (!vehicle) throw new Error('VEHICLE_NOT_AVAILABLE_FOR_TEAM');
        const conflict = await tx.booking.findFirst({
          where: {
            id: { not: booking.id },
            operationalVehicleId: vehicle.id,
            deletedAt: null,
            bookingStatus: { notIn: [...TERMINAL_BOOKING_STATUSES] },
            startAt: { lt: booking.endAt },
            endAt: { gt: booking.startAt },
          },
          select: { bookingNumber: true },
        });
        if (conflict) throw new Error('VEHICLE_TIME_CONFLICT:' + conflict.bookingNumber);
      }

      const updated = await tx.booking.update({
        where: { id: booking.id },
        data: {
          assignedEmployeeId: nextEmployeeId,
          operationalVehicleId: nextOperationalVehicleId,
        },
      });
      await writeAudit(
        tx,
        actor,
        parsed.data.clearEmployee || parsed.data.clearOperationalVehicle
          ? 'BOOKING_OPERATIONAL_RESOURCES_UPDATED'
          : 'BOOKING_OPERATIONAL_RESOURCES_ASSIGNED',
        'Booking',
        updated.id,
        {
          assignedTeamId: booking.assignedTeamId,
          assignedEmployeeId: booking.assignedEmployeeId,
          operationalVehicleId: booking.operationalVehicleId,
        },
        {
          assignedTeamId: updated.assignedTeamId,
          assignedEmployeeId: updated.assignedEmployeeId,
          operationalVehicleId: updated.operationalVehicleId,
        },
        parsed.data.reason,
      );
    }, transactionOptions);
    revalidateResources(parsed.data.bookingId);
    return {
      success: true,
      message: parsed.data.clearEmployee || parsed.data.clearOperationalVehicle
        ? 'تم تحديث تخصيص موارد الحجز وتسجيل العملية.'
        : 'تم تخصيص موارد الحجز وتسجيل العملية.',
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'RESOURCE_ASSIGNMENT_UNCHANGED') {
      return { error: 'لم يتغير تخصيص أي مورد.' };
    }
    if (error instanceof Error && error.message.startsWith('EMPLOYEE_TIME_CONFLICT:')) {
      return { error: `الموظف لديه تعارض مع الحجز ${error.message.slice('EMPLOYEE_TIME_CONFLICT:'.length)}.` };
    }
    if (error instanceof Error && error.message.startsWith('VEHICLE_TIME_CONFLICT:')) {
      return { error: `سيارة التشغيل لديها تعارض مع الحجز ${error.message.slice('VEHICLE_TIME_CONFLICT:'.length)}.` };
    }
    const messages: Record<string, string> = {
      BOOKING_NOT_FOUND: 'الحجز غير موجود.',
      BOOKING_TERMINAL: 'لا يمكن تخصيص موارد لحجز منتهي.',
      BOOKING_TEAM_REQUIRED: 'أسند فريقًا للحجز أولًا قبل تخصيص موظف أو سيارة تشغيل.',
      EMPLOYEE_NOT_IN_ASSIGNED_TEAM: 'الموظف غير نشط أو لا ينتمي إلى فريق الحجز.',
      VEHICLE_NOT_AVAILABLE_FOR_TEAM: 'سيارة التشغيل غير نشطة أو لا تتبع فرع وفريق الحجز.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: resourceError(error) };
  }
}
