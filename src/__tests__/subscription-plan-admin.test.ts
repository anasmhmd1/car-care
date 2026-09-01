import { BranchStatus, Prisma, UserRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  SubscriptionPlanAdminError,
  createManagedSubscriptionPlan,
  retireManagedSubscriptionPlan,
  updateManagedSubscriptionPlan,
} from '@/lib/engine/subscription-plan';
import {
  createSubscriptionPlanSchema,
  retireSubscriptionPlanFormValues,
  retireSubscriptionPlanSchema,
  updateSubscriptionPlanSchema,
} from '@/lib/validations/subscription-plan';

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_SERVICE_ID = '12121212-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_BRANCH_ID = '23232323-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';

const validPlanInput = {
  nameAr: 'باقة اللمعان الشهري',
  descriptionAr: 'أربع زيارات عناية دورية للسيارة.',
  price: '2400',
  validityDays: '30',
  visitCount: '4',
  allowedVehicleCount: '1',
  freezeAllowed: 'on',
  maxFreezeDays: '7',
  rules: '{"advanceBookingHours":24,"weekendsAllowed":true}',
  serviceIds: [SERVICE_ID, SERVICE_ID],
  branchIds: [BRANCH_ID],
  active: 'on',
  reason: 'إطلاق العرض الشهري',
};

describe('subscription plan validation', () => {
  it('coerces numeric inputs, parses rules JSON, and deduplicates relations', () => {
    const result = createSubscriptionPlanSchema.parse(validPlanInput);

    expect(result).toMatchObject({
      price: 2400,
      validityDays: 30,
      visitCount: 4,
      freezeAllowed: true,
      maxFreezeDays: 7,
      serviceIds: [SERVICE_ID],
      branchIds: [BRANCH_ID],
      rules: { advanceBookingHours: 24, weekendsAllowed: true },
    });
  });

  it('rejects malformed JSON and missing plan relations', () => {
    const result = createSubscriptionPlanSchema.safeParse({
      ...validPlanInput,
      rules: '["not-an-object"]',
      serviceIds: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
        'اختر عنصرًا واحدًا على الأقل.',
        'قواعد الخطة يجب أن تكون كائن JSON يبدأ بـ { وينتهي بـ }.',
      ]));
    }
  });

  it('requires a valid freeze window and a reason for destructive operations', () => {
    expect(createSubscriptionPlanSchema.safeParse({
      ...validPlanInput,
      validityDays: 10,
      maxFreezeDays: 11,
    }).success).toBe(false);

    expect(retireSubscriptionPlanSchema.safeParse({
      planId: PLAN_ID,
      mode: 'DELETE_UNLINKED',
      reason: '',
      confirmation: '',
    }).success).toBe(false);
  });

  it('supports per-service visit quotas when total quotas meet or exceed the plan total', () => {
    const distributed = createSubscriptionPlanSchema.parse({
      ...validPlanInput,
      serviceIds: [SERVICE_ID, SECOND_SERVICE_ID],
      serviceQuotas: [
        { serviceId: SERVICE_ID, visitQuota: '3' },
        { serviceId: SECOND_SERVICE_ID, visitQuota: '1' },
      ],
    });
    expect(distributed.serviceQuotas).toEqual([
      { serviceId: SERVICE_ID, visitQuota: 3 },
      { serviceId: SECOND_SERVICE_ID, visitQuota: 1 },
    ]);

    // Total quota exceeds plan visitCount (3 + 3 = 6 > 4) - valid as individual caps
    expect(createSubscriptionPlanSchema.safeParse({
      ...validPlanInput,
      serviceIds: [SERVICE_ID, SECOND_SERVICE_ID],
      serviceQuotas: [
        { serviceId: SERVICE_ID, visitQuota: '3' },
        { serviceId: SECOND_SERVICE_ID, visitQuota: '3' },
      ],
    }).success).toBe(true);

    // Total quota less than plan visitCount (2 + 1 = 3 < 4) - invalid
    expect(createSubscriptionPlanSchema.safeParse({
      ...validPlanInput,
      serviceIds: [SERVICE_ID, SECOND_SERVICE_ID],
      serviceQuotas: [
        { serviceId: SERVICE_ID, visitQuota: '2' },
        { serviceId: SECOND_SERVICE_ID, visitQuota: '1' },
      ],
    }).success).toBe(false);
  });

  it('accepts a deactivate form without a hard-delete confirmation field', () => {
    const formData = new FormData();
    formData.set('planId', PLAN_ID);
    formData.set('mode', 'DEACTIVATE');
    formData.set('reason', 'إيقاف البيع مؤقتًا');

    expect(retireSubscriptionPlanSchema.safeParse(
      retireSubscriptionPlanFormValues(formData),
    ).success).toBe(true);
  });
});

describe('subscription plan administration engine', () => {
  const actor = { userId: 'actor-1', role: UserRole.OWNER };

  it('creates the plan, its M:N relations, and audit on the same transaction client', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ pg_advisory_xact_lock: null }]);
    const planCreate = vi.fn().mockResolvedValue({ id: PLAN_ID });
    const auditCreate = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const tx = {
      $queryRaw: queryRaw,
      subscriptionPlan: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: planCreate,
      },
      service: {
        findMany: vi.fn().mockResolvedValue([
          { id: SERVICE_ID, active: true, subscriptionEligible: true },
        ]),
      },
      branch: {
        findMany: vi.fn().mockResolvedValue([
          { id: BRANCH_ID, status: BranchStatus.ACTIVE },
        ]),
      },
      auditLog: { create: auditCreate },
    } as unknown as Prisma.TransactionClient;
    const input = createSubscriptionPlanSchema.parse(validPlanInput);

    await expect(createManagedSubscriptionPlan(tx, actor, input)).resolves.toEqual({ id: PLAN_ID });
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(planCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nameAr: input.nameAr,
        services: { create: [{ serviceId: SERVICE_ID }] },
        branches: { create: [{ branchId: BRANCH_ID }] },
      }),
      select: { id: true },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: actor.userId,
        action: 'SUBSCRIPTION_PLAN_CREATED',
        entityType: 'SubscriptionPlan',
        entityId: PLAN_ID,
      }),
    });
  });

  it('deactivates a used plan without deleting customer history', async () => {
    const update = vi.fn().mockResolvedValue({ id: PLAN_ID });
    const remove = vi.fn();
    const auditCreate = vi.fn().mockResolvedValue({ id: 'audit-2' });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      subscriptionPlan: {
        findUnique: vi.fn().mockResolvedValue({
          id: PLAN_ID,
          nameAr: 'باقة مستخدمة',
          price: 1000,
          active: true,
          services: [{ serviceId: SERVICE_ID }],
          branches: [{ branchId: BRANCH_ID }],
          _count: { subscriptions: 3 },
        }),
        update,
        delete: remove,
      },
      auditLog: { create: auditCreate },
    } as unknown as Prisma.TransactionClient;
    const input = retireSubscriptionPlanSchema.parse({
      planId: PLAN_ID,
      mode: 'DEACTIVATE',
      reason: 'إيقاف البيع الجديد',
    });

    await expect(retireManagedSubscriptionPlan(tx, actor, input)).resolves.toEqual({
      planId: PLAN_ID,
      deleted: false,
    });
    expect(update).toHaveBeenCalledWith({ where: { id: PLAN_ID }, data: { active: false } });
    expect(remove).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'SUBSCRIPTION_PLAN_DEACTIVATED' }),
    });
  });

  it('replaces service and branch links atomically and records before/after audit', async () => {
    const planUpdate = vi.fn().mockResolvedValue({ id: PLAN_ID });
    const auditCreate = vi.fn().mockResolvedValue({ id: 'audit-update' });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      subscriptionPlan: {
        findUnique: vi.fn().mockResolvedValue({
          id: PLAN_ID,
          nameAr: 'باقة قديمة',
          descriptionAr: 'وصف قديم',
          price: 1200,
          validityDays: 20,
          visitCount: 2,
          allowedVehicleCount: 1,
          freezeAllowed: false,
          maxFreezeDays: 0,
          rules: null,
          active: false,
          services: [{ serviceId: '44444444-4444-4444-8444-444444444444' }],
          branches: [{ branchId: '55555555-5555-4555-8555-555555555555' }],
          _count: { subscriptions: 0 },
        }),
        findFirst: vi.fn().mockResolvedValue(null),
        update: planUpdate,
      },
      service: {
        findMany: vi.fn().mockResolvedValue([
          { id: SERVICE_ID, active: true, subscriptionEligible: true },
        ]),
      },
      branch: {
        findMany: vi.fn().mockResolvedValue([
          { id: BRANCH_ID, status: BranchStatus.ACTIVE },
        ]),
      },
      auditLog: { create: auditCreate },
    } as unknown as Prisma.TransactionClient;
    const input = updateSubscriptionPlanSchema.parse({
      ...validPlanInput,
      planId: PLAN_ID,
      reason: 'تحديث نطاق الباقة',
    });

    await expect(updateManagedSubscriptionPlan(tx, actor, input)).resolves.toEqual({ id: PLAN_ID });
    expect(planUpdate).toHaveBeenCalledWith({
      where: { id: PLAN_ID },
      data: expect.objectContaining({
        services: { deleteMany: {}, create: [{ serviceId: SERVICE_ID }] },
        branches: { deleteMany: {}, create: [{ branchId: BRANCH_ID }] },
      }),
      select: { id: true },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'SUBSCRIPTION_PLAN_UPDATED',
        beforeJson: expect.objectContaining({ nameAr: 'باقة قديمة' }),
        afterJson: expect.objectContaining({ nameAr: input.nameAr }),
      }),
    });
  });

  it('locks commercial terms and reactivation after customers have subscribed', async () => {
    const planUpdate = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      subscriptionPlan: {
        findUnique: vi.fn().mockResolvedValue({
          id: PLAN_ID,
          nameAr: validPlanInput.nameAr,
          descriptionAr: validPlanInput.descriptionAr,
          price: 2400,
          validityDays: 30,
          visitCount: 4,
          allowedVehicleCount: 1,
          freezeAllowed: true,
          maxFreezeDays: 7,
          rules: { advanceBookingHours: 24, weekendsAllowed: true },
          active: true,
          services: [{ serviceId: SERVICE_ID, visitQuota: null }],
          branches: [{ branchId: BRANCH_ID }],
          _count: { subscriptions: 1 },
        }),
        update: planUpdate,
      },
      auditLog: { create: vi.fn() },
    } as unknown as Prisma.TransactionClient;
    const changedPrice = updateSubscriptionPlanSchema.parse({
      ...validPlanInput,
      planId: PLAN_ID,
      price: '2500',
    });

    await expect(updateManagedSubscriptionPlan(tx, actor, changedPrice)).rejects.toMatchObject({
      name: SubscriptionPlanAdminError.name,
      code: 'PLAN_TERMS_LOCKED_AFTER_SUBSCRIPTION',
    });
    expect(planUpdate).not.toHaveBeenCalled();

    const changedServiceScope = updateSubscriptionPlanSchema.parse({
      ...validPlanInput,
      planId: PLAN_ID,
      serviceIds: [SECOND_SERVICE_ID],
    });
    await expect(updateManagedSubscriptionPlan(tx, actor, changedServiceScope)).rejects.toMatchObject({
      name: SubscriptionPlanAdminError.name,
      code: 'PLAN_TERMS_LOCKED_AFTER_SUBSCRIPTION',
    });
    expect(planUpdate).not.toHaveBeenCalled();

    const changedBranchScope = updateSubscriptionPlanSchema.parse({
      ...validPlanInput,
      planId: PLAN_ID,
      branchIds: [SECOND_BRANCH_ID],
    });
    await expect(updateManagedSubscriptionPlan(tx, actor, changedBranchScope)).rejects.toMatchObject({
      name: SubscriptionPlanAdminError.name,
      code: 'PLAN_TERMS_LOCKED_AFTER_SUBSCRIPTION',
    });
    expect(planUpdate).not.toHaveBeenCalled();

    const inactiveUsedPlan = {
      id: PLAN_ID,
      nameAr: validPlanInput.nameAr,
      descriptionAr: validPlanInput.descriptionAr,
      price: 2400,
      validityDays: 30,
      visitCount: 4,
      allowedVehicleCount: 1,
      freezeAllowed: true,
      maxFreezeDays: 7,
      rules: { advanceBookingHours: 24, weekendsAllowed: true },
      active: false,
      services: [{ serviceId: SERVICE_ID, visitQuota: null }],
      branches: [{ branchId: BRANCH_ID }],
      _count: { subscriptions: 1 },
    };
    (tx.subscriptionPlan.findUnique as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(inactiveUsedPlan);

    const reactivation = updateSubscriptionPlanSchema.parse({
      ...validPlanInput,
      planId: PLAN_ID,
    });
    await expect(updateManagedSubscriptionPlan(tx, actor, reactivation)).rejects.toMatchObject({
      name: SubscriptionPlanAdminError.name,
      code: 'PLAN_TERMS_LOCKED_AFTER_SUBSCRIPTION',
    });
    expect(planUpdate).not.toHaveBeenCalled();
  });

  it('allows cosmetic changes and deactivation for a plan with subscriptions without rewriting its terms', async () => {
    const planUpdate = vi.fn().mockResolvedValue({ id: PLAN_ID });
    const auditCreate = vi.fn().mockResolvedValue({ id: 'audit-locked-update' });
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      subscriptionPlan: {
        findUnique: vi.fn().mockResolvedValue({
          id: PLAN_ID,
          nameAr: validPlanInput.nameAr,
          descriptionAr: validPlanInput.descriptionAr,
          price: 2400,
          validityDays: 30,
          visitCount: 4,
          allowedVehicleCount: 1,
          freezeAllowed: true,
          maxFreezeDays: 7,
          rules: { advanceBookingHours: 24, weekendsAllowed: true },
          active: true,
          services: [{ serviceId: SERVICE_ID, visitQuota: null }],
          branches: [{ branchId: BRANCH_ID }],
          _count: { subscriptions: 2 },
        }),
        findFirst: vi.fn().mockResolvedValue(null),
        update: planUpdate,
      },
      auditLog: { create: auditCreate },
    } as unknown as Prisma.TransactionClient;
    const input = updateSubscriptionPlanSchema.parse({
      ...validPlanInput,
      planId: PLAN_ID,
      nameAr: 'باقة اللمعان المحفوظة',
      descriptionAr: 'اسم ووصف جديدان من دون المساس بحقوق المشتركين.',
      active: '',
    });

    await expect(updateManagedSubscriptionPlan(tx, actor, input)).resolves.toEqual({ id: PLAN_ID });
    expect(planUpdate).toHaveBeenCalledWith({
      where: { id: PLAN_ID },
      data: {
        nameAr: input.nameAr,
        descriptionAr: input.descriptionAr,
        active: false,
      },
      select: { id: true },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'SUBSCRIPTION_PLAN_UPDATED',
        beforeJson: expect.objectContaining({ price: 2400 }),
        afterJson: expect.objectContaining({ active: false }),
      }),
    });
  });

  it('blocks hard deletion whenever a plan has subscription records', async () => {
    const remove = vi.fn();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      subscriptionPlan: {
        findUnique: vi.fn().mockResolvedValue({
          id: PLAN_ID,
          nameAr: 'باقة محفوظة',
          price: 1000,
          active: false,
          services: [{ serviceId: SERVICE_ID }],
          branches: [{ branchId: BRANCH_ID }],
          _count: { subscriptions: 1 },
        }),
        delete: remove,
      },
      auditLog: { create: vi.fn() },
    } as unknown as Prisma.TransactionClient;
    const input = retireSubscriptionPlanSchema.parse({
      planId: PLAN_ID,
      mode: 'DELETE_UNLINKED',
      reason: 'تنظيف خطة تجريبية',
      confirmation: 'باقة محفوظة',
    });

    await expect(retireManagedSubscriptionPlan(tx, actor, input)).rejects.toMatchObject({
      name: SubscriptionPlanAdminError.name,
      code: 'PLAN_HAS_SUBSCRIPTIONS',
    });
    expect(remove).not.toHaveBeenCalled();
  });
});
