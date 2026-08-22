'use client';

import type { FormEvent, ReactNode } from 'react';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileCheck2,
  HandCoins,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { recordRefundAction } from '@/app/actions/cancellation';
import {
  recordBalancePaymentAction,
  reviewBookingAction,
  reviewPaymentProofAction,
} from '@/app/actions/operations';
import {
  advancePostServiceAction,
  reviewQualityAction,
} from '@/app/actions/quality';
import { prepareImageForUpload } from '@/lib/client/image-upload';

type DateValue = string | Date;
type ActionResult = { success?: boolean; error?: string };

interface EnabledPermissions {
  'payment.review': boolean;
  'booking.accept': boolean;
  'booking.view_unassigned': boolean;
  'quality.review': boolean;
  'payment.record_balance': boolean;
  'refund.record_proof': boolean;
  'booking.close': boolean;
}

interface PendingProof {
  id: string;
  senderName: string;
  senderPhoneOrAccount: string;
  referenceNumber: string | null;
  amountSubmitted: number;
  transferTimestamp: DateValue;
  proofFileUrl: string;
  paymentMethod: { name: string };
  booking: {
    id: string;
    branchId: string;
    assignedTeamId: string | null;
    bookingNumber: string;
    depositAmount: number;
    amountPaid: number;
    amountDue: number;
    totalPrice: number;
    branch: { nameAr: string };
    service: { nameAr: string };
    vehicle: { make: string; model: string };
    customer: { user: { fullName: string } };
  };
}

interface ReviewBooking {
  id: string;
  branchId: string;
  assignedTeamId: string | null;
  bookingNumber: string;
  startAt: DateValue;
  amountPaid: number;
  amountDue: number;
  branch: { nameAr: string };
  service: { nameAr: string };
  vehicle: { make: string; model: string; plateNumber: string | null };
  coverageArea: { compound: string };
  customer: { user: { fullName: string } };
}

interface UnassignedBooking {
  id: string;
  branchId: string;
  assignedTeamId: string | null;
  bookingNumber: string;
  bookingStatus: string;
  startAt: DateValue;
  branch: { nameAr: string };
  service: { nameAr: string };
  vehicle: { make: string; model: string; plateNumber: string | null };
  coverageArea: { compound: string };
}

interface QualityBooking {
  id: string;
  branchId: string;
  assignedTeamId: string | null;
  bookingNumber: string;
  branch: { nameAr: string };
  service: { nameAr: string };
  assignedTeam: { name: string } | null;
  customer: { user: { fullName: string } };
  files: Array<{ id: string; fileType: string; fileUrl: string; mimeType: string }>;
}

interface BalanceBooking {
  id: string;
  branchId: string;
  assignedTeamId: string | null;
  bookingNumber: string;
  bookingStatus: string;
  amountDue: number;
  amountPaid: number;
  totalPrice: number;
  branch: { nameAr: string };
  service: { nameAr: string };
  customer: { user: { fullName: string } };
}

interface CloseBooking {
  id: string;
  branchId: string;
  assignedTeamId: string | null;
  bookingNumber: string;
  branch: { nameAr: string };
  service: { nameAr: string };
  customer: { user: { fullName: string } };
}

interface RefundCase {
  id: string;
  approvedRefundAmount: number;
  remainingAmount: number;
  booking: {
    id: string;
    branchId: string;
    assignedTeamId: string | null;
    bookingNumber: string;
    branch: { nameAr: string };
    service: { nameAr: string };
    customer: { user: { fullName: string } };
  };
}

interface Props {
  enabled: EnabledPermissions;
  canManagePrices: boolean;
  pendingProofs: PendingProof[];
  reviewBookings: ReviewBooking[];
  unassignedBookings: UnassignedBooking[];
  qualityBookings: QualityBooking[];
  balanceBookings: BalanceBooking[];
  refundCases: RefundCase[];
  closeBookings: CloseBooking[];
}

const inputClass = 'w-full rounded-xl border border-neutral-700 bg-[#080808] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20';
const labelClass = 'mb-1.5 block text-xs font-bold text-neutral-300';

function formatDate(value: DateValue) {
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}

function money(value: number) {
  return new Intl.NumberFormat('ar-EG').format(value) + ' ج.م';
}

function submitterValue(event: FormEvent<HTMLFormElement>, fallback: string) {
  const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
  return submitter?.value || fallback;
}

function QueueSection({
  id,
  title,
  description,
  count,
  children,
}: {
  id: string;
  title: string;
  description: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4 rounded-3xl border border-neutral-800 bg-[#141414] p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={id} className="text-xl font-black">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-neutral-400">{description}</p>
        </div>
        <span className="rounded-full bg-[#c9a227]/10 px-3 py-1 text-sm font-black text-[#e5c45a]">{count}</span>
      </div>
      {count ? children : (
        <p className="rounded-2xl border border-dashed border-neutral-700 p-8 text-center text-sm text-neutral-500">لا توجد عناصر تنتظر الإجراء في نطاق تفويضك.</p>
      )}
    </section>
  );
}

export default function DelegatedOperationsBoard({
  enabled,
  canManagePrices,
  pendingProofs,
  reviewBookings,
  unassignedBookings,
  qualityBookings,
  balanceBookings,
  refundCases,
  closeBookings,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  function execute(
    form: HTMLFormElement,
    task: (data: FormData) => Promise<ActionResult>,
    successMessage: string,
    prepare?: (data: FormData) => void,
  ) {
    const data = new FormData(form);
    prepare?.(data);
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await task(data);
        if (result.error) {
          setFeedback({ tone: 'error', message: result.error });
          return;
        }
        setFeedback({ tone: 'success', message: successMessage });
        router.refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'تعذر تنفيذ الإجراء. حدّث الصفحة وحاول مرة أخرى.' });
      }
    });
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
    const localTimestamp = String(data.get('refundTimestamp') ?? '');
    if (!localTimestamp) {
      setFeedback({ tone: 'error', message: 'حدد وقت تنفيذ الاسترداد.' });
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      try {
        const preparedFile = await prepareImageForUpload(file);
        const upload = new FormData();
        upload.set('bookingId', bookingId);
        upload.set('category', 'refund-proofs');
        upload.set('file', preparedFile);
        const response = await fetch('/api/upload', { method: 'POST', body: upload });
        const uploaded = await response.json() as { error?: string; bookingFileId?: string };
        if (!response.ok || !uploaded.bookingFileId) {
          throw new Error(uploaded.error ?? 'تعذر رفع إثبات الاسترداد.');
        }

        data.delete('refundFile');
        data.set('bookingId', bookingId);
        data.set('bookingFileId', uploaded.bookingFileId);
        data.set('refundTimestamp', new Date(localTimestamp).toISOString());
        data.set('idempotencyKey', crypto.randomUUID());
        const result = await recordRefundAction(data);
        if (result.error) {
          setFeedback({ tone: 'error', message: result.error });
          return;
        }
        setFeedback({
          tone: 'success',
          message: 'تم تسجيل إثبات الاسترداد وإرساله للاعتماد النهائي دون اعتماده من حسابك.',
        });
        form.reset();
        router.refresh();
      } catch (error) {
        setFeedback({
          tone: 'error',
          message: error instanceof Error ? error.message : 'تعذر تسجيل إثبات الاسترداد.',
        });
      }
    });
  }

  const metrics = [
    enabled['payment.review'] ? ['إثباتات الدفع', pendingProofs.length, FileCheck2] as const : null,
    enabled['booking.accept'] ? ['قرارات الحجز', reviewBookings.length, CheckCircle2] as const : null,
    enabled['booking.view_unassigned'] ? ['غير المسندة', unassignedBookings.length, Eye] as const : null,
    enabled['quality.review'] ? ['مراجعة الجودة', qualityBookings.length, ShieldCheck] as const : null,
    enabled['payment.record_balance'] ? ['تحصيل الرصيد', balanceBookings.length, HandCoins] as const : null,
    enabled['refund.record_proof'] ? ['إثباتات الاسترداد', refundCases.length, RotateCcw] as const : null,
    enabled['booking.close'] ? ['الإغلاق النهائي', closeBookings.length, LockKeyhole] as const : null,
  ].filter((metric): metric is NonNullable<typeof metric> => metric !== null);

  return (
    <main className="min-h-screen bg-[#080808] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="rounded-3xl border border-[#c9a227]/35 bg-[#141414] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/staff" className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 px-3 py-2 text-xs font-bold text-neutral-300 hover:border-[#c9a227]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]">
              <ArrowRight className="size-4" aria-hidden="true" /> العودة لمهام الفريق
            </Link>
            {canManagePrices ? (
              <Link href="/operations/pricing" className="inline-flex items-center gap-2 rounded-xl bg-[#c9a227] px-4 py-2.5 text-xs font-black text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5c45a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141414]">
                <BadgeDollarSign className="size-4" aria-hidden="true" /> الأسعار المفوّضة
              </Link>
            ) : null}
          </div>
          <div className="mt-6 max-w-3xl">
            <p className="text-xs font-bold text-[#e5c45a]">صلاحيات إضافية محددة بالنطاق والمدة</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">مكتب المهام المفوّضة</h1>
            <p className="mt-2 text-sm leading-7 text-neutral-400">تظهر هنا فقط القوائم التي منحها لك المالك صراحة. كل قرار يُعاد التحقق منه في الخادم ويُسجل في سجل التدقيق.</p>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map(([label, count, Icon]) => (
            <div key={label} className="rounded-2xl border border-neutral-800 bg-[#141414] p-4">
              <span className="flex items-center justify-between text-xs text-neutral-400">{label}<Icon className="size-4 text-[#c9a227]" aria-hidden="true" /></span>
              <strong className="mt-3 block text-2xl text-[#e5c45a]">{count}</strong>
            </div>
          ))}
        </div>

        <div aria-live="polite" className="min-h-5">
          {feedback ? (
            <p className={`rounded-xl border px-4 py-3 text-sm ${feedback.tone === 'success' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
              {feedback.message}
            </p>
          ) : null}
        </div>

        {enabled['payment.review'] ? (
          <QueueSection id="delegated-payment-review" title="مراجعة إثباتات الدفع" description="اعتمد أو ارفض الإثبات بعد مطابقة المبلغ والمرجع والملف." count={pendingProofs.length}>
            <div className="grid gap-4 lg:grid-cols-2">
              {pendingProofs.map((proof) => (
                <details key={proof.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4">
                  <summary className="cursor-pointer list-none font-bold text-[#e5c45a]">
                    {proof.booking.bookingNumber} — {money(proof.amountSubmitted)}
                    <span className="mt-1 block text-xs font-normal text-neutral-500">{proof.booking.service.nameAr} · {proof.booking.branch.nameAr}</span>
                  </summary>
                  <div className="mt-4 space-y-4 border-t border-neutral-800 pt-4 text-sm">
                    <dl className="grid gap-2 text-neutral-300 sm:grid-cols-2">
                      <div><dt className="text-xs text-neutral-500">العميل</dt><dd>{proof.booking.customer.user.fullName}</dd></div>
                      <div><dt className="text-xs text-neutral-500">المرسل</dt><dd>{proof.senderName}</dd></div>
                      <div><dt className="text-xs text-neutral-500">الحساب/الهاتف</dt><dd dir="ltr">{proof.senderPhoneOrAccount}</dd></div>
                      <div><dt className="text-xs text-neutral-500">المرجع</dt><dd>{proof.referenceNumber || 'غير مسجل'}</dd></div>
                      <div><dt className="text-xs text-neutral-500">الوسيلة</dt><dd>{proof.paymentMethod.name}</dd></div>
                      <div><dt className="text-xs text-neutral-500">وقت التحويل</dt><dd>{formatDate(proof.transferTimestamp)}</dd></div>
                    </dl>
                    {proof.proofFileUrl && proof.proofFileUrl.startsWith('/api/files/') ? (
                      <a href={proof.proofFileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-[#c9a227]/50 px-3 py-2 text-xs font-bold text-[#e5c45a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]">فتح الإثبات الخاص <ExternalLink className="size-4" aria-hidden="true" /></a>
                    ) : (
                      <span className="text-xs text-neutral-400">تم حذف صورة الإيصال تلقائيًا بعد القبول لتوفير المساحة.</span>
                    )}
                    <form onSubmit={(event) => { event.preventDefault(); execute(event.currentTarget, reviewPaymentProofAction, 'تم حفظ قرار مراجعة الإثبات.'); }} className="space-y-3">
                      <input type="hidden" name="proofId" value={proof.id} />
                      <div><label className={labelClass}>القرار</label><select name="decision" defaultValue="VERIFY" className={inputClass}><option value="VERIFY">اعتماد</option><option value="SHORT">المبلغ ناقص</option><option value="REUPLOAD">طلب إعادة رفع</option><option value="DUPLICATE">اشتباه تكرار</option><option value="REJECT">رفض</option></select></div>
                      <div><label className={labelClass}>ملاحظات القرار</label><textarea name="reviewNotes" rows={3} maxLength={1000} className={inputClass} placeholder="إلزامية عند عدم الاعتماد" /></div>
                      <button type="submit" disabled={isPending} className="rounded-xl bg-[#c9a227] px-4 py-2.5 text-xs font-black text-black disabled:opacity-50">حفظ القرار</button>
                    </form>
                  </div>
                </details>
              ))}
            </div>
          </QueueSection>
        ) : null}

        {enabled['booking.accept'] ? (
          <QueueSection id="delegated-booking-review" title="قبول أو رفض الحجز" description="قرار تشغيلي منفصل عن اعتماد الدفع، ولا يتيح التوزيع اليدوي." count={reviewBookings.length}>
            <div className="grid gap-4 lg:grid-cols-2">
              {reviewBookings.map((booking) => (
                <article key={booking.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4">
                  <h3 className="font-bold text-[#e5c45a]">{booking.bookingNumber} — {booking.service.nameAr}</h3>
                  <p className="mt-2 text-sm text-neutral-300">{booking.customer.user.fullName} · {booking.vehicle.make} {booking.vehicle.model}</p>
                  <p className="mt-1 text-xs text-neutral-500">{booking.branch.nameAr} · {booking.coverageArea.compound} · {formatDate(booking.startAt)}</p>
                  <form onSubmit={(event) => { event.preventDefault(); const decision = submitterValue(event, 'ACCEPT'); execute(event.currentTarget, reviewBookingAction, 'تم حفظ قرار الحجز.', (data) => data.set('decision', decision)); }} className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <div><label className={labelClass}>سبب القرار</label><textarea name="reason" required minLength={3} maxLength={1000} rows={3} className={inputClass} /></div>
                    <div className="flex gap-2"><button type="submit" value="ACCEPT" disabled={isPending} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-black disabled:opacity-50">اعتماد الحجز</button><button type="submit" value="REJECT" disabled={isPending} className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">رفض الحجز</button></div>
                  </form>
                </article>
              ))}
            </div>
          </QueueSection>
        ) : null}

        {enabled['booking.view_unassigned'] ? (
          <QueueSection id="delegated-unassigned" title="الحجوزات غير المسندة" description="عرض فقط؛ لا تظهر أدوات إسناد الفرق دون صلاحية مستقلة." count={unassignedBookings.length}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {unassignedBookings.map((booking) => (
                <article key={booking.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4 text-sm">
                  <h3 className="font-bold text-[#e5c45a]">{booking.bookingNumber}</h3>
                  <p className="mt-2 text-neutral-300">{booking.service.nameAr} · {booking.vehicle.make} {booking.vehicle.model}</p>
                  <p className="mt-1 text-xs text-neutral-500">{booking.branch.nameAr} · {booking.coverageArea.compound}</p>
                  <p className="mt-2 text-xs text-neutral-400">{formatDate(booking.startAt)} · {booking.bookingStatus}</p>
                </article>
              ))}
            </div>
          </QueueSection>
        ) : null}

        {enabled['quality.review'] ? (
          <QueueSection id="delegated-quality" title="مراجعة الجودة" description="راجع أدلة التنفيذ ثم اعتمد الخدمة أو أعدها للفريق بملاحظات." count={qualityBookings.length}>
            <div className="grid gap-4 lg:grid-cols-2">
              {qualityBookings.map((booking) => (
                <article key={booking.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4">
                  <h3 className="font-bold text-[#e5c45a]">{booking.bookingNumber} — {booking.service.nameAr}</h3>
                  <p className="mt-2 text-sm text-neutral-300">{booking.customer.user.fullName} · {booking.assignedTeam?.name ?? 'فريق غير مسجل'}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {booking.files.length ? booking.files.map((file) => (
                      <a key={file.id} href={file.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2.5 py-2 text-xs text-neutral-200 hover:border-[#c9a227]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227]">{file.fileType}<ExternalLink className="size-3.5" aria-hidden="true" /></a>
                    )) : <span className="text-xs text-amber-300">لا توجد صور تنفيذ مرفوعة.</span>}
                  </div>
                  <form onSubmit={(event) => { event.preventDefault(); const intent = submitterValue(event, 'APPROVE'); execute(event.currentTarget, reviewQualityAction, intent === 'APPROVE' ? 'تم اعتماد الجودة.' : 'أعيدت المهمة للفريق.', (data) => { data.set('approved', intent === 'APPROVE' ? 'true' : 'false'); data.set('returnedToTeam', intent === 'APPROVE' ? 'false' : 'true'); }); }} className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <div className="grid gap-3 sm:grid-cols-[120px_1fr]"><div><label className={labelClass}>التقييم</label><select name="score" defaultValue="5" className={inputClass}><option value="5">5 / 5</option><option value="4">4 / 5</option><option value="3">3 / 5</option><option value="2">2 / 5</option><option value="1">1 / 5</option></select></div><div><label className={labelClass}>ملاحظات الجودة</label><textarea name="notes" rows={3} maxLength={1000} className={inputClass} placeholder="إلزامية عند الإعادة للفريق" /></div></div>
                    <div className="flex gap-2"><button type="submit" value="APPROVE" disabled={isPending} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-black disabled:opacity-50">اعتماد الجودة</button><button type="submit" value="RETURN" disabled={isPending} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-black disabled:opacity-50">إعادة للفريق</button></div>
                  </form>
                </article>
              ))}
            </div>
          </QueueSection>
        ) : null}

        {enabled['payment.record_balance'] ? (
          <QueueSection id="delegated-balance" title="تسجيل الرصيد المحصّل" description="يمنع الخادم أي مبلغ أكبر من الرصيد الحالي ويستخدم مفتاحًا مانعًا للتكرار." count={balanceBookings.length}>
            <div className="grid gap-4 lg:grid-cols-2">
              {balanceBookings.map((booking) => (
                <article key={booking.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4">
                  <h3 className="font-bold text-[#e5c45a]">{booking.bookingNumber} — {booking.service.nameAr}</h3>
                  <p className="mt-2 text-sm text-neutral-300">{booking.customer.user.fullName} · المتبقي <strong className="text-white">{money(booking.amountDue)}</strong></p>
                  <form onSubmit={(event) => { event.preventDefault(); execute(event.currentTarget, recordBalancePaymentAction, 'تم تسجيل المبلغ المحصّل.', (data) => data.set('idempotencyKey', crypto.randomUUID())); }} className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <div className="grid gap-3 sm:grid-cols-2"><div><label className={labelClass}>المبلغ</label><input name="amount" type="number" min={1} max={booking.amountDue} defaultValue={booking.amountDue} required className={inputClass} /></div><div><label className={labelClass}>وسيلة التحصيل</label><select name="paymentMethod" defaultValue="CASH" className={inputClass}><option value="CASH">نقدي</option><option value="BANK_TRANSFER">تحويل بنكي</option><option value="MOBILE_WALLET">محفظة إلكترونية</option><option value="POS">POS</option></select></div></div>
                    <div><label className={labelClass}>رقم المرجع (اختياري)</label><input name="referenceNumber" maxLength={100} className={inputClass} dir="ltr" /></div>
                    <div><label className={labelClass}>ملاحظات التحصيل</label><textarea name="notes" rows={2} maxLength={1000} className={inputClass} /></div>
                    <button type="submit" disabled={isPending} className="rounded-xl bg-[#c9a227] px-4 py-2.5 text-xs font-black text-black disabled:opacity-50">تسجيل التحصيل</button>
                  </form>
                </article>
              ))}
            </div>
          </QueueSection>
        ) : null}

        {enabled['refund.record_proof'] ? (
          <QueueSection id="delegated-refunds" title="تسجيل إثبات الاسترداد" description="تسجل عملية الاسترداد فقط وتبقيها قيد الاعتماد النهائي لدى الإدارة." count={refundCases.length}>
            <div className="grid gap-4 lg:grid-cols-2">
              {refundCases.map((item) => (
                <article key={item.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4">
                  <h3 className="font-bold text-[#e5c45a]">{item.booking.bookingNumber} — {item.booking.service.nameAr}</h3>
                  <p className="mt-2 text-sm text-neutral-300">{item.booking.customer.user.fullName} · {item.booking.branch.nameAr}</p>
                  <p className="mt-1 text-xs text-neutral-500">المعتمد {money(item.approvedRefundAmount)} · المتبقي للتسجيل <strong className="text-amber-300">{money(item.remainingAmount)}</strong></p>
                  <form onSubmit={(event) => submitRefund(event, item.booking.id)} className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><label className={labelClass}>المبلغ</label><input name="amount" type="number" min={1} max={item.remainingAmount} defaultValue={item.remainingAmount} required className={inputClass} /></div>
                      <div><label className={labelClass}>وسيلة الاسترداد</label><input name="refundMethod" required minLength={2} maxLength={200} className={inputClass} placeholder="تحويل بنكي / محفظة" /></div>
                      <div><label className={labelClass}>رقم المرجع</label><input name="referenceNumber" maxLength={100} className={inputClass} dir="ltr" /></div>
                      <div><label className={labelClass}>وقت تنفيذ الاسترداد</label><input name="refundTimestamp" type="datetime-local" required className={inputClass} /></div>
                    </div>
                    <div><label className={labelClass}>إثبات الاسترداد</label><input name="refundFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className={inputClass} /></div>
                    <div><label className={labelClass}>ملاحظات</label><textarea name="notes" rows={2} maxLength={1000} className={inputClass} /></div>
                    <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-200">هذا الإجراء لا يعتمد الاسترداد ولا يحدّث الرصيد كعملية مكتملة؛ يرسله فقط إلى قائمة الاعتماد النهائي.</p>
                    <button type="submit" disabled={isPending} className="rounded-xl bg-[#c9a227] px-4 py-2.5 text-xs font-black text-black disabled:opacity-50">تسجيل وإرسال للاعتماد</button>
                  </form>
                </article>
              ))}
            </div>
          </QueueSection>
        ) : null}

        {enabled['booking.close'] ? (
          <QueueSection id="delegated-close" title="الإغلاق النهائي" description="لا يظهر إلا للحجوزات المسلّمة والمسدد رصيدها بالكامل." count={closeBookings.length}>
            <div className="grid gap-4 lg:grid-cols-2">
              {closeBookings.map((booking) => (
                <article key={booking.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4">
                  <h3 className="font-bold text-[#e5c45a]">{booking.bookingNumber} — {booking.service.nameAr}</h3>
                  <p className="mt-2 text-sm text-neutral-300">{booking.customer.user.fullName} · {booking.branch.nameAr}</p>
                  <form onSubmit={(event) => { event.preventDefault(); execute(event.currentTarget, advancePostServiceAction, 'تم إغلاق الحجز نهائيًا.'); }} className="mt-4 space-y-3 border-t border-neutral-800 pt-4">
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <input type="hidden" name="targetStatus" value="CLOSED" />
                    <div><label className={labelClass}>سبب الإغلاق</label><textarea name="reason" required minLength={3} maxLength={500} rows={3} defaultValue="تم تسليم الخدمة وتحصيل كامل الرصيد" className={inputClass} /></div>
                    <button type="submit" disabled={isPending} className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-black disabled:opacity-50">تأكيد الإغلاق النهائي</button>
                  </form>
                </article>
              ))}
            </div>
          </QueueSection>
        ) : null}
      </div>
    </main>
  );
}
