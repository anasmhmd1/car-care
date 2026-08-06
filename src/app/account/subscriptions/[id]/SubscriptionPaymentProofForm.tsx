'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { FileUp, LoaderCircle, ShieldCheck } from 'lucide-react';
import { prepareImageForUpload } from '@/lib/client/image-upload';

export interface SubscriptionPaymentMethodOption {
  id: string;
  name: string;
  accountNumber: string;
  accountName: string;
  instructions: string | null;
}

export default function SubscriptionPaymentProofForm({
  subscriptionId,
  expectedAmount,
  methods,
}: {
  subscriptionId: string;
  expectedAmount: number;
  methods: SubscriptionPaymentMethodOption[];
}) {
  const router = useRouter();
  const [methodId, setMethodId] = useState(methods[0]?.id ?? '');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const selectedMethod = useMemo(
    () => methods.find((method) => method.id === methodId) ?? methods[0],
    [methodId, methods],
  );

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (uploading) return;
    setFeedback(null);
    const form = event.currentTarget;
    const raw = new FormData(form);
    const file = raw.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setFeedback({ kind: 'error', text: 'اختر صورة أو ملف PDF للإثبات.' });
      return;
    }

    setUploading(true);
    try {
      const preparedFile = await prepareImageForUpload(file);
      raw.set('file', preparedFile);
      const localTimestamp = String(raw.get('transferTimestamp') ?? '');
      if (localTimestamp) raw.set('transferTimestamp', new Date(localTimestamp).toISOString());
      const response = await fetch('/api/subscription-payment-proofs', {
        method: 'POST',
        body: raw,
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'تعذر رفع إثبات الدفع.');
      form.reset();
      setMethodId(methods[0]?.id ?? '');
      setFeedback({ kind: 'success', text: 'تم رفع الإثبات وحفظه للمراجعة اليدوية.' });
      router.refresh();
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'تعذر رفع إثبات الدفع.',
      });
    } finally {
      setUploading(false);
    }
  }

  if (methods.length === 0) {
    return (
      <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
        لا توجد وسيلة دفع نشطة للفرع حاليًا. تواصل مع خدمة العملاء قبل التحويل.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <input type="hidden" name="subscriptionId" value={subscriptionId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-xs font-bold text-neutral-300">
          <span>وسيلة الدفع</span>
          <select
            name="paymentMethodId"
            value={methodId}
            onChange={(event) => setMethodId(event.target.value)}
            required
            className="min-h-12 w-full rounded-xl border border-neutral-700 bg-[#080808] px-3 text-white outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20"
          >
            {methods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
          </select>
        </label>
        <label className="space-y-2 text-xs font-bold text-neutral-300">
          <span>المبلغ المحول (ج.م)</span>
          <input
            type="number"
            name="amountSubmitted"
            min="1"
            max="10000000"
            defaultValue={expectedAmount}
            required
            className="min-h-12 w-full rounded-xl border border-neutral-700 bg-[#080808] px-3 text-white outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20"
          />
        </label>
      </div>

      {selectedMethod ? (
        <div className="rounded-xl border border-[#c9a227]/25 bg-[#c9a227]/10 p-4 text-xs leading-6 text-neutral-300">
          <p><span className="text-neutral-500">الحساب:</span> <b dir="ltr">{selectedMethod.accountNumber}</b></p>
          <p><span className="text-neutral-500">باسم:</span> {selectedMethod.accountName}</p>
          {selectedMethod.instructions ? <p className="mt-1 text-neutral-400">{selectedMethod.instructions}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-xs font-bold text-neutral-300">
          <span>رقم المرجع (إن وجد)</span>
          <input name="referenceNumber" maxLength={120} className="min-h-12 w-full rounded-xl border border-neutral-700 bg-[#080808] px-3 text-white outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20" />
        </label>
        <label className="space-y-2 text-xs font-bold text-neutral-300">
          <span>وقت التحويل (إن وجد)</span>
          <input type="datetime-local" name="transferTimestamp" className="min-h-12 w-full rounded-xl border border-neutral-700 bg-[#080808] px-3 text-white outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20" />
        </label>
      </div>

      <label className="block space-y-2 text-xs font-bold text-neutral-300">
        <span>صورة أو PDF (حتى 10MB)</span>
        <input
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          required
          className="block min-h-12 w-full rounded-xl border border-dashed border-neutral-700 bg-[#080808] px-3 py-3 text-xs text-neutral-400 file:ml-3 file:rounded-lg file:border-0 file:bg-[#c9a227] file:px-3 file:py-2 file:font-bold file:text-black"
        />
      </label>

      {feedback ? (
        <p role="status" className={`rounded-xl border px-4 py-3 text-xs font-bold ${feedback.kind === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
          {feedback.text}
        </p>
      ) : null}

      <button type="submit" disabled={uploading} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#c9a227] px-5 text-sm font-black text-black transition hover:bg-[#dfbd45] disabled:cursor-not-allowed disabled:opacity-50">
        {uploading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <FileUp className="size-4" aria-hidden="true" />}
        {uploading ? 'جارٍ تأمين الملف ورفعه…' : 'إرسال الإثبات للمراجعة'}
      </button>
      <p className="flex items-center gap-2 text-[11px] text-neutral-500">
        <ShieldCheck className="size-4 text-[#c9a227]" aria-hidden="true" />
        الملف خاص ولا يظهر إلا لك ولمدير الفرع المخول بالمراجعة.
      </p>
    </form>
  );
}
