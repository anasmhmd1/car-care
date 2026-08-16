'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  AlertTriangle,
  Camera,
  Car,
  Boxes,
  CheckCircle2,
  CheckSquare,
  Clock,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  PlusCircle,
  Square,
} from 'lucide-react';
import {
  recordTechnicianNoteAction,
  toggleChecklistItemAction,
  updateTechnicianTaskStatusAction,
  uploadTechnicianPhotoAction,
} from '@/app/actions/technician';
import { advancePostServiceAction } from '@/app/actions/quality';
import { phoneHref, whatsappHref } from '@/lib/contact-links';
import { prepareImageForUpload } from '@/lib/client/image-upload';

type WorkflowStatus =
  | 'ASSIGNED'
  | 'TEAM_ACKNOWLEDGED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'IN_SERVICE'
  | 'QUALITY_REVIEW'
  | 'SERVICE_COMPLETED'
  | 'DELIVERED';

type PhotoType = 'BEFORE_SERVICE' | 'EXISTING_DAMAGE' | 'DURING_SERVICE' | 'AFTER_SERVICE';
type NoteType = 'PROBLEM' | 'EXTRA_TIME' | 'ADDON_REQUEST';

interface ChecklistItem {
  id: string;
  labelAr: string;
  descriptionAr: string | null;
  required: boolean;
  requiresPhoto: boolean;
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
  bookings: TechnicianBooking[];
}

const WORKFLOW_STEPS: Array<{
  from: WorkflowStatus;
  to: WorkflowStatus;
  label: string;
  helper: string;
}> = [
  { from: 'ASSIGNED', to: 'TEAM_ACKNOWLEDGED', label: 'تأكيد استلام المهمة', helper: 'راجع بيانات العميل والموقع أولًا' },
  { from: 'TEAM_ACKNOWLEDGED', to: 'ON_THE_WAY', label: 'بدء التحرك', helper: 'سجّل انطلاق الفريق نحو العميل' },
  { from: 'ON_THE_WAY', to: 'ARRIVED', label: 'تأكيد الوصول', helper: 'ابدأ فحص الوصول وتوثيق السيارة' },
  { from: 'ARRIVED', to: 'IN_SERVICE', label: 'بدء الخدمة', helper: 'يتطلب فحص الوصول وصور ما قبل الخدمة' },
  { from: 'IN_SERVICE', to: 'QUALITY_REVIEW', label: 'إرسال لمراجعة الجودة', helper: 'يتطلب إكمال القوائم وصور ما بعد الخدمة' },
  { from: 'SERVICE_COMPLETED', to: 'DELIVERED', label: 'تأكيد تسليم الخدمة', helper: 'استخدمه بعد اعتماد الجودة وتسليم السيارة للعميل' },
];

const PHOTO_CONFIG: Record<PhotoType, { label: string; category: string }> = {
  BEFORE_SERVICE: { label: 'قبل الخدمة', category: 'before-photos' },
  EXISTING_DAMAGE: { label: 'تلف سابق', category: 'existing-damage' },
  DURING_SERVICE: { label: 'أثناء الخدمة', category: 'during-photos' },
  AFTER_SERVICE: { label: 'بعد الخدمة', category: 'after-photos' },
};

const STAGE_LABELS: Record<string, string> = {
  BOOKING_REVIEW: 'مراجعة الحجز',
  TEAM_PREPARATION: 'تحضير الفريق',
  ARRIVAL_INSPECTION: 'فحص الوصول',
  SERVICE_EXECUTION: 'تنفيذ الخدمة',
  CLOSING: 'الإغلاق الميداني',
  QUALITY_REVIEW: 'مراجعة الجودة',
};

const CHECKLIST_STAGE_STATUS: Record<string, readonly string[]> = {
  TEAM_PREPARATION: ['TEAM_ACKNOWLEDGED', 'ON_THE_WAY', 'ARRIVED'],
  ARRIVAL_INSPECTION: ['ARRIVED'],
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

export default function TechnicianTaskClient({ employee, bookings }: Props) {
  const [selectedTaskId, setSelectedTaskId] = useState(bookings[0]?.id ?? '');
  const [photoType, setPhotoType] = useState<PhotoType>('BEFORE_SERVICE');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [activeNoteType, setActiveNoteType] = useState<NoteType | null>(null);
  const [noteText, setNoteText] = useState('');
  const [activeChecklistEvidence, setActiveChecklistEvidence] = useState<ActiveChecklistEvidence | null>(null);
  const [checklistNote, setChecklistNote] = useState('');
  const [checklistPhoto, setChecklistPhoto] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() => initialChecklistState(bookings));
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(bookings.map((booking) => [booking.id, booking.bookingStatus])),
  );
  const [isPending, startTransition] = useTransition();

  const selectedTask = useMemo(
    () => bookings.find((booking) => booking.id === selectedTaskId) ?? bookings[0] ?? null,
    [bookings, selectedTaskId],
  );
  const currentStatus = selectedTask ? (taskStatuses[selectedTask.id] ?? selectedTask.bookingStatus) : '';
  const hasMaterialBlocker = Boolean(selectedTask?.requiredMaterials.some((material) => material.required && !material.ready));
  const allowedPhotoTypes: PhotoType[] = currentStatus === 'ARRIVED'
    ? ['BEFORE_SERVICE', 'EXISTING_DAMAGE']
    : currentStatus === 'IN_SERVICE'
      ? ['DURING_SERVICE', 'AFTER_SERVICE']
      : [];
  const effectivePhotoType = allowedPhotoTypes.includes(photoType)
    ? photoType
    : allowedPhotoTypes[0] ?? photoType;

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
      setResult(result, 'تم تحديث حالة المهمة وتسجيلها في السجل.');
      if (!result.error) setTaskStatuses((current) => ({ ...current, [selectedTask.id]: targetStatus }));
    });
  };

  const handleUploadPhoto = () => {
    if (!selectedTask || !photoFile) {
      setFeedback({ kind: 'error', message: 'اختر صورة من الجهاز أولًا.' });
      return;
    }

    startTransition(async () => {
      const preparedPhoto = await prepareImageForUpload(photoFile);
      const uploadData = new FormData();
      uploadData.set('file', preparedPhoto);
      uploadData.set('bookingId', selectedTask.id);
      uploadData.set('category', PHOTO_CONFIG[effectivePhotoType].category);
      const response = await fetch('/api/upload', { method: 'POST', body: uploadData });
      const uploaded = await response.json() as { error?: string; bookingFileId?: string };
      if (!response.ok || !uploaded.bookingFileId) {
        setFeedback({ kind: 'error', message: uploaded.error ?? 'تعذر رفع الصورة.' });
        return;
      }

      const confirmData = new FormData();
      confirmData.set('bookingId', selectedTask.id);
      confirmData.set('bookingFileId', uploaded.bookingFileId);
      const result = await uploadTechnicianPhotoAction(confirmData);
      setResult(result, `تم توثيق صورة ${PHOTO_CONFIG[effectivePhotoType].label}.`);
      if (!result.error) setPhotoFile(null);
    });
  };

  const handleToggleChecklist = (item: ChecklistItem, stage: string) => {
    if (!selectedTask) return;
    if (item.requiresPhoto || item.requiresNote) {
      setActiveChecklistEvidence({ item, stage });
      setChecklistNote('');
      setChecklistPhoto(null);
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
      setResult(result, 'تم حفظ عنصر الفحص.');
    });
  };

  const handleSubmitChecklistEvidence = () => {
    if (!selectedTask || !activeChecklistEvidence) return;
    const { item, stage } = activeChecklistEvidence;
    if (item.requiresPhoto && !checklistPhoto) {
      setFeedback({ kind: 'error', message: 'اختر الصورة المطلوبة لعنصر الفحص.' });
      return;
    }
    if (item.requiresNote && checklistNote.trim().length < 3) {
      setFeedback({ kind: 'error', message: 'اكتب ملاحظة واضحة لعنصر الفحص.' });
      return;
    }

    startTransition(async () => {
      let photoFileId: string | undefined;
      if (checklistPhoto) {
        const preparedChecklistPhoto = await prepareImageForUpload(checklistPhoto);
        const category = stage === 'ARRIVAL_INSPECTION'
          ? 'before-photos'
          : stage === 'CLOSING'
            ? 'after-photos'
            : 'during-photos';
        const uploadData = new FormData();
        uploadData.set('file', preparedChecklistPhoto);
        uploadData.set('bookingId', selectedTask.id);
        uploadData.set('category', category);
        const response = await fetch('/api/upload', { method: 'POST', body: uploadData });
        const uploaded = await response.json() as { error?: string; bookingFileId?: string };
        if (!response.ok || !uploaded.bookingFileId) {
          setFeedback({ kind: 'error', message: uploaded.error ?? 'تعذر رفع صورة عنصر الفحص.' });
          return;
        }
        photoFileId = uploaded.bookingFileId;
      }

      const formData = new FormData();
      formData.set('bookingId', selectedTask.id);
      formData.set('itemId', item.id);
      formData.set('isChecked', 'true');
      if (checklistNote.trim()) formData.set('note', checklistNote.trim());
      if (photoFileId) formData.set('photoFileId', photoFileId);
      const result = await toggleChecklistItemAction(formData);
      setResult(result, 'تم حفظ دليل عنصر الفحص واعتماده.');
      if (!result.error) {
        setCheckedItems((current) => ({ ...current, [`${selectedTask.id}:${item.id}`]: true }));
        setActiveChecklistEvidence(null);
        setChecklistNote('');
        setChecklistPhoto(null);
      }
    });
  };

  const handleSubmitNote = () => {
    if (!selectedTask || !activeNoteType || noteText.trim().length < 3) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set('bookingId', selectedTask.id);
      formData.set('noteType', activeNoteType);
      formData.set('text', noteText.trim());
      const result = await recordTechnicianNoteAction(formData);
      setResult(result, 'تم تسجيل الملاحظة في سجل الحجز.');
      if (!result.error) {
        setActiveNoteType(null);
        setNoteText('');
      }
    });
  };

  if (!selectedTask) {
    return (
      <section className="rounded-3xl border border-neutral-800 bg-[#141414] p-10 text-center" aria-labelledby="empty-tasks-title">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" aria-hidden="true" />
        <h2 id="empty-tasks-title" className="mt-3 text-base font-black text-white">لا توجد مهام مسندة لفريقك الآن</h2>
        <p className="mt-1 text-xs text-neutral-400">ستظهر المهمة هنا فور إسنادها من مدير التشغيل.</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="المهام المسندة">
        {bookings.map((booking) => (
          <button
            key={booking.id}
            type="button"
            onClick={() => setSelectedTaskId(booking.id)}
            aria-current={selectedTask.id === booking.id ? 'page' : undefined}
            className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c45a] ${
              selectedTask.id === booking.id
                ? 'border-[#e5c45a] bg-[#e5c45a] text-[#080808]'
                : 'border-neutral-800 bg-[#141414] text-neutral-300'
            }`}
          >
            {booking.bookingNumber} · {booking.service.nameAr}
          </button>
        ))}
      </nav>

      <article className="space-y-6 rounded-3xl border border-[#c9a227]/30 bg-[#141414] p-5 sm:p-6">
        <header className="flex items-start justify-between gap-4 border-b border-neutral-800 pb-4">
          <div>
            <p className="text-[11px] text-neutral-400">مهمة {employee.fullName}</p>
            <h2 className="mt-1 text-xl font-black text-white">{selectedTask.bookingNumber}</h2>
          </div>
          <span className="rounded-full border border-[#c9a227]/40 bg-[#c9a227]/10 px-3 py-1 text-[11px] font-extrabold text-[#e5c45a]">
            {currentStatus}
          </span>
        </header>

        {feedback ? (
          <div
            role="status"
            aria-live="polite"
            className={`rounded-xl border px-4 py-3 text-xs ${feedback.kind === 'error'
              ? 'border-red-500/40 bg-red-500/10 text-red-200'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}
          >
            {feedback.message}
          </div>
        ) : null}

        <section className="grid gap-3 text-xs text-neutral-300 sm:grid-cols-2" aria-label="بيانات المهمة">
          <p><strong className="text-white">العميل:</strong> {selectedTask.customer.user.fullName}</p>
          <p className="flex items-center gap-1.5"><Car className="h-4 w-4 text-[#c9a227]" aria-hidden="true" /> {selectedTask.vehicle.make} {selectedTask.vehicle.model} · {selectedTask.vehicle.color}</p>
          <p><strong className="text-white">الخدمة:</strong> {selectedTask.service.nameAr}</p>
          <p><strong className="text-white">الموعد:</strong> {new Date(selectedTask.startAt).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          {selectedTask.assignedEmployee ? (
            <p><strong className="text-white">الفني المخصص:</strong> <span className="text-[#e5c45a] font-bold">{selectedTask.assignedEmployee.fullName}</span></p>
          ) : null}
          {formatAddressSnapshot(selectedTask.addressSnapshot) ? (
            <p className="sm:col-span-2 rounded-xl border border-neutral-800 bg-[#080808] p-3 text-neutral-200">
              <strong className="block text-[#e5c45a] mb-1 flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden="true" /> عنوان التنفيذ التفصيلي:</strong>
              {formatAddressSnapshot(selectedTask.addressSnapshot)}
            </p>
          ) : null}
          {selectedTask.gateInstructions ? (
            <p className="sm:col-span-2 rounded-xl border border-neutral-800 bg-[#080808] p-3 text-amber-200">
              <MapPin className="ml-1 inline h-4 w-4" aria-hidden="true" /> تعليمات الدخول: {selectedTask.gateInstructions}
            </p>
          ) : null}
        </section>

        <div className="grid gap-2 sm:grid-cols-3">
          <a className="flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-[#080808] p-3 text-xs font-bold text-[#e5c45a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c45a]" href={phoneHref(selectedTask.customer.user.phone)}><Phone className="h-4 w-4" aria-hidden="true" /> اتصال</a>
          <a className="flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-[#080808] p-3 text-xs font-bold text-[#e5c45a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c45a]" href={whatsappHref(selectedTask.customer.user.whatsapp ?? selectedTask.customer.user.phone, `مرحبًا، نتواصل معك بخصوص حجز بريق رقم ${selectedTask.bookingNumber}`)} target="_blank" rel="noopener noreferrer"><MessageSquare className="h-4 w-4" aria-hidden="true" /> واتساب</a>
          {sanitizeLocationUrl(selectedTask.locationUrl) ? (
            <a className="flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-[#080808] p-3 text-xs font-bold text-[#e5c45a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c45a]" href={sanitizeLocationUrl(selectedTask.locationUrl)!} target="_blank" rel="noopener noreferrer"><Navigation className="h-4 w-4" aria-hidden="true" /> فتح رابط الموقع</a>
          ) : (
            <span className="flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-[#080808] p-3 text-xs font-bold text-neutral-500"><MapPin className="h-4 w-4" aria-hidden="true" /> لا يوجد رابط موقع</span>
          )}
        </div>

        <section className="space-y-3 border-t border-neutral-800 pt-5" aria-labelledby="materials-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="materials-heading" className="flex items-center gap-2 text-sm font-black text-white"><Boxes className="size-4 text-[#e5c45a]" aria-hidden="true" />مواد الخدمة المطلوبة</h3>
              <p className="mt-1 text-[11px] text-neutral-400">المتاح هو رصيد الفرع بعد خصم الكمية المحجوزة. راجع مدير التشغيل قبل بدء الخدمة عند وجود نقص.</p>
            </div>
            {selectedTask.requiredMaterials.length ? (
              <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${hasMaterialBlocker ? 'border-red-400/35 bg-red-400/10 text-red-200' : 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200'}`}>
                {hasMaterialBlocker ? 'يوجد نقص يمنع بدء الخدمة' : 'جاهزية المواد مكتملة'}
              </span>
            ) : null}
          </div>
          {selectedTask.requiredMaterials.length ? (
            <div className="space-y-2">
              {selectedTask.requiredMaterials.map((material) => (
                <article key={material.requirementId} className={`rounded-xl border p-3 ${material.ready ? 'border-emerald-400/15 bg-emerald-400/[0.035]' : material.required ? 'border-red-400/25 bg-red-400/[0.055]' : 'border-amber-400/20 bg-amber-400/[0.04]'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-white">{material.nameAr}</p>
                      <p className="mt-1 text-[10px] text-neutral-400">المطلوب: {material.quantityRequired} {material.unit} · المتاح: {material.availableQuantity} {material.unit}{material.reservedQuantity ? ` · محجوز: ${material.reservedQuantity}` : ''}</p>
                      {material.notes ? <p className="mt-1 text-[10px] text-amber-200">{material.notes}</p> : null}
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${material.ready ? 'bg-emerald-400/10 text-emerald-200' : material.required ? 'bg-red-400/10 text-red-200' : 'bg-amber-400/10 text-amber-200'}`}>
                      {material.ready ? 'متاح' : !material.stockConfigured ? 'غير مهيأ في الفرع' : !material.stockActive || !material.materialActive ? 'صنف متوقف' : material.required ? 'رصيد غير كافٍ' : 'اختياري غير متاح'}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-neutral-700 bg-[#080808] p-3 text-xs text-neutral-500">لم تُسجل مواد مطلوبة لهذه الخدمة في الكتالوج.</p>
          )}
        </section>

        <section className="space-y-3 border-t border-neutral-800 pt-5" aria-labelledby="workflow-heading">
          <div>
            <h3 id="workflow-heading" className="text-sm font-black text-white">مسار تنفيذ المهمة</h3>
            <p className="mt-1 text-[11px] text-neutral-400">كل خطوة تُفتح بعد نجاح السابقة وتُسجل في سجل التدقيق.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {WORKFLOW_STEPS.map((step, index) => {
              const enabled = currentStatus === step.from;
              const completed = WORKFLOW_STEPS.findIndex((candidate) => candidate.to === currentStatus) >= index;
              const blockedByMaterials = step.to === 'IN_SERVICE' && hasMaterialBlocker;
              return (
                <button
                  key={step.to}
                  data-testid={`workflow-${step.to}`}
                  type="button"
                  disabled={!enabled || isPending || blockedByMaterials}
                  onClick={() => handleStatusChange(step.to)}
                  className="rounded-xl border border-neutral-800 bg-[#080808] p-3 text-right disabled:cursor-not-allowed disabled:opacity-45 enabled:hover:border-[#c9a227] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c45a]"
                >
                  <span className="block text-xs font-bold text-white">{completed ? '✓ ' : `${index + 1}. `}{step.label}</span>
                  <span className="mt-1 block text-[10px] text-neutral-400">{blockedByMaterials ? 'استكمل المواد المطلوبة أو تواصل مع مدير التشغيل.' : step.helper}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-4 border-t border-neutral-800 pt-5" aria-labelledby="checklist-heading">
          <div>
            <h3 id="checklist-heading" className="text-sm font-black text-white">قوائم التنفيذ</h3>
            <p className="mt-1 text-[11px] text-neutral-400">العناصر مأخوذة من قالب الخدمة، وليست قائمة نموذجية.</p>
          </div>
          {selectedTask.service.checklistTemplates.length ? selectedTask.service.checklistTemplates.map((template) => {
            const stageEditable = canEditChecklistStage(template.stage, currentStatus);
            return (
            <fieldset key={template.id} className={`space-y-2 rounded-2xl border border-neutral-800 bg-[#080808] p-4 ${stageEditable ? '' : 'opacity-55'}`}>
              <legend className="px-2 text-xs font-black text-[#e5c45a]">
                {STAGE_LABELS[template.stage] ?? template.name}
                {!stageEditable ? ' — مغلقة في هذه المرحلة' : ''}
              </legend>
              {template.items.toSorted((a, b) => a.displayOrder - b.displayOrder).map((item) => {
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
                    className="flex w-full items-start gap-3 rounded-xl p-2 text-right hover:bg-[#141414] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c45a]"
                  >
                    {isChecked ? <CheckSquare className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" /> : <Square className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" />}
                    <span>
                      <span className={`block text-xs font-medium ${isChecked ? 'text-neutral-500 line-through' : 'text-neutral-200'}`}>{item.labelAr}</span>
                      {item.descriptionAr ? <span className="mt-1 block text-[10px] text-neutral-500">{item.descriptionAr}</span> : null}
                      {item.requiresPhoto || item.requiresNote ? <span className="mt-1 block text-[10px] text-amber-300">{item.requiresPhoto ? 'يتطلب صورة' : ''}{item.requiresPhoto && item.requiresNote ? ' · ' : ''}{item.requiresNote ? 'يتطلب ملاحظة' : ''}</span> : null}
                    </span>
                  </button>
                );
              })}
            </fieldset>
            );
          }) : (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">لا يوجد قالب فحص منشور لهذه الخدمة. أبلغ مدير التشغيل.</p>
          )}
          {activeChecklistEvidence ? (
            <div className="space-y-3 rounded-2xl border border-[#c9a227]/40 bg-[#080808] p-4" role="group" aria-labelledby="checklist-evidence-title">
              <div>
                <h4 id="checklist-evidence-title" className="text-xs font-black text-white">استكمال دليل عنصر الفحص</h4>
                <p className="mt-1 text-[11px] text-neutral-400">{activeChecklistEvidence.item.labelAr}</p>
              </div>
              {activeChecklistEvidence.item.requiresNote ? (
                <div>
                  <label htmlFor="checklist-note" className="mb-1 block text-[11px] font-bold text-neutral-300">الملاحظة المطلوبة</label>
                  <textarea id="checklist-note" value={checklistNote} onChange={(event) => setChecklistNote(event.target.value)} maxLength={1000} className="min-h-20 w-full rounded-xl border border-neutral-800 bg-[#141414] p-3 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c45a]" />
                </div>
              ) : null}
              {activeChecklistEvidence.item.requiresPhoto ? (
                <label className="flex cursor-pointer items-center rounded-xl border border-dashed border-neutral-700 bg-[#141414] px-3 py-3 text-xs text-neutral-300 focus-within:ring-2 focus-within:ring-[#e5c45a]">
                  <Camera className="ml-2 h-4 w-4 text-[#e5c45a]" aria-hidden="true" />
                  <span className="truncate">{checklistPhoto?.name ?? 'اختر صورة الدليل'}</span>
                  <input data-testid="checklist-evidence-file" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setChecklistPhoto(event.target.files?.[0] ?? null)} />
                </label>
              ) : null}
              <div className="flex gap-2">
                <button data-testid="checklist-evidence-submit" type="button" disabled={isPending} onClick={handleSubmitChecklistEvidence} className="rounded-xl bg-[#e5c45a] px-5 py-2.5 text-xs font-black text-[#080808] disabled:opacity-45">حفظ واعتماد</button>
                <button type="button" onClick={() => setActiveChecklistEvidence(null)} className="rounded-xl border border-neutral-700 px-5 py-2.5 text-xs font-bold text-neutral-300">إلغاء</button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-3 border-t border-neutral-800 pt-5" aria-labelledby="photos-heading">
          <div>
            <h3 id="photos-heading" className="text-sm font-black text-white">توثيق الصور</h3>
            <p className="mt-1 text-[11px] text-neutral-400">JPG أو PNG أو WEBP بحد أقصى 10MB. تُحفظ الملفات بشكل خاص.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
            <label className="sr-only" htmlFor="photo-type">نوع الصورة</label>
            <select id="photo-type" value={effectivePhotoType} disabled={!allowedPhotoTypes.length} onChange={(event) => setPhotoType(event.target.value as PhotoType)} className="rounded-xl border border-neutral-800 bg-[#080808] p-3 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c45a] disabled:opacity-45">
              {allowedPhotoTypes.map((value) => <option key={value} value={value}>{PHOTO_CONFIG[value].label}</option>)}
            </select>
            <label className="flex cursor-pointer items-center rounded-xl border border-dashed border-neutral-700 bg-[#080808] px-3 py-2 text-xs text-neutral-300 focus-within:ring-2 focus-within:ring-[#e5c45a]">
              <Camera className="ml-2 h-4 w-4 text-[#e5c45a]" aria-hidden="true" />
              <span className="truncate">{photoFile?.name ?? 'اختر صورة من الجهاز'}</span>
              <input data-testid="technician-photo-file" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={!allowedPhotoTypes.length} onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)} />
            </label>
            <button data-testid="technician-photo-submit" type="button" disabled={isPending || !photoFile || !allowedPhotoTypes.length} onClick={handleUploadPhoto} className="rounded-xl bg-[#e5c45a] px-5 py-3 text-xs font-black text-[#080808] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">رفع وتوثيق</button>
          </div>
          {!allowedPhotoTypes.length ? <p className="text-[11px] text-neutral-500">صور ما قبل الخدمة تُفتح عند ARRIVED، وصور التنفيذ وما بعده تُفتح عند IN_SERVICE.</p> : null}
        </section>

        <section className="space-y-3 border-t border-neutral-800 pt-5" aria-labelledby="notes-heading">
          <h3 id="notes-heading" className="text-sm font-black text-white">بلاغات ميدانية</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => setActiveNoteType('PROBLEM')} className="flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-[#080808] p-3 text-xs font-bold text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c45a]"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> مشكلة ميدانية</button>
            <button type="button" onClick={() => setActiveNoteType('EXTRA_TIME')} className="flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-[#080808] p-3 text-xs font-bold text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c45a]"><Clock className="h-4 w-4" aria-hidden="true" /> وقت إضافي</button>
            <button type="button" onClick={() => setActiveNoteType('ADDON_REQUEST')} className="flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-[#080808] p-3 text-xs font-bold text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c45a]"><PlusCircle className="h-4 w-4" aria-hidden="true" /> طلب إضافة</button>
          </div>
          {activeNoteType ? (
            <div className="space-y-3 rounded-2xl border border-[#c9a227]/40 bg-[#080808] p-4">
              <label htmlFor="field-note" className="block text-xs font-bold text-white">التفاصيل</label>
              <textarea id="field-note" value={noteText} onChange={(event) => setNoteText(event.target.value)} maxLength={2000} className="min-h-24 w-full rounded-xl border border-neutral-800 bg-[#141414] p-3 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c45a]" placeholder="اكتب ما حدث وما الإجراء المطلوب…" />
              <div className="flex gap-2">
                <button type="button" disabled={isPending || noteText.trim().length < 3} onClick={handleSubmitNote} className="rounded-xl bg-[#e5c45a] px-5 py-2.5 text-xs font-black text-[#080808] disabled:opacity-45">حفظ البلاغ</button>
                <button type="button" onClick={() => setActiveNoteType(null)} className="rounded-xl border border-neutral-700 px-5 py-2.5 text-xs font-bold text-neutral-300">إلغاء</button>
              </div>
            </div>
          ) : null}
        </section>
      </article>

    </div>
  );
}
