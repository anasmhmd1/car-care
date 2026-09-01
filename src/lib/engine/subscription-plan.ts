import {
  BranchStatus,
  Prisma,
  type UserRole,
} from '@prisma/client';
import type {
  CreateSubscriptionPlanInput,
  RetireSubscriptionPlanInput,
  SubscriptionPlanRules,
  UpdateSubscriptionPlanInput,
} from '@/lib/validations/subscription-plan';

export class SubscriptionPlanAdminError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'SubscriptionPlanAdminError';
  }
}

export interface SubscriptionPlanAdminActor {
  userId: string;
  role: UserRole;
}

type PlanInput = CreateSubscriptionPlanInput | UpdateSubscriptionPlanInput;

const PLAN_LOCK = Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('bareeq:subscription-plans'))`;

function rulesForDatabase(
  rules: SubscriptionPlanRules | null,
): Prisma.InputJsonObject | Prisma.NullTypes.DbNull {
  return rules === null
    ? Prisma.DbNull
    : rules as Prisma.InputJsonObject;
}

async function lockPlanCatalog(tx: Prisma.TransactionClient): Promise<void> {
  if (typeof tx.$executeRaw === 'function') {
    await tx.$executeRaw(PLAN_LOCK);
    return;
  }
  await tx.$queryRaw(PLAN_LOCK);
}

async function ensureUniqueName(
  tx: Prisma.TransactionClient,
  nameAr: string,
  exceptPlanId?: string,
): Promise<void> {
  const duplicate = await tx.subscriptionPlan.findFirst({
    where: {
      nameAr: { equals: nameAr, mode: 'insensitive' },
      ...(exceptPlanId ? { id: { not: exceptPlanId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new SubscriptionPlanAdminError(
      'يوجد بالفعل اشتراك باسم مطابق. استخدم اسمًا مميزًا.',
      'DUPLICATE_PLAN_NAME',
    );
  }
}

async function validatePlanRelations(
  tx: Prisma.TransactionClient,
  input: PlanInput,
): Promise<void> {
  const [services, branches] = await Promise.all([
    tx.service.findMany({
      where: { id: { in: input.serviceIds } },
      select: { id: true, active: true, subscriptionEligible: true },
    }),
    tx.branch.findMany({
      where: { id: { in: input.branchIds } },
      select: { id: true, status: true },
    }),
  ]);

  if (services.length !== input.serviceIds.length) {
    throw new SubscriptionPlanAdminError(
      'إحدى الخدمات المحددة لم تعد موجودة.',
      'PLAN_SERVICE_NOT_FOUND',
    );
  }
  if (services.some((service) => !service.subscriptionEligible)) {
    throw new SubscriptionPlanAdminError(
      'إحدى الخدمات المحددة غير مؤهلة للاشتراكات.',
      'PLAN_SERVICE_NOT_ELIGIBLE',
    );
  }
  if (input.active && services.some((service) => !service.active)) {
    throw new SubscriptionPlanAdminError(
      'لا يمكن نشر خطة نشطة تحتوي خدمة متوقفة.',
      'PLAN_HAS_INACTIVE_SERVICE',
    );
  }
  if (branches.length !== input.branchIds.length) {
    throw new SubscriptionPlanAdminError(
      'أحد الفروع المحددة لم يعد موجودًا.',
      'PLAN_BRANCH_NOT_FOUND',
    );
  }
  if (input.active && branches.some((branch) => branch.status !== BranchStatus.ACTIVE)) {
    throw new SubscriptionPlanAdminError(
      'لا يمكن نشر خطة نشطة في فرع غير نشط.',
      'PLAN_HAS_INACTIVE_BRANCH',
    );
  }
}

function inputSnapshot(input: PlanInput): Prisma.InputJsonObject {
  return {
    nameAr: input.nameAr,
    descriptionAr: input.descriptionAr,
    price: input.price,
    validityDays: input.validityDays,
    visitCount: input.visitCount,
    allowedVehicleCount: input.allowedVehicleCount,
    freezeAllowed: input.freezeAllowed,
    maxFreezeDays: input.maxFreezeDays,
    rules: input.rules,
    active: input.active,
    serviceIds: input.serviceIds,
    serviceQuotas: input.serviceQuotas,
    branchIds: input.branchIds,
  };
}

type ExistingPlanTerms = {
  price: number;
  validityDays: number;
  visitCount: number;
  allowedVehicleCount: number;
  freezeAllowed: boolean;
  maxFreezeDays: number;
  rules: Prisma.JsonValue | null;
  services: Array<{ serviceId: string; visitQuota: number | null }>;
  branches: Array<{ branchId: string }>;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableJson(nestedValue)}`)
    .join(',')}}`;
}

function sameIdSet(existing: readonly string[], next: readonly string[]): boolean {
  return existing.length === next.length && existing.every((id) => next.includes(id));
}

function sameServiceQuotas(
  existing: ExistingPlanTerms['services'],
  next: UpdateSubscriptionPlanInput['serviceQuotas'],
): boolean {
  return existing.length === next.length && existing.every(({ serviceId, visitQuota }) => (
    next.some((item) => item.serviceId === serviceId && item.visitQuota === visitQuota)
  ));
}

function hasSameCommercialTerms(
  existing: ExistingPlanTerms,
  input: UpdateSubscriptionPlanInput,
): boolean {
  return (
    existing.price === input.price
    && existing.validityDays === input.validityDays
    && existing.visitCount === input.visitCount
    && existing.allowedVehicleCount === input.allowedVehicleCount
    && existing.freezeAllowed === input.freezeAllowed
    && existing.maxFreezeDays === input.maxFreezeDays
    && stableJson(existing.rules) === stableJson(input.rules)
    && sameServiceQuotas(existing.services, input.serviceQuotas)
    && sameIdSet(existing.branches.map(({ branchId }) => branchId), input.branchIds)
  );
}

function termsLockedAfterSubscriptionError(): SubscriptionPlanAdminError {
  return new SubscriptionPlanAdminError(
    'هذه الخطة مرتبطة باشتراكات قائمة؛ لحماية حقوق العملاء لا يمكن تغيير السعر أو الصلاحية أو الزيارات أو السيارات أو التجميد أو القواعد أو الخدمات أو الفروع. يمكنك تعديل الاسم والوصف أو تعطيل البيع فقط، وأنشئ خطة جديدة لأي عرض مختلف.',
    'PLAN_TERMS_LOCKED_AFTER_SUBSCRIPTION',
  );
}

export async function createManagedSubscriptionPlan(
  tx: Prisma.TransactionClient,
  actor: SubscriptionPlanAdminActor,
  input: CreateSubscriptionPlanInput,
) {
  await lockPlanCatalog(tx);
  await ensureUniqueName(tx, input.nameAr);
  await validatePlanRelations(tx, input);

  const plan = await tx.subscriptionPlan.create({
    data: {
      nameAr: input.nameAr,
      descriptionAr: input.descriptionAr,
      price: input.price,
      validityDays: input.validityDays,
      visitCount: input.visitCount,
      allowedVehicleCount: input.allowedVehicleCount,
      freezeAllowed: input.freezeAllowed,
      maxFreezeDays: input.maxFreezeDays,
      rules: rulesForDatabase(input.rules),
      active: input.active,
      services: {
        create: input.serviceQuotas.map(({ serviceId, visitQuota }) => (
          visitQuota === null ? { serviceId } : { serviceId, visitQuota }
        )),
      },
      branches: {
        create: input.branchIds.map((branchId) => ({ branchId })),
      },
    },
    select: { id: true },
  });

  await tx.auditLog.create({
    data: {
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: 'SUBSCRIPTION_PLAN_CREATED',
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      afterJson: inputSnapshot(input),
      reason: input.reason,
    },
  });

  return plan;
}

export async function updateManagedSubscriptionPlan(
  tx: Prisma.TransactionClient,
  actor: SubscriptionPlanAdminActor,
  input: UpdateSubscriptionPlanInput,
) {
  await lockPlanCatalog(tx);
  const existing = await tx.subscriptionPlan.findUnique({
    where: { id: input.planId },
    include: {
      services: { select: { serviceId: true, visitQuota: true } },
      branches: { select: { branchId: true } },
      _count: { select: { subscriptions: true } },
    },
  });
  if (!existing) {
    throw new SubscriptionPlanAdminError('خطة الاشتراك غير موجودة.', 'PLAN_NOT_FOUND');
  }

  const beforeJson: Prisma.InputJsonObject = {
    nameAr: existing.nameAr,
    descriptionAr: existing.descriptionAr,
    price: existing.price,
    validityDays: existing.validityDays,
    visitCount: existing.visitCount,
    allowedVehicleCount: existing.allowedVehicleCount,
    freezeAllowed: existing.freezeAllowed,
    maxFreezeDays: existing.maxFreezeDays,
    rules: existing.rules,
    active: existing.active,
    serviceIds: existing.services.map(({ serviceId }) => serviceId),
    serviceQuotas: existing.services.map(({ serviceId, visitQuota }) => ({ serviceId, visitQuota })),
    branchIds: existing.branches.map(({ branchId }) => branchId),
  };

  const hasSubscriptions = existing._count.subscriptions > 0;
  if (
    hasSubscriptions
    && (
      !hasSameCommercialTerms(existing, input)
      || (!existing.active && input.active)
    )
  ) {
    throw termsLockedAfterSubscriptionError();
  }

  await ensureUniqueName(tx, input.nameAr, input.planId);
  if (!hasSubscriptions) {
    await validatePlanRelations(tx, input);
  }

  const plan = hasSubscriptions
    ? await tx.subscriptionPlan.update({
      where: { id: input.planId },
      data: {
        nameAr: input.nameAr,
        descriptionAr: input.descriptionAr,
        active: input.active,
      },
      select: { id: true },
    })
    : await tx.subscriptionPlan.update({
      where: { id: input.planId },
      data: {
        nameAr: input.nameAr,
        descriptionAr: input.descriptionAr,
        price: input.price,
        validityDays: input.validityDays,
        visitCount: input.visitCount,
        allowedVehicleCount: input.allowedVehicleCount,
        freezeAllowed: input.freezeAllowed,
        maxFreezeDays: input.maxFreezeDays,
        rules: rulesForDatabase(input.rules),
        active: input.active,
        services: {
          deleteMany: {},
          create: input.serviceQuotas.map(({ serviceId, visitQuota }) => (
            visitQuota === null ? { serviceId } : { serviceId, visitQuota }
          )),
        },
        branches: {
          deleteMany: {},
          create: input.branchIds.map((branchId) => ({ branchId })),
        },
      },
      select: { id: true },
    });

  await tx.auditLog.create({
    data: {
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: 'SUBSCRIPTION_PLAN_UPDATED',
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      beforeJson,
      afterJson: inputSnapshot(input),
      reason: input.reason,
    },
  });

  return plan;
}

export async function retireManagedSubscriptionPlan(
  tx: Prisma.TransactionClient,
  actor: SubscriptionPlanAdminActor,
  input: RetireSubscriptionPlanInput,
): Promise<{ planId: string; deleted: boolean }> {
  await lockPlanCatalog(tx);
  const existing = await tx.subscriptionPlan.findUnique({
    where: { id: input.planId },
    include: {
      services: { select: { serviceId: true } },
      branches: { select: { branchId: true } },
      _count: { select: { subscriptions: true } },
    },
  });
  if (!existing) {
    throw new SubscriptionPlanAdminError('خطة الاشتراك غير موجودة.', 'PLAN_NOT_FOUND');
  }

  const beforeJson: Prisma.InputJsonObject = {
    nameAr: existing.nameAr,
    price: existing.price,
    active: existing.active,
    subscriptionCount: existing._count.subscriptions,
    serviceIds: existing.services.map(({ serviceId }) => serviceId),
    branchIds: existing.branches.map(({ branchId }) => branchId),
  };

  if (input.mode === 'DEACTIVATE') {
    if (existing.active) {
      await tx.subscriptionPlan.update({
        where: { id: existing.id },
        data: { active: false },
      });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'SUBSCRIPTION_PLAN_DEACTIVATED',
        entityType: 'SubscriptionPlan',
        entityId: existing.id,
        beforeJson,
        afterJson: { ...beforeJson, active: false },
        reason: input.reason,
      },
    });
    return { planId: existing.id, deleted: false };
  }

  if (existing.active) {
    throw new SubscriptionPlanAdminError(
      'عطّل الخطة أولًا قبل طلب حذفها النهائي.',
      'ACTIVE_PLAN_DELETE_FORBIDDEN',
    );
  }
  if (existing._count.subscriptions > 0) {
    throw new SubscriptionPlanAdminError(
      'لا يمكن حذف خطة مرتبطة باشتراكات. يمكن إبقاؤها معطلة فقط.',
      'PLAN_HAS_SUBSCRIPTIONS',
    );
  }
  if (input.confirmation !== existing.nameAr) {
    throw new SubscriptionPlanAdminError(
      'اسم الخطة المكتوب لا يطابق اسمها الحالي.',
      'DELETE_CONFIRMATION_MISMATCH',
    );
  }

  await tx.auditLog.create({
    data: {
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: 'SUBSCRIPTION_PLAN_DELETED',
      entityType: 'SubscriptionPlan',
      entityId: existing.id,
      beforeJson,
      reason: input.reason,
    },
  });
  await tx.subscriptionPlan.delete({ where: { id: existing.id } });

  return { planId: existing.id, deleted: true };
}
