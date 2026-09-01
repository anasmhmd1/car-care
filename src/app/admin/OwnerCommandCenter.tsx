'use client';

import type { FormEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Activity,
  AlertTriangle,
  Banknote,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Crown,
  DollarSign,
  Download,
  ExternalLink,
  Eye,
  FileSearch,
  FileSpreadsheet,
  Gauge,
  Globe,
  History,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingUp,
  User,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import BareeqLogo from '@/components/BareeqLogo';
import {
  assignTeamManuallyAction,
  deletePaymentProofReceiptAction,
  reviewBookingAction,
} from '@/app/actions/operations';
import { updateBranchAction } from '@/app/actions/owner-brand';
import { requestNewBranchAction } from '@/app/actions/owner';
import { logoutAction } from '@/app/actions/auth';
import CustomerManagementPanel, {
  type CustomerAddressDto,
  type CustomerBookingSummaryDto,
  type CustomerDto,
  type CustomerVehicleDto,
} from './CustomerManagementPanel';
import SubscriptionManagementPanel, {
  type ManagedSubscription,
} from './subscriptions/SubscriptionManagementPanel';

export type {
  CustomerAddressDto,
  CustomerBookingSummaryDto,
  CustomerDto,
  CustomerVehicleDto,
};

export type OwnerSection =
  | 'overview'
  | 'bookings'
  | 'subscriptions'
  | 'payments'
  | 'cancellations'
  | 'teams'
  | 'branches'
  | 'customers'
  | 'reports'
  | 'audit';

export interface OwnerDto {
  id: string;
  fullName: string;
  phone: string;
  role: string;
}

export interface BrandDto {
  brandNameAr: string;
  brandNameEn: string;
  maxBranches: number;
}

export interface DashboardMetricsDto {
  todayBookings: number;
  upcomingBookings: number;
  awaitingPayment: number;
  pendingProofs: number;
  operationsReview: number;
  unassignedBookings: number;
  inProgress: number;
  completedToday: number;
  pendingCancellations: number;
  pendingRefunds: number;
  activeSubscriptions: number;
  revenueToday: number;
  revenueMonth: number;
  pendingAmounts: number;
  newCustomersMonth: number;
  repeatCustomers: number;
  teamUtilization: number;
  qualityOpen: number;
  completionRate: number;
  visitsRemaining: number;
}

export interface BookingSummaryDto {
  id: string;
  bookingNumber: string;
  bookingStatus: string;
  paymentStatus: string;
  startAt: string;
  createdAt: string;
  totalPrice: number;
  depositAmount: number;
  amountPaid: number;
  amountDue: number;
  serviceName: string;
  branchId: string;
  branchName: string;
  areaName: string;
  customerName: string;
  customerPhone: string;
  vehicleLabel: string;
  assignedTeamName: string | null;
  paymentProof?: {
    id: string;
    proofFileUrl: string;
    amountSubmitted: number;
    referenceNumber: string | null;
    status: string;
    reviewNotes: string | null;
    createdAt: string;
    paymentMethodName: string;
  } | null;
}

export interface PaymentProofDto {
  id: string;
  senderName: string;
  senderPhoneOrAccount: string;
  referenceNumber: string | null;
  amountSubmitted: number;
  expectedAmount: number;
  transferTimestamp: string;
  createdAt: string;
  proofFileUrl: string;
  paymentMethodName: string;
  paymentAccount: string;
  booking: BookingSummaryDto;
}

export interface CancellationRequestDto {
  id: string;
  reason: string;
  preferredAction: string;
  customerNotes: string | null;
  status: string;
  createdAt: string;
  booking: BookingSummaryDto;
}

export interface RefundDto {
  id: string;
  amount: number;
  refundMethod: string;
  referenceNumber: string | null;
  status: string;
  createdAt: string;
  booking: BookingSummaryDto;
}

export interface QualityBookingDto {
  booking: BookingSummaryDto;
}

export interface ComplaintDto {
  id: string;
  type: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  bookingNumber: string;
  customerName: string;
}

export interface TeamDto {
  id: string;
  name: string;
  branchId: string;
  branchName: string;
  dailyCapacity: number;
  active: boolean;
  assignmentPriority: number;
  todayBookingCount: number;
  members: Array<{ id: string; fullName: string; phone: string; isLeader: boolean }>;
  zones: Array<{ id: string; name: string }>;
  capabilities: Array<{ id: string; name: string }>;
}

export interface BranchDto {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  code: string;
  address: string;
  phone: string;
  whatsapp: string;
  status: string;
  timezone: string;
  assignmentMode: string;
  dailyBookingLimit: number;
  todayBookings: number;
  teamCount: number;
  zoneCount: number;
  activePaymentMethodCount: number;
}

export interface ServiceDto {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  slug: string;
  coverImage?: string | null;
  basePrice: number;
  priceType?: string;
  durationMinutes: number;
  requiredTeamSize?: number;
  active: boolean;
  bookableOnline: boolean;
  subscriptionEligible: boolean;
  bookingCount: number;
}

export interface PlanDto {
  id: string;
  nameAr: string;
  descriptionAr: string;
  price: number;
  validityDays: number;
  visitCount: number;
  allowedVehicleCount: number;
  active: boolean;
  subscriptionCount: number;
  activeSubscriptionCount: number;
}

export interface SubscriptionDto {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  totalVisits: number;
  usedVisits: number;
  remainingVisits: number;
  customerName: string;
  customerPhone: string;
  planName: string;
  branchName: string;
  vehicleCount: number;
}

export interface AuditLogDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  actorRole: string;
  reason: string | null;
  createdAt: string;
}

export interface BranchRequestDto {
  id: string;
  branchName: string;
  reason: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ReportRowDto {
  id: string;
  label: string;
  count: number;
  totalPrice: number;
  amountPaid: number;
}

export interface ReportsDto {
  from: string;
  to: string;
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  inProgressBookings: number;
  rejectedBookings: number;
  noShowBookings: number;
  accessDeniedBookings: number;
  collectedAmount: number;
  refundedAmount: number;
  netCollected: number;
  amountDue: number;
  averageBookingValue: number;
  newSubscriptions: number;
  activeSubscriptions: number;
  visitsConsumed: number;
  visitsRemaining: number;
  newCustomers: number;
  repeatCustomers: number;
  teamUtilization: number;
  qualityOpen: number;
  complaintCount: number;
  byStatus: Array<{ status: string; count: number }>;
  byService: ReportRowDto[];
  byBranch: ReportRowDto[];
  byTeam: ReportRowDto[];
  cancellationReasons: Array<{ reason: string; count: number }>;
}

export type OverviewTab = 'pulse' | 'revenue' | 'analytics';

export interface MonthlyRevenueDataDto {
  from: string;
  to: string;
  grossRevenue: number;
  netRevenue: number;
  bookingRevenue: number;
  subscriptionRevenue: number;
  refundsTotal: number;
  bookingPaymentsCount: number;
  subscriptionProofsCount: number;
  refundsCount: number;
  paymentMethods: Array<{ key: string; label: string; amount: number; count: number; percentage: number }>;
  branches: Array<{ name: string; amount: number; count: number; percentage: number }>;
  transactions: Array<{
    id: string;
    date: string;
    type: 'BOOKING' | 'SUBSCRIPTION' | 'REFUND';
    customerName: string;
    customerPhone: string;
    title: string;
    branchName: string;
    paymentMethod: string;
    amount: number;
    reference: string;
  }>;
  filterType: 'all' | 'booking' | 'subscription' | 'refund';
  searchQuery: string;
  exportUrl: string;
}

export interface OwnerFiltersDto {
  bookingQuery: string;
  bookingStatus: string;
}

export interface OwnerCommandCenterProps {
  owner: OwnerDto;
  brand: BrandDto;
  currentSection: OwnerSection;
  overviewTab?: OverviewTab;
  metrics: DashboardMetricsDto;
  statusCounts?: Record<string, number>;
  totalAllBookingsCount?: number;
  filters: OwnerFiltersDto;
  customerQuery: string;
  pendingProofs?: PaymentProofDto[];
  operationsReviewBookings: BookingSummaryDto[];
  unassignedBookings: BookingSummaryDto[];
  cancellationRequests?: CancellationRequestDto[];
  pendingRefunds?: RefundDto[];
  qualityBookings?: QualityBookingDto[];
  complaints?: ComplaintDto[];
  bookings: BookingSummaryDto[];
  managedSubscriptions?: ManagedSubscription[];
  teams: TeamDto[];
  branches: BranchDto[];
  customers: CustomerDto[];
  auditLogs: AuditLogDto[];
  branchRequests?: BranchRequestDto[];
  reports: ReportsDto;
  monthlyRevenue?: MonthlyRevenueDataDto;
}

type BookingDecision = 'ACCEPT' | 'REJECT';
type ModalState =
  | { type: 'booking-review'; booking: BookingSummaryDto }
  | { type: 'assignment'; booking: BookingSummaryDto }
  | { type: 'edit-branch'; branch: BranchDto }
  | { type: 'branch-request' }
  | null;

const sectionNav: Array<{
  id?: OwnerSection;
  href?: string;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'الرئيسية', icon: LayoutDashboard },
  { id: 'bookings', label: 'الحجوزات', icon: CalendarDays },
  { id: 'subscriptions', label: 'الاشتراكات', icon: PackageCheck },
  { id: 'customers', label: 'العملاء', icon: UserRound },
  { href: '/admin/reviews', label: 'تقييمات العملاء', icon: ClipboardCheck },
  { href: '/admin/site', label: 'إدارة محتوى الموقع', icon: Globe },
  { href: '/admin/setup', label: 'إعداد التشغيل', icon: Settings2 },
  { id: 'audit', label: 'سجل التعديلات', icon: History },
];

const bookingStatusLabels: Record<string, string> = {
  DRAFT: 'مسودة',
  REQUEST_SUBMITTED: 'طلب جديد',
  AWAITING_PAYMENT_PROOF: 'بانتظار إثبات الدفع',
  PAYMENT_UNDER_REVIEW: 'الدفع قيد المراجعة',
  PAYMENT_VERIFIED: 'تم اعتماد الدفع',
  AWAITING_OPERATIONS_REVIEW: 'بانتظار مراجعة التشغيل',
  ACCEPTED: 'مقبول',
  AWAITING_ASSIGNMENT: 'بانتظار الإسناد',
  ASSIGNED: 'تم الإسناد',
  TEAM_ACKNOWLEDGED: 'أكّد الفريق',
  ON_THE_WAY: 'الفريق في الطريق',
  ARRIVED: 'وصل الفريق',
  IN_SERVICE: 'قيد التنفيذ',
  QUALITY_REVIEW: 'مراجعة الجودة',
  SERVICE_COMPLETED: 'اكتملت الخدمة',
  DELIVERED: 'تم التسليم',
  CLOSED: 'مغلق',
  RESCHEDULE_REQUESTED: 'طلب تعديل موعد',
  CANCELLATION_REQUESTED: 'طلب إلغاء',
  CANCELLED: 'ملغي',
  REJECTED: 'مرفوض',
  EXECUTION_FAILED: 'تعذر التنفيذ',
  CUSTOMER_NO_SHOW: 'العميل لم يحضر',
  ACCESS_DENIED: 'تعذر الدخول',
  ADMIN_REVIEW_REQUIRED: 'مراجعة إدارية',
  EXPIRED: 'منتهي',
};

const paymentStatusLabels: Record<string, string> = {
  NOT_REQUIRED: 'غير مطلوب',
  AWAITING_PROOF: 'بانتظار الإثبات',
  PROOF_UPLOADED: 'تم رفع الإثبات',
  UNDER_REVIEW: 'قيد المراجعة',
  VERIFIED: 'معتمد',
  REJECTED: 'مرفوض',
  AMOUNT_SHORT: 'مبلغ ناقص',
  DUPLICATE_SUSPECTED: 'اشتباه تكرار',
  REUPLOAD_REQUIRED: 'إعادة رفع مطلوبة',
  PARTIALLY_PAID: 'مدفوع جزئيًا',
  FULLY_PAID: 'مدفوع بالكامل',
  REFUND_PENDING: 'استرداد معلق',
  PARTIALLY_REFUNDED: 'مسترد جزئيًا',
  REFUNDED: 'تم الاسترداد',
  NON_REFUNDABLE: 'غير قابل للاسترداد',
};

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
  REFUND_PENDING: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  REFUND_PROCESSING: 'border-sky-300/30 bg-sky-300/10 text-sky-100',
};

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

const inputClass =
  'w-full rounded-xl border border-neutral-800 bg-[#121215] px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 hover:border-neutral-700 focus-visible:border-[#d4af37] focus-visible:ring-2 focus-visible:ring-[#d4af37]/30 disabled:cursor-not-allowed disabled:opacity-60 transition-all';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#e5c45a] to-[#d4af37] px-4 py-2.5 text-xs sm:text-sm font-bold text-neutral-950 hover:brightness-110 active:scale-98 shadow-md shadow-[#d4af37]/20 focus-visible:ring-2 focus-visible:ring-[#f0d879] disabled:cursor-not-allowed disabled:opacity-55 transition-all';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/80 px-4 py-2.5 text-xs sm:text-sm font-semibold text-neutral-200 hover:border-neutral-700 hover:bg-neutral-800 hover:text-white active:scale-98 focus-visible:ring-2 focus-visible:ring-neutral-600 disabled:cursor-not-allowed disabled:opacity-55 transition-all';

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function bookingStatusLabel(status: string) {
  return bookingStatusLabels[status] ?? status;
}

function paymentStatusLabel(status: string) {
  return paymentStatusLabels[status] ?? status;
}

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

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-800/80 bg-neutral-950/40 px-5 py-10 text-center">
      <FileSearch aria-hidden="true" className="mx-auto size-8 text-neutral-500" />
      <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-xs sm:text-sm leading-6 text-neutral-400">{description}</p>
    </div>
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

function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = 'gold',
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  tone?: 'gold' | 'green' | 'red' | 'blue';
}) {
  const toneClass = {
    gold: 'bg-amber-500/10 text-[#d4af37] border-amber-500/25 shadow-amber-500/10',
    green: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25 shadow-emerald-500/10',
    red: 'bg-rose-500/10 text-rose-300 border-rose-500/25 shadow-rose-500/10',
    blue: 'bg-sky-500/10 text-sky-300 border-sky-500/25 shadow-sky-500/10',
  }[tone];

  return (
    <article className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 transition-all duration-300 hover:border-[#d4af37]/50 hover:shadow-xl hover:shadow-[#d4af37]/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-bold text-neutral-300 leading-snug">{label}</p>
          <p className="mt-2.5 text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-white group-hover:text-[#f3e4a8] transition-colors">{value}</p>
        </div>
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl border shadow-md transition-transform duration-300 group-hover:scale-105 ${toneClass}`}>
          {icon}
        </div>
      </div>
      {hint ? (
        <p className="mt-3 text-xs leading-relaxed text-neutral-400 border-t border-neutral-800/60 pt-2.5 flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-neutral-600 shrink-0" />
          <span className="break-words">{hint}</span>
        </p>
      ) : null}
    </article>
  );
}

function BookingCard({
  booking,
}: {
  booking: BookingSummaryDto;
}) {
  const [mounted, setMounted] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [proofDeleted, setProofDeleted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const proof = !proofDeleted ? booking.paymentProof : null;

  const handleDownloadReceipt = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleDeleteReceipt = async () => {
    if (!proof?.id) return;
    setIsDeleting(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append('proofId', proof.id);
      fd.append('bookingId', booking.id);
      const res = await deletePaymentProofReceiptAction(fd);
      if (res.error) {
        setFeedback(res.error);
      } else {
        setProofDeleted(true);
        setShowDeleteConfirm(false);
        setShowReceiptModal(false);
      }
    } catch {
      setFeedback('تعذر حذف الإيصال.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <article className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 transition-all duration-200 hover:border-neutral-700 shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="size-2 rounded-full bg-[#d4af37]" />
            <p dir="ltr" translate="no" className="font-mono font-bold text-white text-base tracking-wide">
              {booking.bookingNumber}
            </p>
          </div>
          <p className="mt-1.5 truncate text-xs sm:text-sm text-neutral-400">
            <span className="font-semibold text-neutral-200">{booking.customerName}</span> · {booking.serviceName}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={booking.bookingStatus} label={bookingStatusLabel(booking.bookingStatus)} />
          <StatusBadge status={booking.paymentStatus} label={paymentStatusLabel(booking.paymentStatus)} />
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-xs sm:text-sm sm:grid-cols-2 lg:grid-cols-4 rounded-xl bg-neutral-950/40 border border-neutral-800/60 p-3.5">
        <div><dt className="text-neutral-500 text-[11px] font-medium">الموعد المحدد</dt><dd className="mt-1 font-semibold text-neutral-200">{formatDateTime(booking.startAt)}</dd></div>
        <div><dt className="text-neutral-500 text-[11px] font-medium">الفرع والمنطقة</dt><dd className="mt-1 font-medium text-neutral-300">{booking.branchName} · {booking.areaName}</dd></div>
        <div><dt className="text-neutral-500 text-[11px] font-medium">السيارة</dt><dd className="mt-1 font-medium text-neutral-300 truncate">{booking.vehicleLabel}</dd></div>
        <div><dt className="text-neutral-500 text-[11px] font-medium">المبلغ المستحق</dt><dd className="mt-1 font-black tabular-nums text-[#f3e4a8]">{formatCurrency(booking.amountDue)}</dd></div>
      </dl>

      {/* Payment Proof Section */}
      {proof && proof.proofFileUrl && (
        <div className="mt-3.5 rounded-xl bg-[#09090b] border border-[#d4af37]/30 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setShowReceiptModal(true)}
              className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-[#d4af37]/40 bg-black/60 hover:opacity-80 transition-opacity focus-visible:ring-2 focus-visible:ring-[#cea355]"
            >
              <Image
                src={proof.proofFileUrl}
                alt="إيصال الدفع"
                fill
                unoptimized
                sizes="48px"
                className="object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                <span>إيصال تحويل: {proof.paymentMethodName}</span>
                <span className="text-[#edce8b] font-mono text-[11px]">({formatCurrency(proof.amountSubmitted)})</span>
              </p>
              {proof.referenceNumber && (
                <p className="text-[11px] text-neutral-400 font-mono mt-0.5">مرجع: {proof.referenceNumber}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowReceiptModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4af37]/40 bg-[#d4af37]/10 px-2.5 py-1.5 text-xs font-bold text-[#e5c45a] hover:bg-[#d4af37]/20 transition-colors"
            >
              <Eye className="size-3.5" />
              <span>معاينة الوصل</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownloadReceipt(proof.proofFileUrl!, `receipt-${booking.bookingNumber}.jpg`)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
              title="تحميل على الهاتف"
            >
              <Download className="size-3.5" />
              <span className="hidden sm:inline">تحميل</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              aria-label="حذف إيصال الدفع"
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 p-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 transition-colors"
              title="حذف الوصل"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation alert if triggered */}
      {showDeleteConfirm && (
        <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs space-y-2">
          <p className="font-bold text-red-200">هل أنت متأكد من حذف إيصال الدفع للحجز #{booking.bookingNumber} نهائياً؟</p>
          {feedback && <p className="text-red-300 font-bold">{feedback}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDeleteReceipt}
              className="rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {isDeleting ? 'جاري الحذف...' : 'نعم، احذف الإيصال'}
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => { setShowDeleteConfirm(false); setFeedback(null); }}
              className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs font-bold text-neutral-300 hover:bg-neutral-700"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-neutral-800/60 pt-3.5">
        <a href={`tel:${booking.customerPhone}`} className="text-xs sm:text-sm font-bold text-[#d4af37] hover:text-[#f3e4a8] transition-colors flex items-center gap-1.5">
          <span>اتصال بالعميل</span>
          <span dir="ltr" className="text-neutral-400 font-mono text-xs">({booking.customerPhone})</span>
        </a>
        <span className="text-xs text-neutral-500 bg-neutral-900 px-2.5 py-1 rounded-lg border border-neutral-800">
          الفريق: <span className="text-neutral-300 font-medium">{booking.assignedTeamName ?? 'لم يُسند بعد'}</span>
        </span>
      </div>

      {/* Full-screen / Modal Receipt Preview with React Portal */}
      {showReceiptModal && proof?.proofFileUrl && mounted && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[99999] overflow-y-auto bg-black/90 backdrop-blur-md p-4 sm:p-6 flex min-h-screen items-center justify-center animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowReceiptModal(false)}
        >
          <div
            className="relative w-full max-w-3xl my-auto space-y-4 rounded-3xl border border-[#d4af37]/40 bg-[#121214] p-5 sm:p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-lg font-black text-white">إيصال الدفع · حجز #{booking.bookingNumber}</h3>
                <p className="text-xs text-neutral-400 mt-0.5">{booking.customerName} · {proof.paymentMethodName} · {formatCurrency(proof.amountSubmitted)}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                aria-label="إغلاق معاينة إيصال الدفع"
                className="rounded-xl p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="relative max-h-[70vh] min-h-[300px] overflow-auto rounded-2xl border border-neutral-800 bg-black/80 flex items-center justify-center p-3">
              <Image
                src={proof.proofFileUrl}
                alt="إيصال الدفع الكامل"
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 768px"
                className="max-h-[65vh] w-auto max-w-full object-contain rounded-lg shadow-lg"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadReceipt(proof.proofFileUrl!, `receipt-${booking.bookingNumber}.jpg`)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#d4af37] px-4 py-2.5 text-xs font-black text-neutral-950 hover:bg-[#e5c45a] transition-colors"
                >
                  <Download className="size-4" />
                  <span>تحميل الوصل</span>
                </button>
                <a
                  href={proof.proofFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 px-4 py-2.5 text-xs font-bold text-[#f3e4a8] hover:bg-[#d4af37]/20 transition-colors"
                >
                  <ExternalLink className="size-4" />
                  <span>فتح بالحجم الأصلي الكامل</span>
                </a>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setShowReceiptModal(false); setShowDeleteConfirm(true); }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/20 transition-colors"
                >
                  <Trash2 className="size-4" />
                  <span>حذف الوصل</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowReceiptModal(false)}
                  className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-xs font-bold text-neutral-300 hover:bg-neutral-700"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </article>
  );
}

function CapabilityNotice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-4 text-xs sm:text-sm leading-6 text-amber-100">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#d4af37]" />
      <p>{children}</p>
    </div>
  );
}

function OverviewSection({
  reports,
  monthlyRevenue,
}: {
  overviewTab?: OverviewTab;
  metrics?: DashboardMetricsDto;
  branches?: BranchDto[];
  operationsReviewBookings?: BookingSummaryDto[];
  unassignedBookings?: BookingSummaryDto[];
  reports: ReportsDto;
  monthlyRevenue?: MonthlyRevenueDataDto;
}) {
  const cancellationRate = reports.totalBookings > 0
    ? Math.round((reports.cancelledBookings / reports.totalBookings) * 100)
    : 0;

  const completionRate = reports.totalBookings > 0
    ? Math.round((reports.completedBookings / reports.totalBookings) * 100)
    : 0;

  return (
    <div className="space-y-8">
      {/* Executive Command Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-neutral-800/80 pb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#d4af37] shadow-sm shadow-[#d4af37]" />
            <p className="text-xs font-bold uppercase tracking-widest text-[#d4af37]">EXECUTIVE COMMAND CENTER</p>
          </div>
          <h2 className="mt-1 text-balance text-2xl font-black tracking-tight text-white sm:text-3xl">
            مركز قيادة بريق التنفيذي
          </h2>
          <p className="mt-1.5 max-w-3xl text-pretty text-xs sm:text-sm leading-6 text-neutral-400">
            لوحة قيادة وتحليل مالي وتشغيلي موحدة وشاملة لكافة أنشطة العمل للفترة المحددة.
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Unified Period Filter Bar (تحديد نطاق حساب التاريخ) */}
      {/* ========================================================================= */}
      <section aria-labelledby="period-filter-heading" className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-800/60 pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-[#d4af37]" />
            <h3 id="period-filter-heading" className="text-sm font-bold text-white">تحديد نطاق تاريخ الحساب والتقارير</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {monthlyRevenue?.exportUrl && (
              <a
                href={monthlyRevenue.exportUrl}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition-all"
              >
                <Download className="size-3.5" />
                <span>تصدير كشف العمليات CSV</span>
              </a>
            )}
            <a
              href={`/admin/reports/export?from=${reports.from}&to=${reports.to}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800/80 px-3 py-1.5 text-xs font-bold text-neutral-200 hover:bg-neutral-700 transition-all"
            >
              <FileSpreadsheet className="size-3.5 text-[#d4af37]" />
              <span>تصدير التقرير المالي CSV</span>
            </a>
          </div>
        </div>

        <form action="/admin" method="get" className="space-y-3">
          <input type="hidden" name="section" value="overview" />
          {monthlyRevenue?.filterType && (
            <input type="hidden" name="revenue_type" value={monthlyRevenue.filterType} />
          )}
          {monthlyRevenue?.searchQuery && (
            <input type="hidden" name="revenue_q" value={monthlyRevenue.searchQuery} />
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
            <div>
              <label htmlFor="report-from" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">من تاريخ</label>
              <input id="report-from" name="from" type="date" defaultValue={reports.from} className={inputClass} />
            </div>
            <div>
              <label htmlFor="report-to" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">إلى تاريخ</label>
              <input id="report-to" name="to" type="date" defaultValue={reports.to} className={inputClass} />
            </div>
            <button type="submit" className={primaryButtonClass}>
              تطبيق وحساب الفترة
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-800/50">
            <span className="text-[11px] font-bold text-neutral-400">فترات سريعة:</span>
            <Link
              href={`/admin?section=overview&from=${new Date().toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`}
              className="rounded-lg bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-neutral-300 hover:bg-[#d4af37] hover:text-neutral-950 border border-neutral-800 transition-all"
            >
              اليوم
            </Link>
            <Link
              href={`/admin?section=overview&from=${new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`}
              className="rounded-lg bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-neutral-300 hover:bg-[#d4af37] hover:text-neutral-950 border border-neutral-800 transition-all"
            >
              آخر 7 أيام
            </Link>
            <Link
              href={`/admin?section=overview&from=${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01&to=${new Date().toISOString().slice(0, 10)}`}
              className="rounded-lg bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-neutral-300 hover:bg-[#d4af37] hover:text-neutral-950 border border-neutral-800 transition-all"
            >
              هذا الشهر
            </Link>
            <Link
              href={`/admin?section=overview&from=${new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`}
              className="rounded-lg bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-neutral-300 hover:bg-[#d4af37] hover:text-neutral-950 border border-neutral-800 transition-all"
            >
              آخر 30 يوم
            </Link>
          </div>
        </form>
      </section>

      {/* ========================================================================= */}
      {/* 1. المؤشرات المالية وصافي الأرباح للفترة المحددة */}
      {/* ========================================================================= */}
      <section aria-labelledby="financial-kpi-heading" className="space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800/70 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <DollarSign className="size-4" />
            </div>
            <div>
              <h3 id="financial-kpi-heading" className="text-base sm:text-lg font-black text-white">المؤشرات المالية وصافي الأرباح</h3>
              <p className="text-xs text-neutral-400">ملخص الإيرادات وصافي الربح والمقبوضات والمستحقات للفترة المحددة</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#d4af37]/10 px-3 py-1 text-xs font-bold text-[#f3e4a8] border border-[#d4af37]/25">
            {reports.from === reports.to ? `يوم ${reports.from}` : `${reports.from} ← ${reports.to}`}
          </span>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card 1: صافي الإيراد والأرباح (VIP Hero Card) */}
          <article className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[#d4af37]/40 bg-gradient-to-br from-[#d4af37]/20 via-[#d4af37]/5 to-[#111114] p-5 sm:p-6 shadow-xl transition-all duration-300 hover:border-[#d4af37] hover:shadow-[#d4af37]/15">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#f3e4a8] leading-snug">صافي الإيراد والأرباح</p>
                <p className="mt-2.5 text-2xl sm:text-3xl font-black tracking-tight text-white group-hover:text-[#f3e4a8] transition-colors tabular-nums">
                  {formatCurrency(monthlyRevenue ? monthlyRevenue.netRevenue : reports.netCollected)}
                </p>
              </div>
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-[#d4af37]/40 bg-[#d4af37]/20 text-[#d4af37] shadow-md shadow-[#d4af37]/10 transition-transform duration-300 group-hover:scale-105">
                <Sparkles className="size-5" />
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-neutral-300 border-t border-[#d4af37]/20 pt-2.5 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#d4af37] shrink-0" />
              <span>إجمالي المقبوضات ناقص الاستردادات</span>
            </p>
          </article>

          {/* Card 2: إجمالي المقبوضات */}
          <MetricCard
            label="إجمالي المقبوضات"
            value={formatCurrency(monthlyRevenue ? monthlyRevenue.grossRevenue : reports.collectedAmount)}
            hint="الحجوزات + باقات الاشتراكات"
            icon={<DollarSign aria-hidden="true" className="size-5 text-neutral-400" />}
          />

          {/* Card 3: المبالغ المستحقة */}
          <MetricCard
            label="المبالغ المستحقة"
            value={formatCurrency(reports.amountDue)}
            hint="أرصدة حجوزات غير محصلة"
            icon={<WalletCards aria-hidden="true" className="size-5" />}
            tone="red"
          />

          {/* Card 4: إيراد الحجوزات */}
          <MetricCard
            label="إيراد الحجوزات"
            value={formatCurrency(monthlyRevenue ? monthlyRevenue.bookingRevenue : reports.collectedAmount)}
            hint={monthlyRevenue ? `${monthlyRevenue.bookingPaymentsCount} حركة دفع حجز` : 'مدفوعات الحجوزات'}
            icon={<Banknote aria-hidden="true" className="size-5" />}
            tone="green"
          />

          {/* Card 5: إيراد باقات الاشتراكات */}
          <MetricCard
            label="إيراد باقات الاشتراكات"
            value={formatCurrency(monthlyRevenue ? monthlyRevenue.subscriptionRevenue : 0)}
            hint={monthlyRevenue ? `${monthlyRevenue.subscriptionProofsCount} اشتراك مفعل في الفترة` : 'مدفوعات الباقات'}
            icon={<PackageCheck aria-hidden="true" className="size-5" />}
            tone="blue"
          />

          {/* Card 6: الاستردادات المعتمدة */}
          <MetricCard
            label="الاستردادات المعتمدة"
            value={`-${formatCurrency(monthlyRevenue ? monthlyRevenue.refundsTotal : reports.refundedAmount)}`}
            hint={monthlyRevenue ? `${monthlyRevenue.refundsCount} حركة استرداد` : 'مستردة للعملاء'}
            icon={<ShieldAlert aria-hidden="true" className="size-5" />}
            tone="red"
          />
        </div>
      </section>

      {/* خط فاصل أنيق بين الأقسام */}
      <div className="border-t border-neutral-800/80" />

      {/* ========================================================================= */}
      {/* 2. المؤشرات التشغيلية ونشاط الفرق والجودة */}
      {/* ========================================================================= */}
      <section aria-labelledby="operations-kpi-heading" className="space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800/70 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-[#d4af37]/10 text-[#d4af37] border border-[#d4af37]/20">
              <Activity className="size-4" />
            </div>
            <div>
              <h3 id="operations-kpi-heading" className="text-base sm:text-lg font-black text-white">المؤشرات التشغيلية ونشاط الفرق والجودة</h3>
              <p className="text-xs text-neutral-400">حركة الحجوزات ونسب الإنجاز وسعة الفرق والعملاء وملاحظات الجودة للفترة المحددة</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#d4af37]/10 px-3 py-1 text-xs font-bold text-[#f3e4a8] border border-[#d4af37]/25">
            {reports.from === reports.to ? `يوم ${reports.from}` : `${reports.from} ← ${reports.to}`}
          </span>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="إجمالي الحجوزات"
            value={formatNumber(reports.totalBookings)}
            hint={reports.inProgressBookings > 0 ? `قيد التنفيذ بالفترة: ${formatNumber(reports.inProgressBookings)}` : 'إجمالي حجوزات الفترة'}
            icon={<CalendarDays aria-hidden="true" className="size-5" />}
          />

          <MetricCard
            label="الحجوزات المكتملة"
            value={formatNumber(reports.completedBookings)}
            hint={`معدل إكمال الفترة: ${completionRate}٪`}
            icon={<CheckCircle2 aria-hidden="true" className="size-5" />}
            tone="green"
          />

          <MetricCard
            label="الحجوزات الملغاة"
            value={formatNumber(reports.cancelledBookings)}
            hint={`معدل إلغاء الفترة: ${cancellationRate}٪`}
            icon={<ShieldAlert aria-hidden="true" className="size-5" />}
            tone="red"
          />

          <MetricCard
            label="متوسط قيمة الحجز"
            value={formatCurrency(reports.averageBookingValue)}
            hint="متوسط قيمة الخدمة في الفترة"
            icon={<Gauge aria-hidden="true" className="size-5" />}
          />

          <MetricCard
            label="إشغال الفرق التشغيلية"
            value={`${formatNumber(reports.teamUtilization)}٪`}
            hint="الحجوزات المسندة ÷ سعة الفترة"
            icon={<Gauge aria-hidden="true" className="size-5" />}
            tone="blue"
          />

          <MetricCard
            label="الاشتراكات المفعلة"
            value={`${formatNumber(reports.newSubscriptions)} اشتراك`}
            hint={reports.visitsRemaining > 0 ? `رصيد زيارات متاح: ${formatNumber(reports.visitsRemaining)}` : 'تم تفعيلها في الفترة'}
            icon={<PackageCheck aria-hidden="true" className="size-5" />}
          />

          <MetricCard
            label="عملاء جدد في الفترة"
            value={`${formatNumber(reports.newCustomers)} عميل`}
            hint={reports.repeatCustomers > 0 ? `عملاء متكررون بالفترة: ${formatNumber(reports.repeatCustomers)}` : 'تم تسجيلهم في الفترة'}
            icon={<UserRound aria-hidden="true" className="size-5" />}
            tone="blue"
          />

          <MetricCard
            label="مشكلات الجودة والشكاوى"
            value={formatNumber(reports.qualityOpen)}
            hint="مراجعات جودة وشكاوى بالفترة"
            icon={<ShieldAlert aria-hidden="true" className="size-5" />}
            tone="red"
          />
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. تفصيل الإيرادات ومصادر الدخل للفترة المحددة */}
      {/* ========================================================================= */}
      {monthlyRevenue && (
        <section aria-labelledby="revenue-distribution-heading" className="space-y-4">
          <div className="flex items-center gap-2.5 border-b border-neutral-800/70 pb-3">
            <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <DollarSign className="size-4" />
            </div>
            <div>
              <h3 id="revenue-distribution-heading" className="text-base sm:text-lg font-black text-white">تفصيل الإيرادات ومصادر الدخل</h3>
              <p className="text-xs text-neutral-400">توزيع المقبوضات حسب وسائل الدفع والفروع للفترة المحددة</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="method-breakdown" className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 p-5 shadow-lg">
              <h4 id="method-breakdown" className="text-sm font-bold text-white flex items-center gap-2 border-b border-neutral-800/60 pb-3 mb-4">
                <WalletCards className="size-4 text-[#d4af37]" />
                <span>توزيع الإيراد حسب وسيلة الدفع</span>
              </h4>
              <div className="space-y-3">
                {monthlyRevenue.paymentMethods.length === 0 ? (
                  <p className="text-xs text-neutral-500 py-4 text-center">لا توجد مقبوضات مسجلة في هذه الفترة.</p>
                ) : (
                  monthlyRevenue.paymentMethods.map((data) => (
                    <div key={data.key} className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-3">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-neutral-200">{data.label}</span>
                        <span className="font-mono text-[#f3e4a8]">{formatCurrency(data.amount)} ({data.count} عملية)</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-2 flex-1 rounded-full bg-neutral-800 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-[#d4af37] to-[#f0d879]" style={{ width: `${data.percentage}%` }} />
                        </div>
                        <span className="text-[11px] font-bold text-neutral-400">{data.percentage}%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section aria-labelledby="branch-revenue-breakdown" className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 p-5 shadow-lg">
              <h4 id="branch-revenue-breakdown" className="text-sm font-bold text-white flex items-center gap-2 border-b border-neutral-800/60 pb-3 mb-4">
                <Building2 className="size-4 text-[#d4af37]" />
                <span>توزيع الإيراد حسب الفرع</span>
              </h4>
              <div className="space-y-3">
                {monthlyRevenue.branches.length === 0 ? (
                  <p className="text-xs text-neutral-500 py-4 text-center">لا توجد مقبوضات مسجلة في هذه الفترة.</p>
                ) : (
                  monthlyRevenue.branches.map((data) => (
                    <div key={data.name} className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-3">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-neutral-200">{data.name}</span>
                        <span className="font-mono text-emerald-400">{formatCurrency(data.amount)} ({data.count} عملية)</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-2 flex-1 rounded-full bg-neutral-800 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-400" style={{ width: `${data.percentage}%` }} />
                        </div>
                        <span className="text-[11px] font-bold text-neutral-400">{data.percentage}%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 3. كشف وسجل الحركات المالية الموثقة للفترة المحددة */}
      {/* ========================================================================= */}
      {monthlyRevenue && (
        <section id="transactions-ledger-section" aria-labelledby="transactions-ledger" className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 p-5 shadow-lg space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-neutral-800/60 pb-3.5">
            <div>
              <h4 id="transactions-ledger" className="text-sm font-black text-white flex items-center gap-2">
                <TrendingUp className="size-4 text-[#d4af37]" />
                <span>سجل الحركات المالية الموثقة ({monthlyRevenue.transactions.length} حركة في الفترة)</span>
              </h4>
              <p className="text-xs text-neutral-400 mt-1">كشف تفصيلي بالاسم ورقم الهاتف والفرع وطريقة الدفع لكل حجز واشتراك واسترداد للفترة المحددة.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { type: 'all', label: 'الكل' },
                  { type: 'booking', label: 'الحجوزات' },
                  { type: 'subscription', label: 'الاشتراكات' },
                  { type: 'refund', label: 'الاستردادات' },
                ] as const
              ).map((tab) => {
                const isActive = monthlyRevenue.filterType === tab.type;
                return (
                  <Link
                    key={tab.type}
                    href={`/admin?section=overview&from=${reports.from}&to=${reports.to}&revenue_type=${tab.type}${monthlyRevenue.searchQuery ? `&revenue_q=${encodeURIComponent(monthlyRevenue.searchQuery)}` : ''}#transactions-ledger-section`}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${isActive ? 'bg-[#d4af37] text-black shadow-md' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-white border border-neutral-800'}`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Search Bar */}
          <form action="/admin" method="get" className="flex items-center gap-2">
            <input type="hidden" name="section" value="overview" />
            <input type="hidden" name="from" value={reports.from} />
            <input type="hidden" name="to" value={reports.to} />
            <input type="hidden" name="revenue_type" value={monthlyRevenue.filterType} />
            <div className="relative flex-1">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
              <input
                name="revenue_q"
                defaultValue={monthlyRevenue.searchQuery}
                placeholder="ابحث باسم العميل، رقم الهاتف، رقم الحجز، أو الفرع…"
                className="w-full rounded-xl border border-neutral-800 bg-[#080808] py-2.5 pr-10 pl-4 text-xs text-white placeholder:text-neutral-500 focus:border-[#d4af37] focus:outline-none"
              />
            </div>
            <button type="submit" className="rounded-xl bg-[#d4af37] px-4 py-2.5 text-xs font-bold text-black hover:bg-[#e0bd3a]">بحث</button>
            {monthlyRevenue.searchQuery ? (
              <Link
                href={`/admin?section=overview&from=${reports.from}&to=${reports.to}&revenue_type=${monthlyRevenue.filterType}#transactions-ledger-section`}
                className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-xs font-bold text-neutral-300 hover:bg-neutral-800"
              >
                مسح
              </Link>
            ) : null}
          </form>

          {/* Transactions Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-right text-xs">
              <caption className="sr-only">سجل الحركات المالية الموثقة</caption>
              <thead className="border-b border-neutral-800 text-neutral-400">
                <tr>
                  <th scope="col" className="px-3 py-3 font-medium">التاريخ والوقت</th>
                  <th scope="col" className="px-3 py-3 font-medium">النوع والبيان</th>
                  <th scope="col" className="px-3 py-3 font-medium">العميل</th>
                  <th scope="col" className="px-3 py-3 font-medium">الفرع</th>
                  <th scope="col" className="px-3 py-3 font-medium">وسيلة الدفع</th>
                  <th scope="col" className="px-3 py-3 font-medium">المرجع</th>
                  <th scope="col" className="px-3 py-3 font-medium text-left">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRevenue.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-neutral-500">
                      لا توجد حركات مالية مطابقة للبحث في هذه الفترة.
                    </td>
                  </tr>
                ) : (
                  monthlyRevenue.transactions.map((tx) => {
                    const isPositive = tx.amount > 0;
                    return (
                      <tr key={tx.id} className="border-b border-neutral-900 hover:bg-white/[0.02]">
                        <td className="px-3 py-3 font-mono text-neutral-400 text-[11px]" dir="ltr">
                          {formatDateTime(tx.date)}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold ${tx.type === 'BOOKING' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : tx.type === 'SUBSCRIPTION' ? 'bg-sky-500/10 text-sky-300 border border-sky-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'}`}>
                            {tx.type === 'BOOKING' ? 'حجز' : tx.type === 'SUBSCRIPTION' ? 'اشتراك' : 'استرداد'}
                          </span>
                          <span className="mr-2 text-white font-medium">{tx.title}</span>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-bold text-neutral-200">{tx.customerName}</p>
                          <p className="font-mono text-[10px] text-neutral-500" dir="ltr">{tx.customerPhone}</p>
                        </td>
                        <td className="px-3 py-3 text-neutral-300">{tx.branchName}</td>
                        <td className="px-3 py-3 text-neutral-300">{tx.paymentMethod}</td>
                        <td className="px-3 py-3 font-mono text-neutral-400 text-[11px]" dir="ltr">{tx.reference}</td>
                        <td className="px-3 py-3 text-left font-mono font-bold">
                          <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                            {isPositive ? '+' : ''}{formatCurrency(tx.amount)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function BookingsSection({
  bookings,
  filters,
  statusCounts = {},
  totalAllCount = 0,
}: {
  bookings: BookingSummaryDto[];
  filters: OwnerFiltersDto;
  statusCounts?: Record<string, number>;
  totalAllCount?: number;
}) {
  const operationsReviewCount = statusCounts['AWAITING_OPERATIONS_REVIEW'] ?? 0;
  const unassignedCount = statusCounts['AWAITING_ASSIGNMENT'] ?? 0;
  const totalPendingNotifications = operationsReviewCount + unassignedCount;

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="الحجوزات" title="متابعة دورة الحجز" description="استعراض ومتابعة كافة الحجوزات، مواعيدها، فروعها وحالات الدفع بنظرة إشرافية شاملة." />

      {/* Quick Status Notification Bar for the 7 actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-3.5 sm:p-4 shadow-md">
        <div className="flex items-center gap-2">
          <span className="flex size-2 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-xs sm:text-sm font-bold text-neutral-300">
            حجوزات تتطلب تدخلاً عاجلاً ({totalPendingNotifications} إشعارات):
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin?section=bookings&status=AWAITING_OPERATIONS_REVIEW"
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition-all border ${
              filters.bookingStatus === 'AWAITING_OPERATIONS_REVIEW'
                ? 'border-amber-500 bg-amber-500/20 text-amber-200 shadow-sm'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
            }`}
          >
            <span>بانتظار مراجعة التشغيل</span>
            <span className="rounded-full bg-amber-500/30 border border-amber-500/50 px-2 py-0.5 text-[10px] font-black text-white">
              {operationsReviewCount}
            </span>
          </Link>

          <Link
            href="/admin?section=bookings&status=AWAITING_ASSIGNMENT"
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition-all border ${
              filters.bookingStatus === 'AWAITING_ASSIGNMENT'
                ? 'border-rose-500 bg-rose-500/20 text-rose-200 shadow-sm'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
            }`}
          >
            <span>بانتظار إسناد فريق</span>
            <span className="rounded-full bg-rose-500/30 border border-rose-500/50 px-2 py-0.5 text-[10px] font-black text-white">
              {unassignedCount}
            </span>
          </Link>
        </div>
      </div>

      <form action="/admin" method="get" className="grid gap-3 rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-4 sm:grid-cols-[1fr_260px_auto_auto] shadow-md">
        <input type="hidden" name="section" value="bookings" />
        <div><label htmlFor="booking-query" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">بحث الحجز أو العميل</label><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute right-3 top-3 size-4 text-neutral-500" /><input id="booking-query" name="q" defaultValue={filters.bookingQuery} autoComplete="off" placeholder="رقم الحجز أو اسم/هاتف العميل…" className={`${inputClass} pr-10`} /></div></div>
        <div>
          <label htmlFor="booking-status-filter" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">
            حالة الحجز
          </label>
          <select id="booking-status-filter" name="status" defaultValue={filters.bookingStatus} className={inputClass}>
            <option value="" className="bg-[#111]">
              كل الحالات {totalAllCount > 0 ? `(${totalAllCount})` : ''}
            </option>
            {Object.entries(bookingStatusLabels).map(([value, label]) => {
              const count = statusCounts[value] ?? 0;
              let suffix = `(${count})`;
              if (value === 'AWAITING_OPERATIONS_REVIEW' && count > 0) {
                suffix = `(${count} إشعار 🔔)`;
              } else if (value === 'AWAITING_ASSIGNMENT' && count > 0) {
                suffix = `(${count} إشعار 🔔)`;
              }
              return (
                <option key={value} value={value} className="bg-[#111]">
                  {label} {suffix}
                </option>
              );
            })}
          </select>
        </div>
        <button type="submit" className={`${primaryButtonClass} self-end`}>تطبيق الفلاتر</button>
        <Link href="/admin?section=bookings" className={`${secondaryButtonClass} self-end`}>إعادة ضبط</Link>
      </form>
      {bookings.length === 0 ? (
        <EmptyState title="لا توجد حجوزات مطابقة" description="غيّر حالة الحجز أو عبارة البحث ثم أعد المحاولة." />
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} />
          ))}
        </div>
      )}
    </div>
  );
}









function BranchesSection({
  branches,
  onEditBranch,
  onRequestBranch,
}: {
  branches: BranchDto[];
  onEditBranch: (branch: BranchDto) => void;
  onRequestBranch: () => void;
}) {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="الفروع والتغطية"
        title="هيكل التشغيل والفروع"
        description="إدارة وتعديل بيانات الفروع وسعات التشغيل، أو إضافة فرع جديد مباشرة للمنظومة."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/branches"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#d4af37] px-4 text-xs font-black text-black hover:bg-[#e4c65f] transition-all shadow-md shadow-[#d4af37]/20"
            >
              <Building2 className="size-4" aria-hidden="true" />
              <span>إدارة وتعديل وحذف الفروع</span>
            </Link>
            <Link
              href="/admin/branches"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.05] px-3.5 text-xs font-bold text-white hover:bg-white/10 transition-all"
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>إضافة فرع جديد</span>
            </Link>
            <button
              type="button"
              onClick={onRequestBranch}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3.5 text-xs font-bold text-emerald-200 hover:bg-emerald-400/20 transition-all"
            >
              <FileSearch className="size-4" aria-hidden="true" />
              <span>طلب فرع جديد</span>
            </button>
          </div>
        }
      />
      {branches.length === 0 ? (
        <EmptyState
          title="لا توجد فروع"
          description="أضف فرعًا جديدًا مباشرة، ثم جهّز مناطق التغطية وفريق التشغيل من مركز الإعداد."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {branches.map((branch) => (
            <article
              key={branch.id}
              className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 shadow-lg flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-white">{branch.nameAr}</h3>
                    <p dir="ltr" translate="no" className="mt-0.5 font-mono text-xs text-neutral-500">
                      {branch.code}
                    </p>
                  </div>
                  <StatusBadge status={branch.status} />
                </div>
                <p className="mt-3 break-words text-xs sm:text-sm leading-6 text-neutral-400">
                  {branch.address}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:text-sm rounded-xl bg-neutral-950/40 border border-neutral-800/60 p-3.5">
                  <div>
                    <dt className="text-neutral-500 text-[11px]">فرق التشغيل</dt>
                    <dd className="mt-1 font-bold tabular-nums text-white">{formatNumber(branch.teamCount)}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500 text-[11px]">زونات التغطية</dt>
                    <dd className="mt-1 font-bold tabular-nums text-white">{formatNumber(branch.zoneCount)}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500 text-[11px]">حجوزات اليوم</dt>
                    <dd className="mt-1 font-bold tabular-nums text-white">
                      {formatNumber(branch.todayBookings)} / {formatNumber(branch.dailyBookingLimit)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500 text-[11px]">وسائل دفع نشطة</dt>
                    <dd className="mt-1 font-bold tabular-nums text-white">{formatNumber(branch.activePaymentMethodCount)}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500 text-[11px]">التوزيع</dt>
                    <dd className="mt-1 text-neutral-300 font-medium">{branch.assignmentMode === 'AUTOMATIC' ? 'تلقائي' : 'يدوي'}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500 text-[11px]">التوقيت</dt>
                    <dd dir="ltr" className="mt-1 text-neutral-400 font-mono">{branch.timezone}</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5 border-t border-neutral-800/80 pt-3.5">
                <Link
                  href="/admin/branches"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 transition-all"
                >
                  <Trash2 className="size-3.5 text-red-400" />
                  <span>حذف الفرع</span>
                </Link>
                <button
                  type="button"
                  onClick={() => onEditBranch(branch)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 px-3.5 py-1.5 text-xs font-bold text-[#f3e4a8] hover:bg-[#d4af37]/20 transition-all"
                >
                  <Pencil className="size-3.5 text-[#d4af37]" />
                  <span>تعديل بيانات الفرع</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}



function AuditSection({ auditLogs }: { auditLogs: AuditLogDto[] }) {
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="الحوكمة" title="سجل التعديلات والتدقيق" description="آخر 50 حدثًا مسجلًا مع المنفذ والكيان والسبب إن وجد." />
      {auditLogs.length === 0 ? <EmptyState title="لا توجد أحداث" description="لم تُسجل عمليات Audit حتى الآن." /> : <div className="space-y-3">{auditLogs.map((log) => <article key={log.id} className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-4 shadow-lg"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p dir="ltr" translate="no" className="break-words font-mono font-bold text-white text-sm">{log.action}</p><p className="mt-1 text-xs text-neutral-400">{log.actorName} · <span className="text-[#d4af37]">{log.actorRole}</span></p></div><time dateTime={log.createdAt} className="shrink-0 text-xs text-neutral-500">{formatDateTime(log.createdAt)}</time></div><div className="mt-3 flex flex-wrap gap-2 text-xs"><span dir="ltr" translate="no" className="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-0.5 text-neutral-400 font-mono">{log.entityType}</span><span dir="ltr" translate="no" className="max-w-full truncate rounded-md bg-neutral-900 border border-neutral-800 px-2 py-0.5 text-neutral-400 font-mono">{log.entityId}</span></div>{log.reason ? <p className="mt-2.5 break-words text-xs sm:text-sm leading-6 text-neutral-300 border-t border-neutral-800/60 pt-2">{log.reason}</p> : null}</article>)}</div>}
    </div>
  );
}

function OwnerActionDialog({
  modal,
  teams,
  pending,
  error,
  bookingDecision,
  dialogRef,
  onBookingDecision,
  onClose,
  onSubmit,
}: {
  modal: Exclude<ModalState, null>;
  teams: TeamDto[];
  pending: boolean;
  error: string;
  bookingDecision: BookingDecision | '';
  dialogRef: React.RefObject<HTMLDivElement | null>;
  onBookingDecision: (decision: BookingDecision | '') => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const title = modal.type === 'booking-review'
    ? 'تأكيد مراجعة الحجز'
    : modal.type === 'assignment'
      ? 'تأكيد إسناد الفريق'
      : modal.type === 'edit-branch'
        ? 'تعديل بيانات الفرع'
        : 'طلب فرع جديد';
  const eligibleTeams = modal.type === 'assignment'
    ? teams.filter((team) => team.active && team.branchId === modal.booking.branchId)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="owner-action-title" tabIndex={-1} className="w-full max-w-xl rounded-3xl border border-neutral-800 bg-[#0f0f13] p-5 shadow-2xl focus-visible:ring-2 focus-visible:ring-[#d4af37] sm:p-7 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-800/80 pb-4">
          <div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-[#d4af37]">
              <Sparkles className="size-3" />
              إجراء إداري رسمي
            </span>
            <h2 id="owner-action-title" className="mt-1 text-lg sm:text-xl font-black text-white">{title}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={pending} aria-label="إغلاق النافذة" className="rounded-xl p-2 text-neutral-400 hover:bg-white/10 hover:text-white transition focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-50">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <p className="mt-3 text-xs sm:text-sm leading-6 text-neutral-400">راجع البيانات بدقة قبل الاعتماد. يتم حفظ الإجراء وتوثيقه آلياً في سجل الحوكمة والتدقيق.</p>
        {error ? <div role="alert" tabIndex={-1} className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs sm:text-sm font-medium text-rose-200">{error}</div> : null}
        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          {modal.type === 'booking-review' ? <><input type="hidden" name="bookingId" value={modal.booking.id} /><div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-4 text-xs sm:text-sm"><p dir="ltr" translate="no" className="font-mono font-bold text-white text-base">{modal.booking.bookingNumber}</p><p className="mt-1.5 text-neutral-400">{modal.booking.customerName} · {modal.booking.serviceName}</p></div><div><label htmlFor="booking-decision" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">القرار</label><select id="booking-decision" name="decision" required value={bookingDecision} onChange={(event) => onBookingDecision(event.target.value as BookingDecision | '')} className={inputClass}><option value="" className="bg-[#111]">اختر القرار</option><option value="ACCEPT" className="bg-[#111]">قبول تشغيلي</option><option value="REJECT" className="bg-[#111]">رفض الحجز</option></select></div><div><label htmlFor="booking-review-reason" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">سبب القرار</label><textarea id="booking-review-reason" name="reason" required minLength={3} maxLength={1000} rows={3} autoComplete="off" className={inputClass} /></div></> : null}
          {modal.type === 'assignment' ? <><input type="hidden" name="bookingId" value={modal.booking.id} /><div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-4 text-xs sm:text-sm"><p dir="ltr" translate="no" className="font-mono font-bold text-white text-base">{modal.booking.bookingNumber}</p><p className="mt-1.5 text-neutral-400">{modal.booking.branchName} · {formatDateTime(modal.booking.startAt)}</p></div>{eligibleTeams.length ? <><div><label htmlFor="assignment-team" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">الفريق المستهدف</label><select id="assignment-team" name="teamId" required defaultValue="" className={inputClass}><option value="" className="bg-[#111]">اختر فريقًا من نفس الفرع</option>{eligibleTeams.map((team) => <option key={team.id} value={team.id} className="bg-[#111]">{team.name} — الحمل: {team.todayBookingCount}/{team.dailyCapacity}</option>)}</select></div><div><label htmlFor="assignment-reason" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">سبب الإسناد اليدوي</label><textarea id="assignment-reason" name="reason" required minLength={3} maxLength={500} rows={3} autoComplete="off" className={inputClass} /></div></> : <CapabilityNotice>لا يوجد فريق نشط في نفس الفرع يمكن اختياره.</CapabilityNotice>}</> : null}
          {modal.type === 'edit-branch' ? (
            <>
              <input type="hidden" name="branchId" value={modal.branch.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-branch-name-ar" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-400">اسم الفرع بالعربية</label>
                  <input id="edit-branch-name-ar" name="nameAr" required defaultValue={modal.branch.nameAr} minLength={2} maxLength={120} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="edit-branch-name-en" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-400">الاسم بالإنجليزية (اختياري)</label>
                  <input id="edit-branch-name-en" name="nameEn" defaultValue={modal.branch.nameEn ?? ''} maxLength={120} dir="ltr" className={inputClass} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-branch-code" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-400">كود الفرع</label>
                  <input id="edit-branch-code" name="code" required defaultValue={modal.branch.code} minLength={3} maxLength={24} dir="ltr" pattern="[A-Za-z0-9-]{3,24}" className={`${inputClass} font-mono uppercase`} />
                </div>
                <div>
                  <label htmlFor="edit-branch-daily-limit" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-400">الطاقة اليومية (حجز/يوم)</label>
                  <input id="edit-branch-daily-limit" name="dailyBookingLimit" type="number" required min={1} max={500} defaultValue={modal.branch.dailyBookingLimit} className={inputClass} />
                </div>
              </div>

              <div>
                <label htmlFor="edit-branch-address" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-400">العنوان / النطاق التشغيلي</label>
                <textarea id="edit-branch-address" name="address" required defaultValue={modal.branch.address} minLength={3} maxLength={500} rows={2} className={inputClass} />
              </div>

              <input type="hidden" name="phone" value={modal.branch.phone ?? ''} />
              <input type="hidden" name="whatsapp" value={modal.branch.whatsapp ?? ''} />

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-branch-assignment" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-400">نمط توزيع الحجوزات</label>
                  <select id="edit-branch-assignment" name="assignmentMode" defaultValue={modal.branch.assignmentMode} className={inputClass}>
                    <option value="MANUAL" className="bg-[#111]">يدوي (بواسطة مدير التشغيل)</option>
                    <option value="AUTOMATIC" className="bg-[#111]">تلقائي (توزيع آلي)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-branch-status" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-400">حالة الفرع</label>
                  <select id="edit-branch-status" name="status" defaultValue={modal.branch.status} className={inputClass}>
                    <option value="ACTIVE" className="bg-[#111]">نشط (Active)</option>
                    <option value="PAUSED" className="bg-[#111]">متوقف مؤقتاً (Paused)</option>
                    <option value="DISABLED" className="bg-[#111]">معطل (Disabled)</option>
                  </select>
                </div>
              </div>
            </>
          ) : null}
          {modal.type === 'branch-request' ? (
            <>
              <div>
                <label htmlFor="branch-request-name" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">اسم الفرع المقترح</label>
                <input id="branch-request-name" name="branchName" required minLength={2} maxLength={120} autoComplete="off" className={inputClass} />
              </div>
              <div>
                <label htmlFor="branch-request-reason" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">سبب الطلب</label>
                <textarea id="branch-request-reason" name="reason" required minLength={3} maxLength={1000} rows={4} autoComplete="off" className={inputClass} />
              </div>
            </>
          ) : null}
          <div className="flex flex-col-reverse gap-3 border-t border-neutral-800/80 pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={pending} className={secondaryButtonClass}>إلغاء</button>
            <button type="submit" disabled={pending || (modal.type === 'assignment' && eligibleTeams.length === 0)} aria-busy={pending} className={primaryButtonClass}>
              {pending ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> جاري التنفيذ…</> : 'تأكيد الإجراء'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OwnerCommandCenter(props: OwnerCommandCenterProps) {
  const {
    owner,
    currentSection,
    overviewTab = 'pulse',
    metrics,
    statusCounts = {},
    totalAllBookingsCount = 0,
    filters,
    customerQuery,
    operationsReviewBookings,
    unassignedBookings,
    bookings,
    managedSubscriptions = [],
    teams,
    branches,
    customers,
    auditLogs,
    reports,
    monthlyRevenue,
  } = props;
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [pending, setPending] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [bookingDecision, setBookingDecision] = useState<BookingDecision | ''>('');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (modal) dialogRef.current?.focus();
  }, [modal]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  function openModal(nextModal: Exclude<ModalState, null>) {
    setActionError('');
    setBookingDecision('');
    setModal(nextModal);
  }

  function closeModal() {
    if (pending) return;
    setModal(null);
    setActionError('');
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    setPending(true);
    setActionError('');
    const formData = new FormData(event.currentTarget);
    try {
      const result = modal.type === 'booking-review'
        ? await reviewBookingAction(formData)
        : modal.type === 'assignment'
          ? await assignTeamManuallyAction(formData)
        : modal.type === 'edit-branch'
          ? await updateBranchAction(formData)
          : await requestNewBranchAction(formData);
      if ('error' in result && result.error) {
        setActionError(result.error);
        return;
      }
      setFeedback(
        modal.type === 'booking-review'
          ? 'تم حفظ قرار مراجعة الحجز.'
          : modal.type === 'assignment'
            ? 'تم إسناد الفريق بعد إعادة فحص التعارض.'
          : modal.type === 'edit-branch'
            ? 'تم تحديث بيانات الفرع بنجاح.'
            : 'تم إرسال طلب الفرع للمراجعة.',
      );
      setModal(null);
      router.refresh();
    } catch {
      setActionError('تعذر تنفيذ الإجراء الآن. راجع الاتصال ثم حاول مرة أخرى.');
    } finally {
      setPending(false);
    }
  }

  let sectionContent: ReactNode;
  switch (currentSection) {
    case 'bookings':
      sectionContent = (
        <BookingsSection
          bookings={bookings}
          filters={filters}
          statusCounts={statusCounts}
          totalAllCount={totalAllBookingsCount}
        />
      );
      break;
    case 'subscriptions':
      sectionContent = (
        <div className="space-y-6">
          <SectionHeader
            eyebrow="الاشتراكات الفعلية"
            title="اشتراكات العملاء والتفعيل"
            description="متابعة وإشراف على اشتراكات العملاء النشطة وأرصدة الباقات وتواريخ الانتهاء."
            action={
              <Link
                href="/admin/site?tab=subscriptions"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/10 px-4 py-2 text-xs font-bold text-[#f0d36d] hover:bg-[#d4af37]/20 transition-all"
              >
                <Sparkles className="size-4" aria-hidden="true" />
                <span>إدارة وتصميم باقات الاشتراك</span>
              </Link>
            }
          />
          <SubscriptionManagementPanel subscriptions={managedSubscriptions} readOnly={true} />
        </div>
      );
      break;
    case 'branches':
      sectionContent = <BranchesSection branches={branches} onEditBranch={(branch) => openModal({ type: 'edit-branch', branch })} onRequestBranch={() => openModal({ type: 'branch-request' })} />;
      break;
    case 'customers':
      sectionContent = <CustomerManagementPanel customers={customers} query={customerQuery} />;
      break;
    case 'reports':
      sectionContent = (
        <OverviewSection
          overviewTab="analytics"
          metrics={metrics}
          branches={branches}
          operationsReviewBookings={operationsReviewBookings}
          unassignedBookings={unassignedBookings}
          reports={reports}
          monthlyRevenue={monthlyRevenue}
        />
      );
      break;
    case 'audit':
      sectionContent = <AuditSection auditLogs={auditLogs} />;
      break;
    default:
      sectionContent = (
        <OverviewSection
          overviewTab={overviewTab}
          metrics={metrics}
          branches={branches}
          operationsReviewBookings={operationsReviewBookings}
          unassignedBookings={unassignedBookings}
          reports={reports}
          monthlyRevenue={monthlyRevenue}
        />
      );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#09090c] text-white selection:bg-[#d4af37]/30 selection:text-white">
      <a href="#owner-main" className="sr-only rounded-lg bg-[#d4af37] px-4 py-2 font-bold text-black focus:not-sr-only focus:fixed focus:right-4 focus:top-4 focus:z-[60]">تخطي إلى المحتوى</a>

      {/* Executive Command Header matching Customer Navbar Identity */}
      <header className="sticky top-0 z-50 bg-[#080808]/90 backdrop-blur-md border-b border-[#cea355]/20 py-3 shadow-xl">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-row items-center justify-between">
          {/* Brand Official Logo */}
          <div className="flex items-center shrink-0">
            <Link href="/admin" className="flex items-center" aria-label="بريق | BAREEQ">
              <BareeqLogo size="md" />
            </Link>
          </div>

          {/* Action Buttons, Owner Identity & Mobile Menu */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Owner Pill Badge (Desktop / Tablet) */}
            <div className="hidden sm:flex items-center gap-1.5 xs:gap-2 px-3 py-1.5 xs:px-4 xs:py-2 rounded-xl gold-gradient text-white font-bold text-xs xs:text-sm shadow-lg shadow-[#cea355]/25">
              <User className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-white" aria-hidden="true" />
              <span>{owner.fullName}</span>
              <span className="text-[10px] bg-black/30 text-white px-2 py-0.5 rounded font-black border border-white/20">
                OWNER
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

            {/* Mobile Menu Button matching Customer Layout */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex lg:hidden items-center gap-1.5 rounded-xl border border-[#c9a227]/40 bg-[#c9a227]/10 px-3 py-2 text-xs font-bold text-[#e5c45a] transition hover:bg-[#c9a227]/20 focus:outline-none focus:ring-2 focus:ring-[#e5c45a]"
              aria-label="فتح قائمة لوحة المالك"
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

              {/* Owner Info Card in Mobile Drawer */}
              <div className="mt-4 rounded-2xl border border-neutral-800 bg-[#080808] p-3.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#e5c45a]">
                  <Crown className="size-3 text-[#d4af37]" />
                  <span>لوحة المالك</span>
                </div>
                <p className="mt-0.5 truncate text-sm font-black text-white">{owner.fullName}</p>
              </div>

              {/* Section Links */}
              <nav className="mt-4 flex flex-col gap-1.5" aria-label="أقسام لوحة المالك">
                {sectionNav.map((item) => {
                  const Icon = item.icon;
                  const active = item.id ? currentSection === item.id : false;
                  const linkHref = item.href ?? `/admin?section=${item.id}`;

                  let badgeCount = 0;
                  if (item.id === 'bookings') badgeCount = metrics.operationsReview + metrics.unassignedBookings;

                  return (
                    <Link
                      key={item.label}
                      href={linkHref}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`inline-flex min-h-11 items-center justify-between gap-3 rounded-xl px-3.5 text-xs font-bold transition-all ${
                        active
                          ? 'border border-[#cea355] bg-[#cea355]/15 text-[#edce8b] shadow-sm shadow-[#cea355]/10 font-black ring-1 ring-[#cea355]/30'
                          : 'border border-transparent text-neutral-400 hover:border-neutral-800 hover:bg-white/[0.04] hover:text-white'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className={`size-4 shrink-0 ${active ? 'text-[#edce8b]' : 'text-[#c9a227]'}`} />
                        <span>{item.label}</span>
                      </span>
                      {badgeCount > 0 ? (
                        <span className="rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 text-[10px] font-black">
                          {formatNumber(badgeCount)}
                        </span>
                      ) : null}
                    </Link>
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
      <main id="owner-main" className="mx-auto max-w-[1600px] gap-6 px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8 lg:py-8">
        <aside aria-label="أقسام لوحة المالك" className="hidden lg:block min-w-0 lg:sticky lg:top-[90px] lg:self-start">
          <nav className="rounded-2xl border border-neutral-800/80 bg-[#0e0e12]/90 backdrop-blur-xl p-2.5 shadow-xl space-y-1">
            {sectionNav.map((item) => {
              const Icon = item.icon;
              const active = item.id ? currentSection === item.id : false;
              const linkHref = item.href ?? `/admin?section=${item.id}`;

              let badgeCount = 0;
              if (item.id === 'bookings') badgeCount = metrics.operationsReview + metrics.unassignedBookings;

              return (
                <Link
                  key={item.label}
                  href={linkHref}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all duration-200 ${
                    active
                      ? 'bg-gradient-to-r from-[#d4af37] via-[#e5c45a] to-[#d4af37] text-neutral-950 shadow-md shadow-[#d4af37]/20 font-bold'
                      : 'text-neutral-300 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon aria-hidden="true" className={`size-4 ${active ? 'text-neutral-950' : 'text-neutral-400'}`} />
                    {item.label}
                  </span>
                  {badgeCount > 0 ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${
                        active
                          ? 'bg-black/20 text-neutral-950'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {formatNumber(badgeCount)}
                    </span>
                  ) : null}
                </Link>
              );
            })}

            {/* تسجيل الخروج في أسفل القائمة الجانبية */}
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

        <div className="min-w-0">
          <div aria-live="polite" className="mb-4 min-h-6 text-sm font-medium text-emerald-400">{feedback}</div>
          {sectionContent}
        </div>
      </main>

      {modal ? <OwnerActionDialog modal={modal} teams={teams} pending={pending} error={actionError} bookingDecision={bookingDecision} dialogRef={dialogRef} onBookingDecision={setBookingDecision} onClose={closeModal} onSubmit={submitAction} /> : null}
    </div>
  );
}
