'use client';

import { useRef, useState, useTransition, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  activateSubscriptionAction,
  adjustSubscriptionVisitsAction,
  cancelSubscriptionAction,
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
}: {
  subscriptions: ManagedSubscription[];
}) {
  const router = useRouter();
  const commandKeys = useRef(new Map<string, string>());
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
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

  if (subscriptions.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-10 text-center">
        <h2 className="text-xl font-bold text-white">لا توجد اشتراكات لإدارتها</h2>
        <p className="mt-2 text-sm text-white/45">ستظهر طلبات العملاء الجديدة هنا فور إرسالها.</p>
      </div>
    );
  }

  return (
    <>
    <div className="grid gap-5">
      {subscriptions.map((subscription) => {
        const entryFeedback = feedback[subscription.id];
        const managementDisabled = subscription.status === 'PENDING_PAYMENT' || subscription.status === 'CANCELLED';
        return (
          <article key={subscription.id} className="rounded-3xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
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
                  <div><dt className="text-white/35">الباقة</dt><dd className="mt-1 font-bold text-white/80">{subscription.planName}</dd></div>
                  <div><dt className="text-white/35">الفرع</dt><dd className="mt-1 font-bold text-white/80">{subscription.branchName}</dd></div>
                  <div><dt className="text-white/35">الرصيد</dt><dd className="mt-1 font-bold tabular-nums text-[#e4c762]">{subscription.remainingVisits} / {subscription.totalVisits}</dd></div>
                  <div><dt className="text-white/35">الانتهاء</dt><dd className="mt-1 font-bold text-white/80">{new Date(subscription.endDate).toLocaleDateString('ar-EG')}</dd></div>
                </dl>
              </div>

              <form className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <input type="hidden" name="subscriptionId" value={subscription.id} />
                <input type="hidden" name="proofId" value={subscription.paymentProof?.id ?? ''} />
                <input type="hidden" name="decision" value="" />
                <label className="block text-xs font-bold text-white/70">
                  سبب العملية
                  <input
                    name="reason"
                    required
                    minLength={3}
                    maxLength={1000}
                    placeholder="مثال: تم التحقق من التحويل يدويًا"
                    className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080808] px-3 text-xs text-white outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20"
                  />
                </label>

                {subscription.paymentProof ? (
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
                    <a href={subscription.paymentProof.proofFileUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-[#d4af37]/30 bg-[#d4af37]/10 px-3 text-[11px] font-bold text-[#e4c762] hover:bg-[#d4af37]/15">
                      فتح الملف الخاص
                    </a>
                    {subscription.paymentProof.reviewNotes ? <p className="mt-3 text-[11px] leading-5 text-white/45">آخر ملاحظة: {subscription.paymentProof.reviewNotes}</p> : null}
                    {subscription.paymentProof.status === 'UNDER_REVIEW' ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button type="button" disabled={isPending} onClick={(event) => runProofReview(event, 'APPROVE')} className="min-h-10 rounded-xl bg-emerald-500 px-3 text-[11px] font-black text-emerald-950 disabled:opacity-50">اعتماد المبلغ المطابق</button>
                        <button type="button" disabled={isPending} onClick={(event) => runProofReview(event, 'REUPLOAD')} className="min-h-10 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-[11px] font-bold text-amber-200 disabled:opacity-50">طلب إعادة الرفع</button>
                        <button type="button" disabled={isPending} onClick={(event) => runProofReview(event, 'REJECT')} className="min-h-10 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-[11px] font-bold text-red-200 disabled:opacity-50">رفض الإثبات</button>
                        <button type="button" disabled={isPending} onClick={(event) => runProofReview(event, 'DUPLICATE')} className="min-h-10 rounded-xl border border-white/15 bg-white/5 px-3 text-[11px] font-bold text-white/70 disabled:opacity-50">اشتباه تكرار</button>
                      </div>
                    ) : null}
                  </div>
                ) : subscription.status === 'PENDING_PAYMENT' ? (
                  <p className="mt-4 rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 px-3 py-3 text-xs text-amber-200">لم يرفع العميل إثبات دفع بعد.</p>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {subscription.status === 'PENDING_PAYMENT' && subscription.paymentProof?.status === 'APPROVED' && subscription.paymentProof.amountSubmitted === subscription.expectedPrice ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={(event) => runCommand(event, 'ACTIVATE', activateSubscriptionAction)}
                      className="min-h-11 rounded-xl bg-emerald-500 px-3 text-xs font-black text-emerald-950 disabled:opacity-50"
                    >
                      تفعيل بعد مراجعة الدفع
                    </button>
                  ) : null}

                  {subscription.status === 'ACTIVE' && subscription.freezeAllowed ? (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        name="freezeDays"
                        min="1"
                        max={subscription.maxFreezeDays}
                        defaultValue={Math.min(7, subscription.maxFreezeDays)}
                        aria-label="أيام التجميد"
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#080808] px-3 text-xs text-white"
                      />
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={(event) => runCommand(event, 'FREEZE', freezeSubscriptionAction)}
                        className="min-h-11 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 text-xs font-bold text-sky-200 disabled:opacity-50"
                      >
                        تجميد
                      </button>
                    </div>
                  ) : null}

                  {subscription.status === 'FROZEN' ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={(event) => runCommand(event, 'UNFREEZE', unfreezeSubscriptionAction)}
                      className="min-h-11 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 text-xs font-bold text-sky-200 disabled:opacity-50"
                    >
                      إلغاء التجميد
                    </button>
                  ) : null}

                  {!managementDisabled ? (
                    <div className="flex gap-2">
                      <input type="number" name="extensionDays" min="1" max="3650" defaultValue="30" aria-label="أيام التمديد" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#080808] px-3 text-xs text-white" />
                      <button type="button" disabled={isPending} onClick={(event) => runCommand(event, 'EXTEND', extendSubscriptionAction)} className="min-h-11 rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/10 px-3 text-xs font-bold text-[#e4c762] disabled:opacity-50">تمديد</button>
                    </div>
                  ) : null}

                  {!managementDisabled ? (
                    <div className="flex gap-2 sm:col-span-2">
                      {subscription.serviceBalances.length > 0 ? (
                        <select name="serviceId" required defaultValue="" aria-label="الخدمة المطلوب تعديل رصيدها" className="min-w-0 flex-1 rounded-xl border border-[#d4af37]/30 bg-[#080808] px-3 text-xs text-[#efe2a7]">
                          <option value="" className="bg-[#111]">اختر الخدمة</option>
                          {subscription.serviceBalances.map((balance) => (
                            <option key={balance.serviceId} value={balance.serviceId} className="bg-[#111]">
                              {balance.nameAr} ({balance.remainingVisits}/{balance.totalVisits})
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <select name="adjustment" aria-label="نوع تعديل الزيارات" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#080808] px-3 text-xs text-white">
                        <option value="ADD">إضافة زيارة هدية / تعويضية (+)</option>
                        <option value="DEDUCT">تنفيذ / خصم زيارة من الباقة (-)</option>
                        <option value="RESTORE">إلغاء إتمام زيارة واستعادة الرصيد (↩)</option>
                      </select>
                      <input type="number" name="amount" min="1" max="10000" defaultValue="1" aria-label="عدد الزيارات" className="w-20 rounded-xl border border-white/10 bg-[#080808] px-3 text-xs text-white" />
                      <button type="button" disabled={isPending} onClick={(event) => runCommand(event, 'ADJUST', adjustSubscriptionVisitsAction)} className="min-h-11 rounded-xl border border-[#cea355]/40 bg-[#cea355]/15 px-4 text-xs font-bold text-[#edce8b] hover:bg-[#cea355]/25 disabled:opacity-50">تطبيق التعديل</button>
                    </div>
                  ) : null}

                  {subscription.status !== 'CANCELLED' ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={(event) => runCommand(event, 'CANCEL', cancelSubscriptionAction, 'إلغاء الاشتراك نهائيًا؟ لا يمكن تنفيذ العملية مع وجود حجوزات مفتوحة.')}
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
