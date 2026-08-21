'use client';

import type { FormEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Banknote,
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Crown,
  DollarSign,
  ExternalLink,
  FileSearch,
  Gauge,
  Globe,
  History,
  KeyRound,
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
  ShieldCheck,
  Sparkles,
  User,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import BareeqLogo from '@/components/BareeqLogo';
import {
  assignTeamManuallyAction,
  reviewBookingAction,
} from '@/app/actions/operations';
import { updateBranchAction } from '@/app/actions/owner-brand';
import {
  approveRefundAction,
  reviewCancellationAction,
} from '@/app/actions/cancellation';
import { logoutAction } from '@/app/actions/auth';
import { type ManagedSubscription } from './subscriptions/SubscriptionManagementPanel';

const CustomerManagementPanel = dynamic(() => import('./CustomerManagementPanel'), {
  loading: () => <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 text-sm text-white/55">جارٍ تحميل إدارة العملاء…</div>,
});

const SubscriptionManagementPanel = dynamic(() => import('./subscriptions/SubscriptionManagementPanel'), {
  loading: () => <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 text-sm text-white/55">جارٍ تحميل اشتراكات العملاء…</div>,
});

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
  beforePhotos?: number;
  afterPhotos?: number;
  minimumBeforePhotos?: number;
  minimumAfterPhotos?: number;
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

export interface CustomerVehicleDto {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  plateNumber: string | null;
  vehicleSize: string;
  isDefault: boolean;
}

export interface CustomerAddressDto {
  id: string;
  compound: string;
  district: string;
  street: string;
  buildingNumber: string;
  isDefault: boolean;
}

export interface CustomerBookingSummaryDto {
  id: string;
  bookingNumber: string;
  startAt: string;
  status: string;
  totalPrice: number;
  amountPaid: number;
  serviceName: string;
}

export interface CustomerDto {
  id: string;
  fullName: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  active: boolean;
  mustChangePwd: boolean;
  notes: string | null;
  creditBalance: number;
  totalSpent: number;
  createdAt: string;
  bookingCount: number;
  vehicleCount: number;
  subscriptionCount: number;
  lastBookingAt: string | null;
  vehicles: CustomerVehicleDto[];
  addresses: CustomerAddressDto[];
  recentBookings: CustomerBookingSummaryDto[];
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
}

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
  | { type: 'booking-review'; booking: BookingSummaryDto }
  | { type: 'assignment'; booking: BookingSummaryDto }
  | { type: 'cancellation'; request: CancellationRequestDto }
  | { type: 'refund-approval'; refund: RefundDto }
  | { type: 'edit-branch'; branch: BranchDto }
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
  { id: 'cancellations', label: 'الإلغاء والاسترداد', icon: ShieldAlert },
  { id: 'reports', label: 'التقارير', icon: BarChart3 },
  { href: '/admin/reports', label: 'الإيرادات', icon: DollarSign },
  { id: 'customers', label: 'العملاء', icon: UserRound },
  { href: '/admin/reviews', label: 'تقييمات العملاء', icon: ClipboardCheck },
  { href: '/admin/site', label: 'إدارة محتوى الموقع', icon: Globe },
  { href: '/admin/setup', label: 'إعداد التشغيل', icon: Settings2 },
  { href: '/operations/resources', label: 'المواد التشغيلية', icon: Boxes },
  { href: '/operations/password-resets', label: 'استعادة كلمة المرور', icon: KeyRound },
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
    <article className="group relative overflow-hidden rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 transition-all duration-300 hover:border-[#d4af37]/50 hover:shadow-xl hover:shadow-[#d4af37]/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 truncate">{label}</p>
          <p className="mt-2 text-2xl lg:text-3xl font-black tracking-tight tabular-nums text-white group-hover:text-[#f3e4a8] transition-colors">{value}</p>
        </div>
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl border shadow-md transition-transform duration-300 group-hover:scale-105 ${toneClass}`}>
          {icon}
        </div>
      </div>
      {hint ? (
        <p className="mt-3 text-xs leading-5 text-neutral-400 border-t border-neutral-800/60 pt-2.5 flex items-center gap-1.5 truncate">
          <span className="size-1.5 rounded-full bg-neutral-600 shrink-0" />
          <span className="truncate">{hint}</span>
        </p>
      ) : null}
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
  const isUrgent = urgent && count > 0;
  return (
    <Link
      href={href}
      className={`group flex min-h-14 items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-all duration-200 ${
        isUrgent
          ? 'border-rose-500/30 bg-rose-500/[0.04] hover:bg-rose-500/[0.08] hover:border-rose-500/60'
          : 'border-neutral-800/80 bg-neutral-900/50 hover:border-[#d4af37]/40 hover:bg-neutral-800/60'
      }`}
    >
      <span className="font-semibold text-sm text-neutral-200 group-hover:text-white transition-colors">{label}</span>
      <span
        className={`rounded-full px-3 py-1 text-xs font-black tabular-nums transition-all ${
          isUrgent
            ? 'bg-rose-500/20 text-rose-200 border border-rose-500/40 shadow-sm shadow-rose-500/20'
            : 'bg-neutral-800 text-neutral-300 border border-neutral-700'
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
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-neutral-800/60 pt-3.5">
        <a href={`tel:${booking.customerPhone}`} className="text-xs sm:text-sm font-bold text-[#d4af37] hover:text-[#f3e4a8] transition-colors flex items-center gap-1.5">
          <span>اتصال بالعميل</span>
          <span dir="ltr" className="text-neutral-400 font-mono text-xs">({booking.customerPhone})</span>
        </a>
        <span className="text-xs text-neutral-500 bg-neutral-900 px-2.5 py-1 rounded-lg border border-neutral-800">
          الفريق: <span className="text-neutral-300 font-medium">{booking.assignedTeamName ?? 'لم يُسند بعد'}</span>
        </span>
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
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-4 text-xs sm:text-sm leading-6 text-amber-100">
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#d4af37]" />
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
    <div className="space-y-8">
      <SectionHeader
        eyebrow="نظرة تشغيلية مباشرة"
        title="مركز قيادة بريق"
        description="المؤشرات والبيانات التشغيلية محسوبة آلياً من سجلات الحجوزات والمدفوعات والاشتراكات الفعلية المسجلة."
      />
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="إيراد اليوم المحصل" value={formatCurrency(metrics.revenueToday)} hint={`هذا الشهر: ${formatCurrency(metrics.revenueMonth)}`} icon={<Banknote aria-hidden="true" className="size-5" />} tone="green" />
        <MetricCard label="المبالغ المستحقة" value={formatCurrency(metrics.pendingAmounts)} hint="أرصدة حجوزات غير منتهية" icon={<WalletCards aria-hidden="true" className="size-5" />} tone="red" />
        <MetricCard label="حجوزات اليوم" value={formatNumber(metrics.todayBookings)} hint={`قيد التنفيذ: ${formatNumber(metrics.inProgress)}`} icon={<CalendarDays aria-hidden="true" className="size-5" />} />
        <MetricCard label="إشغال الفرق اليوم" value={`${formatNumber(metrics.teamUtilization)}٪`} hint="الحجوزات المسندة ÷ السعة اليومية" icon={<Gauge aria-hidden="true" className="size-5" />} tone="blue" />
        <MetricCard label="اكتملت اليوم" value={formatNumber(metrics.completedToday)} hint={`معدل إكمال الفترة: ${formatNumber(metrics.completionRate)}٪`} icon={<CheckCircle2 aria-hidden="true" className="size-5" />} tone="green" />
        <MetricCard label="الاشتراكات النشطة" value={formatNumber(metrics.activeSubscriptions)} hint={`زيارات متبقية: ${formatNumber(metrics.visitsRemaining)}`} icon={<PackageCheck aria-hidden="true" className="size-5" />} />
        <MetricCard label="عملاء جدد هذا الشهر" value={formatNumber(metrics.newCustomersMonth)} hint={`عملاء متكررون: ${formatNumber(metrics.repeatCustomers)}`} icon={<UserRound aria-hidden="true" className="size-5" />} tone="blue" />
        <MetricCard label="مشكلات الجودة المفتوحة" value={formatNumber(metrics.qualityOpen)} hint="حجوزات جودة وشكاوى مفتوحة" icon={<ShieldAlert aria-hidden="true" className="size-5" />} tone="red" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="priority-queues-title" className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 shadow-lg">
          <div className="flex items-center justify-between border-b border-neutral-800/60 pb-3.5 mb-4">
            <h3 id="priority-queues-title" className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="size-4 text-[#d4af37]" />
              قوائم التدخل السريع والأولوية
            </h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <QueueLink href="/operations?tab=proofs" label="إثباتات الدفع (مركز التشغيل)" count={metrics.pendingProofs} urgent />
            <QueueLink href="/admin?section=bookings" label="بانتظار مراجعة التشغيل" count={metrics.operationsReview} urgent />
            <QueueLink href="/admin?section=bookings" label="حجوزات بانتظار الإسناد" count={metrics.unassignedBookings} urgent />
            <QueueLink href="/admin?section=cancellations" label="طلبات الإلغاء" count={metrics.pendingCancellations} urgent />
            <QueueLink href="/admin?section=cancellations" label="استردادات معلقة" count={metrics.pendingRefunds} />
            <QueueLink href="/admin?section=quality" label="مراجعات الجودة والشكاوى" count={metrics.qualityOpen} />
          </div>
        </section>

        <section aria-labelledby="branch-capacity-title" className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 shadow-lg">
          <div className="flex items-center justify-between border-b border-neutral-800/60 pb-3.5 mb-4">
            <h3 id="branch-capacity-title" className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="size-4 text-[#d4af37]" />
              سعة الفروع التشغيلية اليوم
            </h3>
          </div>
          {branches.length === 0 ? (
            <div className="mt-4"><EmptyState title="لا توجد فروع" description="أنشئ الفرع من مدير النظام بعد اعتماد طلب الإضافة." /></div>
          ) : (
            <div className="space-y-4">
              {branches.map((branch) => {
                const capacity = branch.dailyBookingLimit > 0
                  ? Math.min(100, Math.round((branch.todayBookings / branch.dailyBookingLimit) * 100))
                  : 0;
                return (
                  <div key={branch.id} className="rounded-xl bg-neutral-950/40 border border-neutral-800/60 p-3.5">
                    <div className="mb-2 flex items-center justify-between gap-4 text-xs sm:text-sm">
                      <span className="font-bold text-neutral-200">{branch.nameAr}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-neutral-400 font-medium">الحمل:</span>
                        <span className="tabular-nums font-bold text-white bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                          {formatNumber(branch.todayBookings)} / {formatNumber(branch.dailyBookingLimit)}
                        </span>
                        <span className="text-xs font-black text-[#d4af37]">{capacity}٪</span>
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-neutral-800" aria-label={`استخدام سعة ${branch.nameAr}: ${capacity}٪`}>
                      <div className="h-full rounded-full bg-gradient-to-r from-[#d4af37] to-[#f0d879] transition-all duration-500" style={{ width: `${capacity}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="oldest-bookings-title" className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-4 border-b border-neutral-800/60 pb-3.5">
          <h3 id="oldest-bookings-title" className="text-base font-bold text-white flex items-center gap-2">
            <Clock className="size-4 text-[#d4af37]" />
            أقدم حجوزات تحتاج تدخلاً إدارياً
          </h3>
          <Link href="/admin?section=bookings" className="text-xs sm:text-sm font-bold text-[#d4af37] hover:text-[#f3e4a8] hover:underline">
            عرض كل الحجوزات ←
          </Link>
        </div>
        {operationsReviewBookings.length === 0 && unassignedBookings.length === 0 ? (
          <EmptyState title="لا توجد حجوزات متوقفة" description="لا توجد حجوزات تنتظر مراجعة التشغيل أو إسناد فريق." />
        ) : (
          <div className="space-y-3">
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
    <div className="space-y-6">
      <SectionHeader eyebrow="الحجوزات" title="متابعة دورة الحجز" description="آخر 100 حجز مطابق للفلاتر، مع الإجراءات المسموح بها فقط في الحالة الحالية." />
      <form action="/admin" method="get" className="grid gap-3 rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-4 sm:grid-cols-[1fr_220px_auto_auto] shadow-md">
        <input type="hidden" name="section" value="bookings" />
        <div><label htmlFor="booking-query" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">بحث الحجز أو العميل</label><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute right-3 top-3 size-4 text-neutral-500" /><input id="booking-query" name="q" defaultValue={filters.bookingQuery} autoComplete="off" placeholder="رقم الحجز أو اسم/هاتف العميل…" className={`${inputClass} pr-10`} /></div></div>
        <div><label htmlFor="booking-status-filter" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">حالة الحجز</label><select id="booking-status-filter" name="status" defaultValue={filters.bookingStatus} className={inputClass}><option value="" className="bg-[#111]">كل الحالات</option>{Object.entries(bookingStatusLabels).map(([value, label]) => <option key={value} value={value} className="bg-[#111]">{label}</option>)}</select></div>
        <button type="submit" className={`${primaryButtonClass} self-end`}>تطبيق الفلاتر</button>
        <Link href="/admin?section=bookings" className={`${secondaryButtonClass} self-end`}>إعادة ضبط</Link>
      </form>
      {bookings.length === 0 ? (
        <EmptyState title="لا توجد حجوزات مطابقة" description="غيّر حالة الحجز أو عبارة البحث ثم أعد المحاولة." />
      ) : (
        <div className="space-y-3">
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
    <div className="space-y-6">
      <SectionHeader eyebrow="الإلغاء والاسترداد" title="الطلبات المالية الحساسة" description="بيانات فعلية للطلبات المفتوحة والاستردادات المعلقة على مستوى البراند." />
      <CapabilityNotice>طلبات الإلغاء المفتوحة قابلة للمراجعة عبر العقد المحمي الحالي. اعتماد الاسترداد يظهر فقط لسجل REFUND_PROCESSING تم تسجيل إثباته مسبقًا؛ لا تنشئ اللوحة عملية استرداد أو إثباتًا ماليًا من تلقاء نفسها.</CapabilityNotice>
      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="cancellation-requests-title" className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between gap-4 border-b border-neutral-800/60 pb-3"><h3 id="cancellation-requests-title" className="text-base font-bold text-white">طلبات الإلغاء المعلقة</h3><span className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-bold text-neutral-300 tabular-nums">{formatNumber(requests.length)}</span></div>
          {requests.length === 0 ? <EmptyState title="لا توجد طلبات إلغاء" description="لا توجد طلبات بحالة PENDING حاليًا." /> : <div className="space-y-3">{requests.map((request) => <article key={request.id} className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-4"><div className="flex items-center justify-between gap-3"><p dir="ltr" translate="no" className="font-mono font-bold text-white">{request.booking.bookingNumber}</p><StatusBadge status={request.status} /></div><p className="mt-2.5 break-words text-xs sm:text-sm leading-6 text-neutral-300">{request.reason}</p><dl className="mt-3 grid gap-1.5 text-xs text-neutral-400 border-t border-neutral-800/60 pt-2.5"><div><dt className="inline">العميل: </dt><dd className="inline text-neutral-200 font-medium">{request.booking.customerName}</dd></div><div><dt className="inline">الإجراء المفضل: </dt><dd className="inline text-neutral-200 font-medium">{request.preferredAction}</dd></div><div><dt className="inline">المدفوع: </dt><dd className="inline tabular-nums text-[#f3e4a8] font-bold">{formatCurrency(request.booking.amountPaid)}</dd></div><div><dt className="inline">تاريخ الطلب: </dt><dd className="inline text-neutral-400">{formatDateTime(request.createdAt)}</dd></div></dl><button type="button" onClick={() => onReviewRequest(request)} className={`${primaryButtonClass} mt-4 w-full`}>مراجعة طلب الإلغاء</button></article>)}</div>}
        </section>
        <section aria-labelledby="refunds-title" className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 shadow-lg">
          <div className="mb-4 flex items-center justify-between gap-4 border-b border-neutral-800/60 pb-3"><h3 id="refunds-title" className="text-base font-bold text-white">الاستردادات المالية المعلقة</h3><span className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-bold text-neutral-300 tabular-nums">{formatNumber(refunds.length)}</span></div>
          {refunds.length === 0 ? <EmptyState title="لا توجد استردادات معلقة" description="لا توجد سجلات REFUND_PENDING أو REFUND_PROCESSING حاليًا." /> : <div className="space-y-3">{refunds.map((refund) => <article key={refund.id} className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-4"><div className="flex items-center justify-between gap-3"><p dir="ltr" translate="no" className="font-mono font-bold text-white">{refund.booking.bookingNumber}</p><StatusBadge status={refund.status} /></div><p className="mt-2.5 text-xl font-black tabular-nums text-[#f3e4a8]">{formatCurrency(refund.amount)}</p><p className="mt-1 text-xs text-neutral-400">{refund.refundMethod}{refund.referenceNumber ? ` · المرجع: ${refund.referenceNumber}` : ''}</p><p className="mt-1 text-[11px] text-neutral-500">سُجل {formatDateTime(refund.createdAt)}</p>{refund.status === 'REFUND_PROCESSING' ? <button type="button" onClick={() => onApproveRefund(refund)} className={`${primaryButtonClass} mt-4 w-full`}>اعتماد الاسترداد المسجل</button> : <p className="mt-4 rounded-lg bg-neutral-900 border border-neutral-800 p-3 text-xs leading-5 text-neutral-400">بانتظار تسجيل تنفيذ الاسترداد وإثباته قبل الاعتماد.</p>}</article>)}</div>}
        </section>
      </div>
    </div>
  );
}





function BranchesSection({
  branches,
  onEditBranch,
}: {
  branches: BranchDto[];
  onEditBranch: (branch: BranchDto) => void;
}) {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="الفروع والتغطية"
        title="هيكل التشغيل والفروع"
        description="إدارة وتعديل بيانات الفروع وسعات التشغيل، أو إضافة فرع جديد مباشرة للمنظومة."
        action={
          <Link href="/admin/branches" className={primaryButtonClass}>
            <Plus className="size-4" aria-hidden="true" />
            <span>إضافة فرع جديد</span>
          </Link>
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

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800/80 pt-3.5">
                <a
                  href={`tel:${branch.phone}`}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#d4af37] hover:text-[#f3e4a8] transition-colors"
                >
                  {branch.phone}
                </a>

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





function ReportTable({ title, rows }: { title: string; rows: ReportRowDto[] }) {
  return (
    <section className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 shadow-lg">
      <h3 className="text-base font-bold text-white border-b border-neutral-800/60 pb-3 mb-4">{title}</h3>
      {rows.length === 0 ? <EmptyState title="لا توجد بيانات" description="لا توجد سجلات في الفترة المحددة لهذا التصنيف." /> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-right text-xs sm:text-sm"><caption className="sr-only">{title}</caption><thead className="text-neutral-400 border-b border-neutral-800"><tr><th scope="col" className="px-3 py-3 font-semibold">التصنيف</th><th scope="col" className="px-3 py-3 font-semibold">عدد الحجوزات</th><th scope="col" className="px-3 py-3 font-semibold">إجمالي القيمة</th><th scope="col" className="px-3 py-3 font-semibold">المحصل الفعلي</th></tr></thead><tbody className="divide-y divide-neutral-800/60">{rows.map((row) => <tr key={row.id} className="hover:bg-white/[0.02] transition"><th scope="row" className="px-3 py-3 font-semibold text-white">{row.label}</th><td className="px-3 py-3 tabular-nums text-neutral-300">{formatNumber(row.count)}</td><td className="px-3 py-3 tabular-nums font-semibold text-neutral-200">{formatCurrency(row.totalPrice)}</td><td className="px-3 py-3 tabular-nums font-bold text-emerald-300">{formatCurrency(row.amountPaid)}</td></tr>)}</tbody></table></div>}
    </section>
  );
}

function ReportsSection({ reports }: { reports: ReportsDto }) {
  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="تقارير داخلية" title="التقرير التشغيلي والمالي" description="ملخص مبني على الفترة المحددة. صافي التحصيل هنا مدفوعات مسجلة ناقص استردادات مسجلة، وليس صافي ربح محاسبي." />
      <form action="/admin" method="get" className="grid gap-3 rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-4 sm:grid-cols-[1fr_1fr_auto] shadow-md">
        <input type="hidden" name="section" value="reports" />
        <div><label htmlFor="report-from" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">من تاريخ</label><input id="report-from" name="from" type="date" defaultValue={reports.from} className={inputClass} /></div>
        <div><label htmlFor="report-to" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">إلى تاريخ</label><input id="report-to" name="to" type="date" defaultValue={reports.to} className={inputClass} /></div>
        <button type="submit" className={`${primaryButtonClass} self-end`}>تحديث التقرير</button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-[#d4af37]/30 bg-[#d4af37]/[0.06] p-4 shadow-md">
          <div>
            <h4 className="text-sm font-bold text-[#f3e4a8]">مركز التقارير والإيرادات الشامل</h4>
            <p className="text-xs text-neutral-300 mt-1 leading-5">متابعة دقيقة للأداء التشغيلي ومؤشرات الجودة ودفتر الإيرادات والأرباح الشهرية مع تصدير CSV.</p>
          </div>
          <Link href="/admin/reports" className={`${primaryButtonClass} shrink-0 self-start`}>
            <BarChart3 aria-hidden="true" className="size-4" /> فتح مركز التقارير والإيرادات
          </Link>
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-4 shadow-md">
          <div>
            <h4 className="text-sm font-bold text-emerald-300">دفتر الإيرادات والحركات المالية</h4>
            <p className="text-xs text-neutral-300 mt-1 leading-5">استعراض مباشر لكشف الحركات المالية وتوزيع الإيراد حسب وسائل الدفع والفروع لكل شهر.</p>
          </div>
          <Link href="/admin/reports?tab=revenue" className={`${secondaryButtonClass} shrink-0 self-start`}>
            <DollarSign aria-hidden="true" className="size-4" /> فتح دفتر الإيرادات والحركات
          </Link>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="إجمالي الحجوزات" value={formatNumber(reports.totalBookings)} icon={<CalendarDays aria-hidden="true" className="size-5" />} />
        <MetricCard label="المحصل الفعلي" value={formatCurrency(reports.collectedAmount)} icon={<Banknote aria-hidden="true" className="size-5" />} tone="green" />
        <MetricCard label="الاستردادات" value={formatCurrency(reports.refundedAmount)} icon={<ShieldAlert aria-hidden="true" className="size-5" />} tone="red" />
        <MetricCard label="صافي التحصيل" value={formatCurrency(reports.netCollected)} hint="ليس صافي ربح محاسبي" icon={<Activity aria-hidden="true" className="size-5" />} tone="blue" />
        <MetricCard label="متوسط قيمة الحجز" value={formatCurrency(reports.averageBookingValue)} icon={<Gauge aria-hidden="true" className="size-5" />} />
        <MetricCard label="المبالغ المستحقة" value={formatCurrency(reports.amountDue)} icon={<WalletCards aria-hidden="true" className="size-5" />} tone="red" />
        <MetricCard label="اشتراكات جديدة" value={formatNumber(reports.newSubscriptions)} hint={`زيارات مستهلكة: ${formatNumber(reports.visitsConsumed)}`} icon={<PackageCheck aria-hidden="true" className="size-5" />} />
        <MetricCard label="الشكاوى المسجلة" value={formatNumber(reports.complaintCount)} icon={<AlertTriangle aria-hidden="true" className="size-5" />} tone="red" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2"><ReportTable title="حسب الخدمة" rows={reports.byService} /><ReportTable title="حسب الفرع" rows={reports.byBranch} /><ReportTable title="حسب الفريق" rows={reports.byTeam} /><section className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 shadow-lg"><h3 className="text-base font-bold text-white border-b border-neutral-800/60 pb-3 mb-4">أسباب الإلغاء</h3>{reports.cancellationReasons.length === 0 ? <EmptyState title="لا توجد إلغاءات" description="لا توجد طلبات إلغاء في الفترة المحددة." /> : <ol className="space-y-2.5">{reports.cancellationReasons.map((item) => <li key={item.reason} className="flex items-start justify-between gap-4 rounded-xl border border-neutral-800/80 bg-neutral-950/40 p-3"><span className="break-words text-xs sm:text-sm text-neutral-300">{item.reason}</span><span className="shrink-0 rounded-full bg-neutral-800 border border-neutral-700 px-2.5 py-1 text-xs font-black tabular-nums text-white">{formatNumber(item.count)}</span></li>)}</ol>}</section></div>
      <section aria-labelledby="status-breakdown-title" className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 shadow-lg"><h3 id="status-breakdown-title" className="text-base font-bold text-white border-b border-neutral-800/60 pb-3 mb-4">توزيع حالات الحجز</h3>{reports.byStatus.length === 0 ? <EmptyState title="لا توجد حالات" description="لا توجد حجوزات في الفترة المحددة." /> : <div className="flex flex-wrap gap-2.5">{reports.byStatus.map((item) => <div key={item.status} className="flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/50 px-3 py-2"><StatusBadge status={item.status} label={bookingStatusLabel(item.status)} /><span className="font-bold text-xs tabular-nums text-white">{formatNumber(item.count)}</span></div>)}</div>}</section>
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
  cancellationDecision,
  cancellationResolution,
  dialogRef,
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
  bookingDecision: BookingDecision | '';
  cancellationDecision: CancellationDecision | '';
  cancellationResolution: CancellationResolution | '';
  dialogRef: React.RefObject<HTMLDivElement | null>;
  onBookingDecision: (decision: BookingDecision | '') => void;
  onCancellationDecision: (decision: CancellationDecision | '') => void;
  onCancellationResolution: (resolution: CancellationResolution | '') => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const title = modal.type === 'booking-review'
    ? 'تأكيد مراجعة الحجز'
    : modal.type === 'assignment'
      ? 'تأكيد إسناد الفريق'
      : modal.type === 'cancellation'
        ? 'تأكيد قرار طلب الإلغاء'
        : modal.type === 'refund-approval'
          ? 'اعتماد الاسترداد المسجل'
          : 'تعديل بيانات الفرع';
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
          {modal.type === 'cancellation' ? <><input type="hidden" name="cancellationId" value={modal.request.id} /><div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-4 text-xs sm:text-sm"><p dir="ltr" translate="no" className="font-mono font-bold text-white text-base">{modal.request.booking.bookingNumber}</p><p className="mt-1 text-neutral-400">المدفوع: <span className="text-[#f3e4a8] font-bold">{formatCurrency(modal.request.booking.amountPaid)}</span> · تفضيل العميل: {modal.request.preferredAction}</p><p className="mt-2 break-words text-neutral-300">{modal.request.reason}</p></div><div><label htmlFor="cancellation-decision" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">القرار</label><select id="cancellation-decision" name="decision" required value={cancellationDecision} onChange={(event) => { onCancellationDecision(event.target.value as CancellationDecision | ''); onCancellationResolution(''); }} className={inputClass}><option value="" className="bg-[#111]">اختر القرار</option><option value="APPROVE" className="bg-[#111]">اعتماد الطلب</option><option value="REJECT" className="bg-[#111]">رفض الطلب واستعادة حالة الحجز</option></select></div>{cancellationDecision === 'APPROVE' ? <><div><label htmlFor="cancellation-resolution" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">نوع الحل المالي</label><select id="cancellation-resolution" name="resolutionType" required value={cancellationResolution} onChange={(event) => onCancellationResolution(event.target.value as CancellationResolution | '')} className={inputClass}><option value="" className="bg-[#111]">اختر نوع الحل</option><option value="REFUND_FULL" className="bg-[#111]">استرداد كامل</option><option value="REFUND_PARTIAL" className="bg-[#111]">استرداد جزئي</option><option value="NO_REFUND" className="bg-[#111]">إلغاء دون استرداد</option><option value="KEEP_DEPOSIT" className="bg-[#111]">الاحتفاظ بالعربون</option><option value="ESCALATE" className="bg-[#111]">تصعيد للمراجعة</option></select></div><div><label htmlFor="cancellation-party" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">الطرف المسؤول</label><select id="cancellation-party" name="responsibleParty" required defaultValue="" className={inputClass}><option value="" className="bg-[#111]">اختر الطرف</option><option value="CUSTOMER" className="bg-[#111]">العميل</option><option value="TEAM" className="bg-[#111]">الفريق</option><option value="BRANCH" className="bg-[#111]">الفرع</option><option value="ACCESS" className="bg-[#111]">تعذر الوصول</option><option value="FORCE_MAJEURE" className="bg-[#111]">ظرف قهري</option></select></div>{cancellationResolution === 'REFUND_PARTIAL' ? <div><label htmlFor="approved-refund-amount" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">مبلغ الاسترداد الجزئي</label><input id="approved-refund-amount" name="approvedRefundAmount" type="number" min={1} max={modal.request.booking.amountPaid} step={1} inputMode="numeric" required className={inputClass} /></div> : null}</> : null}<div><label htmlFor="cancellation-notes" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">ملاحظات القرار</label><textarea id="cancellation-notes" name="resolutionNotes" required minLength={3} maxLength={1000} rows={3} autoComplete="off" className={inputClass} /></div></> : null}
          {modal.type === 'refund-approval' ? <><input type="hidden" name="refundId" value={modal.refund.id} /><div className="rounded-xl bg-neutral-950/60 border border-neutral-800 p-4 text-xs sm:text-sm"><p dir="ltr" translate="no" className="font-mono font-bold text-white text-base">{modal.refund.booking.bookingNumber}</p><p className="mt-2 text-2xl font-black tabular-nums text-[#f3e4a8]">{formatCurrency(modal.refund.amount)}</p><p className="mt-1 text-neutral-400">{modal.refund.refundMethod}{modal.refund.referenceNumber ? ` · ${modal.refund.referenceNumber}` : ''}</p></div><div><label htmlFor="refund-approval-reason" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-400">سبب الاعتماد</label><textarea id="refund-approval-reason" name="reason" required minLength={3} maxLength={1000} rows={3} autoComplete="off" className={inputClass} /></div></> : null}
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
                <label htmlFor="edit-branch-address" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-400">العنوان التفصيلي</label>
                <textarea id="edit-branch-address" name="address" required defaultValue={modal.branch.address} minLength={5} maxLength={500} rows={2} className={inputClass} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-branch-phone" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-400">هاتف الفرع</label>
                  <input id="edit-branch-phone" name="phone" required type="tel" defaultValue={modal.branch.phone} dir="ltr" className={`${inputClass} font-mono`} />
                </div>
                <div>
                  <label htmlFor="edit-branch-whatsapp" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-neutral-400">واتساب الفرع</label>
                  <input id="edit-branch-whatsapp" name="whatsapp" required type="tel" defaultValue={modal.branch.whatsapp} dir="ltr" className={`${inputClass} font-mono`} />
                </div>
              </div>

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
    metrics,
    filters,
    customerQuery,
    operationsReviewBookings,
    unassignedBookings,
    cancellationRequests,
    pendingRefunds,
    bookings,
    managedSubscriptions = [],
    teams,
    branches,
    customers,
    auditLogs,
    reports,
  } = props;
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [pending, setPending] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [bookingDecision, setBookingDecision] = useState<BookingDecision | ''>('');
  const [cancellationDecision, setCancellationDecision] = useState<CancellationDecision | ''>('');
  const [cancellationResolution, setCancellationResolution] = useState<CancellationResolution | ''>('');
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
      const result = modal.type === 'booking-review'
        ? await reviewBookingAction(formData)
        : modal.type === 'assignment'
          ? await assignTeamManuallyAction(formData)
          : modal.type === 'cancellation'
            ? await reviewCancellationAction(formData)
            : modal.type === 'refund-approval'
              ? await approveRefundAction(formData)
              : await updateBranchAction(formData);
      if ('error' in result && result.error) {
        setActionError(result.error);
        return;
      }
      setFeedback(
        modal.type === 'booking-review'
          ? 'تم حفظ قرار مراجعة الحجز.'
          : modal.type === 'assignment'
            ? 'تم إسناد الفريق بعد إعادة فحص التعارض.'
            : modal.type === 'cancellation'
              ? 'تم حفظ قرار طلب الإلغاء.'
              : modal.type === 'refund-approval'
                ? 'تم اعتماد الاسترداد المسجل.'
                : 'تم تحديث بيانات الفرع بنجاح.',
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
    case 'subscriptions':
      sectionContent = (
        <div className="space-y-6">
          <SectionHeader
            eyebrow="الاشتراكات الفعلية"
            title="اشتراكات العملاء والتفعيل"
            description="متابعة وتفعيل اشتراكات العملاء، تجميد أو تمديد الاشتراك وتعديل رصيد الزيارات."
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
          <SubscriptionManagementPanel subscriptions={managedSubscriptions} />
        </div>
      );
      break;
    case 'cancellations':
      sectionContent = <CancellationsSection requests={cancellationRequests} refunds={pendingRefunds} onReviewRequest={(request) => openModal({ type: 'cancellation', request })} onApproveRefund={(refund) => openModal({ type: 'refund-approval', refund })} />;
      break;
    case 'branches':
      sectionContent = <BranchesSection branches={branches} onEditBranch={(branch) => openModal({ type: 'edit-branch', branch })} />;
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
                  if (item.id === 'payments') badgeCount = metrics.pendingProofs;
                  else if (item.id === 'bookings') badgeCount = metrics.operationsReview + metrics.unassignedBookings;
                  else if (item.id === 'cancellations') badgeCount = metrics.pendingCancellations + metrics.pendingRefunds;

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
              <Link
                href="/system-admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-[#f3e4a8] hover:bg-[#d4af37]/15 transition-all border border-[#d4af37]/20 bg-[#d4af37]/5"
              >
                <ShieldCheck className="size-4 text-[#d4af37]" />
                <span>حوكمة النظام</span>
              </Link>

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
              if (item.id === 'payments') badgeCount = metrics.pendingProofs;
              else if (item.id === 'bookings') badgeCount = metrics.operationsReview + metrics.unassignedBookings;
              else if (item.id === 'cancellations') badgeCount = metrics.pendingCancellations + metrics.pendingRefunds;

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

            {/* حوكمة النظام وتسجيل الخروج في أسفل القائمة الجانبية */}
            <div className="pt-2 mt-2 border-t border-neutral-800/80 space-y-1">
              <Link
                href="/system-admin"
                className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-[#f3e4a8] hover:bg-[#d4af37]/15 transition-all border border-[#d4af37]/20 bg-[#d4af37]/5"
              >
                <ShieldCheck className="size-4 text-[#d4af37]" />
                <span>حوكمة النظام</span>
              </Link>

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

      {modal ? <OwnerActionDialog modal={modal} teams={teams} pending={pending} error={actionError} bookingDecision={bookingDecision} cancellationDecision={cancellationDecision} cancellationResolution={cancellationResolution} dialogRef={dialogRef} onBookingDecision={setBookingDecision} onCancellationDecision={setCancellationDecision} onCancellationResolution={setCancellationResolution} onClose={closeModal} onSubmit={submitAction} /> : null}
    </div>
  );
}
