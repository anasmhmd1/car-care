'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  Lock,
  ShieldCheck,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import {
  assignTeamManuallyAction,
  cancelBookingByOperationsAction,
  recordBalancePaymentAction,
  rescheduleBookingByOperationsAction,
  reviewBookingAction,
  reviewPaymentProofAction,
  toggleBranchScheduleLockAction,
  transferBookingTeamAction,
} from '@/app/actions/operations';
import { advancePostServiceAction } from '@/app/actions/quality';
import {
  closeTerminalBookingReviewAction,
  managerOverrideCloseBookingAction,
  reopenTerminalBookingAction,
} from '@/app/actions/booking-administration';
import OperationsQueuePagination from './OperationsQueuePagination';
import {
  operationsQueuePageParam,
  type OperationsDashboardQueueKey,
  type OperationsQueuePagination as QueuePagination,
} from './pagination';

type DateValue = string | Date;
type Tab = OperationsDashboardQueueKey;
type ProofDecision = 'VERIFY' | 'REJECT' | 'SHORT' | 'REUPLOAD' | 'DUPLICATE';

interface UserSummary {
  id: string;
  fullName: string;
  phone: string;
}

interface ManagerSummary extends UserSummary {
  role: string;
}

interface PendingProof {
  id: string;
  senderName: string;
  senderPhoneOrAccount: string;
  referenceNumber: string | null;
  amountSubmitted: number;
  transferTimestamp: DateValue;
  createdAt: DateValue;
  proofFileUrl: string;
  paymentMethod: { name: string };
  booking: {
    id: string;
    bookingNumber: string;
    depositAmount: number;
    amountPaid: number;
    amountDue: number;
    service: { nameAr: string };
    vehicle: { make: string; model: string };
    customer: { user: UserSummary };
  };
}

interface ReviewBooking {
  id: string;
  branchId: string;
  bookingNumber: string;
  startAt: DateValue;
  amountPaid: number;
  amountDue: number;
  paymentStatus: string;
  branch: { id: string; nameAr: string; assignmentMode: string };
  service: { nameAr: string };
  vehicle: { make: string; model: string };
  coverageArea: { compound: string };
  customer: { user: UserSummary };
}

interface UnassignedBooking {
  id: string;
  branchId: string;
  bookingNumber: string;
  bookingStatus: string;
  startAt: DateValue;
  branch: { nameAr: string };
  service: { nameAr: string };
  coverageArea: { compound: string };
}

interface TeamSummary {
  id: string;
  branchId: string;
  name: string;
  members: Array<{ id: string }>;
}

interface BranchSummary {
  id: string;
  nameAr: string;
  status: string;
}

interface ActiveBooking {
  id: string;
  branchId?: string;
  bookingNumber: string;
  bookingStatus: string;
  startAt: DateValue;
  amountPaid: number;
  amountDue: number;
  paymentStatus: string;
  service: { nameAr: string };
  assignedTeam: { name: string } | null;
  assignedTeamId?: string | null;
  canRecordBalancePayment: boolean;
  canCloseBooking: boolean;
  customer: { user: UserSummary };
  canManagerOverrideClose: boolean;
  terminalReopenSourceStatus: string | null;
}

interface TerminalBooking {
  id: string;
  bookingNumber: string;
  bookingStatus: string;
  paymentStatus: string;
  startAt: DateValue;
  updatedAt: DateValue;
  amountPaid: number;
  amountDue: number;
  service: { nameAr: string };
  branch: { nameAr: string };
  customer: { user: UserSummary };
}

interface Props {
  manager: ManagerSummary;
  branches?: BranchSummary[];
  pendingProofs: PendingProof[];
  reviewBookings: ReviewBooking[];
  unassignedBookings: UnassignedBooking[];
  teams: TeamSummary[];
  activeBookings: ActiveBooking[];
  terminalBookings: TerminalBooking[];
  activeBookingQuery: string;
  terminalBookingQuery: string;
  initialTab?: Tab;
  pagination: Record<Tab, QueuePagination>;
}

interface Feedback {
  tone: 'success' | 'error';
  message: string;
}

function formatDateTime(value: DateValue) {
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}

function MetricButton({
  active,
  count,
  label,
  onClick,
  icon,
}: {
  active: boolean;
  count: number | string;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-3xl border p-5 text-right transition-colors ${
        active
          ? 'border-[#c9a227] bg-[#c9a227]/10'
          : 'border-neutral-800 bg-[#141414] hover:border-neutral-600'
      }`}
    >
      <span className="flex items-center justify-between gap-3 text-xs font-semibold text-neutral-300">
        {label}
        {icon}
      </span>
      <span className="mt-3 block text-3xl font-black text-[#e5c45a]">{count}</span>
    </button>
  );
}

function pagedCount(count: number, queue: QueuePagination) {
  return queue.hasNextPage ? `${count}+` : count;
}

export default function OperationsDashboardClient({
  manager,
  branches = [],
  pendingProofs,
  reviewBookings,
  unassignedBookings,
  teams,
  activeBookings,
  terminalBookings,
  activeBookingQuery,
  terminalBookingQuery,
  initialTab,
  pagination,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>(
    initialTab ?? (manager.role === 'OWNER' && terminalBookingQuery
      ? 'terminal'
      : activeBookingQuery
        ? 'bookings'
        : 'proofs'),
  );
  const [selectedProof, setSelectedProof] = useState<PendingProof | null>(null);
  const [selectedReview, setSelectedReview] = useState<ReviewBooking | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<UnassignedBooking | null>(null);
  const [selectedSettlement, setSelectedSettlement] = useState<ActiveBooking | null>(null);
  const [selectedClose, setSelectedClose] = useState<ActiveBooking | null>(null);
  const [selectedOverrideClose, setSelectedOverrideClose] = useState<ActiveBooking | null>(null);
  const [selectedReopen, setSelectedReopen] = useState<TerminalBooking | null>(null);
  const [selectedTerminalReview, setSelectedTerminalReview] = useState<ActiveBooking | null>(null);

  // New Operational Modals State
  const [selectedCancelBooking, setSelectedCancelBooking] = useState<{ id: string; bookingNumber: string; customerName?: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const [selectedRescheduleBooking, setSelectedRescheduleBooking] = useState<{ id: string; bookingNumber: string; startAt: DateValue } | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');

  const [selectedTransferBooking, setSelectedTransferBooking] = useState<{ id: string; bookingNumber: string; branchId?: string; currentTeamId?: string | null } | null>(null);
  const [transferTeamId, setTransferTeamId] = useState('');
  const [transferReason, setTransferReason] = useState('');

  const [selectedLockBranch, setSelectedLockBranch] = useState<BranchSummary | null>(null);
  const [lockReason, setLockReason] = useState('');

  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [assignmentReason, setAssignmentReason] = useState('');
  const [settlementMethod, setSettlementMethod] = useState('CASH');
  const [settlementReference, setSettlementReference] = useState('');
  const [settlementNotes, setSettlementNotes] = useState('');
  const [closeReason, setCloseReason] = useState('تم تسليم الخدمة وتحصيل كامل الرصيد');
  const [overrideReason, setOverrideReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [terminalReviewReason, setTerminalReviewReason] = useState('');
  const [activeSearch, setActiveSearch] = useState(activeBookingQuery);
  const [terminalSearch, setTerminalSearch] = useState(terminalBookingQuery);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  function submitServerSearch(parameter: 'bookingQuery' | 'terminalQuery', value: string) {
    const params = new URLSearchParams(window.location.search);
    const normalized = value.trim();
    if (normalized) params.set(parameter, normalized);
    else params.delete(parameter);
    const queue = parameter === 'bookingQuery' ? 'bookings' : 'terminal';
    params.delete(operationsQueuePageParam(queue));
    params.set('dashboardTab', queue);
    const search = params.toString();
    router.push(search ? `/operations?${search}` : '/operations');
  }

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const visibleTeams = useMemo(
    () => selectedBooking
      ? teams.filter((team) => team.branchId === selectedBooking.branchId)
      : [],
    [selectedBooking, teams],
  );

  useEffect(() => {
    if (!selectedBooking) return;
    setSelectedTeamId(
      teams.find((team) => team.branchId === selectedBooking.branchId)?.id ?? '',
    );
  }, [selectedBooking, teams]);

  const visibleTeamsForTransfer = useMemo(() => {
    if (!selectedTransferBooking) return [];
    return selectedTransferBooking.branchId
      ? teams.filter((t) => t.branchId === selectedTransferBooking.branchId)
      : teams;
  }, [selectedTransferBooking, teams]);

  useEffect(() => {
    const modalOpen = Boolean(
      selectedProof
      || selectedReview
      || selectedBooking
      || selectedSettlement
      || selectedClose
      || selectedOverrideClose
      || selectedReopen
      || selectedTerminalReview
      || selectedCancelBooking
      || selectedRescheduleBooking
      || selectedTransferBooking
      || selectedLockBranch
    );
    if (!modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isSubmitting) return;
      setSelectedProof(null);
      setSelectedReview(null);
      setSelectedBooking(null);
      setSelectedSettlement(null);
      setSelectedClose(null);
      setSelectedOverrideClose(null);
      setSelectedReopen(null);
      setSelectedTerminalReview(null);
      setSelectedCancelBooking(null);
      setSelectedRescheduleBooking(null);
      setSelectedTransferBooking(null);
      setSelectedLockBranch(null);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    isSubmitting,
    selectedBooking,
    selectedClose,
    selectedOverrideClose,
    selectedProof,
    selectedReopen,
    selectedReview,
    selectedSettlement,
    selectedTerminalReview,
    selectedCancelBooking,
    selectedRescheduleBooking,
    selectedTransferBooking,
    selectedLockBranch,
  ]);

  async function finishAction(
    task: () => Promise<{ success?: boolean; error?: string }>,
    successMessage: string,
  ) {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const result = await task();
      if (result.error) {
        setFeedback({ tone: 'error', message: result.error });
        return false;
      }
      setFeedback({ tone: 'success', message: successMessage });
      router.refresh();
      return true;
    } catch {
      setFeedback({ tone: 'error', message: 'تعذر الاتصال بالخادم. حاول مرة أخرى.' });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancelBooking() {
    if (!selectedCancelBooking) return;
    if (cancelReason.trim().length < 3) {
      setFeedback({ tone: 'error', message: 'اكتب سبب الإلغاء (3 أحرف على الأقل).' });
      return;
    }
    const formData = new FormData();
    formData.set('bookingId', selectedCancelBooking.id);
    formData.set('reason', cancelReason);
    const completed = await finishAction(
      () => cancelBookingByOperationsAction(formData),
      `تم إلغاء الحجز #${selectedCancelBooking.bookingNumber} بنجاح.`,
    );
    if (completed) {
      setSelectedCancelBooking(null);
      setCancelReason('');
    }
  }

  async function handleRescheduleBooking() {
    if (!selectedRescheduleBooking) return;
    if (!rescheduleDate || !rescheduleTime) {
      setFeedback({ tone: 'error', message: 'اختر التاريخ والوقت الجديد.' });
      return;
    }
    if (rescheduleReason.trim().length < 3) {
      setFeedback({ tone: 'error', message: 'اكتب سبب تعديل الموعد (3 أحرف على الأقل).' });
      return;
    }
    const formData = new FormData();
    formData.set('bookingId', selectedRescheduleBooking.id);
    formData.set('targetDate', rescheduleDate);
    formData.set('targetTime', rescheduleTime);
    formData.set('reason', rescheduleReason);
    const completed = await finishAction(
      () => rescheduleBookingByOperationsAction(formData),
      `تم تعديل وتأجيل موعد الحجز #${selectedRescheduleBooking.bookingNumber} بنجاح.`,
    );
    if (completed) {
      setSelectedRescheduleBooking(null);
      setRescheduleDate('');
      setRescheduleTime('');
      setRescheduleReason('');
    }
  }

  async function handleTransferTeam() {
    if (!selectedTransferBooking || !transferTeamId) {
      setFeedback({ tone: 'error', message: 'اختر الفريق الجديد.' });
      return;
    }
    if (transferReason.trim().length < 3) {
      setFeedback({ tone: 'error', message: 'اكتب سبب نقل الحجز (3 أحرف على الأقل).' });
      return;
    }
    const formData = new FormData();
    formData.set('bookingId', selectedTransferBooking.id);
    formData.set('targetTeamId', transferTeamId);
    formData.set('reason', transferReason);
    const completed = await finishAction(
      () => transferBookingTeamAction(formData),
      `تم نقل الحجز #${selectedTransferBooking.bookingNumber} بنجاح.`,
    );
    if (completed) {
      setSelectedTransferBooking(null);
      setTransferTeamId('');
      setTransferReason('');
    }
  }

  async function handleToggleScheduleLock() {
    if (!selectedLockBranch) return;
    const isLocking = selectedLockBranch.status === 'ACTIVE';
    const formData = new FormData();
    formData.set('branchId', selectedLockBranch.id);
    formData.set('locked', String(isLocking));
    formData.set('reason', lockReason || (isLocking ? 'قفل جدول المواعيد بقرار تشغيلي' : 'إلغاء قفل جدول المواعيد'));
    const completed = await finishAction(
      () => toggleBranchScheduleLockAction(formData),
      isLocking
        ? `تم قفل جدول مواعيد ${selectedLockBranch.nameAr} وإيقاف استقبال الحجوزات من الموقع.`
        : `تم فتح جدول مواعيد ${selectedLockBranch.nameAr} واستئناف استقبال الحجوزات.`,
    );
    if (completed) {
      setSelectedLockBranch(null);
      setLockReason('');
    }
  }

  async function handleReviewProof(decision: ProofDecision) {
    if (!selectedProof) return;
    if (decision !== 'VERIFY' && reviewNotes.trim().length < 1) {
      setFeedback({ tone: 'error', message: 'اكتب سبب القرار قبل المتابعة.' });
      return;
    }
    const formData = new FormData();
    formData.set('proofId', selectedProof.id);
    formData.set('decision', decision);
    formData.set('reviewNotes', reviewNotes);
    const completed = await finishAction(
      () => reviewPaymentProofAction(formData),
      'تم حفظ قرار مراجعة إثبات الدفع.',
    );
    if (completed) {
      setSelectedProof(null);
      setReviewNotes('');
    }
  }

  async function handleBookingReview(decision: 'ACCEPT' | 'REJECT') {
    if (!selectedReview) return;
    if (reviewNotes.trim().length < 3) {
      setFeedback({ tone: 'error', message: 'اكتب سببًا واضحًا للقرار.' });
      return;
    }
    const formData = new FormData();
    formData.set('bookingId', selectedReview.id);
    formData.set('decision', decision);
    formData.set('reason', reviewNotes);
    const completed = await finishAction(
      () => reviewBookingAction(formData),
      decision === 'ACCEPT' ? 'تم اعتماد الحجز وإحالته للتوزيع.' : 'تم رفض الحجز وتحرير الموعد.',
    );
    if (completed) {
      setSelectedReview(null);
      setReviewNotes('');
    }
  }

  async function handleAssignTeam() {
    if (!selectedBooking || !selectedTeamId) {
      setFeedback({ tone: 'error', message: 'اختر فريقًا تابعًا لنفس الفرع.' });
      return;
    }
    if (assignmentReason.trim().length < 1) {
      setFeedback({ tone: 'error', message: 'اكتب سبب الإسناد أو التجاوز اليدوي.' });
      return;
    }
    const formData = new FormData();
    formData.set('bookingId', selectedBooking.id);
    formData.set('teamId', selectedTeamId);
    formData.set('reason', assignmentReason);
    const completed = await finishAction(
      () => assignTeamManuallyAction(formData),
      'تم إسناد الفريق بعد إعادة فحص الموعد.',
    );
    if (completed) {
      setSelectedBooking(null);
      setAssignmentReason('');
    }
  }

  async function handleRecordSettlement() {
    if (!selectedSettlement || selectedSettlement.amountDue <= 0) return;
    if (settlementNotes.trim().length < 3) {
      setFeedback({ tone: 'error', message: 'اكتب ملاحظة تحصيل واضحة من 3 أحرف على الأقل.' });
      return;
    }
    const formData = new FormData();
    formData.set('bookingId', selectedSettlement.id);
    formData.set('amount', String(selectedSettlement.amountDue));
    formData.set('paymentMethod', settlementMethod);
    formData.set('referenceNumber', settlementReference);
    formData.set('notes', settlementNotes);
    formData.set('idempotencyKey', crypto.randomUUID());
    const completed = await finishAction(
      () => recordBalancePaymentAction(formData),
      'تم تسجيل تحصيل الرصيد وتحديث حالة الدفع.',
    );
    if (completed) {
      setSelectedSettlement(null);
      setSettlementReference('');
      setSettlementNotes('');
    }
  }

  async function handleCloseBooking() {
    if (!selectedClose || closeReason.trim().length < 3) {
      setFeedback({ tone: 'error', message: 'اكتب سبب الإغلاق النهائي.' });
      return;
    }
    const formData = new FormData();
    formData.set('bookingId', selectedClose.id);
    formData.set('targetStatus', 'CLOSED');
    formData.set('reason', closeReason);
    const completed = await finishAction(
      () => advancePostServiceAction(formData),
      'تم إغلاق الحجز بعد التحقق من تسوية الرصيد.',
    );
    if (completed) setSelectedClose(null);
  }

  async function handleManagerOverrideClose() {
    if (!selectedOverrideClose || overrideReason.trim().length < 3) {
      setFeedback({
        tone: 'error',
        message: 'اكتب سببًا واضحًا للاستثناء الإداري من 3 أحرف على الأقل.',
      });
      return;
    }
    const formData = new FormData();
    formData.set('bookingId', selectedOverrideClose.id);
    formData.set('reason', overrideReason);
    const completed = await finishAction(
      () => managerOverrideCloseBookingAction(formData),
      'تم إغلاق الحجز باستثناء إداري موثق مع الإبقاء على قيود الفريق والتسوية.',
    );
    if (completed) {
      setSelectedOverrideClose(null);
      setOverrideReason('');
    }
  }

  async function handleReopenTerminalBooking() {
    if (!selectedReopen || reopenReason.trim().length < 3) {
      setFeedback({
        tone: 'error',
        message: 'اكتب سببًا واضحًا لإعادة فتح الحجز من 3 أحرف على الأقل.',
      });
      return;
    }
    const formData = new FormData();
    formData.set('bookingId', selectedReopen.id);
    formData.set('reason', reopenReason);
    const completed = await finishAction(
      () => reopenTerminalBookingAction(formData),
      'أعيد الحجز إلى المراجعة الإدارية دون عكس أي تسوية أو زيارة أو حجز مؤقت.',
    );
    if (completed) {
      setSelectedReopen(null);
      setReopenReason('');
    }
  }

  async function handleCloseTerminalReview() {
    if (!selectedTerminalReview || terminalReviewReason.trim().length < 3) {
      setFeedback({
        tone: 'error',
        message: 'اكتب سببًا واضحًا لإغلاق المراجعة من 3 أحرف على الأقل.',
      });
      return;
    }
    const formData = new FormData();
    formData.set('bookingId', selectedTerminalReview.id);
    formData.set('reason', terminalReviewReason);
    const completed = await finishAction(
      () => closeTerminalBookingReviewAction(formData),
      'أُغلقت المراجعة وعاد الحجز إلى حالته الطرفية الأصلية دون تغيير أي تسوية.',
    );
    if (completed) {
      setSelectedTerminalReview(null);
      setTerminalReviewReason('');
    }
  }

  return (
    <div className="space-y-8">
      <div aria-live="polite" className="min-h-6">
        {feedback && (
          <p
            className={`rounded-xl border px-4 py-3 text-sm ${
              feedback.tone === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/40 bg-red-500/10 text-red-300'
            }`}
          >
            {feedback.message}
          </p>
        )}
      </div>

      <p className="text-sm text-neutral-400">
        المستخدم الحالي: <span className="font-bold text-white">{manager.fullName}</span>
      </p>

      {branches && branches.length > 0 && (
        <section aria-labelledby="schedule-lock-heading" className="rounded-3xl border border-[#c9a227]/30 bg-[#141414] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 id="schedule-lock-heading" className="flex items-center gap-2 text-base font-bold text-white">
                <Lock className="size-4 text-[#c9a227]" aria-hidden="true" />
                التحكم في استقبال الحجوزات وجداول المواعيد
              </h2>
              <p className="text-xs text-neutral-400">
                يمكن لمدير التشغيل قفل جدول المواعيد مؤقتًا لأي فرع لإيقاف الحجز من الموقع فوراً أو إعادة فتحه
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {branches.map((branch) => {
                const isLocked = branch.status !== 'ACTIVE';
                return (
                  <div key={branch.id} className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 text-xs ${isLocked ? 'border-red-500/40 bg-red-500/10' : 'border-emerald-500/40 bg-emerald-500/10'}`}>
                    <div>
                      <span className="font-bold text-white">{branch.nameAr}:</span>{' '}
                      <span className={isLocked ? 'text-red-400 font-semibold' : 'text-emerald-400 font-semibold'}>
                        {isLocked ? '🔴 مقفل مؤقتًا (لا يستقبل حجوزات)' : '🟢 مفتوح ويستقبل الحجوزات'}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setSelectedLockBranch(branch);
                        setLockReason('');
                        setFeedback(null);
                      }}
                      className={`rounded-xl px-3 py-1.5 font-bold transition ${
                        isLocked
                          ? 'bg-emerald-500 text-black hover:bg-emerald-400'
                          : 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
                      }`}
                    >
                      {isLocked ? 'فتح استقبال الحجز' : 'قفل جدول المواعيد'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricButton
          active={activeTab === 'proofs'}
          count={pagedCount(pendingProofs.length, pagination.proofs)}
          label="إثباتات بانتظار المراجعة"
          onClick={() => setActiveTab('proofs')}
          icon={<FileText className="size-5 text-[#c9a227]" aria-hidden="true" />}
        />
        <MetricButton
          active={activeTab === 'review'}
          count={pagedCount(reviewBookings.length, pagination.review)}
          label="حجوزات بانتظار القرار"
          onClick={() => setActiveTab('review')}
          icon={<ShieldCheck className="size-5 text-[#c9a227]" aria-hidden="true" />}
        />
        <MetricButton
          active={activeTab === 'unassigned'}
          count={pagedCount(unassignedBookings.length, pagination.unassigned)}
          label="حجوزات تحتاج فريقًا"
          onClick={() => setActiveTab('unassigned')}
          icon={<Users className="size-5 text-[#c9a227]" aria-hidden="true" />}
        />
        <MetricButton
          active={activeTab === 'bookings'}
          count={pagedCount(activeBookings.length, pagination.bookings)}
          label="الحجوزات النشطة"
          onClick={() => setActiveTab('bookings')}
          icon={<Calendar className="size-5 text-[#c9a227]" aria-hidden="true" />}
        />
        {manager.role === 'OWNER' ? (
          <MetricButton
            active={activeTab === 'terminal'}
            count={pagedCount(terminalBookings.length, pagination.terminal)}
            label="حجوزات طرفية قابلة للمراجعة"
            onClick={() => setActiveTab('terminal')}
            icon={<AlertTriangle className="size-5 text-amber-300" aria-hidden="true" />}
          />
        ) : null}
      </div>

      {activeTab === 'proofs' && (
        <section aria-labelledby="proofs-heading" className="space-y-5 rounded-3xl border border-[#c9a227]/20 bg-[#141414] p-5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="proofs-heading" className="flex items-center gap-2 text-xl font-bold">
              <FileText className="size-5 text-[#c9a227]" aria-hidden="true" />
              مراجعة إثباتات التحويل
            </h2>
            <span className="text-xs text-neutral-500">مراجعة يدوية دون OCR</span>
          </div>
          {pendingProofs.length === 0 ? (
            <p className="rounded-2xl bg-[#080808] p-10 text-center text-sm text-neutral-500">لا توجد إثباتات معلّقة.</p>
          ) : pendingProofs.map((proof) => (
            <article key={proof.id} className="flex flex-col justify-between gap-5 rounded-2xl border border-neutral-800 bg-[#080808] p-5 lg:flex-row lg:items-center">
              <div className="space-y-2 text-sm text-neutral-300">
                <h3 className="font-bold text-[#e5c45a]">{proof.booking.bookingNumber} — {proof.booking.service.nameAr}</h3>
                <p>{proof.booking.customer.user.fullName} • {proof.booking.customer.user.phone}</p>
                <p>المحوّل: {proof.senderName} ({proof.senderPhoneOrAccount})</p>
                <p>المبلغ: <strong className="text-white">{proof.amountSubmitted} ج.م</strong> • المطلوب أوليًا: {Math.max(0, proof.booking.depositAmount - proof.booking.amountPaid)} ج.م</p>
              </div>
              <button type="button" onClick={() => { setSelectedProof(proof); setReviewNotes(''); setFeedback(null); }} className="rounded-xl bg-[#c9a227] px-5 py-3 text-sm font-bold text-black hover:bg-[#e5c45a]">
                فتح المراجعة
              </button>
            </article>
          ))}
          <OperationsQueuePagination queueKey="proofs" pagination={pagination.proofs} dashboardTab="proofs" />
        </section>
      )}

      {activeTab === 'review' && (
        <section aria-labelledby="review-heading" className="space-y-5 rounded-3xl border border-[#c9a227]/20 bg-[#141414] p-5 sm:p-8">
          <h2 id="review-heading" className="flex items-center gap-2 text-xl font-bold">
            <ShieldCheck className="size-5 text-[#c9a227]" aria-hidden="true" />
            مراجعة الحجوزات تشغيليًا
          </h2>
          {reviewBookings.length === 0 ? (
            <p className="rounded-2xl bg-[#080808] p-10 text-center text-sm text-neutral-500">لا توجد حجوزات بانتظار القرار.</p>
          ) : reviewBookings.map((booking) => (
            <article key={booking.id} className="flex flex-col justify-between gap-5 rounded-2xl border border-neutral-800 bg-[#080808] p-5 lg:flex-row lg:items-center">
              <div className="space-y-2 text-sm text-neutral-300">
                <h3 className="font-bold text-[#e5c45a]">{booking.bookingNumber} — {booking.service.nameAr}</h3>
                <p>{booking.customer.user.fullName} • {booking.vehicle.make} {booking.vehicle.model}</p>
                <p>{booking.branch.nameAr} • {booking.coverageArea.compound} • {formatDateTime(booking.startAt)}</p>
                <p>الدفع: {booking.paymentStatus} • مدفوع {booking.amountPaid} ج.م • متبقٍ {booking.amountDue} ج.م</p>
              </div>
              <button type="button" onClick={() => { setSelectedReview(booking); setReviewNotes(''); setFeedback(null); }} className="rounded-xl bg-[#c9a227] px-5 py-3 text-sm font-bold text-black hover:bg-[#e5c45a]">
                اتخاذ القرار
              </button>
            </article>
          ))}
          <OperationsQueuePagination queueKey="review" pagination={pagination.review} dashboardTab="review" />
        </section>
      )}

      {activeTab === 'unassigned' && (
        <section aria-labelledby="assignment-heading" className="space-y-5 rounded-3xl border border-[#c9a227]/20 bg-[#141414] p-5 sm:p-8">
          <h2 id="assignment-heading" className="flex items-center gap-2 text-xl font-bold">
            <Users className="size-5 text-[#c9a227]" aria-hidden="true" />
            قائمة التوزيع اليدوي
          </h2>
          {unassignedBookings.length === 0 ? (
            <p className="rounded-2xl bg-[#080808] p-10 text-center text-sm text-neutral-500">كل الحجوزات المقبولة مسندة.</p>
          ) : unassignedBookings.map((booking) => (
            <article key={booking.id} className="flex flex-col justify-between gap-5 rounded-2xl border border-neutral-800 bg-[#080808] p-5 lg:flex-row lg:items-center">
              <div className="space-y-2 text-sm text-neutral-300">
                <h3 className="font-bold text-[#e5c45a]">{booking.bookingNumber} — {booking.service.nameAr}</h3>
                <p>{booking.branch.nameAr} • {booking.coverageArea.compound}</p>
                <p>{formatDateTime(booking.startAt)} • {booking.bookingStatus}</p>
              </div>
              <button type="button" onClick={() => { setSelectedBooking(booking); setAssignmentReason(''); setFeedback(null); }} className="rounded-xl border border-[#c9a227]/50 px-5 py-3 text-sm font-bold text-[#e5c45a] hover:bg-[#c9a227]/10">
                اختيار فريق
              </button>
            </article>
          ))}
          <OperationsQueuePagination queueKey="unassigned" pagination={pagination.unassigned} dashboardTab="unassigned" />
        </section>
      )}

      {activeTab === 'bookings' && (
        <section aria-labelledby="active-heading" className="space-y-5 rounded-3xl border border-[#c9a227]/20 bg-[#141414] p-5 sm:p-8">
          <h2 id="active-heading" className="flex items-center gap-2 text-xl font-bold">
            <Calendar className="size-5 text-[#c9a227]" aria-hidden="true" />
            الحجوزات النشطة القادمة
          </h2>
          <form onSubmit={(event) => { event.preventDefault(); submitServerSearch('bookingQuery', activeSearch); }} className="flex max-w-2xl flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="active-booking-search">ابحث في الحجوزات النشطة</label>
            <input id="active-booking-search" value={activeSearch} onChange={(event) => setActiveSearch(event.target.value)} type="search" placeholder="رقم الحجز أو العميل أو الهاتف أو الخدمة" className="min-h-11 flex-1 rounded-xl border border-neutral-700 bg-[#080808] px-4 text-sm text-white outline-none focus:border-[#c9a227]" />
            <button type="submit" className="min-h-11 rounded-xl border border-[#c9a227]/45 px-5 text-sm font-bold text-[#e5c45a]">بحث شامل</button>
          </form>
          {activeBookings.length === 0 ? (
            <p className="rounded-2xl bg-[#080808] p-10 text-center text-sm text-neutral-500">لا توجد حجوزات نشطة.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-neutral-800">
              <table className="min-w-full divide-y divide-neutral-800 text-right text-sm">
                <thead className="bg-[#080808] text-neutral-400">
                  <tr><th className="p-4">الحجز</th><th className="p-4">العميل</th><th className="p-4">الموعد</th><th className="p-4">الفريق</th><th className="p-4">الحالة</th><th className="p-4">التسوية</th></tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {activeBookings.map((booking) => (
                    <tr key={booking.id}>
                      <td className="p-4 font-bold text-white">{booking.bookingNumber}<span className="block text-xs font-normal text-neutral-500">{booking.service.nameAr}</span></td>
                      <td className="p-4 text-neutral-300">{booking.customer.user.fullName}</td>
                      <td className="whitespace-nowrap p-4 text-neutral-300">{formatDateTime(booking.startAt)}</td>
                      <td className="p-4 text-neutral-300">{booking.assignedTeam?.name ?? 'غير مسند'}</td>
                      <td className="p-4"><span className="rounded-full bg-[#c9a227]/10 px-3 py-1 text-xs text-[#e5c45a]">{booking.bookingStatus}</span></td>
                      <td className="p-4">
                        <div className="flex min-w-44 flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-800 pb-2">
                            <button
                              type="button"
                              title="تعديل أو تأجيل الموعد"
                              onClick={() => {
                                setSelectedRescheduleBooking(booking);
                                const d = new Date(booking.startAt);
                                setRescheduleDate(d.toISOString().slice(0, 10));
                                setRescheduleTime(d.toTimeString().slice(0, 5));
                                setRescheduleReason('');
                                setFeedback(null);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-300 hover:bg-sky-500/20"
                            >
                              <CalendarClock className="size-3" /> تأجيل / تعديل
                            </button>
                            <button
                              type="button"
                              title="نقل الحجز لفريق آخر"
                              onClick={() => {
                                setSelectedTransferBooking({
                                  id: booking.id,
                                  bookingNumber: booking.bookingNumber,
                                  branchId: booking.branchId,
                                  currentTeamId: booking.assignedTeamId,
                                });
                                setTransferTeamId('');
                                setTransferReason('');
                                setFeedback(null);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-purple-500/40 bg-purple-500/10 px-2 py-1 text-[10px] font-bold text-purple-300 hover:bg-purple-500/20"
                            >
                              <ArrowLeftRight className="size-3" /> نقل تيم
                            </button>
                            <button
                              type="button"
                              title="إلغاء الحجز بقرار تشغيلي"
                              onClick={() => {
                                setSelectedCancelBooking({
                                  id: booking.id,
                                  bookingNumber: booking.bookingNumber,
                                  customerName: booking.customer.user.fullName,
                                });
                                setCancelReason('');
                                setFeedback(null);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-300 hover:bg-red-500/20"
                            >
                              <Ban className="size-3" /> إلغاء
                            </button>
                          </div>
                          {booking.terminalReopenSourceStatus ? (
                            <>
                              <span className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                                مراجعة فقط · الحالة الأصلية {booking.terminalReopenSourceStatus}
                              </span>
                              {manager.role === 'OWNER' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedTerminalReview(booking);
                                    setTerminalReviewReason('');
                                    setFeedback(null);
                                  }}
                                  className="rounded-lg border border-amber-400/50 px-3 py-2 text-xs font-bold text-amber-200"
                                >
                                  إغلاق المراجعة
                                </button>
                              ) : null}
                            </>
                          ) : (
                            <>
                              {booking.amountDue > 0 && booking.canRecordBalancePayment ? (
                                <button type="button" onClick={() => { setSelectedSettlement(booking); setSettlementNotes(''); setFeedback(null); }} className="rounded-lg border border-[#c9a227]/40 px-3 py-2 text-xs font-bold text-[#e5c45a]">
                                  تحصيل {booking.amountDue} ج.م
                                </button>
                              ) : booking.amountDue === 0 ? <span className="text-xs font-bold text-emerald-300">مدفوع بالكامل</span> : null}
                              {booking.canCloseBooking && booking.bookingStatus === 'DELIVERED' && booking.amountDue === 0 ? (
                                <button type="button" onClick={() => { setSelectedClose(booking); setFeedback(null); }} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-black">
                                  إغلاق الحجز
                                </button>
                              ) : null}
                              {booking.canManagerOverrideClose
                                && ['IN_SERVICE', 'QUALITY_REVIEW'].includes(booking.bookingStatus)
                                && booking.amountDue === 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedOverrideClose(booking);
                                      setOverrideReason('');
                                      setFeedback(null);
                                    }}
                                    className="rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200"
                                  >
                                    إغلاق باستثناء إداري
                                  </button>
                                ) : null}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <OperationsQueuePagination queueKey="bookings" pagination={pagination.bookings} dashboardTab="bookings" />
        </section>
      )}

      {activeTab === 'terminal' && manager.role === 'OWNER' ? (
        <section aria-labelledby="terminal-heading" className="space-y-5 rounded-3xl border border-amber-400/20 bg-[#141414] p-5 sm:p-8">
          <div className="space-y-2">
            <h2 id="terminal-heading" className="flex items-center gap-2 text-xl font-bold">
              <AlertTriangle className="size-5 text-amber-300" aria-hidden="true" />
              مراجعة الحجوزات الطرفية
            </h2>
            <p className="text-sm text-neutral-400">
              إعادة الفتح تنقل الحجز إلى ADMIN_REVIEW_REQUIRED فقط، ولا تعكس استردادًا أو زيارة اشتراك أو حجز موعد سابقًا.
            </p>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); submitServerSearch('terminalQuery', terminalSearch); }} className="flex max-w-2xl flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="terminal-booking-search">ابحث في الحجوزات الطرفية</label>
            <input id="terminal-booking-search" value={terminalSearch} onChange={(event) => setTerminalSearch(event.target.value)} type="search" placeholder="رقم الحجز أو العميل أو الهاتف أو الخدمة" className="min-h-11 flex-1 rounded-xl border border-neutral-700 bg-[#080808] px-4 text-sm text-white outline-none focus:border-amber-400" />
            <button type="submit" className="min-h-11 rounded-xl border border-amber-400/45 px-5 text-sm font-bold text-amber-200">بحث شامل</button>
          </form>
          {terminalBookings.length === 0 ? (
            <p className="rounded-2xl bg-[#080808] p-10 text-center text-sm text-neutral-500">لا توجد حجوزات طرفية حديثة.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {terminalBookings.map((booking) => (
                <article key={booking.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-[#e5c45a]">{booking.bookingNumber} — {booking.service.nameAr}</h3>
                      <p className="mt-1 text-sm text-neutral-400">{booking.customer.user.fullName} • {booking.branch.nameAr}</p>
                    </div>
                    <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">{booking.bookingStatus}</span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-neutral-400">
                    <div><dt>الدفع</dt><dd className="mt-1 font-bold text-white">{booking.paymentStatus}</dd></div>
                    <div><dt>الرصيد المستحق</dt><dd className="mt-1 font-bold text-white">{booking.amountDue} ج.م</dd></div>
                    <div><dt>المدفوع</dt><dd className="mt-1 font-bold text-white">{booking.amountPaid} ج.م</dd></div>
                    <div><dt>آخر تحديث</dt><dd className="mt-1 font-bold text-white">{formatDateTime(booking.updatedAt)}</dd></div>
                  </dl>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedReopen(booking);
                      setReopenReason('');
                      setFeedback(null);
                    }}
                    className="mt-4 w-full rounded-xl border border-amber-400/50 px-4 py-3 text-sm font-bold text-amber-200 hover:bg-amber-400/10"
                  >
                    إعادة فتح للمراجعة الإدارية
                  </button>
                </article>
              ))}
            </div>
          )}
          <OperationsQueuePagination queueKey="terminal" pagination={pagination.terminal} dashboardTab="terminal" />
        </section>
      ) : null}

      {selectedProof && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/85 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="proof-dialog-title" className="my-8 w-full max-w-2xl space-y-5 rounded-3xl border border-[#c9a227]/40 bg-[#141414] p-5 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h2 id="proof-dialog-title" className="text-xl font-bold">مراجعة إثبات {selectedProof.booking.bookingNumber}</h2>
              <button type="button" aria-label="إغلاق" disabled={isSubmitting} onClick={() => setSelectedProof(null)} className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white"><X className="size-5" /></button>
            </div>
            <dl className="grid gap-3 rounded-2xl bg-[#080808] p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-neutral-500">الوسيلة</dt><dd>{selectedProof.paymentMethod.name}</dd></div>
              <div><dt className="text-neutral-500">المرجع</dt><dd>{selectedProof.referenceNumber || 'غير مسجل'}</dd></div>
              <div><dt className="text-neutral-500">وقت التحويل</dt><dd>{formatDateTime(selectedProof.transferTimestamp)}</dd></div>
              <div><dt className="text-neutral-500">المبلغ</dt><dd>{selectedProof.amountSubmitted} ج.م</dd></div>
            </dl>
            {selectedProof.proofFileUrl && selectedProof.proofFileUrl.startsWith('/api/files/') ? (
              <a href={selectedProof.proofFileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-[#c9a227]/50 px-4 py-3 text-sm font-bold text-[#e5c45a] hover:bg-[#c9a227]/10">
                فتح الملف الخاص <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            ) : (
              <p className="rounded-xl border border-neutral-800 bg-[#080808] p-3 text-xs text-neutral-400">
                🗑️ تم حذف صورة الإيصال تلقائيًا بعد القبول لتوفير المساحة.
              </p>
            )}
            <div>
              <label htmlFor="proof-notes" className="mb-2 block text-sm font-semibold">ملاحظات القرار</label>
              <textarea id="proof-notes" value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} rows={4} maxLength={1000} className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white focus:border-[#c9a227] focus:outline-none" placeholder="إلزامية لكل قرار عدا الاعتماد" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <button type="button" disabled={isSubmitting} onClick={() => handleReviewProof('VERIFY')} className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-50">اعتماد الإثبات</button>
              <button type="button" disabled={isSubmitting} onClick={() => handleReviewProof('SHORT')} className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-50">المبلغ ناقص</button>
              <button type="button" disabled={isSubmitting} onClick={() => handleReviewProof('REUPLOAD')} className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-50">طلب إعادة رفع</button>
              <button type="button" disabled={isSubmitting} onClick={() => handleReviewProof('DUPLICATE')} className="rounded-xl border border-purple-500/60 px-4 py-3 text-sm font-bold text-purple-300 disabled:opacity-50">اشتباه تكرار</button>
              <button type="button" disabled={isSubmitting} onClick={() => handleReviewProof('REJECT')} className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">رفض الإثبات</button>
            </div>
          </div>
        </div>
      )}

      {selectedReview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="booking-review-title" className="w-full max-w-lg space-y-5 rounded-3xl border border-[#c9a227]/40 bg-[#141414] p-5 sm:p-8">
            <div className="flex items-center justify-between gap-4"><h2 id="booking-review-title" className="text-xl font-bold">قرار الحجز {selectedReview.bookingNumber}</h2><button type="button" aria-label="إغلاق" disabled={isSubmitting} onClick={() => setSelectedReview(null)} className="rounded-lg p-2 text-neutral-400 hover:bg-white/10"><X className="size-5" /></button></div>
            <p className="rounded-2xl bg-[#080808] p-4 text-sm text-neutral-300">{selectedReview.service.nameAr} • {selectedReview.customer.user.fullName}<br />{formatDateTime(selectedReview.startAt)} • {selectedReview.branch.assignmentMode === 'AUTOMATIC' ? 'توزيع تلقائي' : 'توزيع يدوي'}</p>
            <div><label htmlFor="booking-review-reason" className="mb-2 block text-sm font-semibold">سبب القرار</label><textarea id="booking-review-reason" value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} rows={4} maxLength={1000} className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white focus:border-[#c9a227] focus:outline-none" /></div>
            <div className="grid grid-cols-2 gap-3"><button type="button" disabled={isSubmitting} onClick={() => handleBookingReview('ACCEPT')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-50"><CheckCircle2 className="size-4" />اعتماد</button><button type="button" disabled={isSubmitting} onClick={() => handleBookingReview('REJECT')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold disabled:opacity-50"><AlertTriangle className="size-4" />رفض</button></div>
          </div>
        </div>
      )}

      {selectedBooking && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="assignment-dialog-title" className="w-full max-w-lg space-y-5 rounded-3xl border border-[#c9a227]/40 bg-[#141414] p-5 sm:p-8">
            <div className="flex items-center justify-between gap-4"><h2 id="assignment-dialog-title" className="text-xl font-bold">إسناد {selectedBooking.bookingNumber}</h2><button type="button" aria-label="إغلاق" disabled={isSubmitting} onClick={() => setSelectedBooking(null)} className="rounded-lg p-2 text-neutral-400 hover:bg-white/10"><X className="size-5" /></button></div>
            {visibleTeams.length ? (
              <><div><label htmlFor="team-id" className="mb-2 block text-sm font-semibold">الفريق</label><select id="team-id" value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)} className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white focus:border-[#c9a227] focus:outline-none">{visibleTeams.map((team) => <option key={team.id} value={team.id}>{team.name} — {team.members.length} أعضاء</option>)}</select></div><div><label htmlFor="assignment-reason" className="mb-2 block text-sm font-semibold">سبب الإسناد/التجاوز</label><textarea id="assignment-reason" value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} rows={3} maxLength={500} className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white focus:border-[#c9a227] focus:outline-none" /></div><button type="button" disabled={isSubmitting} onClick={handleAssignTeam} className="w-full rounded-xl bg-[#c9a227] px-4 py-3 text-sm font-bold text-black disabled:opacity-50">إعادة الفحص ثم الإسناد</button></>
            ) : <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">لا توجد فرق نشطة تابعة لهذا الفرع.</p>}
          </div>
        </div>
      )}

      {selectedSettlement && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="settlement-title" className="w-full max-w-lg space-y-5 rounded-3xl border border-[#c9a227]/40 bg-[#141414] p-5 sm:p-8">
            <div className="flex items-center justify-between gap-4"><h2 id="settlement-title" className="text-xl font-bold">تأكيد تحصيل الرصيد</h2><button type="button" aria-label="إغلاق" disabled={isSubmitting} onClick={() => setSelectedSettlement(null)} className="rounded-lg p-2 text-neutral-400 hover:bg-white/10"><X className="size-5" /></button></div>
            <div className="rounded-2xl bg-[#080808] p-4 text-sm text-neutral-300"><p className="font-bold text-[#e5c45a]">{selectedSettlement.bookingNumber}</p><p className="mt-2">المبلغ المستحق كاملًا: <strong className="text-white">{selectedSettlement.amountDue} ج.م</strong></p><p className="mt-1 text-xs text-neutral-500">لن يقبل الخادم مبلغًا أكبر من الرصيد الحالي، ومفتاح العملية يمنع التكرار.</p></div>
            <div><label htmlFor="settlement-method" className="mb-2 block text-sm font-semibold">وسيلة التحصيل</label><select id="settlement-method" value={settlementMethod} onChange={(event) => setSettlementMethod(event.target.value)} className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white"><option value="CASH">نقدي</option><option value="BANK_TRANSFER">تحويل بنكي</option><option value="MOBILE_WALLET">محفظة إلكترونية</option><option value="POS">بطاقة عبر POS</option></select></div>
            <div><label htmlFor="settlement-reference" className="mb-2 block text-sm font-semibold">رقم المرجع (اختياري)</label><input id="settlement-reference" value={settlementReference} onChange={(event) => setSettlementReference(event.target.value)} className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white" dir="ltr" /></div>
            <div><label htmlFor="settlement-notes" className="mb-2 block text-sm font-semibold">ملاحظات التحصيل</label><textarea id="settlement-notes" required minLength={3} value={settlementNotes} onChange={(event) => setSettlementNotes(event.target.value)} rows={3} className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white" /></div>
            <button type="button" disabled={isSubmitting} onClick={handleRecordSettlement} className="w-full rounded-xl bg-[#c9a227] px-4 py-3 text-sm font-bold text-black disabled:opacity-50">تأكيد تسجيل {selectedSettlement.amountDue} ج.م</button>
          </div>
        </div>
      )}

      {selectedClose && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="close-booking-title" className="w-full max-w-lg space-y-5 rounded-3xl border border-emerald-500/35 bg-[#141414] p-5 sm:p-8">
            <div className="flex items-center justify-between gap-4"><h2 id="close-booking-title" className="text-xl font-bold">الإغلاق النهائي للحجز</h2><button type="button" aria-label="إغلاق" disabled={isSubmitting} onClick={() => setSelectedClose(null)} className="rounded-lg p-2 text-neutral-400 hover:bg-white/10"><X className="size-5" /></button></div>
            <p className="rounded-2xl bg-[#080808] p-4 text-sm text-neutral-300">الحجز <strong className="text-white">{selectedClose.bookingNumber}</strong> في مرحلة التسليم ورصيده مسدد. سيُسجل الإغلاق في سجل الحالات والتدقيق.</p>
            <div><label htmlFor="close-reason" className="mb-2 block text-sm font-semibold">سبب الإغلاق</label><textarea id="close-reason" required minLength={3} value={closeReason} onChange={(event) => setCloseReason(event.target.value)} rows={3} className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white" /></div>
            <button type="button" disabled={isSubmitting} onClick={handleCloseBooking} className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-50">تأكيد الإغلاق النهائي</button>
          </div>
        </div>
      )}

      {selectedOverrideClose && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="override-close-title" className="w-full max-w-lg space-y-5 rounded-3xl border border-amber-400/40 bg-[#141414] p-5 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h2 id="override-close-title" className="text-xl font-bold">إغلاق باستثناء إداري</h2>
              <button type="button" aria-label="إغلاق" disabled={isSubmitting} onClick={() => setSelectedOverrideClose(null)} className="rounded-lg p-2 text-neutral-400 hover:bg-white/10"><X className="size-5" /></button>
            </div>
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-4 text-sm text-amber-100">
              <p className="font-bold">{selectedOverrideClose.bookingNumber} — {selectedOverrideClose.bookingStatus}</p>
              <p className="mt-2 leading-6">سيُتجاوز فقط اكتمال قوائم الفحص المطلوبة وصور ما بعد الخدمة واعتماد الجودة. لن يُتجاوز إسناد الفريق أو الرصيد المستحق، وستُسجل زيارة الاشتراك إن وجدت.</p>
            </div>
            <div>
              <label htmlFor="override-close-reason" className="mb-2 block text-sm font-semibold">سبب الاستثناء الإداري</label>
              <textarea id="override-close-reason" required minLength={3} maxLength={1000} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} rows={4} className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white focus:border-amber-400 focus:outline-none" />
            </div>
            <button type="button" disabled={isSubmitting} onClick={handleManagerOverrideClose} className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-black disabled:opacity-50">
              تأكيد الاستثناء والإغلاق
            </button>
          </div>
        </div>
      )}

      {selectedTerminalReview && manager.role === 'OWNER' ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="close-terminal-review-title" className="w-full max-w-lg space-y-5 rounded-3xl border border-amber-400/40 bg-[#141414] p-5 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h2 id="close-terminal-review-title" className="text-xl font-bold">إغلاق المراجعة الإدارية</h2>
              <button type="button" aria-label="إغلاق" disabled={isSubmitting} onClick={() => setSelectedTerminalReview(null)} className="rounded-lg p-2 text-neutral-400 hover:bg-white/10"><X className="size-5" /></button>
            </div>
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-4 text-sm leading-7 text-amber-100">
              <p className="font-bold">{selectedTerminalReview.bookingNumber}</p>
              <p>سيعود الحجز إلى {selectedTerminalReview.terminalReopenSourceStatus} مع إبقاء الدفعات والاستردادات والإسناد وسجل الزيارات كما هي. لا يمكن تشغيل الحجز أو إسناده أثناء هذه المراجعة.</p>
            </div>
            <div>
              <label htmlFor="terminal-review-close-reason" className="mb-2 block text-sm font-semibold">سبب إغلاق المراجعة</label>
              <textarea id="terminal-review-close-reason" required minLength={3} maxLength={1000} value={terminalReviewReason} onChange={(event) => setTerminalReviewReason(event.target.value)} rows={4} className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white focus:border-amber-400 focus:outline-none" />
            </div>
            <button type="button" disabled={isSubmitting} onClick={handleCloseTerminalReview} className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-black disabled:opacity-50">
              إغلاق المراجعة وإعادة الحالة الأصلية
            </button>
          </div>
        </div>
      ) : null}

      {selectedReopen && manager.role === 'OWNER' ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="reopen-terminal-title" className="w-full max-w-lg space-y-5 rounded-3xl border border-amber-400/40 bg-[#141414] p-5 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h2 id="reopen-terminal-title" className="text-xl font-bold">إعادة فتح حجز طرفي</h2>
              <button type="button" aria-label="إغلاق" disabled={isSubmitting} onClick={() => setSelectedReopen(null)} className="rounded-lg p-2 text-neutral-400 hover:bg-white/10"><X className="size-5" /></button>
            </div>
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-4 text-sm text-amber-100">
              <p className="font-bold">{selectedReopen.bookingNumber}: {selectedReopen.bookingStatus} → ADMIN_REVIEW_REQUIRED</p>
              <p className="mt-2 leading-6">ستبقى كل الدفعات والاستردادات وقيود الزيارات والحجوزات المؤقتة السابقة كما هي. إعادة الفتح لا تعني إعادة الخدمة أو المال تلقائيًا.</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-[#080808] p-4 text-sm">
              <div><dt className="text-neutral-500">حالة الدفع</dt><dd className="mt-1 font-bold">{selectedReopen.paymentStatus}</dd></div>
              <div><dt className="text-neutral-500">الرصيد المستحق</dt><dd className="mt-1 font-bold">{selectedReopen.amountDue} ج.م</dd></div>
            </dl>
            <div>
              <label htmlFor="reopen-terminal-reason" className="mb-2 block text-sm font-semibold">سبب إعادة الفتح</label>
              <textarea id="reopen-terminal-reason" required minLength={3} maxLength={1000} value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} rows={4} className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white focus:border-amber-400 focus:outline-none" />
            </div>
            <button type="button" disabled={isSubmitting} onClick={handleReopenTerminalBooking} className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-black disabled:opacity-50">
              إعادة الفتح للمراجعة الإدارية
            </button>
          </div>
        </div>
      ) : null}

      {/* Operational Modal: Reschedule / Shift */}
      {selectedRescheduleBooking && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/85 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="reschedule-modal-title" className="my-8 w-full max-w-lg space-y-5 rounded-3xl border border-sky-500/40 bg-[#141414] p-5 shadow-2xl sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h2 id="reschedule-modal-title" className="text-lg font-bold flex items-center gap-2 text-white">
                <CalendarClock className="size-5 text-sky-400" />
                تعديل / تأجيل موعد {selectedRescheduleBooking.bookingNumber}
              </h2>
              <button type="button" aria-label="إغلاق" disabled={isSubmitting} onClick={() => setSelectedRescheduleBooking(null)} className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white">
                <X className="size-5" />
              </button>
            </div>

            <div className="rounded-2xl bg-[#080808] p-4 text-xs text-neutral-300 space-y-1">
              <p>الموعد الحالي: <strong className="text-white">{formatDateTime(selectedRescheduleBooking.startAt)}</strong></p>
            </div>

            <div className="space-y-3">
              <span className="block text-xs font-bold text-neutral-400">خيارات سريعة للتشغيل:</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    const current = new Date(selectedRescheduleBooking.startAt);
                    const shifted = new Date(current.getTime() + 60 * 60_000);
                    setRescheduleDate(shifted.toISOString().slice(0, 10));
                    setRescheduleTime(shifted.toTimeString().slice(0, 5));
                  }}
                  className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-2 font-bold text-sky-300 hover:bg-sky-500/20"
                >
                  +1 ساعة
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const current = new Date(selectedRescheduleBooking.startAt);
                    const shifted = new Date(current.getTime() + 120 * 60_000);
                    setRescheduleDate(shifted.toISOString().slice(0, 10));
                    setRescheduleTime(shifted.toTimeString().slice(0, 5));
                  }}
                  className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-2 font-bold text-sky-300 hover:bg-sky-500/20"
                >
                  +2 ساعة
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const current = new Date(selectedRescheduleBooking.startAt);
                    const shifted = new Date(current.getTime() + 24 * 60 * 60_000);
                    setRescheduleDate(shifted.toISOString().slice(0, 10));
                    setRescheduleTime(shifted.toTimeString().slice(0, 5));
                  }}
                  className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-2 font-bold text-sky-300 hover:bg-sky-500/20"
                >
                  غداً نفس الموعد
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const current = new Date(selectedRescheduleBooking.startAt);
                    const shifted = new Date(current.getTime() + 48 * 60 * 60_000);
                    setRescheduleDate(shifted.toISOString().slice(0, 10));
                    setRescheduleTime(shifted.toTimeString().slice(0, 5));
                  }}
                  className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-2 font-bold text-sky-300 hover:bg-sky-500/20"
                >
                  بعد يومين
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="reschedule-date" className="mb-2 block text-xs font-semibold text-neutral-300">التاريخ الجديد</label>
                <input
                  id="reschedule-date"
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white focus:border-sky-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="reschedule-time" className="mb-2 block text-xs font-semibold text-neutral-300">الوقت الجديد</label>
                <input
                  id="reschedule-time"
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white focus:border-sky-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="reschedule-reason" className="mb-2 block text-xs font-semibold text-neutral-300">سبب التأجيل أو تعديل الموعد</label>
              <textarea
                id="reschedule-reason"
                required
                minLength={3}
                maxLength={500}
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="مثلاً: طلب العميل هاتفياً، ازدحام طارئ، تأخير في الطريق..."
                rows={3}
                className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white focus:border-sky-400 focus:outline-none"
              />
            </div>

            <button
              type="button"
              disabled={isSubmitting || !rescheduleDate || !rescheduleTime}
              onClick={handleRescheduleBooking}
              className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-bold text-black hover:bg-sky-400 disabled:opacity-50"
            >
              حفظ الموعد الجديد وتحديث الحجز
            </button>
          </div>
        </div>
      )}

      {/* Operational Modal: Transfer Team */}
      {selectedTransferBooking && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="transfer-dialog-title" className="w-full max-w-lg space-y-5 rounded-3xl border border-purple-500/40 bg-[#141414] p-5 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h2 id="transfer-dialog-title" className="text-lg font-bold flex items-center gap-2 text-white">
                <ArrowLeftRight className="size-5 text-purple-400" />
                نقل الحجز {selectedTransferBooking.bookingNumber} لفريق آخر
              </h2>
              <button type="button" aria-label="إغلاق" disabled={isSubmitting} onClick={() => setSelectedTransferBooking(null)} className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white">
                <X className="size-5" />
              </button>
            </div>

            {visibleTeamsForTransfer.length > 0 ? (
              <>
                <div>
                  <label htmlFor="transfer-team-select" className="mb-2 block text-xs font-semibold text-neutral-300">اختر الفريق الجديد</label>
                  <select
                    id="transfer-team-select"
                    value={transferTeamId}
                    onChange={(e) => setTransferTeamId(e.target.value)}
                    className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white focus:border-purple-400 focus:outline-none"
                  >
                    <option value="">-- اختر الفريق --</option>
                    {visibleTeamsForTransfer.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({team.members.length} أعضاء)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="transfer-reason" className="mb-2 block text-xs font-semibold text-neutral-300">سبب نقل الحجز</label>
                  <textarea
                    id="transfer-reason"
                    required
                    minLength={3}
                    maxLength={500}
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    placeholder="مثلاً: إعادة توزيع أحمال، عطل سيارة الفريق السابق..."
                    rows={3}
                    className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white focus:border-purple-400 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={isSubmitting || !transferTeamId}
                  onClick={handleTransferTeam}
                  className="w-full rounded-xl bg-purple-500 px-4 py-3 text-sm font-bold text-white hover:bg-purple-400 disabled:opacity-50"
                >
                  تأكيد نقل الحجز للفريق الجديد
                </button>
              </>
            ) : (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                لا توجد فرق أخرى متاحة في هذا الفرع لنقل الحجز إليها.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Operational Modal: Cancel Booking */}
      {selectedCancelBooking && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-modal-title" className="w-full max-w-lg space-y-5 rounded-3xl border border-red-500/40 bg-[#141414] p-5 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h2 id="cancel-modal-title" className="text-lg font-bold flex items-center gap-2 text-red-400">
                <Ban className="size-5" />
                إلغاء الحجز {selectedCancelBooking.bookingNumber}
              </h2>
              <button type="button" aria-label="إغلاق" disabled={isSubmitting} onClick={() => setSelectedCancelBooking(null)} className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white">
                <X className="size-5" />
              </button>
            </div>

            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              <p className="font-bold">تحذير:</p>
              <p className="mt-1 text-xs leading-5">
                سيتم إلغاء الحجز فورًا وتحرير أي حجز مؤقت على الموعد وتسجيل الإلغاء في سجلات التدقيق والحالات.
              </p>
            </div>

            <div>
              <label htmlFor="cancel-reason-input" className="mb-2 block text-xs font-semibold text-neutral-300">سبب الإلغاء الإداري</label>
              <textarea
                id="cancel-reason-input"
                required
                minLength={3}
                maxLength={1000}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="اكتب سبب إلغاء الحجز..."
                rows={3}
                className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white focus:border-red-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setSelectedCancelBooking(null)}
                className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-sm font-bold text-white hover:bg-neutral-700"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={isSubmitting || cancelReason.trim().length < 3}
                onClick={handleCancelBooking}
                className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                تأكيد الإلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Operational Modal: Schedule Lock / Pause Bookings */}
      {selectedLockBranch && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="lock-modal-title" className="w-full max-w-lg space-y-5 rounded-3xl border border-[#c9a227]/40 bg-[#141414] p-5 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <h2 id="lock-modal-title" className="text-lg font-bold flex items-center gap-2 text-white">
                {selectedLockBranch.status === 'ACTIVE' ? <Lock className="size-5 text-red-400" /> : <Unlock className="size-5 text-emerald-400" />}
                {selectedLockBranch.status === 'ACTIVE'
                  ? `قفل جدول مواعيد ${selectedLockBranch.nameAr}`
                  : `فتح جدول مواعيد ${selectedLockBranch.nameAr}`}
              </h2>
              <button type="button" aria-label="إغلاق" disabled={isSubmitting} onClick={() => setSelectedLockBranch(null)} className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white">
                <X className="size-5" />
              </button>
            </div>

            <div className={`rounded-2xl border p-4 text-xs leading-6 ${selectedLockBranch.status === 'ACTIVE' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
              {selectedLockBranch.status === 'ACTIVE'
                ? 'عند قفل جدول المواعيد، لن يتمكن أي عميل من اختيار مواعيد أو حجز خدمات من الموقع لهذا الفرع حتى تقوم بإلغاء القفل.'
                : 'سيتم فتح جدول المواعيد فوراً وإتاحة الحجز واستقبال طلبات العملاء من الموقع.'}
            </div>

            <div>
              <label htmlFor="lock-reason-input" className="mb-2 block text-xs font-semibold text-neutral-300">ملاحظة / سبب الإجراء (اختياري)</label>
              <textarea
                id="lock-reason-input"
                maxLength={500}
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder={selectedLockBranch.status === 'ACTIVE' ? 'مثلاً: أعمال صيانة وتجهيز تشغيلي، طقس غير مناسب...' : 'استئناف العمل بشكل طبيعي'}
                rows={3}
                className="w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white focus:border-[#c9a227] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setSelectedLockBranch(null)}
                className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-sm font-bold text-white hover:bg-neutral-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleToggleScheduleLock}
                className={`rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-50 ${
                  selectedLockBranch.status === 'ACTIVE'
                    ? 'bg-red-600 text-white hover:bg-red-500'
                    : 'bg-emerald-500 text-black hover:bg-emerald-400'
                }`}
              >
                {selectedLockBranch.status === 'ACTIVE' ? 'تأكيد قفل الجدول' : 'تأكيد فتح واستئناف الحجز'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
