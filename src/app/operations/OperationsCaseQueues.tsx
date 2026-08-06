'use client';

import { FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  MessageSquareWarning,
  RefreshCcw,
  ShieldCheck,
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

interface QualityCase {
  id: string;
  bookingNumber: string;
  branch: { nameAr: string };
  service: { nameAr: string };
  customer: { user: UserSummary };
  files: Array<{ id: string; fileType: string; fileUrl: string; createdAt: DateValue }>;
  checklistInstances: Array<{ id: string; stage: string; completedAt: DateValue | null }>;
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
}

const inputClass = 'w-full rounded-xl border border-neutral-700 bg-[#080808] px-3 py-2.5 text-sm text-white focus:border-[#c9a227] focus:outline-none focus:ring-2 focus:ring-[#c9a227]/20';
const labelClass = 'mb-1.5 block text-xs font-semibold text-neutral-300';

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
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const canApproveRefund = actorRole === 'OPERATIONS_MANAGER' || actorRole === 'OWNER' || actorRole === 'SYSTEM_SUPER_ADMIN';
  const pagedCount = (count: number, queue: QueuePagination) => queue.hasNextPage ? `${count}+` : count;

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
        setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'تعذر تنفيذ الإجراء.' });
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
      const uploaded = await response.json() as { error?: string; bookingFileId?: string };
      if (!response.ok || !uploaded.bookingFileId) throw new Error(uploaded.error ?? 'تعذر رفع إثبات الاسترداد.');
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
    <section aria-labelledby="case-queues-heading" className="space-y-6 border-t border-neutral-800 pt-8">
      <div>
        <h2 id="case-queues-heading" className="text-2xl font-black text-white">قوائم الحالات والجودة</h2>
        <p className="mt-2 text-sm text-neutral-400">قرارات الإلغاء والمواعيد والجودة والشكاوى والاسترداد من سجلات قاعدة البيانات.</p>
      </div>

      <div aria-live="polite" className="min-h-5">
        {feedback && <p className={`rounded-xl border px-4 py-3 text-sm ${feedback.tone === 'success' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>{feedback.message}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['طلبات الإلغاء', pagedCount(cancellationRequests.length, pagination.cancellations), AlertTriangle],
          ['تعديل المواعيد', pagedCount(rescheduleRequests.length, pagination.reschedules), CalendarClock],
          ['مراجعة الجودة', pagedCount(qualityBookings.length, pagination.quality), ShieldCheck],
          ['الشكاوى المفتوحة', pagedCount(complaints.length, pagination.complaints), MessageSquareWarning],
          ['اعتماد الاسترداد', pagedCount(refundsAwaitingApproval.length, pagination.refunds), RefreshCcw],
        ].map(([label, count, Icon]) => {
          const QueueIcon = Icon as typeof AlertTriangle;
          return <div key={String(label)} className="rounded-2xl border border-neutral-800 bg-[#141414] p-4"><div className="flex items-center justify-between text-xs text-neutral-400"><span>{String(label)}</span><QueueIcon className="size-4 text-[#c9a227]" /></div><strong className="mt-3 block text-2xl text-white">{String(count)}</strong></div>;
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Queue title="طلبات الإلغاء والاسترداد" empty={cancellationRequests.length === 0} queueKey="cancellations" pagination={pagination.cancellations}>
          {cancellationRequests.map((item) => {
            const recorded = item.booking.refunds
              .filter((refund) => ['REFUND_PROCESSING', 'REFUNDED'].includes(refund.status))
              .reduce((total, refund) => total + refund.amount, 0);
            const refundRemaining = Math.max(0, (item.approvedRefundAmount ?? 0) - recorded);
            return (
              <details key={item.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4">
                <summary className="cursor-pointer list-none text-sm font-bold text-[#e5c45a]">{item.booking.bookingNumber} — {item.booking.customer.user.fullName}<span className="mt-1 block text-xs font-normal text-neutral-500">{item.status} • {item.booking.service.nameAr} • {formatDate(item.createdAt)}</span></summary>
                <div className="mt-4 space-y-4 border-t border-neutral-800 pt-4 text-sm">
                  <p className="text-neutral-300">{item.reason}</p>
                  {item.status === 'APPROVED_REFUND_PENDING' ? (
                    <form onSubmit={(event) => submitRefund(event, item.bookingId)} className="space-y-3" aria-busy={isPending}>
                      <p className="text-xs text-amber-300">المتبقي من الاسترداد المعتمد: {refundRemaining} ج.م</p>
                      <div className="grid gap-3 sm:grid-cols-2"><Field label="المبلغ"><input name="amount" type="number" min={1} max={refundRemaining} defaultValue={refundRemaining} required className={inputClass} /></Field><Field label="وسيلة الاسترداد"><input name="refundMethod" required maxLength={200} className={inputClass} /></Field><Field label="رقم المرجع"><input name="referenceNumber" maxLength={100} className={inputClass} /></Field><Field label="وقت الاسترداد"><input name="refundTimestamp" type="datetime-local" required className={inputClass} /></Field><Field label="إثبات الاسترداد"><input name="refundFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className={inputClass} /></Field></div>
                      <Field label="ملاحظات"><textarea name="notes" rows={2} maxLength={1000} className={inputClass} /></Field>
                      <button type="submit" disabled={isPending || refundRemaining === 0} className="rounded-xl bg-[#c9a227] px-4 py-2.5 text-xs font-bold text-black disabled:opacity-50">تسجيل وإرسال للاعتماد</button>
                    </form>
                  ) : (
                    <form onSubmit={(event) => submitCancellation(event, item.id)} className="space-y-3" aria-busy={isPending}>
                      <p className="text-xs text-neutral-500">المدفوع {item.booking.amountPaid} ج.م · العربون المثبت {item.booking.depositAmount} ج.م. عند الاحتفاظ بالعربون يُرد أي مبلغ زائد تلقائيًا.</p>
                      <div className="grid gap-3 sm:grid-cols-2"><Field label="نوع الحل"><select name="resolutionType" defaultValue={item.preferredAction === 'RESCHEDULE' && item.reschedulingAllowed ? 'RESCHEDULE' : 'REFUND_FULL'} className={inputClass}><option value="REFUND_FULL">استرداد كامل</option><option value="REFUND_PARTIAL">استرداد جزئي</option><option value="NO_REFUND">دون استرداد</option><option value="KEEP_DEPOSIT">الاحتفاظ بالعربون ورد الزيادة</option><option value="VISIT_FEE">تطبيق رسوم زيارة ورد الباقي</option>{item.reschedulingAllowed ? <option value="RESCHEDULE">إعادة جدولة</option> : null}<option value="CREDIT">تحويل كامل المدفوع لرصيد</option><option value="ESCALATE">تصعيد للمالك</option></select></Field><Field label="الطرف المسؤول"><select name="responsibleParty" className={inputClass}><option value="CUSTOMER">العميل</option><option value="TEAM">الفريق</option><option value="BRANCH">الفرع</option><option value="ACCESS">الدخول/التصريح</option><option value="FORCE_MAJEURE">ظرف قهري</option></select></Field><Field label="مبلغ الاسترداد الجزئي (عند اختياره)"><input name="approvedRefundAmount" type="number" min={1} max={item.booking.amountPaid} className={inputClass} /></Field><Field label="رسوم الزيارة (عند اختيارها)"><input name="visitFeeAmount" type="number" min={1} max={item.booking.amountPaid} className={inputClass} /></Field></div>
                      <Field label="ملاحظات القرار"><textarea name="resolutionNotes" required minLength={3} maxLength={1000} rows={3} className={inputClass} /></Field>
                      <div className="flex gap-2"><button type="submit" name="decision" value="APPROVE" disabled={isPending} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-black disabled:opacity-50">اعتماد الحل</button><button type="submit" name="decision" value="REJECT" disabled={isPending} className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">رفض الطلب</button></div>
                    </form>
                  )}
                </div>
              </details>
            );
          })}
        </Queue>

        <Queue title="طلبات تعديل الموعد" empty={rescheduleRequests.length === 0} queueKey="reschedules" pagination={pagination.reschedules}>
          {rescheduleRequests.map((item) => (
            <details key={item.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4">
              <summary className="cursor-pointer list-none text-sm font-bold text-[#e5c45a]">{item.booking.bookingNumber} — {item.booking.customer.user.fullName}<span className="mt-1 block text-xs font-normal text-neutral-500">من {formatDate(item.oldStartAt)} إلى {formatDate(item.requestedStartAt)}</span></summary>
              <form onSubmit={(event) => submitReschedule(event, item.id)} className="mt-4 space-y-3 border-t border-neutral-800 pt-4"><p className="text-sm text-neutral-300">{item.reason}</p><Field label="الموعد الذي اعتمده المدير"><input name="approvedStartAt" type="datetime-local" required className={inputClass} /></Field><Field label="ملاحظات القرار"><textarea name="reviewNotes" required minLength={3} rows={3} className={inputClass} /></Field><div className="flex gap-2"><button type="submit" name="decision" value="APPROVE" disabled={isPending} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-black">إعادة فحص واعتماد</button><button type="submit" name="decision" value="REJECT" disabled={isPending} className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold">رفض</button></div></form>
            </details>
          ))}
        </Queue>

        <Queue title="مراجعة الجودة" empty={qualityBookings.length === 0} queueKey="quality" pagination={pagination.quality}>
          {qualityBookings.map((item) => (
            <details key={item.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4">
              <summary className="cursor-pointer list-none text-sm font-bold text-[#e5c45a]">{item.bookingNumber} — {item.service.nameAr}<span className="mt-1 block text-xs font-normal text-neutral-500">{item.customer.user.fullName} • {item.checklistInstances.filter((instance) => instance.completedAt).length}/{item.checklistInstances.length} قوائم مكتملة</span></summary>
              <form onSubmit={(event) => submitQuality(event, item.id)} className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
                <div className="flex flex-wrap gap-2">{item.files.map((file) => <a key={file.id} href={file.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:border-[#c9a227]">{file.fileType === 'BEFORE_SERVICE' ? 'قبل' : 'بعد'} <ExternalLink className="size-3" /></a>)}</div>
                <div className="grid gap-3 sm:grid-cols-2"><Field label="التقييم"><select name="score" defaultValue="5" className={inputClass}>{[5, 4, 3, 2, 1].map((score) => <option key={score} value={score}>{score} / 5</option>)}</select></Field></div><Field label="ملاحظات الجودة"><textarea name="notes" rows={3} maxLength={1000} className={inputClass} /></Field><div className="flex gap-2"><button type="submit" name="approved" value="true" disabled={isPending} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-black"><CheckCircle2 className="size-4" />اعتماد</button><button type="submit" name="approved" value="false" disabled={isPending} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-black">إعادة للفريق</button></div>
              </form>
            </details>
          ))}
        </Queue>

        <Queue title="الشكاوى المفتوحة" empty={complaints.length === 0} queueKey="complaints" pagination={pagination.complaints}>
          {complaints.map((item) => (
            <details key={item.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4">
              <summary className="cursor-pointer list-none text-sm font-bold text-[#e5c45a]">{item.booking.bookingNumber} — {item.type}<span className="mt-1 block text-xs font-normal text-neutral-500">{item.priority} • {item.status} • {item.customer.user.fullName}</span></summary>
              <div className="mt-4 space-y-4 border-t border-neutral-800 pt-4"><p className="text-sm text-neutral-300">{item.description}</p><form onSubmit={(event) => submitComplaintTriage(event, item.id)} className="space-y-3"><div className="grid gap-3 sm:grid-cols-3"><Field label="الأولوية"><select name="priority" defaultValue={item.priority} className={inputClass}><option value="LOW">منخفضة</option><option value="MEDIUM">متوسطة</option><option value="HIGH">عالية</option><option value="URGENT">عاجلة</option></select></Field><Field label="الحالة"><select name="status" defaultValue="UNDER_REVIEW" className={inputClass}><option value="UNDER_REVIEW">قيد المراجعة</option><option value="ACTION_REQUIRED">يتطلب إجراء</option></select></Field><Field label="المسؤول"><select name="assignedToUserId" defaultValue={item.assignedToUser?.id ?? ''} className={inputClass}><option value="">غير مسند</option>{complaintAssignees.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select></Field></div><Field label="ملاحظات الفرز"><textarea name="notes" required minLength={3} rows={2} className={inputClass} /></Field><button type="submit" disabled={isPending} className="rounded-xl border border-[#c9a227]/60 px-4 py-2.5 text-xs font-bold text-[#e5c45a]">حفظ الفرز</button></form><form onSubmit={(event) => submitComplaintResolution(event, item.id)} className="space-y-3 border-t border-neutral-800 pt-4"><Field label="الحل"><textarea name="resolution" required minLength={3} rows={3} className={inputClass} /></Field><Field label="التعويض (اختياري)"><input name="compensation" maxLength={500} className={inputClass} /></Field><Field label="الحالة النهائية"><select name="status" defaultValue="RESOLVED" className={inputClass}><option value="RESOLVED">تم الحل</option><option value="COMPENSATED">تم التعويض</option><option value="CLOSED">إغلاق</option></select></Field><button type="submit" disabled={isPending} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-black">حفظ الحل</button></form></div>
            </details>
          ))}
        </Queue>

        {canApproveRefund && (
          <Queue title="استردادات تنتظر الاعتماد" empty={refundsAwaitingApproval.length === 0} queueKey="refunds" pagination={pagination.refunds}>
            {refundsAwaitingApproval.map((item) => (
              <details key={item.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4"><summary className="cursor-pointer list-none text-sm font-bold text-[#e5c45a]">{item.booking.bookingNumber} — {item.amount} ج.م<span className="mt-1 block text-xs font-normal text-neutral-500">{item.booking.customer.user.fullName} • {item.refundMethod}</span></summary><form onSubmit={(event) => submitRefundApproval(event, item.id)} className="mt-4 space-y-3 border-t border-neutral-800 pt-4">{item.proofFileUrl && <a href={item.proofFileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-[#e5c45a]">فتح إثبات الاسترداد <ExternalLink className="size-4" /></a>}<Field label="سبب الاعتماد"><textarea name="reason" required minLength={3} rows={2} className={inputClass} /></Field><button type="submit" disabled={isPending} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-black">اعتماد الاسترداد</button></form></details>
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
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
  queueKey: OperationsCaseQueueKey;
  pagination: QueuePagination;
}) {
  return <section className="space-y-3 rounded-3xl border border-[#c9a227]/20 bg-[#141414] p-5"><h3 className="text-lg font-bold text-white">{title}</h3>{empty ? <p className="rounded-xl bg-[#080808] p-6 text-center text-sm text-neutral-500">لا توجد عناصر في هذه القائمة.</p> : children}<OperationsQueuePagination queueKey={queueKey} pagination={pagination} /></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className={labelClass}>{label}</span>{children}</label>;
}
