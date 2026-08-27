import {
  BookingStatus,
  BranchStatus,
  Prisma,
  SubscriptionPaymentProofStatus,
  SubscriptionStatus,
  UserRole,
  VisitLedgerAction,
  type CustomerSubscription,
} from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;
const CANCELLATION_TERMINAL_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.CANCELLED,
  BookingStatus.REJECTED,
  BookingStatus.EXPIRED,
  BookingStatus.SERVICE_COMPLETED,
  BookingStatus.DELIVERED,
  BookingStatus.CLOSED,
];

export class SubscriptionEngineError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'SubscriptionEngineError';
  }
}

export type ManualVisitAdjustment = 'ADD' | 'DEDUCT' | 'RESTORE';
export type SubscriptionPaymentReviewDecision = 'APPROVE' | 'REJECT' | 'REUPLOAD' | 'DUPLICATE';

export interface SubscriptionActor {
  userId: string;
  role: UserRole;
}

interface IdempotentCommand extends SubscriptionActor {
  idempotencyKey: string;
  reason: string;
  now?: Date;
}

export interface PurchaseSubscriptionInput extends IdempotentCommand {
  customerId: string;
  planId: string;
  vehicleIds: string[];
}

export interface SubscriptionCommandInput extends IdempotentCommand {
  subscriptionId: string;
}

export interface FreezeSubscriptionInput extends SubscriptionCommandInput {
  freezeDays: number;
}

export interface ExtendSubscriptionInput extends SubscriptionCommandInput {
  extensionDays: number;
}

export interface AdjustSubscriptionVisitsInput extends SubscriptionCommandInput {
  adjustment: ManualVisitAdjustment;
  amount: number;
  serviceId?: string;
}

export interface BookingSubscriptionInput extends SubscriptionActor {
  bookingId: string;
  reason?: string;
  now?: Date;
}

export interface VisitBalance {
  totalVisits: number;
  usedVisits: number;
  remainingVisits: number;
}

async function lockSubscriptionBalance(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription-balance:${subscriptionId}`}))`;
}

async function findSubscriptionServiceBalance(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
  serviceId: string,
) {
  // Focused legacy engine tests intentionally mock only existing delegates.
  // The production client always exposes this relation after migration.
  const delegate = (tx as unknown as {
    customerSubscriptionServiceBalance?: Pick<
      Prisma.TransactionClient['customerSubscriptionServiceBalance'],
      'findUnique'
    >;
  }).customerSubscriptionServiceBalance;
  if (!delegate) return null;
  return delegate.findUnique({
    where: { subscriptionId_serviceId: { subscriptionId, serviceId } },
  });
}

export function decideSubscriptionPaymentProofStatus(
  decision: SubscriptionPaymentReviewDecision,
  amountSubmitted: number,
  expectedAmount: number,
): SubscriptionPaymentProofStatus {
  if (decision === 'APPROVE') {
    return amountSubmitted === expectedAmount
      ? SubscriptionPaymentProofStatus.APPROVED
      : SubscriptionPaymentProofStatus.AMOUNT_MISMATCH;
  }
  if (decision === 'REJECT') return SubscriptionPaymentProofStatus.REJECTED;
  if (decision === 'DUPLICATE') return SubscriptionPaymentProofStatus.DUPLICATE_SUSPECTED;
  return SubscriptionPaymentProofStatus.REUPLOAD_REQUIRED;
}

function normalizeReason(reason: string): string {
  const normalized = reason.trim().slice(0, 1000);
  if (normalized.length < 3) {
    throw new SubscriptionEngineError('يجب تسجيل سبب واضح للعملية.', 'REASON_REQUIRED');
  }
  return normalized;
}

function normalizeIdempotencyKey(key: string): string {
  const normalized = key.trim().slice(0, 200);
  if (!normalized) {
    throw new SubscriptionEngineError('مفتاح تكرار العملية مطلوب.', 'IDEMPOTENCY_KEY_REQUIRED');
  }
  return normalized;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function requirePositiveInteger(value: number, field: string, max = 3650): number {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new SubscriptionEngineError(`${field} غير صالح.`, 'INVALID_POSITIVE_INTEGER');
  }
  return value;
}

function assertBalanceInvariant(balance: VisitBalance): void {
  if (
    balance.totalVisits < 0 ||
    balance.usedVisits < 0 ||
    balance.remainingVisits < 0 ||
    balance.usedVisits + balance.remainingVisits !== balance.totalVisits
  ) {
    throw new SubscriptionEngineError('رصيد زيارات الاشتراك غير متسق.', 'BALANCE_INVARIANT_VIOLATION');
  }
}

export function calculateManualVisitAdjustment(
  balance: VisitBalance,
  adjustment: ManualVisitAdjustment,
  amount: number,
): VisitBalance & { visitChange: number } {
  assertBalanceInvariant(balance);
  requirePositiveInteger(amount, 'عدد الزيارات', 10_000);

  switch (adjustment) {
    case 'ADD':
      return {
        totalVisits: balance.totalVisits + amount,
        usedVisits: balance.usedVisits,
        remainingVisits: balance.remainingVisits + amount,
        visitChange: amount,
      };
    case 'DEDUCT':
      if (balance.remainingVisits < amount) {
        throw new SubscriptionEngineError('لا يوجد رصيد كافٍ لخصم الزيارات.', 'INSUFFICIENT_VISITS');
      }
      return {
        totalVisits: balance.totalVisits,
        usedVisits: balance.usedVisits + amount,
        remainingVisits: balance.remainingVisits - amount,
        visitChange: -amount,
      };
    case 'RESTORE':
      if (balance.usedVisits < amount) {
        throw new SubscriptionEngineError('لا يمكن إعادة زيارات أكثر من المستهلك.', 'RESTORE_EXCEEDS_USED');
      }
      return {
        totalVisits: balance.totalVisits,
        usedVisits: balance.usedVisits - amount,
        remainingVisits: balance.remainingVisits + amount,
        visitChange: amount,
      };
  }
}

export function getEffectiveSubscriptionStatus(
  subscription: Pick<CustomerSubscription, 'status' | 'endDate'>,
  now: Date = new Date(),
): SubscriptionStatus {
  if (
    subscription.status === SubscriptionStatus.ACTIVE
    && subscription.endDate.getTime() <= now.getTime()
  ) {
    return SubscriptionStatus.EXPIRED;
  }
  return subscription.status;
}

function statusAfterBalanceChange(
  subscription: Pick<CustomerSubscription, 'status' | 'endDate'>,
  remainingVisits: number,
  now: Date,
): SubscriptionStatus {
  if (subscription.status === SubscriptionStatus.CANCELLED) return SubscriptionStatus.CANCELLED;
  if (remainingVisits === 0) return SubscriptionStatus.COMPLETED;
  if (subscription.status === SubscriptionStatus.FROZEN) return SubscriptionStatus.FROZEN;
  if (subscription.endDate.getTime() <= now.getTime()) return SubscriptionStatus.EXPIRED;
  return SubscriptionStatus.ACTIVE;
}

async function findAppliedCommand(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
  idempotencyKey: string,
  operation: string,
) {
  const existing = await tx.subscriptionVisitLedger.findUnique({
    where: { idempotencyKey },
  });
  if (existing && existing.subscriptionId !== subscriptionId) {
    throw new SubscriptionEngineError('مفتاح العملية مستخدم لاشتراك آخر.', 'IDEMPOTENCY_KEY_CONFLICT');
  }
  if (
    existing &&
    (
      existing.action !== VisitLedgerAction.MANUAL_ADJUSTMENT ||
      !existing.reason?.startsWith(`[${operation}]`)
    )
  ) {
    throw new SubscriptionEngineError('مفتاح العملية مستخدم لإجراء مختلف.', 'IDEMPOTENCY_KEY_CONFLICT');
  }
  return existing;
}

async function writeLifecycleLedger(
  tx: Prisma.TransactionClient,
  input: SubscriptionCommandInput,
  subscription: Pick<CustomerSubscription, 'remainingVisits'>,
  operation: string,
) {
  return tx.subscriptionVisitLedger.create({
    data: {
      subscriptionId: input.subscriptionId,
      action: VisitLedgerAction.MANUAL_ADJUSTMENT,
      visitChange: 0,
      balanceBefore: subscription.remainingVisits,
      remainingAfter: subscription.remainingVisits,
      idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
      reason: `[${operation}] ${normalizeReason(input.reason)}`,
      adjustedByUserId: input.userId,
    },
  });
}

async function writeSubscriptionAudit(
  tx: Prisma.TransactionClient,
  input: {
    actor: SubscriptionActor;
    action: string;
    subscriptionId: string;
    reason: string;
    beforeJson?: Prisma.InputJsonValue;
    afterJson?: Prisma.InputJsonValue;
  },
) {
  return tx.auditLog.create({
    data: {
      actorUserId: input.actor.userId,
      actorRole: input.actor.role,
      action: input.action,
      entityType: 'CustomerSubscription',
      entityId: input.subscriptionId,
      beforeJson: input.beforeJson,
      afterJson: input.afterJson,
      reason: input.reason,
    },
  });
}

export async function purchaseCustomerSubscription(
  tx: Prisma.TransactionClient,
  input: PurchaseSubscriptionInput,
) {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const reason = normalizeReason(input.reason);
  const now = input.now ?? new Date();

  const existingPurchase = await tx.subscriptionVisitLedger.findUnique({
    where: { idempotencyKey },
    include: { subscription: true },
  });
  if (existingPurchase) {
    if (
      existingPurchase.action !== VisitLedgerAction.PURCHASE ||
      existingPurchase.subscription.customerId !== input.customerId
    ) {
      throw new SubscriptionEngineError('مفتاح طلب الشراء مستخدم لعملية أخرى.', 'IDEMPOTENCY_KEY_CONFLICT');
    }
    return existingPurchase.subscription;
  }

  const [customer, plan] = await Promise.all([
    tx.customerProfile.findUnique({ where: { id: input.customerId }, select: { id: true } }),
    tx.subscriptionPlan.findFirst({
      where: { id: input.planId, active: true },
      include: {
        branches: {
          select: {
            branchId: true,
            branch: { select: { status: true } },
          },
        },
        services: { select: { serviceId: true, visitQuota: true } },
      },
    }),
  ]);

  if (!customer) throw new SubscriptionEngineError('حساب العميل غير موجود.', 'CUSTOMER_NOT_FOUND');
  if (!plan) throw new SubscriptionEngineError('خطة الاشتراك غير متاحة.', 'PLAN_NOT_AVAILABLE');
  if (plan.services.length === 0) {
    throw new SubscriptionEngineError('الخطة لا تحتوي خدمات صالحة.', 'PLAN_HAS_NO_SERVICES');
  }
  const hasDedicatedServiceBalances = plan.services.some(({ visitQuota }) => visitQuota != null);
  if (hasDedicatedServiceBalances) {
    const hasMissingQuota = plan.services.some(({ visitQuota }) => visitQuota == null);
    const quotaTotal = plan.services.reduce((total, item) => total + (item.visitQuota ?? 0), 0);
    if (hasMissingQuota || quotaTotal !== plan.visitCount) {
      throw new SubscriptionEngineError(
        'توزيع أرصدة خدمات الباقة غير متسق؛ راجع إعدادات الباقة قبل البيع.',
        'INVALID_SERVICE_QUOTAS',
      );
    }
  }

  const hasExplicitBranchScope = plan.branches.length > 0;
  const allowedActiveBranchIds = plan.branches
    .filter(({ branch }) => branch.status === BranchStatus.ACTIVE)
    .map(({ branchId }) => branchId);
  if (hasExplicitBranchScope && allowedActiveBranchIds.length === 0) {
    throw new SubscriptionEngineError('لا يوجد فرع نشط متاح لهذه الخطة.', 'BRANCH_NOT_AVAILABLE');
  }

  const eligibleBranchWhere: Prisma.BranchWhereInput = {
    status: BranchStatus.ACTIVE,
    ...(hasExplicitBranchScope ? { id: { in: allowedActiveBranchIds } } : {}),
  };
  const [lastEligibleBooking, fallbackBranch] = await Promise.all([
    tx.booking.findFirst({
      where: {
        customerId: input.customerId,
        deletedAt: null,
        branch: eligibleBranchWhere,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: { branchId: true },
    }),
    tx.branch.findFirst({
      where: eligibleBranchWhere,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: { id: true },
    }),
  ]);
  const branchId = lastEligibleBooking?.branchId ?? fallbackBranch?.id;
  if (!branchId) throw new SubscriptionEngineError('لا يوجد فرع نشط متاح لهذه الخطة.', 'BRANCH_NOT_AVAILABLE');

  const vehicleIds = [...new Set(input.vehicleIds)];
  if (vehicleIds.length < 1 || vehicleIds.length > plan.allowedVehicleCount) {
    throw new SubscriptionEngineError(
      `يجب ربط من سيارة واحدة إلى ${plan.allowedVehicleCount} سيارة.`,
      'INVALID_VEHICLE_COUNT',
    );
  }
  const ownedVehicleCount = await tx.vehicle.count({
    where: { id: { in: vehicleIds }, customerId: input.customerId },
  });
  if (ownedVehicleCount !== vehicleIds.length) {
    throw new SubscriptionEngineError('إحدى السيارات لا تخص هذا العميل.', 'VEHICLE_OWNERSHIP_MISMATCH');
  }

  const activeDuplicate = await tx.customerSubscription.findFirst({
    where: {
      customerId: input.customerId,
      planId: input.planId,
      OR: [
        { status: SubscriptionStatus.PENDING_PAYMENT },
        { status: SubscriptionStatus.FROZEN },
        { status: SubscriptionStatus.ACTIVE, endDate: { gt: now } },
      ],
    },
    select: { id: true },
  });
  if (activeDuplicate) {
    throw new SubscriptionEngineError('لديك طلب أو اشتراك قائم بالفعل في هذه الخطة.', 'ACTIVE_SUBSCRIPTION_EXISTS');
  }

  const subscription = await tx.customerSubscription.create({
    data: {
      customerId: input.customerId,
      planId: plan.id,
      branchId,
      purchasePrice: plan.price,
      startDate: now,
      endDate: addDays(now, plan.validityDays),
      totalVisits: plan.visitCount,
      remainingVisits: plan.visitCount,
      status: SubscriptionStatus.PENDING_PAYMENT,
      vehicles: { create: vehicleIds.map((vehicleId) => ({ vehicleId })) },
      serviceBalances: hasDedicatedServiceBalances
        ? {
            create: plan.services.flatMap(({ serviceId, visitQuota }) => (
              visitQuota == null
                ? []
                : [{
                    serviceId,
                    totalVisits: visitQuota,
                    remainingVisits: visitQuota,
                  }]
            )),
          }
        : undefined,
    },
  });

  await tx.subscriptionVisitLedger.create({
    data: {
      subscriptionId: subscription.id,
      action: VisitLedgerAction.PURCHASE,
      visitChange: plan.visitCount,
      balanceBefore: 0,
      remainingAfter: plan.visitCount,
      idempotencyKey,
      reason,
      adjustedByUserId: input.userId,
    },
  });
  await writeSubscriptionAudit(tx, {
    actor: input,
    action: 'SUBSCRIPTION_PURCHASE_REQUESTED',
    subscriptionId: subscription.id,
    reason,
    afterJson: {
      planId: plan.id,
      branchId,
      price: plan.price,
      totalVisits: plan.visitCount,
      vehicleIds,
      status: SubscriptionStatus.PENDING_PAYMENT,
    },
  });

  return subscription;
}

export async function activateCustomerSubscription(
  tx: Prisma.TransactionClient,
  input: SubscriptionCommandInput,
) {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (await findAppliedCommand(tx, input.subscriptionId, idempotencyKey, 'ACTIVATE')) {
    return tx.customerSubscription.findUniqueOrThrow({ where: { id: input.subscriptionId } });
  }
  const reason = normalizeReason(input.reason);
  const now = input.now ?? new Date();
  const subscription = await tx.customerSubscription.findUnique({
    where: { id: input.subscriptionId },
    include: {
      paymentProofs: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: {
          id: true,
          status: true,
          amountSubmitted: true,
          paymentMethod: { select: { branchId: true } },
        },
      },
    },
  });
  if (!subscription) throw new SubscriptionEngineError('الاشتراك غير موجود.', 'SUBSCRIPTION_NOT_FOUND');
  if (subscription.status === SubscriptionStatus.ACTIVE) return subscription;
  if (subscription.status !== SubscriptionStatus.PENDING_PAYMENT) {
    throw new SubscriptionEngineError('لا يمكن تفعيل الاشتراك في حالته الحالية.', 'INVALID_STATUS');
  }
  const latestProof = subscription.paymentProofs[0];
  if (!latestProof || latestProof.status !== SubscriptionPaymentProofStatus.APPROVED) {
    throw new SubscriptionEngineError(
      'لا يمكن تفعيل الاشتراك قبل اعتماد أحدث إثبات دفع.',
      'APPROVED_PAYMENT_PROOF_REQUIRED',
    );
  }
  if (latestProof.amountSubmitted !== subscription.purchasePrice) {
    throw new SubscriptionEngineError(
      'المبلغ المعتمد لا يطابق سعر الخطة.',
      'PAYMENT_AMOUNT_MISMATCH',
    );
  }
  if (latestProof.paymentMethod.branchId !== subscription.branchId) {
    throw new SubscriptionEngineError(
      'وسيلة الدفع المعتمدة لا تخص فرع الاشتراك.',
      'PAYMENT_METHOD_BRANCH_MISMATCH',
    );
  }

  // start/end are the purchase-time validity snapshot. Do not let a later
  // plan edit silently change the term already requested by this customer.
  const purchasedValidityMs = Math.max(
    DAY_MS,
    subscription.endDate.getTime() - subscription.startDate.getTime(),
  );
  const endDate = new Date(now.getTime() + purchasedValidityMs);
  const updated = await tx.customerSubscription.update({
    where: { id: subscription.id },
    data: {
      status: SubscriptionStatus.ACTIVE,
      startDate: now,
      endDate,
      cancelledAt: null,
      cancellationReason: null,
    },
  });
  await writeLifecycleLedger(tx, input, updated, 'ACTIVATE');
  await writeSubscriptionAudit(tx, {
    actor: input,
    action: 'SUBSCRIPTION_ACTIVATED',
    subscriptionId: updated.id,
    reason,
    beforeJson: { status: subscription.status },
    afterJson: {
      status: updated.status,
      startDate: now,
      endDate,
      paymentProofId: latestProof.id,
      amountApproved: latestProof.amountSubmitted,
    },
  });
  return updated;
}

export async function freezeCustomerSubscription(
  tx: Prisma.TransactionClient,
  input: FreezeSubscriptionInput,
) {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (await findAppliedCommand(tx, input.subscriptionId, idempotencyKey, 'FREEZE')) {
    return tx.customerSubscription.findUniqueOrThrow({ where: { id: input.subscriptionId } });
  }
  const reason = normalizeReason(input.reason);
  const now = input.now ?? new Date();
  const subscription = await tx.customerSubscription.findUnique({
    where: { id: input.subscriptionId },
    include: { plan: { select: { freezeAllowed: true, maxFreezeDays: true } } },
  });
  if (!subscription) throw new SubscriptionEngineError('الاشتراك غير موجود.', 'SUBSCRIPTION_NOT_FOUND');
  if (subscription.status === SubscriptionStatus.FROZEN) return subscription;
  if (subscription.status !== SubscriptionStatus.ACTIVE) {
    throw new SubscriptionEngineError('يمكن تجميد الاشتراك النشط فقط.', 'INVALID_STATUS');
  }
  if (subscription.endDate.getTime() <= now.getTime()) {
    throw new SubscriptionEngineError('انتهت صلاحية الاشتراك.', 'SUBSCRIPTION_EXPIRED');
  }
  const maxAllowedDays = (subscription.plan.freezeAllowed && subscription.plan.maxFreezeDays > 0)
    ? subscription.plan.maxFreezeDays
    : 365;
  const freezeDays = requirePositiveInteger(
    input.freezeDays,
    'مدة التجميد',
    maxAllowedDays,
  );
  const frozenUntil = addDays(now, freezeDays);
  const updated = await tx.customerSubscription.update({
    where: { id: subscription.id },
    data: {
      status: SubscriptionStatus.FROZEN,
      frozenAt: now,
      frozenUntil,
    },
  });
  await writeLifecycleLedger(tx, input, updated, 'FREEZE');
  await writeSubscriptionAudit(tx, {
    actor: input,
    action: 'SUBSCRIPTION_FROZEN',
    subscriptionId: updated.id,
    reason,
    beforeJson: { status: subscription.status, endDate: subscription.endDate },
    afterJson: { status: updated.status, frozenAt: now, frozenUntil },
  });
  return updated;
}

export async function unfreezeCustomerSubscription(
  tx: Prisma.TransactionClient,
  input: SubscriptionCommandInput,
) {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (await findAppliedCommand(tx, input.subscriptionId, idempotencyKey, 'UNFREEZE')) {
    return tx.customerSubscription.findUniqueOrThrow({ where: { id: input.subscriptionId } });
  }
  const reason = normalizeReason(input.reason);
  const now = input.now ?? new Date();
  const subscription = await tx.customerSubscription.findUnique({
    where: { id: input.subscriptionId },
  });
  if (!subscription) throw new SubscriptionEngineError('الاشتراك غير موجود.', 'SUBSCRIPTION_NOT_FOUND');
  if (subscription.status === SubscriptionStatus.ACTIVE) return subscription;
  if (subscription.status !== SubscriptionStatus.FROZEN || !subscription.frozenAt) {
    throw new SubscriptionEngineError('الاشتراك غير مجمد.', 'INVALID_STATUS');
  }

  const effectiveUnfreezeAt = subscription.frozenUntil && subscription.frozenUntil < now
    ? subscription.frozenUntil
    : now;
  const frozenDurationMs = Math.max(
    0,
    effectiveUnfreezeAt.getTime() - subscription.frozenAt.getTime(),
  );
  const endDate = new Date(subscription.endDate.getTime() + frozenDurationMs);
  const status = subscription.remainingVisits === 0
    ? SubscriptionStatus.COMPLETED
    : endDate.getTime() <= now.getTime()
      ? SubscriptionStatus.EXPIRED
      : SubscriptionStatus.ACTIVE;
  const updated = await tx.customerSubscription.update({
    where: { id: subscription.id },
    data: {
      status,
      endDate,
      frozenAt: null,
      frozenUntil: null,
    },
  });
  await writeLifecycleLedger(tx, input, updated, 'UNFREEZE');
  await writeSubscriptionAudit(tx, {
    actor: input,
    action: 'SUBSCRIPTION_UNFROZEN',
    subscriptionId: updated.id,
    reason,
    beforeJson: {
      status: subscription.status,
      endDate: subscription.endDate,
      frozenAt: subscription.frozenAt,
      frozenUntil: subscription.frozenUntil,
    },
    afterJson: { status: updated.status, endDate },
  });
  return updated;
}

export async function extendCustomerSubscription(
  tx: Prisma.TransactionClient,
  input: ExtendSubscriptionInput,
) {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (await findAppliedCommand(tx, input.subscriptionId, idempotencyKey, 'EXTEND')) {
    return tx.customerSubscription.findUniqueOrThrow({ where: { id: input.subscriptionId } });
  }
  const reason = normalizeReason(input.reason);
  const now = input.now ?? new Date();
  const extensionDays = requirePositiveInteger(input.extensionDays, 'مدة التمديد');
  const subscription = await tx.customerSubscription.findUnique({
    where: { id: input.subscriptionId },
  });
  if (!subscription) throw new SubscriptionEngineError('الاشتراك غير موجود.', 'SUBSCRIPTION_NOT_FOUND');
  if (
    subscription.status === SubscriptionStatus.CANCELLED ||
    subscription.status === SubscriptionStatus.PENDING_PAYMENT
  ) {
    throw new SubscriptionEngineError('لا يمكن تمديد الاشتراك في حالته الحالية.', 'INVALID_STATUS');
  }

  const extensionBase = subscription.endDate > now ? subscription.endDate : now;
  const endDate = addDays(extensionBase, extensionDays);
  const status = subscription.status === SubscriptionStatus.FROZEN
    ? SubscriptionStatus.FROZEN
    : subscription.remainingVisits > 0
      ? SubscriptionStatus.ACTIVE
      : SubscriptionStatus.COMPLETED;
  const updated = await tx.customerSubscription.update({
    where: { id: subscription.id },
    data: { endDate, status },
  });
  await writeLifecycleLedger(tx, input, updated, 'EXTEND');
  await writeSubscriptionAudit(tx, {
    actor: input,
    action: 'SUBSCRIPTION_EXTENDED',
    subscriptionId: updated.id,
    reason,
    beforeJson: { endDate: subscription.endDate, status: subscription.status },
    afterJson: { endDate, status, extensionDays },
  });
  return updated;
}

export async function cancelCustomerSubscription(
  tx: Prisma.TransactionClient,
  input: SubscriptionCommandInput,
) {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (await findAppliedCommand(tx, input.subscriptionId, idempotencyKey, 'CANCEL')) {
    return tx.customerSubscription.findUniqueOrThrow({ where: { id: input.subscriptionId } });
  }
  const reason = normalizeReason(input.reason);
  const now = input.now ?? new Date();
  const subscription = await tx.customerSubscription.findUnique({
    where: { id: input.subscriptionId },
  });
  if (!subscription) throw new SubscriptionEngineError('الاشتراك غير موجود.', 'SUBSCRIPTION_NOT_FOUND');
  if (subscription.status === SubscriptionStatus.CANCELLED) return subscription;

  const openBookingCount = await tx.booking.count({
    where: {
      subscriptionId: subscription.id,
      deletedAt: null,
      bookingStatus: { notIn: CANCELLATION_TERMINAL_BOOKING_STATUSES },
      terminalReopenSourceStatus: null,
    },
  });
  if (openBookingCount > 0) {
    throw new SubscriptionEngineError(
      'لا يمكن إلغاء الاشتراك قبل إنهاء أو إلغاء حجوزاته المفتوحة.',
      'OPEN_BOOKINGS_EXIST',
    );
  }

  const updated = await tx.customerSubscription.update({
    where: { id: subscription.id },
    data: {
      status: SubscriptionStatus.CANCELLED,
      cancelledAt: now,
      cancellationReason: reason,
      frozenAt: null,
      frozenUntil: null,
    },
  });
  await writeLifecycleLedger(tx, input, updated, 'CANCEL');
  await writeSubscriptionAudit(tx, {
    actor: input,
    action: 'SUBSCRIPTION_CANCELLED',
    subscriptionId: updated.id,
    reason,
    beforeJson: { status: subscription.status },
    afterJson: { status: updated.status, cancelledAt: now },
  });
  return updated;
}

export async function adjustCustomerSubscriptionVisits(
  tx: Prisma.TransactionClient,
  input: AdjustSubscriptionVisitsInput,
) {
  await lockSubscriptionBalance(tx, input.subscriptionId);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const existing = await findAppliedCommand(
    tx,
    input.subscriptionId,
    idempotencyKey,
    input.adjustment,
  );
  if (existing) {
    return {
      subscription: await tx.customerSubscription.findUniqueOrThrow({
        where: { id: input.subscriptionId },
      }),
      ledgerEntry: existing,
      applied: false,
    };
  }
  const reason = normalizeReason(input.reason);
  const now = input.now ?? new Date();
  const subscription = await tx.customerSubscription.findUnique({
    where: { id: input.subscriptionId },
  });
  if (!subscription) throw new SubscriptionEngineError('الاشتراك غير موجود.', 'SUBSCRIPTION_NOT_FOUND');
  if (
    subscription.status === SubscriptionStatus.PENDING_PAYMENT ||
    subscription.status === SubscriptionStatus.CANCELLED
  ) {
    throw new SubscriptionEngineError('لا يمكن تعديل الرصيد في حالة الاشتراك الحالية.', 'INVALID_STATUS');
  }

  const serviceBalance = input.serviceId
    ? await findSubscriptionServiceBalance(tx, subscription.id, input.serviceId)
    : null;
  if (input.serviceId && !serviceBalance) {
    throw new SubscriptionEngineError('الخدمة المحددة ليست ضمن أرصدة هذا الاشتراك.', 'SERVICE_BALANCE_NOT_FOUND');
  }

  if (input.adjustment === 'DEDUCT') {
    const activeReservations = await tx.booking.count({
      where: {
        subscriptionId: subscription.id,
        ...(serviceBalance ? { serviceId: serviceBalance.serviceId } : {}),
        deletedAt: null,
        bookingStatus: { notIn: CANCELLATION_TERMINAL_BOOKING_STATUSES },
        terminalReopenSourceStatus: null,
        visitLedgerEntries: { some: { action: VisitLedgerAction.BOOKING_RESERVED } },
        AND: [
          { NOT: { visitLedgerEntries: { some: { action: VisitLedgerAction.BOOKING_COMPLETED } } } },
          { NOT: { visitLedgerEntries: { some: { action: VisitLedgerAction.BOOKING_CANCELLED_RESTORED } } } },
        ],
      },
    });
    const availableVisits = serviceBalance?.remainingVisits ?? subscription.remainingVisits;
    if (input.amount > availableVisits - activeReservations) {
      throw new SubscriptionEngineError(
        'لا يمكن خصم زيارات محجوزة لحجوزات مفتوحة.',
        'RESERVED_VISITS_CONFLICT',
      );
    }
  }

  const next = calculateManualVisitAdjustment(subscription, input.adjustment, input.amount);
  const nextServiceBalance = serviceBalance
    ? calculateManualVisitAdjustment(serviceBalance, input.adjustment, input.amount)
    : null;
  const status = statusAfterBalanceChange(subscription, next.remainingVisits, now);
  const updateResult = await tx.customerSubscription.updateMany({
    where: {
      id: subscription.id,
      totalVisits: subscription.totalVisits,
      usedVisits: subscription.usedVisits,
      remainingVisits: subscription.remainingVisits,
    },
    data: {
      totalVisits: next.totalVisits,
      usedVisits: next.usedVisits,
      remainingVisits: next.remainingVisits,
      status,
    },
  });
  if (updateResult.count !== 1) {
    throw new SubscriptionEngineError(
      'تغير رصيد الاشتراك بالتزامن؛ أعد المحاولة.',
      'BALANCE_CONFLICT',
    );
  }
  if (serviceBalance && nextServiceBalance) {
    const serviceUpdate = await tx.customerSubscriptionServiceBalance.updateMany({
      where: {
        id: serviceBalance.id,
        totalVisits: serviceBalance.totalVisits,
        usedVisits: serviceBalance.usedVisits,
        remainingVisits: serviceBalance.remainingVisits,
      },
      data: {
        totalVisits: nextServiceBalance.totalVisits,
        usedVisits: nextServiceBalance.usedVisits,
        remainingVisits: nextServiceBalance.remainingVisits,
      },
    });
    if (serviceUpdate.count !== 1) {
      throw new SubscriptionEngineError(
        'تغير رصيد الخدمة بالتزامن؛ أعد المحاولة.',
        'SERVICE_BALANCE_CONFLICT',
      );
    }
  }

  const ledgerEntry = await tx.subscriptionVisitLedger.create({
    data: {
      subscriptionId: subscription.id,
      action: VisitLedgerAction.MANUAL_ADJUSTMENT,
      visitChange: next.visitChange,
      balanceBefore: subscription.remainingVisits,
      remainingAfter: next.remainingVisits,
      idempotencyKey,
      reason: `[${input.adjustment}] ${reason}`,
      adjustedByUserId: input.userId,
    },
  });
  await writeSubscriptionAudit(tx, {
    actor: input,
    action: 'SUBSCRIPTION_VISITS_ADJUSTED',
    subscriptionId: subscription.id,
    reason,
    beforeJson: {
      totalVisits: subscription.totalVisits,
      usedVisits: subscription.usedVisits,
      remainingVisits: subscription.remainingVisits,
      status: subscription.status,
    },
    afterJson: {
      adjustment: input.adjustment,
      amount: input.amount,
      serviceId: serviceBalance?.serviceId ?? null,
      totalVisits: next.totalVisits,
      usedVisits: next.usedVisits,
      remainingVisits: next.remainingVisits,
      status,
      serviceBalance: nextServiceBalance ? {
        totalVisits: nextServiceBalance.totalVisits,
        usedVisits: nextServiceBalance.usedVisits,
        remainingVisits: nextServiceBalance.remainingVisits,
      } : null,
    },
  });

  return {
    subscription: {
      ...subscription,
      totalVisits: next.totalVisits,
      usedVisits: next.usedVisits,
      remainingVisits: next.remainingVisits,
      status,
    },
    ledgerEntry,
    applied: true,
  };
}

export async function completeSubscriptionVisitForBooking(
  tx: Prisma.TransactionClient,
  input: BookingSubscriptionInput,
) {
  const booking = await tx.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, subscriptionId: true, serviceId: true },
  });
  if (!booking?.subscriptionId) return { applied: false, remainingAfter: null };
  await lockSubscriptionBalance(tx, booking.subscriptionId);

  const existing = await tx.subscriptionVisitLedger.findFirst({
    where: {
      subscriptionId: booking.subscriptionId,
      bookingId: booking.id,
      action: VisitLedgerAction.BOOKING_COMPLETED,
    },
  });
  if (existing) {
    return { applied: false, remainingAfter: existing.remainingAfter, ledgerEntry: existing };
  }

  const [subscription, serviceBalance] = await Promise.all([
    tx.customerSubscription.findUnique({ where: { id: booking.subscriptionId } }),
    findSubscriptionServiceBalance(tx, booking.subscriptionId, booking.serviceId),
  ]);
  if (!subscription) throw new SubscriptionEngineError('الاشتراك غير موجود.', 'SUBSCRIPTION_NOT_FOUND');
  if (
    subscription.status === SubscriptionStatus.PENDING_PAYMENT ||
    subscription.status === SubscriptionStatus.CANCELLED
  ) {
    throw new SubscriptionEngineError('الاشتراك غير صالح لاستهلاك زيارة.', 'INVALID_STATUS');
  }
  assertBalanceInvariant(subscription);
  if (subscription.remainingVisits < 1) {
    throw new SubscriptionEngineError('لا توجد زيارات متبقية في الاشتراك.', 'INSUFFICIENT_VISITS');
  }
  if (serviceBalance && serviceBalance.remainingVisits < 1) {
    throw new SubscriptionEngineError('لا توجد زيارات متبقية لهذه الخدمة داخل الاشتراك.', 'INSUFFICIENT_SERVICE_VISITS');
  }

  const remainingAfter = subscription.remainingVisits - 1;
  const usedVisits = subscription.usedVisits + 1;
  const status = remainingAfter === 0 ? SubscriptionStatus.COMPLETED : subscription.status;
  const updateResult = await tx.customerSubscription.updateMany({
    where: {
      id: subscription.id,
      remainingVisits: subscription.remainingVisits,
      usedVisits: subscription.usedVisits,
    },
    data: {
      remainingVisits: { decrement: 1 },
      usedVisits: { increment: 1 },
      status,
    },
  });
  if (updateResult.count !== 1) {
    throw new SubscriptionEngineError(
      'تغير رصيد الاشتراك بالتزامن؛ أعد المحاولة.',
      'BALANCE_CONFLICT',
    );
  }
  if (serviceBalance) {
    const serviceUpdate = await tx.customerSubscriptionServiceBalance.updateMany({
      where: {
        id: serviceBalance.id,
        usedVisits: serviceBalance.usedVisits,
        remainingVisits: serviceBalance.remainingVisits,
      },
      data: {
        usedVisits: { increment: 1 },
        remainingVisits: { decrement: 1 },
      },
    });
    if (serviceUpdate.count !== 1) {
      throw new SubscriptionEngineError(
        'تغير رصيد الخدمة بالتزامن؛ أعد المحاولة.',
        'SERVICE_BALANCE_CONFLICT',
      );
    }
  }

  const reason = input.reason?.trim() || 'خصم زيارة عند اكتمال الخدمة';
  const ledgerEntry = await tx.subscriptionVisitLedger.create({
    data: {
      subscriptionId: subscription.id,
      bookingId: booking.id,
      action: VisitLedgerAction.BOOKING_COMPLETED,
      visitChange: -1,
      balanceBefore: subscription.remainingVisits,
      remainingAfter,
      idempotencyKey: `subscription:${subscription.id}:booking:${booking.id}:completed`,
      reason,
      adjustedByUserId: input.userId,
    },
  });
  await writeSubscriptionAudit(tx, {
    actor: input,
    action: 'SUBSCRIPTION_VISIT_CONSUMED',
    subscriptionId: subscription.id,
    reason,
    beforeJson: {
      bookingId: booking.id,
      usedVisits: subscription.usedVisits,
      remainingVisits: subscription.remainingVisits,
    },
    afterJson: {
      bookingId: booking.id,
      usedVisits,
      remainingVisits: remainingAfter,
      status,
      serviceBalance: serviceBalance ? {
        serviceId: booking.serviceId,
        usedVisits: serviceBalance.usedVisits + 1,
        remainingVisits: serviceBalance.remainingVisits - 1,
      } : null,
    },
  });

  return { applied: true, remainingAfter, ledgerEntry };
}

export async function releaseSubscriptionVisitForBooking(
  tx: Prisma.TransactionClient,
  input: BookingSubscriptionInput,
) {
  const booking = await tx.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, subscriptionId: true, serviceId: true },
  });
  if (!booking?.subscriptionId) return { applied: false, restored: false, remainingAfter: null };
  await lockSubscriptionBalance(tx, booking.subscriptionId);

  const [existingRelease, reservation, completion] = await Promise.all([
    tx.subscriptionVisitLedger.findFirst({
      where: {
        subscriptionId: booking.subscriptionId,
        bookingId: booking.id,
        action: VisitLedgerAction.BOOKING_CANCELLED_RESTORED,
      },
    }),
    tx.subscriptionVisitLedger.findFirst({
      where: {
        subscriptionId: booking.subscriptionId,
        bookingId: booking.id,
        action: VisitLedgerAction.BOOKING_RESERVED,
      },
    }),
    tx.subscriptionVisitLedger.findFirst({
      where: {
        subscriptionId: booking.subscriptionId,
        bookingId: booking.id,
        action: VisitLedgerAction.BOOKING_COMPLETED,
      },
    }),
  ]);
  if (existingRelease) {
    return {
      applied: false,
      restored: existingRelease.visitChange > 0,
      remainingAfter: existingRelease.remainingAfter,
      ledgerEntry: existingRelease,
    };
  }
  if (!reservation && !completion) {
    return { applied: false, restored: false, remainingAfter: null };
  }

  const [subscription, serviceBalance] = await Promise.all([
    tx.customerSubscription.findUnique({ where: { id: booking.subscriptionId } }),
    findSubscriptionServiceBalance(tx, booking.subscriptionId, booking.serviceId),
  ]);
  if (!subscription) throw new SubscriptionEngineError('الاشتراك غير موجود.', 'SUBSCRIPTION_NOT_FOUND');
  assertBalanceInvariant(subscription);

  let restored = false;
  let remainingAfter = subscription.remainingVisits;
  let usedVisits = subscription.usedVisits;
  let status = subscription.status;
  if (completion) {
    if (subscription.usedVisits < 1 || subscription.remainingVisits >= subscription.totalVisits) {
      throw new SubscriptionEngineError('لا يمكن استعادة زيارة غير مخصومة.', 'RESTORE_BALANCE_INVALID');
    }
    restored = true;
    remainingAfter += 1;
    usedVisits -= 1;
    status = statusAfterBalanceChange(subscription, remainingAfter, input.now ?? new Date());
    const updateResult = await tx.customerSubscription.updateMany({
      where: {
        id: subscription.id,
        usedVisits: subscription.usedVisits,
        remainingVisits: subscription.remainingVisits,
      },
      data: { usedVisits, remainingVisits: remainingAfter, status },
    });
    if (updateResult.count !== 1) {
      throw new SubscriptionEngineError(
        'تغير رصيد الاشتراك بالتزامن؛ أعد المحاولة.',
        'BALANCE_CONFLICT',
      );
    }
    if (serviceBalance) {
      if (
        serviceBalance.usedVisits < 1
        || serviceBalance.remainingVisits >= serviceBalance.totalVisits
      ) {
        throw new SubscriptionEngineError(
          'لا يمكن استعادة زيارة خدمة غير مخصومة.',
          'RESTORE_SERVICE_BALANCE_INVALID',
        );
      }
      const serviceUpdate = await tx.customerSubscriptionServiceBalance.updateMany({
        where: {
          id: serviceBalance.id,
          usedVisits: serviceBalance.usedVisits,
          remainingVisits: serviceBalance.remainingVisits,
        },
        data: {
          usedVisits: { decrement: 1 },
          remainingVisits: { increment: 1 },
        },
      });
      if (serviceUpdate.count !== 1) {
        throw new SubscriptionEngineError(
          'تغير رصيد الخدمة بالتزامن؛ أعد المحاولة.',
          'SERVICE_BALANCE_CONFLICT',
        );
      }
    }
  }

  const reason = input.reason?.trim() || (restored
    ? 'استعادة زيارة سبق خصمها بعد إلغاء الحجز'
    : 'تحرير الزيارة المحجوزة دون تغيير الرصيد');
  const ledgerEntry = await tx.subscriptionVisitLedger.create({
    data: {
      subscriptionId: subscription.id,
      bookingId: booking.id,
      action: VisitLedgerAction.BOOKING_CANCELLED_RESTORED,
      visitChange: restored ? 1 : 0,
      balanceBefore: subscription.remainingVisits,
      remainingAfter,
      idempotencyKey: `subscription:${subscription.id}:booking:${booking.id}:cancelled`,
      reason,
      adjustedByUserId: input.userId,
    },
  });
  await writeSubscriptionAudit(tx, {
    actor: input,
    action: restored
      ? 'SUBSCRIPTION_VISIT_RESTORED'
      : 'SUBSCRIPTION_RESERVATION_RELEASED',
    subscriptionId: subscription.id,
    reason,
    beforeJson: {
      bookingId: booking.id,
      usedVisits: subscription.usedVisits,
      remainingVisits: subscription.remainingVisits,
    },
    afterJson: {
      bookingId: booking.id,
      usedVisits,
      remainingVisits: remainingAfter,
      status,
      serviceBalance: restored && serviceBalance ? {
        serviceId: booking.serviceId,
        usedVisits: serviceBalance.usedVisits - 1,
        remainingVisits: serviceBalance.remainingVisits + 1,
      } : null,
    },
  });

  return { applied: true, restored, remainingAfter, ledgerEntry };
}

/**
 * Backward-compatible entry point for balance events. New code should call
 * completeSubscriptionVisitForBooking, releaseSubscriptionVisitForBooking,
 * or adjustCustomerSubscriptionVisits so the allowed deltas are explicit.
 */
export async function processSubscriptionVisit(
  tx: Prisma.TransactionClient,
  params:
    | ({ action: 'BOOKING_COMPLETED' } & BookingSubscriptionInput)
    | ({ action: 'BOOKING_CANCELLED_RESTORED' } & BookingSubscriptionInput),
) {
  if (params.action === VisitLedgerAction.BOOKING_COMPLETED) {
    return completeSubscriptionVisitForBooking(tx, params);
  }
  return releaseSubscriptionVisitForBooking(tx, params);
}
