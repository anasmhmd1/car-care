'use client';

import { useRef, useState, useTransition, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Download, Eye, Trash2, X } from 'lucide-react';
import {
  activateSubscriptionAction,
  adjustSubscriptionVisitsAction,
  cancelSubscriptionAction,
  deleteSubscriptionPaymentProofReceiptAction,
  extendSubscriptionAction,
  freezeSubscriptionAction,
  reviewSubscriptionPaymentProofAction,
  unfreezeSubscriptionAction,
  type SubscriptionActionResult,
} from '@/app/actions/subscription';

export interface ManagedSubscription {
  id: string;
  customerName: string;
  customerPhone: string;
  planName: string;
  expectedPrice: number;
  branchName: string;
  status: 'PENDING_PAYMENT' | 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'CANCELLED' | 'COMPLETED';
  totalVisits: number;
  usedVisits: number;
  remainingVisits: number;
  endDate: string;
  freezeAllowed: boolean;
  maxFreezeDays: number;
  serviceBalances: Array<{
    serviceId: string;
    nameAr: string;
    totalVisits: number;
    remainingVisits: number;
  }>;
  paymentProof: {
    id: string;
    proofFileUrl: string;
    amountSubmitted: number;
    referenceNumber: string | null;
    status: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'AMOUNT_MISMATCH' | 'REUPLOAD_REQUIRED' | 'DUPLICATE_SUSPECTED';
    reviewNotes: string | null;
    createdAt: string;
    paymentMethod: { name: string };
  } | null;
}

type SubscriptionAction = (formData: FormData) => Promise<SubscriptionActionResult>;
type Feedback = { kind: 'success' | 'error'; text: string };
type PendingConfirmation = {
  subscriptionId: string;
  operation: string;
  action: SubscriptionAction;
  formData: FormData;
  message: string;
};

interface ReceiptModalData {
  url: string;
  subscriptionId: string;
  proofId: string;
  customerName: string;
  customerPhone: string;
  planName: string;
  amount: number;
  paymentMethodName: string;
  status: string;
  referenceNumber?: string | null;
}

const STATUS_LABELS: Record<ManagedSubscription['status'], string> = {
  PENDING_PAYMENT: 'بانتظار الدفع',
  ACTIVE: 'نشط',
  FROZEN: 'مجمد',
  EXPIRED: 'منتهي',
  CANCELLED: 'ملغي',
  COMPLETED: 'مكتمل',
};

const PROOF_STATUS_LABELS: Record<NonNullable<ManagedSubscription['paymentProof']>['status'], string> = {
  UNDER_REVIEW: 'قيد المراجعة',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  AMOUNT_MISMATCH: 'المبلغ غير مطابق',
  REUPLOAD_REQUIRED: 'مطلوب إعادة الرفع',
  DUPLICATE_SUSPECTED: 'اشتباه تكرار',
};

export default function SubscriptionManagementPanel({
  subscriptions,
  readOnly = false,
}: {
  subscriptions: ManagedSubscription[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const commandKeys = useRef(new Map<string, string>());
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [receiptModal, setReceiptModal] = useState<ReceiptModalData | null>(null);
  const [deletingProofId, setDeletingProofId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function executeCommand(command: Omit<PendingConfirmation, 'message'>): void {
    const { subscriptionId, operation, action, formData } = command;
    const commandId = `${subscriptionId}:${operation}`;
    const idempotencyKey = commandKeys.current.get(commandId) ?? window.crypto.randomUUID();
    commandKeys.current.set(commandId, idempotencyKey);
    formData.set('idempotencyKey', idempotencyKey);
    setFeedback((current) => {
      const next = { ...current };
      delete next[subscriptionId];
      return next;
    });

    startTransition(async () => {
      const result = await action(formData);
      if (result.error) {
        setFeedback((current) => ({
          ...current,
          [subscriptionId]: { kind: 'error', text: result.error as string },
        }));
        return;
      }
      commandKeys.current.delete(commandId);
      setFeedback((current) => ({
        ...current,
        [subscriptionId]: { kind: 'success', text: 'تم حفظ العملية وتوثيقها.' },
      }));
      router.refresh();
    });
  }

  function runCommand(
    event: MouseEvent<HTMLButtonElement>,
    operation: string,
    action: SubscriptionAction,
    confirmation?: string,
  ): void {
    const form = event.currentTarget.form;
    if (!form) return;
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    const subscriptionId = String(formData.get('subscriptionId') ?? '');
    const command = { subscriptionId, operation, action, formData };
    if (confirmation) {
      setConfirmation({ ...command, message: confirmation });
      return;
    }
    executeCommand(command);
  }

  function runProofReview(
    event: MouseEvent<HTMLButtonElement>,
    decision: 'APPROVE' | 'REJECT' | 'REUPLOAD' | 'DUPLICATE',
  ): void {
    const form = event.currentTarget.form;
    const decisionInput = form?.elements.namedItem('decision');
    if (decisionInput instanceof HTMLInputElement) decisionInput.value = decision;
    runCommand(event, `PROOF_${decision}`, reviewSubscriptionPaymentProofAction);
  }

  async function handleDownloadReceipt(url: string, filename: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  }

  async function handleDeleteReceipt(subscriptionId: string, proofId: string) {
    if (!window.confirm('هل أنت متأكد من حذف هذا الإيصال نهائياً من النظام؟')) return;
    setDeletingProofId(proofId);
    try {
      const fd = new FormData();
      fd.append('proofId', proofId);
      fd.append('subscriptionId', subscriptionId);
      const res = await deleteSubscriptionPaymentProofReceiptAction(fd);
      if (res.error) {
        alert(res.error);
      } else {
        if (receiptModal?.proofId === proofId) {
          setReceiptModal(null);
        }
        router.refresh();
      }
    } catch {
      alert('تعذر حذف الإيصال.');
    } finally {
      setDeletingProofId(null);
    }
  }

  if (subscriptions.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-10 text-center">
        <h2 className="text-xl font-bold text-white">لا توجد اشتراكات لإدارتها</h2>
        <p className="mt-2 text-sm text-white/45">ستظهر طلبات العملاء الجديدة هنا فور إرسالها.</p>
      </div>
    );
  }

  if (readOnly) {
    return (
      <>
        <div className="grid gap-4">
          {subscriptions.map((subscription) => (
            <article key={subscription.id} className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 sm:p-6 shadow-md transition-all hover:border-neutral-700">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-neutral-800/60 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 px-3 py-1 text-[10px] font-bold text-[#e4c762]">
                      {STATUS_LABELS[subscription.status]}
                    </span>
                    <span className="font-mono text-[11px] text-neutral-400">#{subscription.id.slice(0, 8).toUpperCase()}</span>
                  </div>
                  <h3 className="mt-2 text-lg sm:text-xl font-black text-white">{subscription.customerName}</h3>
                  <a href={`tel:${subscription.customerPhone}`} className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-[#d4af37] hover:text-[#f3e4a8] transition-colors">
                    <span>اتصال بالعميل</span>
                    <span dir="ltr" className="text-neutral-400 font-mono">({subscription.customerPhone})</span>
                  </a>
                </div>

                {subscription.paymentProof && subscription.paymentProof.proofFileUrl ? (
                  <div className="flex flex-col items-start sm:items-end gap-2.5 bg-neutral-900/80 border border-neutral-800 p-3.5 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-neutral-300">إثبات الدفع ({subscription.paymentProof.paymentMethod.name})</span>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                        subscription.paymentProof.status === 'APPROVED'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                          : subscription.paymentProof.status === 'UNDER_REVIEW'
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                            : 'border-red-500/30 bg-red-500/10 text-red-200'
                      }`}>
                        {PROOF_STATUS_LABELS[subscription.paymentProof.status]}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-neutral-300 font-bold tabular-nums">
                        {subscription.paymentProof.amountSubmitted.toLocaleString('ar-EG')} ج.م
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setReceiptModal({
                            url: subscription.paymentProof!.proofFileUrl,
                            subscriptionId: subscription.id,
                            proofId: subscription.paymentProof!.id,
                            customerName: subscription.customerName,
                            customerPhone: subscription.customerPhone,
                            planName: subscription.planName,
                            amount: subscription.paymentProof!.amountSubmitted,
                            paymentMethodName: subscription.paymentProof!.paymentMethod.name,
                            status: subscription.paymentProof!.status,
                            referenceNumber: subscription.paymentProof!.referenceNumber,
                          });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-1.5 text-xs font-bold text-[#edce8b] hover:bg-[#d4af37]/20 transition-all"
                      >
                        <Eye className="size-3.5 text-[#d4af37]" />
                        <span>معاينة الوصل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadReceipt(subscription.paymentProof!.proofFileUrl, `subscription-proof-${subscription.id.slice(0, 8)}.jpg`)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition-all"
                        title="تحميل الوصل على الهاتف"
                      >
                        <Download className="size-3.5 text-emerald-400" />
                        <span>تحميل</span>
                      </button>

                      <button
                        type="button"
                        disabled={deletingProofId === subscription.paymentProof.id}
                        onClick={() => handleDeleteReceipt(subscription.id, subscription.paymentProof!.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 transition-all disabled:opacity-50"
                        title="حذف الوصل"
                      >
                        <Trash2 className="size-3.5 text-red-400" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:text-sm sm:grid-cols-4 rounded-xl bg-neutral-950/40 border border-neutral-800/60 p-3.5">
                <div><dt className="text-neutral-500 text-[11px] font-medium">الباقة</dt><dd className="mt-1 font-bold text-neutral-200">{subscription.planName} ({subscription.expectedPrice.toLocaleString('ar-EG')} ج.م)</dd></div>
                <div><dt className="text-neutral-500 text-[11px] font-medium">الفرع</dt><dd className="mt-1 font-bold text-neutral-200">{subscription.branchName}</dd></div>
                <div><dt className="text-neutral-500 text-[11px] font-medium">الرصيد</dt><dd className="mt-1 font-black tabular-nums text-[#e4c762]">{subscription.remainingVisits} / {subscription.totalVisits} زيارة</dd></div>
                <div><dt className="text-neutral-500 text-[11px] font-medium">تاريخ الانتهاء</dt><dd className="mt-1 font-bold text-neutral-200">{new Date(subscription.endDate).toLocaleDateString('ar-EG')}</dd></div>
              </dl>

              {subscription.serviceBalances.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 pt-2">
                  <span className="text-[11px] font-medium text-neutral-400">تفاصيل الخدمات:</span>
                  {subscription.serviceBalances.map((sb) => (
                    <span key={sb.serviceId} className="rounded-lg border border-neutral-800 bg-neutral-900/80 px-2.5 py-1 text-xs text-neutral-300">
                      {sb.nameAr}: <strong className="text-[#f3e4a8]">{sb.remainingVisits}</strong>/{sb.totalVisits}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>

        {receiptModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="relative flex flex-col max-h-[92vh] w-full max-w-2xl rounded-3xl border border-neutral-800 bg-[#121214] p-6 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <div>
                  <h3 className="text-lg font-black text-white">إيصال تحويل الاشتراك</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    العميل: <strong className="text-white">{receiptModal.customerName}</strong> ({receiptModal.customerPhone}) · {receiptModal.planName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReceiptModal(null)}
                  aria-label="إغلاق معاينة إيصال التحويل"
                  className="rounded-full p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="my-4 flex flex-col items-center justify-center overflow-auto rounded-2xl bg-black/60 border border-neutral-800/80 p-2 min-h-[300px]">
                <Image
                  src={receiptModal.url}
                  alt="إيصال التحويل"
                  width={1200}
                  height={900}
                  unoptimized
                  className="max-h-[55vh] w-auto max-w-full object-contain rounded-xl shadow-lg"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-4 text-xs">
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-1.5 font-bold text-neutral-200">
                    المبلغ: <strong className="text-[#edce8b]">{receiptModal.amount.toLocaleString('ar-EG')} ج.م</strong>
                  </span>
                  <span className="text-neutral-400">وسيلة التحويل: <strong className="text-white">{receiptModal.paymentMethodName}</strong></span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadReceipt(receiptModal.url, `subscription-proof-${receiptModal.subscriptionId.slice(0, 8)}.jpg`)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 font-bold text-emerald-300 hover:bg-emerald-500/20 transition-all shadow-sm"
                  >
                    <Download className="size-4 text-emerald-400" />
                    <span>تحميل على الهاتف</span>
                  </button>
                  <button
                    type="button"
                    disabled={deletingProofId === receiptModal.proofId}
                    onClick={() => handleDeleteReceipt(receiptModal.subscriptionId, receiptModal.proofId)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 font-bold text-red-300 hover:bg-red-500/20 transition-all disabled:opacity-50"
                  >
                    <Trash2 className="size-4 text-red-400" />
                    <span>حذف الإيصال</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
    <div className="grid gap-5">
      {subscriptions.map((subscription) => {
        const entryFeedback = feedback[subscription.id];
        const managementDisabled = subscription.status === 'PENDING_PAYMENT' || subscription.status === 'CANCELLED';
        return (
          <article key={subscription.id} className="rounded-3xl border border-white/10 bg-white/[0.025] p-5 sm:p-6 shadow-xl">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(440px,0.95fr)]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 px-3 py-1 text-[10px] font-bold text-[#e4c762]">
                    {STATUS_LABELS[subscription.status]}
                  </span>
                  <span className="text-[10px] text-white/30">#{subscription.id.slice(0, 8).toUpperCase()}</span>
                </div>
                <h2 className="mt-3 text-xl font-black text-white">{subscription.customerName}</h2>
                <p dir="ltr" className="mt-1 w-fit text-xs text-white/45">{subscription.customerPhone}</p>
                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-white/45">الباقة</dt>
                    <dd className="mt-1 font-bold text-white">{subscription.planName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-white/45">الفرع</dt>
                    <dd className="mt-1 font-bold text-white">{subscription.branchName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-white/45">الرصيد</dt>
                    <dd className="mt-1 font-bold text-[#e4c762]">
                      {subscription.remainingVisits} / {subscription.totalVisits} زيارة
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-white/45">تاريخ الانتهاء</dt>
                    <dd className="mt-1 font-bold text-white">{new Date(subscription.endDate).toLocaleDateString('ar-EG')}</dd>
                  </div>
                </dl>

                {subscription.serviceBalances.length > 0 ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-xs font-bold text-white/60">تفاصيل رصيد الخدمات الموزعة</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {subscription.serviceBalances.map((item) => (
                        <div key={item.serviceId} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 text-xs">
                          <span className="text-white">{item.nameAr}</span>
                          <span className="font-bold text-[#e4c762]">
                            {item.remainingVisits} / {item.totalVisits}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <form className="rounded-2xl border border-white/10 bg-black/40 p-4 sm:p-5">
                <input type="hidden" name="subscriptionId" value={subscription.id} />
                <input type="hidden" name="decision" value="APPROVE" />
                {subscription.paymentProof ? (
                  <input type="hidden" name="proofId" value={subscription.paymentProof.id} />
                ) : null}

                <label className="block text-xs font-bold text-white/70">
                  سبب أو ملاحظات العملية الإدارية
                  <input
                    type="text"
                    name="reason"
                    required
                    defaultValue={subscription.paymentProof?.reviewNotes ?? 'تحديث إداري للاشتراك'}
                    placeholder="اكتب سبب العملية بوضوح..."
                    className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080808] px-3 text-xs text-white outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                  />
                </label>

                {subscription.paymentProof && subscription.paymentProof.proofFileUrl ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-white">إثبات الدفع · {subscription.paymentProof.paymentMethod.name}</p>
                        <p className="mt-1 text-[11px] text-white/45">
                          المرسل {subscription.paymentProof.amountSubmitted.toLocaleString('ar-EG')} ج.م · المطلوب {subscription.expectedPrice.toLocaleString('ar-EG')} ج.م
                          {subscription.paymentProof.referenceNumber ? ` · مرجع ${subscription.paymentProof.referenceNumber}` : ''}
                        </p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${subscription.paymentProof.status === 'APPROVED' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : subscription.paymentProof.status === 'UNDER_REVIEW' ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-red-500/30 bg-red-500/10 text-red-200'}`}>
                        {PROOF_STATUS_LABELS[subscription.paymentProof.status]}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReceiptModal({
                            url: subscription.paymentProof!.proofFileUrl,
                            subscriptionId: subscription.id,
                            proofId: subscription.paymentProof!.id,
                            customerName: subscription.customerName,
                            customerPhone: subscription.customerPhone,
                            planName: subscription.planName,
                            amount: subscription.paymentProof!.amountSubmitted,
                            paymentMethodName: subscription.paymentProof!.paymentMethod.name,
                            status: subscription.paymentProof!.status,
                            referenceNumber: subscription.paymentProof!.referenceNumber,
                          });
                        }}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#d4af37]/30 bg-[#d4af37]/10 px-3 text-[11px] font-bold text-[#e4c762] hover:bg-[#d4af37]/15"
                      >
                        <Eye className="size-3.5" />
                        <span>معاينة الإيصال</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadReceipt(subscription.paymentProof!.proofFileUrl, `subscription-proof-${subscription.id.slice(0, 8)}.jpg`)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/15"
                      >
                        <Download className="size-3.5" />
                        <span>تحميل على الهاتف</span>
                      </button>

                      <button
                        type="button"
                        disabled={deletingProofId === subscription.paymentProof.id}
                        onClick={() => handleDeleteReceipt(subscription.id, subscription.paymentProof!.id)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-[11px] font-bold text-red-300 hover:bg-red-500/15 disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" />
                        <span>حذف الإيصال</span>
                      </button>
                    </div>

                    <div className="mt-2.5 max-h-48 overflow-hidden rounded-xl border border-white/10 bg-black/40 flex items-center justify-center p-1 cursor-pointer"
                      onClick={() => {
                        setReceiptModal({
                          url: subscription.paymentProof!.proofFileUrl,
                          subscriptionId: subscription.id,
                          proofId: subscription.paymentProof!.id,
                          customerName: subscription.customerName,
                          customerPhone: subscription.customerPhone,
                          planName: subscription.planName,
                          amount: subscription.paymentProof!.amountSubmitted,
                          paymentMethodName: subscription.paymentProof!.paymentMethod.name,
                          status: subscription.paymentProof!.status,
                          referenceNumber: subscription.paymentProof!.referenceNumber,
                        });
                      }}
                    >
                      <Image
                        src={subscription.paymentProof.proofFileUrl}
                        alt="إيصال الاشتراك"
                        width={800}
                        height={600}
                        unoptimized
                        className="max-h-44 w-auto object-contain rounded hover:scale-105 transition-transform"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                    </div>
                    {subscription.paymentProof.reviewNotes ? <p className="mt-3 text-[11px] leading-5 text-white/45">آخر ملاحظة: {subscription.paymentProof.reviewNotes}</p> : null}
                    {subscription.paymentProof.status === 'UNDER_REVIEW' ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button type="button" disabled={isPending} onClick={(event) => runProofReview(event, 'APPROVE')} className="min-h-10 rounded-xl bg-emerald-500 px-3 text-[11px] font-black text-emerald-950 disabled:opacity-50">اعتماد المبلغ المطابق</button>
                        <button type="button" disabled={isPending} onClick={(event) => runProofReview(event, 'REUPLOAD')} className="min-h-10 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-[11px] font-bold text-amber-200 disabled:opacity-50">طلب إعادة الرفع</button>
                        <button type="button" disabled={isPending} onClick={(event) => runProofReview(event, 'REJECT')} className="min-h-10 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-[11px] font-bold text-red-200 disabled:opacity-50">رفض الإثبات</button>
                        <button type="button" disabled={isPending} onClick={(event) => runProofReview(event, 'DUPLICATE')} className="min-h-10 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 text-[11px] font-bold text-purple-200 disabled:opacity-50">اشتباه تكرار</button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {subscription.status === 'PENDING_PAYMENT' ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={(event) => runCommand(event, 'ACTIVATE', activateSubscriptionAction)}
                      className="min-h-11 rounded-xl bg-[#d4af37] px-3 text-xs font-black text-black disabled:opacity-50 sm:col-span-2"
                    >
                      تفعيل يدوي استثنائي
                    </button>
                  ) : null}

                  {subscription.status === 'ACTIVE' && subscription.freezeAllowed ? (
                    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:col-span-2">
                      <label className="block text-[11px] font-bold text-white/70">
                        مدة التجميد بالأيام (الحد الأقصى المتبقي {subscription.maxFreezeDays} يوم)
                        <input
                          type="number"
                          name="freezeDays"
                          min={1}
                          max={subscription.maxFreezeDays}
                          defaultValue={Math.min(7, subscription.maxFreezeDays)}
                          className="mt-1 min-h-10 w-full rounded-xl border border-white/10 bg-[#080808] px-3 text-xs text-white"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={isPending || subscription.maxFreezeDays <= 0}
                        onClick={(event) => runCommand(event, 'FREEZE', freezeSubscriptionAction)}
                        className="min-h-10 w-full rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 text-xs font-bold text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
                      >
                        تجميد الاشتراك
                      </button>
                    </div>
                  ) : null}

                  {subscription.status === 'FROZEN' ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={(event) => runCommand(event, 'UNFREEZE', unfreezeSubscriptionAction)}
                      className="min-h-11 rounded-xl bg-sky-500 px-3 text-xs font-black text-black disabled:opacity-50 sm:col-span-2"
                    >
                      إلغاء التجميد فورًا
                    </button>
                  ) : null}

                  {!managementDisabled ? (
                    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:col-span-2">
                      <label className="block text-[11px] font-bold text-white/70">
                        تمديد الصلاحية بالأيام
                        <input
                          type="number"
                          name="extensionDays"
                          min={1}
                          max={365}
                          defaultValue={30}
                          className="mt-1 min-h-10 w-full rounded-xl border border-white/10 bg-[#080808] px-3 text-xs text-white"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={(event) => runCommand(event, 'EXTEND', extendSubscriptionAction)}
                        className="min-h-10 w-full rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/10 px-3 text-xs font-bold text-[#e4c762] hover:bg-[#d4af37]/20 disabled:opacity-50"
                      >
                        تمديد تاريخ الانتهاء
                      </button>
                    </div>
                  ) : null}

                  {!managementDisabled ? (
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      {subscription.serviceBalances.length > 0 ? (
                        <select
                          name="serviceId"
                          aria-label="الخدمة المستهدفة للتعديل"
                          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#080808] px-3 text-xs text-white"
                        >
                          {subscription.serviceBalances.map((sb) => (
                            <option key={sb.serviceId} value={sb.serviceId}>
                              {sb.nameAr} (متبقي {sb.remainingVisits})
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <select name="adjustment" aria-label="نوع تعديل الزيارات" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#080808] px-3 text-xs text-white">
                        <option value="ADD">إضافة (+)</option>
                        <option value="DEDUCT">خصم (-)</option>
                        <option value="RESTORE">استعادة (↩)</option>
                      </select>
                      <input type="number" name="amount" min="1" max="1000" defaultValue="1" className="w-16 rounded-xl border border-white/10 bg-[#080808] px-3 text-xs text-white" />
                      <button type="button" disabled={isPending} onClick={(event) => runCommand(event, 'ADJUST', adjustSubscriptionVisitsAction)} className="min-h-11 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 px-4 text-xs font-black text-[#e4c762] disabled:opacity-50">تعديل</button>
                    </div>
                  ) : null}

                  {subscription.status !== 'CANCELLED' ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={(event) => runCommand(event, 'CANCEL', cancelSubscriptionAction, 'إلغاء الاشتراك نهائيًا؟ سيتم فقدان كافة الزيارات المتبقية.')}
                      className="min-h-11 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-xs font-bold text-red-200 disabled:opacity-50 sm:col-span-2"
                    >
                      إلغاء الاشتراك
                    </button>
                  ) : null}
                </div>

                {entryFeedback ? (
                  <p role="status" className={`mt-3 rounded-xl border px-3 py-2 text-xs font-bold ${entryFeedback.kind === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
                    {entryFeedback.text}
                  </p>
                ) : null}
              </form>
            </div>
          </article>
        );
      })}
    </div>

    {receiptModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
        <div className="relative flex flex-col max-h-[92vh] w-full max-w-2xl rounded-3xl border border-neutral-800 bg-[#121214] p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
            <div>
              <h3 className="text-lg font-black text-white">إيصال تحويل الاشتراك</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                العميل: <strong className="text-white">{receiptModal.customerName}</strong> ({receiptModal.customerPhone}) · {receiptModal.planName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReceiptModal(null)}
              aria-label="إغلاق معاينة إيصال التحويل"
              className="rounded-full p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="my-4 flex flex-col items-center justify-center overflow-auto rounded-2xl bg-black/60 border border-neutral-800/80 p-2 min-h-[300px]">
            <Image
              src={receiptModal.url}
              alt="إيصال التحويل"
              width={1200}
              height={900}
              unoptimized
              className="max-h-[55vh] w-auto max-w-full object-contain rounded-xl shadow-lg"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-4 text-xs">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-1.5 font-bold text-neutral-200">
                المبلغ: <strong className="text-[#edce8b]">{receiptModal.amount.toLocaleString('ar-EG')} ج.م</strong>
              </span>
              <span className="text-neutral-400">وسيلة التحويل: <strong className="text-white">{receiptModal.paymentMethodName}</strong></span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownloadReceipt(receiptModal.url, `subscription-proof-${receiptModal.subscriptionId.slice(0, 8)}.jpg`)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 font-bold text-emerald-300 hover:bg-emerald-500/20 transition-all shadow-sm"
              >
                <Download className="size-4 text-emerald-400" />
                <span>تحميل على الهاتف</span>
              </button>
              <button
                type="button"
                disabled={deletingProofId === receiptModal.proofId}
                onClick={() => handleDeleteReceipt(receiptModal.subscriptionId, receiptModal.proofId)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 font-bold text-red-300 hover:bg-red-500/20 transition-all disabled:opacity-50"
              >
                <Trash2 className="size-4 text-red-400" />
                <span>حذف الإيصال</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {confirmation ? (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="subscription-confirmation-title" className="w-full max-w-md rounded-3xl border border-red-500/30 bg-[#111] p-6 shadow-2xl">
          <p className="text-xs font-bold text-red-300">إجراء حساس</p>
          <h2 id="subscription-confirmation-title" className="mt-2 text-xl font-black text-white">تأكيد إلغاء الاشتراك</h2>
          <p className="mt-4 text-sm leading-7 text-white/60">{confirmation.message}</p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" disabled={isPending} onClick={() => setConfirmation(null)} className="min-h-11 rounded-xl border border-white/15 px-5 text-xs font-bold text-white/70">تراجع</button>
            <button type="button" disabled={isPending} onClick={() => { const command = confirmation; setConfirmation(null); executeCommand(command); }} className="min-h-11 rounded-xl bg-red-500 px-5 text-xs font-black text-white disabled:opacity-50">تأكيد الإلغاء النهائي</button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
