'use client';

import { FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CalendarClock,
  FileText,
  MessageSquareWarning,
  Upload,
} from 'lucide-react';
import { uploadPaymentProofAction } from '@/app/actions/booking';
import {
  requestCancellationAction,
  requestRescheduleAction,
} from '@/app/actions/cancellation';
import { createComplaintAction } from '@/app/actions/quality';
import { prepareImageForUpload } from '@/lib/client/image-upload';

interface PaymentMethodOption {
  id: string;
  name: string;
  accountNumber: string;
  accountName: string;
  instructions: string | null;
}

interface Props {
  bookingId: string;
  bookingNumber?: string;
  serviceName?: string;
  customerName: string;
  customerPhone: string;
  paymentMethods: PaymentMethodOption[];
  paymentAmount: number;
  canUploadPayment: boolean;
  canRequestCancellation: boolean;
  canRequestReschedule: boolean;
  canPreferReschedule: boolean;
  canCreateComplaint: boolean;
}

type Panel = 'payment' | 'cancel' | 'reschedule' | 'complaint';

interface UploadResponse {
  error?: string;
  bookingFileId?: string;
}

const inputClass = 'w-full rounded-xl border border-neutral-700 bg-[#080808] px-3 py-2.5 text-sm text-white focus:border-[#c9a227] focus:outline-none focus:ring-2 focus:ring-[#c9a227]/20';
const labelClass = 'mb-1.5 block text-xs font-semibold text-neutral-300';

async function uploadBookingFile(
  bookingId: string,
  category: 'payment-proofs' | 'cancellation-evidence' | 'complaint-evidence',
  file: File,
) {
  const preparedFile = await prepareImageForUpload(file);
  const uploadData = new FormData();
  uploadData.set('bookingId', bookingId);
  uploadData.set('category', category);
  uploadData.set('file', preparedFile);
  const response = await fetch('/api/upload', { method: 'POST', body: uploadData });
  const result = await response.json() as UploadResponse;
  if (!response.ok || !result.bookingFileId) {
    throw new Error(result.error ?? 'تعذر رفع الملف.');
  }
  return result.bookingFileId;
}

export default function BookingActionsClient({
  bookingId,
  bookingNumber,
  serviceName,
  customerName,
  customerPhone,
  paymentMethods,
  paymentAmount,
  canUploadPayment,
  canRequestCancellation,
  canRequestReschedule,
  canPreferReschedule,
  canCreateComplaint,
}: Props) {
  const router = useRouter();
  const firstPanel: Panel = canUploadPayment
    ? 'payment'
    : canRequestReschedule
      ? 'reschedule'
      : canRequestCancellation
        ? 'cancel'
        : 'complaint';
  const [activePanel, setActivePanel] = useState<Panel>(firstPanel);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [uploadedPaymentFileId, setUploadedPaymentFileId] = useState<string | null>(null);
  const [cancellationFile, setCancellationFile] = useState<File | null>(null);
  const [complaintFile, setComplaintFile] = useState<File | null>(null);

  function execute(
    task: () => Promise<{ error?: string; success?: boolean }>,
    successMessage: string,
    form?: HTMLFormElement,
  ) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await task();
        if (result.error) {
          setFeedback({ tone: 'error', message: result.error });
          return;
        }
        setFeedback({ tone: 'success', message: successMessage });
        form?.reset();
        router.refresh();
      } catch (error) {
        setFeedback({
          tone: 'error',
          message: error instanceof Error ? error.message : 'تعذر تنفيذ الطلب.',
        });
      }
    });
  }

  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    if (!paymentFile && !uploadedPaymentFileId) {
      setFeedback({ tone: 'error', message: 'اختر صورة أو PDF لإثبات التحويل.' });
      return;
    }
    execute(async () => {
      const transferTimestamp = String(values.get('transferTimestamp') ?? '');
      if (transferTimestamp) values.set('transferTimestamp', new Date(transferTimestamp).toISOString());
      const evidenceFileId = uploadedPaymentFileId ?? await uploadBookingFile(
        bookingId,
        'payment-proofs',
        paymentFile!,
      );
      values.set('bookingId', bookingId);
      values.set('bookingFileId', evidenceFileId);
      values.set('evidenceFileId', evidenceFileId);
      const result = await uploadPaymentProofAction(values);
      if (!result.error) {
        setUploadedPaymentFileId(null);
        setPaymentFile(null);
      }
      return result;
    }, 'تم رفع إثبات التحويل بنجاح وسيبدأ فريق التشغيل مراجعته.', form);
  }

  function submitCancellation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    execute(async () => {
      const evidenceFileId = cancellationFile
        ? await uploadBookingFile(bookingId, 'cancellation-evidence', cancellationFile)
        : undefined;
      values.set('bookingId', bookingId);
      if (evidenceFileId) values.set('evidenceFileId', evidenceFileId);
      return requestCancellationAction(values);
    }, 'تم تسجيل طلب الإلغاء وسيتم مراجعته طبقاً لسياسة الإلغاء.', form);
  }

  function submitReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    execute(async () => {
      const requestedStartAt = String(values.get('requestedStartAt') ?? '');
      if (requestedStartAt) values.set('requestedStartAt', new Date(requestedStartAt).toISOString());
      values.set('bookingId', bookingId);
      return requestRescheduleAction(values);
    }, 'تم تسجيل طلب إعادة الجدولة وبانتظار اعتماد الموعد الجديد.', form);
  }

  function submitComplaint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    execute(async () => {
      const evidenceFileIds = complaintFile
        ? [await uploadBookingFile(bookingId, 'complaint-evidence', complaintFile)]
        : [];
      values.set('bookingId', bookingId);
      values.set('evidenceFileIds', JSON.stringify(evidenceFileIds));
      return createComplaintAction(values);
    }, 'تم تسجيل الشكوى وسيتم التواصل معك.', form);
  }

  const panels: Array<{ id: Panel; label: string; visible: boolean; icon: React.ReactNode }> = [
    { id: 'payment', label: 'إثبات الدفع', visible: canUploadPayment, icon: <FileText className="size-4" aria-hidden="true" /> },
    { id: 'reschedule', label: 'تعديل الموعد', visible: canRequestReschedule, icon: <CalendarClock className="size-4" aria-hidden="true" /> },
    { id: 'cancel', label: 'طلب إلغاء', visible: canRequestCancellation, icon: <AlertCircle className="size-4" aria-hidden="true" /> },
    { id: 'complaint', label: 'شكوى', visible: canCreateComplaint, icon: <MessageSquareWarning className="size-4" aria-hidden="true" /> },
  ];
  const availablePanels = panels.filter((panel) => panel.visible);

  if (!availablePanels.length) return null;

  return (
    <section aria-labelledby="booking-actions-heading" className="space-y-5 rounded-3xl border border-[#c9a227]/25 bg-[#141414] p-5 sm:p-7">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="booking-actions-heading" className="text-lg font-bold text-white">إجراءات الحجز</h2>
          {bookingNumber && (
            <span className="text-xs font-bold text-[#e5c45a] bg-[#c9a227]/10 border border-[#c9a227]/30 px-3 py-1 rounded-xl">
              رقم الحجز: {bookingNumber} {serviceName ? `• ${serviceName}` : ''}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-400">تُطبق هذه الإجراءات على هذا الحجز المحدد؛ كل طلب يُراجع ويُسجل في سجل العمليات.</p>
      </div>

      <div role="tablist" aria-label="إجراءات الحجز" className="flex flex-wrap gap-2">
        {availablePanels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            role="tab"
            aria-selected={activePanel === panel.id}
            onClick={() => { setActivePanel(panel.id); setFeedback(null); }}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition-colors ${
              activePanel === panel.id
                ? 'border-[#c9a227] bg-[#c9a227] text-black'
                : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
            }`}
          >
            {panel.icon}{panel.label}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="min-h-5">
        {feedback && (
          <p className={`rounded-xl border px-4 py-3 text-sm ${feedback.tone === 'success' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
            {feedback.message}
          </p>
        )}
      </div>

      {activePanel === 'payment' && canUploadPayment && (
        <form onSubmit={submitPayment} aria-busy={isPending} className="space-y-4">
          {paymentMethods.length ? (
            <>
              <div>
                <label htmlFor="payment-method" className={labelClass}>وسيلة التحويل</label>
                <select id="payment-method" name="paymentMethodId" required className={inputClass}>
                  {paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name} — {method.accountNumber}</option>)}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label htmlFor="sender-name" className={labelClass}>اسم المحوّل</label><input id="sender-name" name="senderName" defaultValue={customerName} required maxLength={150} autoComplete="name" className={inputClass} /></div>
                <div><label htmlFor="sender-account" className={labelClass}>رقم الهاتف أو الحساب</label><input id="sender-account" name="senderPhoneOrAccount" defaultValue={customerPhone} required maxLength={100} dir="ltr" className={inputClass} /></div>
                <div><label htmlFor="reference-number" className={labelClass}>رقم المرجع (اختياري)</label><input id="reference-number" name="referenceNumber" maxLength={100} dir="ltr" className={inputClass} /></div>
                <div><label htmlFor="amount-submitted" className={labelClass}>المبلغ المحوّل</label><input id="amount-submitted" name="amountSubmitted" type="number" min={1} step={1} defaultValue={paymentAmount} required className={inputClass} /></div>
                <div><label htmlFor="transfer-time" className={labelClass}>تاريخ ووقت التحويل</label><input id="transfer-time" name="transferTimestamp" type="datetime-local" required className={inputClass} /></div>
                <div><label htmlFor="payment-file" className={labelClass}>صورة أو PDF (حتى 10MB)</label><input id="payment-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required={!uploadedPaymentFileId} onChange={(event) => { setPaymentFile(event.target.files?.[0] ?? null); setUploadedPaymentFileId(null); }} className={inputClass} /></div>
              </div>
              {uploadedPaymentFileId && <p className="text-xs text-amber-300">تم حفظ الملف؛ يمكنك إعادة محاولة إرسال البيانات دون رفعه مرة أخرى.</p>}
              <button type="submit" disabled={isPending} className="inline-flex items-center gap-2 rounded-xl bg-[#c9a227] px-5 py-3 text-sm font-bold text-black disabled:opacity-50"><Upload className="size-4" aria-hidden="true" />{isPending ? 'جارٍ الإرسال…' : 'رفع وإرسال للمراجعة'}</button>
            </>
          ) : <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">لا توجد وسيلة دفع نشطة لهذا الفرع. تواصل مع الدعم.</p>}
        </form>
      )}

      {activePanel === 'reschedule' && canRequestReschedule && (
        <form onSubmit={submitReschedule} aria-busy={isPending} className="space-y-4">
          <div><label htmlFor="reschedule-reason" className={labelClass}>سبب تعديل الموعد</label><textarea id="reschedule-reason" name="reason" required minLength={3} maxLength={1000} rows={3} className={inputClass} /></div>
          <div><label htmlFor="requested-start" className={labelClass}>التاريخ والوقت المقترح</label><input id="requested-start" name="requestedStartAt" type="datetime-local" required className={inputClass} /></div>
          <div><label htmlFor="reschedule-alternatives" className={labelClass}>مواعيد بديلة أخرى (اختياري)</label><textarea id="reschedule-alternatives" name="proposedDates" maxLength={1000} rows={2} className={inputClass} /></div>
          <div><label htmlFor="reschedule-notes" className={labelClass}>ملاحظات</label><textarea id="reschedule-notes" name="notes" maxLength={1000} rows={2} className={inputClass} /></div>
          <button type="submit" disabled={isPending} className="rounded-xl bg-[#c9a227] px-5 py-3 text-sm font-bold text-black disabled:opacity-50">إرسال طلب التعديل</button>
        </form>
      )}

      {activePanel === 'cancel' && canRequestCancellation && (
        <form onSubmit={submitCancellation} aria-busy={isPending} className="space-y-4">
          <div><label htmlFor="cancel-reason" className={labelClass}>سبب الإلغاء</label><textarea id="cancel-reason" name="reason" required minLength={3} maxLength={1000} rows={3} className={inputClass} /></div>
          <div><label htmlFor="preferred-action" className={labelClass}>الإجراء المفضل</label><select id="preferred-action" name="preferredAction" className={inputClass}>{canPreferReschedule ? <option value="RESCHEDULE">إعادة الجدولة</option> : null}<option value="REFUND">استرداد المبلغ وفق السياسة</option><option value="CREDIT">تحويله إلى رصيد</option></select></div>
          {canPreferReschedule ? <div><label htmlFor="alternative-dates" className={labelClass}>موعد بديل بصيغة تاريخ ووقت (اختياري)</label><input id="alternative-dates" name="alternativeDates" type="datetime-local" className={inputClass} /></div> : null}
          <div><label htmlFor="cancel-notes" className={labelClass}>ملاحظات</label><textarea id="cancel-notes" name="notes" maxLength={1000} rows={2} className={inputClass} /></div>
          <div><label htmlFor="cancel-file" className={labelClass}>مرفق داعم (اختياري)</label><input id="cancel-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setCancellationFile(event.target.files?.[0] ?? null)} className={inputClass} /></div>
          <button type="submit" disabled={isPending} className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">إرسال طلب الإلغاء</button>
        </form>
      )}

      {activePanel === 'complaint' && canCreateComplaint && (
        <form onSubmit={submitComplaint} aria-busy={isPending} className="space-y-4">
          <div><label htmlFor="complaint-type" className={labelClass}>نوع الشكوى</label><select id="complaint-type" name="type" className={inputClass}><option value="QUALITY">جودة الخدمة</option><option value="DELAY">تأخير الموعد</option><option value="DAMAGE">ضرر أو ملاحظة على السيارة</option><option value="PAYMENT">الدفع أو الاسترداد</option><option value="OTHER">أخرى</option></select></div>
          <div><label htmlFor="complaint-description" className={labelClass}>تفاصيل الشكوى</label><textarea id="complaint-description" name="description" required minLength={5} maxLength={2000} rows={5} className={inputClass} /></div>
          <div><label htmlFor="complaint-file" className={labelClass}>صورة أو PDF داعم (اختياري)</label><input id="complaint-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setComplaintFile(event.target.files?.[0] ?? null)} className={inputClass} /></div>
          <button type="submit" disabled={isPending} className="rounded-xl border border-[#c9a227]/60 px-5 py-3 text-sm font-bold text-[#e5c45a] disabled:opacity-50">تسجيل الشكوى</button>
        </form>
      )}
    </section>
  );
}
