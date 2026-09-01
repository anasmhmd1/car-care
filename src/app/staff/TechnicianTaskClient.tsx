'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  AlertTriangle,
  Boxes,
  Car,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  ListChecks,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  PlusCircle,
  Shield,
  Sparkles,
  Square,
  User,
  X,
} from 'lucide-react';
import {
  recordTechnicianNoteAction,
  toggleChecklistItemAction,
  updateTechnicianTaskStatusAction,
} from '@/app/actions/technician';
import { advancePostServiceAction } from '@/app/actions/quality';
import { phoneHref, whatsappHref } from '@/lib/contact-links';
import { formatMaterialQuantityWithUnit } from '@/lib/inventory/units';

type WorkflowStatus =
  | 'ASSIGNED'
  | 'TEAM_ACKNOWLEDGED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'IN_SERVICE'
  | 'QUALITY_REVIEW'
  | 'SERVICE_COMPLETED'
  | 'DELIVERED';

type NoteType = 'PROBLEM' | 'EXTRA_TIME' | 'ADDON_REQUEST';

interface ChecklistItem {
  id: string;
  labelAr: string;
  descriptionAr: string | null;
  required: boolean;
  requiresNote: boolean;
  displayOrder: number;
}

interface ChecklistTemplate {
  id: string;
  name: string;
  stage: string;
  items: ChecklistItem[];
}

interface ChecklistResult {
  itemId: string;
  isChecked: boolean;
}

interface ActiveChecklistEvidence {
  item: ChecklistItem;
  stage: string;
}

export interface TechnicianBooking {
  id: string;
  bookingNumber: string;
  bookingStatus: string;
  startAt: Date | string;
  gateInstructions: string | null;
  locationUrl: string | null;
  addressSnapshot: unknown;
  assignedEmployeeId?: string | null;
  assignedEmployee?: { fullName: string } | null;
  customer: {
    user: { fullName: string; phone: string; whatsapp: string | null };
  };
  vehicle: { make: string; model: string; color: string; plateNumber: string | null };
  operationalVehicle?: {
    code: string;
    plateNumber: string | null;
    make: string;
    model: string;
  } | null;
  service: { nameAr: string; checklistTemplates: ChecklistTemplate[] };
  requiredMaterials: Array<{
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
  }>;
  checklistInstances: Array<{ results: ChecklistResult[] }>;
}

interface Props {
  employee: { fullName: string };
  isLeader?: boolean;
  teamName?: string | null;
  teamVehicles?: Array<{ id: string; code: string; plateNumber: string | null; make: string; model: string }>;
  myCustodyStocks?: Array<{
    id: string;
    quantityOnHand: number;
    material: { nameAr: string; sku: string; unit: string };
  }>;
  bookings: TechnicianBooking[];
}

interface WorkflowStepConfig {
  from: WorkflowStatus;
  to: WorkflowStatus;
  label: string;
  shortLabel: string;
  helper: string;
  stepNumber: number;
}

const WORKFLOW_STEPS: WorkflowStepConfig[] = [
  { stepNumber: 1, from: 'ASSIGNED', to: 'TEAM_ACKNOWLEDGED', label: 'تأكيد استلام المهمة', shortLabel: 'استلام المهمة', helper: 'راجع بيانات العميل وموقع التنفيذ أولاً' },
  { stepNumber: 2, from: 'TEAM_ACKNOWLEDGED', to: 'ON_THE_WAY', label: 'بدء التحرك نحو العميل', shortLabel: 'انطلاق الفريق', helper: 'سجّل بدء تحرك الفريق الميداني' },
  { stepNumber: 3, from: 'ON_THE_WAY', to: 'ARRIVED', label: 'تأكيد الوصول للموقع', shortLabel: 'تأكيد الوصول', helper: 'سجّل الوصول وابدأ فحص وتوثيق الحالة' },
  { stepNumber: 4, from: 'ARRIVED', to: 'IN_SERVICE', label: 'بدء تنفيذ الخدمة والتشيك ليست', shortLabel: 'بدء التنفيذ', helper: 'يتطلب استكمال قوائم التحضير وجاهزية المواد' },
  { stepNumber: 5, from: 'IN_SERVICE', to: 'QUALITY_REVIEW', label: 'إرسال لمراجعة واعتماد الجودة', shortLabel: 'إرسال للجودة', helper: 'يتطلب إكمال بنود التشيك ليست الإلزامية' },
  { stepNumber: 6, from: 'SERVICE_COMPLETED', to: 'DELIVERED', label: 'تأكيد تسليم الخدمة النهائي', shortLabel: 'تسليم للعميل', helper: 'استخدمه بعد اعتماد الجودة وتسليم العميل' },
];

const STATUS_AR_LABELS: Record<string, { label: string; tone: string }> = {
  ASSIGNED: { label: 'مسندة للفريق', tone: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
  TEAM_ACKNOWLEDGED: { label: 'تم الاستلام', tone: 'border-sky-500/40 bg-sky-500/10 text-sky-300' },
  ON_THE_WAY: { label: 'في الطريق للموقع', tone: 'border-sky-500/40 bg-sky-500/10 text-sky-300' },
  ARRIVED: { label: 'تم الوصول للموقع', tone: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
  IN_SERVICE: { label: 'قيد التنفيذ الميداني', tone: 'border-[#cea355]/40 bg-[#cea355]/10 text-[#f3e4a8]' },
  QUALITY_REVIEW: { label: 'بانتظار اعتماد الجودة', tone: 'border-purple-500/40 bg-purple-500/10 text-purple-300' },
  SERVICE_COMPLETED: { label: 'الجودة معتمدة · بانتظار التسليم', tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
  DELIVERED: { label: 'تم التسليم بنجاح', tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
};

const CHECKLIST_STAGE_STATUS: Record<string, readonly string[]> = {
  TEAM_PREPARATION: ['TEAM_ACKNOWLEDGED', 'ON_THE_WAY', 'ARRIVED', 'IN_SERVICE'],
  ARRIVAL_INSPECTION: ['ARRIVED', 'IN_SERVICE'],
  SERVICE_EXECUTION: ['IN_SERVICE'],
  CLOSING: ['IN_SERVICE'],
};

function canEditChecklistStage(stage: string, bookingStatus: string): boolean {
  return CHECKLIST_STAGE_STATUS[stage]?.includes(bookingStatus) ?? false;
}

function initialChecklistState(bookings: TechnicianBooking[]) {
  const state: Record<string, boolean> = {};
  for (const booking of bookings) {
    for (const instance of booking.checklistInstances) {
      for (const result of instance.results) state[`${booking.id}:${result.itemId}`] = result.isChecked;
    }
  }
  return state;
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

function formatTimeOnly(dateValue: string | Date): string {
  return new Intl.DateTimeFormat('ar-EG', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).format(new Date(dateValue));
}

export default function TechnicianTaskClient({
  isLeader = false,
  teamName = null,
  teamVehicles = [],
  bookings,
}: Props) {
  const [selectedTaskId, setSelectedTaskId] = useState(bookings[0]?.id ?? '');
  const [activeNoteType, setActiveNoteType] = useState<NoteType | null>(null);
  const [noteText, setNoteText] = useState('');
  const [activeChecklistEvidence, setActiveChecklistEvidence] = useState<ActiveChecklistEvidence | null>(null);
  const [checklistNote, setChecklistNote] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() => initialChecklistState(bookings));
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(bookings.map((booking) => [booking.id, booking.bookingStatus])),
  );
  const [isPending, startTransition] = useTransition();

  // Collapsible section toggles for mobile ergonomics
  const [showMaterials, setShowMaterials] = useState(true);
  const [showChecklist, setShowChecklist] = useState(true);
  const [showCustomerDetails, setShowCustomerDetails] = useState(true);

  const selectedTask = useMemo(
    () => bookings.find((booking) => booking.id === selectedTaskId) ?? bookings[0] ?? null,
    [bookings, selectedTaskId],
  );

  const currentStatus = selectedTask ? (taskStatuses[selectedTask.id] ?? selectedTask.bookingStatus) : '';
  const hasMaterialBlocker = Boolean(selectedTask?.requiredMaterials.some((material) => material.required && !material.ready));

  // Determine current active workflow step
  const nextAvailableStep = useMemo(() => {
    return WORKFLOW_STEPS.find((step) => step.from === currentStatus) ?? null;
  }, [currentStatus]);

  const setResult = (result: { error?: string; success?: boolean }, successMessage: string) => {
    setFeedback(result.error
      ? { kind: 'error', message: result.error }
      : { kind: 'success', message: successMessage });
  };

  const handleStatusChange = (targetStatus: WorkflowStatus) => {
    if (!selectedTask) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set('bookingId', selectedTask.id);
      formData.set('targetStatus', targetStatus);
      const result = targetStatus === 'DELIVERED'
        ? await advancePostServiceAction(formData)
        : await updateTechnicianTaskStatusAction(formData);
      setResult(result, 'تم تحديث مسار المهمة وتسجيلها في السجل بنجاح.');
      if (!result.error) setTaskStatuses((current) => ({ ...current, [selectedTask.id]: targetStatus }));
    });
  };

  const handleToggleChecklist = (item: ChecklistItem, stage: string) => {
    if (!selectedTask) return;
    if (item.requiresNote) {
      setActiveChecklistEvidence({ item, stage });
      setChecklistNote('');
      return;
    }

    const key = `${selectedTask.id}:${item.id}`;
    const nextValue = !checkedItems[key];
    setCheckedItems((current) => ({ ...current, [key]: nextValue }));
    startTransition(async () => {
      const formData = new FormData();
      formData.set('bookingId', selectedTask.id);
      formData.set('itemId', item.id);
      formData.set('isChecked', String(nextValue));
      const result = await toggleChecklistItemAction(formData);
      if (result.error) setCheckedItems((current) => ({ ...current, [key]: !nextValue }));
      setResult(result, 'تم حفظ حالة عنصر الفحص.');
    });
  };

  const handleSubmitChecklistEvidence = () => {
    if (!selectedTask || !activeChecklistEvidence) return;
    const { item } = activeChecklistEvidence;
    if (item.requiresNote && checklistNote.trim().length < 3) {
      setFeedback({ kind: 'error', message: 'يرجى كتابة ملاحظة واضحة ومفصلة من 3 أحرف على الأقل.' });
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set('bookingId', selectedTask.id);
      formData.set('itemId', item.id);
      formData.set('isChecked', 'true');
      if (checklistNote.trim()) formData.set('note', checklistNote.trim());
      const result = await toggleChecklistItemAction(formData);
      setResult(result, 'تم حفظ الملاحظة واعتماد بند الفحص.');
      if (!result.error) {
        setCheckedItems((current) => ({ ...current, [`${selectedTask.id}:${item.id}`]: true }));
        setActiveChecklistEvidence(null);
        setChecklistNote('');
      }
    });
  };

  const handleSubmitNote = () => {
    if (!selectedTask || !activeNoteType || noteText.trim().length < 3) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set('bookingId', selectedTask.id);
      formData.set('type', activeNoteType);
      formData.set('text', noteText.trim());
      const result = await recordTechnicianNoteAction(formData);
      setResult(result, 'تم إرسال البلاغ لغرفة العمليات وتوثيقه بنجاح.');
      if (!result.error) {
        setActiveNoteType(null);
        setNoteText('');
      }
    });
  };

  if (!selectedTask) {
    return (
      <div className="rounded-3xl border border-white/[0.08] bg-[#111114]/90 p-10 text-center shadow-xl backdrop-blur-md">
        <Sparkles className="mx-auto size-8 text-[#cea355] mb-3 opacity-60" />
        <p className="text-base font-black text-white">لا توجد مهام مسندة إليك حالياً</p>
        <p className="mt-1 text-xs text-neutral-400">ستظهر المهام الميدانية هنا فور إسنادها من إدارة التشغيل.</p>
      </div>
    );
  }

  const assignedVehicle = selectedTask.operationalVehicle || (teamVehicles.length > 0 ? teamVehicles[0] : null);
  const statusInfo = STATUS_AR_LABELS[currentStatus] ?? { label: currentStatus, tone: 'border-white/20 bg-white/5 text-white' };

  return (
    <div className="space-y-5 pb-24 sm:pb-8">
      {/* 1. HORIZONTAL TASK SELECTOR (Mobile-First Pill Carousel) */}
      <nav className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none" aria-label="مهام اليوم الميدانية">
        {bookings.map((booking) => {
          const isSelected = selectedTask.id === booking.id;
          const taskStatus = taskStatuses[booking.id] ?? booking.bookingStatus;
          const isDone = taskStatus === 'DELIVERED' || taskStatus === 'SERVICE_COMPLETED';
          const isInProgress = taskStatus === 'IN_SERVICE' || taskStatus === 'ARRIVED' || taskStatus === 'ON_THE_WAY';

          return (
            <button
              key={booking.id}
              type="button"
              onClick={() => setSelectedTaskId(booking.id)}
              aria-current={isSelected ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-right transition-all active:scale-[0.98] ${
                isSelected
                  ? 'border-[#cea355] bg-gradient-to-r from-[#cea355]/20 via-neutral-900 to-[#cea355]/10 text-white shadow-lg shadow-[#cea355]/15'
                  : 'border-white/[0.08] bg-[#111114]/80 text-neutral-400 hover:border-white/20 hover:text-neutral-200'
              }`}
            >
              <span className={`size-2 rounded-full shrink-0 ${
                isDone ? 'bg-emerald-400' : isInProgress ? 'bg-[#cea355] animate-pulse' : 'bg-neutral-500'
              }`} />
              <div className="min-w-0">
                <p className={`font-mono text-xs font-black ${isSelected ? 'text-white' : 'text-neutral-300'}`}>
                  {booking.bookingNumber}
                </p>
                <p className="text-[10px] text-neutral-400 truncate max-w-[120px]">
                  {formatTimeOnly(booking.startAt)} · {booking.service.nameAr}
                </p>
              </div>
            </button>
          );
        })}
      </nav>

      {/* 2. MAIN TASK CARD */}
      <article className="space-y-5 rounded-3xl border border-[#cea355]/25 bg-[#111114]/95 p-4 sm:p-6 shadow-2xl backdrop-blur-md">
        {/* Task Header */}
        <header className="flex flex-col gap-3.5 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5 text-right">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                isLeader
                  ? 'border border-[#cea355]/50 bg-[#cea355]/15 text-[#f3e4a8]'
                  : 'border border-neutral-700 bg-neutral-800 text-neutral-300'
              }`}>
                {isLeader ? 'قائد الفريق المسؤول' : 'فني تنفيذ'}
              </span>
              {teamName && (
                <span className="text-xs font-bold text-neutral-400">
                  فريق {teamName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-xl sm:text-2xl font-black text-white tracking-wider">
                {selectedTask.bookingNumber}
              </h2>
              <span className="text-sm font-bold text-neutral-300">· {selectedTask.service.nameAr}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black ${statusInfo.tone}`}>
              <span className="size-1.5 rounded-full bg-current animate-pulse" />
              {statusInfo.label}
            </span>
            {assignedVehicle ? (
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-neutral-300 bg-black/40 border border-white/5 rounded-lg px-2.5 py-1">
                <Car className="size-3.5 text-[#cea355]" aria-hidden="true" />
                سيارة التشغيل: <strong className="text-white font-mono">{assignedVehicle.code}</strong>
                {assignedVehicle.plateNumber ? <span className="text-neutral-400 font-mono text-[10px]">({assignedVehicle.plateNumber})</span> : ''}
              </span>
            ) : null}
          </div>
        </header>

        {/* Global Feedback Banner */}
        {feedback ? (
          <div
            role="status"
            aria-live="polite"
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-bold ${
              feedback.kind === 'error'
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
            }`}
          >
            <span>{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-neutral-400 hover:text-white p-1"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        {/* 3. QUICK FIELD ACTIONS (Call, WhatsApp, Maps Navigation) */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <a
            href={phoneHref(selectedTask.customer.user.phone)}
            className="flex min-h-12 flex-col sm:flex-row items-center justify-center gap-1.5 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-2 text-center text-xs font-black text-sky-200 transition-all hover:bg-sky-500/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <Phone className="size-4 text-sky-400" aria-hidden="true" />
            <span>اتصال</span>
          </a>
          <a
            href={whatsappHref(
              selectedTask.customer.user.whatsapp ?? selectedTask.customer.user.phone,
              `مرحبًا، نتواصل معك من فريق بريق للعناية بالسيارات بخصوص حجز رقم ${selectedTask.bookingNumber}`
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-12 flex-col sm:flex-row items-center justify-center gap-1.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-center text-xs font-black text-emerald-200 transition-all hover:bg-emerald-500/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <MessageSquare className="size-4 text-emerald-400" aria-hidden="true" />
            <span>واتساب</span>
          </a>
          {sanitizeLocationUrl(selectedTask.locationUrl) ? (
            <a
              href={sanitizeLocationUrl(selectedTask.locationUrl)!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 flex-col sm:flex-row items-center justify-center gap-1.5 rounded-2xl border border-[#cea355]/40 bg-[#cea355]/10 p-2 text-center text-xs font-black text-[#f3e4a8] transition-all hover:bg-[#cea355]/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cea355]"
            >
              <Navigation className="size-4 text-[#cea355]" aria-hidden="true" />
              <span>الخرائط</span>
            </a>
          ) : (
            <div className="flex min-h-12 flex-col sm:flex-row items-center justify-center gap-1.5 rounded-2xl border border-neutral-800 bg-neutral-900/60 p-2 text-center text-xs font-bold text-neutral-500 cursor-not-allowed">
              <MapPin className="size-4" aria-hidden="true" />
              <span>لا يوجد رابط</span>
            </div>
          )}
        </div>

        {/* 4. INTERACTIVE VISUAL WORKFLOW STEPPER */}
        <section className="rounded-2xl border border-white/[0.08] bg-black/40 p-4 sm:p-5 space-y-3.5" aria-labelledby="stepper-heading">
          <div className="flex items-center justify-between">
            <h3 id="stepper-heading" className="flex items-center gap-2 text-xs font-black text-[#f3e4a8]">
              <Sparkles className="size-4 text-[#cea355]" />
              مسار تنفيذ المهمة الميداني
            </h3>
            <span className="text-[11px] font-bold text-neutral-400">
              مرحلة {currentStatus}
            </span>
          </div>

          {/* Stepper Timeline Buttons */}
          <div className="grid gap-2 sm:grid-cols-2">
            {WORKFLOW_STEPS.map((step) => {
              const enabled = currentStatus === step.from;
              const stepIdx = WORKFLOW_STEPS.findIndex((candidate) => candidate.to === currentStatus);
              const completed = stepIdx >= (step.stepNumber - 1);
              const isCurrent = enabled;
              const blockedByMaterials = step.to === 'IN_SERVICE' && hasMaterialBlocker;

              return (
                <button
                  key={step.to}
                  data-testid={`workflow-${step.to}`}
                  type="button"
                  disabled={!enabled || isPending || blockedByMaterials}
                  onClick={() => handleStatusChange(step.to)}
                  className={`group relative flex items-start gap-3 rounded-xl border p-3 text-right transition-all active:scale-[0.98] ${
                    isCurrent
                      ? 'border-[#cea355] bg-gradient-to-r from-[#cea355]/20 via-neutral-900 to-[#cea355]/10 shadow-lg shadow-[#cea355]/15 ring-2 ring-[#cea355]/30'
                      : completed
                      ? 'border-emerald-500/20 bg-emerald-500/[0.04] text-neutral-300'
                      : 'border-white/5 bg-neutral-950/40 text-neutral-500 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-black mt-0.5 ${
                    completed
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : isCurrent
                      ? 'bg-[#cea355] text-neutral-950 font-black shadow-md'
                      : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                  }`}>
                    {completed ? <Check className="size-3.5" /> : step.stepNumber}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-black ${isCurrent ? 'text-[#f3e4a8]' : completed ? 'text-neutral-200' : 'text-neutral-400'}`}>
                      {step.label}
                    </p>
                    <p className="mt-0.5 text-[10px] text-neutral-400 leading-4">
                      {blockedByMaterials ? 'يوجد نقص بالمواد المطلوبة يمنع البدء.' : step.helper}
                    </p>
                  </div>

                  {isCurrent && (
                    <span className="size-2 rounded-full bg-[#cea355] animate-ping shrink-0 self-center" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* 5. COLLAPSIBLE: CUSTOMER & VEHICLE DETAILS */}
        <section className="rounded-2xl border border-white/[0.08] bg-black/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowCustomerDetails(!showCustomerDetails)}
            className="flex w-full items-center justify-between p-4 text-right hover:bg-white/[0.02]"
          >
            <span className="flex items-center gap-2 text-xs font-black text-white">
              <User className="size-4 text-[#cea355]" />
              بيانات العميل، السيارة، والموقع التفصيلي
            </span>
            {showCustomerDetails ? <ChevronUp className="size-4 text-neutral-400" /> : <ChevronDown className="size-4 text-neutral-400" />}
          </button>

          {showCustomerDetails && (
            <div className="border-t border-white/[0.06] p-4 pt-3.5 space-y-3 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-[#141418] border border-white/5 p-3">
                  <span className="text-[10px] font-bold text-neutral-400">العميل</span>
                  <p className="mt-0.5 text-sm font-black text-white">{selectedTask.customer.user.fullName}</p>
                  <p className="mt-1 text-xs text-neutral-300 font-mono" dir="ltr">{selectedTask.customer.user.phone}</p>
                </div>

                <div className="rounded-xl bg-[#141418] border border-white/5 p-3">
                  <span className="text-[10px] font-bold text-neutral-400">السيارة المستهدفة</span>
                  <p className="mt-0.5 text-sm font-black text-white flex items-center gap-1.5">
                    <Car className="size-4 text-[#cea355]" />
                    {selectedTask.vehicle.make} {selectedTask.vehicle.model} · {selectedTask.vehicle.color}
                  </p>
                  {selectedTask.vehicle.plateNumber && (
                    <p className="mt-1 text-xs font-mono font-bold text-amber-200">
                      لوحة: {selectedTask.vehicle.plateNumber}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-[#141418] border border-white/5 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Clock className="size-3.5 text-[#cea355]" />
                  <span className="text-[11px] font-bold text-neutral-300">
                    الموعد المحدد: <strong className="text-white">{new Date(selectedTask.startAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</strong>
                  </span>
                </div>
                {selectedTask.assignedEmployee ? (
                  <div className="flex items-center gap-2 text-neutral-300">
                    <Shield className="size-3.5 text-[#cea355]" />
                    <span>الفني المخصص: <strong className="text-[#f3e4a8]">{selectedTask.assignedEmployee.fullName}</strong></span>
                  </div>
                ) : null}
              </div>

              {formatAddressSnapshot(selectedTask.addressSnapshot) ? (
                <div className="rounded-xl border border-white/5 bg-[#141418] p-3 text-neutral-200">
                  <p className="text-[11px] font-black text-[#f3e4a8] flex items-center gap-1.5 mb-1">
                    <MapPin className="size-3.5 text-[#cea355]" />
                    العنوان التفصيلي:
                  </p>
                  <p className="text-xs leading-5 text-neutral-300">{formatAddressSnapshot(selectedTask.addressSnapshot)}</p>
                </div>
              ) : null}

              {selectedTask.gateInstructions ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">
                  <p className="text-[11px] font-black flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="size-3.5 text-amber-400" />
                    تعليمات الدخول والبوابة:
                  </p>
                  <p className="text-xs leading-5">{selectedTask.gateInstructions}</p>
                </div>
              ) : null}
            </div>
          )}
        </section>

        {/* 6. COLLAPSIBLE: REQUIRED MATERIALS & STOCK */}
        <section className="rounded-2xl border border-white/[0.08] bg-black/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowMaterials(!showMaterials)}
            className="flex w-full items-center justify-between p-4 text-right hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-2">
              <Boxes className="size-4 text-[#cea355]" />
              <span className="text-xs font-black text-white">مواد ومستلزمات الخدمة المطلوبة</span>
              {selectedTask.requiredMaterials.length ? (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  hasMaterialBlocker ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                }`}>
                  {hasMaterialBlocker ? 'نقص مواد' : 'جاهزة'}
                </span>
              ) : null}
            </div>
            {showMaterials ? <ChevronUp className="size-4 text-neutral-400" /> : <ChevronDown className="size-4 text-neutral-400" />}
          </button>

          {showMaterials && (
            <div className="border-t border-white/[0.06] p-4 pt-3.5 space-y-2.5">
              {selectedTask.requiredMaterials.length ? (
                <div className="space-y-2">
                  {selectedTask.requiredMaterials.map((material) => {
                    const formattedRequired = formatMaterialQuantityWithUnit(material.quantityRequired, material.unit);
                    const formattedAvailable = formatMaterialQuantityWithUnit(material.availableQuantity, material.unit);

                    return (
                      <div
                        key={material.requirementId}
                        className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${
                          material.ready
                            ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
                            : material.required
                            ? 'border-rose-500/30 bg-rose-500/[0.06]'
                            : 'border-amber-500/20 bg-amber-500/[0.04]'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-bold text-white">{material.nameAr}</p>
                          <p className="mt-1 text-[11px] text-neutral-400">
                            المطلوب: <strong className="text-white font-bold">{formattedRequired.fullDescription}</strong> · المتاح بالفرع: {formattedAvailable.primary}
                          </p>
                          {material.notes ? <p className="mt-1 text-[10px] text-amber-200">{material.notes}</p> : null}
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold shrink-0 ${
                          material.ready
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : material.required
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          {material.ready ? '✓ متاح' : material.required ? 'رصيد غير كافٍ' : 'اختياري'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-neutral-800 bg-black/40 p-4 text-center text-xs text-neutral-500">
                  لم تُسجل مواد مستهلكة مطلوبة لهذه الخدمة في الكتالوج.
                </p>
              )}
            </div>
          )}
        </section>

        {/* 7. COLLAPSIBLE: EXECUTION CHECKLISTS */}
        <section className="rounded-2xl border border-white/[0.08] bg-black/40 overflow-hidden" aria-labelledby="checklist-title">
          <button
            type="button"
            onClick={() => setShowChecklist(!showChecklist)}
            className="flex w-full items-center justify-between p-4 text-right hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-2">
              <ListChecks className="size-4 text-[#cea355]" />
              <span id="checklist-title" className="text-xs font-black text-white">
                قوائم مهام وتشيك ليست التنفيذ
              </span>
            </div>
            {showChecklist ? <ChevronUp className="size-4 text-neutral-400" /> : <ChevronDown className="size-4 text-neutral-400" />}
          </button>

          {showChecklist && (
            <div className="border-t border-white/[0.06] p-4 pt-3.5 space-y-4">
              {selectedTask.service.checklistTemplates.length ? (
                selectedTask.service.checklistTemplates.map((template) => {
                  const stageEditable = canEditChecklistStage(template.stage, currentStatus);

                  return (
                    <fieldset
                      key={template.id}
                      className={`space-y-2.5 rounded-2xl border p-4 transition-all ${
                        stageEditable
                          ? 'border-[#cea355]/30 bg-[#141418]'
                          : 'border-white/5 bg-black/30 opacity-60'
                      }`}
                    >
                      <legend className="px-2 text-xs font-black text-[#f3e4a8] flex items-center gap-2">
                        <span className={`size-2 rounded-full ${stageEditable ? 'bg-[#cea355]' : 'bg-neutral-500'}`} />
                        {template.name}
                        {!stageEditable && <span className="text-[10px] font-normal text-neutral-400">(مغلقة في هذه المرحلة)</span>}
                      </legend>

                      <div className="space-y-2 pt-1">
                        {template.items
                          .toSorted((a, b) => a.displayOrder - b.displayOrder)
                          .map((item) => {
                            const key = `${selectedTask.id}:${item.id}`;
                            const isChecked = Boolean(checkedItems[key]);

                            return (
                              <button
                                key={item.id}
                                data-testid={`checklist-item-${item.id}`}
                                type="button"
                                disabled={isPending || !stageEditable}
                                aria-pressed={isChecked}
                                onClick={() => handleToggleChecklist(item, template.stage)}
                                className={`flex w-full items-start gap-3.5 rounded-xl border p-3 text-right transition-all active:scale-[0.99] ${
                                  isChecked
                                    ? 'border-emerald-500/30 bg-emerald-500/[0.06] text-neutral-200'
                                    : stageEditable
                                    ? 'border-white/10 bg-black/40 hover:border-[#cea355]/50 text-white'
                                    : 'border-white/5 bg-black/20 text-neutral-500 cursor-not-allowed'
                                }`}
                              >
                                <div className="mt-0.5 shrink-0">
                                  {isChecked ? (
                                    <CheckSquare className="size-5 text-emerald-400" aria-hidden="true" />
                                  ) : (
                                    <Square className="size-5 text-neutral-500" aria-hidden="true" />
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className={`text-xs font-bold ${isChecked ? 'text-neutral-400 line-through' : 'text-white'}`}>
                                      {item.labelAr}
                                    </p>
                                    {item.required && (
                                      <span className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.2 text-[9px] font-bold text-rose-300 shrink-0">
                                        إلزامي
                                      </span>
                                    )}
                                  </div>
                                  {item.descriptionAr && (
                                    <p className="mt-1 text-[10px] text-neutral-400">{item.descriptionAr}</p>
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
                })
              ) : (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center text-xs text-amber-200">
                  لا توجد قوالب فحص محددة لهذه الخدمة.
                </div>
              )}
            </div>
          )}
        </section>

        {/* 8. FIELD INCIDENT REPORTS */}
        <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-black/40 p-4" aria-labelledby="notes-heading">
          <h3 id="notes-heading" className="text-xs font-black text-white flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-400" />
            بلاغات الطوارئ الميدانية
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setActiveNoteType('PROBLEM')}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20 active:scale-[0.98]"
            >
              <AlertTriangle className="size-3.5" />
              <span>مشكلة بالموقع</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveNoteType('EXTRA_TIME')}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2 text-xs font-bold text-amber-300 hover:bg-amber-500/20 active:scale-[0.98]"
            >
              <Clock className="size-3.5" />
              <span>وقت إضافي</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveNoteType('ADDON_REQUEST')}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 active:scale-[0.98]"
            >
              <PlusCircle className="size-3.5" />
              <span>طلب إضافة</span>
            </button>
          </div>
        </section>
      </article>

      {/* 9. STICKY MOBILE ACTION BAR (Thumb Zone Optimized) */}
      {nextAvailableStep && (
        <div className="fixed bottom-3 left-3 right-3 max-w-2xl mx-auto z-40">
          <div className="rounded-3xl border border-[#cea355]/40 bg-[#141418]/95 p-2 shadow-2xl backdrop-blur-md">
            <button
              type="button"
              disabled={isPending || (nextAvailableStep.to === 'IN_SERVICE' && hasMaterialBlocker)}
              onClick={() => handleStatusChange(nextAvailableStep.to)}
              className="flex w-full min-h-14 items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#cea355] via-[#f3e4a8] to-[#cea355] px-6 text-sm font-black text-neutral-950 shadow-xl shadow-[#cea355]/25 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="size-5" />
              <span>{nextAvailableStep.label}</span>
            </button>
          </div>
        </div>
      )}

      {/* 10. MODAL: EVIDENCE / NOTE INPUT */}
      {activeChecklistEvidence && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur-sm p-4" role="presentation">
          <div role="dialog" aria-modal="true" className="w-full max-w-md space-y-4 rounded-3xl border border-[#cea355]/40 bg-[#141418] p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h4 className="text-sm font-black text-white flex items-center gap-2">
                <FileText className="size-4 text-[#cea355]" />
                توثيق ملاحظة بند الفحص
              </h4>
              <button
                type="button"
                onClick={() => setActiveChecklistEvidence(null)}
                className="rounded-xl p-1.5 text-neutral-400 hover:bg-neutral-800"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="text-xs font-bold text-[#f3e4a8] bg-[#cea355]/10 border border-[#cea355]/20 rounded-xl p-3">
              {activeChecklistEvidence.item.labelAr}
            </p>

            <div>
              <label htmlFor="checklist-note" className="mb-1.5 block text-xs font-bold text-neutral-300">
                الملاحظة الميدانية المطلوبة
              </label>
              <textarea
                id="checklist-note"
                value={checklistNote}
                onChange={(event) => setChecklistNote(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="اكتب ما تم فحصه أو ملاحظتك على العنصر..."
                className="w-full rounded-xl border border-white/10 bg-black/50 p-3 text-xs text-white outline-none transition focus:border-[#cea355] focus:ring-2 focus:ring-[#cea355]/20"
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
                disabled={isPending || (activeChecklistEvidence.item.requiresNote && checklistNote.trim().length < 3)}
                onClick={handleSubmitChecklistEvidence}
                className="min-h-11 rounded-xl bg-gradient-to-r from-[#cea355] to-[#f3e4a8] text-xs font-black text-neutral-950 hover:brightness-110 disabled:opacity-50"
              >
                حفظ واعتماد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. MODAL: FIELD INCIDENT REPORT */}
      {activeNoteType && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 backdrop-blur-sm p-4" role="presentation">
          <div role="dialog" aria-modal="true" className="w-full max-w-md space-y-4 rounded-3xl border border-amber-500/40 bg-[#141418] p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h4 className="text-sm font-black text-white flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-400" />
                تسجيل بلاغ ميداني لغرفة العمليات
              </h4>
              <button
                type="button"
                onClick={() => setActiveNoteType(null)}
                className="rounded-xl p-1.5 text-neutral-400 hover:bg-neutral-800"
              >
                <X className="size-4" />
              </button>
            </div>

            <div>
              <label htmlFor="field-note" className="mb-1.5 block text-xs font-bold text-neutral-300">
                تفاصيل البلاغ أو المشكلة
              </label>
              <textarea
                id="field-note"
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="اكتب ما حدث في الموقع وما الإجراء المطلوب من إدارة التشغيل..."
                className="w-full rounded-xl border border-white/10 bg-black/50 p-3 text-xs text-white outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setActiveNoteType(null)}
                className="min-h-11 rounded-xl border border-neutral-700 bg-neutral-800 text-xs font-bold text-neutral-300 hover:bg-neutral-700"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={isPending || noteText.trim().length < 3}
                onClick={handleSubmitNote}
                className="min-h-11 rounded-xl bg-amber-500 text-xs font-black text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
              >
                إرسال البلاغ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
