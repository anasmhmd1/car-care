'use client';

import type { BookingStatus, ChecklistStage } from '@prisma/client';
import type { ReactNode } from 'react';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BadgeDollarSign,
  Boxes,
  Calendar,
  CalendarDays,
  Car,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  FileSearch,
  FileText,
  Globe,
  HandCoins,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Navigation,
  PackageCheck,
  Phone,
  PlusCircle,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Square,
  User,
  Wrench,
  X,
} from 'lucide-react';
import BareeqLogo from '@/components/BareeqLogo';
import { logoutAction } from '@/app/actions/auth';
import {
  recordTechnicianNoteAction,
  toggleChecklistItemAction,
  updateTechnicianTaskStatusAction,
} from '@/app/actions/technician';
import { advancePostServiceAction } from '@/app/actions/quality';
import { phoneHref, whatsappHref } from '@/lib/contact-links';
import { formatMaterialQuantityWithUnit } from '@/lib/inventory/units';
import { canEditChecklistStage as canEditChecklistStageOnServer } from '@/lib/engine/evidence-stage';

export type StaffSection =
  | 'overview'
  | 'tasks'
  | 'materials'
  | 'incidents'
  | 'delegated'
  | 'history';

export interface StaffEmployeeDto {
  id: string;
  fullName: string;
  phone: string;
  role: string;
}

export interface StaffTeamMemberDto {
  id: string;
  fullName: string;
  phone: string;
  isLeader: boolean;
}

export interface StaffTeamDto {
  id: string;
  name: string;
  branchId: string;
  branchName: string;
  isLeader: boolean;
  members: StaffTeamMemberDto[];
  operationalVehicles: Array<{
    id: string;
    code: string;
    plateNumber: string | null;
    make: string;
    model: string;
  }>;
}

export interface StaffMetricsDto {
  todayTasks: number;
  inProgress: number;
  pendingAcknowledgment: number;
  arrived: number;
  inService: number;
  qualityReview: number;
  completedToday: number;
  materialsReadinessRate: number;
  custodyItemsCount: number;
  delegatedTasksCount: number;
}

export interface ChecklistItemDto {
  id: string;
  labelAr: string;
  descriptionAr: string | null;
  required: boolean;
  requiresNote: boolean;
  displayOrder: number;
}

export interface ChecklistTemplateDto {
  id: string;
  name: string;
  stage: string;
  items: ChecklistItemDto[];
}

export interface BookingNoteDto {
  id: string;
  note: string;
  isPrivate: boolean;
  createdAt: string | Date;
  user?: { fullName: string } | null;
}

export interface RequiredMaterialDto {
  requirementId: string;
  materialId: string;
  nameAr: string;
  unit: string;
  quantityRequired: number;
  required: boolean;
  notes: string | null;
  materialActive: boolean;
  stockConfigured: boolean;
  stockActive: boolean;
  quantityOnHand: number;
  reservedQuantity: number;
  availableQuantity: number;
  ready: boolean;
}

export interface StaffBookingDto {
  id: string;
  branchId: string;
  serviceId: string;
  bookingNumber: string;
  bookingStatus: string;
  startAt: string | Date;
  gateInstructions: string | null;
  locationUrl: string | null;
  assignedEmployeeId?: string | null;
  assignedEmployee?: { fullName: string } | null;
  addressSnapshot: unknown;
  serviceSnapshot: unknown;
  totalPrice?: number;
  depositAmount?: number;
  amountPaid?: number;
  amountDue?: number;
  service: {
    nameAr: string;
    checklistTemplates: ChecklistTemplateDto[];
  };
  vehicle: {
    make: string;
    model: string;
    color: string;
    plateNumber: string | null;
  };
  operationalVehicle?: {
    code: string;
    plateNumber: string | null;
    make: string;
    model: string;
  } | null;
  customer: {
    user: {
      fullName: string;
      phone: string;
      whatsapp: string | null;
    };
  };
  checklistInstances: Array<{
    stage: string;
    completedAt: string | Date | null;
    results: Array<{ itemId: string; isChecked: boolean; note?: string | null }>;
  }>;
  notes: BookingNoteDto[];
  requiredMaterials: RequiredMaterialDto[];
}

export interface CustodyStockDto {
  id: string;
  quantityOnHand: number;
  material: {
    nameAr: string;
    sku: string;
    unit: string;
  };
}

export interface DelegatedQueuesDto {
  enabled: {
    'payment.review': boolean;
    'booking.accept': boolean;
    'booking.view_unassigned': boolean;
    'quality.review': boolean;
    'payment.record_balance': boolean;
    'refund.record_proof': boolean;
    'booking.close': boolean;
  };
  canManagePrices: boolean;
  pendingProofs: Array<{
    id: string;
    senderName: string;
    senderPhoneOrAccount: string;
    referenceNumber: string | null;
    amountSubmitted: number;
    transferTimestamp: string | Date;
    proofFileUrl: string;
    paymentMethod: { name: string };
    booking: {
      id: string;
      bookingNumber: string;
      amountDue: number;
      branch: { nameAr: string };
      service: { nameAr: string };
      customer: { user: { fullName: string } };
    };
  }>;
  reviewBookings: Array<{
    id: string;
    bookingNumber: string;
    startAt: string | Date;
    amountPaid: number;
    amountDue: number;
    branch: { nameAr: string };
    service: { nameAr: string };
    customer: { user: { fullName: string } };
  }>;
  unassignedBookings: Array<{
    id: string;
    bookingNumber: string;
    bookingStatus: string;
    startAt: string | Date;
    branch: { nameAr: string };
    service: { nameAr: string };
  }>;
  qualityBookings: Array<{
    id: string;
    bookingNumber: string;
    branch: { nameAr: string };
    service: { nameAr: string };
    customer: { user: { fullName: string } };
  }>;
  balanceBookings: Array<{
    id: string;
    bookingNumber: string;
    amountDue: number;
    amountPaid: number;
    totalPrice: number;
    branch: { nameAr: string };
    service: { nameAr: string };
    customer: { user: { fullName: string } };
  }>;
  refundCases: Array<{
    id: string;
    approvedRefundAmount: number;
    remainingAmount: number;
    booking: {
      id: string;
      bookingNumber: string;
      branch: { nameAr: string };
      service: { nameAr: string };
      customer: { user: { fullName: string } };
    };
  }>;
  closeBookings: Array<{
    id: string;
    bookingNumber: string;
    branch: { nameAr: string };
    service: { nameAr: string };
    customer: { user: { fullName: string } };
  }>;
}

export interface StaffCommandCenterProps {
  employee: StaffEmployeeDto;
  team: StaffTeamDto | null;
  currentSection: StaffSection;
  metrics: StaffMetricsDto;
  bookings: StaffBookingDto[];
  myCustodyStocks: CustodyStockDto[];
  delegatedData?: DelegatedQueuesDto | null;
  initialTaskId?: string;
  filters?: {
    status?: string;
    search?: string;
  };
}

type WorkflowStatus =
  | 'ASSIGNED'
  | 'TEAM_ACKNOWLEDGED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'IN_SERVICE'
  | 'QUALITY_REVIEW'
  | 'SERVICE_COMPLETED'
  | 'DELIVERED';

interface WorkflowStepConfig {
  stepNumber: number;
  stageKey: string;
  fromStatuses: WorkflowStatus[];
  to: WorkflowStatus;
  label: string;
  shortLabel: string;
  helper: string;
}

const WORKFLOW_STEPS: WorkflowStepConfig[] = [
  {
    stepNumber: 1,
    stageKey: 'TEAM_PREPARATION',
    fromStatuses: ['ASSIGNED'],
    to: 'TEAM_ACKNOWLEDGED',
    label: 'تأكيد استلام المهمة',
    shortLabel: 'استلام المهمة',
    helper: 'راجع بيانات العميل والموقع قبل بدء المهمة',
  },
  {
    stepNumber: 2,
    stageKey: 'TEAM_PREPARATION',
    fromStatuses: ['TEAM_ACKNOWLEDGED'],
    to: 'ON_THE_WAY',
    label: 'بدء التحرك نحو العميل',
    shortLabel: 'انطلاق الفريق',
    helper: 'جهّز المواد وسجّل انطلاق الفريق للموقع',
  },
  {
    stepNumber: 3,
    stageKey: 'ARRIVAL_INSPECTION',
    fromStatuses: ['ON_THE_WAY'],
    to: 'ARRIVED',
    label: 'تأكيد الوصول والفحص',
    shortLabel: 'تأكيد الوصول',
    helper: 'سجّل الوصول ووثّق حالة السيارة قبل الخدمة',
  },
  {
    stepNumber: 4,
    stageKey: 'SERVICE_EXECUTION',
    fromStatuses: ['ARRIVED'],
    to: 'IN_SERVICE',
    label: 'بدء تنفيذ الخدمة',
    shortLabel: 'بدء التنفيذ',
    helper: 'يتطلب إكمال Checklist المالك لفحص الوصول وتوفير المواد المطلوبة',
  },
  {
    stepNumber: 5,
    stageKey: 'CLOSING',
    fromStatuses: ['IN_SERVICE'],
    to: 'QUALITY_REVIEW',
    label: 'إرسال لمراجعة الجودة',
    shortLabel: 'إرسال للجودة',
    helper: 'أكمل قوائم المراحل التي أعدّها المالك أولًا',
  },
  {
    stepNumber: 6,
    stageKey: 'CLOSING',
    fromStatuses: ['SERVICE_COMPLETED'],
    to: 'DELIVERED',
    label: 'تأكيد تسليم الخدمة',
    shortLabel: 'تسليم للعميل',
    helper: 'بعد اعتماد الجودة وتسوية الرصيد المستحق',
  },
];

const EXECUTION_CHECKLIST_STAGE_KEYS = [
  'TEAM_PREPARATION',
  'ARRIVAL_INSPECTION',
  'SERVICE_EXECUTION',
  'CLOSING',
] as const;

const REVERT_MAP: Partial<Record<WorkflowStatus, { to: WorkflowStatus; label: string }>> = {
  TEAM_ACKNOWLEDGED: { to: 'ASSIGNED', label: 'الرجوع لحالة بانتظار الاستلام' },
  ON_THE_WAY: { to: 'ASSIGNED', label: 'الرجوع لحالة بانتظار الانطلاق' },
  ARRIVED: { to: 'ON_THE_WAY', label: 'الرجوع لحالة في الطريق' },
  IN_SERVICE: { to: 'ARRIVED', label: 'الرجوع لحالة تم الوصول' },
  QUALITY_REVIEW: { to: 'IN_SERVICE', label: 'الرجوع لمرحلة قيد التنفيذ' },
  DELIVERED: { to: 'IN_SERVICE', label: 'الرجوع لمرحلة قيد التنفيذ' },
};

function getTargetStatusForStep(
  step: WorkflowStepConfig,
): WorkflowStatus {
  return step.to;
}


const bookingStatusLabels: Record<string, string> = {
  ASSIGNED: 'مسندة للفريق',
  TEAM_ACKNOWLEDGED: 'تم الاستلام',
  ON_THE_WAY: 'في الطريق للعميل',
  ARRIVED: 'تم الوصول للموقع',
  IN_SERVICE: 'قيد التنفيذ الميداني',
  QUALITY_REVIEW: 'بانتظار اعتماد الجودة',
  SERVICE_COMPLETED: 'الجودة معتمدة · بانتظار التسليم',
  DELIVERED: 'تم التسليم بنجاح',
  CLOSED: 'مغلق',
  RESCHEDULE_REQUESTED: 'طلب تعديل موعد',
  CANCELLATION_REQUESTED: 'طلب إلغاء',
  CANCELLED: 'ملغي',
  REJECTED: 'مرفوض',
  EXECUTION_FAILED: 'تعذر التنفيذ',
  CUSTOMER_NO_SHOW: 'العميل لم يحضر',
  ACCESS_DENIED: 'تعذر الدخول للموقع',
};

const badgeTone: Record<string, string> = {
  ASSIGNED: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  TEAM_ACKNOWLEDGED: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  ON_THE_WAY: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  ARRIVED: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  IN_SERVICE: 'border-[#cea355]/40 bg-[#cea355]/10 text-[#f3e4a8]',
  QUALITY_REVIEW: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
  SERVICE_COMPLETED: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  DELIVERED: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  CLOSED: 'border-neutral-700 bg-neutral-800 text-neutral-300',
  EXECUTION_FAILED: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  CUSTOMER_NO_SHOW: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  ACCESS_DENIED: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
};

function canEditChecklistStage(stage: string, bookingStatus: string): boolean {
  return canEditChecklistStageOnServer(
    bookingStatus as BookingStatus,
    stage as ChecklistStage,
  );
}

const numberFormatter = new Intl.NumberFormat('ar-EG');
const currencyFormatter = new Intl.NumberFormat('ar-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 0,
});
const dateTimeFormatter = new Intl.DateTimeFormat('ar-EG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Cairo',
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatDateTime(value: string | Date) {
  return dateTimeFormatter.format(new Date(value));
}

function toLocalDateString(dateVal: string | Date): string {
  try {
    const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
    if (Number.isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return '';
  }
}

const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

interface WeekDayItem {
  dateStr: string;
  date: Date;
  dayName: string;
  dayNumber: number;
  monthName: string;
  fullFormatted: string;
  isToday: boolean;
  tasksCount: number;
  activeCount: number;
  completedCount: number;
  pendingCount: number;
}

function getWeekDays(
  weekOffset = 0,
  bookings: StaffBookingDto[] = [],
  taskStatuses: Record<string, string> = {},
): {
  days: WeekDayItem[];
  weekRangeLabel: string;
  todayStr: string;
} {
  const now = new Date();
  const todayStr = toLocalDateString(now);

  // In Egypt & Arab regions, Saturday (day 6 in JS Date) is the start of the week.
  const currentDayIndex = now.getDay();
  const diffToSaturday = (currentDayIndex + 1) % 7;

  const saturday = new Date(now);
  saturday.setDate(now.getDate() - diffToSaturday + weekOffset * 7);
  saturday.setHours(0, 0, 0, 0);

  const days: WeekDayItem[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + i);
    const dateStr = toLocalDateString(d);
    const dayName = ARABIC_DAYS[d.getDay()];
    const dayNumber = d.getDate();
    const monthName = ARABIC_MONTHS[d.getMonth()];
    const isThisToday = dateStr === todayStr;

    const dayBookings = bookings.filter((b) => {
      const bDate = toLocalDateString(b.startAt);
      if (isThisToday) {
        const st = taskStatuses[b.id] ?? b.bookingStatus;
        const isOngoing = ['ON_THE_WAY', 'ARRIVED', 'IN_SERVICE', 'ASSIGNED', 'TEAM_ACKNOWLEDGED'].includes(st);
        return bDate === dateStr || isOngoing;
      }
      return bDate === dateStr;
    });

    const activeCount = dayBookings.filter((b) => {
      const st = taskStatuses[b.id] ?? b.bookingStatus;
      return ['ON_THE_WAY', 'ARRIVED', 'IN_SERVICE'].includes(st);
    }).length;
    const completedCount = dayBookings.filter((b) => {
      const st = taskStatuses[b.id] ?? b.bookingStatus;
      return ['DELIVERED', 'SERVICE_COMPLETED', 'CLOSED'].includes(st);
    }).length;
    const pendingCount = dayBookings.filter((b) => {
      const st = taskStatuses[b.id] ?? b.bookingStatus;
      return ['ASSIGNED', 'TEAM_ACKNOWLEDGED', 'CONFIRMED', 'ACCEPTED'].includes(st);
    }).length;

    days.push({
      dateStr,
      date: d,
      dayName,
      dayNumber,
      monthName,
      fullFormatted: `${dayName} ${dayNumber} ${monthName}`,
      isToday: isThisToday,
      tasksCount: dayBookings.length,
      activeCount,
      completedCount,
      pendingCount,
    });
  }

  const startDay = days[0];
  const endDay = days[6];
  const weekRangeLabel = `من ${startDay.dayName} ${startDay.dayNumber} ${startDay.monthName} إلى ${endDay.dayName} ${endDay.dayNumber} ${endDay.monthName}`;

  return { days, weekRangeLabel, todayStr };
}

function formatTimeOnly(dateValue: string | Date): string {
  return new Intl.DateTimeFormat('ar-EG', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).format(new Date(dateValue));
}

function formatAddressSnapshot(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== 'object') return '';
  const obj = snapshot as Record<string, string | undefined>;
  const parts = [
    obj.compound && `كمبوند ${obj.compound}`,
    obj.district && `حي ${obj.district}`,
    obj.city,
    obj.street && `شارع ${obj.street}`,
    obj.buildingNumber && `عمارة ${obj.buildingNumber}`,
    obj.unitNumber && `شقة/وحدة ${obj.unitNumber}`,
    obj.landmark && `علامة مميزة: ${obj.landmark}`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' — ') : '';
}

function sanitizeLocationUrl(url: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (['http:', 'https:'].includes(parsed.protocol)) {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${
        badgeTone[status] ?? 'border-neutral-800 bg-neutral-900/80 text-neutral-300'
      }`}
    >
      <span className="size-1.5 rounded-full bg-current animate-pulse shrink-0" />
      {label ?? bookingStatusLabels[status] ?? status}
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
        <p className="mt-1.5 max-w-3xl text-pretty text-xs sm:text-sm leading-6 text-neutral-400">
          {description}
        </p>
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
          <p className="mt-2.5 text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-white group-hover:text-[#f3e4a8] transition-colors">
            {value}
          </p>
        </div>
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-2xl border shadow-md transition-transform duration-300 group-hover:scale-105 ${toneClass}`}
        >
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

function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-800/80 bg-neutral-950/40 px-5 py-12 text-center">
      <FileSearch aria-hidden="true" className="mx-auto size-9 text-[#cea355]/60" />
      <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-xs sm:text-sm leading-6 text-neutral-400">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export default function StaffCommandCenter({
  employee,
  team,
  currentSection = 'overview',
  metrics,
  bookings,
  myCustodyStocks,
  delegatedData,
  initialTaskId,
  filters,
}: StaffCommandCenterProps) {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>(
    initialTaskId ?? bookings[0]?.id ?? '',
  );
  const [searchQuery, setSearchQuery] = useState(filters?.search ?? '');
  const [statusFilter, setStatusFilter] = useState(filters?.status ?? 'all');
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedScheduleDateStr, setSelectedScheduleDateStr] = useState<string>(() =>
    toLocalDateString(new Date()),
  );
  const [viewAllWeekSchedule, setViewAllWeekSchedule] = useState<boolean>(false);
  const [dayTaskFilter, setDayTaskFilter] = useState<string>('all');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  // Active Task State
  const [activeNoteModal, setActiveNoteModal] = useState<{
    bookingId: string;
    bookingNumber: string;
    type: 'PROBLEM' | 'EXTRA_TIME' | 'ADDON_REQUEST' | 'GENERAL';
  } | null>(null);
  const [noteInputText, setNoteInputText] = useState('');
  const [activeChecklistEvidence, setActiveChecklistEvidence] = useState<{
    item: ChecklistItemDto;
    stage: string;
    bookingId: string;
  } | null>(null);
  const [checklistNote, setChecklistNote] = useState('');

  // Local checklist cache for instant snappy feedback
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const b of bookings) {
      for (const instance of b.checklistInstances) {
        for (const res of instance.results) {
          map[`${b.id}:${res.itemId}`] = res.isChecked;
        }
      }
    }
    return map;
  });
  const [checklistNotes, setChecklistNotes] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const b of bookings) {
      for (const instance of b.checklistInstances) {
        for (const res of instance.results) {
          if (res.note) map[`${b.id}:${res.itemId}`] = res.note;
        }
      }
    }
    return map;
  });

  // Local status cache
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>(() => {
    return Object.fromEntries(bookings.map((b) => [b.id, b.bookingStatus]));
  });

  // Weekly Schedule Memo
  const weekInfo = useMemo(() => {
    return getWeekDays(weekOffset, bookings, taskStatuses);
  }, [weekOffset, bookings, taskStatuses]);

  const selectedDayInfo = useMemo(() => {
    return (
      weekInfo.days.find((d) => d.dateStr === selectedScheduleDateStr) ??
      weekInfo.days.find((d) => d.isToday) ??
      weekInfo.days[0]
    );
  }, [weekInfo, selectedScheduleDateStr]);

  const displayedScheduleBookings = useMemo(() => {
    if (viewAllWeekSchedule) {
      const weekDateSet = new Set(weekInfo.days.map((d) => d.dateStr));
      return bookings.filter((b) => {
        const bDate = toLocalDateString(b.startAt);
        const st = taskStatuses[b.id] ?? b.bookingStatus;
        const isOngoing = ['ON_THE_WAY', 'ARRIVED', 'IN_SERVICE', 'ASSIGNED', 'TEAM_ACKNOWLEDGED'].includes(st);
        return weekDateSet.has(bDate) || (weekOffset === 0 && isOngoing);
      });
    }
    const isToday = selectedScheduleDateStr === weekInfo.todayStr;
    return bookings.filter((b) => {
      const bDate = toLocalDateString(b.startAt);
      if (isToday) {
        const st = taskStatuses[b.id] ?? b.bookingStatus;
        const isOngoing = ['ON_THE_WAY', 'ARRIVED', 'IN_SERVICE', 'ASSIGNED', 'TEAM_ACKNOWLEDGED'].includes(st);
        return bDate === selectedScheduleDateStr || isOngoing;
      }
      return bDate === selectedScheduleDateStr;
    });
  }, [bookings, viewAllWeekSchedule, weekInfo.days, weekInfo.todayStr, weekOffset, selectedScheduleDateStr, taskStatuses]);

  // Delegated active state
  const hasDelegated = Boolean(
    delegatedData && Object.values(delegatedData.enabled).some(Boolean),
  );

  const selectedBooking = useMemo(() => {
    return (
      bookings.find((b) => b.id === selectedTaskId) ??
      bookings[0] ??
      null
    );
  }, [bookings, selectedTaskId]);

  const currentTaskStatus = selectedBooking
    ? taskStatuses[selectedBooking.id] ?? selectedBooking.bookingStatus
    : '';

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      const currentSt = taskStatuses[b.id] ?? b.bookingStatus;
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' && !['ON_THE_WAY', 'ARRIVED', 'IN_SERVICE'].includes(currentSt)) {
          return false;
        }
        if (statusFilter === 'pending' && !['ASSIGNED', 'TEAM_ACKNOWLEDGED'].includes(currentSt)) {
          return false;
        }
        if (statusFilter === 'quality' && currentSt !== 'QUALITY_REVIEW') {
          return false;
        }
        if (statusFilter === 'completed' && !['SERVICE_COMPLETED', 'DELIVERED', 'CLOSED'].includes(currentSt)) {
          return false;
        }
      }

      if (dayTaskFilter !== 'all') {
        const bDateStr = toLocalDateString(b.startAt);
        if (dayTaskFilter === 'today') {
          if (bDateStr !== weekInfo.todayStr) return false;
        } else if (dayTaskFilter === 'tomorrow') {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          if (bDateStr !== toLocalDateString(tomorrow)) return false;
        } else if (dayTaskFilter === 'week') {
          const weekDateSet = new Set(weekInfo.days.map((d) => d.dateStr));
          if (!weekDateSet.has(bDateStr)) return false;
        } else if (bDateStr !== dayTaskFilter) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const bNum = b.bookingNumber.toLowerCase();
        const cust = b.customer.user.fullName.toLowerCase();
        const plate = (b.vehicle.plateNumber ?? '').toLowerCase();
        const make = b.vehicle.make.toLowerCase();
        const service = b.service.nameAr.toLowerCase();
        if (
          !bNum.includes(q) &&
          !cust.includes(q) &&
          !plate.includes(q) &&
          !make.includes(q) &&
          !service.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [bookings, taskStatuses, statusFilter, dayTaskFilter, searchQuery, weekInfo]);

  const nextAvailableStep = useMemo(() => {
    return WORKFLOW_STEPS.find((step) =>
      step.fromStatuses.includes(currentTaskStatus as WorkflowStatus)
    ) ?? null;
  }, [currentTaskStatus]);

  const hasMaterialBlocker = Boolean(
    selectedBooking?.requiredMaterials.some((m) => m.required && !m.ready),
  );

  function isChecklistStageComplete(stage: string) {
    if (!selectedBooking) return false;
    const requiredItems = selectedBooking.service.checklistTemplates
      .filter((template) => template.stage === stage)
      .flatMap((template) => template.items)
      .filter((item) => item.required);
    if (requiredItems.length === 0) return true;
    return requiredItems.every((item) => {
      const key = `${selectedBooking.id}:${item.id}`;
      return Boolean(checkedItems[key] && (!item.requiresNote || checklistNotes[key]?.trim()));
    });
  }

  const hasStartChecklistBlocker = !isChecklistStageComplete('TEAM_PREPARATION')
    || !isChecklistStageComplete('ARRIVAL_INSPECTION');
  const hasQualityChecklistBlocker = EXECUTION_CHECKLIST_STAGE_KEYS.some(
    (stage) => !isChecklistStageComplete(stage),
  );

  function isStatusActionBlocked(targetStatus: WorkflowStatus) {
    if (targetStatus === 'IN_SERVICE') return hasMaterialBlocker || hasStartChecklistBlocker;
    if (targetStatus === 'QUALITY_REVIEW') return hasQualityChecklistBlocker;
    return false;
  }

  const sectionNav: Array<{
    id: StaffSection;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
    hidden?: boolean;
  }> = [
    { id: 'overview', label: 'الرئيسية ونبض الميدان', icon: LayoutDashboard },
    {
      id: 'tasks',
      label: 'مهام التنفيذ الميدانية',
      icon: CalendarDays,
      badge: metrics.inProgress + metrics.pendingAcknowledgment,
    },
    {
      id: 'materials',
      label: 'المواد والعهدة الميدانية',
      icon: Boxes,
      badge: myCustodyStocks.length,
    },
    {
      id: 'incidents',
      label: 'بلاغات وطوارئ الموقع',
      icon: AlertTriangle,
      badge: selectedBooking?.notes.length ?? 0,
    },
    {
      id: 'delegated',
      label: 'العمليات المفوّضة',
      icon: ShieldCheck,
      badge: metrics.delegatedTasksCount,
      hidden: !hasDelegated,
    },
    {
      id: 'history',
      label: 'سجل الإنجاز والتقييم',
      icon: History,
      badge: metrics.completedToday,
    },
  ];

  // Actions
  function handleStatusChange(targetStatus: WorkflowStatus, bookingId = selectedBooking?.id) {
    if (!bookingId) return;
    if (targetStatus === 'IN_SERVICE' && (hasMaterialBlocker || hasStartChecklistBlocker)) {
      setFeedback({
        kind: 'error',
        message: hasMaterialBlocker
          ? 'لا يمكن بدء الخدمة قبل توفير المواد المطلوبة لهذه المهمة.'
          : 'أكمل قوائم الاستلام والوصول التي أعدّها المالك قبل بدء الخدمة.',
      });
      return;
    }
    if (targetStatus === 'QUALITY_REVIEW' && hasQualityChecklistBlocker) {
      setFeedback({ kind: 'error', message: 'أكمل كل قوائم الـChecklist التي أعدّها المالك قبل إرسال الحجز للجودة.' });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('bookingId', bookingId);
      formData.set('targetStatus', targetStatus);
      const result =
        targetStatus === 'DELIVERED'
          ? await advancePostServiceAction(formData)
          : await updateTechnicianTaskStatusAction(formData);

      if (result.error) {
        setFeedback({ kind: 'error', message: result.error });
      } else {
        setFeedback({ kind: 'success', message: 'تم تحديث مرحلة الحجز وتوثيقها بالسجل بنجاح.' });
        setTaskStatuses((curr) => ({ ...curr, [bookingId]: targetStatus }));
        router.refresh();
      }
    });
  }

  function handleToggleChecklist(item: ChecklistItemDto, stage: string) {
    if (!selectedBooking) return;
    if (item.requiresNote) {
      setActiveChecklistEvidence({ item, stage, bookingId: selectedBooking.id });
      setChecklistNote('');
      return;
    }

    const key = `${selectedBooking.id}:${item.id}`;
    const nextValue = !checkedItems[key];
    setCheckedItems((curr) => ({ ...curr, [key]: nextValue }));

    (async () => {
      try {
        const formData = new FormData();
        formData.set('bookingId', selectedBooking.id);
        formData.set('itemId', item.id);
        formData.set('isChecked', String(nextValue));
        const result = await toggleChecklistItemAction(formData);
        if (result.error) {
          setCheckedItems((curr) => ({ ...curr, [key]: !nextValue }));
          setFeedback({ kind: 'error', message: result.error });
        } else {
          if (!nextValue) setChecklistNotes((curr) => ({ ...curr, [key]: '' }));
        }
      } catch {
        setCheckedItems((curr) => ({ ...curr, [key]: !nextValue }));
        setFeedback({ kind: 'error', message: 'تعذر حفظ حالة عنصر الفحص.' });
      }
    })();
  }

  function handleSubmitChecklistNote() {
    if (!activeChecklistEvidence || !selectedBooking) return;
    const { item, bookingId } = activeChecklistEvidence;
    if (item.requiresNote && checklistNote.trim().length < 3) {
      setFeedback({ kind: 'error', message: 'اكتب ملاحظة فحص واضحة من 3 أحرف على الأقل.' });
      return;
    }
    const key = `${bookingId}:${item.id}`;
    const noteText = checklistNote.trim();
    setCheckedItems((curr) => ({ ...curr, [key]: true }));
    if (noteText) {
      setChecklistNotes((curr) => ({ ...curr, [key]: noteText }));
    }
    setActiveChecklistEvidence(null);
    setChecklistNote('');

    (async () => {
      try {
        const formData = new FormData();
        formData.set('bookingId', bookingId);
        formData.set('itemId', item.id);
        formData.set('isChecked', 'true');
        if (noteText) formData.set('note', noteText);
        const result = await toggleChecklistItemAction(formData);
        if (result.error) {
          setCheckedItems((curr) => ({ ...curr, [key]: false }));
          setChecklistNotes((curr) => ({ ...curr, [key]: '' }));
          setFeedback({ kind: 'error', message: result.error });
        }
      } catch {
        setCheckedItems((curr) => ({ ...curr, [key]: false }));
        setChecklistNotes((curr) => ({ ...curr, [key]: '' }));
        setFeedback({ kind: 'error', message: 'تعذر حفظ الملاحظة وعنصر الفحص.' });
      }
    })();
  }

  function handleSendNote() {
    if (!activeNoteModal || noteInputText.trim().length < 3) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set('bookingId', activeNoteModal.bookingId);
      formData.set('noteType', activeNoteModal.type);
      formData.set('text', noteInputText.trim());
      const result = await recordTechnicianNoteAction(formData);
      if (result.error) {
        setFeedback({ kind: 'error', message: result.error });
      } else {
        setFeedback({ kind: 'success', message: 'تم إرسال البلاغ لغرفة العمليات وتوثيقه بنجاح.' });
        setActiveNoteModal(null);
        setNoteInputText('');
        router.refresh();
      }
    });
  }

  // Render Section Content
  let sectionContent: ReactNode = null;

  switch (currentSection) {
    // -----------------------------------------------------------------------
    // SECTION 1: OVERVIEW (نبض الميدان والرئيسية)
    // -----------------------------------------------------------------------
    case 'overview':
      sectionContent = (
        <div className="space-y-8">
          <SectionHeader
            eyebrow="FIELD COMMAND CENTER"
            title="مركز قيادة موظف التنفيذ الميداني"
            description="متابعة وإدارة المهام الميدانية، مراحل التنفيذ اللحظية، جاهزية المواد، وبلاغات العمليات."
            action={
              <Link
                href="/staff?section=tasks"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#e5c45a] to-[#d4af37] px-4 py-2.5 text-xs font-black text-neutral-950 shadow-md shadow-[#d4af37]/20 hover:brightness-110 transition-all"
              >
                <Wrench className="size-4" aria-hidden="true" />
                <span>شاشة التنفيذ الميداني الكاملة</span>
              </Link>
            }
          />

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard
              label="مهام اليوم المسندة"
              value={formatNumber(metrics.todayTasks)}
              hint="إجمالي الوردية اليوم"
              icon={<Calendar className="size-5" />}
              tone="gold"
            />
            <MetricCard
              label="قيد التنفيذ والميدان"
              value={formatNumber(metrics.inProgress)}
              hint="في الطريق / وصل / قيد التنفيذ"
              icon={<Car className="size-5" />}
              tone="blue"
            />
            <MetricCard
              label="بانتظار تأكيد الاستلام"
              value={formatNumber(metrics.pendingAcknowledgment)}
              hint="تتطلب تأكيد الاستلام"
              icon={<Clock className="size-5" />}
              tone="gold"
            />
            <MetricCard
              label="مكتملة ومسلّمة"
              value={formatNumber(metrics.completedToday)}
              hint="تم تسليمها واعتمادها"
              icon={<CheckCircle2 className="size-5" />}
              tone="green"
            />
            <MetricCard
              label="جاهزية المواد"
              value={`${metrics.materialsReadinessRate}%`}
              hint="كفاية مخزون المهمات"
              icon={<PackageCheck className="size-5" />}
              tone={metrics.materialsReadinessRate >= 100 ? 'green' : 'gold'}
            />
            <MetricCard
              label="أصناف عهدتي"
              value={formatNumber(metrics.custodyItemsCount)}
              hint="مواد بعهدتك الشخصية"
              icon={<Boxes className="size-5" />}
              tone="blue"
            />
          </div>




          {/* Weekly & Daily Tasks Timeline */}
          <div className="space-y-5 rounded-3xl border border-neutral-800/80 bg-[#111114]/90 p-5 sm:p-6 shadow-xl backdrop-blur-md">
            {/* Header & Week Navigation Controls */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-800/80 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-5 text-[#d4af37]" />
                  <h3 className="text-base sm:text-lg font-black text-white">
                    الجدول والمسار الأسبوعي للمهام
                  </h3>
                </div>
                <p className="mt-1 text-xs text-neutral-400">
                  اختر اليوم من شريط الأسبوع لعرض المهام المسندة لك ولفريقك بالتفصيل
                </p>
              </div>

                  <div className="flex flex-wrap items-center gap-2">
                {/* Week Navigator */}
                <div className="inline-flex items-center rounded-xl border border-neutral-800 bg-neutral-950 p-1">
                  <button
                    type="button"
                    onClick={() => setWeekOffset((prev) => prev - 1)}
                    className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
                    title="الأسبوع السابق"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                  <span className="px-2 text-xs font-bold text-neutral-200">
                    {weekOffset === 0 ? 'الأسبوع الحالي' : weekOffset > 0 ? `بعد ${weekOffset} أسبوع` : `قبل ${Math.abs(weekOffset)} أسبوع`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setWeekOffset((prev) => prev + 1)}
                    className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
                    title="الأسبوع القادم"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                </div>

                {/* Jump to Today Button */}
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(0);
                    setSelectedScheduleDateStr(weekInfo.todayStr);
                    setViewAllWeekSchedule(false);
                  }}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                    selectedScheduleDateStr === weekInfo.todayStr && !viewAllWeekSchedule && weekOffset === 0
                      ? 'bg-[#d4af37] text-neutral-950 shadow-md shadow-[#d4af37]/20 font-black'
                      : 'border border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:bg-neutral-800 hover:text-white'
                  }`}
                >
                  اليوم
                </button>

                {/* View All Week Toggle */}
                <button
                  type="button"
                  onClick={() => setViewAllWeekSchedule((prev) => !prev)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                    viewAllWeekSchedule
                      ? 'bg-[#d4af37] text-neutral-950 shadow-md shadow-[#d4af37]/20 font-black'
                      : 'border border-neutral-800 bg-neutral-900/80 text-neutral-300 hover:bg-neutral-800 hover:text-white'
                  }`}
                >
                  عرض كامل الأسبوع
                </button>
              </div>
            </div>

            {/* 7-Day Interactive Week Selector Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {weekInfo.days.map((day) => {
                const isSelected = !viewAllWeekSchedule && selectedScheduleDateStr === day.dateStr;
                const hasTasks = day.tasksCount > 0;

                return (
                  <button
                    key={day.dateStr}
                    type="button"
                    onClick={() => {
                      setSelectedScheduleDateStr(day.dateStr);
                      setViewAllWeekSchedule(false);
                    }}
                    className={`group relative flex flex-col items-center justify-between rounded-2xl p-3 text-center transition-all duration-200 ${
                      isSelected
                        ? 'border-2 border-[#d4af37] bg-gradient-to-b from-[#d4af37]/20 via-[#d4af37]/10 to-transparent shadow-lg shadow-[#d4af37]/10'
                        : 'border border-neutral-800/80 bg-neutral-950/60 hover:border-neutral-700 hover:bg-neutral-900/60'
                    }`}
                  >
                    {/* Today Indicator */}
                    {day.isToday && (
                      <span className="absolute -top-2 rounded-full border border-emerald-500/40 bg-emerald-500 px-2 py-0.5 text-[9px] font-black text-neutral-950 shadow-sm">
                        اليوم
                      </span>
                    )}

                    <span className={`text-xs font-bold ${isSelected ? 'text-[#edce8b]' : 'text-neutral-400 group-hover:text-neutral-200'}`}>
                      {day.dayName}
                    </span>

                    <div className="my-1.5 flex items-baseline gap-1">
                      <span className={`text-lg font-black tracking-tight ${isSelected ? 'text-white' : 'text-neutral-300'}`}>
                        {day.dayNumber}
                      </span>
                      <span className="text-[10px] text-neutral-500 font-medium">{day.monthName.slice(0, 4)}</span>
                    </div>

                    {/* Task count badge */}
                    <div className="mt-1">
                      {hasTasks ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isSelected
                            ? 'bg-[#d4af37] text-neutral-950 font-black'
                            : 'bg-[#d4af37]/15 text-[#edce8b] border border-[#d4af37]/30'
                        }`}>
                          <span className="size-1.5 rounded-full bg-current" />
                          <span>{day.tasksCount} {day.tasksCount === 1 ? 'مهمة' : day.tasksCount === 2 ? 'مهمتان' : 'مهام'}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-neutral-600 font-medium">
                          لا مهام
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Selection Summary Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-neutral-800/60 bg-neutral-950/40 p-3.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#d4af37]" />
                <span className="font-bold text-white">
                  {viewAllWeekSchedule
                    ? `مهام الأسبوع بالكامل (${weekInfo.weekRangeLabel})`
                    : `مهام يوم ${selectedDayInfo?.fullFormatted ?? selectedScheduleDateStr}`}
                </span>
                <span className="rounded-md bg-neutral-900 px-2 py-0.5 font-mono font-bold text-[#edce8b] border border-neutral-800">
                  {displayedScheduleBookings.length} مسندة
                </span>
              </div>

              {displayedScheduleBookings.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  {displayedScheduleBookings.filter(b => ['ON_THE_WAY', 'ARRIVED', 'IN_SERVICE'].includes(taskStatuses[b.id] ?? b.bookingStatus)).length > 0 && (
                    <span className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 font-bold text-amber-300">
                      ⚡ {displayedScheduleBookings.filter(b => ['ON_THE_WAY', 'ARRIVED', 'IN_SERVICE'].includes(taskStatuses[b.id] ?? b.bookingStatus)).length} قيد التنفيذ
                    </span>
                  )}
                  {displayedScheduleBookings.filter(b => ['ASSIGNED', 'TEAM_ACKNOWLEDGED', 'CONFIRMED', 'ACCEPTED'].includes(taskStatuses[b.id] ?? b.bookingStatus)).length > 0 && (
                    <span className="rounded-lg bg-sky-500/10 border border-sky-500/25 px-2 py-0.5 font-bold text-sky-300">
                      ⏳ {displayedScheduleBookings.filter(b => ['ASSIGNED', 'TEAM_ACKNOWLEDGED', 'CONFIRMED', 'ACCEPTED'].includes(taskStatuses[b.id] ?? b.bookingStatus)).length} بانتظار البدء
                    </span>
                  )}
                  {displayedScheduleBookings.filter(b => ['DELIVERED', 'SERVICE_COMPLETED', 'CLOSED'].includes(taskStatuses[b.id] ?? b.bookingStatus)).length > 0 && (
                    <span className="rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 font-bold text-emerald-300">
                      ✅ {displayedScheduleBookings.filter(b => ['DELIVERED', 'SERVICE_COMPLETED', 'CLOSED'].includes(taskStatuses[b.id] ?? b.bookingStatus)).length} مكتملة
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Tasks List for the Selected Day / All Week */}
            {displayedScheduleBookings.length ? (
              <div className="space-y-3">
                {displayedScheduleBookings.map((booking) => {
                  const bStatus = taskStatuses[booking.id] ?? booking.bookingStatus;
                  const isDone = bStatus === 'DELIVERED' || bStatus === 'SERVICE_COMPLETED' || bStatus === 'CLOSED';
                  const isActive = bStatus === 'IN_SERVICE' || bStatus === 'ARRIVED' || bStatus === 'ON_THE_WAY';
                  const addressText = formatAddressSnapshot(booking.addressSnapshot);

                  return (
                    <div
                      key={booking.id}
                      className={`flex flex-col gap-4 rounded-2xl p-4 sm:p-5 transition-all shadow-md ${
                        isActive
                          ? 'border-2 border-[#d4af37] bg-gradient-to-r from-[#d4af37]/15 via-neutral-950/90 to-neutral-950/80 ring-1 ring-[#d4af37]/40 shadow-lg shadow-[#d4af37]/10'
                          : isDone
                          ? 'border border-neutral-800/60 bg-neutral-950/60 opacity-90'
                          : 'border border-neutral-800/80 bg-neutral-950/80 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/5 pb-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span
                            className={`size-3 rounded-full shrink-0 ${
                              isDone
                                ? 'bg-emerald-400 ring-4 ring-emerald-500/20'
                                : isActive
                                ? 'bg-[#d4af37] animate-pulse ring-4 ring-[#d4af37]/25'
                                : 'bg-neutral-600'
                            }`}
                          />
                          <span dir="ltr" className="font-mono text-base font-black text-white">
                            {booking.bookingNumber}
                          </span>
                          <StatusBadge status={bStatus} />
                          {isActive && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[#d4af37]/40 bg-[#d4af37]/15 px-2.5 py-0.5 text-[10px] font-black text-[#f3e4a8]">
                              <span className="size-1.5 rounded-full bg-[#d4af37] animate-ping" />
                              قيد التنفيذ الآن
                            </span>
                          )}
                          <span className="text-xs font-mono font-bold text-[#edce8b] bg-black/50 px-2.5 py-1 rounded-lg border border-neutral-800">
                            ⏰ {formatTimeOnly(booking.startAt)}
                          </span>
                          {viewAllWeekSchedule && (
                            <span className="text-[11px] font-bold text-neutral-400">
                              ({toLocalDateString(booking.startAt)})
                            </span>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center gap-2">
                          {booking.customer.user.phone && (
                            <a
                              href={phoneHref(booking.customer.user.phone)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-500/20 transition-all"
                            >
                              <Phone className="size-3.5 text-sky-400" />
                              <span>اتصال</span>
                            </a>
                          )}
                          {booking.customer.user.phone && (
                            <a
                              href={whatsappHref(
                                booking.customer.user.whatsapp ?? booking.customer.user.phone,
                                `مرحبًا ${booking.customer.user.fullName}، نتواصل معك من فريق بريق للعناية بالسيارات بخصوص حجزك رقم ${booking.bookingNumber}`,
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20 transition-all"
                            >
                              <MessageSquare className="size-3.5 text-emerald-400" />
                              <span>واتساب</span>
                            </a>
                          )}
                          {booking.locationUrl && (
                            <a
                              href={booking.locationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-1.5 text-xs font-bold text-[#f3e4a8] hover:bg-[#d4af37]/20 transition-all"
                            >
                              <Navigation className="size-3.5 text-[#d4af37]" />
                              <span>الخرائط</span>
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTaskId(booking.id);
                              router.push(`/staff?section=tasks&taskId=${booking.id}`);
                            }}
                            className={`inline-flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-black transition-all shadow-sm ${
                              isActive
                                ? 'bg-gradient-to-r from-[#d4af37] via-[#e5c45a] to-[#d4af37] text-neutral-950 hover:brightness-110'
                                : 'border border-[#d4af37]/40 bg-[#d4af37]/10 text-[#e5c45a] hover:bg-[#d4af37]/20 hover:text-white'
                            }`}
                          >
                            <span>الانتقال لشاشة التنفيذ</span>
                            <Wrench className="size-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Card Details Grid */}
                      <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3 rounded-xl bg-black/30 border border-white/5 p-3.5">
                        <div>
                          <span className="text-neutral-500 text-[11px] font-medium block">العميل والخدمة</span>
                          <p className="mt-1 font-bold text-white text-sm">
                            {booking.customer.user.fullName}
                          </p>
                          <p className="text-xs text-[#edce8b] font-semibold mt-0.5">
                            {booking.service.nameAr}
                          </p>
                        </div>

                        <div>
                          <span className="text-neutral-500 text-[11px] font-medium block">السيارة</span>
                          <p className="mt-1 font-bold text-white text-sm flex items-center gap-1.5">
                            <Car className="size-4 text-[#d4af37]" />
                            {booking.vehicle.make} {booking.vehicle.model}
                          </p>
                          <p className="text-[11px] text-amber-200 font-mono mt-0.5">
                            {booking.vehicle.plateNumber ?? 'بدون لوحة'} · {booking.vehicle.color}
                          </p>
                        </div>

                        <div>
                          <span className="text-neutral-500 text-[11px] font-medium block">الموقع والعنوان</span>
                          <p className="mt-1 font-medium text-neutral-200 text-xs line-clamp-2 leading-relaxed flex items-start gap-1">
                            <MapPin className="size-3.5 text-neutral-500 shrink-0 mt-0.5" />
                            <span>{addressText || 'موقع محدد بالخريطة'}</span>
                          </p>
                        </div>
                      </div>

                      {/* Gate instructions if present */}
                      {booking.gateInstructions && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200 flex items-start gap-2">
                          <AlertTriangle className="size-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold text-amber-300">تعليمات البوابة: </strong>
                            <span>{booking.gateInstructions}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-800/80 bg-black/40 p-8 text-center">
                <div className="mx-auto size-12 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500 mb-3">
                  <CalendarDays className="size-6 text-[#d4af37]/60" />
                </div>
                <h4 className="text-sm font-bold text-white">
                  لا توجد مهام مسندة لفريقك في يوم {selectedDayInfo?.fullFormatted ?? selectedScheduleDateStr}
                </h4>
                <p className="mt-1 text-xs text-neutral-400 max-w-sm mx-auto">
                  لم يتم إسناد أي حجوزات تشغيلية لهذا اليوم. يمكنك اختيار يوم آخر من شريط الأسبوع أعلاه لمتابعة المهام القادمة.
                </p>
                {!selectedDayInfo?.isToday && (
                  <button
                    type="button"
                    onClick={() => {
                      setWeekOffset(0);
                      setSelectedScheduleDateStr(weekInfo.todayStr);
                      setViewAllWeekSchedule(false);
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-1.5 text-xs font-bold text-[#e5c45a] hover:bg-[#d4af37]/20 transition-all"
                  >
                    <span>الانتقال لمهام اليوم</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      );
      break;

    // -----------------------------------------------------------------------
    // SECTION 2: TASKS & EXECUTION WORKSTATION (شاشة التنفيذ الميداني)
    // -----------------------------------------------------------------------
    case 'tasks':
      sectionContent = (
        <div className="space-y-6">
          <SectionHeader
            eyebrow="TASK EXECUTION WORKSTATION"
            title="محطة التنفيذ والتحكم الميداني"
            description="تنفيذ مراحل الخدمة خطوة بخطوة، توثيق التشيك ليست والصور، وإدارة المسار الميداني."
          />

          {/* Search & Filter Bar */}
          <div className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 p-4 shadow-lg space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث برقم الحجز، اسم العميل، اللوحة..."
                  className="w-full rounded-xl border border-neutral-700 bg-[#080808] pr-10 pl-3 py-2 text-xs text-white placeholder:text-neutral-500 outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                />
              </div>

              {/* Status Tabs */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: 'all', label: 'الكل' },
                  { key: 'pending', label: 'بانتظار الاستلام' },
                  { key: 'active', label: 'قيد التنفيذ والموقع' },
                  { key: 'quality', label: 'مراجعة الجودة' },
                  { key: 'completed', label: 'المكتملة' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                      statusFilter === tab.key
                        ? 'border border-[#d4af37] bg-[#d4af37]/15 text-[#f0d36d]'
                        : 'border border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Day Filter Bar */}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-neutral-800/60 pt-3">
              <span className="text-xs font-bold text-neutral-400 ml-1">تصفية الموعد:</span>
              {[
                { key: 'all', label: 'كافة الأيام' },
                { key: 'today', label: `اليوم (${weekInfo.days.find((d) => d.isToday)?.tasksCount ?? 0})` },
                { key: 'tomorrow', label: 'غداً' },
                { key: 'week', label: 'الأسبوع الحالي' },
              ].map((dTab) => (
                <button
                  key={dTab.key}
                  type="button"
                  onClick={() => setDayTaskFilter(dTab.key)}
                  className={`rounded-xl px-2.5 py-1 text-xs font-bold transition-all ${
                    dayTaskFilter === dTab.key
                      ? 'bg-[#d4af37] text-neutral-950 font-black shadow-sm'
                      : 'border border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:text-white'
                  }`}
                >
                  {dTab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Main Grid: Task Selector List (Right/Top) & Workstation (Left/Main) */}
          <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
            {/* Task List Selector */}
            <aside className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                  قائمة المهام الميدانية ({filteredBookings.length})
                </h3>
              </div>

              {filteredBookings.length ? (
                <div className="space-y-2.5 max-h-[750px] overflow-y-auto pr-0.5">
                  {filteredBookings.map((b) => {
                    const isSelected = selectedBooking?.id === b.id;
                    const bSt = taskStatuses[b.id] ?? b.bookingStatus;
                    const isDone = bSt === 'DELIVERED' || bSt === 'SERVICE_COMPLETED';
                    const isActive = ['ON_THE_WAY', 'ARRIVED', 'IN_SERVICE'].includes(bSt);

                    return (
                      <article
                        key={b.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedTaskId(b.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedTaskId(b.id);
                          }
                        }}
                        className={`cursor-pointer rounded-2xl border p-4 text-right transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] ${
                          isSelected
                            ? 'border-[#d4af37] bg-gradient-to-br from-[#1c1a12] via-[#141418] to-[#111114] shadow-lg shadow-[#d4af37]/10 ring-1 ring-[#d4af37]/40'
                            : 'border-neutral-800/80 bg-[#111114]/90 hover:border-neutral-700 hover:bg-[#151518]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`size-2 rounded-full shrink-0 ${
                                isDone
                                  ? 'bg-emerald-400'
                                  : isActive
                                  ? 'bg-[#d4af37] animate-pulse'
                                  : 'bg-neutral-500'
                              }`}
                            />
                            <p
                              dir="ltr"
                              className={`font-mono text-sm font-black ${
                                isSelected ? 'text-white' : 'text-neutral-200'
                              }`}
                            >
                              {b.bookingNumber}
                            </p>
                          </div>
                          <StatusBadge status={bSt} />
                        </div>

                        <p className="mt-2 text-xs font-bold text-neutral-300 truncate">
                          {b.customer.user.fullName} ·{' '}
                          <span className="text-neutral-400">{b.service.nameAr}</span>
                        </p>

                        <div className="mt-2.5 flex items-center justify-between border-t border-neutral-800/60 pt-2 text-[11px] text-neutral-400">
                          <span className="flex items-center gap-1">
                            <Car className="size-3 text-neutral-500" />
                            {b.vehicle.make} {b.vehicle.model}
                          </span>
                          <span className="font-mono text-neutral-300">
                            {formatTimeOnly(b.startAt)}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-neutral-800 bg-black/40 p-6 text-center text-xs text-neutral-500">
                  لا توجد نتائج تطابق البحث أو الفلتر.
                </div>
              )}
            </aside>

            {/* Active Task Workstation */}
            {selectedBooking ? (
              <main className="space-y-6">
                {/* Workstation Header Box */}
                <article className="rounded-3xl border border-[#d4af37]/30 bg-[#111114]/95 p-5 sm:p-6 shadow-2xl backdrop-blur-md space-y-5">
                  <header className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                            team?.isLeader
                              ? 'border border-[#d4af37]/50 bg-[#d4af37]/15 text-[#f3e4a8]'
                              : 'border border-neutral-700 bg-neutral-800 text-neutral-300'
                          }`}
                        >
                          {team?.isLeader ? 'قائد الفريق المسؤول' : 'فني تنفيذ'}
                        </span>
                        {team?.name && (
                          <span className="text-xs font-bold text-neutral-400">
                            فريق {team.name}
                          </span>
                        )}
                        {selectedBooking.assignedEmployee && (
                          <span className="text-xs font-bold text-amber-200">
                            الفني المخصص: {selectedBooking.assignedEmployee.fullName}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex items-center gap-3">
                        <h2
                          dir="ltr"
                          className="font-mono text-2xl sm:text-3xl font-black text-white tracking-wider"
                        >
                          {selectedBooking.bookingNumber}
                        </h2>
                        <span className="text-base font-bold text-[#f3e4a8]">
                          · {selectedBooking.service.nameAr}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                      <StatusBadge status={currentTaskStatus} />
                      {selectedBooking.operationalVehicle || team?.operationalVehicles[0] ? (
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-300 bg-black/40 border border-white/5 rounded-xl px-3 py-1.5">
                          <Car className="size-3.5 text-[#d4af37]" />
                          سيارة التشغيل:{' '}
                          <strong className="text-white font-mono">
                            {selectedBooking.operationalVehicle?.code ??
                              team?.operationalVehicles[0]?.code}
                          </strong>
                        </span>
                      ) : null}
                    </div>
                  </header>

                  {/* Fast Field Actions: Call, WhatsApp, Maps, Report Problem */}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <a
                      href={phoneHref(selectedBooking.customer.user.phone)}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-2 text-xs font-black text-sky-200 hover:bg-sky-500/20 active:scale-[0.98] transition-all"
                    >
                      <Phone className="size-4 text-sky-400" />
                      <span>اتصال بالعميل</span>
                    </a>
                    <a
                      href={whatsappHref(
                        selectedBooking.customer.user.whatsapp ??
                          selectedBooking.customer.user.phone,
                        `مرحبًا ${selectedBooking.customer.user.fullName}، نتواصل معك من فريق بريق للعناية بالسيارات بخصوص حجزك رقم ${selectedBooking.bookingNumber}`,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs font-black text-emerald-200 hover:bg-emerald-500/20 active:scale-[0.98] transition-all"
                    >
                      <MessageSquare className="size-4 text-emerald-400" />
                      <span>محادثة واتساب</span>
                    </a>
                    {sanitizeLocationUrl(selectedBooking.locationUrl) ? (
                      <a
                        href={sanitizeLocationUrl(selectedBooking.locationUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 p-2 text-xs font-black text-[#f3e4a8] hover:bg-[#d4af37]/20 active:scale-[0.98] transition-all"
                      >
                        <Navigation className="size-4 text-[#d4af37]" />
                        <span>تشغيل الخرائط</span>
                      </a>
                    ) : (
                      <div className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-2 text-xs font-bold text-neutral-500 cursor-not-allowed">
                        <MapPin className="size-4" />
                        <span>لا يوجد رابط موقع</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setActiveNoteModal({
                          bookingId: selectedBooking.id,
                          bookingNumber: selectedBooking.bookingNumber,
                          type: 'PROBLEM',
                        })
                      }
                      className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-xs font-black text-rose-300 hover:bg-rose-500/20 active:scale-[0.98] transition-all"
                    >
                      <AlertTriangle className="size-4 text-rose-400" />
                      <span>بلاغ طوارئ</span>
                    </button>
                  </div>

                  {/* Feedback Notification Banner */}
                  {feedback && (
                    <div
                      className={`rounded-2xl border p-4 text-xs flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
                        feedback.kind === 'error'
                          ? 'border-rose-500/40 bg-rose-500/15 text-rose-200 shadow-lg shadow-rose-950/40'
                          : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 shadow-lg shadow-emerald-950/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {feedback.kind === 'error' ? (
                          <AlertTriangle className="size-4 text-rose-400 shrink-0" />
                        ) : (
                          <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                        )}
                        <span className="font-bold">{feedback.message}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFeedback(null)}
                        aria-label="إغلاق رسالة الحالة"
                        className="rounded-lg p-1 text-neutral-400 hover:bg-white/10 hover:text-white transition-colors shrink-0"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  )}

                  {/* Workflow stepper timeline */}
                  <section className="rounded-2xl border border-white/[0.08] bg-black/40 p-4 sm:p-5 space-y-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <h3 className="flex items-center gap-2 text-xs font-black text-[#f3e4a8]">
                        <Sparkles className="size-4 text-[#d4af37]" />
                        مسار تنفيذ الخدمة الميداني
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold text-neutral-400">
                          المرحلة الحالية: {bookingStatusLabels[currentTaskStatus] ?? currentTaskStatus}
                        </span>
                        {REVERT_MAP[currentTaskStatus as WorkflowStatus] && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              const rev = REVERT_MAP[currentTaskStatus as WorkflowStatus];
                              if (rev) handleStatusChange(rev.to);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-black text-amber-300 hover:bg-amber-500/20 active:scale-[0.98] transition-all"
                            title="الرجوع خطوة للخلف في حال تم الضغط بالخطأ"
                          >
                            <RotateCcw className="size-3.5 text-amber-400 shrink-0" />
                            <span>تراجع للمرحلة السابقة ({REVERT_MAP[currentTaskStatus as WorkflowStatus]?.label})</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Workflow stepper timeline */}
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {WORKFLOW_STEPS.map((step) => {
                        const activeStepIndex = WORKFLOW_STEPS.findIndex((s) =>
                          s.fromStatuses.includes(currentTaskStatus as WorkflowStatus)
                        );
                        const isCurrent = step.fromStatuses.includes(
                          currentTaskStatus as WorkflowStatus
                        );
                        const isCompleted =
                          (['DELIVERED', 'CLOSED'].includes(currentTaskStatus)) ||
                          (activeStepIndex > -1 && step.stepNumber <= activeStepIndex);

                        const targetStatus = getTargetStatusForStep(step);
                        const blocked = isStatusActionBlocked(targetStatus);

                        return (
                          <button
                            key={step.stepNumber}
                            data-testid={`workflow-${targetStatus}`}
                            type="button"
                            disabled={!isCurrent || isPending || blocked}
                            onClick={() =>
                              handleStatusChange(targetStatus)
                            }
                            className={`group relative flex items-start gap-3 rounded-xl border p-3 text-right transition-all active:scale-[0.98] ${
                              isCurrent && !blocked
                                ? 'border-[#d4af37] bg-gradient-to-r from-[#d4af37]/20 via-neutral-900 to-[#d4af37]/10 shadow-lg shadow-[#d4af37]/15 ring-2 ring-[#d4af37]/30 cursor-pointer'
                                : isCurrent && blocked
                                ? 'border-amber-500/30 bg-amber-500/[0.04] text-amber-200 opacity-80 cursor-not-allowed'
                                : isCompleted
                                ? 'border-emerald-500/20 bg-emerald-500/[0.04] text-neutral-300'
                                : 'border-white/5 bg-neutral-950/40 text-neutral-500 opacity-60 cursor-not-allowed'
                            }`}
                          >
                            <span
                              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-black mt-0.5 ${
                                isCompleted
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : isCurrent && !blocked
                                  ? 'bg-[#d4af37] text-neutral-950 font-black shadow-md'
                                  : isCurrent && blocked
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                              }`}
                            >
                              {isCompleted ? <Check className="size-3.5" /> : step.stepNumber}
                            </span>

                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-xs font-black ${
                                  isCurrent && !blocked
                                    ? 'text-[#f3e4a8]'
                                    : isCurrent && blocked
                                    ? 'text-amber-200'
                                    : isCompleted
                                    ? 'text-neutral-200'
                                    : 'text-neutral-400'
                                }`}
                              >
                                {step.label}
                              </p>
                              <p className="mt-0.5 text-[10px] text-neutral-400 leading-4">
                                {step.helper}
                              </p>
                            </div>

                            {isCurrent && !blocked && (
                              <span className="size-2 rounded-full bg-[#d4af37] animate-ping shrink-0 self-center" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>


                  {/* Customer, Vehicle, and Location Info */}
                  <div className="grid gap-3 sm:grid-cols-2 text-xs">
                    <div className="rounded-2xl border border-white/5 bg-black/40 p-4 space-y-2">
                      <span className="text-[10px] font-bold text-neutral-400 flex items-center gap-1.5">
                        <User className="size-3.5 text-[#d4af37]" />
                        بيانات العميل
                      </span>
                      <p className="text-sm font-black text-white">
                        {selectedBooking.customer.user.fullName}
                      </p>
                      <p className="font-mono text-neutral-300" dir="ltr">
                        {selectedBooking.customer.user.phone}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/5 bg-black/40 p-4 space-y-2">
                      <span className="text-[10px] font-bold text-neutral-400 flex items-center gap-1.5">
                        <Car className="size-3.5 text-[#d4af37]" />
                        بيانات السيارة
                      </span>
                      <p className="text-sm font-black text-white">
                        {selectedBooking.vehicle.make} {selectedBooking.vehicle.model} ·{' '}
                        {selectedBooking.vehicle.color}
                      </p>
                      <p className="font-mono font-bold text-amber-200">
                        لوحة: {selectedBooking.vehicle.plateNumber ?? 'بدون لوحة'}
                      </p>
                    </div>
                  </div>

                  {/* Detailed Address & Gate Instructions */}
                  <div className="rounded-2xl border border-white/5 bg-black/40 p-4 space-y-2 text-xs">
                    <span className="text-[10px] font-bold text-[#f3e4a8] flex items-center gap-1.5">
                      <MapPin className="size-3.5 text-[#d4af37]" />
                      العنوان التفصيلي وموقع العميل
                    </span>
                    <p className="text-neutral-200 leading-relaxed">
                      {formatAddressSnapshot(selectedBooking.addressSnapshot) || 'الموقع محدد بالخريطة'}
                    </p>
                    {selectedBooking.gateInstructions && (
                      <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">
                        <strong className="block font-bold">تعليمات الدخول والبوابة:</strong>
                        <p className="mt-0.5">{selectedBooking.gateInstructions}</p>
                      </div>
                    )}
                  </div>

                  {/* EXECUTION CHECKLISTS ACCORDION */}
                  <section className="rounded-2xl border border-white/[0.08] bg-black/40 p-4 sm:p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-xs font-black text-[#f3e4a8]">
                        <ListChecks className="size-4 text-[#d4af37]" />
                        قوائم مهام المرحلة الحالية ({bookingStatusLabels[currentTaskStatus] ?? currentTaskStatus})
                      </h3>
                    </div>

                    {(() => {
                      const STAGE_CHECKLIST_MAPPING: Record<string, string[]> = {
                        ASSIGNED: ['TEAM_PREPARATION'],
                        TEAM_ACKNOWLEDGED: ['TEAM_PREPARATION'],
                        ON_THE_WAY: ['TEAM_PREPARATION'],
                        ARRIVED: ['ARRIVAL_INSPECTION'],
                        IN_SERVICE: ['SERVICE_EXECUTION', 'CLOSING'],
                        QUALITY_REVIEW: ['QUALITY_REVIEW', 'SERVICE_EXECUTION'],
                        SERVICE_COMPLETED: ['CLOSING'],
                        DELIVERED: ['CLOSING'],
                      };
                      const allowedStages = STAGE_CHECKLIST_MAPPING[currentTaskStatus];
                      const currentPhaseTemplates = selectedBooking.service.checklistTemplates.filter(
                        (template) => !allowedStages || allowedStages.includes(template.stage)
                      );

                      if (!currentPhaseTemplates.length) {
                        return (
                          <div className="rounded-2xl border border-white/5 bg-black/20 p-4 text-center text-xs text-neutral-400">
                            لا توجد مهام فحص إضافية مطلوبة في مرحلة «{bookingStatusLabels[currentTaskStatus] ?? currentTaskStatus}».
                          </div>
                        );
                      }

                      return currentPhaseTemplates.map((template) => {
                        const stageEditable = canEditChecklistStage(
                          template.stage,
                          currentTaskStatus,
                        );

                        return (
                          <fieldset
                            key={template.id}
                            className={`space-y-2.5 rounded-2xl border p-4 transition-all ${
                              stageEditable
                                ? 'border-[#d4af37]/30 bg-[#141418]'
                                : 'border-white/5 bg-black/30 opacity-60'
                            }`}
                          >
                            <legend className="px-2 text-xs font-black text-[#f3e4a8] flex items-center gap-2">
                              <span
                                className={`size-2 rounded-full ${
                                  stageEditable ? 'bg-[#d4af37]' : 'bg-neutral-500'
                                }`}
                              />
                              <span>{template.name}</span>
                            </legend>

                            <div className="space-y-2 pt-1">
                              {template.items
                                .toSorted((a, b) => a.displayOrder - b.displayOrder)
                                .map((item) => {
                                  const key = `${selectedBooking.id}:${item.id}`;
                                  const isChecked = Boolean(checkedItems[key]);

                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      disabled={!stageEditable}
                                      onClick={() => handleToggleChecklist(item, template.stage)}
                                      className={`flex w-full items-start gap-3.5 rounded-xl border p-3 text-right transition-all active:scale-[0.99] ${
                                        isChecked
                                          ? 'border-emerald-500/30 bg-emerald-500/[0.06] text-neutral-200'
                                          : stageEditable
                                          ? 'border-white/10 bg-black/40 hover:border-[#d4af37]/50 text-white'
                                          : 'border-white/5 bg-black/20 text-neutral-500 cursor-not-allowed'
                                      }`}
                                    >
                                      <div className="mt-0.5 shrink-0">
                                        {isChecked ? (
                                          <CheckSquare className="size-5 text-emerald-400" />
                                        ) : (
                                          <Square className="size-5 text-neutral-500" />
                                        )}
                                      </div>

                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                          <p
                                            className={`text-xs font-bold ${
                                              isChecked
                                                ? 'text-neutral-400 line-through'
                                                : 'text-white'
                                            }`}
                                          >
                                            {item.labelAr}
                                          </p>
                                          {item.required && (
                                            <span className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-bold text-rose-300 shrink-0">
                                              إلزامي
                                            </span>
                                          )}
                                        </div>
                                        {item.descriptionAr && (
                                          <p className="mt-1 text-[10px] text-neutral-400">
                                            {item.descriptionAr}
                                          </p>
                                        )}
                                        {item.requiresNote && (
                                          <span className="mt-1 inline-block text-[10px] font-bold text-amber-300">
                                            * يتطلب تسجيل ملاحظة
                                          </span>
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                            </div>
                          </fieldset>
                        );
                      });
                    })()}
                  </section>
                </article>

                {/* Floating Mobile Bottom Action Button */}
                {nextAvailableStep && (
                  <div className="fixed bottom-4 left-4 right-4 z-40 lg:hidden">
                    <div className="rounded-2xl border border-[#d4af37]/40 bg-[#141418]/95 p-2 shadow-2xl backdrop-blur-md">
                      {(() => {
                        const targetStatus = getTargetStatusForStep(nextAvailableStep);
                        const blocked = isStatusActionBlocked(targetStatus);
                        return (
                      <button
                        type="button"
                        disabled={isPending || blocked}
                        onClick={() => handleStatusChange(targetStatus)}
                        className="flex w-full min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#e5c45a] to-[#d4af37] px-4 text-xs font-black text-neutral-950 shadow-lg shadow-[#d4af37]/20 hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                      >
                        <CheckCircle2 className="size-4" />
                        <span>{nextAvailableStep.label}</span>
                      </button>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </main>
            ) : (
              <EmptyState
                title="اختر مهمة من القائمة للبدء في تنفيذها"
                description="ستظهر تفاصيل المهمة ومراحل العمل وأزرار الإجراءات هنا."
              />
            )}
          </div>
        </div>
      );
      break;

    // -----------------------------------------------------------------------
    // SECTION 3: MATERIALS & CUSTODY (المواد والعهدة الميدانية)
    // -----------------------------------------------------------------------
    case 'materials':
      sectionContent = (
        <div className="space-y-8">
          <SectionHeader
            eyebrow="MATERIALS & CUSTODY"
            title="المواد والعهدة الميدانية للفني"
            description="متابعة عهدة المواد الشخصية المتاحة معك، ومصفوفة كفاية المستلزمات لمهام اليوم."
          />

          {/* Personal Custody Cards */}
          <div className="space-y-4 rounded-3xl border border-neutral-800/80 bg-[#111114]/90 p-5 sm:p-6 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-neutral-800/60 pb-4">
              <div className="flex items-center gap-2">
                <Boxes className="size-4 text-[#d4af37]" />
                <h3 className="text-base font-bold text-white">عهدة المواد الشخصية المتاحة معك</h3>
              </div>
              <span className="text-xs font-bold text-neutral-400">
                {myCustodyStocks.length} أصناف
              </span>
            </div>

            {myCustodyStocks.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {myCustodyStocks.map((stock) => (
                  <div
                    key={stock.id}
                    className="rounded-2xl border border-white/5 bg-black/40 p-4 text-right transition hover:border-[#d4af37]/30"
                  >
                    <p className="truncate text-xs font-bold text-neutral-200">
                      {stock.material.nameAr}
                    </p>
                    <p className="mt-2 text-xl font-black tabular-nums text-[#f3e4a8]">
                      {stock.quantityOnHand.toLocaleString('ar-EG', { maximumFractionDigits: 2 })}{' '}
                      <span className="text-xs font-normal text-neutral-400">
                        {stock.material.unit}
                      </span>
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-neutral-500">
                      كود: {stock.material.sku}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs text-neutral-500 py-6">
                لا توجد أصناف عهدة شخصية مسجلة باسمك حالياً.
              </p>
            )}
          </div>

          {/* Today's Tasks Materials Readiness Table */}
          <div className="space-y-4 rounded-3xl border border-neutral-800/80 bg-[#111114]/90 p-5 sm:p-6 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-neutral-800/60 pb-4">
              <div className="flex items-center gap-2">
                <PackageCheck className="size-4 text-[#d4af37]" />
                <h3 className="text-base font-bold text-white">
                  مصفوفة جاهزية مستلزمات مهام اليوم
                </h3>
              </div>
            </div>

            <div className="space-y-3">
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className="rounded-2xl border border-neutral-800/60 bg-black/40 p-4 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-neutral-800/40 pb-2.5">
                    <div>
                      <span dir="ltr" className="font-mono text-xs font-black text-white">
                        {b.bookingNumber}
                      </span>
                      <span className="text-xs text-neutral-400 mr-2">
                        · {b.service.nameAr} ({b.customer.user.fullName})
                      </span>
                    </div>
                    <StatusBadge status={taskStatuses[b.id] ?? b.bookingStatus} />
                  </div>

                  {b.requiredMaterials.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {b.requiredMaterials.map((mat) => {
                        const reqFormatted = formatMaterialQuantityWithUnit(
                          mat.quantityRequired,
                          mat.unit,
                        );
                        const availFormatted = formatMaterialQuantityWithUnit(
                          mat.availableQuantity,
                          mat.unit,
                        );

                        return (
                          <div
                            key={mat.requirementId}
                            className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-xs ${
                              mat.ready
                                ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
                                : mat.required
                                ? 'border-rose-500/30 bg-rose-500/[0.06]'
                                : 'border-amber-500/20 bg-amber-500/[0.04]'
                            }`}
                          >
                            <div>
                              <p className="font-bold text-white">{mat.nameAr}</p>
                              <p className="text-[10px] text-neutral-400">
                                المطلوب: <strong className="text-white">{reqFormatted.primary}</strong> · المتاح:{' '}
                                {availFormatted.primary}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                mat.ready
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : mat.required
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {mat.ready ? '✓ جاهز' : mat.required ? 'نقص مواد' : 'اختياري'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-500">لا تتطلب هذه الخدمة مواد استهلاكية مسجلة.</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
      break;

    // -----------------------------------------------------------------------
    // SECTION 4: FIELD INCIDENTS (بلاغات وطوارئ الموقع)
    // -----------------------------------------------------------------------
    case 'incidents':
      sectionContent = (
        <div className="space-y-8">
          <SectionHeader
            eyebrow="FIELD INCIDENTS & DISPATCH"
            title="بلاغات وطوارئ الموقع وغرفة العمليات"
            description="إرسال بلاغات فورية لإدارة التشغيل عند حدوث مشاكل في الموقع أو طلبات إضافية."
          />

          {/* Incident Dispatch Form */}
          <div className="rounded-3xl border border-neutral-800/80 bg-[#111114]/90 p-5 sm:p-6 shadow-xl backdrop-blur-md space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldAlert className="size-4 text-[#d4af37]" />
              إرسال بلاغ فوري جديد لغرفة العمليات
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                  حدد الحجز المعني بالبلاغ
                </label>
                <select
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="w-full rounded-xl border border-neutral-700 bg-[#080808] px-3 py-2.5 text-xs text-white outline-none focus:border-[#d4af37]"
                >
                  {bookings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bookingNumber} - {b.customer.user.fullName} ({b.service.nameAr})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-300 mb-1.5">
                  نوع البلاغ الميداني
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedBooking) {
                        setActiveNoteModal({
                          bookingId: selectedBooking.id,
                          bookingNumber: selectedBooking.bookingNumber,
                          type: 'PROBLEM',
                        });
                      }
                    }}
                    className="flex items-center justify-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20"
                  >
                    <AlertTriangle className="size-3.5" />
                    <span>مشكلة بالموقع</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedBooking) {
                        setActiveNoteModal({
                          bookingId: selectedBooking.id,
                          bookingNumber: selectedBooking.bookingNumber,
                          type: 'EXTRA_TIME',
                        });
                      }
                    }}
                    className="flex items-center justify-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20"
                  >
                    <Clock className="size-3.5" />
                    <span>وقت إضافي</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedBooking) {
                        setActiveNoteModal({
                          bookingId: selectedBooking.id,
                          bookingNumber: selectedBooking.bookingNumber,
                          type: 'ADDON_REQUEST',
                        });
                      }
                    }}
                    className="flex items-center justify-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
                  >
                    <PlusCircle className="size-3.5" />
                    <span>طلب إضافة</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Today's Notes & Incidents Feed */}
          <div className="space-y-4 rounded-3xl border border-neutral-800/80 bg-[#111114]/90 p-5 sm:p-6 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-neutral-800/60 pb-4">
              <div className="flex items-center gap-2">
                <History className="size-4 text-[#d4af37]" />
                <h3 className="text-base font-bold text-white">سجل البلاغات والملاحظات المسجلة</h3>
              </div>
            </div>

            {bookings.some((b) => b.notes.length > 0) ? (
              <div className="space-y-3">
                {bookings.flatMap((b) =>
                  b.notes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-2xl border border-neutral-800/60 bg-black/40 p-4 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between text-neutral-400">
                        <span className="font-mono font-bold text-white" dir="ltr">
                          {b.bookingNumber} ({b.customer.user.fullName})
                        </span>
                        <span>{formatDateTime(note.createdAt)}</span>
                      </div>
                      <p className="text-neutral-200 leading-relaxed">{note.note}</p>
                      {note.user && (
                        <p className="text-[10px] text-amber-300">
                          بواسطة: {note.user.fullName}
                        </p>
                      )}
                    </div>
                  )),
                )}
              </div>
            ) : (
              <EmptyState
                title="لا توجد بلاغات مسجلة اليوم"
                description="عند تسجيل أي مشكلة أو وقت إضافي، ستظهر السجلات الموثقة هنا مباشرة."
              />
            )}
          </div>
        </div>
      );
      break;

    // -----------------------------------------------------------------------
    // SECTION 5: DELEGATED OPERATIONS (العمليات والمهام المفوّضة)
    // -----------------------------------------------------------------------
    case 'delegated':
      sectionContent = (
        <div className="space-y-8">
          <SectionHeader
            eyebrow="DELEGATED OPERATIONS"
            title="العمليات والمهام المفوّضة إدارياً"
            description="تنفيذ الصلاحيات التشغيلية الممنوحة لك من قبل الإدارة لمراجعة الدفع والجودة والتحصيل."
          />

          {hasDelegated && delegatedData ? (
            <div className="space-y-6">
              {/* Payment Proofs Review */}
              {delegatedData.enabled['payment.review'] && (
                <div className="space-y-4 rounded-3xl border border-neutral-800/80 bg-[#111114]/90 p-5 sm:p-6 shadow-xl backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-neutral-800/60 pb-3">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <BadgeDollarSign className="size-4 text-[#d4af37]" />
                      مراجعة إثباتات الدفع ({delegatedData.pendingProofs.length})
                    </h3>
                  </div>
                  {delegatedData.pendingProofs.length ? (
                    <div className="space-y-3">
                      {delegatedData.pendingProofs.map((proof) => (
                        <div
                          key={proof.id}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-neutral-800/60 bg-black/40 p-4 text-xs"
                        >
                          <div>
                            <p className="font-mono font-bold text-white">
                              {proof.booking.bookingNumber} · {proof.booking.customer.user.fullName}
                            </p>
                            <p className="mt-1 text-neutral-400">
                              المبلغ:{' '}
                              <strong className="text-emerald-300 font-mono">
                                {formatCurrency(proof.amountSubmitted)}
                              </strong>{' '}
                              · الطريقة: {proof.paymentMethod.name}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={proof.proofFileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-bold text-neutral-200 hover:text-white"
                            >
                              <Eye className="size-3.5" />
                              <span>معاينة الإثبات</span>
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-xs text-neutral-500 py-3">لا توجد إثباتات تنتظر المراجعة.</p>
                  )}
                </div>
              )}

              {/* Quality Review */}
              {delegatedData.enabled['quality.review'] && (
                <div className="space-y-4 rounded-3xl border border-neutral-800/80 bg-[#111114]/90 p-5 sm:p-6 shadow-xl backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-neutral-800/60 pb-3">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Sparkles className="size-4 text-[#d4af37]" />
                      مراجعة واعتماد الجودة ({delegatedData.qualityBookings.length})
                    </h3>
                  </div>
                  {delegatedData.qualityBookings.length ? (
                    <div className="space-y-3">
                      {delegatedData.qualityBookings.map((q) => (
                        <div
                          key={q.id}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-neutral-800/60 bg-black/40 p-4 text-xs"
                        >
                          <div>
                            <p className="font-mono font-bold text-white">
                              {q.bookingNumber} · {q.customer.user.fullName}
                            </p>
                            <p className="mt-1 text-neutral-400">{q.service.nameAr} · {q.branch.nameAr}</p>
                          </div>
                          <Link
                            href="/staff/delegated"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 px-3.5 py-1.5 text-xs font-bold text-[#f3e4a8] hover:bg-[#d4af37]/20"
                          >
                            <span>لوحة اعتماد الجودة</span>
                          </Link>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-xs text-neutral-500 py-3">لا توجد حجوزات تنتظر اعتماد الجودة.</p>
                  )}
                </div>
              )}

              {/* Balance Collections */}
              {delegatedData.enabled['payment.record_balance'] && (
                <div className="space-y-4 rounded-3xl border border-neutral-800/80 bg-[#111114]/90 p-5 sm:p-6 shadow-xl backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-neutral-800/60 pb-3">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <HandCoins className="size-4 text-[#d4af37]" />
                      تحصيل المتبقي المالي كاش ({delegatedData.balanceBookings.length})
                    </h3>
                  </div>
                  {delegatedData.balanceBookings.length ? (
                    <div className="space-y-3">
                      {delegatedData.balanceBookings.map((bal) => (
                        <div
                          key={bal.id}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-neutral-800/60 bg-black/40 p-4 text-xs"
                        >
                          <div>
                            <p className="font-mono font-bold text-white">
                              {bal.bookingNumber} · {bal.customer.user.fullName}
                            </p>
                            <p className="mt-1 text-neutral-400">
                              المتبقي:{' '}
                              <strong className="text-amber-300 font-mono">
                                {formatCurrency(bal.amountDue)}
                              </strong>
                            </p>
                          </div>
                          <Link
                            href="/staff/delegated"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20"
                          >
                            <span>تسجيل استلام النقدية</span>
                          </Link>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-xs text-neutral-500 py-3">لا توجد مبالغ تنتظر التحصيل.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              title="لا توجد مهام مفوّضة مسندة إليك"
              description="تظهر العمليات هنا فقط في حال منحك صلاحيات تفويض إدارية من لوحة التحكم."
            />
          )}
        </div>
      );
      break;

    // -----------------------------------------------------------------------
    // SECTION 6: HISTORY (سجل الإنجاز والتقييم)
    // -----------------------------------------------------------------------
    case 'history':
      sectionContent = (
        <div className="space-y-8">
          <SectionHeader
            eyebrow="EXECUTION HISTORY & PERFORMANCE"
            title="سجل الإنجاز والتسليم الميداني"
            description="سجل المهام المكتملة ومؤشرات أداء التنفيذ والتسليم لخدمات اليوم."
          />

          <div className="space-y-4 rounded-3xl border border-neutral-800/80 bg-[#111114]/90 p-5 sm:p-6 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-neutral-800/60 pb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <h3 className="text-base font-bold text-white">المهام المكتملة والمسلّمة اليوم</h3>
              </div>
              <span className="text-xs font-bold text-emerald-400">
                {metrics.completedToday} خدمات منجزة
              </span>
            </div>

            {bookings.filter((b) => {
              const st = taskStatuses[b.id] ?? b.bookingStatus;
              return st === 'DELIVERED' || st === 'SERVICE_COMPLETED' || st === 'CLOSED';
            }).length ? (
              <div className="space-y-3">
                {bookings
                  .filter((b) => {
                    const st = taskStatuses[b.id] ?? b.bookingStatus;
                    return st === 'DELIVERED' || st === 'SERVICE_COMPLETED' || st === 'CLOSED';
                  })
                  .map((b) => (
                    <div
                      key={b.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span dir="ltr" className="font-mono font-bold text-white">
                            {b.bookingNumber}
                          </span>
                          <StatusBadge status={taskStatuses[b.id] ?? b.bookingStatus} />
                        </div>
                        <p className="mt-1 text-neutral-300">
                          {b.customer.user.fullName} · {b.service.nameAr} ·{' '}
                          <span className="text-neutral-400">
                            {b.vehicle.make} {b.vehicle.model} ({b.vehicle.plateNumber ?? 'بدون لوحة'})
                          </span>
                        </p>
                      </div>

                      <div className="text-left font-mono text-neutral-400">
                        {formatDateTime(b.startAt)}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <EmptyState
                title="لم تكتمل أي مهام ميدانية اليوم بعد"
                description="فور اعتماد الجودة وتسليم الخدمات للعملاء ستظهر في هذا السجل الموثق."
              />
            )}
          </div>
        </div>
      );
      break;

    default:
      sectionContent = null;
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#09090c] text-white selection:bg-[#d4af37]/30 selection:text-white"
    >
      <a
        href="#staff-main"
        className="sr-only rounded-lg bg-[#d4af37] px-4 py-2 font-bold text-black focus:not-sr-only focus:fixed focus:right-4 focus:top-4 focus:z-[60]"
      >
        تخطي إلى المحتوى
      </a>

      {/* TOP LUXURY HEADER (Matching Owner Command Center & Brand Navbar) */}
      <header className="sticky top-0 z-50 bg-[#080808]/90 backdrop-blur-md border-b border-[#cea355]/20 py-3 shadow-xl">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-row items-center justify-between">
          {/* Brand Official Logo */}
          <div className="flex items-center shrink-0">
            <Link href="/staff" className="flex items-center" aria-label="بريق | BAREEQ">
              <BareeqLogo size="md" />
            </Link>
          </div>

          {/* Action Buttons, Worker Identity & Mobile Menu */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Worker Pill Badge (Desktop / Tablet) */}
            <div className="hidden sm:flex items-center gap-1.5 xs:gap-2 px-3 py-1.5 xs:px-4 xs:py-2 rounded-xl gold-gradient text-white font-bold text-xs xs:text-sm shadow-lg shadow-[#cea355]/25">
              <User className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-white" aria-hidden="true" />
              <span>{employee.fullName}</span>
              <span className="text-[10px] bg-black/30 text-white px-2 py-0.5 rounded font-black border border-white/20">
                {team?.isLeader ? 'LEADER' : 'STAFF'}
              </span>
            </div>

            {/* Team / Branch Quick Badge */}
            {team && (
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#141414] border border-white/10 text-neutral-300 text-xs font-semibold">
                <Shield className="size-3.5 text-[#d4af37]" />
                <span>فريق {team.name}</span>
                <span className="text-neutral-500">·</span>
                <span className="text-neutral-400">{team.branchName}</span>
              </div>
            )}

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

            {/* Mobile Menu Button matching Owner Layout */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex lg:hidden items-center gap-1.5 rounded-xl border border-[#c9a227]/40 bg-[#c9a227]/10 px-3 py-2 text-xs font-bold text-[#e5c45a] transition hover:bg-[#c9a227]/20 focus:outline-none focus:ring-2 focus:ring-[#e5c45a]"
              aria-label="فتح قائمة مركز قيادة التنفيذ"
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

              {/* Worker Info Card in Mobile Drawer */}
              <div className="mt-4 rounded-2xl border border-neutral-800 bg-[#080808] p-3.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#e5c45a]">
                  <Wrench className="size-3 text-[#d4af37]" />
                  <span>تطبيق الميدان والتنفيذ</span>
                </div>
                <p className="mt-0.5 truncate text-sm font-black text-white">{employee.fullName}</p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {team ? `فريق ${team.name} · ${team.branchName}` : 'غير مخصص لفريق'}
                </p>
              </div>

              {/* Section Links */}
              <nav className="mt-4 flex flex-col gap-1.5" aria-label="أقسام لوحة التنفيذ">
                {sectionNav
                  .filter((item) => !item.hidden)
                  .map((item) => {
                    const Icon = item.icon;
                    const active = currentSection === item.id;
                    const linkHref = `/staff?section=${item.id}`;

                    return (
                      <Link
                        key={item.id}
                        href={linkHref}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`inline-flex min-h-11 items-center justify-between gap-3 rounded-xl px-3.5 text-xs font-bold transition-all ${
                          active
                            ? 'border border-[#cea355] bg-[#cea355]/15 text-[#edce8b] shadow-sm shadow-[#cea355]/10 font-black ring-1 ring-[#cea355]/30'
                            : 'border border-transparent text-neutral-400 hover:border-neutral-800 hover:bg-white/[0.04] hover:text-white'
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon
                            className={`size-4 shrink-0 ${
                              active ? 'text-[#edce8b]' : 'text-[#c9a227]'
                            }`}
                          />
                          <span>{item.label}</span>
                        </span>
                        {item.badge && item.badge > 0 ? (
                          <span className="rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 text-[10px] font-black">
                            {formatNumber(item.badge)}
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
      <main
        id="staff-main"
        className="mx-auto max-w-[1600px] gap-6 px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8 lg:py-8"
      >
        <aside
          aria-label="أقسام لوحة موظف التنفيذ"
          className="hidden lg:block min-w-0 lg:sticky lg:top-[90px] lg:self-start"
        >
          <nav className="rounded-2xl border border-neutral-800/80 bg-[#0e0e12]/90 backdrop-blur-xl p-2.5 shadow-xl space-y-1">
            {sectionNav
              .filter((item) => !item.hidden)
              .map((item) => {
                const Icon = item.icon;
                const active = currentSection === item.id;
                const linkHref = `/staff?section=${item.id}`;

                return (
                  <Link
                    key={item.id}
                    href={linkHref}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-r from-[#d4af37] via-[#e5c45a] to-[#d4af37] text-neutral-950 shadow-md shadow-[#d4af37]/20 font-bold'
                        : 'text-neutral-300 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon
                        aria-hidden="true"
                        className={`size-4 ${active ? 'text-neutral-950' : 'text-neutral-400'}`}
                      />
                      <span>{item.label}</span>
                    </span>
                    {item.badge && item.badge > 0 ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${
                          active
                            ? 'bg-black/20 text-neutral-950'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {formatNumber(item.badge)}
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
          {/* Global Action Feedback Alert */}
          {feedback && (
            <div
              role="status"
              aria-live="polite"
              className={`mb-4 flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-bold ${
                feedback.kind === 'error'
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              }`}
            >
              <span>{feedback.message}</span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                aria-label="إغلاق رسالة الحالة"
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {sectionContent}
        </div>
      </main>

      {/* MODAL: INCIDENT / FIELD REPORT */}
      {activeNoteModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur-sm p-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md space-y-4 rounded-3xl border border-amber-500/40 bg-[#141418] p-5 sm:p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h4 className="text-sm font-black text-white flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-400" />
                تسجيل بلاغ ميداني لغرفة العمليات
              </h4>
              <button
                type="button"
                onClick={() => setActiveNoteModal(null)}
                aria-label="إغلاق نافذة الملاحظة"
                className="rounded-xl p-1.5 text-neutral-400 hover:bg-neutral-800"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="text-xs font-bold text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5">
              حجز رقم: <span dir="ltr" className="font-mono">{activeNoteModal.bookingNumber}</span> · النوع:{' '}
              {activeNoteModal.type === 'PROBLEM'
                ? 'مشكلة بالموقع'
                : activeNoteModal.type === 'EXTRA_TIME'
                ? 'طلب وقت إضافي'
                : activeNoteModal.type === 'ADDON_REQUEST'
                ? 'طلب إضافة من العميل'
                : 'ملاحظة عامة'}
            </p>

            <div>
              <label htmlFor="field-note-input" className="mb-1.5 block text-xs font-bold text-neutral-300">
                تفاصيل البلاغ أو الملاحظة
              </label>
              <textarea
                id="field-note-input"
                value={noteInputText}
                onChange={(e) => setNoteInputText(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="اكتب ما حدث في الموقع وما هو الإجراء المطلوب من إدارة التشغيل..."
                className="w-full rounded-xl border border-white/10 bg-black/50 p-3 text-xs text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setActiveNoteModal(null)}
                className="min-h-11 rounded-xl border border-neutral-700 bg-neutral-800 text-xs font-bold text-neutral-300 hover:bg-neutral-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isPending || noteInputText.trim().length < 3}
                onClick={handleSendNote}
                className="min-h-11 rounded-xl bg-amber-500 text-xs font-black text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
              >
                إرسال البلاغ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CHECKLIST EVIDENCE NOTE */}
      {activeChecklistEvidence && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur-sm p-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md space-y-4 rounded-3xl border border-[#d4af37]/40 bg-[#141418] p-5 sm:p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h4 className="text-sm font-black text-white flex items-center gap-2">
                <FileText className="size-4 text-[#d4af37]" />
                توثيق ملاحظة بند الفحص
              </h4>
              <button
                type="button"
                onClick={() => setActiveChecklistEvidence(null)}
                aria-label="إغلاق نافذة إثبات القائمة"
                className="rounded-xl p-1.5 text-neutral-400 hover:bg-neutral-800"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="text-xs font-bold text-[#f3e4a8] bg-[#d4af37]/10 border border-[#d4af37]/20 rounded-xl p-3">
              {activeChecklistEvidence.item.labelAr}
            </p>

            <div>
              <label htmlFor="checklist-note-input" className="mb-1.5 block text-xs font-bold text-neutral-300">
                الملاحظة الميدانية المطلوبة
              </label>
              <textarea
                id="checklist-note-input"
                value={checklistNote}
                onChange={(e) => setChecklistNote(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="اكتب ما تم فحصه أو ملاحظتك الميدانية..."
                className="w-full rounded-xl border border-white/10 bg-black/50 p-3 text-xs text-white outline-none transition focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setActiveChecklistEvidence(null)}
                className="min-h-11 rounded-xl border border-neutral-700 bg-neutral-800 text-xs font-bold text-neutral-300 hover:bg-neutral-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={
                  isPending ||
                  (activeChecklistEvidence.item.requiresNote && checklistNote.trim().length < 3)
                }
                onClick={handleSubmitChecklistNote}
                className="min-h-11 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#f3e4a8] text-xs font-black text-neutral-950 hover:brightness-110 disabled:opacity-50"
              >
                حفظ واعتماد
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
