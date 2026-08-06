'use client';

import type { DragEvent, FormEvent, KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  GripVertical,
  LayoutGrid,
  List,
  LoaderCircle,
  RotateCcw,
  Rows3,
  Users,
  X,
} from 'lucide-react';
import { rescheduleCalendarBookingAction } from '@/app/actions/calendar';

export type CalendarView = 'day' | 'week' | 'agenda' | 'team';

export interface CalendarBookingDto {
  id: string;
  bookingNumber: string;
  bookingStatus: string;
  paymentStatus: string;
  expectedStartAt: string;
  localDate: string;
  localTime: string;
  localEndTime: string;
  durationMinutes: number;
  branchName: string;
  serviceName: string;
  zoneName: string;
  areaName: string;
  customerName: string;
  assignedTeamId: string | null;
  assignedTeamName: string | null;
  amountDue: number;
  canReschedule: boolean;
}

export interface CalendarOptionDto {
  id: string;
  label: string;
}

export interface CalendarTeamDto {
  id: string;
  name: string;
  branchName: string;
  active: boolean;
}

export interface CalendarFiltersDto {
  branch: string;
  team: string;
  service: string;
  zone: string;
  bookingStatus: string;
  paymentStatus: string;
}

export interface CalendarBoardProps {
  viewerName: string;
  homeHref: string;
  homeLabel: string;
  currentView: CalendarView;
  selectedDate: string;
  today: string;
  dateKeys: string[];
  rangeLabel: string;
  filters: CalendarFiltersDto;
  options: {
    branches: CalendarOptionDto[];
    teams: CalendarOptionDto[];
    services: CalendarOptionDto[];
    zones: CalendarOptionDto[];
    bookingStatuses: CalendarOptionDto[];
    paymentStatuses: CalendarOptionDto[];
  };
  teams: CalendarTeamDto[];
  bookings: CalendarBookingDto[];
  schedule: {
    startMinute: number;
    endMinute: number;
    slotMinutes: number;
  };
  canReschedule: boolean;
  totalMatchingCount: number;
  resultLimit: number;
}

interface RescheduleDraft {
  booking: CalendarBookingDto;
  targetDate: string;
  targetTime: string;
}

const numberFormatter = new Intl.NumberFormat('ar-EG');
const currencyFormatter = new Intl.NumberFormat('ar-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat('ar-EG', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortDateFormatter = new Intl.DateTimeFormat('ar-EG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const timeFormatter = new Intl.DateTimeFormat('ar-EG', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});

const viewItems: Array<{
  id: CalendarView;
  label: string;
  icon: typeof CalendarDays;
}> = [
  { id: 'day', label: 'اليوم', icon: Rows3 },
  { id: 'week', label: 'الأسبوع', icon: LayoutGrid },
  { id: 'agenda', label: 'الأجندة', icon: List },
  { id: 'team', label: 'الفرق', icon: Users },
];

const bookingStatusLabels: Record<string, string> = {
  DRAFT: 'مسودة',
  REQUEST_SUBMITTED: 'طلب جديد',
  AWAITING_PAYMENT_PROOF: 'بانتظار الإثبات',
  PAYMENT_UNDER_REVIEW: 'مراجعة الدفع',
  PAYMENT_VERIFIED: 'دفع موثق',
  AWAITING_OPERATIONS_REVIEW: 'مراجعة التشغيل',
  ACCEPTED: 'مقبول',
  AWAITING_ASSIGNMENT: 'بانتظار الفريق',
  ASSIGNED: 'مسند',
  TEAM_ACKNOWLEDGED: 'أكده الفريق',
  ON_THE_WAY: 'في الطريق',
  ARRIVED: 'وصل الفريق',
  IN_SERVICE: 'قيد التنفيذ',
  QUALITY_REVIEW: 'مراجعة الجودة',
  SERVICE_COMPLETED: 'اكتملت الخدمة',
  DELIVERED: 'تم التسليم',
  CLOSED: 'مغلق',
  RESCHEDULE_REQUESTED: 'طلب تعديل',
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
  VERIFIED: 'موثق',
  REJECTED: 'مرفوض',
  AMOUNT_SHORT: 'المبلغ ناقص',
  DUPLICATE_SUSPECTED: 'اشتباه تكرار',
  REUPLOAD_REQUIRED: 'مطلوب إعادة الرفع',
  PARTIALLY_PAID: 'مدفوع جزئيًا',
  FULLY_PAID: 'مدفوع بالكامل',
  REFUND_PENDING: 'استرداد معلق',
  PARTIALLY_REFUNDED: 'مسترد جزئيًا',
  REFUNDED: 'مسترد',
  NON_REFUNDABLE: 'غير قابل للاسترداد',
};

const inputClass = 'min-h-11 w-full rounded-xl border border-white/10 bg-[#111] px-3 text-sm text-white transition-colors hover:border-white/20 focus-visible:border-[#d4af37]';
const secondaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm font-bold text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-white';
const primaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-4 text-sm font-black text-black transition-colors hover:bg-[#e3c75e] disabled:cursor-not-allowed disabled:opacity-55';

function dateKeyToUtc(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function formatDateKey(dateKey: string, short = false) {
  return (short ? shortDateFormatter : dateFormatter).format(dateKeyToUtc(dateKey));
}

function shiftDateKey(dateKey: string, amount: number) {
  const date = dateKeyToUtc(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function timeFromMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.min(1439, minutes));
  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatTimeValue(value: string) {
  return timeFormatter.format(new Date(`1970-01-01T${value}:00.000Z`));
}

function minutesFromTime(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function statusTone(status: string) {
  if (['CANCELLED', 'REJECTED', 'EXECUTION_FAILED', 'ACCESS_DENIED'].includes(status)) {
    return 'border-r-rose-400 bg-rose-400/[0.07]';
  }
  if (['IN_SERVICE', 'ON_THE_WAY', 'ARRIVED'].includes(status)) {
    return 'border-r-sky-400 bg-sky-400/[0.07]';
  }
  if (['QUALITY_REVIEW', 'ADMIN_REVIEW_REQUIRED', 'CANCELLATION_REQUESTED', 'RESCHEDULE_REQUESTED'].includes(status)) {
    return 'border-r-amber-300 bg-amber-300/[0.07]';
  }
  if (['SERVICE_COMPLETED', 'DELIVERED', 'CLOSED'].includes(status)) {
    return 'border-r-emerald-400 bg-emerald-400/[0.07]';
  }
  return 'border-r-[#d4af37] bg-[#d4af37]/[0.065]';
}

function statusDot(status: string) {
  if (['CANCELLED', 'REJECTED', 'EXECUTION_FAILED', 'ACCESS_DENIED'].includes(status)) return 'bg-rose-400';
  if (['IN_SERVICE', 'ON_THE_WAY', 'ARRIVED'].includes(status)) return 'bg-sky-400';
  if (['SERVICE_COMPLETED', 'DELIVERED', 'CLOSED'].includes(status)) return 'bg-emerald-400';
  if (['QUALITY_REVIEW', 'ADMIN_REVIEW_REQUIRED', 'CANCELLATION_REQUESTED', 'RESCHEDULE_REQUESTED'].includes(status)) return 'bg-amber-300';
  return 'bg-[#d4af37]';
}

function calendarHref(
  currentView: CalendarView,
  selectedDate: string,
  filters: CalendarFiltersDto,
  patch: Partial<CalendarFiltersDto> & { view?: CalendarView; date?: string },
) {
  const params = new URLSearchParams();
  params.set('view', patch.view ?? currentView);
  params.set('date', patch.date ?? selectedDate);
  const merged = { ...filters, ...patch };
  for (const key of ['branch', 'team', 'service', 'zone', 'bookingStatus', 'paymentStatus'] as const) {
    const value = merged[key];
    if (value) params.set(key, value);
  }
  return `/admin/calendar?${params.toString()}`;
}

function EmptyCalendar({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-12 text-center">
      <CalendarDays aria-hidden="true" className="mx-auto size-8 text-white/25" />
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-white/45">{description}</p>
    </div>
  );
}

function BookingCard({
  booking,
  dragging,
  onDragStart,
  onDragEnd,
  onReschedule,
  compact = false,
}: {
  booking: CalendarBookingDto;
  dragging: boolean;
  onDragStart: (event: DragEvent<HTMLElement>, booking: CalendarBookingDto) => void;
  onDragEnd: () => void;
  onReschedule: (booking: CalendarBookingDto) => void;
  compact?: boolean;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!booking.canReschedule || event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onReschedule(booking);
    }
  }

  return (
    <article
      draggable={booking.canReschedule}
      tabIndex={booking.canReschedule ? 0 : undefined}
      onDragStart={(event) => onDragStart(event, booking)}
      onDragEnd={onDragEnd}
      onKeyDown={handleKeyDown}
      aria-describedby={booking.canReschedule ? 'calendar-drag-help' : undefined}
      className={`group min-w-0 rounded-xl border border-white/10 border-r-4 p-3 transition-[border-color,background-color,opacity] hover:border-white/20 ${statusTone(booking.bookingStatus)} ${dragging ? 'opacity-45' : ''}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`size-2 shrink-0 rounded-full ${statusDot(booking.bookingStatus)}`} aria-hidden="true" />
            <p className="truncate font-black">{booking.serviceName}</p>
          </div>
          <p className="mt-1 truncate text-sm text-white/65">{booking.customerName} · {booking.zoneName} · {booking.areaName}</p>
        </div>
        {booking.canReschedule ? <GripVertical aria-hidden="true" className="mt-0.5 size-4 shrink-0 cursor-grab text-white/25 group-hover:text-[#d4af37]" /> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50">
        <span dir="ltr" translate="no" className="font-bold text-white/75">{booking.bookingNumber}</span>
        <span>{formatTimeValue(booking.localTime)}–{formatTimeValue(booking.localEndTime)}</span>
        <span>{numberFormatter.format(booking.durationMinutes)} دقيقة</span>
      </div>
      {!compact ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-black/25 px-2 py-1">{bookingStatusLabels[booking.bookingStatus] ?? booking.bookingStatus}</span>
          <span className="rounded-full bg-black/25 px-2 py-1">{paymentStatusLabels[booking.paymentStatus] ?? booking.paymentStatus}</span>
          <span className="max-w-full truncate rounded-full bg-black/25 px-2 py-1">{booking.assignedTeamName ?? 'غير مسند'}</span>
          {booking.amountDue > 0 ? <span className="rounded-full bg-rose-400/10 px-2 py-1 text-rose-200">متبقي {currencyFormatter.format(booking.amountDue)}</span> : null}
        </div>
      ) : null}
      {booking.canReschedule ? (
        <button
          type="button"
          onClick={() => onReschedule(booking)}
          className="mt-3 min-h-9 rounded-lg border border-white/10 px-3 text-xs font-bold text-white/65 transition-colors hover:border-[#d4af37]/40 hover:text-[#e4c762]"
        >
          تغيير الموعد
        </button>
      ) : null}
    </article>
  );
}

function Timeline({
  dateKey,
  bookings,
  schedule,
  draggingId,
  targetTeamId,
  onDragStart,
  onDragEnd,
  onDropTarget,
  onReschedule,
}: {
  dateKey: string;
  bookings: CalendarBookingDto[];
  schedule: CalendarBoardProps['schedule'];
  draggingId: string | null;
  targetTeamId?: string;
  onDragStart: (event: DragEvent<HTMLElement>, booking: CalendarBookingDto) => void;
  onDragEnd: () => void;
  onDropTarget: (event: DragEvent<HTMLElement>, date: string, time: string, teamId?: string) => void;
  onReschedule: (booking: CalendarBookingDto) => void;
}) {
  const slots = useMemo(() => {
    const values: number[] = [];
    for (let minute = schedule.startMinute; minute < schedule.endMinute; minute += schedule.slotMinutes) {
      values.push(minute);
    }
    return values;
  }, [schedule.endMinute, schedule.slotMinutes, schedule.startMinute]);
  const timelineGroups = useMemo(() => {
    const bySlot = new Map<number, CalendarBookingDto[]>();
    const outside: CalendarBookingDto[] = [];
    for (const booking of bookings) {
      const bookingMinute = minutesFromTime(booking.localTime);
      if (bookingMinute < schedule.startMinute || bookingMinute >= schedule.endMinute) {
        outside.push(booking);
        continue;
      }
      const slotMinute = schedule.startMinute + Math.floor(
        (bookingMinute - schedule.startMinute) / schedule.slotMinutes,
      ) * schedule.slotMinutes;
      const group = bySlot.get(slotMinute) ?? [];
      group.push(booking);
      bySlot.set(slotMinute, group);
    }
    return { bySlot, outside };
  }, [bookings, schedule.endMinute, schedule.slotMinutes, schedule.startMinute]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      {slots.map((minute) => {
        const slotBookings = timelineGroups.bySlot.get(minute) ?? [];
        const time = timeFromMinutes(minute);
        return (
          <div key={minute} className="grid min-h-20 grid-cols-[5rem_minmax(0,1fr)] border-b border-white/[0.07] last:border-b-0">
            <time dateTime={`${dateKey}T${time}`} className="border-l border-white/[0.07] px-3 py-4 text-center text-xs font-bold tabular-nums text-white/40">{formatTimeValue(time)}</time>
            <div
              onDragOver={(event) => {
                if (!draggingId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => onDropTarget(event, dateKey, time, targetTeamId)}
              className={`min-w-0 space-y-2 p-2 transition-colors ${draggingId ? 'bg-[#d4af37]/[0.035] hover:bg-[#d4af37]/10' : ''}`}
            >
              {slotBookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} dragging={draggingId === booking.id} onDragStart={onDragStart} onDragEnd={onDragEnd} onReschedule={onReschedule} />
              ))}
            </div>
          </div>
        );
      })}
      {timelineGroups.outside.length > 0 ? (
        <div className="border-t border-white/10 p-3">
          <p className="mb-2 text-xs font-bold text-white/35">خارج ساعات الشبكة</p>
          <div className="space-y-2">
            {timelineGroups.outside.map((booking) => (
              <BookingCard key={booking.id} booking={booking} dragging={draggingId === booking.id} onDragStart={onDragStart} onDragEnd={onDragEnd} onReschedule={onReschedule} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RescheduleDialog({
  draft,
  today,
  pending,
  error,
  onDraftChange,
  onClose,
  onSubmit,
}: {
  draft: RescheduleDraft;
  today: string;
  pending: boolean;
  error: string;
  onDraftChange: (draft: RescheduleDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !pending) {
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]',
    )];
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/80 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reschedule-title"
        aria-describedby="reschedule-description"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="mx-auto mt-[max(2rem,8vh)] w-full max-w-lg rounded-3xl border border-[#d4af37]/25 bg-[#111] p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wide text-[#d4af37]">تأكيد إعادة الجدولة</p>
            <h2 id="reschedule-title" className="mt-2 text-xl font-black">{draft.booking.serviceName}</h2>
            <p id="reschedule-description" className="mt-2 text-sm leading-6 text-white/50">لن يتغير الموعد إلا بعد فحص السعة، دوام الفرع، الفريق، المنطقة والتعارضات على الخادم.</p>
          </div>
          <button type="button" onClick={onClose} disabled={pending} aria-label="إغلاق نافذة إعادة الجدولة" className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"><X aria-hidden="true" className="size-5" /></button>
        </div>

        <dl className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm sm:grid-cols-2">
          <div><dt className="text-white/40">الحجز</dt><dd dir="ltr" translate="no" className="mt-1 font-bold">{draft.booking.bookingNumber}</dd></div>
          <div><dt className="text-white/40">الفريق</dt><dd className="mt-1 font-bold">{draft.booking.assignedTeamName ?? 'غير مسند'}</dd></div>
          <div><dt className="text-white/40">الموعد الحالي</dt><dd className="mt-1 font-bold">{formatDateKey(draft.booking.localDate, true)} · {formatTimeValue(draft.booking.localTime)}</dd></div>
          <div><dt className="text-white/40">الفرع</dt><dd className="mt-1 font-bold">{draft.booking.branchName}</dd></div>
        </dl>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <input type="hidden" name="bookingId" value={draft.booking.id} />
          <input type="hidden" name="expectedStartAt" value={draft.booking.expectedStartAt} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="calendar-target-date" className="mb-2 block text-sm font-bold text-white/70">التاريخ الجديد</label>
              <input id="calendar-target-date" name="targetDate" type="date" min={today} autoComplete="off" required value={draft.targetDate} onChange={(event) => onDraftChange({ ...draft, targetDate: event.target.value })} className={inputClass} />
            </div>
            <div>
              <label htmlFor="calendar-target-time" className="mb-2 block text-sm font-bold text-white/70">الوقت الجديد</label>
              <input id="calendar-target-time" name="targetTime" type="time" step={300} autoComplete="off" required value={draft.targetTime} onChange={(event) => onDraftChange({ ...draft, targetTime: event.target.value })} className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="calendar-reschedule-reason" className="mb-2 block text-sm font-bold text-white/70">سبب التغيير</label>
            <textarea id="calendar-reschedule-reason" name="reason" required minLength={5} maxLength={500} autoComplete="off" rows={4} placeholder="مثال: طلب العميل تغيير الموعد إلى الفترة الصباحية…" className={`${inputClass} resize-y py-3`} />
            <p className="mt-2 text-xs text-white/35">السبب إلزامي ويُحفظ في سجل تغيير الموعد وسجل التدقيق.</p>
          </div>
          {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm leading-6 text-rose-100">{error}</p> : null}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={pending} className={secondaryButtonClass}>إلغاء</button>
            <button type="submit" disabled={pending} className={primaryButtonClass}>{pending ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> جارٍ فحص الموعد…</> : 'فحص التعارض وحفظ الموعد'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CalendarBoard(props: CalendarBoardProps) {
  const {
    viewerName,
    homeHref,
    homeLabel,
    currentView,
    selectedDate,
    today,
    dateKeys,
    rangeLabel,
    filters,
    options,
    teams,
    bookings,
    schedule,
    canReschedule,
    totalMatchingCount,
    resultLimit,
  } = props;
  const router = useRouter();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RescheduleDraft | null>(null);
  const [actionError, setActionError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [pending, startTransition] = useTransition();
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const shiftAmount = currentView === 'week' ? 7 : currentView === 'agenda' ? 30 : 1;

  function openReschedule(booking: CalendarBookingDto, targetDate = booking.localDate, targetTime = booking.localTime) {
    if (!booking.canReschedule) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setActionError('');
    setFeedback('');
    setDraft({ booking, targetDate, targetTime });
  }

  function closeReschedule() {
    if (pending) return;
    setDraft(null);
    setActionError('');
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  function handleDragStart(event: DragEvent<HTMLElement>, booking: CalendarBookingDto) {
    if (!booking.canReschedule) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', booking.id);
    setDraggingId(booking.id);
  }

  function handleDropTarget(event: DragEvent<HTMLElement>, targetDate: string, targetTime: string, targetTeamId?: string) {
    event.preventDefault();
    const bookingId = event.dataTransfer.getData('text/plain') || draggingId;
    const booking = bookings.find(({ id }) => id === bookingId);
    setDraggingId(null);
    if (!booking) return;
    if (targetTeamId !== undefined && (booking.assignedTeamId ?? 'unassigned') !== targetTeamId) {
      setFeedback('تغيير الفريق لا يتم بالسحب من التقويم. اسحب الحجز داخل مسار فريقه أو استخدم إجراء التوزيع.');
      return;
    }
    openReschedule(booking, targetDate, targetTime);
  }

  function handleDateDrop(event: DragEvent<HTMLElement>, targetDate: string) {
    const bookingId = event.dataTransfer.getData('text/plain') || draggingId;
    const booking = bookings.find(({ id }) => id === bookingId);
    if (!booking) {
      event.preventDefault();
      setDraggingId(null);
      return;
    }
    handleDropTarget(event, targetDate, booking.localTime);
  }

  function submitReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setActionError('');
    startTransition(async () => {
      const result = await rescheduleCalendarBookingAction(formData);
      if ('error' in result && result.error) {
        setActionError(result.error);
        return;
      }
      setDraft(null);
      setFeedback('تم حفظ الموعد الجديد بعد فحص التعارض وتحديث سجل الحجز.');
      router.refresh();
    });
  }

  const groupedAgenda = useMemo(() => {
    const groups = new Map<string, CalendarBookingDto[]>();
    for (const booking of bookings) {
      const items = groups.get(booking.localDate) ?? [];
      items.push(booking);
      groups.set(booking.localDate, items);
    }
    return [...groups.entries()].sort(([first], [second]) => first.localeCompare(second));
  }, [bookings]);

  const assignedCount = bookings.filter(({ assignedTeamId }) => assignedTeamId).length;
  const activeTeamIds = new Set(bookings.map(({ assignedTeamId }) => assignedTeamId).filter(Boolean));
  const displayedTeams = teams.filter((team) => {
    if (!filters.team) return activeTeamIds.has(team.id) || team.active;
    return filters.team === team.id;
  });
  const previousHref = calendarHref(currentView, selectedDate, filters, { date: shiftDateKey(selectedDate, -shiftAmount) });
  const nextHref = calendarHref(currentView, selectedDate, filters, { date: shiftDateKey(selectedDate, shiftAmount) });

  return (
    <div dir="rtl" className={`min-h-screen bg-[#080808] text-white ${draggingId ? 'select-none' : ''}`}>
      <a href="#calendar-main" tabIndex={draft ? -1 : undefined} aria-hidden={draft ? true : undefined} className="skip-link">تخطي إلى التقويم</a>
      <header inert={draft ? true : undefined} aria-hidden={draft ? true : undefined} className="border-b border-white/10 bg-black/45">
        <div className="mx-auto flex max-w-[1700px] flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="min-w-0">
            <Link href={homeHref} className="inline-flex items-center gap-2 text-sm font-bold text-[#d4af37] transition-colors hover:text-[#ead478]"><ArrowRight aria-hidden="true" className="size-4" /> {homeLabel}</Link>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">تقويم التشغيل</h1>
            <p className="mt-1 text-sm text-white/45">{viewerName} · {rangeLabel}</p>
          </div>
          <nav aria-label="طرق عرض التقويم" className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {viewItems.map((item) => {
              const Icon = item.icon;
              const active = currentView === item.id;
              return <Link key={item.id} href={calendarHref(currentView, selectedDate, filters, { view: item.id })} aria-current={active ? 'page' : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors ${active ? 'bg-[#d4af37] text-black' : 'border border-white/10 bg-white/[0.035] text-white/60 hover:bg-white/[0.07] hover:text-white'}`}><Icon aria-hidden="true" className="size-4" />{item.label}</Link>;
            })}
          </nav>
        </div>
      </header>

      <main id="calendar-main" inert={draft ? true : undefined} aria-hidden={draft ? true : undefined} className="mx-auto max-w-[1700px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section aria-labelledby="calendar-range-title" className="rounded-3xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={previousHref} aria-label="الفترة السابقة" className={`${secondaryButtonClass} px-3`}><ChevronRight aria-hidden="true" className="size-4" /></Link>
              <Link href={calendarHref(currentView, selectedDate, filters, { date: today })} className={secondaryButtonClass}>اليوم</Link>
              <Link href={nextHref} aria-label="الفترة التالية" className={`${secondaryButtonClass} px-3`}><ChevronLeft aria-hidden="true" className="size-4" /></Link>
              <div className="mr-2 min-w-0">
                <h2 id="calendar-range-title" className="truncate text-lg font-black">{rangeLabel}</h2>
                <p id="calendar-drag-help" className="mt-1 text-xs leading-5 text-white/40">اسحب الحجز المسموح إلى وقت أو يوم جديد، أو استخدم زر «تغيير الموعد» للوصول بلوحة المفاتيح. الحفظ يتطلب تأكيدًا وسببًا.</p>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center text-xs sm:min-w-[340px]">
              <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-white/40">المعروض</dt><dd className="mt-1 text-lg font-black tabular-nums">{numberFormatter.format(bookings.length)}</dd></div>
              <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-white/40">مسند</dt><dd className="mt-1 text-lg font-black tabular-nums text-emerald-300">{numberFormatter.format(assignedCount)}</dd></div>
              <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-white/40">غير مسند</dt><dd className="mt-1 text-lg font-black tabular-nums text-amber-200">{numberFormatter.format(bookings.length - assignedCount)}</dd></div>
            </dl>
          </div>
        </section>

        <details className="group mt-5 rounded-2xl border border-white/10 bg-white/[0.02]" open>
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 font-bold text-white/70 marker:hidden"><Filter aria-hidden="true" className="size-4 text-[#d4af37]" /> فلاتر الجدول</summary>
          <form action="/admin/calendar" method="get" className="grid gap-3 border-t border-white/10 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <input type="hidden" name="view" value={currentView} />
            <input type="hidden" name="date" value={selectedDate} />
            <div><label htmlFor="calendar-branch" className="mb-2 block text-xs font-bold text-white/45">الفرع</label><select id="calendar-branch" name="branch" defaultValue={filters.branch} autoComplete="off" className={inputClass}><option value="">كل الفروع</option>{options.branches.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
            <div><label htmlFor="calendar-team" className="mb-2 block text-xs font-bold text-white/45">الفريق</label><select id="calendar-team" name="team" defaultValue={filters.team} autoComplete="off" className={inputClass}><option value="">كل الفرق</option><option value="unassigned">غير مسند</option>{options.teams.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
            <div><label htmlFor="calendar-service" className="mb-2 block text-xs font-bold text-white/45">الخدمة</label><select id="calendar-service" name="service" defaultValue={filters.service} autoComplete="off" className={inputClass}><option value="">كل الخدمات</option>{options.services.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
            <div><label htmlFor="calendar-zone" className="mb-2 block text-xs font-bold text-white/45">المنطقة</label><select id="calendar-zone" name="zone" defaultValue={filters.zone} autoComplete="off" className={inputClass}><option value="">كل المناطق</option>{options.zones.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
            <div><label htmlFor="calendar-booking-status" className="mb-2 block text-xs font-bold text-white/45">حالة الحجز</label><select id="calendar-booking-status" name="bookingStatus" defaultValue={filters.bookingStatus} autoComplete="off" className={inputClass}><option value="">كل الحالات</option>{options.bookingStatuses.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
            <div><label htmlFor="calendar-payment-status" className="mb-2 block text-xs font-bold text-white/45">حالة الدفع</label><select id="calendar-payment-status" name="paymentStatus" defaultValue={filters.paymentStatus} autoComplete="off" className={inputClass}><option value="">كل حالات الدفع</option>{options.paymentStatuses.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-6 xl:justify-end"><Link href={`/admin/calendar?view=${currentView}&date=${selectedDate}`} className={secondaryButtonClass}><RotateCcw aria-hidden="true" className="size-4" /> مسح الفلاتر</Link><button type="submit" className={primaryButtonClass}>تطبيق الفلاتر</button></div>
          </form>
        </details>

        <div aria-live="polite" className="mt-4 min-h-6 text-sm text-emerald-300">{feedback}</div>
        {!canReschedule ? <p className="mb-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-3 text-sm leading-6 text-amber-100">يمكنك قراءة الجدول، لكن حسابك لا يملك صلاحية <span dir="ltr" translate="no">booking.reschedule</span>.</p> : null}
        {totalMatchingCount > resultLimit ? <p className="mb-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-3 text-sm leading-6 text-amber-100">يعرض التقويم أول {numberFormatter.format(resultLimit)} حجزًا من أصل {numberFormatter.format(totalMatchingCount)}. ضيّق الفترة أو استخدم الفلاتر لعرض البقية.</p> : null}

        <section aria-label={`عرض ${viewItems.find(({ id }) => id === currentView)?.label ?? currentView}`} className="mt-2">
          {bookings.length === 0 ? <EmptyCalendar title="لا توجد حجوزات في هذه الفترة" description="غيّر التاريخ أو امسح بعض الفلاتر. لا توجد بيانات تجريبية تُعرض بدل النتائج الفعلية." /> : null}

          {bookings.length > 0 && currentView === 'day' ? (
            <div>
              <h2 className="mb-4 text-xl font-black">{formatDateKey(dateKeys[0] ?? selectedDate)}</h2>
              <Timeline dateKey={dateKeys[0] ?? selectedDate} bookings={bookings} schedule={schedule} draggingId={draggingId} onDragStart={handleDragStart} onDragEnd={() => setDraggingId(null)} onDropTarget={handleDropTarget} onReschedule={openReschedule} />
            </div>
          ) : null}

          {bookings.length > 0 && currentView === 'week' ? (
            <div className="overflow-x-auto pb-3">
              <div className="grid min-w-[1400px] grid-cols-7 gap-3">
                {dateKeys.map((dateKey) => {
                  const dayBookings = bookings.filter((booking) => booking.localDate === dateKey);
                  return (
                    <section key={dateKey} onDragOver={(event) => { if (draggingId) event.preventDefault(); }} onDrop={(event) => handleDateDrop(event, dateKey)} className={`min-w-0 rounded-2xl border p-3 transition-colors ${dateKey === today ? 'border-[#d4af37]/50 bg-[#d4af37]/[0.045]' : 'border-white/10 bg-white/[0.02]'} ${draggingId ? 'hover:bg-[#d4af37]/10' : ''}`}>
                      <h2 className="border-b border-white/10 pb-3 text-sm font-black">{formatDateKey(dateKey, true)}</h2>
                      <p className="mt-2 text-xs text-white/35">{numberFormatter.format(dayBookings.length)} حجوزات</p>
                      <div className="mt-3 space-y-3">{dayBookings.map((booking) => <BookingCard key={booking.id} booking={booking} compact dragging={draggingId === booking.id} onDragStart={handleDragStart} onDragEnd={() => setDraggingId(null)} onReschedule={openReschedule} />)}</div>
                      {dayBookings.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-white/30">لا حجوزات</p> : null}
                    </section>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-white/35">الإفلات على يوم جديد يحتفظ بوقت الحجز الحالي، ويمكن تعديله قبل التأكيد.</p>
            </div>
          ) : null}

          {bookings.length > 0 && currentView === 'agenda' ? (
            <div className="space-y-6">
              {groupedAgenda.map(([dateKey, dayBookings]) => (
                <section
                  key={dateKey}
                  onDragOver={(event) => { if (draggingId) event.preventDefault(); }}
                  onDrop={(event) => handleDateDrop(event, dateKey)}
                  className={`rounded-2xl p-2 [content-visibility:auto] transition-colors ${draggingId ? 'hover:bg-[#d4af37]/[0.07]' : ''}`}
                >
                  <div className="mb-3 flex items-center justify-between gap-4"><h2 className="text-lg font-black">{formatDateKey(dateKey)}</h2><span className="rounded-full bg-white/[0.05] px-3 py-1 text-xs tabular-nums text-white/45">{numberFormatter.format(dayBookings.length)}</span></div>
                  <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{dayBookings.map((booking) => <BookingCard key={booking.id} booking={booking} dragging={draggingId === booking.id} onDragStart={handleDragStart} onDragEnd={() => setDraggingId(null)} onReschedule={openReschedule} />)}</div>
                </section>
              ))}
            </div>
          ) : null}

          {bookings.length > 0 && currentView === 'team' ? (
            <div className="space-y-6">
              {displayedTeams.map((team) => {
                const teamBookings = bookings.filter(({ assignedTeamId }) => assignedTeamId === team.id);
                if (teamBookings.length === 0 && filters.team) return null;
                return (
                  <section key={team.id} className="[content-visibility:auto]">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-black">{team.name}</h2><p className="mt-1 text-xs text-white/40">{team.branchName} · السحب داخل مسار الفريق يغيّر الوقت فقط</p></div><span className="rounded-full bg-white/[0.05] px-3 py-1 text-xs tabular-nums text-white/45">{numberFormatter.format(teamBookings.length)} حجوزات</span></div>
                    {teamBookings.length ? <Timeline dateKey={dateKeys[0] ?? selectedDate} bookings={teamBookings} schedule={schedule} draggingId={draggingId} targetTeamId={team.id} onDragStart={handleDragStart} onDragEnd={() => setDraggingId(null)} onDropTarget={handleDropTarget} onReschedule={openReschedule} /> : <EmptyCalendar title="لا حجوزات لهذا الفريق" description="الفريق ظاهر لأنه نشط، لكن لا توجد حجوزات مطابقة للفلاتر في اليوم المحدد." />}
                  </section>
                );
              })}
              {bookings.some(({ assignedTeamId }) => !assignedTeamId) ? (
                <section className="[content-visibility:auto]"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-black">غير مسند</h2><span className="rounded-full bg-amber-300/10 px-3 py-1 text-xs tabular-nums text-amber-100">{numberFormatter.format(bookings.filter(({ assignedTeamId }) => !assignedTeamId).length)}</span></div><Timeline dateKey={dateKeys[0] ?? selectedDate} bookings={bookings.filter(({ assignedTeamId }) => !assignedTeamId)} schedule={schedule} draggingId={draggingId} targetTeamId="unassigned" onDragStart={handleDragStart} onDragEnd={() => setDraggingId(null)} onDropTarget={handleDropTarget} onReschedule={openReschedule} /></section>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>

      {draft ? <RescheduleDialog draft={draft} today={today} pending={pending} error={actionError} onDraftChange={setDraft} onClose={closeReschedule} onSubmit={submitReschedule} /> : null}
    </div>
  );
}
