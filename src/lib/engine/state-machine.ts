import {
  BookingStatus,
  ChecklistStage,
  PaymentStatus,
  UserRole,
} from '@prisma/client';

/**
 * The canonical booking state graph. A repeated transition is deliberately
 * rejected so retries cannot create duplicate history, payments, or ledgers.
 * Guards that need booking evidence are evaluated by validateStatusTransition.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  DRAFT: [BookingStatus.REQUEST_SUBMITTED, BookingStatus.EXPIRED, BookingStatus.CANCELLED],
  REQUEST_SUBMITTED: [
    BookingStatus.AWAITING_PAYMENT_PROOF,
    BookingStatus.PAYMENT_UNDER_REVIEW,
    BookingStatus.PAYMENT_VERIFIED,
    BookingStatus.REJECTED,
    BookingStatus.CANCELLATION_REQUESTED,
    BookingStatus.EXPIRED,
  ],
  AWAITING_PAYMENT_PROOF: [
    BookingStatus.PAYMENT_UNDER_REVIEW,
    BookingStatus.REJECTED,
    BookingStatus.CANCELLATION_REQUESTED,
    BookingStatus.EXPIRED,
  ],
  PAYMENT_UNDER_REVIEW: [
    BookingStatus.PAYMENT_VERIFIED,
    BookingStatus.AWAITING_PAYMENT_PROOF,
    BookingStatus.REJECTED,
    BookingStatus.CANCELLATION_REQUESTED,
  ],
  PAYMENT_VERIFIED: [BookingStatus.AWAITING_OPERATIONS_REVIEW],
  AWAITING_OPERATIONS_REVIEW: [
    BookingStatus.ACCEPTED,
    BookingStatus.REJECTED,
    BookingStatus.RESCHEDULE_REQUESTED,
    BookingStatus.CANCELLATION_REQUESTED,
  ],
  ACCEPTED: [
    BookingStatus.AWAITING_ASSIGNMENT,
    BookingStatus.ASSIGNED,
    BookingStatus.RESCHEDULE_REQUESTED,
    BookingStatus.CANCELLATION_REQUESTED,
  ],
  AWAITING_ASSIGNMENT: [
    BookingStatus.ASSIGNED,
    BookingStatus.ADMIN_REVIEW_REQUIRED,
    BookingStatus.RESCHEDULE_REQUESTED,
    BookingStatus.CANCELLATION_REQUESTED,
  ],
  ASSIGNED: [
    BookingStatus.TEAM_ACKNOWLEDGED,
    BookingStatus.AWAITING_ASSIGNMENT,
    BookingStatus.RESCHEDULE_REQUESTED,
    BookingStatus.CANCELLATION_REQUESTED,
  ],
  TEAM_ACKNOWLEDGED: [
    BookingStatus.ON_THE_WAY,
    BookingStatus.EXECUTION_FAILED,
    BookingStatus.CUSTOMER_NO_SHOW,
    BookingStatus.ACCESS_DENIED,
  ],
  ON_THE_WAY: [
    BookingStatus.ARRIVED,
    BookingStatus.EXECUTION_FAILED,
    BookingStatus.CUSTOMER_NO_SHOW,
    BookingStatus.ACCESS_DENIED,
  ],
  ARRIVED: [
    BookingStatus.IN_SERVICE,
    BookingStatus.CUSTOMER_NO_SHOW,
    BookingStatus.ACCESS_DENIED,
    BookingStatus.EXECUTION_FAILED,
  ],
  IN_SERVICE: [BookingStatus.QUALITY_REVIEW, BookingStatus.EXECUTION_FAILED],
  QUALITY_REVIEW: [BookingStatus.SERVICE_COMPLETED, BookingStatus.IN_SERVICE],
  SERVICE_COMPLETED: [BookingStatus.DELIVERED],
  DELIVERED: [BookingStatus.CLOSED],
  CLOSED: [],
  RESCHEDULE_REQUESTED: [
    BookingStatus.AWAITING_OPERATIONS_REVIEW,
    BookingStatus.ACCEPTED,
    BookingStatus.AWAITING_ASSIGNMENT,
    BookingStatus.ASSIGNED,
    BookingStatus.ADMIN_REVIEW_REQUIRED,
    BookingStatus.CANCELLATION_REQUESTED,
  ],
  CANCELLATION_REQUESTED: [
    BookingStatus.REQUEST_SUBMITTED,
    BookingStatus.AWAITING_PAYMENT_PROOF,
    BookingStatus.PAYMENT_UNDER_REVIEW,
    BookingStatus.PAYMENT_VERIFIED,
    BookingStatus.AWAITING_OPERATIONS_REVIEW,
    BookingStatus.CANCELLED,
    BookingStatus.ACCEPTED,
    BookingStatus.AWAITING_ASSIGNMENT,
    BookingStatus.ASSIGNED,
    BookingStatus.ADMIN_REVIEW_REQUIRED,
    BookingStatus.RESCHEDULE_REQUESTED,
  ],
  CANCELLED: [],
  REJECTED: [],
  EXECUTION_FAILED: [
    BookingStatus.ADMIN_REVIEW_REQUIRED,
    BookingStatus.RESCHEDULE_REQUESTED,
    BookingStatus.CANCELLATION_REQUESTED,
  ],
  CUSTOMER_NO_SHOW: [
    BookingStatus.ADMIN_REVIEW_REQUIRED,
    BookingStatus.RESCHEDULE_REQUESTED,
    BookingStatus.CANCELLATION_REQUESTED,
  ],
  ACCESS_DENIED: [
    BookingStatus.ADMIN_REVIEW_REQUIRED,
    BookingStatus.RESCHEDULE_REQUESTED,
    BookingStatus.CANCELLATION_REQUESTED,
  ],
  ADMIN_REVIEW_REQUIRED: [
    BookingStatus.ACCEPTED,
    BookingStatus.AWAITING_ASSIGNMENT,
    BookingStatus.ASSIGNED,
    BookingStatus.CANCELLATION_REQUESTED,
    BookingStatus.REJECTED,
  ],
  EXPIRED: [],
};

const PAYMENT_CONFIRMED_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.NOT_REQUIRED,
  PaymentStatus.VERIFIED,
  PaymentStatus.PARTIALLY_PAID,
  PaymentStatus.FULLY_PAID,
]);

const REASON_REQUIRED_STATUSES = new Set<BookingStatus>([
  BookingStatus.REJECTED,
  BookingStatus.RESCHEDULE_REQUESTED,
  BookingStatus.CANCELLATION_REQUESTED,
  BookingStatus.CANCELLED,
  BookingStatus.EXECUTION_FAILED,
  BookingStatus.CUSTOMER_NO_SHOW,
  BookingStatus.ACCESS_DENIED,
  BookingStatus.ADMIN_REVIEW_REQUIRED,
]);

const TEAM_ONLY_TARGETS = new Set<BookingStatus>([
  BookingStatus.TEAM_ACKNOWLEDGED,
  BookingStatus.ON_THE_WAY,
  BookingStatus.ARRIVED,
  BookingStatus.IN_SERVICE,
  BookingStatus.QUALITY_REVIEW,
]);

const PAYMENT_GATED_TARGETS = new Set<BookingStatus>([
  BookingStatus.PAYMENT_VERIFIED,
  BookingStatus.AWAITING_OPERATIONS_REVIEW,
  BookingStatus.ACCEPTED,
]);

const ASSIGNMENT_GATED_TARGETS = new Set<BookingStatus>([
  BookingStatus.ASSIGNED,
  BookingStatus.TEAM_ACKNOWLEDGED,
  BookingStatus.ON_THE_WAY,
  BookingStatus.ARRIVED,
  BookingStatus.IN_SERVICE,
  BookingStatus.QUALITY_REVIEW,
  BookingStatus.SERVICE_COMPLETED,
  BookingStatus.DELIVERED,
  BookingStatus.CLOSED,
]);

export const EXECUTION_CHECKLIST_STAGES: readonly ChecklistStage[] = [
  ChecklistStage.TEAM_PREPARATION,
  ChecklistStage.ARRIVAL_INSPECTION,
  ChecklistStage.SERVICE_EXECUTION,
  ChecklistStage.CLOSING,
];

export interface TransitionEvidence {
  actorRole?: UserRole;
  managerOverride?: boolean;
  terminalAdministrativeReview?: boolean;
  paymentStatus?: PaymentStatus;
  reason?: string | null;
  hasAssignedTeam?: boolean;
  actorBelongsToAssignedTeam?: boolean;
  completedChecklistStages?: readonly ChecklistStage[];
  beforePhotoCount?: number;
  afterPhotoCount?: number;
  minimumBeforePhotos?: number;
  minimumAfterPhotos?: number;
  qualityApproved?: boolean;
  amountDue?: number;
}

export interface TransitionValidation {
  allowed: boolean;
  code?:
    | 'SAME_STATUS'
    | 'ILLEGAL_TRANSITION'
    | 'REASON_REQUIRED'
    | 'PAYMENT_NOT_CONFIRMED'
    | 'TEAM_NOT_ASSIGNED'
    | 'TEAM_SCOPE_REQUIRED'
    | 'CHECKLIST_INCOMPLETE'
    | 'BEFORE_PHOTOS_REQUIRED'
    | 'AFTER_PHOTOS_REQUIRED'
    | 'QUALITY_APPROVAL_REQUIRED'
    | 'OUTSTANDING_BALANCE'
    | 'MANAGER_OVERRIDE_FORBIDDEN'
    | 'MANAGER_OVERRIDE_REASON_REQUIRED'
    | 'TERMINAL_REVIEW_ONLY';
  message?: string;
}

export function isValidStatusTransition(
  fromStatus: BookingStatus,
  toStatus: BookingStatus,
): boolean {
  if (fromStatus === toStatus) return false;
  return ALLOWED_STATUS_TRANSITIONS[fromStatus].includes(toStatus);
}

export function validateStatusTransition(
  fromStatus: BookingStatus,
  toStatus: BookingStatus,
  evidence: TransitionEvidence = {},
): TransitionValidation {
  if (fromStatus === toStatus) {
    return { allowed: false, code: 'SAME_STATUS', message: 'الحجز موجود بالفعل في هذه الحالة.' };
  }

  if (!isValidStatusTransition(fromStatus, toStatus)) {
    return { allowed: false, code: 'ILLEGAL_TRANSITION', message: 'انتقال حالة الحجز غير مسموح.' };
  }

  if (evidence.terminalAdministrativeReview) {
    return {
      allowed: false,
      code: 'TERMINAL_REVIEW_ONLY',
      message: 'الحجز مفتوح للمراجعة الإدارية فقط. أغلق المراجعة لإعادته إلى حالته الطرفية الأصلية.',
    };
  }

  if (evidence.managerOverride) {
    if (
      evidence.actorRole !== UserRole.OPERATIONS_MANAGER
      && evidence.actorRole !== UserRole.OWNER
    ) {
      return {
        allowed: false,
        code: 'MANAGER_OVERRIDE_FORBIDDEN',
        message: 'الاستثناء الإداري متاح لمدير التشغيل أو المالك فقط.',
      };
    }
    if (!evidence.reason?.trim()) {
      return {
        allowed: false,
        code: 'MANAGER_OVERRIDE_REASON_REQUIRED',
        message: 'يجب تسجيل سبب واضح للاستثناء الإداري.',
      };
    }
  }

  if (REASON_REQUIRED_STATUSES.has(toStatus) && !evidence.reason?.trim()) {
    return { allowed: false, code: 'REASON_REQUIRED', message: 'يجب تسجيل سبب واضح لهذا الإجراء.' };
  }

  if (
    PAYMENT_GATED_TARGETS.has(toStatus) &&
    (!evidence.paymentStatus || !PAYMENT_CONFIRMED_STATUSES.has(evidence.paymentStatus))
  ) {
    return { allowed: false, code: 'PAYMENT_NOT_CONFIRMED', message: 'لا يمكن متابعة الحجز قبل تأكيد الدفع.' };
  }

  if (
    ASSIGNMENT_GATED_TARGETS.has(toStatus) &&
    !evidence.hasAssignedTeam
  ) {
    return { allowed: false, code: 'TEAM_NOT_ASSIGNED', message: 'يجب إسناد فريق للحجز أولًا.' };
  }

  if (
    evidence.actorRole === UserRole.EMPLOYEE &&
    TEAM_ONLY_TARGETS.has(toStatus) &&
    evidence.actorBelongsToAssignedTeam !== true
  ) {
    return { allowed: false, code: 'TEAM_SCOPE_REQUIRED', message: 'هذا الحجز غير مسند إلى فريقك.' };
  }

  const completedStages = new Set(evidence.completedChecklistStages ?? []);
  if (toStatus === BookingStatus.IN_SERVICE) {
    if (!completedStages.has(ChecklistStage.TEAM_PREPARATION) || !completedStages.has(ChecklistStage.ARRIVAL_INSPECTION)) {
      return { allowed: false, code: 'CHECKLIST_INCOMPLETE', message: 'أكمل قوائم التحضير وفحص الوصول قبل بدء الخدمة.' };
    }
    if ((evidence.beforePhotoCount ?? 0) < (evidence.minimumBeforePhotos ?? 0)) {
      return { allowed: false, code: 'BEFORE_PHOTOS_REQUIRED', message: 'صور ما قبل الخدمة المطلوبة غير مكتملة.' };
    }
  }

  if (toStatus === BookingStatus.QUALITY_REVIEW && !evidence.managerOverride) {
    const missingExecutionStage = EXECUTION_CHECKLIST_STAGES.some((stage) => !completedStages.has(stage));
    if (missingExecutionStage) {
      return { allowed: false, code: 'CHECKLIST_INCOMPLETE', message: 'لا يمكن إرسال الحجز للجودة قبل إكمال قوائم التنفيذ.' };
    }
    if ((evidence.afterPhotoCount ?? 0) < (evidence.minimumAfterPhotos ?? 0)) {
      return { allowed: false, code: 'AFTER_PHOTOS_REQUIRED', message: 'صور ما بعد الخدمة المطلوبة غير مكتملة.' };
    }
  }

  if (
    toStatus === BookingStatus.SERVICE_COMPLETED
    && evidence.qualityApproved !== true
    && !evidence.managerOverride
  ) {
    return { allowed: false, code: 'QUALITY_APPROVAL_REQUIRED', message: 'اعتماد الجودة مطلوب قبل إكمال الخدمة.' };
  }

  if (toStatus === BookingStatus.CLOSED && (evidence.amountDue ?? 0) > 0) {
    return { allowed: false, code: 'OUTSTANDING_BALANCE', message: 'لا يمكن إغلاق الحجز مع وجود مبلغ مستحق.' };
  }

  return { allowed: true };
}

const CUSTOMER_STATUS_LABELS: Partial<Record<BookingStatus, string>> = {
  [BookingStatus.DRAFT]: 'مسودة حجز',
  [BookingStatus.REQUEST_SUBMITTED]: 'تم استلام طلب الحجز',
  [BookingStatus.AWAITING_PAYMENT_PROOF]: 'بانتظار إثبات التحويل',
  [BookingStatus.PAYMENT_UNDER_REVIEW]: 'إثبات التحويل قيد المراجعة',
  [BookingStatus.PAYMENT_VERIFIED]: 'تم تأكيد الدفع',
  [BookingStatus.AWAITING_OPERATIONS_REVIEW]: 'الحجز قيد مراجعة التشغيل',
  [BookingStatus.ACCEPTED]: 'تم قبول الحجز',
  [BookingStatus.AWAITING_ASSIGNMENT]: 'جارٍ تجهيز الفريق',
  [BookingStatus.ASSIGNED]: 'تم تخصيص الفريق',
  [BookingStatus.TEAM_ACKNOWLEDGED]: 'أكد الفريق المهمة',
  [BookingStatus.ON_THE_WAY]: 'الفريق في الطريق إليك',
  [BookingStatus.ARRIVED]: 'وصل الفريق إلى موقع الخدمة',
  [BookingStatus.IN_SERVICE]: 'الخدمة قيد التنفيذ',
  [BookingStatus.QUALITY_REVIEW]: 'الخدمة قيد مراجعة الجودة',
  [BookingStatus.SERVICE_COMPLETED]: 'اكتملت الخدمة بنجاح',
  [BookingStatus.DELIVERED]: 'تم تسليم الخدمة',
  [BookingStatus.CLOSED]: 'تم إغلاق الحجز',
  [BookingStatus.RESCHEDULE_REQUESTED]: 'طلب تعديل الموعد قيد المراجعة',
  [BookingStatus.CANCELLATION_REQUESTED]: 'طلب الإلغاء قيد المراجعة',
  [BookingStatus.CANCELLED]: 'تم إلغاء الحجز',
  [BookingStatus.REJECTED]: 'تعذر قبول الحجز',
  [BookingStatus.EXECUTION_FAILED]: 'تعذر تنفيذ الخدمة ويجري التواصل معك',
  [BookingStatus.CUSTOMER_NO_SHOW]: 'تعذر الوصول إلى العميل',
  [BookingStatus.ACCESS_DENIED]: 'تعذر دخول موقع الخدمة',
  [BookingStatus.ADMIN_REVIEW_REQUIRED]: 'الحجز يحتاج مراجعة تشغيلية',
  [BookingStatus.EXPIRED]: 'انتهت مهلة إتمام الحجز',
};

export function getCustomerFacingStatusLabel(status: BookingStatus): string {
  return CUSTOMER_STATUS_LABELS[status] ?? 'متابعة الطلب';
}
