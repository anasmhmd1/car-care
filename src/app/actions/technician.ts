'use server';

import {
  BookingStatus,
  ChecklistStage,
  FileType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { hasPermissionAcrossScopes } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { canEmployeeAccessTaskAssignment } from '@/lib/auth/task-assignment';
import {
  readMaterialRequirementsSnapshot,
  resolveBookingMaterialRequirements,
  type BookingMaterialRequirementSnapshot,
} from '@/lib/booking/material-requirements-snapshot';
import {
  BookingTransitionError,
  transitionBookingStatus,
} from '@/lib/engine/transition';
import {
  canEditChecklistStage,
  canUploadExecutionFile,
} from '@/lib/engine/evidence-stage';
import { databaseIdSchema } from '@/lib/validations/database-id';

const technicianStatusSchema = z.object({
  bookingId: databaseIdSchema,
  targetStatus: z.nativeEnum(BookingStatus),
  reason: z.string().trim().max(500).optional().default(''),
});

const technicianPhotoSchema = z.object({
  bookingId: databaseIdSchema,
  bookingFileId: databaseIdSchema,
});

const technicianNoteSchema = z.object({
  bookingId: databaseIdSchema,
  noteType: z.enum(['PROBLEM', 'EXTRA_TIME', 'ADDON_REQUEST', 'GENERAL']),
  text: z.string().trim().min(3).max(2000),
});

const checklistResultSchema = z.object({
  bookingId: databaseIdSchema,
  itemId: z.string().min(1).max(200),
  isChecked: z.enum(['true', 'false']).transform((value) => value === 'true'),
  note: z.string().trim().max(1000).optional().default(''),
  photoFileId: databaseIdSchema.optional(),
});

const EMPLOYEE_TARGET_STATUSES = new Set<BookingStatus>([
  BookingStatus.TEAM_ACKNOWLEDGED,
  BookingStatus.ON_THE_WAY,
  BookingStatus.ARRIVED,
  BookingStatus.IN_SERVICE,
  BookingStatus.QUALITY_REVIEW,
  BookingStatus.EXECUTION_FAILED,
  BookingStatus.CUSTOMER_NO_SHOW,
  BookingStatus.ACCESS_DENIED,
]);

const TECHNICIAN_FILE_TYPES = new Set<FileType>([
  FileType.BEFORE_SERVICE,
  FileType.EXISTING_DAMAGE,
  FileType.DURING_SERVICE,
  FileType.AFTER_SERVICE,
]);

type Actor = { id: string; role: UserRole };

async function canExecuteBookingTask(actor: Actor, bookingId: string) {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
    select: { branchId: true, assignedTeamId: true },
  });
  return Boolean(
    booking &&
    await hasPermissionAcrossScopes(actor, 'task.execute', [
      { type: 'BRANCH', id: booking.branchId },
      ...(booking.assignedTeamId
        ? [{ type: 'TEAM' as const, id: booking.assignedTeamId }]
        : []),
    ]),
  );
}

async function requireOperationalBookingAccess(
  tx: Prisma.TransactionClient,
  actor: Actor,
  bookingId: string,
) {
  const booking = await tx.booking.findFirst({
    where: { id: bookingId, deletedAt: null },
    include: {
      assignedTeam: {
        select: {
          members: {
            where: { userId: actor.id },
            select: { id: true, isLeader: true },
          },
        },
      },
      branch: {
        select: {
          memberships: {
            where: { userId: actor.id },
            select: { id: true },
          },
        },
      },
    },
  });

  if (!booking) throw new Error('الحجز غير موجود.');

  if (actor.role === UserRole.EMPLOYEE) {
    const isTeamMember = Boolean(booking.assignedTeam?.members.length);
    if (!isTeamMember) throw new Error('هذا الحجز غير مسند إلى فريقك.');

    const isLeader = Boolean(booking.assignedTeam?.members[0]?.isLeader);
    if (!canEmployeeAccessTaskAssignment({
      employeeId: actor.id,
      assignedEmployeeId: booking.assignedEmployeeId,
      isTeamMember,
      isTeamLeader: isLeader,
    })) {
      throw new Error('هذا الحجز مخصص فرديًا لفني آخر داخل الفريق.');
    }
  }

  if (actor.role === UserRole.OPERATIONS_MANAGER && !booking.branch.memberships.length) {
    throw new Error('لا تملك صلاحية إدارة حجوزات هذا الفرع.');
  }

  return booking;
}

async function assertRequiredMaterialsReady(
  tx: Prisma.TransactionClient,
  booking: { branchId: string; serviceId: string; serviceSnapshot: unknown },
) {
  const snapshot = readMaterialRequirementsSnapshot(booking.serviceSnapshot);
  const legacyRequirements: BookingMaterialRequirementSnapshot[] = snapshot === null
    ? (await tx.serviceMaterialRequirement.findMany({
        where: { serviceId: booking.serviceId, required: true },
        select: {
          materialId: true,
          quantity: true,
          required: true,
          notes: true,
          material: { select: { nameAr: true, unit: true } },
        },
      })).map((requirement) => ({
        id: requirement.materialId,
        nameAr: requirement.material.nameAr,
        unit: requirement.material.unit,
        quantity: requirement.quantity,
        required: requirement.required,
        notes: requirement.notes,
      }))
    : [];
  const requirements = resolveBookingMaterialRequirements(
    booking.serviceSnapshot,
    legacyRequirements,
  ).filter((requirement) => requirement.required);
  if (!requirements.length) return;
  const stocks = await tx.branchMaterialStock.findMany({
    where: {
      branchId: booking.branchId,
      materialId: { in: requirements.map((requirement) => requirement.id) },
    },
    select: {
      materialId: true,
      quantityOnHand: true,
      reservedQuantity: true,
      active: true,
      material: { select: { active: true } },
    },
  });
  const stockByMaterial = new Map(stocks.map((stock) => [stock.materialId, stock]));
  const unavailable = requirements.filter((requirement) => {
    const stock = stockByMaterial.get(requirement.id);
    return !stock?.active
      || !stock.material.active
      || (stock.quantityOnHand - stock.reservedQuantity) < requirement.quantity;
  });
  if (unavailable.length) {
    throw new Error(`لا يمكن بدء الخدمة قبل توفير المواد المطلوبة: ${unavailable.slice(0, 3).map((requirement) => requirement.nameAr).join('، ')}${unavailable.length > 3 ? '…' : ''}.`);
  }
}

export async function updateTechnicianTaskStatusAction(formData: FormData) {
  const actor = await requireRole([
    UserRole.EMPLOYEE,
    UserRole.OPERATIONS_MANAGER,
    UserRole.OWNER,
  ]);
  const parsed = technicianStatusSchema.safeParse({
    bookingId: formData.get('bookingId'),
    targetStatus: formData.get('targetStatus'),
    reason: formData.get('reason') ?? '',
  });

  if (!parsed.success) return { error: 'بيانات تحديث الحالة غير مكتملة.' };
  if (!(await canExecuteBookingTask(actor, parsed.data.bookingId))) {
    return { error: 'لا تملك صلاحية تنفيذ مهام هذا الفرع.' };
  }
  if (actor.role === UserRole.EMPLOYEE && !EMPLOYEE_TARGET_STATUSES.has(parsed.data.targetStatus)) {
    return { error: 'هذه الحالة لا يمكن تسجيلها من حساب الفني.' };
  }

  try {
    await db.$transaction(async (tx) => {
      const booking = await requireOperationalBookingAccess(tx, actor, parsed.data.bookingId);
      if (parsed.data.targetStatus === BookingStatus.IN_SERVICE) {
        await assertRequiredMaterialsReady(tx, booking);
      }
      await transitionBookingStatus(tx, {
        bookingId: parsed.data.bookingId,
        toStatus: parsed.data.targetStatus,
        actorUserId: actor.id,
        actorRole: actor.role,
        reason: parsed.data.reason,
        metadata: { source: 'TECHNICIAN_APP' },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidatePath('/staff');
    return { success: true };
  } catch (error) {
    if (error instanceof BookingTransitionError || error instanceof Error) {
      return { error: error.message };
    }
    return { error: 'تعذر تحديث حالة الحجز.' };
  }
}

/**
 * Confirms a file that was already uploaded and attached by /api/upload.
 * Arbitrary external URLs are never accepted here.
 */
export async function uploadTechnicianPhotoAction(formData: FormData) {
  const actor = await requireRole([
    UserRole.EMPLOYEE,
    UserRole.OPERATIONS_MANAGER,
    UserRole.OWNER,
  ]);
  const parsed = technicianPhotoSchema.safeParse({
    bookingId: formData.get('bookingId'),
    bookingFileId: formData.get('bookingFileId'),
  });

  if (!parsed.success) return { error: 'ارفع ملف صورة صالحًا أولًا.' };
  if (!(await canExecuteBookingTask(actor, parsed.data.bookingId))) {
    return { error: 'لا تملك صلاحية تنفيذ مهام هذا الفرع.' };
  }

  try {
    await db.$transaction(async (tx) => {
      const booking = await requireOperationalBookingAccess(tx, actor, parsed.data.bookingId);
      const file = await tx.bookingFile.findFirst({
        where: {
          id: parsed.data.bookingFileId,
          bookingId: parsed.data.bookingId,
          uploadedByUserId: actor.id,
        },
      });

      if (!file || !TECHNICIAN_FILE_TYPES.has(file.fileType) || !file.mimeType.startsWith('image/')) {
        throw new Error('ملف الصورة غير موجود أو غير مرتبط بهذا الحجز.');
      }
      if (!canUploadExecutionFile(booking.bookingStatus, file.fileType)) {
        throw new Error('مرحلة الحجز الحالية لا تسمح بتوثيق هذا النوع من الصور.');
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: `TECHNICIAN_PHOTO_${file.fileType}`,
          entityType: 'BookingFile',
          entityId: file.id,
          afterJson: { bookingId: file.bookingId, fileType: file.fileType },
        },
      });
    });

    revalidatePath('/staff');
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'تعذر توثيق الصورة.' };
  }
}

export async function recordTechnicianNoteAction(formData: FormData) {
  const actor = await requireRole([
    UserRole.EMPLOYEE,
    UserRole.OPERATIONS_MANAGER,
    UserRole.OWNER,
  ]);
  const parsed = technicianNoteSchema.safeParse({
    bookingId: formData.get('bookingId'),
    noteType: formData.get('noteType') === 'CASH_BALANCE' ? undefined : formData.get('noteType') ?? 'GENERAL',
    text: formData.get('text'),
  });

  if (!parsed.success) {
    if (formData.get('noteType') === 'CASH_BALANCE') {
      return { error: 'التحصيل المالي يجب تسجيله كدفعة موثقة، وليس كملاحظة.' };
    }
    return { error: 'اكتب تفاصيل صحيحة للملاحظة.' };
  }
  if (!(await canExecuteBookingTask(actor, parsed.data.bookingId))) {
    return { error: 'لا تملك صلاحية تنفيذ مهام هذا الفرع.' };
  }

  const prefixes: Record<typeof parsed.data.noteType, string> = {
    PROBLEM: '[مشكلة ميدانية] ',
    EXTRA_TIME: '[طلب وقت إضافي] ',
    ADDON_REQUEST: '[طلب إضافة من العميل] ',
    GENERAL: '',
  };

  try {
    await db.$transaction(async (tx) => {
      await requireOperationalBookingAccess(tx, actor, parsed.data.bookingId);
      const note = await tx.bookingNote.create({
        data: {
          bookingId: parsed.data.bookingId,
          userId: actor.id,
          note: `${prefixes[parsed.data.noteType]}${parsed.data.text}`,
          isPrivate: parsed.data.noteType !== 'GENERAL',
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: `TECHNICIAN_NOTE_${parsed.data.noteType}`,
          entityType: 'BookingNote',
          entityId: note.id,
          afterJson: { bookingId: parsed.data.bookingId, noteType: parsed.data.noteType },
        },
      });
    });

    revalidatePath('/staff');
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'تعذر تسجيل الملاحظة.' };
  }
}

export async function toggleChecklistItemAction(formData: FormData) {
  const actor = await requireRole([
    UserRole.EMPLOYEE,
    UserRole.OPERATIONS_MANAGER,
    UserRole.OWNER,
  ]);
  const parsed = checklistResultSchema.safeParse({
    bookingId: formData.get('bookingId'),
    itemId: formData.get('itemId') ?? formData.get('itemLabel'),
    isChecked: formData.get('isChecked'),
    note: formData.get('note') ?? '',
    photoFileId: formData.get('photoFileId') || undefined,
  });

  if (!parsed.success) return { error: 'بيانات عنصر الفحص غير مكتملة.' };
  if (!(await canExecuteBookingTask(actor, parsed.data.bookingId))) {
    return { error: 'لا تملك صلاحية تنفيذ مهام هذا الفرع.' };
  }

  try {
    await db.$transaction(async (tx) => {
      const booking = await requireOperationalBookingAccess(tx, actor, parsed.data.bookingId);
      const templateItem = await tx.checklistTemplateItem.findFirst({
        where: {
          active: true,
          template: { serviceId: booking.serviceId },
          OR: [
            { id: parsed.data.itemId },
            { labelAr: parsed.data.itemId },
          ],
        },
        include: { template: true },
      });
      if (!templateItem) throw new Error('عنصر الفحص غير موجود ضمن قالب الخدمة.');
      if (!canEditChecklistStage(
        booking.bookingStatus,
        templateItem.template.stage as ChecklistStage,
      )) {
        throw new Error('هذه القائمة ليست مفتوحة للتعديل في مرحلة الحجز الحالية.');
      }

      let photoUrl: string | null = null;
      if (parsed.data.photoFileId) {
        const photo = await tx.bookingFile.findFirst({
          where: {
            id: parsed.data.photoFileId,
            bookingId: parsed.data.bookingId,
            fileType: { in: [...TECHNICIAN_FILE_TYPES] },
            mimeType: { startsWith: 'image/' },
          },
        });
        if (!photo) throw new Error('صورة عنصر الفحص غير مرتبطة بالحجز.');
        photoUrl = photo.fileUrl;
      }

      if (parsed.data.isChecked && templateItem.requiresPhoto && !photoUrl) {
        throw new Error('هذا العنصر يتطلب صورة قبل اعتماده.');
      }
      if (parsed.data.isChecked && templateItem.requiresNote && !parsed.data.note) {
        throw new Error('هذا العنصر يتطلب ملاحظة قبل اعتماده.');
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checklist:${parsed.data.bookingId}:${templateItem.template.stage}`}))`;
      const instance = await tx.bookingChecklistInstance.upsert({
        where: {
          bookingId_stage: {
            bookingId: parsed.data.bookingId,
            stage: templateItem.template.stage,
          },
        },
        update: {},
        create: { bookingId: parsed.data.bookingId, stage: templateItem.template.stage },
      });

      const resultData = {
        itemLabel: templateItem.labelAr,
        isChecked: parsed.data.isChecked,
        note: parsed.data.note || null,
        photoUrl,
        checkedByUserId: parsed.data.isChecked ? actor.id : null,
        checkedAt: parsed.data.isChecked ? new Date() : null,
      };

      const savedResult = await tx.bookingChecklistItemResult.upsert({
        where: {
          instanceId_itemId: { instanceId: instance.id, itemId: templateItem.id },
        },
        update: resultData,
        create: {
          instanceId: instance.id,
          itemId: templateItem.id,
          ...resultData,
        },
      });

      const requiredItems = await tx.checklistTemplateItem.findMany({
        where: {
          template: {
            serviceId: booking.serviceId,
            stage: templateItem.template.stage,
          },
          active: true,
          required: true,
        },
        select: { id: true, requiresPhoto: true, requiresNote: true },
      });
      const results = await tx.bookingChecklistItemResult.findMany({
        where: { instanceId: instance.id, itemId: { in: requiredItems.map((item) => item.id) } },
      });
      const resultByItem = new Map(results.map((result) => [result.itemId, result]));
      const stageComplete = requiredItems.every((item) => {
        const result = resultByItem.get(item.id);
        return Boolean(
          result?.isChecked &&
          (!item.requiresPhoto || result.photoUrl) &&
          (!item.requiresNote || result.note?.trim()),
        );
      });

      await tx.bookingChecklistInstance.update({
        where: { id: instance.id },
        data: {
          completedAt: stageComplete ? new Date() : null,
          completedByUserId: stageComplete ? actor.id : null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'CHECKLIST_ITEM_UPDATED',
          entityType: 'BookingChecklistItemResult',
          entityId: savedResult.id,
          afterJson: {
            bookingId: parsed.data.bookingId,
            itemId: templateItem.id,
            checked: parsed.data.isChecked,
            stageComplete,
          },
        },
      });
    });

    revalidatePath('/staff');
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'تعذر تحديث قائمة الفحص.' };
  }
}
