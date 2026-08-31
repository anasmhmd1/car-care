'use server';

import {
  AssignmentMode,
  ChecklistStage,
  PaymentMethodType,
  PermissionEffect,
  Prisma,
  UserRole,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { canAccessBranch } from '@/lib/auth/authorization';
import {
  canRoleReceivePermission,
  hasPermission,
  PERMISSIONS,
} from '@/lib/auth/permissions';
import { canManageWorkforceAccount } from '@/lib/auth/policy';
import { requireRole } from '@/lib/auth/session';
import { revokeAllUserSessionsAndBumpVersion } from '@/lib/auth/session-store';
import { db } from '@/lib/db';
import { localDateTimeToUtc } from '@/lib/engine/time';

export interface SetupActionResult {
  success?: true;
  message?: string;
  error?: string;
}

type SetupActor = {
  id: string;
  role: UserRole;
};

const idSchema = z.string().trim().min(1, 'المعرّف مطلوب.').max(200);
const optionalIdSchema = z.string().trim().max(200).optional();
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'الوقت يجب أن يكون بصيغة HH:MM.');
const phoneSchema = z.string().trim().regex(/^[\d+\-\s()]{8,20}$/, 'رقم الهاتف غير صالح.');

const employeeSchema = z.object({
  employeeId: optionalIdSchema,
  branchId: idSchema,
  fullName: z.string().trim().min(2, 'اسم الموظف مطلوب.').max(100),
  phone: phoneSchema,
  whatsapp: z.string().trim().max(20).optional(),
  email: z.union([z.string().trim().email('البريد الإلكتروني غير صالح.'), z.literal('')]).optional(),
  role: z.enum([UserRole.OPERATIONS_MANAGER, UserRole.EMPLOYEE]),
  active: z.boolean(),
  temporaryPassword: z.string().max(128).optional(),
}).superRefine((value, context) => {
  const password = value.temporaryPassword?.trim() ?? '';
  if (!value.employeeId && password.length < 8) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['temporaryPassword'],
      message: 'كلمة المرور المؤقتة مطلوبة للحساب الجديد وبحد أدنى 8 خانات.',
    });
  }
  if (password && password.length < 8) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['temporaryPassword'],
      message: 'كلمة المرور يجب أن تكون 8 خانات على الأقل.',
    });
  }
});

const permissionOverrideSchema = z.object({
  permissionOverrideId: optionalIdSchema,
  userId: idSchema,
  permissionCode: z.enum(PERMISSIONS),
  effect: z.nativeEnum(PermissionEffect),
  scopeType: z.enum(['GLOBAL', 'BRANCH']),
  branchId: optionalIdSchema,
  expiresAt: z.union([z.string().datetime(), z.literal('')]).optional(),
  auditReason: z.string().trim().min(5, 'اكتب سبب التفويض من 5 أحرف على الأقل.').max(500),
}).superRefine((value, context) => {
  if (value.scopeType === 'BRANCH' && !value.branchId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['branchId'],
      message: 'اختر فرع نطاق الصلاحية.',
    });
  }
});

const teamSchema = z.object({
  teamId: optionalIdSchema,
  branchId: idSchema,
  name: z.string().trim().min(2, 'اسم الفريق مطلوب.').max(100),
  leaderId: optionalIdSchema,
  baseZoneId: optionalIdSchema,
  dailyCapacity: z.coerce.number().int().min(1).max(100),
  assignmentPriority: z.coerce.number().int().min(1).max(100),
  active: z.boolean(),
  memberIds: z.array(idSchema).max(50),
  zoneIds: z.array(idSchema).max(100),
  serviceIds: z.array(idSchema).max(100),
}).superRefine((value, context) => {
  if (value.leaderId && !value.memberIds.includes(value.leaderId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['leaderId'],
      message: 'قائد الفريق يجب أن يكون ضمن أعضاء الفريق.',
    });
  }
  for (const [field, values] of [
    ['memberIds', value.memberIds],
    ['zoneIds', value.zoneIds],
    ['serviceIds', value.serviceIds],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: 'لا يمكن تكرار الاختيار نفسه.',
      });
    }
  }
});

const zoneSchema = z.object({
  zoneId: optionalIdSchema,
  branchId: idSchema,
  name: z.string().trim().min(2, 'اسم الزون مطلوب.').max(200),
  description: z.string().trim().max(500).optional(),
});

const areaSchema = z.object({
  areaId: optionalIdSchema,
  zoneId: optionalIdSchema,
  branchId: optionalIdSchema,
  governorate: z.string().trim().min(2).max(200),
  city: z.string().trim().min(2).max(200),
  district: z.string().trim().min(1).max(200),
  compound: z.string().trim().min(1).max(200),
  active: z.boolean(),
  priority: z.coerce.number().int().min(1).max(1_000),
  travelBufferOverride: z.union([
    z.coerce.number().int().min(0).max(180),
    z.null(),
  ]).optional(),
});

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

const branchIdentitySchema = z.object({
  branchId: idSchema,
  nameAr: z.string().trim().min(2, 'اسم الفرع بالعربية مطلوب.').max(200),
  nameEn: z.string().trim().max(200).optional(),
  code: z.string().trim().min(2).max(32)
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]*$/, 'كود الفرع يقبل الحروف الإنجليزية والأرقام والشرطة فقط.')),
  address: z.string().trim().min(3, 'عنوان الفرع مطلوب.').max(500),
  phone: z.string().trim().optional().default(''),
  whatsapp: z.string().trim().optional().default(''),
  timezone: z.string().trim().min(3).max(100).refine(validTimeZone, 'المنطقة الزمنية غير صالحة.'),
  changeReason: z.string().trim().min(5, 'اكتب سبب التعديل من 5 أحرف على الأقل.').max(500),
});

const branchConfigSchema = z.object({
  branchId: idSchema,
  slotUnitMinutes: z.coerce.number().int().min(15).max(240),
  arrivalWindowMinutes: z.coerce.number().int().min(0).max(180),
  travelBufferMinutes: z.coerce.number().int().min(0).max(180),
  restBufferMinutes: z.coerce.number().int().min(0).max(180).default(0),
  dailyBookingLimit: z.coerce.number().int().min(1).max(500),
  assignmentMode: z.nativeEnum(AssignmentMode),
});

const branchHoursSchema = z.object({
  branchId: idSchema,
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  isClosed: z.boolean(),
  openTime: timeSchema,
  closeTime: timeSchema,
  breakStartTime: z.union([timeSchema, z.literal('')]).optional(),
  breakEndTime: z.union([timeSchema, z.literal('')]).optional(),
}).superRefine((value, context) => validateHours(value, context, value.isClosed));

const teamHoursSchema = z.object({
  teamId: idSchema,
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  isOff: z.boolean(),
  openTime: timeSchema,
  closeTime: timeSchema,
  breakStartTime: z.union([timeSchema, z.literal('')]).optional(),
  breakEndTime: z.union([timeSchema, z.literal('')]).optional(),
}).superRefine((value, context) => validateHours(value, context, value.isOff));

const blackoutSchema = z.object({
  blackoutId: optionalIdSchema,
  branchId: idSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ الإغلاق غير صالح.'),
  reason: z.string().trim().min(2, 'سبب الإغلاق مطلوب.').max(500),
});

const timeOffSubjectSchema = z.enum(['TEAM', 'EMPLOYEE']);
const timeOffSchema = z.object({
  timeOffId: optionalIdSchema,
  branchId: idSchema,
  subjectType: timeOffSubjectSchema,
  subjectId: idSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ بداية الإجازة غير صالح.'),
  startTime: timeSchema,
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ نهاية الإجازة غير صالح.'),
  endTime: timeSchema,
  reason: z.string().trim().min(2, 'سبب الإجازة مطلوب.').max(500),
  changeReason: z.string().trim().max(500).optional(),
}).superRefine((value, context) => {
  if (value.timeOffId && (!value.changeReason || value.changeReason.length < 5)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['changeReason'],
      message: 'اكتب سبب تعديل واضحًا من 5 أحرف على الأقل.',
    });
  }
});

const travelSchema = z.object({
  branchId: idSchema,
  fromZoneId: idSchema,
  toZoneId: idSchema,
  durationMinutes: z.coerce.number().int().min(0).max(180),
});

const paymentMethodSchema = z.object({
  paymentMethodId: optionalIdSchema,
  branchId: idSchema,
  name: z.string().trim().min(2, 'اسم وسيلة الدفع مطلوب.').max(200),
  type: z.nativeEnum(PaymentMethodType),
  accountNumber: z.string().trim().min(1, 'رقم الحساب مطلوب.').max(100),
  accountName: z.string().trim().min(2, 'اسم صاحب الحساب مطلوب.').max(200),
  instructions: z.string().trim().max(1_000).optional(),
  active: z.boolean(),
  isDefault: z.boolean(),
});

const checklistItemSchema = z.object({
  id: optionalIdSchema,
  labelAr: z.string().trim().min(2, 'نص بند القائمة مطلوب.').max(500),
  descriptionAr: z.string().trim().max(1_000).optional(),
  required: z.boolean(),
  requiresPhoto: z.boolean(),
  requiresNote: z.boolean(),
  displayOrder: z.coerce.number().int().min(0).max(1_000),
  active: z.boolean(),
});

const checklistSchema = z.object({
  templateId: optionalIdSchema,
  serviceId: optionalIdSchema,
  serviceIds: z.array(idSchema).optional(),
  stage: z.nativeEnum(ChecklistStage).optional().default(ChecklistStage.SERVICE_EXECUTION),
  name: z.string().trim().min(2, 'اسم المرحلة / القائمة مطلوب.').max(200),
  items: z.array(checklistItemSchema).min(1, 'أضف بندًا واحدًا على الأقل.').max(100),
}).superRefine((value, context) => {
  if (!value.serviceId && (!value.serviceIds || value.serviceIds.length === 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceIds'],
      message: 'اختر خدمة واحدة على الأقل لتطبيق القالب عليها.',
    });
  }
  const ids = value.items.flatMap((item) => item.id ? [item.id] : []);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['items'],
      message: 'لا يمكن تكرار بند قائمة الفحص.',
    });
  }
});

const destructiveSchema = z.object({
  entityId: idSchema,
  branchId: optionalIdSchema,
  reason: z.string().trim().min(5, 'اكتب سببًا واضحًا من 5 أحرف على الأقل.').max(500),
});

const timeOffDeleteSchema = destructiveSchema.extend({
  subjectType: timeOffSubjectSchema,
});

function validateHours(
  value: {
    openTime: string;
    closeTime: string;
    breakStartTime?: string;
    breakEndTime?: string;
  },
  context: z.RefinementCtx,
  disabled: boolean,
) {
  if (disabled) return;
  if (value.openTime >= value.closeTime) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['closeTime'],
      message: 'وقت الإغلاق يجب أن يكون بعد وقت الفتح.',
    });
  }
  const hasBreakStart = Boolean(value.breakStartTime);
  const hasBreakEnd = Boolean(value.breakEndTime);
  if (hasBreakStart !== hasBreakEnd) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['breakStartTime'],
      message: 'أدخل بداية ونهاية الاستراحة معًا.',
    });
  }
  if (
    value.breakStartTime &&
    value.breakEndTime &&
    (
      value.breakStartTime >= value.breakEndTime ||
      value.breakStartTime < value.openTime ||
      value.breakEndTime > value.closeTime
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['breakStartTime'],
      message: 'الاستراحة يجب أن تقع بالكامل داخل ساعات العمل.',
    });
  }
}

function boolField(value: FormDataEntryValue | null, fallback = false): boolean {
  if (value === null) return fallback;
  return value === 'true' || value === '1' || value === 'on';
}

function jsonField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string') return [];
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return [];
  }
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function setupError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return 'هذه القيمة مستخدمة بالفعل في سجل آخر.';
    if (error.code === 'P2003') return 'لا يمكن حذف السجل لأنه مرتبط ببيانات تشغيل.';
    if (error.code === 'P2034') return 'تغيّرت البيانات أثناء الحفظ؛ أعد المحاولة.';
  }
  console.error('Setup center action failed:', error);
  return 'تعذر حفظ إعدادات التشغيل. تحقق من البيانات ثم حاول مرة أخرى.';
}

async function setupActor(): Promise<SetupActor> {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  if (!(await hasPermission(actor, 'workforce.manage'))) {
    throw new Error('SETUP_PERMISSION_DENIED');
  }
  return actor;
}

async function assertBranchAccess(actor: SetupActor, branchId: string): Promise<boolean> {
  const [canAccess, canManageWorkforce] = await Promise.all([
    canAccessBranch(actor, branchId),
    hasPermission(actor, 'workforce.manage', { type: 'BRANCH', id: branchId }),
  ]);
  return canAccess && canManageWorkforce;
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  actor: SetupActor,
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

function revalidateSetup() {
  revalidatePath('/admin/setup');
  revalidatePath('/admin');
  revalidatePath('/admin/site');
  revalidatePath('/operations');
  revalidatePath('/areas');
  revalidatePath('/contact');
  revalidatePath('/');
  revalidatePath('/api/public/contact');
}

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;

export async function saveSetupEmployeeAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = employeeSchema.safeParse({
    employeeId: optionalString(formData.get('employeeId')),
    branchId: formData.get('branchId'),
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    whatsapp: optionalString(formData.get('whatsapp')),
    email: typeof formData.get('email') === 'string' ? formData.get('email') : '',
    role: formData.get('role'),
    active: boolField(formData.get('active'), true),
    temporaryPassword: optionalString(formData.get('temporaryPassword')),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات الموظف غير صالحة.' };
  if (!(await assertBranchAccess(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  }

  const password = parsed.data.temporaryPassword?.trim();
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

  try {
    const saved = await db.$transaction(async (tx) => {
      const branch = await tx.branch.findUnique({
        where: { id: parsed.data.branchId },
        select: { id: true },
      });
      if (!branch) throw new Error('BRANCH_NOT_FOUND');

      const before = parsed.data.employeeId
        ? await tx.user.findUnique({
            where: { id: parsed.data.employeeId },
            include: { branchMemberships: { select: { branchId: true } } },
          })
        : null;
      if (parsed.data.employeeId && !before) throw new Error('EMPLOYEE_NOT_FOUND');
      if (
        before
          ? !canManageWorkforceAccount(actor.role, before.role, parsed.data.role)
          : !canManageWorkforceAccount(actor.role, parsed.data.role, parsed.data.role)
      ) {
        throw new Error('ROLE_NOT_MANAGEABLE');
      }

      const data = {
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        whatsapp: parsed.data.whatsapp || null,
        email: parsed.data.email || null,
        role: parsed.data.role,
        active: parsed.data.active,
        deletedAt: parsed.data.active ? null : new Date(),
        deletedByUserId: parsed.data.active ? null : actor.id,
        deleteReason: parsed.data.active ? null : 'Disabled from setup center',
        ...(passwordHash ? { passwordHash, mustChangePwd: true } : {}),
      };
      const user = before
        ? await tx.user.update({ where: { id: before.id }, data })
        : await tx.user.create({
            data: {
              ...data,
              passwordHash: passwordHash as string,
              mustChangePwd: true,
            },
          });

      if (parsed.data.role === UserRole.OPERATIONS_MANAGER) {
        const rawBranchIds = formData.getAll('branchIds').map((val) => String(val).trim()).filter(Boolean);
        const targetBranchIds = rawBranchIds.length > 0 ? rawBranchIds : [parsed.data.branchId];

        await tx.branchMembership.deleteMany({
          where: { userId: user.id, branchId: { notIn: targetBranchIds } },
        });
        for (const bId of targetBranchIds) {
          await tx.branchMembership.upsert({
            where: {
              branchId_userId: {
                branchId: bId,
                userId: user.id,
              },
            },
            update: {},
            create: { branchId: bId, userId: user.id },
          });
        }
      } else {
        await tx.branchMembership.deleteMany({
          where: { userId: user.id, branchId: { not: parsed.data.branchId } },
        });
        await tx.branchMembership.upsert({
          where: {
            branchId_userId: {
              branchId: parsed.data.branchId,
              userId: user.id,
            },
          },
          update: {},
          create: { branchId: parsed.data.branchId, userId: user.id },
        });
        await tx.teamMember.deleteMany({
          where: { userId: user.id, team: { branchId: { not: parsed.data.branchId } } },
        });
      }

      if (!parsed.data.active) {
        await tx.teamMember.deleteMany({ where: { userId: user.id } });
      }
      if (
        before &&
        (
          passwordHash ||
          before.role !== user.role ||
          before.active !== user.active
        )
      ) {
        await revokeAllUserSessionsAndBumpVersion(tx, user.id, 'SETUP_WORKFORCE_CHANGE');
      }
      await writeAudit(
        tx,
        actor,
        before ? 'SETUP_EMPLOYEE_UPDATED' : 'SETUP_EMPLOYEE_CREATED',
        'User',
        user.id,
        before ? {
          fullName: before.fullName,
          phone: before.phone,
          role: before.role,
          active: before.active,
        } : undefined,
        {
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          active: user.active,
          branchId: parsed.data.branchId,
          passwordReset: Boolean(passwordHash),
        },
      );
      return user;
    }, transactionOptions);
    revalidateSetup();
    return {
      success: true,
      message: parsed.data.employeeId
        ? 'تم تحديث حساب ' + saved.fullName + '.'
        : 'تم إنشاء حساب ' + saved.fullName + ' مع إلزام تغيير كلمة المرور.',
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'BRANCH_NOT_FOUND') return { error: 'الفرع غير موجود.' };
    if (error instanceof Error && error.message === 'EMPLOYEE_NOT_FOUND') return { error: 'حساب الموظف غير موجود.' };
    if (error instanceof Error && error.message === 'ROLE_NOT_MANAGEABLE') return { error: 'لا يمكن إدارة هذا النوع من الحسابات هنا.' };
    return { error: setupError(error) };
  }
}

export async function deactivateSetupEmployeeAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = destructiveSchema.safeParse({
    entityId: formData.get('entityId'),
    branchId: optionalString(formData.get('branchId')),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات التعطيل غير صالحة.' };
  if (parsed.data.entityId === actor.id) return { error: 'لا يمكنك تعطيل حسابك الحالي.' };
  if (!parsed.data.branchId || !(await assertBranchAccess(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  }

  try {
    await db.$transaction(async (tx) => {
      const target = await tx.user.findFirst({
        where: {
          id: parsed.data.entityId,
          role: { in: [UserRole.EMPLOYEE, UserRole.OPERATIONS_MANAGER] },
          branchMemberships: { some: { branchId: parsed.data.branchId } },
        },
      });
      if (!target) throw new Error('EMPLOYEE_NOT_FOUND');
      if (!canManageWorkforceAccount(actor.role, target.role)) throw new Error('EMPLOYEE_NOT_FOUND');
      await tx.user.update({
        where: { id: target.id },
        data: {
          active: false,
          deletedAt: new Date(),
          deletedByUserId: actor.id,
          deleteReason: parsed.data.reason,
        },
      });
      await tx.teamMember.deleteMany({ where: { userId: target.id } });
      await revokeAllUserSessionsAndBumpVersion(tx, target.id, 'SETUP_ACCOUNT_DISABLED');
      await writeAudit(
        tx,
        actor,
        'SETUP_EMPLOYEE_DEACTIVATED',
        'User',
        target.id,
        { active: target.active, role: target.role },
        { active: false },
        parsed.data.reason,
      );
    }, transactionOptions);
    revalidateSetup();
    return { success: true, message: 'تم تعطيل حساب الموظف وجلساته.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'EMPLOYEE_NOT_FOUND') return { error: 'الموظف غير موجود داخل هذا الفرع.' };
    return { error: setupError(error) };
  }
}

export async function saveSetupPermissionOverrideAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = permissionOverrideSchema.safeParse({
    permissionOverrideId: optionalString(formData.get('permissionOverrideId')),
    userId: formData.get('userId'),
    permissionCode: formData.get('permissionCode'),
    effect: formData.get('effect'),
    scopeType: formData.get('scopeType'),
    branchId: optionalString(formData.get('branchId')),
    expiresAt: typeof formData.get('expiresAt') === 'string' ? formData.get('expiresAt') : '',
    auditReason: formData.get('auditReason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات استثناء الصلاحية غير صالحة.' };
  }
  if (
    parsed.data.scopeType === 'BRANCH' &&
    (!parsed.data.branchId || !(await assertBranchAccess(actor, parsed.data.branchId)))
  ) {
    return { error: 'غير مصرح لك بإدارة صلاحيات هذا الفرع.' };
  }

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) {
    return { error: 'تاريخ انتهاء الصلاحية يجب أن يكون في المستقبل.' };
  }

  try {
    await db.$transaction(async (tx) => {
      const [target, permission, before] = await Promise.all([
        tx.user.findFirst({
          where: {
            id: parsed.data.userId,
            role: { in: [UserRole.OPERATIONS_MANAGER, UserRole.EMPLOYEE] },
          },
          select: {
            id: true,
            role: true,
            branchMemberships: { select: { branchId: true } },
          },
        }),
        tx.permission.findUnique({
          where: { code: parsed.data.permissionCode },
          select: { id: true, code: true },
        }),
        parsed.data.permissionOverrideId
          ? tx.userPermission.findUnique({
              where: { id: parsed.data.permissionOverrideId },
              include: { permission: { select: { code: true } } },
            })
          : Promise.resolve(null),
      ]);
      if (!target) throw new Error('PERMISSION_TARGET_NOT_FOUND');
      if (!permission) throw new Error('PERMISSION_NOT_FOUND');
      if (!canRoleReceivePermission(target.role, parsed.data.permissionCode)) {
        throw new Error('PERMISSION_NOT_ALLOWED_FOR_EMPLOYEE');
      }
      if (before && before.userId !== target.id) throw new Error('PERMISSION_OVERRIDE_NOT_FOUND');
      if (parsed.data.permissionOverrideId && !before) throw new Error('PERMISSION_OVERRIDE_NOT_FOUND');
      if (
        parsed.data.scopeType === 'BRANCH' &&
        !target.branchMemberships.some(({ branchId }) => branchId === parsed.data.branchId)
      ) {
        throw new Error('PERMISSION_TARGET_BRANCH_MISMATCH');
      }

      const scopeId = parsed.data.scopeType === 'GLOBAL' ? 'GLOBAL' : parsed.data.branchId;
      if (!scopeId) throw new Error('PERMISSION_TARGET_BRANCH_MISMATCH');
      const data = {
        permissionId: permission.id,
        effect: parsed.data.effect,
        scopeType: parsed.data.scopeType,
        scopeId,
        grantedByUserId: actor.id,
        expiresAt,
      };
      const override = before
        ? await tx.userPermission.update({
            where: { id: before.id },
            data,
          })
        : await tx.userPermission.create({
            data: { userId: target.id, ...data },
          });
      await writeAudit(
        tx,
        actor,
        before ? 'SETUP_PERMISSION_OVERRIDE_UPDATED' : 'SETUP_PERMISSION_OVERRIDE_CREATED',
        'UserPermission',
        override.id,
        before ? {
          userId: before.userId,
          permissionCode: before.permission.code,
          effect: before.effect,
          scopeType: before.scopeType,
          scopeId: before.scopeId,
          expiresAt: before.expiresAt?.toISOString() ?? null,
        } : undefined,
        {
          userId: target.id,
          targetRole: target.role,
          permissionCode: permission.code,
          effect: override.effect,
          scopeType: override.scopeType,
          scopeId: override.scopeId,
          expiresAt: override.expiresAt?.toISOString() ?? null,
        },
        parsed.data.auditReason,
      );
      return override;
    }, transactionOptions);
    revalidateSetup();
    return {
      success: true,
      message: parsed.data.permissionOverrideId
        ? 'تم تحديث استثناء الصلاحية.'
        : 'تم إنشاء استثناء الصلاحية دون تغيير افتراضات الدور.',
    };
  } catch (error) {
    const messages: Record<string, string> = {
      PERMISSION_TARGET_NOT_FOUND: 'الموظف المحدد غير موجود أو غير قابل لإدارة الصلاحيات.',
      PERMISSION_NOT_FOUND: 'كود الصلاحية غير مسجل في النظام.',
      PERMISSION_OVERRIDE_NOT_FOUND: 'استثناء الصلاحية غير موجود أو لا يتبع هذا الموظف.',
      PERMISSION_TARGET_BRANCH_MISMATCH: 'الموظف لا يتبع فرع نطاق الصلاحية المحدد.',
      PERMISSION_NOT_ALLOWED_FOR_EMPLOYEE: 'هذه الصلاحية ليست ضمن قائمة التفويضات الاختيارية المسموحة لدور Employee.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: setupError(error) };
  }
}

export async function revokeSetupPermissionOverrideAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = destructiveSchema.safeParse({
    entityId: formData.get('entityId'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات سحب استثناء الصلاحية غير صالحة.' };
  }

  const current = await db.userPermission.findUnique({
    where: { id: parsed.data.entityId },
    select: { scopeType: true, scopeId: true },
  });
  if (!current) return { error: 'استثناء الصلاحية غير موجود.' };
  if (current.scopeType === 'BRANCH' && !(await assertBranchAccess(actor, current.scopeId))) {
    return { error: 'غير مصرح لك بإدارة صلاحيات هذا الفرع.' };
  }

  try {
    await db.$transaction(async (tx) => {
      const override = await tx.userPermission.findUnique({
        where: { id: parsed.data.entityId },
        include: {
          permission: { select: { code: true } },
          user: { select: { role: true } },
        },
      });
      if (
        !override ||
        (override.user.role !== UserRole.EMPLOYEE && override.user.role !== UserRole.OPERATIONS_MANAGER)
      ) {
        throw new Error('PERMISSION_OVERRIDE_NOT_FOUND');
      }
      await tx.userPermission.delete({ where: { id: override.id } });
      await writeAudit(
        tx,
        actor,
        'SETUP_PERMISSION_OVERRIDE_REVOKED',
        'UserPermission',
        override.id,
        {
          userId: override.userId,
          permissionCode: override.permission.code,
          effect: override.effect,
          scopeType: override.scopeType,
          scopeId: override.scopeId,
          expiresAt: override.expiresAt?.toISOString() ?? null,
        },
        { revoked: true },
        parsed.data.reason,
      );
    }, transactionOptions);
    revalidateSetup();
    return { success: true, message: 'تم سحب استثناء الصلاحية؛ عاد القرار إلى الاستثناءات الأخرى وافتراض الدور.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'PERMISSION_OVERRIDE_NOT_FOUND') {
      return { error: 'استثناء الصلاحية غير موجود أو لا يتبع حسابًا قابلًا للإدارة.' };
    }
    return { error: setupError(error) };
  }
}

export async function saveSetupTeamAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = teamSchema.safeParse({
    teamId: optionalString(formData.get('teamId')),
    branchId: formData.get('branchId'),
    name: formData.get('name'),
    leaderId: optionalString(formData.get('leaderId')),
    baseZoneId: optionalString(formData.get('baseZoneId')),
    dailyCapacity: formData.get('dailyCapacity'),
    assignmentPriority: formData.get('assignmentPriority'),
    active: boolField(formData.get('active'), true),
    memberIds: jsonField(formData.get('memberIds')),
    zoneIds: jsonField(formData.get('zoneIds')),
    serviceIds: jsonField(formData.get('serviceIds')),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات الفريق غير صالحة.' };
  if (!(await assertBranchAccess(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  }

  try {
    const saved = await db.$transaction(async (tx) => {
      const before = parsed.data.teamId
        ? await tx.team.findUnique({
            where: { id: parsed.data.teamId },
            select: {
              id: true,
              branchId: true,
              name: true,
              leaderId: true,
              baseZoneId: true,
              dailyCapacity: true,
              assignmentPriority: true,
              active: true,
            },
          })
        : null;
      if (parsed.data.teamId && !before) throw new Error('TEAM_NOT_FOUND');
      if (before && before.branchId !== parsed.data.branchId) throw new Error('TEAM_BRANCH_MISMATCH');

      const [branch, memberCount, zoneCount, serviceCount, baseZone, conflictingMember] = await Promise.all([
        tx.branch.findUnique({ where: { id: parsed.data.branchId }, select: { id: true } }),
        tx.user.count({
          where: {
            id: { in: parsed.data.memberIds },
            role: UserRole.EMPLOYEE,
            active: true,
            deletedAt: null,
            branchMemberships: { some: { branchId: parsed.data.branchId } },
          },
        }),
        tx.coverageZone.count({
          where: { id: { in: parsed.data.zoneIds }, branchId: parsed.data.branchId },
        }),
        tx.service.count({ where: { id: { in: parsed.data.serviceIds } } }),
        parsed.data.baseZoneId
          ? tx.coverageZone.findFirst({
              where: { id: parsed.data.baseZoneId, branchId: parsed.data.branchId },
              select: { id: true },
            })
          : Promise.resolve(null),
        tx.teamMember.findFirst({
          where: {
            userId: { in: parsed.data.memberIds },
            ...(parsed.data.teamId ? { teamId: { not: parsed.data.teamId } } : {}),
          },
          select: { userId: true },
        }),
      ]);
      if (!branch) throw new Error('BRANCH_NOT_FOUND');
      if (memberCount !== parsed.data.memberIds.length) throw new Error('INVALID_MEMBERS');
      if (zoneCount !== parsed.data.zoneIds.length) throw new Error('INVALID_ZONES');
      if (serviceCount !== parsed.data.serviceIds.length) throw new Error('INVALID_SERVICES');
      if (parsed.data.baseZoneId && !baseZone) throw new Error('INVALID_TEAM_BASE_ZONE');
      if (conflictingMember) throw new Error('MEMBER_ALREADY_ASSIGNED');

      const teamData = {
        branchId: parsed.data.branchId,
        name: parsed.data.name,
        leaderId: parsed.data.leaderId || null,
        baseZoneId: parsed.data.baseZoneId || null,
        dailyCapacity: parsed.data.dailyCapacity,
        assignmentPriority: parsed.data.assignmentPriority,
        active: parsed.data.active,
      };
      const team = before
        ? await tx.team.update({ where: { id: before.id }, data: teamData })
        : await tx.team.create({ data: teamData });

      await Promise.all([
        tx.teamMember.deleteMany({ where: { teamId: team.id } }),
        tx.teamZone.deleteMany({ where: { teamId: team.id } }),
        tx.teamCapability.deleteMany({ where: { teamId: team.id } }),
      ]);
      if (parsed.data.memberIds.length) {
        await tx.teamMember.createMany({
          data: parsed.data.memberIds.map((userId) => ({
            teamId: team.id,
            userId,
            isLeader: userId === parsed.data.leaderId,
          })),
        });
      }
      if (parsed.data.zoneIds.length) {
        await tx.teamZone.createMany({
          data: parsed.data.zoneIds.map((zoneId) => ({ teamId: team.id, zoneId })),
        });
      }
      if (parsed.data.serviceIds.length) {
        await tx.teamCapability.createMany({
          data: parsed.data.serviceIds.map((serviceId) => ({ teamId: team.id, serviceId })),
        });
      }
      await writeAudit(
        tx,
        actor,
        before ? 'SETUP_TEAM_UPDATED' : 'SETUP_TEAM_CREATED',
        'Team',
        team.id,
        before ?? undefined,
        {
          name: team.name,
          branchId: team.branchId,
          baseZoneId: team.baseZoneId,
          active: team.active,
          dailyCapacity: team.dailyCapacity,
          assignmentPriority: team.assignmentPriority,
          memberIds: parsed.data.memberIds,
          zoneIds: parsed.data.zoneIds,
          serviceIds: parsed.data.serviceIds,
        },
      );
      return team;
    }, transactionOptions);
    revalidateSetup();
    return {
      success: true,
      message: parsed.data.teamId
        ? 'تم تحديث فريق ' + saved.name + ' وربط موارده.'
        : 'تم إنشاء فريق ' + saved.name + '.',
    };
  } catch (error) {
    const messages: Record<string, string> = {
      TEAM_NOT_FOUND: 'الفريق غير موجود.',
      TEAM_BRANCH_MISMATCH: 'لا يمكن نقل الفريق بين الفروع.',
      BRANCH_NOT_FOUND: 'الفرع غير موجود.',
      INVALID_MEMBERS: 'كل الأعضاء يجب أن يكونوا موظفين نشطين في الفرع.',
      INVALID_ZONES: 'إحدى الزونات لا تتبع فرع الفريق.',
      INVALID_SERVICES: 'إحدى الخدمات المحددة غير موجودة.',
      INVALID_TEAM_BASE_ZONE: 'منطقة انطلاق الفريق لا تتبع الفرع.',
      MEMBER_ALREADY_ASSIGNED: 'أحد الموظفين عضو بالفعل في فريق آخر.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: setupError(error) };
  }
}

export async function deactivateSetupTeamAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = destructiveSchema.safeParse({
    entityId: formData.get('entityId'),
    branchId: optionalString(formData.get('branchId')),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات التعطيل غير صالحة.' };
  if (!parsed.data.branchId || !(await assertBranchAccess(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  }
  try {
    await db.$transaction(async (tx) => {
      const team = await tx.team.findFirst({
        where: { id: parsed.data.entityId, branchId: parsed.data.branchId },
      });
      if (!team) throw new Error('TEAM_NOT_FOUND');
      await tx.team.update({ where: { id: team.id }, data: { active: false } });
      await writeAudit(
        tx,
        actor,
        'SETUP_TEAM_DEACTIVATED',
        'Team',
        team.id,
        { active: team.active },
        { active: false },
        parsed.data.reason,
      );
    }, transactionOptions);
    revalidateSetup();
    return { success: true, message: 'تم إيقاف الفريق مع الاحتفاظ بسجله التشغيلي.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'TEAM_NOT_FOUND') return { error: 'الفريق غير موجود.' };
    return { error: setupError(error) };
  }
}

export async function saveSetupZoneAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = zoneSchema.safeParse({
    zoneId: optionalString(formData.get('zoneId')),
    branchId: formData.get('branchId'),
    name: formData.get('name'),
    description: optionalString(formData.get('description')),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات الزون غير صالحة.' };
  if (!(await assertBranchAccess(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  }
  try {
    const zone = await db.$transaction(async (tx) => {
      const [branch, before, duplicate] = await Promise.all([
        tx.branch.findUnique({ where: { id: parsed.data.branchId }, select: { id: true } }),
        parsed.data.zoneId
          ? tx.coverageZone.findUnique({ where: { id: parsed.data.zoneId } })
          : Promise.resolve(null),
        tx.coverageZone.findFirst({
          where: {
            branchId: parsed.data.branchId,
            name: { equals: parsed.data.name, mode: 'insensitive' },
            ...(parsed.data.zoneId ? { id: { not: parsed.data.zoneId } } : {}),
          },
          select: { id: true },
        }),
      ]);
      if (!branch) throw new Error('BRANCH_NOT_FOUND');
      if (parsed.data.zoneId && !before) throw new Error('ZONE_NOT_FOUND');
      if (before && before.branchId !== parsed.data.branchId) throw new Error('ZONE_BRANCH_MISMATCH');
      if (duplicate) throw new Error('DUPLICATE_ZONE');
      const data = {
        branchId: parsed.data.branchId,
        name: parsed.data.name,
        description: parsed.data.description || null,
      };
      const saved = before
        ? await tx.coverageZone.update({ where: { id: before.id }, data })
        : await tx.coverageZone.create({ data });
      await writeAudit(
        tx,
        actor,
        before ? 'SETUP_COVERAGE_ZONE_UPDATED' : 'SETUP_COVERAGE_ZONE_CREATED',
        'CoverageZone',
        saved.id,
        before ? { name: before.name, description: before.description } : undefined,
        { branchId: saved.branchId, name: saved.name, description: saved.description },
      );
      return saved;
    }, transactionOptions);
    revalidateSetup();
    return { success: true, message: 'تم حفظ الزون ' + zone.name + '.' };
  } catch (error) {
    const messages: Record<string, string> = {
      BRANCH_NOT_FOUND: 'الفرع غير موجود.',
      ZONE_NOT_FOUND: 'الزون غير موجود.',
      ZONE_BRANCH_MISMATCH: 'الزون لا يتبع هذا الفرع.',
      DUPLICATE_ZONE: 'يوجد زون بالاسم نفسه داخل الفرع.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: setupError(error) };
  }
}

export async function deleteSetupZoneAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = destructiveSchema.safeParse({
    entityId: formData.get('entityId'),
    branchId: optionalString(formData.get('branchId')),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات الحذف غير صالحة.' };
  if (!parsed.data.branchId || !(await assertBranchAccess(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  }
  try {
    await db.$transaction(async (tx) => {
      const zone = await tx.coverageZone.findFirst({
        where: { id: parsed.data.entityId, branchId: parsed.data.branchId },
      });
      if (!zone) throw new Error('ZONE_NOT_FOUND');
      const bookingCount = await tx.booking.count({
        where: { coverageArea: { zoneId: zone.id } },
      });
      if (bookingCount > 0) throw new Error('ZONE_HAS_BOOKINGS');
      await tx.coverageZone.delete({ where: { id: zone.id } });
      await writeAudit(
        tx,
        actor,
        'SETUP_COVERAGE_ZONE_DELETED',
        'CoverageZone',
        zone.id,
        { branchId: zone.branchId, name: zone.name },
        { deleted: true },
        parsed.data.reason,
      );
    }, transactionOptions);
    revalidateSetup();
    return { success: true, message: 'تم حذف الزون غير المستخدم.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'ZONE_NOT_FOUND') return { error: 'الزون غير موجود.' };
    if (error instanceof Error && error.message === 'ZONE_HAS_BOOKINGS') {
      return { error: 'لا يمكن حذف زون له حجوزات؛ عطّل مناطقه بدلًا من ذلك.' };
    }
    return { error: setupError(error) };
  }
}

export async function saveSetupAreaAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const rawOverride = optionalString(formData.get('travelBufferOverride'));
  const parsed = areaSchema.safeParse({
    areaId: optionalString(formData.get('areaId')),
    zoneId: optionalString(formData.get('zoneId')),
    branchId: optionalString(formData.get('branchId')),
    governorate: formData.get('governorate'),
    city: formData.get('city'),
    district: formData.get('district'),
    compound: formData.get('compound'),
    active: boolField(formData.get('active'), true),
    priority: formData.get('priority'),
    travelBufferOverride: rawOverride === undefined ? null : rawOverride,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات منطقة التغطية غير صالحة.' };

  // Resolve target zone and branchId
  let targetZoneId = parsed.data.zoneId;
  let targetBranchId = parsed.data.branchId;

  if (targetZoneId) {
    const zone = await db.coverageZone.findUnique({
      where: { id: targetZoneId },
      select: { id: true, branchId: true },
    });
    if (!zone) return { error: 'نطاق التغطية غير موجود.' };
    targetBranchId = zone.branchId;
  } else if (targetBranchId) {
    let zone = await db.coverageZone.findFirst({
      where: { branchId: targetBranchId },
      select: { id: true, branchId: true },
    });
    if (!zone) {
      const branch = await db.branch.findUnique({ where: { id: targetBranchId }, select: { nameAr: true } });
      if (!branch) return { error: 'الفرع غير موجود.' };
      zone = await db.coverageZone.create({
        data: {
          branchId: targetBranchId,
          name: branch.nameAr,
          description: `نطاق تغطية فرع ${branch.nameAr}`,
        },
        select: { id: true, branchId: true },
      });
    }
    targetZoneId = zone.id;
  } else {
    return { error: 'الفرع مطلوب لحفظ المنطقة.' };
  }

  if (!targetBranchId || !(await assertBranchAccess(actor, targetBranchId))) {
    return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  }
  try {
    const saved = await db.$transaction(async (tx) => {
      const before = parsed.data.areaId
        ? await tx.coverageArea.findUnique({
            where: { id: parsed.data.areaId },
            include: { zone: { select: { branchId: true } } },
          })
        : null;
      if (parsed.data.areaId && !before) throw new Error('AREA_NOT_FOUND');
      if (before && before.zone.branchId !== targetBranchId) throw new Error('AREA_BRANCH_MISMATCH');
      const duplicate = await tx.coverageArea.findFirst({
        where: {
          zoneId: targetZoneId,
          compound: { equals: parsed.data.compound, mode: 'insensitive' },
          ...(parsed.data.areaId ? { id: { not: parsed.data.areaId } } : {}),
        },
        select: { id: true },
      });
      if (duplicate) throw new Error('DUPLICATE_AREA');
      const data = {
        zoneId: targetZoneId!,
        governorate: parsed.data.governorate,
        city: parsed.data.city,
        district: parsed.data.district,
        compound: parsed.data.compound,
        active: parsed.data.active,
        priority: parsed.data.priority,
        travelBufferOverride: parsed.data.travelBufferOverride ?? null,
      };
      const area = before
        ? await tx.coverageArea.update({ where: { id: before.id }, data })
        : await tx.coverageArea.create({ data });
      await writeAudit(
        tx,
        actor,
        before ? 'SETUP_COVERAGE_AREA_UPDATED' : 'SETUP_COVERAGE_AREA_CREATED',
        'CoverageArea',
        area.id,
        before ? {
          zoneId: before.zoneId,
          compound: before.compound,
          active: before.active,
          priority: before.priority,
        } : undefined,
        {
          zoneId: area.zoneId,
          compound: area.compound,
          district: area.district,
          active: area.active,
          priority: area.priority,
          travelBufferOverride: area.travelBufferOverride,
        },
      );
      return area;
    }, transactionOptions);
    revalidateSetup();
    return { success: true, message: 'تم حفظ منطقة ' + saved.compound + '.' };
  } catch (error) {
    const messages: Record<string, string> = {
      AREA_NOT_FOUND: 'منطقة التغطية غير موجودة.',
      AREA_BRANCH_MISMATCH: 'لا يمكن نقل المنطقة إلى فرع آخر.',
      DUPLICATE_AREA: 'الكمبوند مسجل بالفعل داخل الزون.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: setupError(error) };
  }
}

export async function deleteSetupAreaAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = destructiveSchema.safeParse({
    entityId: formData.get('entityId'),
    branchId: optionalString(formData.get('branchId')),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات الحذف غير صالحة.' };
  if (!parsed.data.branchId || !(await assertBranchAccess(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  }
  try {
    await db.$transaction(async (tx) => {
      const area = await tx.coverageArea.findFirst({
        where: {
          id: parsed.data.entityId,
          zone: { branchId: parsed.data.branchId },
        },
      });
      if (!area) throw new Error('AREA_NOT_FOUND');
      const bookingCount = await tx.booking.count({ where: { coverageAreaId: area.id } });
      if (bookingCount > 0) throw new Error('AREA_HAS_BOOKINGS');
      await tx.coverageArea.delete({ where: { id: area.id } });
      await writeAudit(
        tx,
        actor,
        'SETUP_COVERAGE_AREA_DELETED',
        'CoverageArea',
        area.id,
        { zoneId: area.zoneId, compound: area.compound },
        { deleted: true },
        parsed.data.reason,
      );
    }, transactionOptions);
    revalidateSetup();
    return { success: true, message: 'تم حذف منطقة التغطية غير المستخدمة.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'AREA_NOT_FOUND') return { error: 'منطقة التغطية غير موجودة.' };
    if (error instanceof Error && error.message === 'AREA_HAS_BOOKINGS') {
      return { error: 'لا يمكن حذف منطقة مرتبطة بحجوزات؛ عطّلها للحفاظ على السجل.' };
    }
    return { error: setupError(error) };
  }
}

export async function saveBranchIdentityAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = branchIdentitySchema.safeParse({
    branchId: formData.get('branchId'),
    nameAr: formData.get('nameAr'),
    nameEn: optionalString(formData.get('nameEn')),
    code: formData.get('code'),
    address: formData.get('address'),
    phone: optionalString(formData.get('phone')) ?? '',
    whatsapp: optionalString(formData.get('whatsapp')) ?? '',
    timezone: formData.get('timezone'),
    changeReason: formData.get('changeReason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات الفرع الأساسية غير صالحة.' };
  }
  if (!(await assertBranchAccess(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  }

  try {
    const saved = await db.$transaction(async (tx) => {
      const [before, duplicateCode] = await Promise.all([
        tx.branch.findUnique({ where: { id: parsed.data.branchId } }),
        tx.branch.findFirst({
          where: {
            code: parsed.data.code,
            id: { not: parsed.data.branchId },
          },
          select: { id: true },
        }),
      ]);
      if (!before) throw new Error('BRANCH_NOT_FOUND');
      if (duplicateCode) throw new Error('DUPLICATE_BRANCH_CODE');
      const branch = await tx.branch.update({
        where: { id: before.id },
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn || null,
          code: parsed.data.code,
          address: parsed.data.address,
          phone: parsed.data.phone,
          whatsapp: parsed.data.whatsapp,
          timezone: parsed.data.timezone,
        },
      });
      await writeAudit(
        tx,
        actor,
        'SETUP_BRANCH_IDENTITY_UPDATED',
        'Branch',
        branch.id,
        {
          nameAr: before.nameAr,
          nameEn: before.nameEn,
          code: before.code,
          address: before.address,
          phone: before.phone,
          whatsapp: before.whatsapp,
          timezone: before.timezone,
        },
        {
          nameAr: branch.nameAr,
          nameEn: branch.nameEn,
          code: branch.code,
          address: branch.address,
          phone: branch.phone,
          whatsapp: branch.whatsapp,
          timezone: branch.timezone,
        },
        parsed.data.changeReason,
      );
      return branch;
    }, transactionOptions);
    revalidateSetup();
    revalidatePath('/operations/workforce');
    return { success: true, message: 'تم تحديث بيانات فرع ' + saved.nameAr + '.' };
  } catch (error) {
    const messages: Record<string, string> = {
      BRANCH_NOT_FOUND: 'الفرع غير موجود.',
      DUPLICATE_BRANCH_CODE: 'كود الفرع مستخدم بالفعل في فرع آخر.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: setupError(error) };
  }
}

export async function saveBranchOperationsConfigAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = branchConfigSchema.safeParse({
    branchId: formData.get('branchId'),
    slotUnitMinutes: formData.get('slotUnitMinutes'),
    arrivalWindowMinutes: formData.get('arrivalWindowMinutes'),
    travelBufferMinutes: formData.get('travelBufferMinutes'),
    restBufferMinutes: formData.get('restBufferMinutes') || 0,
    dailyBookingLimit: formData.get('dailyBookingLimit'),
    assignmentMode: formData.get('assignmentMode'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'إعدادات الفرع غير صالحة.' };
  if (!(await assertBranchAccess(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  }
  try {
    await db.$transaction(async (tx) => {
      const before = await tx.branch.findUnique({ where: { id: parsed.data.branchId } });
      if (!before) throw new Error('BRANCH_NOT_FOUND');
      const after = await tx.branch.update({
        where: { id: before.id },
        data: {
          slotUnitMinutes: parsed.data.slotUnitMinutes,
          arrivalWindowMinutes: parsed.data.arrivalWindowMinutes,
          travelBufferMinutes: parsed.data.travelBufferMinutes,
          restBufferMinutes: parsed.data.restBufferMinutes,
          dailyBookingLimit: parsed.data.dailyBookingLimit,
          assignmentMode: parsed.data.assignmentMode,
        },
      });
      await writeAudit(
        tx,
        actor,
        'SETUP_BRANCH_CAPACITY_UPDATED',
        'Branch',
        after.id,
        {
          slotUnitMinutes: before.slotUnitMinutes,
          arrivalWindowMinutes: before.arrivalWindowMinutes,
          travelBufferMinutes: before.travelBufferMinutes,
          restBufferMinutes: before.restBufferMinutes,
          dailyBookingLimit: before.dailyBookingLimit,
          assignmentMode: before.assignmentMode,
        },
        {
          slotUnitMinutes: after.slotUnitMinutes,
          arrivalWindowMinutes: after.arrivalWindowMinutes,
          travelBufferMinutes: after.travelBufferMinutes,
          restBufferMinutes: after.restBufferMinutes,
          dailyBookingLimit: after.dailyBookingLimit,
          assignmentMode: after.assignmentMode,
        },
      );
    }, transactionOptions);
    revalidateSetup();
    return { success: true, message: 'تم تحديث قواعد السعة والإسناد للفرع.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'BRANCH_NOT_FOUND') return { error: 'الفرع غير موجود.' };
    return { error: setupError(error) };
  }
}

export async function saveBranchWorkingHoursAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = branchHoursSchema.safeParse({
    branchId: formData.get('branchId'),
    dayOfWeek: formData.get('dayOfWeek'),
    isClosed: boolField(formData.get('isClosed')),
    openTime: formData.get('openTime'),
    closeTime: formData.get('closeTime'),
    breakStartTime: typeof formData.get('breakStartTime') === 'string' ? formData.get('breakStartTime') : '',
    breakEndTime: typeof formData.get('breakEndTime') === 'string' ? formData.get('breakEndTime') : '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'ساعات العمل غير صالحة.' };
  if (!(await assertBranchAccess(actor, parsed.data.branchId))) return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  try {
    await db.$transaction(async (tx) => {
      const branch = await tx.branch.findUnique({
        where: { id: parsed.data.branchId },
        select: { id: true },
      });
      if (!branch) throw new Error('BRANCH_NOT_FOUND');
      const before = await tx.branchWorkingHours.findUnique({
        where: {
          branchId_dayOfWeek: {
            branchId: parsed.data.branchId,
            dayOfWeek: parsed.data.dayOfWeek,
          },
        },
      });
      const data = {
        isClosed: parsed.data.isClosed,
        openTime: parsed.data.openTime,
        closeTime: parsed.data.closeTime,
        breakStartTime: parsed.data.breakStartTime || null,
        breakEndTime: parsed.data.breakEndTime || null,
      };
      const saved = await tx.branchWorkingHours.upsert({
        where: {
          branchId_dayOfWeek: {
            branchId: parsed.data.branchId,
            dayOfWeek: parsed.data.dayOfWeek,
          },
        },
        update: data,
        create: {
          branchId: parsed.data.branchId,
          dayOfWeek: parsed.data.dayOfWeek,
          ...data,
        },
      });
      await writeAudit(
        tx,
        actor,
        'SETUP_BRANCH_HOURS_UPDATED',
        'BranchWorkingHours',
        saved.id,
        before ? {
          isClosed: before.isClosed,
          openTime: before.openTime,
          closeTime: before.closeTime,
          breakStartTime: before.breakStartTime,
          breakEndTime: before.breakEndTime,
        } : undefined,
        {
          branchId: saved.branchId,
          dayOfWeek: saved.dayOfWeek,
          ...data,
        },
      );
    }, transactionOptions);
    revalidateSetup();
    return { success: true, message: 'تم تحديث ساعات عمل الفرع.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'BRANCH_NOT_FOUND') return { error: 'الفرع غير موجود.' };
    return { error: setupError(error) };
  }
}

export async function saveTeamWorkingHoursAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = teamHoursSchema.safeParse({
    teamId: formData.get('teamId'),
    dayOfWeek: formData.get('dayOfWeek'),
    isOff: boolField(formData.get('isOff')),
    openTime: formData.get('openTime'),
    closeTime: formData.get('closeTime'),
    breakStartTime: typeof formData.get('breakStartTime') === 'string' ? formData.get('breakStartTime') : '',
    breakEndTime: typeof formData.get('breakEndTime') === 'string' ? formData.get('breakEndTime') : '',
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'ساعات الفريق غير صالحة.' };
  const team = await db.team.findUnique({
    where: { id: parsed.data.teamId },
    select: { branchId: true },
  });
  if (!team) return { error: 'الفريق غير موجود.' };
  if (!(await assertBranchAccess(actor, team.branchId))) return { error: 'غير مصرح لك بإدارة هذا الفريق.' };
  try {
    await db.$transaction(async (tx) => {
      const before = await tx.teamWorkingHours.findUnique({
        where: {
          teamId_dayOfWeek: {
            teamId: parsed.data.teamId,
            dayOfWeek: parsed.data.dayOfWeek,
          },
        },
      });
      const data = {
        isOff: parsed.data.isOff,
        openTime: parsed.data.openTime,
        closeTime: parsed.data.closeTime,
        breakStartTime: parsed.data.breakStartTime || null,
        breakEndTime: parsed.data.breakEndTime || null,
      };
      const saved = await tx.teamWorkingHours.upsert({
        where: {
          teamId_dayOfWeek: {
            teamId: parsed.data.teamId,
            dayOfWeek: parsed.data.dayOfWeek,
          },
        },
        update: data,
        create: {
          teamId: parsed.data.teamId,
          dayOfWeek: parsed.data.dayOfWeek,
          ...data,
        },
      });
      await writeAudit(
        tx,
        actor,
        'SETUP_TEAM_HOURS_UPDATED',
        'TeamWorkingHours',
        saved.id,
        before ? {
          isOff: before.isOff,
          openTime: before.openTime,
          closeTime: before.closeTime,
          breakStartTime: before.breakStartTime,
          breakEndTime: before.breakEndTime,
        } : undefined,
        { teamId: saved.teamId, dayOfWeek: saved.dayOfWeek, ...data },
      );
    }, transactionOptions);
    revalidateSetup();
    return { success: true, message: 'تم تحديث ساعات عمل الفريق.' };
  } catch (error) {
    return { error: setupError(error) };
  }
}

export async function saveBlackoutDateAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = blackoutSchema.safeParse({
    blackoutId: optionalString(formData.get('blackoutId')),
    branchId: formData.get('branchId'),
    date: formData.get('date'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات يوم الإغلاق غير صالحة.' };
  if (!(await assertBranchAccess(actor, parsed.data.branchId))) return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  const date = new Date(parsed.data.date + 'T00:00:00.000Z');
  try {
    await db.$transaction(async (tx) => {
      const [branch, before, duplicate] = await Promise.all([
        tx.branch.findUnique({ where: { id: parsed.data.branchId }, select: { id: true } }),
        parsed.data.blackoutId
          ? tx.branchBlackoutDate.findUnique({ where: { id: parsed.data.blackoutId } })
          : Promise.resolve(null),
        tx.branchBlackoutDate.findFirst({
          where: {
            branchId: parsed.data.branchId,
            date,
            ...(parsed.data.blackoutId ? { id: { not: parsed.data.blackoutId } } : {}),
          },
          select: { id: true },
        }),
      ]);
      if (!branch) throw new Error('BRANCH_NOT_FOUND');
      if (parsed.data.blackoutId && !before) throw new Error('BLACKOUT_NOT_FOUND');
      if (before && before.branchId !== parsed.data.branchId) throw new Error('BLACKOUT_BRANCH_MISMATCH');
      if (duplicate) throw new Error('DUPLICATE_BLACKOUT');
      const saved = before
        ? await tx.branchBlackoutDate.update({
            where: { id: before.id },
            data: { date, reason: parsed.data.reason },
          })
        : await tx.branchBlackoutDate.create({
            data: {
              branchId: parsed.data.branchId,
              date,
              reason: parsed.data.reason,
            },
          });
      await writeAudit(
        tx,
        actor,
        before ? 'SETUP_BLACKOUT_UPDATED' : 'SETUP_BLACKOUT_CREATED',
        'BranchBlackoutDate',
        saved.id,
        before ? { date: before.date.toISOString(), reason: before.reason } : undefined,
        { branchId: saved.branchId, date: saved.date.toISOString(), reason: saved.reason },
      );
    }, transactionOptions);
    revalidateSetup();
    return { success: true, message: 'تم حفظ يوم الإغلاق.' };
  } catch (error) {
    const messages: Record<string, string> = {
      BRANCH_NOT_FOUND: 'الفرع غير موجود.',
      BLACKOUT_NOT_FOUND: 'يوم الإغلاق غير موجود.',
      BLACKOUT_BRANCH_MISMATCH: 'يوم الإغلاق لا يتبع هذا الفرع.',
      DUPLICATE_BLACKOUT: 'هذا التاريخ مسجل بالفعل كيوم إغلاق.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: setupError(error) };
  }
}

export async function deleteBlackoutDateAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = destructiveSchema.safeParse({
    entityId: formData.get('entityId'),
    branchId: optionalString(formData.get('branchId')),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات الحذف غير صالحة.' };
  if (!parsed.data.branchId || !(await assertBranchAccess(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  }
  try {
    await db.$transaction(async (tx) => {
      const blackout = await tx.branchBlackoutDate.findFirst({
        where: { id: parsed.data.entityId, branchId: parsed.data.branchId },
      });
      if (!blackout) throw new Error('BLACKOUT_NOT_FOUND');
      await tx.branchBlackoutDate.delete({ where: { id: blackout.id } });
      await writeAudit(
        tx,
        actor,
        'SETUP_BLACKOUT_DELETED',
        'BranchBlackoutDate',
        blackout.id,
        { date: blackout.date.toISOString(), reason: blackout.reason },
        { deleted: true },
        parsed.data.reason,
      );
    }, transactionOptions);
    revalidateSetup();
    return { success: true, message: 'تم حذف يوم الإغلاق.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'BLACKOUT_NOT_FOUND') return { error: 'يوم الإغلاق غير موجود.' };
    return { error: setupError(error) };
  }
}

export async function saveSetupTimeOffAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = timeOffSchema.safeParse({
    timeOffId: optionalString(formData.get('timeOffId')),
    branchId: formData.get('branchId'),
    subjectType: formData.get('subjectType'),
    subjectId: formData.get('subjectId'),
    startDate: formData.get('startDate'),
    startTime: formData.get('startTime'),
    endDate: formData.get('endDate'),
    endTime: formData.get('endTime'),
    reason: formData.get('reason'),
    changeReason: optionalString(formData.get('changeReason')),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات فترة الإجازة غير صالحة.' };
  }
  if (!(await assertBranchAccess(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة إجازات هذا الفرع.' };
  }

  try {
    await db.$transaction(async (tx) => {
      const branch = await tx.branch.findUnique({
        where: { id: parsed.data.branchId },
        select: { id: true, timezone: true },
      });
      if (!branch) throw new Error('BRANCH_NOT_FOUND');

      const startDate = localDateTimeToUtc(
        parsed.data.startDate,
        parsed.data.startTime,
        branch.timezone,
      );
      const endDate = localDateTimeToUtc(
        parsed.data.endDate,
        parsed.data.endTime,
        branch.timezone,
      );
      if (endDate <= startDate) throw new Error('INVALID_TIME_OFF_RANGE');

      if (parsed.data.subjectType === 'TEAM') {
        const [team, before, overlap] = await Promise.all([
          tx.team.findFirst({
            where: { id: parsed.data.subjectId, branchId: branch.id },
            select: { id: true },
          }),
          parsed.data.timeOffId
            ? tx.teamTimeOff.findUnique({ where: { id: parsed.data.timeOffId } })
            : Promise.resolve(null),
          tx.teamTimeOff.findFirst({
            where: {
              teamId: parsed.data.subjectId,
              startDate: { lt: endDate },
              endDate: { gt: startDate },
              ...(parsed.data.timeOffId ? { id: { not: parsed.data.timeOffId } } : {}),
            },
            select: { id: true },
          }),
        ]);
        if (!team) throw new Error('TIME_OFF_SUBJECT_NOT_FOUND');
        if (parsed.data.timeOffId && (!before || before.teamId !== team.id)) {
          throw new Error('TIME_OFF_NOT_FOUND');
        }
        if (overlap) throw new Error('TIME_OFF_OVERLAP');

        const saved = before
          ? await tx.teamTimeOff.update({
              where: { id: before.id },
              data: { startDate, endDate, reason: parsed.data.reason },
            })
          : await tx.teamTimeOff.create({
              data: {
                teamId: team.id,
                startDate,
                endDate,
                reason: parsed.data.reason,
              },
            });
        await writeAudit(
          tx,
          actor,
          before ? 'SETUP_TEAM_TIME_OFF_UPDATED' : 'SETUP_TEAM_TIME_OFF_CREATED',
          'TeamTimeOff',
          saved.id,
          before ? {
            teamId: before.teamId,
            startDate: before.startDate.toISOString(),
            endDate: before.endDate.toISOString(),
            reason: before.reason,
          } : undefined,
          {
            branchId: branch.id,
            teamId: saved.teamId,
            startDate: saved.startDate.toISOString(),
            endDate: saved.endDate.toISOString(),
            reason: saved.reason,
          },
          before ? parsed.data.changeReason : parsed.data.reason,
        );
        return;
      }

      const [employee, before, overlap] = await Promise.all([
        tx.user.findFirst({
          where: {
            id: parsed.data.subjectId,
            role: { in: [UserRole.OPERATIONS_MANAGER, UserRole.EMPLOYEE] },
            branchMemberships: { some: { branchId: branch.id } },
          },
          select: { id: true },
        }),
        parsed.data.timeOffId
          ? tx.employeeTimeOff.findUnique({ where: { id: parsed.data.timeOffId } })
          : Promise.resolve(null),
        tx.employeeTimeOff.findFirst({
          where: {
            userId: parsed.data.subjectId,
            startDate: { lt: endDate },
            endDate: { gt: startDate },
            ...(parsed.data.timeOffId ? { id: { not: parsed.data.timeOffId } } : {}),
          },
          select: { id: true },
        }),
      ]);
      if (!employee) throw new Error('TIME_OFF_SUBJECT_NOT_FOUND');
      if (parsed.data.timeOffId && (!before || before.userId !== employee.id)) {
        throw new Error('TIME_OFF_NOT_FOUND');
      }
      if (overlap) throw new Error('TIME_OFF_OVERLAP');

      const saved = before
        ? await tx.employeeTimeOff.update({
            where: { id: before.id },
            data: { startDate, endDate, reason: parsed.data.reason },
          })
        : await tx.employeeTimeOff.create({
            data: {
              userId: employee.id,
              startDate,
              endDate,
              reason: parsed.data.reason,
            },
          });
      await writeAudit(
        tx,
        actor,
        before ? 'SETUP_EMPLOYEE_TIME_OFF_UPDATED' : 'SETUP_EMPLOYEE_TIME_OFF_CREATED',
        'EmployeeTimeOff',
        saved.id,
        before ? {
          userId: before.userId,
          startDate: before.startDate.toISOString(),
          endDate: before.endDate.toISOString(),
          reason: before.reason,
        } : undefined,
        {
          branchId: branch.id,
          userId: saved.userId,
          startDate: saved.startDate.toISOString(),
          endDate: saved.endDate.toISOString(),
          reason: saved.reason,
        },
        before ? parsed.data.changeReason : parsed.data.reason,
      );
    }, transactionOptions);
    revalidateSetup();
    revalidatePath('/admin/calendar');
    return { success: true, message: 'تم حفظ فترة الإجازة وتحديث الإتاحة.' };
  } catch (error) {
    const messages: Record<string, string> = {
      BRANCH_NOT_FOUND: 'الفرع غير موجود.',
      TIME_OFF_SUBJECT_NOT_FOUND: 'الفريق أو الموظف المحدد لا يتبع هذا الفرع.',
      TIME_OFF_NOT_FOUND: 'فترة الإجازة غير موجودة أو لا تتبع العنصر المحدد.',
      TIME_OFF_OVERLAP: 'توجد فترة إجازة أخرى متداخلة مع هذه المدة.',
      INVALID_TIME_OFF_RANGE: 'نهاية الإجازة يجب أن تكون بعد بدايتها.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: setupError(error) };
  }
}

export async function deleteSetupTimeOffAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = timeOffDeleteSchema.safeParse({
    entityId: formData.get('entityId'),
    branchId: optionalString(formData.get('branchId')),
    subjectType: formData.get('subjectType'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات حذف الإجازة غير صالحة.' };
  }
  if (!parsed.data.branchId || !(await assertBranchAccess(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة إجازات هذا الفرع.' };
  }

  try {
    await db.$transaction(async (tx) => {
      if (parsed.data.subjectType === 'TEAM') {
        const timeOff = await tx.teamTimeOff.findFirst({
          where: {
            id: parsed.data.entityId,
            team: { branchId: parsed.data.branchId },
          },
        });
        if (!timeOff) throw new Error('TIME_OFF_NOT_FOUND');
        await tx.teamTimeOff.delete({ where: { id: timeOff.id } });
        await writeAudit(
          tx,
          actor,
          'SETUP_TEAM_TIME_OFF_DELETED',
          'TeamTimeOff',
          timeOff.id,
          {
            teamId: timeOff.teamId,
            startDate: timeOff.startDate.toISOString(),
            endDate: timeOff.endDate.toISOString(),
            reason: timeOff.reason,
          },
          { deleted: true, branchId: parsed.data.branchId },
          parsed.data.reason,
        );
        return;
      }

      const timeOff = await tx.employeeTimeOff.findFirst({
        where: {
          id: parsed.data.entityId,
          user: { branchMemberships: { some: { branchId: parsed.data.branchId } } },
        },
      });
      if (!timeOff) throw new Error('TIME_OFF_NOT_FOUND');
      await tx.employeeTimeOff.delete({ where: { id: timeOff.id } });
      await writeAudit(
        tx,
        actor,
        'SETUP_EMPLOYEE_TIME_OFF_DELETED',
        'EmployeeTimeOff',
        timeOff.id,
        {
          userId: timeOff.userId,
          startDate: timeOff.startDate.toISOString(),
          endDate: timeOff.endDate.toISOString(),
          reason: timeOff.reason,
        },
        { deleted: true, branchId: parsed.data.branchId },
        parsed.data.reason,
      );
    }, transactionOptions);
    revalidateSetup();
    revalidatePath('/admin/calendar');
    return { success: true, message: 'تم حذف فترة الإجازة وتحديث الإتاحة.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'TIME_OFF_NOT_FOUND') {
      return { error: 'فترة الإجازة غير موجودة أو لا تتبع هذا الفرع.' };
    }
    return { error: setupError(error) };
  }
}

export async function saveZoneTravelTimeAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = travelSchema.safeParse({
    branchId: formData.get('branchId'),
    fromZoneId: formData.get('fromZoneId'),
    toZoneId: formData.get('toZoneId'),
    durationMinutes: formData.get('durationMinutes'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'زمن الانتقال غير صالح.' };
  if (!(await assertBranchAccess(actor, parsed.data.branchId))) return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  try {
    await db.$transaction(async (tx) => {
      const zoneCount = await tx.coverageZone.count({
        where: {
          id: { in: [...new Set([parsed.data.fromZoneId, parsed.data.toZoneId])] },
          branchId: parsed.data.branchId,
        },
      });
      const expectedZoneCount = new Set([parsed.data.fromZoneId, parsed.data.toZoneId]).size;
      if (zoneCount !== expectedZoneCount) throw new Error('INVALID_TRAVEL_ZONES');
      const before = await tx.zoneTravelTime.findUnique({
        where: {
          fromZoneId_toZoneId: {
            fromZoneId: parsed.data.fromZoneId,
            toZoneId: parsed.data.toZoneId,
          },
        },
      });
      const saved = await tx.zoneTravelTime.upsert({
        where: {
          fromZoneId_toZoneId: {
            fromZoneId: parsed.data.fromZoneId,
            toZoneId: parsed.data.toZoneId,
          },
        },
        update: { durationMinutes: parsed.data.durationMinutes },
        create: {
          fromZoneId: parsed.data.fromZoneId,
          toZoneId: parsed.data.toZoneId,
          durationMinutes: parsed.data.durationMinutes,
        },
      });
      await writeAudit(
        tx,
        actor,
        before ? 'SETUP_TRAVEL_TIME_UPDATED' : 'SETUP_TRAVEL_TIME_CREATED',
        'ZoneTravelTime',
        saved.id,
        before ? { durationMinutes: before.durationMinutes } : undefined,
        {
          branchId: parsed.data.branchId,
          fromZoneId: saved.fromZoneId,
          toZoneId: saved.toZoneId,
          durationMinutes: saved.durationMinutes,
        },
      );
    }, transactionOptions);
    revalidateSetup();
    return { success: true, message: 'تم تحديث زمن الانتقال.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_TRAVEL_ZONES') {
      return { error: 'كلتا الزونتين يجب أن تتبعا الفرع نفسه.' };
    }
    return { error: setupError(error) };
  }
}

export async function savePaymentMethodAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = paymentMethodSchema.safeParse({
    paymentMethodId: optionalString(formData.get('paymentMethodId')),
    branchId: formData.get('branchId'),
    name: formData.get('name'),
    type: formData.get('type'),
    accountNumber: formData.get('accountNumber'),
    accountName: formData.get('accountName'),
    instructions: optionalString(formData.get('instructions')),
    active: boolField(formData.get('active'), true),
    isDefault: boolField(formData.get('isDefault')),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات وسيلة الدفع غير صالحة.' };
  if (!(await assertBranchAccess(actor, parsed.data.branchId))) return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  try {
    const saved = await db.$transaction(async (tx) => {
      const [branch, before] = await Promise.all([
        tx.branch.findUnique({ where: { id: parsed.data.branchId }, select: { id: true } }),
        parsed.data.paymentMethodId
          ? tx.branchPaymentMethod.findUnique({ where: { id: parsed.data.paymentMethodId } })
          : Promise.resolve(null),
      ]);
      if (!branch) throw new Error('BRANCH_NOT_FOUND');
      if (parsed.data.paymentMethodId && !before) throw new Error('PAYMENT_METHOD_NOT_FOUND');
      if (before && before.branchId !== parsed.data.branchId) throw new Error('PAYMENT_METHOD_BRANCH_MISMATCH');
      if (parsed.data.isDefault) {
        await tx.branchPaymentMethod.updateMany({
          where: {
            branchId: parsed.data.branchId,
            ...(before ? { id: { not: before.id } } : {}),
          },
          data: { isDefault: false },
        });
      }
      const data = {
        branchId: parsed.data.branchId,
        name: parsed.data.name,
        type: parsed.data.type,
        accountNumber: parsed.data.accountNumber,
        accountName: parsed.data.accountName,
        instructions: parsed.data.instructions || null,
        active: parsed.data.active,
        isDefault: parsed.data.isDefault,
      };
      const paymentMethod = before
        ? await tx.branchPaymentMethod.update({ where: { id: before.id }, data })
        : await tx.branchPaymentMethod.create({ data });
      await writeAudit(
        tx,
        actor,
        before ? 'SETUP_PAYMENT_METHOD_UPDATED' : 'SETUP_PAYMENT_METHOD_CREATED',
        'BranchPaymentMethod',
        paymentMethod.id,
        before ? {
          name: before.name,
          type: before.type,
          accountNumber: before.accountNumber,
          active: before.active,
          isDefault: before.isDefault,
        } : undefined,
        {
          branchId: paymentMethod.branchId,
          name: paymentMethod.name,
          type: paymentMethod.type,
          accountNumber: paymentMethod.accountNumber,
          active: paymentMethod.active,
          isDefault: paymentMethod.isDefault,
        },
      );
      return paymentMethod;
    }, transactionOptions);
    revalidateSetup();
    return { success: true, message: 'تم حفظ وسيلة الدفع ' + saved.name + '.' };
  } catch (error) {
    const messages: Record<string, string> = {
      BRANCH_NOT_FOUND: 'الفرع غير موجود.',
      PAYMENT_METHOD_NOT_FOUND: 'وسيلة الدفع غير موجودة.',
      PAYMENT_METHOD_BRANCH_MISMATCH: 'وسيلة الدفع لا تتبع هذا الفرع.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: setupError(error) };
  }
}

export async function deletePaymentMethodAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = destructiveSchema.safeParse({
    entityId: formData.get('entityId'),
    branchId: optionalString(formData.get('branchId')),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات الإجراء غير صالحة.' };
  if (!parsed.data.branchId || !(await assertBranchAccess(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة هذا الفرع.' };
  }
  try {
    const deactivated = await db.$transaction(async (tx) => {
      const paymentMethod = await tx.branchPaymentMethod.findFirst({
        where: { id: parsed.data.entityId, branchId: parsed.data.branchId },
      });
      if (!paymentMethod) throw new Error('PAYMENT_METHOD_NOT_FOUND');
      const proofCount = await tx.paymentProof.count({
        where: { paymentMethodId: paymentMethod.id },
      });
      if (proofCount > 0) {
        await tx.branchPaymentMethod.update({
          where: { id: paymentMethod.id },
          data: { active: false, isDefault: false },
        });
      } else {
        await tx.branchPaymentMethod.delete({ where: { id: paymentMethod.id } });
      }
      await writeAudit(
        tx,
        actor,
        proofCount > 0 ? 'SETUP_PAYMENT_METHOD_DEACTIVATED' : 'SETUP_PAYMENT_METHOD_DELETED',
        'BranchPaymentMethod',
        paymentMethod.id,
        {
          name: paymentMethod.name,
          active: paymentMethod.active,
          isDefault: paymentMethod.isDefault,
        },
        proofCount > 0 ? { active: false, isDefault: false } : { deleted: true },
        parsed.data.reason,
      );
      return proofCount > 0;
    }, transactionOptions);
    revalidateSetup();
    return {
      success: true,
      message: deactivated
        ? 'الوسيلة مستخدمة في إثباتات سابقة؛ تم تعطيلها بدل حذفها.'
        : 'تم حذف وسيلة الدفع غير المستخدمة.',
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'PAYMENT_METHOD_NOT_FOUND') {
      return { error: 'وسيلة الدفع غير موجودة.' };
    }
    return { error: setupError(error) };
  }
}

export async function saveChecklistTemplateAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const rawServiceIds = formData.get('serviceIds');
  const serviceIdsParsed = rawServiceIds ? jsonField(rawServiceIds) : undefined;
  const parsed = checklistSchema.safeParse({
    templateId: optionalString(formData.get('templateId')),
    serviceId: optionalString(formData.get('serviceId')),
    serviceIds: Array.isArray(serviceIdsParsed)
      ? serviceIdsParsed
      : (formData.get('serviceId') ? [String(formData.get('serviceId'))] : []),
    stage: formData.get('stage') || undefined,
    name: formData.get('name'),
    items: jsonField(formData.get('items')),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات قائمة الفحص غير صالحة.' };

  const targetServiceIds = parsed.data.serviceIds && parsed.data.serviceIds.length > 0
    ? parsed.data.serviceIds
    : (parsed.data.serviceId ? [parsed.data.serviceId] : []);

  if (targetServiceIds.length === 0) {
    return { error: 'اختر خدمة واحدة على الأقل لتطبيق القالب عليها.' };
  }

  try {
    await db.$transaction(async (tx) => {
      for (const sId of targetServiceIds) {
        const stage = parsed.data.stage ?? ChecklistStage.SERVICE_EXECUTION;
        const existing = await tx.checklistTemplate.findUnique({
          where: {
            serviceId_stage: {
              serviceId: sId,
              stage,
            },
          },
          include: { items: true },
        });

        const template = existing
          ? await tx.checklistTemplate.update({
              where: { id: existing.id },
              data: {
                name: parsed.data.name,
              },
            })
          : await tx.checklistTemplate.create({
              data: {
                serviceId: sId,
                stage,
                name: parsed.data.name,
              },
            });

        // Delete old items and recreate with fresh order
        await tx.checklistTemplateItem.deleteMany({
          where: { templateId: template.id },
        });

        for (const item of parsed.data.items) {
          await tx.checklistTemplateItem.create({
            data: {
              templateId: template.id,
              labelAr: item.labelAr,
              descriptionAr: item.descriptionAr || null,
              required: item.required,
              requiresPhoto: item.requiresPhoto,
              requiresNote: item.requiresNote,
              displayOrder: item.displayOrder,
              active: item.active,
            },
          });
        }
      }
    });

    revalidateSetup();
    revalidatePath('/staff');
    return { success: true, message: `تم حفظ وتطبيق القالب «${parsed.data.name}» على ${targetServiceIds.length} خدمة بنجاح.` };
  } catch (error) {
    return { error: setupError(error) };
  }
}

export async function deleteChecklistTemplateAction(formData: FormData): Promise<SetupActionResult> {
  const actor = await setupActor();
  const parsed = destructiveSchema.safeParse({
    entityId: formData.get('entityId'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات الحذف غير صالحة.' };
  try {
    await db.$transaction(async (tx) => {
      const template = await tx.checklistTemplate.findUnique({
        where: { id: parsed.data.entityId },
        include: { _count: { select: { items: true } } },
      });
      if (!template) throw new Error('CHECKLIST_NOT_FOUND');
      await tx.checklistTemplate.delete({ where: { id: template.id } });
      await writeAudit(
        tx,
        actor,
        'SETUP_CHECKLIST_DELETED',
        'ChecklistTemplate',
        template.id,
        {
          serviceId: template.serviceId,
          stage: template.stage,
          name: template.name,
          itemCount: template._count.items,
        },
        { deleted: true },
        parsed.data.reason,
      );
    }, transactionOptions);
    revalidateSetup();
    revalidatePath('/staff');
    return { success: true, message: 'تم حذف قالب قائمة الفحص.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'CHECKLIST_NOT_FOUND') {
      return { error: 'قائمة الفحص غير موجودة.' };
    }
    return { error: setupError(error) };
  }
}
