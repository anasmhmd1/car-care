'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeDollarSign,
  Ban,
  BarChart3,
  Boxes,
  Calendar,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileSearch,
  FileText,
  Globe,
  History,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  PackageCheck,
  Phone,
  Search,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  User,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import BareeqLogo from '@/components/BareeqLogo';
import { logoutAction } from '@/app/actions/auth';
import SubscriptionManagementPanel, {
  type ManagedSubscription,
} from '@/app/admin/subscriptions/SubscriptionManagementPanel';
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
import { reopenTerminalBookingAction } from '@/app/actions/booking-administration';
import OperationsQueuePagination from './OperationsQueuePagination';
import {
  operationsQueuePageParam,
  type OperationsDashboardQueueKey,
  type OperationsQueuePagination as QueuePagination,
} from './pagination';

type DateValue = string | Date;
type Tab = OperationsDashboardQueueKey | 'cases' | 'subscriptions' | 'quality';
type ProofDecision = 'VERIFY' | 'REJECT' | 'SHORT' | 'REUPLOAD' | 'DUPLICATE';

export type { ManagedSubscription };

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
  customer?: { user: UserSummary };
}

interface TeamSummary {
  id: string;
  branchId: string;
  name: string;
  members: Array<{ id: string; fullName?: string }>;
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
  managedSubscriptions?: ManagedSubscription[];
  activeBookingQuery: string;
  terminalBookingQuery: string;
  initialTab?: OperationsDashboardQueueKey;
  pagination: Record<OperationsDashboardQueueKey, QueuePagination>;
  caseQueuesSlot?: ReactNode;
  qualityQueuesSlot?: ReactNode;
  openCasesCount?: number;
  qualityBookingsCount?: number;
  selectedDate?: string;
  todayDate?: string;
  tomorrowDate?: string;
  canOpenWorkforce?: boolean;
  canOpenPricing?: boolean;
  canOpenCustomerReviews?: boolean;
}

interface Feedback {
  tone: 'success' | 'error';
  message: string;
}

const currencyFormatter = new Intl.NumberFormat('ar-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat('ar-EG');
const dateTimeFormatter = new Intl.DateTimeFormat('ar-EG', {
  timeZone: 'Africa/Cairo',
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatDateTime(value: DateValue) {
  return dateTimeFormatter.format(new Date(value));
}

const badgeTone: Record<string, string> = {
  ACTIVE: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  VERIFIED: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  FULLY_PAID: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  SERVICE_COMPLETED: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  DELIVERED: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  CLOSED: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  PENDING: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  UNDER_REVIEW: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  PAYMENT_UNDER_REVIEW: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  AWAITING_OPERATIONS_REVIEW: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  AWAITING_ASSIGNMENT: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  QUALITY_REVIEW: 'border-violet-300/30 bg-violet-300/10 text-violet-100',
  OPEN: 'border-red-300/30 bg-red-300/10 text-red-100',
  ACTION_REQUIRED: 'border-red-300/30 bg-red-300/10 text-red-100',
  REJECTED: 'border-red-300/30 bg-red-300/10 text-red-100',
  CANCELLED: 'border-red-300/30 bg-red-300/10 text-red-100',
};

const inputClass =
  'w-full rounded-xl border border-neutral-800 bg-[#121215] px-4 py-2.5 text-xs sm:text-sm text-white placeholder:text-neutral-500 hover:border-neutral-700 focus-visible:border-[#d4af37] focus-visible:ring-2 focus-visible:ring-[#d4af37]/30 disabled:cursor-not-allowed disabled:opacity-60 transition-all';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#e5c45a] to-[#d4af37] px-4 py-2.5 text-xs sm:text-sm font-bold text-neutral-950 hover:brightness-110 active:scale-98 shadow-md shadow-[#d4af37]/20 focus-visible:ring-2 focus-visible:ring-[#f0d879] disabled:cursor-not-allowed disabled:opacity-55 transition-all';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/80 px-4 py-2.5 text-xs sm:text-sm font-semibold text-neutral-200 hover:border-neutral-700 hover:bg-neutral-800 hover:text-white active:scale-98 focus-visible:ring-2 focus-visible:ring-neutral-600 disabled:cursor-not-allowed disabled:opacity-55 transition-all';

function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${
        badgeTone[status] ?? 'border-neutral-800 bg-neutral-900/80 text-neutral-300'
      }`}
    >
      {label ?? status}
    </span>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-neutral-800/80 pb-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[#d4af37] shadow-sm shadow-[#d4af37]" />
          <p className="text-xs font-bold uppercase tracking-widest text-[#d4af37]">{eyebrow}</p>
        </div>
        <h2 className="mt-1 text-balance text-2xl font-black tracking-tight text-white sm:text-3xl">
          {title}
        </h2>
        <p className="mt-1.5 max-w-3xl text-pretty text-xs sm:text-sm leading-6 text-neutral-400">{description}</p>
      </div>
      {action}
    </div>
  );
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
  managedSubscriptions = [],
  activeBookingQuery,
  terminalBookingQuery,
  initialTab,
  pagination,
  caseQueuesSlot,
  qualityQueuesSlot,
  openCasesCount = 0,
  qualityBookingsCount = 0,
  selectedDate,
  todayDate,
  tomorrowDate,
  canOpenWorkforce = true,
  canOpenPricing = true,
  canOpenCustomerReviews = true,
}: Props) {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>(
    initialTab ?? (manager.role === 'OWNER' && terminalBookingQuery
      ? 'terminal'
      : activeBookingQuery
        ? 'bookings'
        : 'proofs'),
  );

  // Modals state
  const [selectedProof, setSelectedProof] = useState<PendingProof | null>(null);
  const [selectedReview, setSelectedReview] = useState<ReviewBooking | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<UnassignedBooking | null>(null);
  const [selectedSettlement, setSelectedSettlement] = useState<ActiveBooking | null>(null);
  const [selectedClose, setSelectedClose] = useState<ActiveBooking | null>(null);
  const [selectedReopen, setSelectedReopen] = useState<TerminalBooking | null>(null);
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

  // Form Fields
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [assignmentReason, setAssignmentReason] = useState('');
  const [settlementMethod, setSettlementMethod] = useState('CASH');
  const [settlementReference, setSettlementReference] = useState('');
  const [settlementNotes, setSettlementNotes] = useState('');
  const [closeReason, setCloseReason] = useState('تم تسليم الخدمة وتحصيل كامل الرصيد');
  const [reopenReason, setReopenReason] = useState('');
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

  function handleSelectDate(newDate?: string) {
    const params = new URLSearchParams(window.location.search);
    if (newDate) {
      params.set('date', newDate);
    } else {
      params.delete('date');
    }
    if (activeTab) {
      params.set('dashboardTab', activeTab);
    }
    params.delete('page_proofs');
    params.delete('page_review');
    params.delete('page_unassigned');
    params.delete('page_bookings');
    params.delete('page_terminal');
    params.delete('page_quality');
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
      selectedProof ||
      selectedReview ||
      selectedBooking ||
      selectedSettlement ||
      selectedClose ||
      selectedReopen ||
      selectedCancelBooking ||
      selectedRescheduleBooking ||
      selectedTransferBooking ||
      selectedLockBranch
    );
    if (!modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isSubmitting) return;
      setSelectedProof(null);
      setSelectedReview(null);
      setSelectedBooking(null);
      setSelectedSettlement(null);
      setSelectedClose(null);
      setSelectedReopen(null);
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
    selectedProof,
    selectedReopen,
    selectedReview,
    selectedSettlement,
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

  const primaryPendingCount =
    pendingProofs.length + reviewBookings.length + unassignedBookings.length;

  const sectionNav: Array<{
    id?: string;
    href?: string;
    label: string;
    icon: typeof LayoutDashboard;
    badgeCount?: number;
  }> = [
    {
      id: 'overview',
      label: 'الرئيسية',
      icon: LayoutDashboard,
      badgeCount: primaryPendingCount,
    },
    {
      href: '/admin/calendar',
      label: 'تقويم التشغيل',
      icon: CalendarDays,
    },
    {
      href: '/admin/reports',
      label: 'تقارير التشغيل',
      icon: BarChart3,
    },
    {
      href: '/operations/resources',
      label: 'المخزون',
      icon: Boxes,
    },
    ...(canOpenWorkforce
      ? [
          {
            href: '/operations/workforce',
            label: 'الموظفون',
            icon: UsersRound,
          },
        ]
      : []),
    ...(canOpenPricing
      ? [
          {
            href: '/operations/pricing',
            label: 'إدارة الأسعار',
            icon: BadgeDollarSign,
          },
        ]
      : []),
    ...(canOpenCustomerReviews
      ? [
          {
            href: '/admin/reviews',
            label: 'تقييمات العملاء',
            icon: ClipboardCheck,
          },
        ]
      : []),
    {
      href: '/operations/audit',
      label: 'سجل التدقيق',
      icon: History,
    },
    {
      href: '/operations/password-resets',
      label: 'كلمات المرور',
      icon: KeyRound,
    },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-[#09090c] text-white selection:bg-[#d4af37]/30 selection:text-white">
      <a
        href="#operations-main"
        className="sr-only rounded-lg bg-[#d4af37] px-4 py-2 font-bold text-black focus:not-sr-only focus:fixed focus:right-4 focus:top-4 focus:z-[60]"
      >
        تخطي إلى المحتوى
      </a>

      {/* Executive Command Header matching Owner Navbar Identity */}
      <header className="sticky top-0 z-50 bg-[#080808]/90 backdrop-blur-md border-b border-[#cea355]/20 py-3 shadow-xl">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-row items-center justify-between">
          {/* Brand Official Logo */}
          <div className="flex items-center shrink-0">
            <Link href="/operations" className="flex items-center" aria-label="بريق | BAREEQ">
              <BareeqLogo size="md" />
            </Link>
          </div>

          {/* Action Buttons, Manager Identity & Mobile Menu */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Manager Pill Badge (Desktop / Tablet) */}
            <div className="hidden sm:flex items-center gap-1.5 xs:gap-2 px-3 py-1.5 xs:px-4 xs:py-2 rounded-xl gold-gradient text-white font-bold text-xs xs:text-sm shadow-lg shadow-[#cea355]/25">
              <User className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-white" aria-hidden="true" />
              <span>{manager.fullName}</span>
              <span className="text-[10px] bg-black/30 text-white px-2 py-0.5 rounded font-black border border-white/20">
                OPERATIONS
              </span>
            </div>

            {/* Website Link */}
            <Link
              href="/"
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 xs:px-3.5 xs:py-2 rounded-xl bg-[#141414] border border-white/20 text-neutral-200 hover:border-[#cea355]/50 hover:text-white transition-all text-xs font-semibold"
            >
              <Globe className="w-3.5 h-3.5 text-neutral-400" />
              <span>الموقع</span>
              <ExternalLink className="w-3 h-3 text-neutral-500" />
            </Link>

            {/* Mobile Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex lg:hidden items-center gap-1.5 rounded-xl border border-[#c9a227]/40 bg-[#c9a227]/10 px-3 py-2 text-xs font-bold text-[#e5c45a] transition hover:bg-[#c9a227]/20 focus:outline-none focus:ring-2 focus:ring-[#e5c45a]"
              aria-label="فتح قائمة لوحة التشغيل"
            >
              <Menu className="size-4" aria-hidden="true" />
              <span>القائمة</span>
            </button>
          </div>
        </div>
      </header>

      {/* Slide-over Mobile Drawer for Small Screens */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div
            className="fixed inset-y-0 right-0 z-50 flex w-[85%] max-w-xs flex-col justify-between border-l border-[#c9a227]/30 bg-[#121212] p-5 shadow-2xl transition-transform duration-300 overflow-y-auto"
            dir="rtl"
          >
            <div>
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <BareeqLogo size="sm" />
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#e5c45a]"
                  aria-label="إغلاق القائمة"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>

              {/* Manager Info Card in Mobile Drawer */}
              <div className="mt-4 rounded-2xl border border-neutral-800 bg-[#080808] p-3.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#e5c45a]">
                  <ShieldCheck className="size-3 text-[#d4af37]" />
                  <span>لوحة مدير التشغيل</span>
                </div>
                <p className="mt-0.5 truncate text-sm font-black text-white">{manager.fullName}</p>
              </div>

              {/* Section Links */}
              <nav className="mt-4 flex flex-col gap-1.5" aria-label="أقسام لوحة التشغيل">
                {sectionNav.map((item) => {
                  const Icon = item.icon;
                  const active = item.id ? (item.id === 'overview' ? activeTab !== 'cases' : activeTab === 'cases') : false;

                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        if (item.id === 'overview') setActiveTab('proofs');
                        else if (item.id === 'subscriptions') setActiveTab('subscriptions');
                        else if (item.id === 'cases') setActiveTab('cases');
                        else if (item.href) router.push(item.href);
                      }}
                      className={`inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3.5 text-xs font-bold transition-all ${
                        active
                          ? 'border border-[#cea355] bg-[#cea355]/15 text-[#edce8b] shadow-sm shadow-[#cea355]/10 font-black ring-1 ring-[#cea355]/30'
                          : 'border border-transparent text-neutral-400 hover:border-neutral-800 hover:bg-white/[0.04] hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className={`size-4 shrink-0 ${active ? 'text-[#edce8b]' : 'text-[#c9a227]'}`} />
                        <span>{item.label}</span>
                      </span>
                      {item.badgeCount && item.badgeCount > 0 ? (
                        <span className="rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 text-[10px] font-black">
                          {formatNumber(item.badgeCount)}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Bottom Actions in Drawer */}
            <div className="mt-6 space-y-2 border-t border-neutral-800 pt-4">
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 text-xs font-bold text-red-300 transition hover:bg-red-500/15"
                >
                  <LogOut className="size-4 text-rose-400" />
                  <span>تسجيل الخروج</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Main Content & Desktop Sticky Sidebar */}
      <main
        id="operations-main"
        className="mx-auto max-w-[1600px] gap-6 px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:px-8 lg:py-8"
      >
        {/* Sticky Desktop Sidebar */}
        <aside aria-label="أقسام لوحة التشغيل" className="hidden lg:block min-w-0 lg:sticky lg:top-[90px] lg:self-start">
          <nav className="rounded-2xl border border-neutral-800/80 bg-[#0e0e12]/90 backdrop-blur-xl p-2.5 shadow-xl space-y-1">
            {sectionNav.map((item) => {
              const Icon = item.icon;
              const active = item.id
                ? (item.id === 'overview'
                    ? activeTab !== 'cases' && activeTab !== 'subscriptions'
                    : activeTab === item.id)
                : false;

              if (item.href) {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-all duration-200"
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon aria-hidden="true" className="size-4 text-neutral-400" />
                      {item.label}
                    </span>
                  </Link>
                );
              }

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    if (item.id === 'overview') setActiveTab('proofs');
                    else if (item.id === 'subscriptions') setActiveTab('subscriptions');
                    else if (item.id === 'cases') setActiveTab('cases');
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all duration-200 ${
                    active
                      ? 'bg-gradient-to-r from-[#d4af37] via-[#e5c45a] to-[#d4af37] text-neutral-950 shadow-md shadow-[#d4af37]/20 font-bold'
                      : 'text-neutral-300 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon aria-hidden="true" className={`size-4 ${active ? 'text-neutral-950' : 'text-neutral-400'}`} />
                    {item.label}
                  </span>
                  {item.badgeCount && item.badgeCount > 0 ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${
                        active
                          ? 'bg-black/20 text-neutral-950'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {formatNumber(item.badgeCount)}
                    </span>
                  ) : null}
                </button>
              );
            })}

            {/* Logout Button in Sidebar */}
            <div className="pt-2 mt-2 border-t border-neutral-800/80">
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-rose-300 hover:bg-rose-500/10 transition-all border border-rose-500/20 bg-rose-500/5"
                >
                  <LogOut className="size-4 text-rose-400" />
                  <span>تسجيل الخروج</span>
                </button>
              </form>
            </div>
          </nav>
        </aside>

        {/* Main Work Area */}
        <div className="min-w-0 space-y-7">
          {/* Feedback Bar */}
          <div aria-live="polite" className="min-h-5">
            {feedback && (
              <p
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg ${
                  feedback.tone === 'success'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                }`}
              >
                {feedback.message}
              </p>
            )}
          </div>

          {/* Executive Section Header */}
          <SectionHeader
            eyebrow="OPERATIONS COMMAND CENTER"
            title="مركز قيادة العمليات والتشغيل"
            description="إدارة شاملة ومباشرة للتحقق من إثباتات الدفع، اعتماد الحجوزات، إسناد الفرق، ضبط استقبال الفروع، والمتابعة الميدانية."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                  {branches.filter((b) => b.status === 'ACTIVE').length} فروع تستقبل الحجز
                </span>
              </div>
            }
          />

          {/* Operations Date Filter Toolbar */}
          <div className="flex flex-col gap-3 rounded-2xl border border-neutral-800/80 bg-[#0e0e12]/90 backdrop-blur-xl p-3 sm:p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-[#d4af37]">
                <CalendarDays className="size-4" />
                <span>فلترة مواعيد التشغيل:</span>
              </span>

              <button
                type="button"
                onClick={() => handleSelectDate(undefined)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                  !selectedDate
                    ? 'bg-[#d4af37] text-neutral-950 shadow-sm font-black'
                    : 'border border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:border-neutral-700 hover:text-white'
                }`}
              >
                كافة المواعيد
              </button>

              {todayDate ? (
                <button
                  type="button"
                  onClick={() => handleSelectDate(todayDate)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                    selectedDate === todayDate
                      ? 'bg-[#d4af37] text-neutral-950 shadow-sm font-black'
                      : 'border border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:border-neutral-700 hover:text-white'
                  }`}
                >
                  اليوم
                </button>
              ) : null}

              {tomorrowDate ? (
                <button
                  type="button"
                  onClick={() => handleSelectDate(tomorrowDate)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                    selectedDate === tomorrowDate
                      ? 'bg-[#d4af37] text-neutral-950 shadow-sm font-black'
                      : 'border border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:border-neutral-700 hover:text-white'
                  }`}
                >
                  غداً
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="ops-custom-date" className="text-xs text-neutral-400 font-medium whitespace-nowrap">
                تاريخ مخصص:
              </label>
              <input
                id="ops-custom-date"
                type="date"
                value={selectedDate ?? ''}
                onChange={(e) => handleSelectDate(e.target.value || undefined)}
                className="rounded-xl border border-neutral-700/80 bg-neutral-950 px-3 py-1.5 text-xs font-bold text-white focus:border-[#d4af37] focus:outline-none focus:ring-1 focus:ring-[#d4af37]"
              />
              {selectedDate ? (
                <button
                  type="button"
                  onClick={() => handleSelectDate(undefined)}
                  className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white text-xs"
                  title="إلغاء التحديد وعرض الكل"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Queue Tab Selector */}
          <div className="flex gap-2 overflow-x-auto rounded-2xl border border-neutral-800/80 bg-[#0e0e12]/90 backdrop-blur-xl p-1.5 shadow-md">
            {[
              { id: 'proofs', label: 'إثباتات الدفع', count: pendingProofs.length, icon: FileText },
              { id: 'subscriptions', label: 'الاشتراكات', count: (managedSubscriptions || []).length, icon: PackageCheck },
              { id: 'review', label: 'مراجعة الحجوزات', count: reviewBookings.length, icon: ShieldCheck },
              { id: 'unassigned', label: 'قائمة الإسناد', count: unassignedBookings.length, icon: Users },
              { id: 'bookings', label: 'الحجوزات النشطة', count: activeBookings.length, icon: Calendar },
              { id: 'quality', label: 'مراجعة واعتماد الجودة', count: qualityBookingsCount, icon: ShieldCheck },
              { id: 'cases', label: 'الحالات والشكاوى', count: openCasesCount, icon: ShieldAlert },
              ...(manager.role === 'OWNER'
                ? [{ id: 'terminal', label: 'الحجوزات الطرفية', count: terminalBookings.length, icon: AlertTriangle }]
                : []),
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                    active
                      ? 'bg-gradient-to-r from-[#d4af37] via-[#e5c45a] to-[#d4af37] text-neutral-950 shadow-md shadow-[#d4af37]/20 font-black'
                      : 'text-neutral-300 hover:bg-white/[0.05] hover:text-white'
                  }`}
                >
                  <Icon className={`size-4 ${active ? 'text-neutral-950' : 'text-neutral-400'}`} />
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums ${
                      active ? 'bg-black/20 text-neutral-950' : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {formatNumber(tab.count)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 1. TAB: PROOFS */}
          {activeTab === 'proofs' && (
            <section aria-labelledby="proofs-heading" className="space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-800/80 pb-3">
                <h3 id="proofs-heading" className="flex items-center gap-2 text-lg font-black text-white">
                  <FileText className="size-5 text-[#d4af37]" />
                  مراجعة إثباتات التحويل والدفع
                </h3>
                <span className="text-xs text-neutral-400">مراجعة يدوية وتدقيق الحساب</span>
              </div>

              {pendingProofs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-800/80 bg-neutral-950/40 p-12 text-center text-neutral-400">
                  <FileSearch className="mx-auto size-8 text-neutral-500 mb-3" />
                  <p className="text-sm font-bold text-white">لا توجد إثباتات دفع معلّقة حاليًا</p>
                  <p className="mt-1 text-xs text-neutral-500">تمت مراجعة واعتماد جميع التحويلات المستلمة.</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {pendingProofs.map((proof) => (
                    <article
                      key={proof.id}
                      className="flex flex-col justify-between rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 shadow-md transition-all hover:border-neutral-700"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 border-b border-neutral-800/60 pb-3">
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-[#d4af37]" />
                            <span dir="ltr" className="font-mono text-sm font-black text-white">
                              {proof.booking.bookingNumber}
                            </span>
                          </div>
                          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-200">
                            {proof.paymentMethod.name}
                          </span>
                        </div>

                        <div className="mt-3 space-y-1.5 text-xs">
                          <p className="text-sm font-bold text-white">{proof.booking.service.nameAr}</p>
                          <p className="text-neutral-300 font-semibold">{proof.booking.customer.user.fullName}</p>
                          <p className="text-neutral-400">
                            اسم المحوّل: <strong className="text-neutral-200">{proof.senderName}</strong> ({proof.senderPhoneOrAccount})
                          </p>
                          {proof.referenceNumber ? (
                            <p className="text-neutral-400">
                              رقم المرجع: <span dir="ltr" className="font-mono text-neutral-200">{proof.referenceNumber}</span>
                            </p>
                          ) : null}
                          <div className="mt-2 flex items-center justify-between rounded-xl bg-neutral-950/60 p-2.5 border border-neutral-800/60">
                            <span className="text-neutral-400">المبلغ المحول:</span>
                            <span className="font-black text-base text-[#f3e4a8]">{formatCurrency(proof.amountSubmitted)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-neutral-800/60 pt-3">
                        <a
                          href={`tel:${proof.booking.customer.user.phone}`}
                          className="text-xs font-bold text-[#d4af37] hover:text-[#f3e4a8] flex items-center gap-1.5"
                        >
                          <Phone className="size-3.5" />
                          <span>اتصال بالعميل</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProof(proof);
                            setReviewNotes('');
                            setFeedback(null);
                          }}
                          className={primaryButtonClass}
                        >
                          فتح المراجعة
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <OperationsQueuePagination queueKey="proofs" pagination={pagination.proofs} dashboardTab="proofs" />
            </section>
          )}

          {/* TAB: SUBSCRIPTIONS */}
          {activeTab === 'subscriptions' && (
            <section aria-labelledby="subscriptions-heading" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800/80 pb-3">
                <div>
                  <h3 id="subscriptions-heading" className="flex items-center gap-2 text-lg font-black text-white">
                    <PackageCheck className="size-5 text-[#d4af37]" />
                    إدارة الاشتراكات الشهرية وإثباتات السداد
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    مراجعة إثباتات الدفع للاشتراكات الجديدة، تفعيل الباقات، تجميد أو تمديد الصلاحية، وتعديل رصيد الزيارات.
                  </p>
                </div>
                <span className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-bold text-neutral-300 shrink-0">
                  {formatNumber((managedSubscriptions || []).length)} اشتراك
                </span>
              </div>
              <SubscriptionManagementPanel subscriptions={managedSubscriptions || []} />
            </section>
          )}

          {/* 2. TAB: REVIEW */}
          {activeTab === 'review' && (
            <section aria-labelledby="review-heading" className="space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-800/80 pb-3">
                <h3 id="review-heading" className="flex items-center gap-2 text-lg font-black text-white">
                  <ShieldCheck className="size-5 text-[#d4af37]" />
                  مراجعة الحجوزات تشغيليًا وقبولها
                </h3>
                <span className="text-xs text-neutral-400">تأكيد الموعد وإحالته للإسناد</span>
              </div>

              {reviewBookings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-800/80 bg-neutral-950/40 p-12 text-center text-neutral-400">
                  <FileSearch className="mx-auto size-8 text-neutral-500 mb-3" />
                  <p className="text-sm font-bold text-white">لا توجد حجوزات بانتظار القرار</p>
                  <p className="mt-1 text-xs text-neutral-500">تم اعتماد أو توزيع كافة الطلبات الواردة.</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {reviewBookings.map((booking) => (
                    <article
                      key={booking.id}
                      className="flex flex-col justify-between rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 shadow-md transition-all hover:border-neutral-700"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 border-b border-neutral-800/60 pb-3">
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-sky-400" />
                            <span dir="ltr" className="font-mono text-sm font-black text-white">
                              {booking.bookingNumber}
                            </span>
                          </div>
                          <span className="rounded-full border border-sky-300/30 bg-sky-300/10 px-2.5 py-0.5 text-[11px] font-bold text-sky-200">
                            {booking.branch.nameAr}
                          </span>
                        </div>

                        <div className="mt-3 space-y-2 text-xs">
                          <p className="text-sm font-bold text-white">{booking.service.nameAr}</p>
                          <p className="text-neutral-300 font-semibold">{booking.customer.user.fullName}</p>
                          <p className="text-neutral-400">
                            السيارة: <strong className="text-neutral-200">{booking.vehicle.make} {booking.vehicle.model}</strong> · {booking.coverageArea.compound}
                          </p>
                          <p className="text-neutral-400">
                            الموعد: <strong className="text-white">{formatDateTime(booking.startAt)}</strong>
                          </p>
                          <div className="flex items-center justify-between rounded-xl bg-neutral-950/60 p-2.5 border border-neutral-800/60">
                            <span className="text-neutral-400">المتبقي:</span>
                            <span className="font-black text-sm text-[#f3e4a8]">{formatCurrency(booking.amountDue)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-neutral-800/60 pt-3">
                        <a
                          href={`tel:${booking.customer.user.phone}`}
                          className="text-xs font-bold text-[#d4af37] hover:text-[#f3e4a8] flex items-center gap-1.5"
                        >
                          <Phone className="size-3.5" />
                          <span>اتصال بالعميل</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReview(booking);
                            setReviewNotes('');
                            setFeedback(null);
                          }}
                          className={primaryButtonClass}
                        >
                          اتخاذ القرار
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <OperationsQueuePagination queueKey="review" pagination={pagination.review} dashboardTab="review" />
            </section>
          )}

          {/* 3. TAB: UNASSIGNED */}
          {activeTab === 'unassigned' && (
            <section aria-labelledby="unassigned-heading" className="space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-800/80 pb-3">
                <h3 id="unassigned-heading" className="flex items-center gap-2 text-lg font-black text-white">
                  <Users className="size-5 text-[#d4af37]" />
                  قائمة الإسناد والتوزيع اليدوي
                </h3>
                <span className="text-xs text-neutral-400">حجوزات مقبولة بانتظار تحديد الفريق المنفذ</span>
              </div>

              {unassignedBookings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-800/80 bg-neutral-950/40 p-12 text-center text-neutral-400">
                  <FileSearch className="mx-auto size-8 text-neutral-500 mb-3" />
                  <p className="text-sm font-bold text-white">كل الحجوزات المقبولة مسندة للفرق</p>
                  <p className="mt-1 text-xs text-neutral-500">لا توجد حجوزات معلقة بدون فريق منفذ.</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {unassignedBookings.map((booking) => (
                    <article
                      key={booking.id}
                      className="flex flex-col justify-between rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 shadow-md transition-all hover:border-neutral-700"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 border-b border-neutral-800/60 pb-3">
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-rose-400" />
                            <span dir="ltr" className="font-mono text-sm font-black text-white">
                              {booking.bookingNumber}
                            </span>
                          </div>
                          <span className="rounded-full border border-rose-300/30 bg-rose-300/10 px-2.5 py-0.5 text-[11px] font-bold text-rose-200">
                            {booking.branch.nameAr}
                          </span>
                        </div>

                        <div className="mt-3 space-y-2 text-xs">
                          <p className="text-sm font-bold text-white">{booking.service.nameAr}</p>
                          {booking.customer ? (
                            <p className="text-neutral-300 font-semibold">{booking.customer.user.fullName}</p>
                          ) : null}
                          <p className="text-neutral-400">
                            المنطقة: <strong className="text-neutral-200">{booking.coverageArea.compound}</strong>
                          </p>
                          <p className="text-neutral-400">
                            الموعد المحدد: <strong className="text-white">{formatDateTime(booking.startAt)}</strong>
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-neutral-800/60 pt-3">
                        {booking.customer ? (
                          <a
                            href={`tel:${booking.customer.user.phone}`}
                            className="text-xs font-bold text-[#d4af37] hover:text-[#f3e4a8] flex items-center gap-1.5"
                          >
                            <Phone className="size-3.5" />
                            <span>اتصال بالعميل</span>
                          </a>
                        ) : <span />}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBooking(booking);
                            setAssignmentReason('');
                            setFeedback(null);
                          }}
                          className={primaryButtonClass}
                        >
                          إسناد فريق
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <OperationsQueuePagination queueKey="unassigned" pagination={pagination.unassigned} dashboardTab="unassigned" />
            </section>
          )}

          {/* 4. TAB: ACTIVE BOOKINGS */}
          {activeTab === 'bookings' && (
            <section aria-labelledby="active-heading" className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-800/80 pb-4">
                <h3 id="active-heading" className="flex items-center gap-2 text-lg font-black text-white">
                  <Calendar className="size-5 text-[#d4af37]" />
                  الحجوزات النشطة والميدانية
                </h3>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitServerSearch('bookingQuery', activeSearch);
                  }}
                  className="flex max-w-md w-full gap-2"
                >
                  <input
                    value={activeSearch}
                    onChange={(event) => setActiveSearch(event.target.value)}
                    type="search"
                    placeholder="رقم الحجز أو اسم العميل أو الهاتف..."
                    className={inputClass}
                  />
                  <button type="submit" className={primaryButtonClass}>
                    <Search className="size-4" />
                    <span>بحث</span>
                  </button>
                </form>
              </div>

              {activeBookings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-800/80 bg-neutral-950/40 p-12 text-center text-neutral-400">
                  <FileSearch className="mx-auto size-8 text-neutral-500 mb-3" />
                  <p className="text-sm font-bold text-white">لا توجد حجوزات نشطة تطابق البحث</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {activeBookings.map((booking) => (
                    <article
                      key={booking.id}
                      className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 shadow-md transition-all hover:border-neutral-700"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5">
                            <span className="size-2 rounded-full bg-[#d4af37]" />
                            <p dir="ltr" className="font-mono font-bold text-white text-base tracking-wide">
                              {booking.bookingNumber}
                            </p>
                          </div>
                          <p className="mt-1.5 truncate text-xs sm:text-sm text-neutral-400">
                            <span className="font-semibold text-neutral-200">{booking.customer.user.fullName}</span> ·{' '}
                            {booking.service.nameAr}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <StatusBadge status={booking.bookingStatus} />
                          <StatusBadge status={booking.paymentStatus} />
                        </div>
                      </div>

                      <dl className="mt-4 grid gap-3 text-xs sm:text-sm sm:grid-cols-2 lg:grid-cols-4 rounded-xl bg-neutral-950/40 border border-neutral-800/60 p-3.5">
                        <div>
                          <dt className="text-neutral-500 text-[11px] font-medium">الموعد المحدد</dt>
                          <dd className="mt-1 font-semibold text-neutral-200">{formatDateTime(booking.startAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-neutral-500 text-[11px] font-medium">الفريق المنفذ</dt>
                          <dd className="mt-1 font-medium text-neutral-300">{booking.assignedTeam?.name ?? 'غير مسند'}</dd>
                        </div>
                        <div>
                          <dt className="text-neutral-500 text-[11px] font-medium">المبلغ المدفوع</dt>
                          <dd className="mt-1 font-semibold text-emerald-400">{formatCurrency(booking.amountPaid)}</dd>
                        </div>
                        <div>
                          <dt className="text-neutral-500 text-[11px] font-medium">المبلغ المستحق</dt>
                          <dd className="mt-1 font-black tabular-nums text-[#f3e4a8]">{formatCurrency(booking.amountDue)}</dd>
                        </div>
                      </dl>

                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-800/60 pt-3.5">
                        <a
                          href={`tel:${booking.customer.user.phone}`}
                          className="text-xs sm:text-sm font-bold text-[#d4af37] hover:text-[#f3e4a8] transition-colors flex items-center gap-1.5 pl-2"
                        >
                          <Phone className="size-3.5" />
                          <span>اتصال ({booking.customer.user.phone})</span>
                        </a>

                        <span className="flex-1" />

                        {/* Operational Quick Actions */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRescheduleBooking(booking);
                            const d = new Date(booking.startAt);
                            setRescheduleDate(d.toISOString().slice(0, 10));
                            setRescheduleTime(d.toTimeString().slice(0, 5));
                            setRescheduleReason('');
                            setFeedback(null);
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-300 hover:bg-sky-500/20"
                        >
                          <CalendarClock className="size-3.5" />
                          <span>تأجيل / تعديل</span>
                        </button>

                        <button
                          type="button"
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
                          className="inline-flex items-center gap-1 rounded-xl border border-purple-500/40 bg-purple-500/10 px-3 py-2 text-xs font-bold text-purple-300 hover:bg-purple-500/20"
                        >
                          <ArrowLeftRight className="size-3.5" />
                          <span>نقل لفريق</span>
                        </button>

                        {booking.amountDue > 0 && booking.canRecordBalancePayment ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSettlement(booking);
                              setSettlementNotes('');
                              setFeedback(null);
                            }}
                            className={primaryButtonClass}
                          >
                            تحصيل {formatCurrency(booking.amountDue)}
                          </button>
                        ) : null}

                        {booking.canCloseBooking && booking.bookingStatus === 'DELIVERED' && booking.amountDue === 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedClose(booking);
                              setFeedback(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-black hover:bg-emerald-400"
                          >
                            <CheckCircle2 className="size-3.5" />
                            <span>إغلاق الحجز</span>
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCancelBooking({
                              id: booking.id,
                              bookingNumber: booking.bookingNumber,
                              customerName: booking.customer.user.fullName,
                            });
                            setCancelReason('');
                            setFeedback(null);
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20"
                        >
                          <Ban className="size-3.5" />
                          <span>إلغاء</span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <OperationsQueuePagination queueKey="bookings" pagination={pagination.bookings} dashboardTab="bookings" />
            </section>
          )}

          {/* 5. TAB: QUALITY REVIEWS */}
          {activeTab === 'quality' && (
            <div className="space-y-6">
              {qualityQueuesSlot}
            </div>
          )}

          {/* 6. TAB: CASES & COMPLAINTS */}
          {activeTab === 'cases' && (
            <div className="space-y-6">
              {caseQueuesSlot}
            </div>
          )}

          {/* 6. TAB: TERMINAL BOOKINGS (OWNER ONLY) */}
          {activeTab === 'terminal' && manager.role === 'OWNER' && (
            <section aria-labelledby="terminal-heading" className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-800/80 pb-4">
                <div>
                  <h3 id="terminal-heading" className="flex items-center gap-2 text-lg font-black text-amber-300">
                    <AlertTriangle className="size-5 text-amber-300" />
                    مراجعة الحجوزات الطرفية
                  </h3>
                  <p className="text-xs text-neutral-400">إعادة الفتح تنقل الحجز إلى ADMIN_REVIEW_REQUIRED للمراجعة الإدارية.</p>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitServerSearch('terminalQuery', terminalSearch);
                  }}
                  className="flex max-w-md w-full gap-2"
                >
                  <input
                    value={terminalSearch}
                    onChange={(event) => setTerminalSearch(event.target.value)}
                    type="search"
                    placeholder="رقم الحجز أو العميل..."
                    className={inputClass}
                  />
                  <button type="submit" className={primaryButtonClass}>
                    <span>بحث</span>
                  </button>
                </form>
              </div>

              {terminalBookings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-800/80 bg-neutral-950/40 p-12 text-center text-neutral-400">
                  <FileSearch className="mx-auto size-8 text-neutral-500 mb-3" />
                  <p className="text-sm font-bold text-white">لا توجد حجوزات طرفية حديثة</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {terminalBookings.map((booking) => (
                    <article
                      key={booking.id}
                      className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 shadow-md"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-neutral-800/60 pb-3">
                        <span dir="ltr" className="font-mono text-sm font-black text-white">{booking.bookingNumber}</span>
                        <StatusBadge status={booking.bookingStatus} />
                      </div>
                      <div className="mt-3 space-y-1 text-xs">
                        <p className="font-bold text-white">{booking.service.nameAr}</p>
                        <p className="text-neutral-300">{booking.customer.user.fullName} · {booking.branch.nameAr}</p>
                        <p className="text-neutral-400">المستحق: {formatCurrency(booking.amountDue)} · المدفوع: {formatCurrency(booking.amountPaid)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReopen(booking);
                          setReopenReason('');
                          setFeedback(null);
                        }}
                        className="mt-4 w-full rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-2.5 text-xs font-bold text-amber-200 hover:bg-amber-400/20"
                      >
                        إعادة فتح للمراجعة الإدارية
                      </button>
                    </article>
                  ))}
                </div>
              )}
              <OperationsQueuePagination queueKey="terminal" pagination={pagination.terminal} dashboardTab="terminal" />
            </section>
          )}
        </div>
      </main>

      {/* --- OPERATIONAL ACTION DIALOGS --- */}

      {/* 1. Modal: Review Payment Proof */}
      {selectedProof && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/85 backdrop-blur-sm p-4" role="presentation">
          <div role="dialog" aria-modal="true" className="my-8 w-full max-w-2xl space-y-5 rounded-3xl border border-[#d4af37]/40 bg-[#141414] p-5 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
              <h2 className="text-xl font-black text-white">مراجعة إثبات التحويل #{selectedProof.booking.bookingNumber}</h2>
              <button type="button" disabled={isSubmitting} onClick={() => setSelectedProof(null)} className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800">
                <X className="size-5" />
              </button>
            </div>
            <dl className="grid gap-3 rounded-2xl bg-[#080808] p-4 text-xs sm:text-sm sm:grid-cols-2 border border-neutral-800/60">
              <div><dt className="text-neutral-500">الوسيلة</dt><dd className="font-bold text-white mt-0.5">{selectedProof.paymentMethod.name}</dd></div>
              <div><dt className="text-neutral-500">اسم المحوّل</dt><dd className="font-bold text-white mt-0.5">{selectedProof.senderName}</dd></div>
              <div><dt className="text-neutral-500">رقم الهاتف / الحساب</dt><dd className="font-bold text-white mt-0.5" dir="ltr">{selectedProof.senderPhoneOrAccount}</dd></div>
              <div><dt className="text-neutral-500">المبلغ المحول</dt><dd className="font-black text-[#f3e4a8] mt-0.5">{formatCurrency(selectedProof.amountSubmitted)}</dd></div>
            </dl>
            {selectedProof.proofFileUrl && selectedProof.proofFileUrl.startsWith('/api/files/') ? (
              <a href={selectedProof.proofFileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-[#d4af37]/50 bg-[#d4af37]/10 px-4 py-2.5 text-xs font-bold text-[#e5c45a] hover:bg-[#d4af37]/20">
                <span>فتح ملف الإيصال المرفوع</span>
                <ExternalLink className="size-4" />
              </a>
            ) : null}
            {feedback && (
              <div
                role="status"
                className={`rounded-2xl border p-4 text-xs font-bold ${
                  feedback.tone === 'error'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                {feedback.message}
              </div>
            )}
            <div>
              <label htmlFor="proof-notes" className="mb-2 block text-xs font-bold text-neutral-300">ملاحظات القرار</label>
              <textarea id="proof-notes" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={3} maxLength={1000} className={inputClass} placeholder="إلزامية في حالة الرفض أو المبالغ الناقصة..." />
            </div>
            <div className="grid gap-2 sm:grid-cols-3 pt-2">
              <button type="button" disabled={isSubmitting} onClick={() => handleReviewProof('VERIFY')} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-neutral-950 hover:bg-emerald-400">اعتماد الإثبات</button>
              <button type="button" disabled={isSubmitting} onClick={() => handleReviewProof('SHORT')} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-neutral-950 hover:bg-amber-400">المبلغ ناقص</button>
              <button type="button" disabled={isSubmitting} onClick={() => handleReviewProof('REUPLOAD')} className="rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-bold text-neutral-950 hover:bg-sky-400">طلب إعادة رفع</button>
              <button type="button" disabled={isSubmitting} onClick={() => handleReviewProof('DUPLICATE')} className="rounded-xl border border-purple-500/60 px-4 py-2.5 text-xs font-bold text-purple-300 hover:bg-purple-500/20">اشتباه تكرار</button>
              <button type="button" disabled={isSubmitting} onClick={() => handleReviewProof('REJECT')} className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-500">رفض الإثبات</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal: Review Booking Decision */}
      {selectedReview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur-sm p-4" role="presentation">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg space-y-5 rounded-3xl border border-[#d4af37]/40 bg-[#141414] p-5 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
              <h2 className="text-xl font-black text-white">اعتماد أو رفض الحجز #{selectedReview.bookingNumber}</h2>
              <button type="button" disabled={isSubmitting} onClick={() => setSelectedReview(null)} className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800"><X className="size-5" /></button>
            </div>
            <div className="rounded-2xl bg-[#080808] p-4 text-xs sm:text-sm text-neutral-300 space-y-1 border border-neutral-800/60">
              <p><strong className="text-white">{selectedReview.service.nameAr}</strong> · {selectedReview.customer.user.fullName}</p>
              <p>{selectedReview.branch.nameAr} · {selectedReview.coverageArea.compound}</p>
              <p>الموعد: <strong className="text-white">{formatDateTime(selectedReview.startAt)}</strong></p>
            </div>
            {feedback && (
              <div
                role="status"
                className={`rounded-2xl border p-4 text-xs font-bold ${
                  feedback.tone === 'error'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                {feedback.message}
              </div>
            )}
            <div>
              <label htmlFor="booking-review-reason" className="mb-2 block text-xs font-bold text-neutral-300">سبب القرار</label>
              <textarea id="booking-review-reason" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={3} maxLength={1000} className={inputClass} placeholder="اكتب سبب القرار بالتفصيل..." />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button type="button" disabled={isSubmitting} onClick={() => handleBookingReview('ACCEPT')} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-neutral-950 hover:bg-emerald-400">اعتماد وقبول</button>
              <button type="button" disabled={isSubmitting} onClick={() => handleBookingReview('REJECT')} className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-500">رفض الحجز</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal: Manual Team Assignment */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur-sm p-4" role="presentation">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg space-y-5 rounded-3xl border border-[#d4af37]/40 bg-[#141414] p-5 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
              <h2 className="text-xl font-black text-white">إسناد فريق للحجز #{selectedBooking.bookingNumber}</h2>
              <button type="button" disabled={isSubmitting} onClick={() => setSelectedBooking(null)} className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800"><X className="size-5" /></button>
            </div>
            {feedback && (
              <div
                role="status"
                className={`rounded-2xl border p-4 text-xs font-bold ${
                  feedback.tone === 'error'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                {feedback.message}
              </div>
            )}
            {visibleTeams.length ? (
              <>
                <div>
                  <label htmlFor="team-id" className="mb-2 block text-xs font-bold text-neutral-300">اختر الفريق المنفذ</label>
                  <select id="team-id" value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)} className={inputClass}>
                    {visibleTeams.map((team) => (
                      <option key={team.id} value={team.id}>{team.name} ({team.members.length} أعضاء)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="assignment-reason" className="mb-2 block text-xs font-bold text-neutral-300">سبب الإسناد أو التجاوز اليدوي</label>
                  <textarea id="assignment-reason" value={assignmentReason} onChange={(e) => setAssignmentReason(e.target.value)} rows={3} maxLength={500} className={inputClass} placeholder="اكتب سبب الإسناد..." />
                </div>
                <button type="button" disabled={isSubmitting} onClick={handleAssignTeam} className={primaryButtonClass}>
                  تأكيد الإسناد
                </button>
              </>
            ) : (
              <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-200">
                لا توجد فرق نشطة تابعة لفرع هذا الحجز حالياً.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 4. Modal: Settlement Recording */}
      {selectedSettlement && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur-sm p-4" role="presentation">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg space-y-5 rounded-3xl border border-[#d4af37]/40 bg-[#141414] p-5 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
              <h2 className="text-xl font-black text-white">تسجيل تحصيل الرصيد #{selectedSettlement.bookingNumber}</h2>
              <button type="button" disabled={isSubmitting} onClick={() => setSelectedSettlement(null)} className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800"><X className="size-5" /></button>
            </div>
            <div className="rounded-2xl bg-[#080808] p-4 text-xs sm:text-sm border border-neutral-800/60 space-y-1">
              <p className="text-neutral-400">الرصيد المستحق:</p>
              <p className="text-2xl font-black text-[#f3e4a8]">{formatCurrency(selectedSettlement.amountDue)}</p>
            </div>
            {feedback && (
              <div
                role="status"
                className={`rounded-2xl border p-4 text-xs font-bold ${
                  feedback.tone === 'error'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                {feedback.message}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="settlement-method" className="mb-2 block text-xs font-bold text-neutral-300">وسيلة التحصيل</label>
                <select id="settlement-method" value={settlementMethod} onChange={(e) => setSettlementMethod(e.target.value)} className={inputClass}>
                  <option value="CASH">نقدي (كاش)</option>
                  <option value="BANK_TRANSFER">تحويل بنكي</option>
                  <option value="MOBILE_WALLET">محفظة إلكترونية</option>
                  <option value="POS">بطاقة عبر POS</option>
                </select>
              </div>
              <div>
                <label htmlFor="settlement-reference" className="mb-2 block text-xs font-bold text-neutral-300">رقم المرجع (اختياري)</label>
                <input id="settlement-reference" value={settlementReference} onChange={(e) => setSettlementReference(e.target.value)} className={inputClass} dir="ltr" />
              </div>
            </div>
            <div>
              <label htmlFor="settlement-notes" className="mb-2 block text-xs font-bold text-neutral-300">ملاحظات التحصيل</label>
              <textarea id="settlement-notes" required minLength={3} value={settlementNotes} onChange={(e) => setSettlementNotes(e.target.value)} rows={2} className={inputClass} />
            </div>
            <button type="button" disabled={isSubmitting} onClick={handleRecordSettlement} className={primaryButtonClass}>
              تأكيد تحصيل {formatCurrency(selectedSettlement.amountDue)}
            </button>
          </div>
        </div>
      )}

      {/* 5. Modal: Close Booking */}
      {selectedClose && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur-sm p-4" role="presentation">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg space-y-5 rounded-3xl border border-emerald-500/40 bg-[#141414] p-5 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
              <h2 className="text-xl font-black text-white">الإغلاق النهائي للحجز #{selectedClose.bookingNumber}</h2>
              <button type="button" disabled={isSubmitting} onClick={() => setSelectedClose(null)} className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800"><X className="size-5" /></button>
            </div>
            <p className="rounded-2xl bg-[#080808] p-4 text-xs sm:text-sm text-neutral-300 border border-neutral-800/60">
              الحجز في مرحلة التسليم ورصيده مسدد بالكامل. سيتم إغلاقه وتوثيق ذلك تشغيليًا.
            </p>
            <div>
              <label htmlFor="close-reason" className="mb-2 block text-xs font-bold text-neutral-300">ملاحظة الإغلاق</label>
              <textarea id="close-reason" required minLength={3} value={closeReason} onChange={(e) => setCloseReason(e.target.value)} rows={3} className={inputClass} />
            </div>
            <button type="button" disabled={isSubmitting} onClick={handleCloseBooking} className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-xs sm:text-sm font-bold text-neutral-950 hover:bg-emerald-400">
              تأكيد الإغلاق النهائي
            </button>
          </div>
        </div>
      )}

      {/* 6. Modal: Reschedule / Shift */}
      {selectedRescheduleBooking && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/85 backdrop-blur-sm p-4" role="presentation">
          <div role="dialog" aria-modal="true" className="my-8 w-full max-w-lg space-y-5 rounded-3xl border border-sky-500/40 bg-[#141414] p-5 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
              <h2 className="text-lg font-black flex items-center gap-2 text-white">
                <CalendarClock className="size-5 text-sky-400" />
                تعديل وتأجيل موعد #{selectedRescheduleBooking.bookingNumber}
              </h2>
              <button type="button" disabled={isSubmitting} onClick={() => setSelectedRescheduleBooking(null)} className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800"><X className="size-5" /></button>
            </div>

            <div className="rounded-2xl bg-[#080808] p-4 text-xs text-neutral-300 border border-neutral-800/60">
              الموعد الحالي: <strong className="text-white">{formatDateTime(selectedRescheduleBooking.startAt)}</strong>
            </div>
            {feedback && (
              <div
                role="status"
                className={`rounded-2xl border p-4 text-xs font-bold ${
                  feedback.tone === 'error'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                {feedback.message}
              </div>
            )}

            <div className="space-y-2">
              <span className="block text-xs font-bold text-neutral-400">خيارات سريعة:</span>
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
                <label htmlFor="reschedule-date" className="mb-2 block text-xs font-bold text-neutral-300">التاريخ الجديد</label>
                <input id="reschedule-date" type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label htmlFor="reschedule-time" className="mb-2 block text-xs font-bold text-neutral-300">الوقت الجديد</label>
                <input id="reschedule-time" type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} className={inputClass} />
              </div>
            </div>

            <div>
              <label htmlFor="reschedule-reason" className="mb-2 block text-xs font-bold text-neutral-300">سبب التأجيل أو تعديل الموعد</label>
              <textarea id="reschedule-reason" required minLength={3} maxLength={500} value={rescheduleReason} onChange={(e) => setRescheduleReason(e.target.value)} placeholder="طلب العميل هاتفياً، ازدحام طارئ..." rows={2} className={inputClass} />
            </div>

            <button type="button" disabled={isSubmitting || !rescheduleDate || !rescheduleTime} onClick={handleRescheduleBooking} className="w-full rounded-xl bg-sky-500 px-4 py-2.5 text-xs sm:text-sm font-bold text-neutral-950 hover:bg-sky-400 disabled:opacity-50">
              حفظ الموعد الجديد
            </button>
          </div>
        </div>
      )}

      {/* 7. Modal: Transfer Team */}
      {selectedTransferBooking && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur-sm p-4" role="presentation">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg space-y-5 rounded-3xl border border-purple-500/40 bg-[#141414] p-5 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
              <h2 className="text-lg font-black flex items-center gap-2 text-white">
                <ArrowLeftRight className="size-5 text-purple-400" />
                نقل الحجز #{selectedTransferBooking.bookingNumber} لفريق آخر
              </h2>
              <button type="button" disabled={isSubmitting} onClick={() => setSelectedTransferBooking(null)} className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800"><X className="size-5" /></button>
            </div>

            {visibleTeamsForTransfer.length > 0 ? (
              <>
                <div>
                  <label htmlFor="transfer-team-select" className="mb-2 block text-xs font-bold text-neutral-300">اختر الفريق الجديد</label>
                  <select id="transfer-team-select" value={transferTeamId} onChange={(e) => setTransferTeamId(e.target.value)} className={inputClass}>
                    <option value="">-- اختر الفريق --</option>
                    {visibleTeamsForTransfer.map((team) => (
                      <option key={team.id} value={team.id}>{team.name} ({team.members.length} أعضاء)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="transfer-reason" className="mb-2 block text-xs font-bold text-neutral-300">سبب نقل الحجز</label>
                  <textarea id="transfer-reason" required minLength={3} maxLength={500} value={transferReason} onChange={(e) => setTransferReason(e.target.value)} placeholder="إعادة توزيع أحمال، عطل سيارة الفريق السابق..." rows={2} className={inputClass} />
                </div>
                <button type="button" disabled={isSubmitting || !transferTeamId} onClick={handleTransferTeam} className="w-full rounded-xl bg-purple-500 px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-purple-400 disabled:opacity-50">
                  تأكيد النقل
                </button>
              </>
            ) : (
              <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
                لا توجد فرق أخرى متاحة في هذا الفرع.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 8. Modal: Cancel Booking */}
      {selectedCancelBooking && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur-sm p-4" role="presentation">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg space-y-5 rounded-3xl border border-rose-500/40 bg-[#141414] p-5 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
              <h2 className="text-lg font-black flex items-center gap-2 text-rose-400">
                <Ban className="size-5" />
                إلغاء الحجز #{selectedCancelBooking.bookingNumber}
              </h2>
              <button type="button" disabled={isSubmitting} onClick={() => setSelectedCancelBooking(null)} className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800"><X className="size-5" /></button>
            </div>
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs leading-5 text-rose-200">
              سيتم إلغاء الحجز وتحرير الموعد المسجل فوراً وتوثيق الإجراء في سجلات التدقيق.
            </div>
            {feedback && (
              <div
                role="status"
                className={`rounded-2xl border p-4 text-xs font-bold ${
                  feedback.tone === 'error'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                {feedback.message}
              </div>
            )}
            <div>
              <label htmlFor="cancel-reason-input" className="mb-2 block text-xs font-bold text-neutral-300">سبب الإلغاء</label>
              <textarea id="cancel-reason-input" required minLength={3} maxLength={1000} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} className={inputClass} placeholder="اكتب سبب إلغاء الحجز..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" disabled={isSubmitting} onClick={() => setSelectedCancelBooking(null)} className={secondaryButtonClass}>
                تراجع
              </button>
              <button type="button" disabled={isSubmitting || cancelReason.trim().length < 3} onClick={handleCancelBooking} className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-50">
                تأكيد الإلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Modal: Branch Schedule Lock */}
      {selectedLockBranch && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur-sm p-4" role="presentation">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg space-y-5 rounded-3xl border border-[#d4af37]/40 bg-[#141414] p-5 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
              <h2 className="text-lg font-black flex items-center gap-2 text-white">
                {selectedLockBranch.status === 'ACTIVE' ? <Lock className="size-5 text-rose-400" /> : <Unlock className="size-5 text-emerald-400" />}
                {selectedLockBranch.status === 'ACTIVE'
                  ? `قفل جدول مواعيد فرع ${selectedLockBranch.nameAr}`
                  : `فتح جدول مواعيد فرع ${selectedLockBranch.nameAr}`}
              </h2>
              <button type="button" disabled={isSubmitting} onClick={() => setSelectedLockBranch(null)} className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800"><X className="size-5" /></button>
            </div>
            <div className={`rounded-2xl border p-4 text-xs leading-6 ${selectedLockBranch.status === 'ACTIVE' ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
              {selectedLockBranch.status === 'ACTIVE'
                ? 'عند قفل جدول المواعيد، سيتوقف استقبال الحجوزات الجديدة من الموقع فوراً لهذا الفرع.'
                : 'سيتم استئناف استقبال الحجوزات وفتح المواعيد المتاحة للعملاء من الموقع.'}
            </div>
            <div>
              <label htmlFor="lock-reason-input" className="mb-2 block text-xs font-bold text-neutral-300">ملاحظة أو سبب الإجراء</label>
              <textarea id="lock-reason-input" maxLength={500} value={lockReason} onChange={(e) => setLockReason(e.target.value)} rows={2} className={inputClass} placeholder="صيانة، طقس، طاقة تشغيلية..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" disabled={isSubmitting} onClick={() => setSelectedLockBranch(null)} className={secondaryButtonClass}>
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleToggleScheduleLock}
                className={`rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold disabled:opacity-50 ${
                  selectedLockBranch.status === 'ACTIVE'
                    ? 'bg-rose-600 text-white hover:bg-rose-500'
                    : 'bg-emerald-500 text-neutral-950 hover:bg-emerald-400'
                }`}
              >
                {selectedLockBranch.status === 'ACTIVE' ? 'تأكيد قفل الجدول' : 'تأكيد فتح الجدول'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. Modal: Reopen Terminal Booking */}
      {selectedReopen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur-sm p-4" role="presentation">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg space-y-5 rounded-3xl border border-amber-500/40 bg-[#141414] p-5 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
              <h2 className="text-lg font-black flex items-center gap-2 text-amber-300">
                <AlertTriangle className="size-5" />
                إعادة فتح الحجز #{selectedReopen.bookingNumber}
              </h2>
              <button type="button" disabled={isSubmitting} onClick={() => setSelectedReopen(null)} className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800"><X className="size-5" /></button>
            </div>
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-6 text-amber-200">
              سيتم إعادة الحجز الطرفي إلى قائمة المراجعة الإدارية والتشغيلية مع توثيق سبب الفتح.
            </div>
            <div>
              <label htmlFor="reopen-reason-input" className="mb-2 block text-xs font-bold text-neutral-300">سبب إعادة فتح الحجز</label>
              <textarea id="reopen-reason-input" required minLength={3} maxLength={500} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} rows={3} className={inputClass} placeholder="اكتب سبب إعادة فتح الحجز للمراجعة..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" disabled={isSubmitting} onClick={() => setSelectedReopen(null)} className={secondaryButtonClass}>
                تراجع
              </button>
              <button type="button" disabled={isSubmitting || reopenReason.trim().length < 3} onClick={handleReopenTerminalBooking} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs sm:text-sm font-black text-neutral-950 hover:bg-amber-400 disabled:opacity-50">
                تأكيد إعادة الفتح
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
