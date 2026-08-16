'use server';

import { Prisma, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { canAccessBranch, getAccessibleBranchIds } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import {
  canManageWorkforceAccount,
  isWorkforceAccountWithinManagedBranches,
} from '@/lib/auth/policy';
import { requireRole } from '@/lib/auth/session';
import { revokeAllUserSessionsAndBumpVersion } from '@/lib/auth/session-store';
import { db } from '@/lib/db';
import { localDateTimeToUtc } from '@/lib/engine/time';

export interface OperationsWorkforceActionResult {
  success?: true;
  message?: string;
  error?: string;
}

type WorkforceActor = {
  id: string;
  role: UserRole;
};

const WORKFORCE_ROLES = [
  UserRole.OPERATIONS_MANAGER,
  UserRole.OWNER,
  UserRole.SYSTEM_SUPER_ADMIN,
] as const;

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
  if (!value.employeeId && password.length < 12) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['temporaryPassword'],
      message: 'كلمة المرور المؤقتة مطلوبة للحساب الجديد وبحد أدنى 12 حرفًا.',
    });
  }
  if (password && (
    password.length < 12 ||
    /^(password|admin|change-?me|replace-?me|emppass)/i.test(password)
  )) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['temporaryPassword'],
      message: 'استخدم كلمة مرور مؤقتة قوية وغير متوقعة من 12 حرفًا على الأقل.',
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

const teamHoursSchema = z.object({
  teamId: idSchema,
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  isOff: z.boolean(),
  openTime: timeSchema,
  closeTime: timeSchema,
  breakStartTime: z.union([timeSchema, z.literal('')]).optional(),
  breakEndTime: z.union([timeSchema, z.literal('')]).optional(),
}).superRefine((value, context) => {
  if (value.isOff) return;
  if (value.openTime >= value.closeTime) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['closeTime'],
      message: 'وقت الإغلاق يجب أن يكون بعد وقت الفتح.',
    });
  }
  if (Boolean(value.breakStartTime) !== Boolean(value.breakEndTime)) {
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
      message: 'الاستراحة يجب أن تقع بالكامل داخل ساعات الفريق.',
    });
  }
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

const destructiveSchema = z.object({
  entityId: idSchema,
  branchId: idSchema,
  reason: z.string().trim().min(5, 'اكتب سببًا واضحًا من 5 أحرف على الأقل.').max(500),
});

const timeOffDeleteSchema = destructiveSchema.extend({
  subjectType: timeOffSubjectSchema,
});

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

function manageableRoles(actor: WorkforceActor): UserRole[] {
  return actor.role === UserRole.OPERATIONS_MANAGER
    ? [UserRole.EMPLOYEE]
    : [UserRole.EMPLOYEE, UserRole.OPERATIONS_MANAGER];
}

async function workforceActor(): Promise<WorkforceActor> {
  return requireRole([...WORKFORCE_ROLES]);
}

async function canManageBranch(actor: WorkforceActor, branchId: string): Promise<boolean> {
  const [canAccess, canManage] = await Promise.all([
    canAccessBranch(actor, branchId),
    hasPermission(actor, 'workforce.manage', { type: 'BRANCH', id: branchId }),
  ]);
  return canAccess && canManage;
}

async function canManageEmployeeAccounts(
  actor: WorkforceActor,
  branchId: string,
): Promise<boolean> {
  const [canAccess, canManage] = await Promise.all([
    canAccessBranch(actor, branchId),
    hasPermission(actor, 'employee.manage', { type: 'BRANCH', id: branchId }),
  ]);
  return canAccess && canManage;
}

async function managedBranchSet(
  actor: WorkforceActor,
  permission: 'workforce.manage' | 'employee.manage' = 'workforce.manage',
): Promise<ReadonlySet<string> | null> {
  if (actor.role !== UserRole.OPERATIONS_MANAGER) return null;
  const accessibleBranchIds = await getAccessibleBranchIds(actor) ?? [];
  const checks = await Promise.all(
    accessibleBranchIds.map(async (branchId) => ({
      branchId,
      allowed: await hasPermission(actor, permission, { type: 'BRANCH', id: branchId }),
    })),
  );
  return new Set(checks.filter(({ allowed }) => allowed).map(({ branchId }) => branchId));
}

function workforceError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return 'هذه القيمة مستخدمة بالفعل في سجل آخر.';
    if (error.code === 'P2003') return 'تعذر تنفيذ الإجراء لوجود بيانات تشغيل مرتبطة.';
    if (error.code === 'P2034') return 'تغيّرت البيانات أثناء الحفظ؛ حدّث الصفحة وأعد المحاولة.';
  }
  console.error('Operations workforce action failed:', error);
  return 'تعذر حفظ بيانات القوى العاملة. تحقق من المدخلات ثم حاول مرة أخرى.';
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  actor: WorkforceActor,
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

function revalidateWorkforce() {
  revalidatePath('/operations/workforce');
  revalidatePath('/operations');
  revalidatePath('/admin/setup');
  revalidatePath('/admin/calendar');
}

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;

export async function saveOperationsEmployeeAction(
  formData: FormData,
): Promise<OperationsWorkforceActionResult> {
  const actor = await workforceActor();
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
  if (!(await canManageEmployeeAccounts(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة القوى العاملة في هذا الفرع.' };
  }
  if (!canManageWorkforceAccount(actor.role, parsed.data.role, parsed.data.role)) {
    return { error: 'مدير التشغيل يمكنه إنشاء وتعديل حسابات Employee فقط.' };
  }

  const managedBranches = await managedBranchSet(actor, 'employee.manage');

  const password = parsed.data.temporaryPassword?.trim();
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

  try {
    const saved = await db.$transaction(async (tx) => {
      const [branch, before] = await Promise.all([
        tx.branch.findUnique({ where: { id: parsed.data.branchId }, select: { id: true } }),
        parsed.data.employeeId
          ? tx.user.findUnique({
              where: { id: parsed.data.employeeId },
              include: { branchMemberships: { select: { branchId: true } } },
            })
          : Promise.resolve(null),
      ]);
      if (!branch) throw new Error('BRANCH_NOT_FOUND');
      if (parsed.data.employeeId && !before) throw new Error('EMPLOYEE_NOT_FOUND');
      if (
        before &&
        !canManageWorkforceAccount(actor.role, before.role, parsed.data.role)
      ) throw new Error('ROLE_NOT_MANAGEABLE');
      if (before && !before.branchMemberships.some(({ branchId }) => branchId === branch.id)) {
        throw new Error('EMPLOYEE_BRANCH_MISMATCH');
      }
      if (
        before &&
        !isWorkforceAccountWithinManagedBranches(
          before.branchMemberships.map(({ branchId }) => branchId),
          managedBranches,
        )
      ) {
        throw new Error('EMPLOYEE_OUTSIDE_MANAGED_BRANCHES');
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
        deleteReason: parsed.data.active ? null : 'Disabled from operations workforce',
        ...(passwordHash ? { passwordHash, mustChangePwd: true } : {}),
      };
      let user;
      if (before) {
        user = await tx.user.update({ where: { id: before.id }, data });
      } else {
        if (!passwordHash) throw new Error('PASSWORD_REQUIRED');
        user = await tx.user.create({
          data: { ...data, passwordHash, mustChangePwd: true },
        });
      }

      if (parsed.data.role === UserRole.OPERATIONS_MANAGER) {
        const rawBranchIds = formData.getAll('branchIds').map((val) => String(val).trim()).filter(Boolean);
        const targetBranchIds = rawBranchIds.length > 0 ? rawBranchIds : [branch.id];

        await tx.branchMembership.deleteMany({
          where: { userId: user.id, branchId: { notIn: targetBranchIds } },
        });
        for (const bId of targetBranchIds) {
          await tx.branchMembership.upsert({
            where: { branchId_userId: { branchId: bId, userId: user.id } },
            update: {},
            create: { branchId: bId, userId: user.id },
          });
        }
      } else {
        await tx.branchMembership.deleteMany({
          where: { userId: user.id, branchId: { not: branch.id } },
        });
        await tx.branchMembership.upsert({
          where: { branchId_userId: { branchId: branch.id, userId: user.id } },
          update: {},
          create: { branchId: branch.id, userId: user.id },
        });
        await tx.teamMember.deleteMany({
          where: { userId: user.id, team: { branchId: { not: branch.id } } },
        });
      }

      if (!parsed.data.active) await tx.teamMember.deleteMany({ where: { userId: user.id } });
      if (
        before &&
        (passwordHash || before.role !== user.role || before.active !== user.active)
      ) {
        await revokeAllUserSessionsAndBumpVersion(tx, user.id, 'OPERATIONS_WORKFORCE_CHANGE');
      }
      await writeAudit(
        tx,
        actor,
        before ? 'OPERATIONS_EMPLOYEE_UPDATED' : 'OPERATIONS_EMPLOYEE_CREATED',
        'User',
        user.id,
        before ? {
          fullName: before.fullName,
          phone: before.phone,
          role: before.role,
          active: before.active,
        } : undefined,
        {
          branchId: branch.id,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          active: user.active,
          passwordReset: Boolean(passwordHash),
        },
      );
      return user;
    }, transactionOptions);
    revalidateWorkforce();
    return {
      success: true,
      message: parsed.data.employeeId
        ? 'تم تحديث حساب ' + saved.fullName + '.'
        : 'تم إنشاء حساب ' + saved.fullName + ' مع إلزام تغيير كلمة المرور.',
    };
  } catch (error) {
    const messages: Record<string, string> = {
      BRANCH_NOT_FOUND: 'الفرع غير موجود.',
      EMPLOYEE_NOT_FOUND: 'حساب الموظف غير موجود.',
      EMPLOYEE_BRANCH_MISMATCH: 'الموظف لا يتبع هذا الفرع.',
      EMPLOYEE_OUTSIDE_MANAGED_BRANCHES: 'الحساب مشترك مع فرع خارج نطاق إدارتك.',
      ROLE_NOT_MANAGEABLE: 'لا يمكنك إدارة هذا النوع من الحسابات.',
      PASSWORD_REQUIRED: 'كلمة المرور المؤقتة مطلوبة للحساب الجديد.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: workforceError(error) };
  }
}

export async function deactivateOperationsEmployeeAction(
  formData: FormData,
): Promise<OperationsWorkforceActionResult> {
  const actor = await workforceActor();
  const parsed = destructiveSchema.safeParse({
    entityId: formData.get('entityId'),
    branchId: formData.get('branchId'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات التعطيل غير صالحة.' };
  if (!(await canManageEmployeeAccounts(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة القوى العاملة في هذا الفرع.' };
  }
  if (parsed.data.entityId === actor.id) return { error: 'لا يمكنك تعطيل حسابك الحالي.' };
  const managedBranches = await managedBranchSet(actor, 'employee.manage');

  try {
    await db.$transaction(async (tx) => {
      const target = await tx.user.findFirst({
        where: {
          id: parsed.data.entityId,
          role: { in: manageableRoles(actor) },
          branchMemberships: { some: { branchId: parsed.data.branchId } },
        },
        include: { branchMemberships: { select: { branchId: true } } },
      });
      if (!target) throw new Error('EMPLOYEE_NOT_FOUND');
      if (!canManageWorkforceAccount(actor.role, target.role)) throw new Error('EMPLOYEE_NOT_FOUND');
      if (!isWorkforceAccountWithinManagedBranches(
        target.branchMemberships.map(({ branchId }) => branchId),
        managedBranches,
      )) throw new Error('EMPLOYEE_OUTSIDE_MANAGED_BRANCHES');
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
      await revokeAllUserSessionsAndBumpVersion(tx, target.id, 'OPERATIONS_ACCOUNT_DISABLED');
      await writeAudit(
        tx,
        actor,
        'OPERATIONS_EMPLOYEE_DEACTIVATED',
        'User',
        target.id,
        { active: target.active, role: target.role, branchId: parsed.data.branchId },
        { active: false },
        parsed.data.reason,
      );
    }, transactionOptions);
    revalidateWorkforce();
    return { success: true, message: 'تم تعطيل حساب الموظف وإنهاء جلساته.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'EMPLOYEE_NOT_FOUND') {
      return { error: 'الموظف غير موجود في هذا الفرع أو لا يمكنك إدارة دوره.' };
    }
    if (error instanceof Error && error.message === 'EMPLOYEE_OUTSIDE_MANAGED_BRANCHES') {
      return { error: 'الحساب مشترك مع فرع خارج نطاق إدارتك.' };
    }
    return { error: workforceError(error) };
  }
}

export async function saveOperationsTeamAction(
  formData: FormData,
): Promise<OperationsWorkforceActionResult> {
  const actor = await workforceActor();
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
  if (!(await canManageBranch(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة فرق هذا الفرع.' };
  }
  const managedBranches = await managedBranchSet(actor);

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

      const [branch, members, zones, services, baseZone, conflictingMember] = await Promise.all([
        tx.branch.findUnique({ where: { id: parsed.data.branchId }, select: { id: true } }),
        tx.user.findMany({
          where: {
            id: { in: parsed.data.memberIds },
            active: true,
            deletedAt: null,
            role: UserRole.EMPLOYEE,
            branchMemberships: { some: { branchId: parsed.data.branchId } },
          },
          select: { id: true, branchMemberships: { select: { branchId: true } } },
        }),
        tx.coverageZone.findMany({
          where: { id: { in: parsed.data.zoneIds }, branchId: parsed.data.branchId },
          select: { id: true },
        }),
        tx.service.findMany({
          where: { id: { in: parsed.data.serviceIds }, active: true },
          select: { id: true },
        }),
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
          select: { user: { select: { fullName: true } } },
        }),
      ]);
      if (!branch) throw new Error('BRANCH_NOT_FOUND');
      if (members.length !== parsed.data.memberIds.length) throw new Error('INVALID_TEAM_MEMBERS');
      if (members.some((member) => !isWorkforceAccountWithinManagedBranches(
        member.branchMemberships.map(({ branchId }) => branchId),
        managedBranches,
      ))) throw new Error('TEAM_MEMBER_OUTSIDE_MANAGED_BRANCHES');
      if (zones.length !== parsed.data.zoneIds.length) throw new Error('INVALID_TEAM_ZONES');
      if (services.length !== parsed.data.serviceIds.length) throw new Error('INVALID_TEAM_SERVICES');
      if (parsed.data.baseZoneId && !baseZone) throw new Error('INVALID_TEAM_BASE_ZONE');
      if (conflictingMember) throw new Error('TEAM_MEMBER_CONFLICT:' + conflictingMember.user.fullName);

      const data = {
        branchId: parsed.data.branchId,
        name: parsed.data.name,
        leaderId: parsed.data.leaderId || null,
        baseZoneId: parsed.data.baseZoneId || null,
        dailyCapacity: parsed.data.dailyCapacity,
        assignmentPriority: parsed.data.assignmentPriority,
        active: parsed.data.active,
      };
      const team = before
        ? await tx.team.update({ where: { id: before.id }, data })
        : await tx.team.create({ data });

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
        before ? 'OPERATIONS_TEAM_UPDATED' : 'OPERATIONS_TEAM_CREATED',
        'Team',
        team.id,
        before ? {
          name: before.name,
          leaderId: before.leaderId,
          baseZoneId: before.baseZoneId,
          dailyCapacity: before.dailyCapacity,
          assignmentPriority: before.assignmentPriority,
          active: before.active,
        } : undefined,
        {
          branchId: team.branchId,
          name: team.name,
          leaderId: team.leaderId,
          baseZoneId: team.baseZoneId,
          dailyCapacity: team.dailyCapacity,
          assignmentPriority: team.assignmentPriority,
          active: team.active,
          memberIds: parsed.data.memberIds,
          zoneIds: parsed.data.zoneIds,
          serviceIds: parsed.data.serviceIds,
        },
      );
      return team;
    }, transactionOptions);
    revalidateWorkforce();
    return { success: true, message: 'تم حفظ فريق ' + saved.name + ' وتحديث نطاق عمله.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_TEAM_BASE_ZONE') {
      return { error: 'منطقة انطلاق الفريق المحددة لا تتبع هذا الفرع.' };
    }
    if (error instanceof Error && error.message.startsWith('TEAM_MEMBER_CONFLICT:')) {
      return { error: 'الموظف ' + error.message.slice('TEAM_MEMBER_CONFLICT:'.length) + ' مرتبط بفريق آخر.' };
    }
    const messages: Record<string, string> = {
      TEAM_NOT_FOUND: 'الفريق غير موجود.',
      TEAM_BRANCH_MISMATCH: 'الفريق لا يتبع هذا الفرع.',
      BRANCH_NOT_FOUND: 'الفرع غير موجود.',
      INVALID_TEAM_MEMBERS: 'أحد الأعضاء غير نشط أو لا يتبع الفرع أو ليس Employee.',
      TEAM_MEMBER_OUTSIDE_MANAGED_BRANCHES: 'أحد الأعضاء مشترك مع فرع خارج نطاق إدارتك.',
      INVALID_TEAM_ZONES: 'إحدى الزونات لا تتبع الفرع.',
      INVALID_TEAM_SERVICES: 'إحدى الخدمات غير موجودة أو غير نشطة.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: workforceError(error) };
  }
}

export async function deactivateOperationsTeamAction(
  formData: FormData,
): Promise<OperationsWorkforceActionResult> {
  const actor = await workforceActor();
  const parsed = destructiveSchema.safeParse({
    entityId: formData.get('entityId'),
    branchId: formData.get('branchId'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات التعطيل غير صالحة.' };
  if (!(await canManageBranch(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة فرق هذا الفرع.' };
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
        'OPERATIONS_TEAM_DEACTIVATED',
        'Team',
        team.id,
        { active: team.active, branchId: team.branchId },
        { active: false },
        parsed.data.reason,
      );
    }, transactionOptions);
    revalidateWorkforce();
    return { success: true, message: 'تم إيقاف الفريق مع الاحتفاظ بسجله التشغيلي.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'TEAM_NOT_FOUND') return { error: 'الفريق غير موجود.' };
    return { error: workforceError(error) };
  }
}

export async function saveOperationsTeamHoursAction(
  formData: FormData,
): Promise<OperationsWorkforceActionResult> {
  const actor = await workforceActor();
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
  if (!(await canManageBranch(actor, team.branchId))) {
    return { error: 'غير مصرح لك بإدارة ساعات هذا الفريق.' };
  }

  try {
    await db.$transaction(async (tx) => {
      const before = await tx.teamWorkingHours.findUnique({
        where: { teamId_dayOfWeek: { teamId: parsed.data.teamId, dayOfWeek: parsed.data.dayOfWeek } },
      });
      const data = {
        isOff: parsed.data.isOff,
        openTime: parsed.data.openTime,
        closeTime: parsed.data.closeTime,
        breakStartTime: parsed.data.breakStartTime || null,
        breakEndTime: parsed.data.breakEndTime || null,
      };
      const saved = await tx.teamWorkingHours.upsert({
        where: { teamId_dayOfWeek: { teamId: parsed.data.teamId, dayOfWeek: parsed.data.dayOfWeek } },
        update: data,
        create: { teamId: parsed.data.teamId, dayOfWeek: parsed.data.dayOfWeek, ...data },
      });
      await writeAudit(
        tx,
        actor,
        'OPERATIONS_TEAM_HOURS_UPDATED',
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
    revalidateWorkforce();
    return { success: true, message: 'تم تحديث ساعات عمل الفريق.' };
  } catch (error) {
    return { error: workforceError(error) };
  }
}

export async function saveOperationsTimeOffAction(
  formData: FormData,
): Promise<OperationsWorkforceActionResult> {
  const actor = await workforceActor();
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
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات فترة الإجازة غير صالحة.' };
  if (!(await canManageBranch(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة إجازات هذا الفرع.' };
  }
  const managedBranches = await managedBranchSet(actor);

  try {
    await db.$transaction(async (tx) => {
      const branch = await tx.branch.findUnique({
        where: { id: parsed.data.branchId },
        select: { id: true, timezone: true },
      });
      if (!branch) throw new Error('BRANCH_NOT_FOUND');
      const startDate = localDateTimeToUtc(parsed.data.startDate, parsed.data.startTime, branch.timezone);
      const endDate = localDateTimeToUtc(parsed.data.endDate, parsed.data.endTime, branch.timezone);
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
        if (parsed.data.timeOffId && (!before || before.teamId !== team.id)) throw new Error('TIME_OFF_NOT_FOUND');
        if (overlap) throw new Error('TIME_OFF_OVERLAP');
        const saved = before
          ? await tx.teamTimeOff.update({
              where: { id: before.id },
              data: { startDate, endDate, reason: parsed.data.reason },
            })
          : await tx.teamTimeOff.create({
              data: { teamId: team.id, startDate, endDate, reason: parsed.data.reason },
            });
        await writeAudit(
          tx,
          actor,
          before ? 'OPERATIONS_TEAM_TIME_OFF_UPDATED' : 'OPERATIONS_TEAM_TIME_OFF_CREATED',
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
            role: { in: manageableRoles(actor) },
            branchMemberships: { some: { branchId: branch.id } },
          },
          select: {
            id: true,
            role: true,
            branchMemberships: { select: { branchId: true } },
          },
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
      if (!canManageWorkforceAccount(actor.role, employee.role)) {
        throw new Error('TIME_OFF_SUBJECT_NOT_FOUND');
      }
      if (!isWorkforceAccountWithinManagedBranches(
        employee.branchMemberships.map(({ branchId }) => branchId),
        managedBranches,
      )) throw new Error('EMPLOYEE_OUTSIDE_MANAGED_BRANCHES');
      if (parsed.data.timeOffId && (!before || before.userId !== employee.id)) throw new Error('TIME_OFF_NOT_FOUND');
      if (overlap) throw new Error('TIME_OFF_OVERLAP');
      const saved = before
        ? await tx.employeeTimeOff.update({
            where: { id: before.id },
            data: { startDate, endDate, reason: parsed.data.reason },
          })
        : await tx.employeeTimeOff.create({
            data: { userId: employee.id, startDate, endDate, reason: parsed.data.reason },
          });
      await writeAudit(
        tx,
        actor,
        before ? 'OPERATIONS_EMPLOYEE_TIME_OFF_UPDATED' : 'OPERATIONS_EMPLOYEE_TIME_OFF_CREATED',
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
    revalidateWorkforce();
    return { success: true, message: 'تم حفظ فترة الإجازة وتحديث الإتاحة.' };
  } catch (error) {
    const messages: Record<string, string> = {
      BRANCH_NOT_FOUND: 'الفرع غير موجود.',
      TIME_OFF_SUBJECT_NOT_FOUND: 'الفريق أو الموظف لا يتبع هذا الفرع.',
      TIME_OFF_NOT_FOUND: 'فترة الإجازة غير موجودة أو لا تتبع العنصر المحدد.',
      TIME_OFF_OVERLAP: 'توجد فترة إجازة متداخلة مع هذه المدة.',
      INVALID_TIME_OFF_RANGE: 'نهاية الإجازة يجب أن تكون بعد بدايتها.',
      EMPLOYEE_OUTSIDE_MANAGED_BRANCHES: 'الحساب مشترك مع فرع خارج نطاق إدارتك.',
    };
    if (error instanceof Error && messages[error.message]) return { error: messages[error.message] };
    return { error: workforceError(error) };
  }
}

export async function deleteOperationsTimeOffAction(
  formData: FormData,
): Promise<OperationsWorkforceActionResult> {
  const actor = await workforceActor();
  const parsed = timeOffDeleteSchema.safeParse({
    entityId: formData.get('entityId'),
    branchId: formData.get('branchId'),
    subjectType: formData.get('subjectType'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'بيانات حذف الإجازة غير صالحة.' };
  if (!(await canManageBranch(actor, parsed.data.branchId))) {
    return { error: 'غير مصرح لك بإدارة إجازات هذا الفرع.' };
  }
  const managedBranches = await managedBranchSet(actor);

  try {
    await db.$transaction(async (tx) => {
      if (parsed.data.subjectType === 'TEAM') {
        const timeOff = await tx.teamTimeOff.findFirst({
          where: { id: parsed.data.entityId, team: { branchId: parsed.data.branchId } },
        });
        if (!timeOff) throw new Error('TIME_OFF_NOT_FOUND');
        await tx.teamTimeOff.delete({ where: { id: timeOff.id } });
        await writeAudit(
          tx,
          actor,
          'OPERATIONS_TEAM_TIME_OFF_DELETED',
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
          user: {
            role: { in: manageableRoles(actor) },
            branchMemberships: { some: { branchId: parsed.data.branchId } },
          },
        },
        include: {
          user: {
            select: {
              role: true,
              branchMemberships: { select: { branchId: true } },
            },
          },
        },
      });
      if (!timeOff) throw new Error('TIME_OFF_NOT_FOUND');
      if (!canManageWorkforceAccount(actor.role, timeOff.user.role)) {
        throw new Error('TIME_OFF_NOT_FOUND');
      }
      if (!isWorkforceAccountWithinManagedBranches(
        timeOff.user.branchMemberships.map(({ branchId }) => branchId),
        managedBranches,
      )) throw new Error('EMPLOYEE_OUTSIDE_MANAGED_BRANCHES');
      await tx.employeeTimeOff.delete({ where: { id: timeOff.id } });
      await writeAudit(
        tx,
        actor,
        'OPERATIONS_EMPLOYEE_TIME_OFF_DELETED',
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
    revalidateWorkforce();
    return { success: true, message: 'تم حذف فترة الإجازة وتحديث الإتاحة.' };
  } catch (error) {
    if (error instanceof Error && error.message === 'TIME_OFF_NOT_FOUND') {
      return { error: 'فترة الإجازة غير موجودة أو لا تتبع هذا الفرع.' };
    }
    if (error instanceof Error && error.message === 'EMPLOYEE_OUTSIDE_MANAGED_BRANCHES') {
      return { error: 'الحساب مشترك مع فرع خارج نطاق إدارتك.' };
    }
    return { error: workforceError(error) };
  }
}
