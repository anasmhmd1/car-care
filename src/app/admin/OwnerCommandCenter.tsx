'use client';

import type { FormEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Banknote,
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Gauge,
  History,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MessageCircle,
  PackageCheck,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  Users,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import {
  assignTeamManuallyAction,
  reviewBookingAction,
  reviewPaymentProofAction,
} from '@/app/actions/operations';
import { requestNewBranchAction } from '@/app/actions/owner';
import {
  approveRefundAction,
  reviewCancellationAction,
} from '@/app/actions/cancellation';
import { logoutAction } from '@/app/actions/auth';

const CustomerManagementPanel = dynamic(() => import('./CustomerManagementPanel'), {
  loading: () => <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 text-sm text-white/55">جارٍ تحميل إدارة العملاء…</div>,
});

export type OwnerSection =
  | 'overview'
  | 'bookings'
  | 'payments'
  | 'cancellations'
  | 'quality'
  | 'teams'
  | 'branches'
  | 'services'
  | 'subscriptions'
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
  beforePhotos: number;
  afterPhotos: number;
  minimumBeforePhotos: number;
  minimumAfterPhotos: number;
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
  slug: string;
  basePrice: number;
  durationMinutes: number;
  active: boolean;
  bookableOnline: boolean;
  subscriptionEligible: boolean;
  variantCount: number;
  addonCount: number;
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

export interface CustomerDto {
  id: string;
  fullName: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  active: boolean;
  mustChangePwd: boolean;
  createdAt: string;
  bookingCount: number;
  vehicleCount: number;
  subscriptionCount: number;
  lastBookingAt: string | null;
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
  rejectedBookings: number;
  noShowBookings: number;
  accessDeniedBookings: number;
  collectedAmount: number;
  refundedAmount: number;
  netCollected: number;
  amountDue: number;
  averageBookingValue: number;
  newSubscriptions: number;
  visitsConsumed: number;
  complaintCount: number;
  byStatus: Array<{ status: string; count: number }>;
  byService: ReportRowDto[];
  byBranch: ReportRowDto[];
  byTeam: ReportRowDto[];
  cancellationReasons: Array<{ reason: string; count: number }>;
}

export interface OwnerFiltersDto {
  bookingQuery: string;
  bookingStatus: string;
}

export interface OwnerCommandCenterProps {
  owner: OwnerDto;
  brand: BrandDto;
  currentSection: OwnerSection;
  metrics: DashboardMetricsDto;
  filters: OwnerFiltersDto;
  customerQuery: string;
  pendingProofs: PaymentProofDto[];
  operationsReviewBookings: BookingSummaryDto[];
  unassignedBookings: BookingSummaryDto[];
  cancellationRequests: CancellationRequestDto[];
  pendingRefunds: RefundDto[];
  qualityBookings: QualityBookingDto[];
  complaints: ComplaintDto[];
  bookings: BookingSummaryDto[];
  teams: TeamDto[];
  branches: BranchDto[];
  services: ServiceDto[];
  plans: PlanDto[];
  subscriptions: SubscriptionDto[];
  customers: CustomerDto[];
  auditLogs: AuditLogDto[];
  branchRequests: BranchRequestDto[];
  reports: ReportsDto;
}

type PaymentDecision = 'VERIFY' | 'REJECT' | 'SHORT' | 'REUPLOAD' | 'DUPLICATE';
type BookingDecision = 'ACCEPT' | 'REJECT';
type CancellationDecision = 'APPROVE' | 'REJECT';
type CancellationResolution =
  | 'REFUND_FULL'
  | 'REFUND_PARTIAL'
  | 'NO_REFUND'
  | 'KEEP_DEPOSIT'
  | 'VISIT_FEE'
  | 'CREDIT'
  | 'ESCALATE';
type ModalState =
  | { type: 'payment'; proof: PaymentProofDto }
  | { type: 'booking-review'; booking: BookingSummaryDto }
  | { type: 'assignment'; booking: BookingSummaryDto }
  | { type: 'cancellation'; request: CancellationRequestDto }
  | { type: 'refund-approval'; refund: RefundDto }
  | { type: 'branch-request' }
  | null;

const sectionNav: Array<{
  id: OwnerSection;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'الرئيسية', icon: LayoutDashboard },
  { id: 'bookings', label: 'الحجوزات', icon: CalendarDays },
  { id: 'payments', label: 'مراجعة المدفوعات', icon: WalletCards },
  { id: 'cancellations', label: 'الإلغاء والاسترداد', icon: ShieldAlert },
  { id: 'quality', label: 'الجودة والشكاوى', icon: ClipboardCheck },
  { id: 'teams', label: 'فرق التشغيل', icon: Users },
  { id: 'branches', label: 'الفروع والتغطية', icon: Building2 },
  { id: 'services', label: 'الخدمات', icon: Sparkles },
  { id: 'subscriptions', label: 'الاشتراكات', icon: PackageCheck },
  { id: 'customers', label: 'العملاء', icon: UserRound },
  { id: 'reports', label: 'التقارير', icon: BarChart3 },
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
const dateFormatter = new Intl.DateTimeFormat('ar-EG', {
  timeZone: 'Africa/Cairo',
  dateStyle: 'medium',
});

const inputClass =
  'w-full rounded-xl border border-white/15 bg-[#111] px-4 py-3 text-white placeholder:text-white/35 hover:border-white/25 focus-visible:border-[#d4af37] focus-visible:ring-2 focus-visible:ring-[#d4af37]/25 disabled:cursor-not-allowed disabled:opacity-60';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-4 py-2.5 font-bold text-black hover:bg-[#e2c55d] focus-visible:ring-2 focus-visible:ring-[#f0d879] disabled:cursor-not-allowed disabled:opacity-55';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 font-semibold text-white hover:border-white/35 hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-55';

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function bookingStatusLabel(status: string) {
  return bookingStatusLabels[status] ?? status;
}

function paymentStatusLabel(status: string) {
  return paymentStatusLabels[status] ?? status;
}

function isInternalFilePath(value: string) {
  return value.startsWith('/') && !value.startsWith('//');
}

function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        badgeTone[status] ?? 'border-white/15 bg-white/[0.05] text-white/70'
      }`}
    >
      {label ?? status}
    </span>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 px-5 py-10 text-center">
      <FileSearch aria-hidden="true" className="mx-auto size-8 text-white/35" />
      <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-white/50">{description}</p>
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
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#d4af37]">{eyebrow}</p>
        <h2 className="mt-1 text-balance text-2xl font-black tracking-tight text-white sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2 max-w-3xl text-pretty text-sm leading-6 text-white/55">{description}</p>
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
    gold: 'bg-[#d4af37]/10 text-[#d4af37]',
    green: 'bg-emerald-400/10 text-emerald-300',
    red: 'bg-red-400/10 text-red-200',
    blue: 'bg-sky-400/10 text-sky-200',
  }[tone];
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <div className={`mb-4 flex size-10 items-center justify-center rounded-xl ${toneClass}`}>
        {icon}
      </div>
      <p className="text-sm text-white/50">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-white">{value}</p>
      {hint ? <p className="mt-2 text-xs leading-5 text-white/40">{hint}</p> : null}
    </article>
  );
}

function QueueLink({
  href,
  label,
  count,
  urgent = false,
}: {
  href: string;
  label: string;
  count: number;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 hover:border-[#d4af37]/50 hover:bg-[#d4af37]/[0.05] focus-visible:ring-2 focus-visible:ring-[#d4af37]/40"
    >
      <span className="font-medium text-white/80">{label}</span>
      <span
        className={`rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${
          urgent && count > 0 ? 'bg-red-400/15 text-red-100' : 'bg-white/[0.07] text-white'
        }`}
      >
        {formatNumber(count)}
      </span>
    </Link>
  );
}

function BookingCard({
  booking,
  onReview,
  onAssign,
}: {
  booking: BookingSummaryDto;
  onReview?: (booking: BookingSummaryDto) => void;
  onAssign?: (booking: BookingSummaryDto) => void;
}) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p dir="ltr" translate="no" className="font-bold text-white">
            {booking.bookingNumber}
          </p>
          <p className="mt-1 truncate text-sm text-white/50">
            {booking.customerName} · {booking.serviceName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={booking.bookingStatus} label={bookingStatusLabel(booking.bookingStatus)} />
          <StatusBadge status={booking.paymentStatus} label={paymentStatusLabel(booking.paymentStatus)} />
        </div>
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-white/40">الموعد</dt><dd className="mt-1 text-white/80">{formatDateTime(booking.startAt)}</dd></div>
        <div><dt className="text-white/40">الفرع والمنطقة</dt><dd className="mt-1 text-white/80">{booking.branchName} · {booking.areaName}</dd></div>
        <div><dt className="text-white/40">السيارة</dt><dd className="mt-1 truncate text-white/80">{booking.vehicleLabel}</dd></div>
        <div><dt className="text-white/40">المستحق</dt><dd className="mt-1 font-semibold tabular-nums text-white">{formatCurrency(booking.amountDue)}</dd></div>
      </dl>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
        <a href={`tel:${booking.customerPhone}`} className="text-sm font-semibold text-[#d4af37] hover:underline">
          اتصال بالعميل
        </a>
        <span className="text-xs text-white/35">الفريق: {booking.assignedTeamName ?? 'لم يُسند'}</span>
        <span className="flex-1" />
        {onReview ? (
          <button type="button" onClick={() => onReview(booking)} className={secondaryButtonClass}>
            مراجعة الطلب
          </button>
        ) : null}
        {onAssign ? (
          <button type="button" onClick={() => onAssign(booking)} className={primaryButtonClass}>
            إسناد فريق
          </button>
        ) : null}
      </div>
    </article>
  );
}

function CapabilityNotice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-50">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-300" />
      <p>{children}</p>
    </div>
  );
}

function OverviewSection({
  metrics,
  branches,
  operationsReviewBookings,
  unassignedBookings,
  onReview,
  onAssign,
}: {
  metrics: DashboardMetricsDto;
  branches: BranchDto[];
  operationsReviewBookings: BookingSummaryDto[];
  unassignedBookings: BookingSummaryDto[];
  onReview: (booking: BookingSummaryDto) => void;
  onAssign: (booking: BookingSummaryDto) => void;
}) {
  return (
    <div>
      <SectionHeader
        eyebrow="نظرة تشغيلية مباشرة"
        title="مركز قيادة بريق"
        description="المؤشرات التالية محسوبة من الحجوزات والمدفوعات والاشتراكات المسجلة فعليًا، وليست أرقامًا تجريبية."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="إيراد اليوم المحصل" value={formatCurrency(metrics.revenueToday)} hint={`هذا الشهر: ${formatCurrency(metrics.revenueMonth)}`} icon={<Banknote aria-hidden="true" className="size-5" />} tone="green" />
        <MetricCard label="المبالغ المستحقة" value={formatCurrency(metrics.pendingAmounts)} hint="أرصدة حجوزات غير منتهية" icon={<WalletCards aria-hidden="true" className="size-5" />} tone="red" />
        <MetricCard label="حجوزات اليوم" value={formatNumber(metrics.todayBookings)} hint={`قيد التنفيذ: ${formatNumber(metrics.inProgress)}`} icon={<CalendarDays aria-hidden="true" className="size-5" />} />
        <MetricCard label="إشغال الفرق اليوم" value={`${formatNumber(metrics.teamUtilization)}٪`} hint="الحجوزات المسندة ÷ السعة اليومية" icon={<Gauge aria-hidden="true" className="size-5" />} tone="blue" />
        <MetricCard label="اكتملت اليوم" value={formatNumber(metrics.completedToday)} hint={`معدل إكمال الفترة: ${formatNumber(metrics.completionRate)}٪`} icon={<CheckCircle2 aria-hidden="true" className="size-5" />} tone="green" />
        <MetricCard label="الاشتراكات النشطة" value={formatNumber(metrics.activeSubscriptions)} hint={`زيارات متبقية: ${formatNumber(metrics.visitsRemaining)}`} icon={<PackageCheck aria-hidden="true" className="size-5" />} />
        <MetricCard label="عملاء جدد هذا الشهر" value={formatNumber(metrics.newCustomersMonth)} hint={`عملاء متكررون: ${formatNumber(metrics.repeatCustomers)}`} icon={<UserRound aria-hidden="true" className="size-5" />} tone="blue" />
        <MetricCard label="مشكلات الجودة المفتوحة" value={formatNumber(metrics.qualityOpen)} hint="حجوزات جودة وشكاوى مفتوحة" icon={<ShieldAlert aria-hidden="true" className="size-5" />} tone="red" />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="priority-queues-title" className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <h3 id="priority-queues-title" className="text-lg font-bold">قوائم الأولوية</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <QueueLink href="/admin?section=payments" label="إثباتات الدفع" count={metrics.pendingProofs} urgent />
            <QueueLink href="/admin?section=bookings" label="مراجعة التشغيل" count={metrics.operationsReview} urgent />
            <QueueLink href="/admin?section=bookings" label="حجوزات غير مسندة" count={metrics.unassignedBookings} urgent />
            <QueueLink href="/admin?section=cancellations" label="طلبات الإلغاء" count={metrics.pendingCancellations} urgent />
            <QueueLink href="/admin?section=cancellations" label="استردادات معلقة" count={metrics.pendingRefunds} />
            <QueueLink href="/admin?section=quality" label="مراجعات الجودة" count={metrics.qualityOpen} />
          </div>
        </section>

        <section aria-labelledby="branch-capacity-title" className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <h3 id="branch-capacity-title" className="text-lg font-bold">سعة الفروع اليوم</h3>
          {branches.length === 0 ? (
            <div className="mt-4"><EmptyState title="لا توجد فروع" description="أنشئ الفرع من مدير النظام بعد اعتماد طلب الإضافة." /></div>
          ) : (
            <div className="mt-4 space-y-4">
              {branches.map((branch) => {
                const capacity = branch.dailyBookingLimit > 0
                  ? Math.min(100, Math.round((branch.todayBookings / branch.dailyBookingLimit) * 100))
                  : 0;
                return (
                  <div key={branch.id}>
                    <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                      <span className="truncate font-medium">{branch.nameAr}</span>
                      <span className="tabular-nums text-white/55">{formatNumber(branch.todayBookings)} / {formatNumber(branch.dailyBookingLimit)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10" aria-label={`استخدام سعة ${branch.nameAr}: ${capacity}٪`}>
                      <div className="h-full rounded-full bg-[#d4af37]" style={{ width: `${capacity}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="oldest-bookings-title" className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 id="oldest-bookings-title" className="text-lg font-bold">أقدم حجوزات تحتاج تدخلًا</h3>
          <Link href="/admin?section=bookings" className="text-sm font-semibold text-[#d4af37] hover:underline">كل الحجوزات</Link>
        </div>
        {operationsReviewBookings.length === 0 && unassignedBookings.length === 0 ? (
          <EmptyState title="لا توجد حجوزات متوقفة" description="لا توجد حجوزات تنتظر مراجعة التشغيل أو إسناد فريق." />
        ) : (
          <div className="space-y-4">
            {operationsReviewBookings.slice(0, 2).map((booking) => (
              <BookingCard key={booking.id} booking={booking} onReview={onReview} />
            ))}
            {unassignedBookings.slice(0, 2).map((booking) => (
              <BookingCard key={booking.id} booking={booking} onAssign={onAssign} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BookingsSection({
  bookings,
  filters,
  onReview,
  onAssign,
}: {
  bookings: BookingSummaryDto[];
  filters: OwnerFiltersDto;
  onReview: (booking: BookingSummaryDto) => void;
  onAssign: (booking: BookingSummaryDto) => void;
}) {
  return (
    <div>
      <SectionHeader eyebrow="الحجوزات" title="متابعة دورة الحجز" description="آخر 100 حجز مطابق للفلاتر، مع الإجراءات المسموح بها فقط في الحالة الحالية." />
      <form action="/admin" method="get" className="mb-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-[1fr_220px_auto_auto]">
        <input type="hidden" name="section" value="bookings" />
        <div><label htmlFor="booking-query" className="mb-2 block text-sm font-medium text-white/70">بحث</label><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5 size-4 text-white/35" /><input id="booking-query" name="q" defaultValue={filters.bookingQuery} autoComplete="off" placeholder="رقم الحجز أو العميل…" className={`${inputClass} pr-10`} /></div></div>
        <div><label htmlFor="booking-status-filter" className="mb-2 block text-sm font-medium text-white/70">الحالة</label><select id="booking-status-filter" name="status" defaultValue={filters.bookingStatus} className={inputClass}><option value="" className="bg-[#111]">كل الحالات</option>{Object.entries(bookingStatusLabels).map(([value, label]) => <option key={value} value={value} className="bg-[#111]">{label}</option>)}</select></div>
        <button type="submit" className={`${primaryButtonClass} self-end`}>تطبيق الفلاتر</button>
        <Link href="/admin?section=bookings" className={`${secondaryButtonClass} self-end`}>مسح</Link>
      </form>
      {bookings.length === 0 ? (
        <EmptyState title="لا توجد حجوزات مطابقة" description="غيّر حالة الحجز أو عبارة البحث ثم أعد المحاولة." />
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const canReview = booking.bookingStatus === 'AWAITING_OPERATIONS_REVIEW';
            const canAssign =
              !booking.assignedTeamName &&
              ['ACCEPTED', 'AWAITING_ASSIGNMENT', 'ADMIN_REVIEW_REQUIRED'].includes(booking.bookingStatus);
            return <BookingCard key={booking.id} booking={booking} onReview={canReview ? onReview : undefined} onAssign={canAssign ? onAssign : undefined} />;
          })}
        </div>
      )}
    </div>
  );
}

function PaymentsSection({
  proofs,
  onReview,
}: {
  proofs: PaymentProofDto[];
  onReview: (proof: PaymentProofDto) => void;
}) {
  return (
    <div>
      <SectionHeader eyebrow="المدفوعات اليدوية" title="إثباتات قيد المراجعة" description="مرتبة من الأقدم للأحدث. الاعتماد يسجل Payment وسجل مراجعة وAudit داخل معاملة واحدة." />
      {proofs.length === 0 ? (
        <EmptyState title="لا توجد إثباتات معلقة" description="كل إثباتات الدفع المرفوعة تمت مراجعتها أو لا توجد إثباتات جديدة." />
      ) : (
        <div className="space-y-4">
          {proofs.map((proof) => (
            <article key={proof.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p dir="ltr" translate="no" className="font-bold">{proof.booking.bookingNumber}</p><StatusBadge status="UNDER_REVIEW" label="قيد المراجعة" /></div>
                  <p className="mt-2 text-sm text-white/55">{proof.booking.customerName} · {proof.paymentMethodName}</p>
                </div>
                <button type="button" onClick={() => onReview(proof)} className={primaryButtonClass}>اتخاذ قرار</button>
              </div>
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-white/40">المبلغ المرسل</dt><dd className="mt-1 font-bold tabular-nums text-white">{formatCurrency(proof.amountSubmitted)}</dd></div>
                <div><dt className="text-white/40">المطلوب</dt><dd className="mt-1 tabular-nums text-white/80">{formatCurrency(proof.expectedAmount)}</dd></div>
                <div><dt className="text-white/40">صاحب التحويل</dt><dd className="mt-1 break-words text-white/80">{proof.senderName} · <span dir="ltr">{proof.senderPhoneOrAccount}</span></dd></div>
                <div><dt className="text-white/40">وقت التحويل</dt><dd className="mt-1 text-white/80">{formatDateTime(proof.transferTimestamp)}</dd></div>
              </dl>
              <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-white/10 pt-4 text-sm">
                <span className="text-white/45">حساب التحويل: <span dir="ltr" className="text-white/75">{proof.paymentAccount}</span></span>
                {proof.referenceNumber ? <span className="text-white/45">المرجع: <span dir="ltr" className="text-white/75">{proof.referenceNumber}</span></span> : null}
                {isInternalFilePath(proof.proofFileUrl) ? <a href={proof.proofFileUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#d4af37] hover:underline">فتح ملف الإثبات</a> : <span className="text-amber-200">مسار الملف غير محلي؛ لم يُعرض لأسباب أمان.</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function CancellationsSection({
  requests,
  refunds,
  onReviewRequest,
  onApproveRefund,
}: {
  requests: CancellationRequestDto[];
  refunds: RefundDto[];
  onReviewRequest: (request: CancellationRequestDto) => void;
  onApproveRefund: (refund: RefundDto) => void;
}) {
  return (
    <div>
      <SectionHeader eyebrow="الإلغاء والاسترداد" title="الطلبات المالية الحساسة" description="بيانات فعلية للطلبات المفتوحة والاستردادات المعلقة على مستوى البراند." />
      <CapabilityNotice>طلبات الإلغاء المفتوحة قابلة للمراجعة عبر العقد المحمي الحالي. اعتماد الاسترداد يظهر فقط لسجل REFUND_PROCESSING تم تسجيل إثباته مسبقًا؛ لا تنشئ اللوحة عملية استرداد أو إثباتًا ماليًا من تلقاء نفسها.</CapabilityNotice>
      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="cancellation-requests-title" className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="mb-4 flex items-center justify-between gap-4"><h3 id="cancellation-requests-title" className="text-lg font-bold">طلبات الإلغاء</h3><span className="rounded-full bg-white/[0.07] px-3 py-1 text-sm tabular-nums">{formatNumber(requests.length)}</span></div>
          {requests.length === 0 ? <EmptyState title="لا توجد طلبات إلغاء" description="لا توجد طلبات بحالة PENDING حاليًا." /> : <div className="space-y-3">{requests.map((request) => <article key={request.id} className="rounded-xl border border-white/10 p-4"><div className="flex items-center justify-between gap-3"><p dir="ltr" translate="no" className="font-bold">{request.booking.bookingNumber}</p><StatusBadge status={request.status} /></div><p className="mt-3 break-words text-sm leading-6 text-white/75">{request.reason}</p><dl className="mt-3 grid gap-2 text-xs text-white/45"><div><dt className="inline">العميل: </dt><dd className="inline text-white/70">{request.booking.customerName}</dd></div><div><dt className="inline">التفضيل: </dt><dd className="inline text-white/70">{request.preferredAction}</dd></div><div><dt className="inline">المدفوع: </dt><dd className="inline tabular-nums text-white/70">{formatCurrency(request.booking.amountPaid)}</dd></div><div><dt className="inline">تاريخ الطلب: </dt><dd className="inline text-white/70">{formatDateTime(request.createdAt)}</dd></div></dl><button type="button" onClick={() => onReviewRequest(request)} className={`${primaryButtonClass} mt-4 w-full`}>مراجعة طلب الإلغاء</button></article>)}</div>}
        </section>
        <section aria-labelledby="refunds-title" className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="mb-4 flex items-center justify-between gap-4"><h3 id="refunds-title" className="text-lg font-bold">الاستردادات المعلقة</h3><span className="rounded-full bg-white/[0.07] px-3 py-1 text-sm tabular-nums">{formatNumber(refunds.length)}</span></div>
          {refunds.length === 0 ? <EmptyState title="لا توجد استردادات معلقة" description="لا توجد سجلات REFUND_PENDING أو REFUND_PROCESSING حاليًا." /> : <div className="space-y-3">{refunds.map((refund) => <article key={refund.id} className="rounded-xl border border-white/10 p-4"><div className="flex items-center justify-between gap-3"><p dir="ltr" translate="no" className="font-bold">{refund.booking.bookingNumber}</p><StatusBadge status={refund.status} /></div><p className="mt-3 text-xl font-black tabular-nums text-[#d4af37]">{formatCurrency(refund.amount)}</p><p className="mt-2 text-sm text-white/50">{refund.refundMethod}{refund.referenceNumber ? ` · ${refund.referenceNumber}` : ''}</p><p className="mt-2 text-xs text-white/40">سُجل {formatDateTime(refund.createdAt)}</p>{refund.status === 'REFUND_PROCESSING' ? <button type="button" onClick={() => onApproveRefund(refund)} className={`${primaryButtonClass} mt-4 w-full`}>اعتماد الاسترداد المسجل</button> : <p className="mt-4 rounded-lg bg-white/[0.04] p-3 text-xs leading-5 text-white/50">بانتظار تسجيل تنفيذ الاسترداد وإثباته قبل الاعتماد.</p>}</article>)}</div>}
        </section>
      </div>
    </div>
  );
}

function QualitySection({
  bookings,
  complaints,
}: {
  bookings: QualityBookingDto[];
  complaints: ComplaintDto[];
}) {
  return (
    <div>
      <SectionHeader eyebrow="الجودة والشكاوى" title="مراجعة جودة التنفيذ" description="الحجوزات المنتظرة والشكاوى المفتوحة كما هي مسجلة في قاعدة البيانات." />
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm leading-6 text-white/65">قرارات الجودة والشكاوى تعمل من مركز التشغيل، بينما نشر صور قبل/بعد وتجارب العملاء يتطلب موافقة العميل ثم اعتماد المالك.</p><div className="flex flex-wrap gap-2"><Link href="/operations" className={`${secondaryButtonClass} shrink-0`}><ClipboardCheck aria-hidden="true" className="size-4" /> مركز الجودة</Link><Link href="/admin/gallery" className={`${secondaryButtonClass} shrink-0`}><Sparkles aria-hidden="true" className="size-4" /> مراجعة المعرض</Link><Link href="/admin/reviews" className={`${secondaryButtonClass} shrink-0`}><ClipboardCheck aria-hidden="true" className="size-4" /> تقييمات العملاء</Link></div></div>
      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="quality-waiting-title" className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h3 id="quality-waiting-title" className="mb-4 text-lg font-bold">بانتظار مراجعة الجودة</h3>{bookings.length === 0 ? <EmptyState title="لا توجد مراجعات منتظرة" description="لا توجد حجوزات في حالة QUALITY_REVIEW حاليًا." /> : <div className="space-y-3">{bookings.map((item) => <article key={item.booking.id} className="rounded-xl border border-white/10 p-4"><div className="flex items-center justify-between gap-3"><p dir="ltr" translate="no" className="font-bold">{item.booking.bookingNumber}</p><StatusBadge status="QUALITY_REVIEW" label="مراجعة جودة" /></div><p className="mt-2 text-sm text-white/55">{item.booking.serviceName} · {item.booking.assignedTeamName ?? 'بلا فريق'}</p><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-white/[0.04] p-3"><p className="text-white/40">صور قبل</p><p className="mt-1 font-bold tabular-nums">{formatNumber(item.beforePhotos)} / {formatNumber(item.minimumBeforePhotos)}</p></div><div className="rounded-lg bg-white/[0.04] p-3"><p className="text-white/40">صور بعد</p><p className="mt-1 font-bold tabular-nums">{formatNumber(item.afterPhotos)} / {formatNumber(item.minimumAfterPhotos)}</p></div></div></article>)}</div>}</section>
        <section aria-labelledby="open-complaints-title" className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h3 id="open-complaints-title" className="mb-4 text-lg font-bold">الشكاوى المفتوحة</h3>{complaints.length === 0 ? <EmptyState title="لا توجد شكاوى مفتوحة" description="لا توجد شكاوى OPEN أو UNDER_REVIEW أو ACTION_REQUIRED." /> : <div className="space-y-3">{complaints.map((complaint) => <article key={complaint.id} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={complaint.status} /><StatusBadge status={complaint.priority} label={`أولوية ${complaint.priority}`} /></div><p className="mt-3 font-semibold">{complaint.type}</p><p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-white/60">{complaint.description}</p><p className="mt-3 text-xs text-white/40">{complaint.customerName} · <span dir="ltr" translate="no">{complaint.bookingNumber}</span> · {formatDateTime(complaint.createdAt)}</p></article>)}</div>}</section>
      </div>
    </div>
  );
}

function TeamsSection({ teams }: { teams: TeamDto[] }) {
  return (
    <div>
      <SectionHeader eyebrow="التشغيل" title="الفرق والسعة اليومية" description="الأعضاء والزونات والقدرات والحمل الفعلي لكل فريق اليوم." />
      {teams.length === 0 ? <EmptyState title="لا توجد فرق تشغيل" description="لا توجد فرق مسجلة. يلزم إنشاء فريق وربطه بفرع وزونات وموظفين نشطين." /> : <div className="grid gap-4 xl:grid-cols-2">{teams.map((team) => {
        const utilization = team.dailyCapacity > 0 ? Math.min(100, Math.round((team.todayBookingCount / team.dailyCapacity) * 100)) : 0;
        return <article key={team.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><h3 className="truncate text-lg font-bold">{team.name}</h3><p className="mt-1 text-sm text-white/45">{team.branchName}</p></div><StatusBadge status={team.active ? 'ACTIVE' : 'DISABLED'} label={team.active ? 'نشط' : 'متوقف'} /></div><div className="mt-5"><div className="mb-2 flex items-center justify-between text-sm"><span className="text-white/55">حمل اليوم</span><span className="tabular-nums">{formatNumber(team.todayBookingCount)} / {formatNumber(team.dailyCapacity)}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10" aria-label={`إشغال الفريق ${utilization}٪`}><div className="h-full rounded-full bg-[#d4af37]" style={{ width: `${utilization}%` }} /></div></div><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-white/40">الأعضاء</dt><dd className="mt-2 space-y-1 text-white/75">{team.members.length ? team.members.map((member) => <span key={member.id} className="block truncate">{member.fullName}{member.isLeader ? ' · قائد' : ''}</span>) : 'لا يوجد أعضاء'}</dd></div><div><dt className="text-white/40">الزونات</dt><dd className="mt-2 flex flex-wrap gap-2">{team.zones.length ? team.zones.map((zone) => <span key={zone.id} className="rounded-full bg-white/[0.06] px-2 py-1 text-xs text-white/65">{zone.name}</span>) : <span className="text-white/55">غير محددة</span>}</dd></div><div className="sm:col-span-2"><dt className="text-white/40">الخدمات المؤهل لها</dt><dd className="mt-2 flex flex-wrap gap-2">{team.capabilities.length ? team.capabilities.map((service) => <span key={service.id} className="rounded-full border border-[#d4af37]/20 bg-[#d4af37]/[0.06] px-2 py-1 text-xs text-[#ead478]">{service.name}</span>) : <span className="text-white/55">لا توجد قدرات مسجلة</span>}</dd></div></dl></article>;
      })}</div>}
    </div>
  );
}

function BranchesSection({
  branches,
  requests,
  maxBranches,
  onRequest,
}: {
  branches: BranchDto[];
  requests: BranchRequestDto[];
  maxBranches: number;
  onRequest: () => void;
}) {
  return (
    <div>
      <SectionHeader eyebrow="الفروع والتغطية" title="هيكل التشغيل" description={`الحد الحالي للبراند: ${formatNumber(maxBranches)} فرع. يمكنك إضافة فرع مباشرة ضمن الحد، ثم استكمال الفرق والتغطية من مركز الإعداد.`} action={<div className="flex flex-wrap gap-2"><Link href="/admin/branches" className={primaryButtonClass}>إضافة فرع مباشرة</Link><button type="button" onClick={onRequest} className={secondaryButtonClass}>طلب مراجعة</button></div>} />
      {branches.length === 0 ? <EmptyState title="لا توجد فروع" description="أضف فرعًا مباشرة ضمن الحد المسموح، ثم جهّز مناطق التغطية وفريق التشغيل." /> : <div className="grid gap-4 xl:grid-cols-2">{branches.map((branch) => <article key={branch.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold">{branch.nameAr}</h3><p dir="ltr" translate="no" className="mt-1 text-sm text-white/40">{branch.code}</p></div><StatusBadge status={branch.status} /></div><p className="mt-4 break-words text-sm leading-6 text-white/60">{branch.address}</p><dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-white/40">فرق التشغيل</dt><dd className="mt-1 font-bold tabular-nums">{formatNumber(branch.teamCount)}</dd></div><div><dt className="text-white/40">زونات التغطية</dt><dd className="mt-1 font-bold tabular-nums">{formatNumber(branch.zoneCount)}</dd></div><div><dt className="text-white/40">حجوزات اليوم</dt><dd className="mt-1 font-bold tabular-nums">{formatNumber(branch.todayBookings)} / {formatNumber(branch.dailyBookingLimit)}</dd></div><div><dt className="text-white/40">وسائل دفع نشطة</dt><dd className="mt-1 font-bold tabular-nums">{formatNumber(branch.activePaymentMethodCount)}</dd></div><div><dt className="text-white/40">التوزيع</dt><dd className="mt-1 text-white/75">{branch.assignmentMode === 'AUTOMATIC' ? 'تلقائي' : 'يدوي'}</dd></div><div><dt className="text-white/40">التوقيت</dt><dd dir="ltr" className="mt-1 text-white/75">{branch.timezone}</dd></div></dl><a href={`tel:${branch.phone}`} className="mt-5 inline-block text-sm font-semibold text-[#d4af37] hover:underline">{branch.phone}</a></article>)}</div>}

      <section aria-labelledby="branch-requests-title" className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h3 id="branch-requests-title" className="text-lg font-bold">طلبات الفروع</h3>{requests.length === 0 ? <div className="mt-4"><EmptyState title="لا توجد طلبات" description="لم يتم إرسال طلبات إضافة فروع من هذا الحساب." /></div> : <div className="mt-4 space-y-3">{requests.map((request) => <article key={request.id} className="rounded-xl border border-white/10 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{request.branchName}</p><StatusBadge status={request.status} /></div><p className="mt-2 break-words text-sm text-white/55">{request.reason}</p><p className="mt-2 text-xs text-white/35">{formatDateTime(request.createdAt)}</p>{request.rejectionReason ? <p className={`mt-2 text-sm ${request.status === 'NEEDS_INFORMATION' ? 'text-amber-200' : 'text-red-200'}`}>{request.status === 'NEEDS_INFORMATION' ? 'المعلومات المطلوبة: ' : 'سبب الرفض: '}{request.rejectionReason}</p> : null}</article>)}</div>}</section>
    </div>
  );
}

function ServicesSection({ services }: { services: ServiceDto[] }) {
  return (
    <div>
      <SectionHeader eyebrow="كتالوج الخدمات" title="الخدمات المنشورة" description="الأسعار والمدد وحالة الحجز الإلكتروني والـVariants والإضافات المسجلة فعليًا." />
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-[#d4af37]/25 bg-[#d4af37]/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm leading-6 text-white/65">إدارة المحتوى والصور والتسعير والـVariants والإضافات وإعدادات الفروع متاحة كوحدة ذرية موثقة.</p><Link href="/admin/catalog" className={`${primaryButtonClass} shrink-0`}><PackageCheck aria-hidden="true" className="size-4" /> فتح مدير الكتالوج</Link></div>
      {services.length === 0 ? <EmptyState title="لا توجد خدمات" description="لا توجد خدمات مسجلة في الكتالوج حتى الآن." /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{services.map((service) => <article key={service.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-start justify-between gap-3"><h3 className="min-w-0 truncate text-lg font-bold">{service.nameAr}</h3><StatusBadge status={service.active ? 'ACTIVE' : 'DISABLED'} label={service.active ? 'نشطة' : 'متوقفة'} /></div><p dir="ltr" translate="no" className="mt-1 truncate text-xs text-white/35">/{service.slug}</p><p className="mt-5 text-2xl font-black tabular-nums text-[#d4af37]">{formatCurrency(service.basePrice)}</p><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-white/40">المدة</dt><dd className="mt-1 text-white/75">{formatNumber(service.durationMinutes)} دقيقة</dd></div><div><dt className="text-white/40">الحجوزات</dt><dd className="mt-1 tabular-nums text-white/75">{formatNumber(service.bookingCount)}</dd></div><div><dt className="text-white/40">Variants</dt><dd className="mt-1 tabular-nums text-white/75">{formatNumber(service.variantCount)}</dd></div><div><dt className="text-white/40">الإضافات</dt><dd className="mt-1 tabular-nums text-white/75">{formatNumber(service.addonCount)}</dd></div></dl><div className="mt-5 flex flex-wrap gap-2"><StatusBadge status={service.bookableOnline ? 'ACTIVE' : 'DISABLED'} label={service.bookableOnline ? 'حجز إلكتروني' : 'غير متاحة للحجز'} /><StatusBadge status={service.subscriptionEligible ? 'ACTIVE' : 'DISABLED'} label={service.subscriptionEligible ? 'ضمن الاشتراكات' : 'خارج الاشتراكات'} /></div><Link href={`/services/${service.slug}`} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#d4af37] hover:underline">عرض صفحة الخدمة <ArrowLeft aria-hidden="true" className="size-4" /></Link></article>)}</div>}
    </div>
  );
}

function SubscriptionsSection({ plans, subscriptions }: { plans: PlanDto[]; subscriptions: SubscriptionDto[] }) {
  return (
    <div>
      <SectionHeader eyebrow="الاشتراكات" title="الباقات والاشتراكات الفعلية" description="حالة الباقات وعدد المشتركين وآخر اشتراكات العملاء والزيارات المتبقية." />
      <div className="mb-5 flex justify-end">
        <Link href="/admin/subscriptions" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/10 px-4 text-sm font-bold text-[#e4c762] transition-colors hover:bg-[#d4af37]/15 focus-visible:ring-2 focus-visible:ring-[#d4af37]">
          تفعيل وإدارة اشتراكات العملاء
          <ArrowLeft aria-hidden="true" className="size-4" />
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{plans.length ? plans.map((plan) => <article key={plan.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><div className="flex items-start justify-between gap-3"><h3 className="text-lg font-bold">{plan.nameAr}</h3><StatusBadge status={plan.active ? 'ACTIVE' : 'DISABLED'} label={plan.active ? 'نشطة' : 'متوقفة'} /></div><p className="mt-3 line-clamp-3 break-words text-sm leading-6 text-white/55">{plan.descriptionAr}</p><p className="mt-4 text-2xl font-black tabular-nums text-[#d4af37]">{formatCurrency(plan.price)}</p><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-white/40">الزيارات</dt><dd className="mt-1 font-semibold">{formatNumber(plan.visitCount)}</dd></div><div><dt className="text-white/40">الصلاحية</dt><dd className="mt-1 font-semibold">{formatNumber(plan.validityDays)} يوم</dd></div><div><dt className="text-white/40">كل الاشتراكات</dt><dd className="mt-1 font-semibold">{formatNumber(plan.subscriptionCount)}</dd></div><div><dt className="text-white/40">النشطة</dt><dd className="mt-1 font-semibold text-emerald-300">{formatNumber(plan.activeSubscriptionCount)}</dd></div></dl></article>) : <div className="md:col-span-2 xl:col-span-3"><EmptyState title="لا توجد باقات" description="لا توجد خطط اشتراك مسجلة." /></div>}</div>

      <section aria-labelledby="recent-subscriptions-title" className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h3 id="recent-subscriptions-title" className="text-lg font-bold">آخر اشتراكات العملاء</h3>{subscriptions.length === 0 ? <div className="mt-4"><EmptyState title="لا توجد اشتراكات" description="لم يتم تسجيل اشتراكات عملاء حتى الآن." /></div> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-right text-sm"><caption className="sr-only">آخر اشتراكات العملاء</caption><thead className="text-white/40"><tr><th scope="col" className="px-3 py-3 font-medium">العميل</th><th scope="col" className="px-3 py-3 font-medium">الباقة</th><th scope="col" className="px-3 py-3 font-medium">الفرع</th><th scope="col" className="px-3 py-3 font-medium">الحالة</th><th scope="col" className="px-3 py-3 font-medium">الزيارات</th><th scope="col" className="px-3 py-3 font-medium">الانتهاء</th></tr></thead><tbody className="divide-y divide-white/10">{subscriptions.map((subscription) => <tr key={subscription.id}><td className="px-3 py-4"><p className="font-semibold">{subscription.customerName}</p><p dir="ltr" className="mt-1 text-xs text-white/40">{subscription.customerPhone}</p></td><td className="px-3 py-4 text-white/75">{subscription.planName}</td><td className="px-3 py-4 text-white/75">{subscription.branchName}</td><td className="px-3 py-4"><StatusBadge status={subscription.status} /></td><td className="px-3 py-4 tabular-nums">{formatNumber(subscription.remainingVisits)} / {formatNumber(subscription.totalVisits)}</td><td className="px-3 py-4 text-white/60">{formatDate(subscription.endDate)}</td></tr>)}</tbody></table></div>}</section>
    </div>
  );
}

function ReportTable({ title, rows }: { title: string; rows: ReportRowDto[] }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <h3 className="text-lg font-bold">{title}</h3>
      {rows.length === 0 ? <div className="mt-4"><EmptyState title="لا توجد بيانات" description="لا توجد سجلات في الفترة المحددة لهذا التصنيف." /></div> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-right text-sm"><caption className="sr-only">{title}</caption><thead className="text-white/40"><tr><th scope="col" className="px-3 py-3 font-medium">التصنيف</th><th scope="col" className="px-3 py-3 font-medium">الحجوزات</th><th scope="col" className="px-3 py-3 font-medium">القيمة</th><th scope="col" className="px-3 py-3 font-medium">المحصل على الحجوزات</th></tr></thead><tbody className="divide-y divide-white/10">{rows.map((row) => <tr key={row.id}><th scope="row" className="px-3 py-4 font-semibold">{row.label}</th><td className="px-3 py-4 tabular-nums">{formatNumber(row.count)}</td><td className="px-3 py-4 tabular-nums">{formatCurrency(row.totalPrice)}</td><td className="px-3 py-4 tabular-nums">{formatCurrency(row.amountPaid)}</td></tr>)}</tbody></table></div>}
    </section>
  );
}

function ReportsSection({ reports }: { reports: ReportsDto }) {
  return (
    <div>
      <SectionHeader eyebrow="تقارير داخلية" title="التقرير التشغيلي والمالي" description="ملخص مبني على الفترة المحددة. صافي التحصيل هنا مدفوعات مسجلة ناقص استردادات مسجلة، وليس صافي ربح محاسبي." />
      <form action="/admin" method="get" className="mb-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-[1fr_1fr_auto]">
        <input type="hidden" name="section" value="reports" />
        <div><label htmlFor="report-from" className="mb-2 block text-sm font-medium text-white/70">من تاريخ</label><input id="report-from" name="from" type="date" defaultValue={reports.from} className={inputClass} /></div>
        <div><label htmlFor="report-to" className="mb-2 block text-sm font-medium text-white/70">إلى تاريخ</label><input id="report-to" name="to" type="date" defaultValue={reports.to} className={inputClass} /></div>
        <button type="submit" className={`${primaryButtonClass} self-end`}>تحديث التقرير</button>
      </form>
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm leading-6 text-white/65">مركز التقارير الكامل يطبق فلاتر تاريخية وتشغيلية ويصدر CSV مؤمّنًا بكل الأقسام والصفوف المطابقة.</p><Link href="/admin/reports" className={`${secondaryButtonClass} shrink-0`}><BarChart3 aria-hidden="true" className="size-4" /> فتح التقارير والتصدير</Link></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="إجمالي الحجوزات" value={formatNumber(reports.totalBookings)} icon={<CalendarDays aria-hidden="true" className="size-5" />} />
        <MetricCard label="المحصل" value={formatCurrency(reports.collectedAmount)} icon={<Banknote aria-hidden="true" className="size-5" />} tone="green" />
        <MetricCard label="الاستردادات" value={formatCurrency(reports.refundedAmount)} icon={<ShieldAlert aria-hidden="true" className="size-5" />} tone="red" />
        <MetricCard label="صافي التحصيل" value={formatCurrency(reports.netCollected)} hint="ليس صافي ربح" icon={<Activity aria-hidden="true" className="size-5" />} tone="blue" />
        <MetricCard label="متوسط قيمة الحجز" value={formatCurrency(reports.averageBookingValue)} icon={<Gauge aria-hidden="true" className="size-5" />} />
        <MetricCard label="المبالغ المستحقة" value={formatCurrency(reports.amountDue)} icon={<WalletCards aria-hidden="true" className="size-5" />} tone="red" />
        <MetricCard label="اشتراكات جديدة" value={formatNumber(reports.newSubscriptions)} hint={`زيارات مستهلكة: ${formatNumber(reports.visitsConsumed)}`} icon={<PackageCheck aria-hidden="true" className="size-5" />} />
        <MetricCard label="الشكاوى" value={formatNumber(reports.complaintCount)} icon={<AlertTriangle aria-hidden="true" className="size-5" />} tone="red" />
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-2"><ReportTable title="حسب الخدمة" rows={reports.byService} /><ReportTable title="حسب الفرع" rows={reports.byBranch} /><ReportTable title="حسب الفريق" rows={reports.byTeam} /><section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h3 className="text-lg font-bold">أسباب الإلغاء</h3>{reports.cancellationReasons.length === 0 ? <div className="mt-4"><EmptyState title="لا توجد إلغاءات" description="لا توجد طلبات إلغاء في الفترة المحددة." /></div> : <ol className="mt-4 space-y-3">{reports.cancellationReasons.map((item) => <li key={item.reason} className="flex items-start justify-between gap-4 rounded-xl border border-white/10 p-3"><span className="break-words text-sm text-white/70">{item.reason}</span><span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-xs font-bold tabular-nums">{formatNumber(item.count)}</span></li>)}</ol>}</section></div>
      <section aria-labelledby="status-breakdown-title" className="mt-6 rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h3 id="status-breakdown-title" className="text-lg font-bold">توزيع حالات الحجز</h3>{reports.byStatus.length === 0 ? <div className="mt-4"><EmptyState title="لا توجد حالات" description="لا توجد حجوزات في الفترة المحددة." /></div> : <div className="mt-4 flex flex-wrap gap-3">{reports.byStatus.map((item) => <div key={item.status} className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2"><StatusBadge status={item.status} label={bookingStatusLabel(item.status)} /><span className="font-bold tabular-nums">{formatNumber(item.count)}</span></div>)}</div>}</section>
    </div>
  );
}

function AuditSection({ auditLogs }: { auditLogs: AuditLogDto[] }) {
  return (
    <div>
      <SectionHeader eyebrow="الحوكمة" title="سجل التعديلات" description="آخر 50 حدثًا مسجلًا مع المنفذ والكيان والسبب إن وجد." />
      {auditLogs.length === 0 ? <EmptyState title="لا توجد أحداث" description="لم تُسجل عمليات Audit حتى الآن." /> : <div className="space-y-3">{auditLogs.map((log) => <article key={log.id} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p dir="ltr" translate="no" className="break-words font-semibold text-white">{log.action}</p><p className="mt-1 text-sm text-white/45">{log.actorName} · {log.actorRole}</p></div><time dateTime={log.createdAt} className="shrink-0 text-xs text-white/35">{formatDateTime(log.createdAt)}</time></div><div className="mt-3 flex flex-wrap gap-2 text-xs"><span dir="ltr" translate="no" className="rounded-full bg-white/[0.06] px-2 py-1 text-white/60">{log.entityType}</span><span dir="ltr" translate="no" className="max-w-full truncate rounded-full bg-white/[0.06] px-2 py-1 text-white/60">{log.entityId}</span></div>{log.reason ? <p className="mt-3 break-words text-sm leading-6 text-white/60">{log.reason}</p> : null}</article>)}</div>}
    </div>
  );
}

function OwnerActionDialog({
  modal,
  teams,
  pending,
  error,
  paymentDecision,
  bookingDecision,
  cancellationDecision,
  cancellationResolution,
  dialogRef,
  onPaymentDecision,
  onBookingDecision,
  onCancellationDecision,
  onCancellationResolution,
  onClose,
  onSubmit,
}: {
  modal: Exclude<ModalState, null>;
  teams: TeamDto[];
  pending: boolean;
  error: string;
  paymentDecision: PaymentDecision | '';
  bookingDecision: BookingDecision | '';
  cancellationDecision: CancellationDecision | '';
  cancellationResolution: CancellationResolution | '';
  dialogRef: React.RefObject<HTMLDivElement | null>;
  onPaymentDecision: (decision: PaymentDecision | '') => void;
  onBookingDecision: (decision: BookingDecision | '') => void;
  onCancellationDecision: (decision: CancellationDecision | '') => void;
  onCancellationResolution: (resolution: CancellationResolution | '') => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const title = modal.type === 'payment'
    ? 'تأكيد قرار إثبات الدفع'
    : modal.type === 'booking-review'
      ? 'تأكيد مراجعة الحجز'
      : modal.type === 'assignment'
        ? 'تأكيد إسناد الفريق'
        : modal.type === 'cancellation'
          ? 'تأكيد قرار طلب الإلغاء'
          : modal.type === 'refund-approval'
            ? 'اعتماد الاسترداد المسجل'
            : 'طلب إضافة فرع';
  const eligibleTeams = modal.type === 'assignment'
    ? teams.filter((team) => team.active && team.branchId === modal.booking.branchId)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/80 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="owner-action-title" tabIndex={-1} className="w-full max-w-xl rounded-3xl border border-white/15 bg-[#0d0d0d] p-5 shadow-2xl focus-visible:ring-2 focus-visible:ring-[#d4af37] sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#d4af37]">إجراء مسجل</p><h2 id="owner-action-title" className="mt-1 text-xl font-black">{title}</h2></div><button type="button" onClick={onClose} disabled={pending} aria-label="إغلاق النافذة" className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-50"><X aria-hidden="true" className="size-5" /></button></div>
        <p className="mt-3 text-sm leading-6 text-white/50">راجع البيانات قبل التنفيذ. لا يمكن إغلاق النافذة بالنقر خارجها.</p>
        {error ? <div role="alert" tabIndex={-1} className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}
        <form onSubmit={onSubmit} className="mt-6 space-y-5">
          {modal.type === 'payment' ? <><input type="hidden" name="proofId" value={modal.proof.id} /><div className="rounded-xl bg-white/[0.04] p-4 text-sm"><p dir="ltr" translate="no" className="font-bold">{modal.proof.booking.bookingNumber}</p><p className="mt-2 text-white/55">المرسل: {formatCurrency(modal.proof.amountSubmitted)} · المطلوب: {formatCurrency(modal.proof.expectedAmount)}</p></div><div><label htmlFor="payment-decision" className="mb-2 block text-sm font-medium text-white/75">القرار *</label><select id="payment-decision" name="decision" required value={paymentDecision} onChange={(event) => onPaymentDecision(event.target.value as PaymentDecision | '')} className={inputClass}><option value="" className="bg-[#111]">اختر القرار</option><option value="VERIFY" className="bg-[#111]">اعتماد الإثبات</option><option value="REJECT" className="bg-[#111]">رفض الإثبات</option><option value="SHORT" className="bg-[#111]">المبلغ ناقص</option><option value="REUPLOAD" className="bg-[#111]">طلب إعادة الرفع</option><option value="DUPLICATE" className="bg-[#111]">اشتباه إثبات مكرر</option></select></div><div><label htmlFor="payment-review-notes" className="mb-2 block text-sm font-medium text-white/75">ملاحظات القرار {paymentDecision === 'VERIFY' ? '(اختياري)' : '*'}</label><textarea id="payment-review-notes" name="reviewNotes" required={paymentDecision !== '' && paymentDecision !== 'VERIFY'} minLength={3} maxLength={1000} rows={4} autoComplete="off" className={inputClass} /></div></> : null}
          {modal.type === 'booking-review' ? <><input type="hidden" name="bookingId" value={modal.booking.id} /><div className="rounded-xl bg-white/[0.04] p-4 text-sm"><p dir="ltr" translate="no" className="font-bold">{modal.booking.bookingNumber}</p><p className="mt-2 text-white/55">{modal.booking.customerName} · {modal.booking.serviceName}</p></div><div><label htmlFor="booking-decision" className="mb-2 block text-sm font-medium text-white/75">القرار *</label><select id="booking-decision" name="decision" required value={bookingDecision} onChange={(event) => onBookingDecision(event.target.value as BookingDecision | '')} className={inputClass}><option value="" className="bg-[#111]">اختر القرار</option><option value="ACCEPT" className="bg-[#111]">قبول تشغيلي</option><option value="REJECT" className="bg-[#111]">رفض الحجز</option></select></div><div><label htmlFor="booking-review-reason" className="mb-2 block text-sm font-medium text-white/75">سبب القرار *</label><textarea id="booking-review-reason" name="reason" required minLength={3} maxLength={1000} rows={4} autoComplete="off" className={inputClass} /></div></> : null}
          {modal.type === 'assignment' ? <><input type="hidden" name="bookingId" value={modal.booking.id} /><div className="rounded-xl bg-white/[0.04] p-4 text-sm"><p dir="ltr" translate="no" className="font-bold">{modal.booking.bookingNumber}</p><p className="mt-2 text-white/55">{modal.booking.branchName} · {formatDateTime(modal.booking.startAt)}</p></div>{eligibleTeams.length ? <><div><label htmlFor="assignment-team" className="mb-2 block text-sm font-medium text-white/75">الفريق *</label><select id="assignment-team" name="teamId" required defaultValue="" className={inputClass}><option value="" className="bg-[#111]">اختر فريقًا من نفس الفرع</option>{eligibleTeams.map((team) => <option key={team.id} value={team.id} className="bg-[#111]">{team.name} — {team.todayBookingCount}/{team.dailyCapacity}</option>)}</select></div><div><label htmlFor="assignment-reason" className="mb-2 block text-sm font-medium text-white/75">سبب الإسناد *</label><textarea id="assignment-reason" name="reason" required minLength={3} maxLength={500} rows={3} autoComplete="off" className={inputClass} /></div></> : <CapabilityNotice>لا يوجد فريق نشط في نفس الفرع يمكن اختياره.</CapabilityNotice>}</> : null}
          {modal.type === 'cancellation' ? <><input type="hidden" name="cancellationId" value={modal.request.id} /><div className="rounded-xl bg-white/[0.04] p-4 text-sm"><p dir="ltr" translate="no" className="font-bold">{modal.request.booking.bookingNumber}</p><p className="mt-2 text-white/55">المدفوع: {formatCurrency(modal.request.booking.amountPaid)} · تفضيل العميل: {modal.request.preferredAction}</p><p className="mt-2 break-words text-white/70">{modal.request.reason}</p></div><div><label htmlFor="cancellation-decision" className="mb-2 block text-sm font-medium text-white/75">القرار *</label><select id="cancellation-decision" name="decision" required value={cancellationDecision} onChange={(event) => { onCancellationDecision(event.target.value as CancellationDecision | ''); onCancellationResolution(''); }} className={inputClass}><option value="" className="bg-[#111]">اختر القرار</option><option value="APPROVE" className="bg-[#111]">اعتماد الطلب</option><option value="REJECT" className="bg-[#111]">رفض الطلب واستعادة حالة الحجز</option></select></div>{cancellationDecision === 'APPROVE' ? <><div><label htmlFor="cancellation-resolution" className="mb-2 block text-sm font-medium text-white/75">نوع الحل *</label><select id="cancellation-resolution" name="resolutionType" required value={cancellationResolution} onChange={(event) => onCancellationResolution(event.target.value as CancellationResolution | '')} className={inputClass}><option value="" className="bg-[#111]">اختر نوع الحل</option><option value="REFUND_FULL" className="bg-[#111]">استرداد كامل</option><option value="REFUND_PARTIAL" className="bg-[#111]">استرداد جزئي</option><option value="NO_REFUND" className="bg-[#111]">إلغاء دون استرداد</option><option value="KEEP_DEPOSIT" className="bg-[#111]">الاحتفاظ بالعربون</option><option value="ESCALATE" className="bg-[#111]">تصعيد للمراجعة</option></select></div><div><label htmlFor="cancellation-party" className="mb-2 block text-sm font-medium text-white/75">الطرف المسؤول *</label><select id="cancellation-party" name="responsibleParty" required defaultValue="" className={inputClass}><option value="" className="bg-[#111]">اختر الطرف</option><option value="CUSTOMER" className="bg-[#111]">العميل</option><option value="TEAM" className="bg-[#111]">الفريق</option><option value="BRANCH" className="bg-[#111]">الفرع</option><option value="ACCESS" className="bg-[#111]">تعذر الوصول</option><option value="FORCE_MAJEURE" className="bg-[#111]">ظرف قهري</option></select></div>{cancellationResolution === 'REFUND_PARTIAL' ? <div><label htmlFor="approved-refund-amount" className="mb-2 block text-sm font-medium text-white/75">مبلغ الاسترداد الجزئي *</label><input id="approved-refund-amount" name="approvedRefundAmount" type="number" min={1} max={modal.request.booking.amountPaid} step={1} inputMode="numeric" required className={inputClass} /></div> : null}</> : null}<div><label htmlFor="cancellation-notes" className="mb-2 block text-sm font-medium text-white/75">ملاحظات القرار *</label><textarea id="cancellation-notes" name="resolutionNotes" required minLength={3} maxLength={1000} rows={4} autoComplete="off" className={inputClass} /></div></> : null}
          {modal.type === 'refund-approval' ? <><input type="hidden" name="refundId" value={modal.refund.id} /><div className="rounded-xl bg-white/[0.04] p-4 text-sm"><p dir="ltr" translate="no" className="font-bold">{modal.refund.booking.bookingNumber}</p><p className="mt-2 text-xl font-black tabular-nums text-[#d4af37]">{formatCurrency(modal.refund.amount)}</p><p className="mt-2 text-white/55">{modal.refund.refundMethod}{modal.refund.referenceNumber ? ` · ${modal.refund.referenceNumber}` : ''}</p></div><div><label htmlFor="refund-approval-reason" className="mb-2 block text-sm font-medium text-white/75">سبب الاعتماد *</label><textarea id="refund-approval-reason" name="reason" required minLength={3} maxLength={1000} rows={4} autoComplete="off" className={inputClass} /></div></> : null}
          {modal.type === 'branch-request' ? <><div><label htmlFor="branch-request-name" className="mb-2 block text-sm font-medium text-white/75">اسم الفرع المقترح *</label><input id="branch-request-name" name="branchName" required minLength={2} maxLength={120} autoComplete="organization" className={inputClass} /></div><div><label htmlFor="branch-request-reason" className="mb-2 block text-sm font-medium text-white/75">سبب الإضافة *</label><textarea id="branch-request-reason" name="reason" required minLength={3} maxLength={1000} rows={4} autoComplete="off" className={inputClass} /></div></> : null}
          <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} disabled={pending} className={secondaryButtonClass}>إلغاء</button><button type="submit" disabled={pending || (modal.type === 'assignment' && eligibleTeams.length === 0)} aria-busy={pending} className={primaryButtonClass}>{pending ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> جاري التنفيذ…</> : 'تأكيد الإجراء'}</button></div>
        </form>
      </div>
    </div>
  );
}

export default function OwnerCommandCenter(props: OwnerCommandCenterProps) {
  const {
    owner,
    brand,
    currentSection,
    metrics,
    filters,
    customerQuery,
    pendingProofs,
    operationsReviewBookings,
    unassignedBookings,
    cancellationRequests,
    pendingRefunds,
    qualityBookings,
    complaints,
    bookings,
    teams,
    branches,
    services,
    plans,
    subscriptions,
    customers,
    auditLogs,
    branchRequests,
    reports,
  } = props;
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [paymentDecision, setPaymentDecision] = useState<PaymentDecision | ''>('');
  const [bookingDecision, setBookingDecision] = useState<BookingDecision | ''>('');
  const [cancellationDecision, setCancellationDecision] = useState<CancellationDecision | ''>('');
  const [cancellationResolution, setCancellationResolution] = useState<CancellationResolution | ''>('');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (modal) dialogRef.current?.focus();
  }, [modal]);

  function openModal(nextModal: Exclude<ModalState, null>) {
    setActionError('');
    setPaymentDecision('');
    setBookingDecision('');
    setCancellationDecision('');
    setCancellationResolution('');
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
      const result = modal.type === 'payment'
        ? await reviewPaymentProofAction(formData)
        : modal.type === 'booking-review'
          ? await reviewBookingAction(formData)
          : modal.type === 'assignment'
            ? await assignTeamManuallyAction(formData)
            : modal.type === 'cancellation'
              ? await reviewCancellationAction(formData)
              : modal.type === 'refund-approval'
                ? await approveRefundAction(formData)
                : await requestNewBranchAction(formData);
      if ('error' in result && result.error) {
        setActionError(result.error);
        return;
      }
      setFeedback(
        modal.type === 'payment'
          ? 'تم حفظ قرار إثبات الدفع.'
          : modal.type === 'booking-review'
            ? 'تم حفظ قرار مراجعة الحجز.'
            : modal.type === 'assignment'
              ? 'تم إسناد الفريق بعد إعادة فحص التعارض.'
              : modal.type === 'cancellation'
                ? 'تم حفظ قرار طلب الإلغاء.'
                : modal.type === 'refund-approval'
                  ? 'تم اعتماد الاسترداد المسجل.'
                  : 'تم إرسال طلب الفرع إلى مدير النظام.',
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
      sectionContent = <BookingsSection bookings={bookings} filters={filters} onReview={(booking) => openModal({ type: 'booking-review', booking })} onAssign={(booking) => openModal({ type: 'assignment', booking })} />;
      break;
    case 'payments':
      sectionContent = <PaymentsSection proofs={pendingProofs} onReview={(proof) => openModal({ type: 'payment', proof })} />;
      break;
    case 'cancellations':
      sectionContent = <CancellationsSection requests={cancellationRequests} refunds={pendingRefunds} onReviewRequest={(request) => openModal({ type: 'cancellation', request })} onApproveRefund={(refund) => openModal({ type: 'refund-approval', refund })} />;
      break;
    case 'quality':
      sectionContent = <QualitySection bookings={qualityBookings} complaints={complaints} />;
      break;
    case 'teams':
      sectionContent = <TeamsSection teams={teams} />;
      break;
    case 'branches':
      sectionContent = <BranchesSection branches={branches} requests={branchRequests} maxBranches={brand.maxBranches} onRequest={() => openModal({ type: 'branch-request' })} />;
      break;
    case 'services':
      sectionContent = <ServicesSection services={services} />;
      break;
    case 'subscriptions':
      sectionContent = <SubscriptionsSection plans={plans} subscriptions={subscriptions} />;
      break;
    case 'customers':
      sectionContent = <CustomerManagementPanel customers={customers} query={customerQuery} />;
      break;
    case 'reports':
      sectionContent = <ReportsSection reports={reports} />;
      break;
    case 'audit':
      sectionContent = <AuditSection auditLogs={auditLogs} />;
      break;
    default:
      sectionContent = <OverviewSection metrics={metrics} branches={branches} operationsReviewBookings={operationsReviewBookings} unassignedBookings={unassignedBookings} onReview={(booking) => openModal({ type: 'booking-review', booking })} onAssign={(booking) => openModal({ type: 'assignment', booking })} />;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#080808] text-white">
      <a href="#owner-main" className="sr-only rounded-lg bg-[#d4af37] px-4 py-2 font-bold text-black focus:not-sr-only focus:fixed focus:right-4 focus:top-4 focus:z-[60]">تخطي إلى المحتوى</a>
      <header className="border-b border-white/10 bg-black/40">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="min-w-0"><p className="text-sm font-semibold text-[#d4af37]">{brand.brandNameAr}</p><h1 className="mt-1 truncate text-2xl font-black tracking-tight">لوحة المالك</h1><p className="mt-1 text-sm text-white/45">{owner.fullName} · <span dir="ltr" translate="no">{owner.role}</span></p></div>
          <div className="flex flex-col gap-3 lg:items-end">
            <nav aria-label="أدوات الإدارة" className="flex max-w-full gap-2 overflow-x-auto pb-1">
              <Link href="/admin/calendar" className={`${secondaryButtonClass} shrink-0`}><CalendarDays aria-hidden="true" className="size-4" /> تقويم التشغيل</Link>
              <Link href="/admin/reports" className={`${secondaryButtonClass} shrink-0`}><BarChart3 aria-hidden="true" className="size-4" /> مركز التقارير</Link>
              <Link href="/admin/setup" className={`${secondaryButtonClass} shrink-0`}><Settings2 aria-hidden="true" className="size-4" /> إعداد التشغيل</Link>
              <Link href="/admin/branches" className={`${secondaryButtonClass} shrink-0`}><Building2 aria-hidden="true" className="size-4" /> إدارة الفروع</Link>
              <Link href="/admin/reviews" className={`${secondaryButtonClass} shrink-0`}><ClipboardCheck aria-hidden="true" className="size-4" /> تقييمات العملاء</Link>
              <Link href="/admin/site" className={`${secondaryButtonClass} shrink-0`}><FileSearch aria-hidden="true" className="size-4" /> محتوى الموقع</Link>
              <Link href="/operations/resources" className={`${secondaryButtonClass} shrink-0`}><Boxes aria-hidden="true" className="size-4" /> الموارد التشغيلية</Link>
              <Link href="/operations/support" className={`${secondaryButtonClass} shrink-0`}><MessageCircle aria-hidden="true" className="size-4" /> دعم العملاء</Link>
              <Link href="/admin/subscriptions" className={`${secondaryButtonClass} shrink-0`}><PackageCheck aria-hidden="true" className="size-4" /> إدارة الاشتراكات</Link>
              <Link href="/operations/password-resets" className={`${secondaryButtonClass} shrink-0`}><ShieldAlert aria-hidden="true" className="size-4" /> استعادة كلمات المرور</Link>
            </nav>
            <div className="flex flex-wrap items-center gap-3"><Link href="/" className={secondaryButtonClass}>عرض الموقع</Link><form action={logoutAction}><button type="submit" className={secondaryButtonClass}><LogOut aria-hidden="true" className="size-4" /> تسجيل الخروج</button></form></div>
          </div>
        </div>
      </header>

      <main id="owner-main" className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8 lg:py-8">
        <aside aria-label="أقسام لوحة المالك" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <nav className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:rounded-2xl lg:border lg:border-white/10 lg:bg-white/[0.025] lg:p-3">
            {sectionNav.map((item) => {
              const Icon = item.icon;
              const active = currentSection === item.id;
              return <Link key={item.id} href={`/admin?section=${item.id}`} aria-current={active ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#d4af37]/40 ${active ? 'bg-[#d4af37] text-black hover:bg-[#e2c55d]' : 'text-white/65 hover:text-white'}`}><Icon aria-hidden="true" className="size-4" />{item.label}</Link>;
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          <div aria-live="polite" className="mb-4 min-h-6 text-sm text-emerald-300">{feedback}</div>
          {sectionContent}
        </div>
      </main>

      {modal ? <OwnerActionDialog modal={modal} teams={teams} pending={pending} error={actionError} paymentDecision={paymentDecision} bookingDecision={bookingDecision} cancellationDecision={cancellationDecision} cancellationResolution={cancellationResolution} dialogRef={dialogRef} onPaymentDecision={setPaymentDecision} onBookingDecision={setBookingDecision} onCancellationDecision={setCancellationDecision} onCancellationResolution={setCancellationResolution} onClose={closeModal} onSubmit={submitAction} /> : null}
    </div>
  );
}
