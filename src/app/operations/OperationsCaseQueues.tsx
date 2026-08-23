'use client';

import { FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  ListChecks,
  MessageSquareWarning,
  RefreshCcw,
  ShieldCheck,
  Send,
  XCircle,
} from 'lucide-react';
import {
  approveRefundAction,
  recordRefundAction,
  reviewCancellationAction,
  reviewRescheduleAction,
} from '@/app/actions/cancellation';
import {
  resolveComplaintAction,
  reviewQualityAction,
  triageComplaintAction,
} from '@/app/actions/quality';
import { prepareImageForUpload } from '@/lib/client/image-upload';
import OperationsQueuePagination from './OperationsQueuePagination';
import {
  type OperationsCaseQueueKey,
  type OperationsQueuePagination as QueuePagination,
} from './pagination';

type DateValue = string | Date;

interface UserSummary {
  id: string;
  fullName: string;
  phone: string;
}

interface AssigneeSummary {
  id: string;
  fullName: string;
}

interface CancellationCase {
  id: string;
  bookingId: string;
  reason: string;
  preferredAction: string;
  alternativeDates: unknown;
  customerNotes: string | null;
  status: string;
  approvedRefundAmount: number | null;
  reschedulingAllowed: boolean;
  createdAt: DateValue;
  booking: {
    bookingNumber: string;
    amountPaid: number;
    depositAmount: number;
    branch: { nameAr: string };
    service: { nameAr: string };
    customer: { user: UserSummary };
    refunds: Array<{ amount: number; status: string }>;
  };
}

interface RescheduleCase {
  id: string;
  bookingId: string;
  oldStartAt: DateValue;
  requestedStartAt: DateValue;
  reason: string;
  reviewNotes: string | null;
  booking: {
    bookingNumber: string;
    branch: { nameAr: string };
    service: { nameAr: string };
    customer: { user: UserSummary };
  };
}

interface QualityChecklistResult {
  id: string;
  itemId: string;
  itemLabel: string;
  isChecked: boolean;
  note?: string | null;
  checkedAt?: DateValue | null;
}

interface QualityChecklistInstance {
  id: string;
  stage: string;
  completedAt: DateValue | null;
  results?: QualityChecklistResult[];
}

interface QualityChecklistTemplateItem {
  id: string;
  labelAr: string;
  required: boolean;
  descriptionAr?: string | null;
}

interface QualityChecklistTemplate {
  id: string;
  stage: string;
  items: QualityChecklistTemplateItem[];
}

interface QualityCase {
  id: string;
  bookingNumber: string;
  branch: { nameAr: string };
  service: {
    nameAr: string;
    checklistTemplates?: QualityChecklistTemplate[];
  };
  customer: { user: UserSummary };
  files?: Array<{ id: string; fileType: string; fileUrl: string; createdAt: DateValue }>;
  checklistInstances: QualityChecklistInstance[];
}

interface ComplaintCase {
  id: string;
  bookingId: string;
  type: string;
  description: string;
  priority: string;
  status: string;
  createdAt: DateValue;
  assignedToUser: AssigneeSummary | null;
  customer: { user: UserSummary };
  booking: {
    bookingNumber: string;
    branch: { nameAr: string };
    service: { nameAr: string };
  };
}

interface RefundCase {
  id: string;
  bookingId: string;
  amount: number;
  refundMethod: string;
  referenceNumber: string | null;
  proofFileUrl: string | null;
  createdAt: DateValue;
  booking: {
    bookingNumber: string;
    branch: { nameAr: string };
    customer: { user: UserSummary };
  };
}

interface Props {
  actorRole: string;
  cancellationRequests: CancellationCase[];
  rescheduleRequests: RescheduleCase[];
  qualityBookings: QualityCase[];
  complaints: ComplaintCase[];
  refundsAwaitingApproval: RefundCase[];
  complaintAssignees: AssigneeSummary[];
  pagination: Record<OperationsCaseQueueKey, QueuePagination>;
  mode?: 'all' | 'quality_only' | 'cases_only';
}

const inputClass =
  'w-full rounded-xl border border-neutral-800 bg-[#121215] px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-neutral-500 hover:border-neutral-700 focus-visible:border-[#d4af37] focus-visible:ring-2 focus-visible:ring-[#d4af37]/30 disabled:cursor-not-allowed disabled:opacity-60 transition-all';
const labelClass = 'mb-1.5 block text-xs font-bold text-neutral-300';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#e5c45a] to-[#d4af37] px-4 py-2.5 text-xs font-bold text-neutral-950 hover:brightness-110 active:scale-98 shadow-md shadow-[#d4af37]/20 disabled:cursor-not-allowed disabled:opacity-55 transition-all';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/80 px-4 py-2.5 text-xs font-semibold text-neutral-200 hover:border-neutral-700 hover:bg-neutral-800 hover:text-white active:scale-98 disabled:cursor-not-allowed disabled:opacity-55 transition-all';
const successButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-neutral-950 hover:bg-emerald-400 active:scale-98 disabled:cursor-not-allowed disabled:opacity-55 transition-all';
const dangerButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-500 active:scale-98 disabled:cursor-not-allowed disabled:opacity-55 transition-all';

function formatDate(value: DateValue) {
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}

function submittedIntent(event: FormEvent<HTMLFormElement>, fallback: string) {
  const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
  return submitter?.value || fallback;
}

export default function OperationsCaseQueues({
  actorRole,
  cancellationRequests,
  rescheduleRequests,
  qualityBookings,
  complaints,
  refundsAwaitingApproval,
  complaintAssignees,
  pagination,
  mode = 'all',
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const canApproveRefund =
    actorRole === 'OPERATIONS_MANAGER' || actorRole === 'OWNER' || actorRole === 'SYSTEM_SUPER_ADMIN';
  const showOtherCases = mode === 'all' || mode === 'cases_only';
  const showQualityOnly = mode === 'all' || mode === 'quality_only';

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
          message: error instanceof Error ? error.message : 'تعذر تنفيذ الإجراء.',
        });
      }
    });
  }

  function submitCancellation(event: FormEvent<HTMLFormElement>, cancellationId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set('cancellationId', cancellationId);
    data.set('decision', submittedIntent(event, 'APPROVE'));
    execute(() => reviewCancellationAction(data), 'تم حفظ قرار طلب الإلغاء.', form);
  }

  function submitRefund(event: FormEvent<HTMLFormElement>, bookingId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('refundFile');
    if (!(file instanceof File) || file.size === 0) {
      setFeedback({ tone: 'error', message: 'ارفع إثبات الاسترداد أولًا.' });
      return;
    }
    execute(async () => {
      const preparedFile = await prepareImageForUpload(file);
      const refundTimestamp = String(data.get('refundTimestamp') ?? '');
      if (refundTimestamp) data.set('refundTimestamp', new Date(refundTimestamp).toISOString());
      const upload = new FormData();
      upload.set('bookingId', bookingId);
      upload.set('category', 'refund-proofs');
      upload.set('file', preparedFile);
      const response = await fetch('/api/upload', { method: 'POST', body: upload });
      const uploaded = (await response.json()) as { error?: string; bookingFileId?: string };
      if (!response.ok || !uploaded.bookingFileId)
        throw new Error(uploaded.error ?? 'تعذر رفع إثبات الاسترداد.');
      data.delete('refundFile');
      data.set('bookingId', bookingId);
      data.set('bookingFileId', uploaded.bookingFileId);
      data.set('idempotencyKey', crypto.randomUUID());
      return recordRefundAction(data);
    }, 'تم تسجيل الاسترداد وإرساله لاعتماد المالك.', form);
  }

  function submitReschedule(event: FormEvent<HTMLFormElement>, timeChangeId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const decision = submittedIntent(event, 'APPROVE');
    data.set('timeChangeId', timeChangeId);
    data.set('decision', decision);
    if (decision === 'REJECT') {
      data.delete('approvedStartAt');
    } else {
      const approvedStartAt = String(data.get('approvedStartAt') ?? '');
      if (approvedStartAt) data.set('approvedStartAt', new Date(approvedStartAt).toISOString());
    }
    execute(() => reviewRescheduleAction(data), 'تم حفظ قرار تعديل الموعد.', form);
  }

  function submitQuality(event: FormEvent<HTMLFormElement>, bookingId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const approved = submittedIntent(event, 'true');
    const data = new FormData(form);
    data.set('bookingId', bookingId);
    data.set('approved', approved);
    data.set('returnedToTeam', approved === 'true' ? 'false' : 'true');
    execute(
      () => reviewQualityAction(data),
      approved === 'true' ? 'تم اعتماد الجودة وإكمال الخدمة.' : 'أعيدت المهمة للفريق بالملاحظات.',
      form,
    );
  }

  function submitComplaintTriage(event: FormEvent<HTMLFormElement>, complaintId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set('complaintId', complaintId);
    execute(() => triageComplaintAction(data), 'تم تحديث فرز الشكوى.', form);
  }

  function submitComplaintResolution(event: FormEvent<HTMLFormElement>, complaintId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set('complaintId', complaintId);
    execute(() => resolveComplaintAction(data), 'تم حفظ حل الشكوى.', form);
  }

  function submitRefundApproval(event: FormEvent<HTMLFormElement>, refundId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set('refundId', refundId);
    execute(() => approveRefundAction(data), 'تم اعتماد الاسترداد وتحديث الرصيد.', form);
  }

  return (
    <section aria-labelledby="case-queues-heading" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between border-b border-neutral-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#d4af37] shadow-sm shadow-[#d4af37]" />
            <p className="text-xs font-bold uppercase tracking-widest text-[#d4af37]">QUALITY & CASES CONTROL</p>
          </div>
          <h2 id="case-queues-heading" className="mt-1 text-2xl font-black text-white">
            قوائم الحالات والجودة والشكاوى
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-neutral-400">
            متابعة قرارات الإلغاء، تأجيل المواعيد، تدقيق جودة الخدمات، الشكاوى، وطلبات الاسترداد.
          </p>
        </div>
      </div>

      <div aria-live="polite" className="min-h-5">
        {feedback && (
          <p
            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              feedback.tone === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
            }`}
          >
            {feedback.message}
          </p>
        )}
      </div>

      <div className="grid gap-6">
        {/* 1. Cancellation Requests */}
        {showOtherCases && (
        <Queue
          title="طلبات الإلغاء والاسترداد"
          empty={cancellationRequests.length === 0}
          queueKey="cancellations"
          pagination={pagination.cancellations}
          icon={<AlertTriangle className="size-5 text-[#d4af37]" />}
        >
          {cancellationRequests.map((item) => {
            const recorded = item.booking.refunds
              .filter((refund) => ['REFUND_PROCESSING', 'REFUNDED'].includes(refund.status))
              .reduce((total, refund) => total + refund.amount, 0);
            const refundRemaining = Math.max(0, (item.approvedRefundAmount ?? 0) - recorded);
            return (
              <details
                key={item.id}
                className="group rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-4 transition-all duration-200 open:border-[#d4af37]/40"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-white group-hover:text-[#f3e4a8]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-rose-400" />
                      <span dir="ltr" className="font-mono text-xs font-black text-[#d4af37]">
                        {item.booking.bookingNumber}
                      </span>
                      <span>— {item.booking.customer.user.fullName}</span>
                    </div>
                    <span className="mt-1 block text-xs font-normal text-neutral-400">
                      {item.status} · {item.booking.service.nameAr} · {formatDate(item.createdAt)}
                    </span>
                  </div>
                  <span className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-neutral-300 group-open:bg-[#d4af37]/10 group-open:text-[#d4af37] group-open:border-[#d4af37]/30">
                    مراجعة الطلب
                  </span>
                </summary>
                <div className="mt-4 space-y-4 border-t border-neutral-800/80 pt-4 text-xs sm:text-sm">
                  <div className="rounded-xl bg-neutral-950/60 p-3 border border-neutral-800/60">
                    <p className="text-neutral-300">
                      <strong className="text-neutral-400">سبب العميل:</strong> {item.reason}
                    </p>
                    {item.customerNotes ? (
                      <p className="mt-1.5 text-neutral-400">
                        <strong className="text-neutral-500">ملاحظات إضافية:</strong> {item.customerNotes}
                      </p>
                    ) : null}
                  </div>

                  {item.status === 'APPROVED_REFUND_PENDING' ? (
                    <form
                      onSubmit={(event) => submitRefund(event, item.bookingId)}
                      className="space-y-3"
                      aria-busy={isPending}
                    >
                      <p className="text-xs font-bold text-amber-300">
                        المتبقي من الاسترداد المعتمد: {refundRemaining} ج.م
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="المبلغ">
                          <input
                            name="amount"
                            type="number"
                            min={1}
                            max={refundRemaining}
                            defaultValue={refundRemaining}
                            required
                            className={inputClass}
                          />
                        </Field>
                        <Field label="وسيلة الاسترداد">
                          <input name="refundMethod" required maxLength={200} className={inputClass} />
                        </Field>
                        <Field label="رقم المرجع">
                          <input name="referenceNumber" maxLength={100} className={inputClass} />
                        </Field>
                        <Field label="وقت الاسترداد">
                          <input name="refundTimestamp" type="datetime-local" required className={inputClass} />
                        </Field>
                        <Field label="إثبات الاسترداد (صورة / PDF)">
                          <input
                            name="refundFile"
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            required
                            className={inputClass}
                          />
                        </Field>
                      </div>
                      <Field label="ملاحظات">
                        <textarea name="notes" rows={2} maxLength={1000} className={inputClass} />
                      </Field>
                      <button
                        type="submit"
                        disabled={isPending || refundRemaining === 0}
                        className={primaryButtonClass}
                      >
                        <Send className="size-3.5" />
                        <span>تسجيل وإرسال للاعتماد</span>
                      </button>
                    </form>
                  ) : (
                    <form
                      onSubmit={(event) => submitCancellation(event, item.id)}
                      className="space-y-3"
                      aria-busy={isPending}
                    >
                      <p className="text-xs text-neutral-400">
                        المدفوع <strong className="text-white">{item.booking.amountPaid} ج.م</strong> ·
                        العربون المثبت <strong className="text-white">{item.booking.depositAmount} ج.م</strong>.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="نوع الحل">
                          <select
                            name="resolutionType"
                            defaultValue={
                              item.preferredAction === 'RESCHEDULE' && item.reschedulingAllowed
                                ? 'RESCHEDULE'
                                : 'REFUND_FULL'
                            }
                            className={inputClass}
                          >
                            <option value="REFUND_FULL">استرداد كامل</option>
                            <option value="REFUND_PARTIAL">استرداد جزئي</option>
                            <option value="NO_REFUND">دون استرداد</option>
                            <option value="KEEP_DEPOSIT">الاحتفاظ بالعربون ورد الزيادة</option>
                            <option value="VISIT_FEE">تطبيق رسوم زيارة ورد الباقي</option>
                            {item.reschedulingAllowed ? <option value="RESCHEDULE">إعادة جدولة</option> : null}
                            <option value="CREDIT">تحويل كامل المدفوع لرصيد</option>
                            <option value="ESCALATE">تصعيد للمالك</option>
                          </select>
                        </Field>
                        <Field label="الطرف المسؤول">
                          <select name="responsibleParty" className={inputClass}>
                            <option value="CUSTOMER">العميل</option>
                            <option value="TEAM">الفريق</option>
                            <option value="BRANCH">الفرع</option>
                            <option value="ACCESS">الدخول / التصريح</option>
                            <option value="FORCE_MAJEURE">ظرف قهري</option>
                          </select>
                        </Field>
                        <Field label="مبلغ الاسترداد الجزئي (عند اختياره)">
                          <input
                            name="approvedRefundAmount"
                            type="number"
                            min={1}
                            max={item.booking.amountPaid}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="رسوم الزيارة (عند اختيارها)">
                          <input
                            name="visitFeeAmount"
                            type="number"
                            min={1}
                            max={item.booking.amountPaid}
                            className={inputClass}
                          />
                        </Field>
                      </div>
                      <Field label="ملاحظات القرار">
                        <textarea
                          name="resolutionNotes"
                          required
                          minLength={3}
                          maxLength={1000}
                          rows={3}
                          className={inputClass}
                          placeholder="اكتب سبب القرار بالتفصيل..."
                        />
                      </Field>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="submit"
                          name="decision"
                          value="APPROVE"
                          disabled={isPending}
                          className={successButtonClass}
                        >
                          <CheckCircle2 className="size-3.5" />
                          <span>اعتماد الحل</span>
                        </button>
                        <button
                          type="submit"
                          name="decision"
                          value="REJECT"
                          disabled={isPending}
                          className={dangerButtonClass}
                        >
                          <XCircle className="size-3.5" />
                          <span>رفض الطلب</span>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </details>
            );
          })}
        </Queue>
        )}

        {/* 2. Reschedule Requests */}
        {showOtherCases && (
        <Queue
          title="طلبات تعديل الموعد"
          empty={rescheduleRequests.length === 0}
          queueKey="reschedules"
          pagination={pagination.reschedules}
          icon={<CalendarClock className="size-5 text-[#d4af37]" />}
        >
          {rescheduleRequests.map((item) => (
            <details
              key={item.id}
              className="group rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-4 transition-all duration-200 open:border-[#d4af37]/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-white group-hover:text-[#f3e4a8]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-sky-400" />
                    <span dir="ltr" className="font-mono text-xs font-black text-[#d4af37]">
                      {item.booking.bookingNumber}
                    </span>
                    <span>— {item.booking.customer.user.fullName}</span>
                  </div>
                  <span className="mt-1 block text-xs font-normal text-neutral-400">
                    من {formatDate(item.oldStartAt)} إلى {formatDate(item.requestedStartAt)}
                  </span>
                </div>
                <span className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-neutral-300 group-open:bg-[#d4af37]/10 group-open:text-[#d4af37] group-open:border-[#d4af37]/30">
                  اتخاذ قرار
                </span>
              </summary>
              <form
                onSubmit={(event) => submitReschedule(event, item.id)}
                className="mt-4 space-y-3 border-t border-neutral-800/80 pt-4 text-xs sm:text-sm"
              >
                <div className="rounded-xl bg-neutral-950/60 p-3 border border-neutral-800/60">
                  <p className="text-neutral-300">
                    <strong className="text-neutral-400">سبب التعديل:</strong> {item.reason}
                  </p>
                </div>
                <Field label="الموعد الذي اعتمده مدير التشغيل">
                  <input name="approvedStartAt" type="datetime-local" required className={inputClass} />
                </Field>
                <Field label="ملاحظات القرار">
                  <textarea name="reviewNotes" required minLength={3} rows={3} className={inputClass} />
                </Field>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="submit" name="decision" value="APPROVE" disabled={isPending} className={successButtonClass}>
                    <CheckCircle2 className="size-3.5" />
                    <span>إعادة فحص واعتماد</span>
                  </button>
                  <button type="submit" name="decision" value="REJECT" disabled={isPending} className={dangerButtonClass}>
                    <XCircle className="size-3.5" />
                    <span>رفض التعديل</span>
                  </button>
                </div>
              </form>
            </details>
          ))}
        </Queue>
        )}

        {/* 3. Quality Reviews */}
        {showQualityOnly && (
        <Queue
          title="مراجعة واعتماد الجودة"
          empty={qualityBookings.length === 0}
          queueKey="quality"
          pagination={pagination.quality}
          icon={<ShieldCheck className="size-5 text-[#d4af37]" />}
        >
          {qualityBookings.map((item) => (
            <details
              key={item.id}
              className="group rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-4 transition-all duration-200 open:border-[#d4af37]/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-white group-hover:text-[#f3e4a8]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-violet-400" />
                    <span dir="ltr" className="font-mono text-xs font-black text-[#d4af37]">
                      {item.bookingNumber}
                    </span>
                    <span>— {item.service.nameAr}</span>
                  </div>
                  <span className="mt-1 block text-xs font-normal text-neutral-400">
                    {item.customer.user.fullName} ·{' '}
                    {item.checklistInstances.filter((instance) => instance.completedAt).length}/
                    {item.checklistInstances.length} مراحل فحص مكتملة
                  </span>
                </div>
                <span className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-neutral-300 group-open:bg-[#d4af37]/10 group-open:text-[#d4af37] group-open:border-[#d4af37]/30">
                  فحص الجودة
                </span>
              </summary>

              {/* Inspection Checklist Details */}
              <div className="mt-4 space-y-3 rounded-2xl border border-neutral-800/80 bg-neutral-950/70 p-4">
                <div className="flex items-center justify-between border-b border-neutral-800/60 pb-2.5">
                  <div className="flex items-center gap-2">
                    <ListChecks className="size-4 text-[#d4af37]" />
                    <h4 className="text-xs font-black text-white">
                      قوائم الفحص وبنود الخدمة ({item.service.nameAr})
                    </h4>
                  </div>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                    {item.checklistInstances.filter((inst) => inst.completedAt).length} من {Math.max(item.checklistInstances.length, item.service.checklistTemplates?.length ?? 0)} مراحل مكتملة
                  </span>
                </div>

                <div className="space-y-3 pt-1">
                  {(() => {
                    const stageMap = new Map<string, {
                      stage: string;
                      instance?: QualityChecklistInstance;
                      template?: QualityChecklistTemplate;
                    }>();

                    item.service.checklistTemplates?.forEach((tpl) => {
                      stageMap.set(tpl.stage, { stage: tpl.stage, template: tpl });
                    });

                    item.checklistInstances.forEach((inst) => {
                      const existing = stageMap.get(inst.stage) || { stage: inst.stage };
                      existing.instance = inst;
                      stageMap.set(inst.stage, existing);
                    });

                    const stagesList = Array.from(stageMap.values());

                    if (stagesList.length === 0) {
                      return <p className="text-xs text-neutral-400 italic">لا توجد مراحل فحص مسجلة أو محددة لهذه الخدمة.</p>;
                    }

                    return stagesList.map(({ stage, instance, template }) => {
                      const stageLabel = {
                        ARRIVAL: 'مرحلة الوصول وفحص الموقع',
                        BEFORE_SERVICE: 'الفحص المبدئي وتوثيق الحالة',
                        IN_SERVICE: 'بنود التنفيذ أثناء الخدمة',
                        AFTER_SERVICE: 'فحص الجودة بعد انتهاء الخدمة',
                        DELIVERY: 'تسليم الخدمة للعميل والتحصيل',
                      }[stage] || stage;

                      const isStageDone = !!instance?.completedAt;
                      const templateItems = template?.items ?? [];
                      const instanceResults = instance?.results ?? [];

                      type DisplayItem = {
                        id: string;
                        label: string;
                        required: boolean;
                        isChecked: boolean;
                        note?: string | null;
                        description?: string | null;
                      };

                      const displayItems: DisplayItem[] = [];

                      if (templateItems.length > 0) {
                        templateItems.forEach((tplItem) => {
                          const matchingResult = instanceResults.find(
                            (r) => r.itemId === tplItem.id || r.itemLabel === tplItem.labelAr
                          );
                          displayItems.push({
                            id: tplItem.id,
                            label: tplItem.labelAr,
                            required: tplItem.required,
                            isChecked: matchingResult ? matchingResult.isChecked : isStageDone,
                            note: matchingResult?.note,
                            description: tplItem.descriptionAr,
                          });
                        });
                      } else if (instanceResults.length > 0) {
                        instanceResults.forEach((res) => {
                          displayItems.push({
                            id: res.id,
                            label: res.itemLabel,
                            required: false,
                            isChecked: res.isChecked,
                            note: res.note,
                          });
                        });
                      }

                      return (
                        <div key={stage} className="rounded-xl border border-neutral-800/80 bg-[#141418] p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`size-2 rounded-full ${isStageDone ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                              <span className="font-bold text-xs text-neutral-200">{stageLabel}</span>
                            </div>
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                              isStageDone
                                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                                : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                            }`}>
                              {isStageDone ? '✓ مرحلة مكتملة' : 'بانتظار الفحص'}
                            </span>
                          </div>

                          {displayItems.length > 0 ? (
                            <div className="grid gap-2 sm:grid-cols-2 pt-1">
                              {displayItems.map((itemRow) => (
                                <div
                                  key={itemRow.id}
                                  className={`flex items-start gap-2 rounded-lg p-2.5 text-xs border ${
                                    itemRow.isChecked
                                      ? 'border-emerald-500/25 bg-emerald-500/[0.06] text-neutral-200'
                                      : 'border-amber-500/25 bg-amber-500/[0.06] text-amber-200'
                                  }`}
                                >
                                  <div className="mt-0.5 shrink-0">
                                    {itemRow.isChecked ? (
                                      <CheckCircle2 className="size-3.5 text-emerald-400" />
                                    ) : (
                                      <span className="inline-grid size-3.5 place-items-center rounded-full border border-amber-400 text-[9px] font-bold text-amber-400">⋯</span>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1">
                                      <p className={`font-bold ${itemRow.isChecked ? 'text-white' : 'text-neutral-200'}`}>
                                        {itemRow.label}
                                      </p>
                                      {itemRow.required ? (
                                        <span className="rounded bg-rose-500/10 border border-rose-500/20 px-1 py-0.2 text-[9px] font-bold text-rose-300 shrink-0">
                                          إلزامي
                                        </span>
                                      ) : null}
                                    </div>
                                    {itemRow.description ? (
                                      <p className="mt-0.5 text-[10px] text-neutral-400">{itemRow.description}</p>
                                    ) : null}
                                    {itemRow.note ? (
                                      <p className="mt-1 text-[11px] text-neutral-300 bg-black/50 rounded px-2 py-0.5 border border-white/5">
                                        ملاحظة الفني: {itemRow.note}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-neutral-400 italic">
                              {isStageDone ? 'تم تأكيد إكمال المرحلة من الفريق المنفذ.' : 'لا توجد بنود محددة في هذا القالب.'}
                            </p>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              <form
                onSubmit={(event) => submitQuality(event, item.id)}
                className="mt-4 space-y-3 border-t border-neutral-800/80 pt-4 text-xs sm:text-sm"
              >

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="تقييم الجودة">
                    <select name="score" defaultValue="5" className={inputClass}>
                      {[5, 4, 3, 2, 1].map((score) => (
                        <option key={score} value={score}>
                          {score} / 5 نجوم
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="ملاحظات الجودة">
                  <textarea name="notes" rows={3} maxLength={1000} className={inputClass} placeholder="ملاحظات الفحص..." />
                </Field>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="submit" name="approved" value="true" disabled={isPending} className={successButtonClass}>
                    <CheckCircle2 className="size-3.5" />
                    <span>اعتماد الجودة</span>
                  </button>
                  <button
                    type="submit"
                    name="approved"
                    value="false"
                    disabled={isPending}
                    className={secondaryButtonClass}
                  >
                    <RefreshCcw className="size-3.5" />
                    <span>إعادة للفريق مع الملاحظات</span>
                  </button>
                </div>
              </form>
            </details>
          ))}
        </Queue>
        )}

        {/* 4. Complaints */}
        {showOtherCases && (
        <Queue
          title="الشكاوى المفتوحة"
          empty={complaints.length === 0}
          queueKey="complaints"
          pagination={pagination.complaints}
          icon={<MessageSquareWarning className="size-5 text-[#d4af37]" />}
        >
          {complaints.map((item) => (
            <details
              key={item.id}
              className="group rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-4 transition-all duration-200 open:border-[#d4af37]/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-white group-hover:text-[#f3e4a8]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-rose-500" />
                    <span dir="ltr" className="font-mono text-xs font-black text-[#d4af37]">
                      {item.booking.bookingNumber}
                    </span>
                    <span>— {item.type}</span>
                  </div>
                  <span className="mt-1 block text-xs font-normal text-neutral-400">
                    {item.priority} · {item.status} · {item.customer.user.fullName}
                  </span>
                </div>
                <span className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-neutral-300 group-open:bg-[#d4af37]/10 group-open:text-[#d4af37] group-open:border-[#d4af37]/30">
                  فرز وحل
                </span>
              </summary>
              <div className="mt-4 space-y-4 border-t border-neutral-800/80 pt-4 text-xs sm:text-sm">
                <div className="rounded-xl bg-neutral-950/60 p-3 border border-neutral-800/60">
                  <p className="text-neutral-300">{item.description}</p>
                </div>

                <form onSubmit={(event) => submitComplaintTriage(event, item.id)} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="الأولوية">
                      <select name="priority" defaultValue={item.priority} className={inputClass}>
                        <option value="LOW">منخفضة</option>
                        <option value="MEDIUM">متوسطة</option>
                        <option value="HIGH">عالية</option>
                        <option value="URGENT">عاجلة</option>
                      </select>
                    </Field>
                    <Field label="الحالة">
                      <select name="status" defaultValue="UNDER_REVIEW" className={inputClass}>
                        <option value="UNDER_REVIEW">قيد المراجعة</option>
                        <option value="ACTION_REQUIRED">يتطلب إجراء</option>
                      </select>
                    </Field>
                    <Field label="المسؤول">
                      <select
                        name="assignedToUserId"
                        defaultValue={item.assignedToUser?.id ?? ''}
                        className={inputClass}
                      >
                        <option value="">غير مسند</option>
                        {complaintAssignees.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.fullName}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="ملاحظات الفرز">
                    <textarea name="notes" required minLength={3} rows={2} className={inputClass} />
                  </Field>
                  <button type="submit" disabled={isPending} className={secondaryButtonClass}>
                    <span>حفظ الفرز والمتابعة</span>
                  </button>
                </form>

                <form
                  onSubmit={(event) => submitComplaintResolution(event, item.id)}
                  className="space-y-3 border-t border-neutral-800/80 pt-4"
                >
                  <Field label="الحل والرد">
                    <textarea name="resolution" required minLength={3} rows={3} className={inputClass} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="التعويض (اختياري)">
                      <input name="compensation" maxLength={500} className={inputClass} />
                    </Field>
                    <Field label="الحالة النهائية">
                      <select name="status" defaultValue="RESOLVED" className={inputClass}>
                        <option value="RESOLVED">تم الحل</option>
                        <option value="COMPENSATED">تم التعويض</option>
                        <option value="CLOSED">إغلاق الشكوى</option>
                      </select>
                    </Field>
                  </div>
                  <button type="submit" disabled={isPending} className={successButtonClass}>
                    <CheckCircle2 className="size-3.5" />
                    <span>حفظ الحل النهائي</span>
                  </button>
                </form>
              </div>
            </details>
          ))}
        </Queue>
        )}

        {/* 5. Refunds Awaiting Approval */}
        {showOtherCases && canApproveRefund && (
          <Queue
            title="استردادات تنتظر الاعتماد"
            empty={refundsAwaitingApproval.length === 0}
            queueKey="refunds"
            pagination={pagination.refunds}
            icon={<RefreshCcw className="size-5 text-[#d4af37]" />}
          >
            {refundsAwaitingApproval.map((item) => (
              <details
                key={item.id}
                className="group rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-4 transition-all duration-200 open:border-[#d4af37]/40"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-white group-hover:text-[#f3e4a8]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-emerald-400" />
                      <span dir="ltr" className="font-mono text-xs font-black text-[#d4af37]">
                        {item.booking.bookingNumber}
                      </span>
                      <span>— {item.booking.customer.user.fullName}</span>
                    </div>
                    <span className="mt-1 block text-xs font-normal text-neutral-400">
                      مبلغ الاسترداد: {item.amount} ج.م · الوسيلة: {item.refundMethod}
                    </span>
                  </div>
                  <span className="rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-neutral-300 group-open:bg-[#d4af37]/10 group-open:text-[#d4af37] group-open:border-[#d4af37]/30">
                    اعتماد
                  </span>
                </summary>
                <form
                  onSubmit={(event) => submitRefundApproval(event, item.id)}
                  className="mt-4 space-y-3 border-t border-neutral-800/80 pt-4 text-xs sm:text-sm"
                >
                  {item.proofFileUrl && (
                    <a
                      href={item.proofFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-2 text-xs font-bold text-[#e5c45a]"
                    >
                      <span>فتح إثبات الاسترداد</span>
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                  <Field label="سبب الاعتماد">
                    <textarea name="reason" required minLength={3} rows={2} className={inputClass} />
                  </Field>
                  <button type="submit" disabled={isPending} className={successButtonClass}>
                    <CheckCircle2 className="size-3.5" />
                    <span>اعتماد الاسترداد وتحديث الرصيد</span>
                  </button>
                </form>
              </details>
            ))}
          </Queue>
        )}
      </div>
    </section>
  );
}

function Queue({
  title,
  empty,
  children,
  queueKey,
  pagination,
  icon,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
  queueKey: OperationsCaseQueueKey;
  pagination: QueuePagination;
  icon?: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-800/80 bg-[#0e0e12]/90 backdrop-blur-xl p-5 shadow-xl">
      <div className="flex items-center gap-2 pb-2 border-b border-neutral-800/80">
        {icon}
        <h3 className="text-base font-black text-white">{title}</h3>
      </div>
      {empty ? (
        <div className="rounded-xl border border-dashed border-neutral-800/80 bg-neutral-950/40 p-6 text-center text-xs sm:text-sm text-neutral-400">
          لا توجد عناصر في هذه القائمة حالياً.
        </div>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
      <OperationsQueuePagination queueKey={queueKey} pagination={pagination} />
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}
