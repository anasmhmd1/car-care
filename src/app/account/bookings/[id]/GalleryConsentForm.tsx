'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LoaderCircle, ShieldCheck } from 'lucide-react';
import { setCustomerGalleryConsentAction } from '@/app/actions/gallery';

interface Props {
  bookingId: string;
  fileCount: number;
  hasConsent: boolean;
}

export default function GalleryConsentForm({ bookingId, fileCount, hasConsent }: Props) {
  const router = useRouter();
  const [explicitConsent, setExplicitConsent] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(decision: 'GRANT' | 'REVOKE') {
    if (decision === 'GRANT' && !explicitConsent) {
      setFeedback({ kind: 'error', message: 'حدد مربع الموافقة الصريحة أولًا.' });
      return;
    }
    const formData = new FormData();
    formData.set('bookingId', bookingId);
    formData.set('decision', decision);
    if (explicitConsent) formData.set('explicitConsent', 'true');
    setFeedback(null);
    startTransition(async () => {
      const result = await setCustomerGalleryConsentAction(formData);
      if (result.error) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      setExplicitConsent(false);
      setFeedback({ kind: 'success', message: result.message || 'تم حفظ اختيارك.' });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="gallery-consent-title" className="rounded-2xl border border-[#c9a227]/25 bg-[#c9a227]/[0.05] p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#e5c45a]" aria-hidden="true" />
        <div>
          <h3 id="gallery-consent-title" className="font-bold text-white">خصوصية صور قبل وبعد</h3>
          <p className="mt-2 text-xs leading-6 text-neutral-400">
            صور الحجز خاصة بك افتراضيًا. النشر في معرض بريق العام اختياري، ويتطلب موافقتك ثم اعتماد المالك. يمكنك سحب الموافقة في أي وقت دون التأثير على الخدمة.
          </p>
        </div>
      </div>

      {hasConsent ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold text-emerald-200">وافقت على مراجعة {fileCount} صورة للنشر العام.</p>
          <button type="button" disabled={pending} onClick={() => submit('REVOKE')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-500/35 px-4 text-xs font-bold text-red-200 hover:bg-red-500/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
            سحب الموافقة وإلغاء النشر
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-800 bg-black/25 p-4 text-xs leading-6 text-neutral-300">
            <input type="checkbox" checked={explicitConsent} onChange={(event) => { setExplicitConsent(event.target.checked); setFeedback(null); }} className="mt-1 size-4 accent-[#d4af37]" />
            <span>أوافق صراحة على أن يراجع مالك بريق صور قبل وبعد الخاصة بهذا الحجز، وأن ينشر الصور التي يعتمدها في المعرض العام دون بياناتي الشخصية.</span>
          </label>
          <button type="button" disabled={pending || !explicitConsent} onClick={() => submit('GRANT')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-5 text-xs font-black text-[#080808] disabled:cursor-not-allowed disabled:opacity-45">
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            تسجيل موافقة النشر
          </button>
        </div>
      )}

      {feedback ? <p role={feedback.kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`mt-3 rounded-xl border px-3 py-2 text-xs font-bold ${feedback.kind === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>{feedback.message}</p> : null}
    </section>
  );
}
