'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { submitCustomerRatingAction } from '@/app/actions/customer-experience';

export default function CustomerRatingForm({
  bookingId,
  rating,
}: {
  bookingId: string;
  rating: { score: number; comment: string | null; approvedForPublic: boolean } | null;
}) {
  const router = useRouter();
  const [score, setScore] = useState(rating?.score ?? 5);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFeedback(null);
    startTransition(async () => {
      const data = new FormData(form);
      data.set('bookingId', bookingId);
      data.set('score', String(score));
      const result = await submitCustomerRatingAction(data);
      if (result.error) setFeedback(result.error);
      else { setFeedback(result.message ?? 'تم حفظ تقييمك.'); router.refresh(); }
    });
  }
  return <section className="rounded-3xl border border-[#c9a227]/25 bg-[#141414] p-5 sm:p-6" aria-labelledby="customer-rating-heading"><h2 id="customer-rating-heading" className="text-lg font-black text-white">{rating ? 'تعديل تقييمك للخدمة' : 'كيف كانت الخدمة؟'}</h2><p className="mt-1 text-xs leading-6 text-neutral-400">ملاحظتك تساعدنا في تحسين الخدمة، ولا تُنشر علنًا إلا بعد اعتماد الإدارة.</p><form onSubmit={submit} className="mt-5 space-y-4"><div className="flex items-center gap-1" role="radiogroup" aria-label="تقييم الخدمة من خمس نجوم">{[1,2,3,4,5].map((value) => <button key={value} type="button" role="radio" aria-checked={score === value} onClick={() => setScore(value)} className="rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-[#e5c45a]"><Star className={`size-7 ${value <= score ? 'fill-[#e5c45a] text-[#e5c45a]' : 'text-neutral-600'}`} aria-hidden="true" /></button>)}</div><label className="block text-xs font-bold text-neutral-300">تعليقك (اختياري)<textarea name="comment" defaultValue={rating?.comment ?? ''} rows={4} maxLength={1000} className="mt-2 w-full rounded-xl border border-neutral-700 bg-[#080808] p-3 text-sm text-white outline-none focus:border-[#e5c45a]" placeholder="ما الذي أعجبك أو يمكن تحسينه؟" /></label>{feedback ? <p role="status" className="text-sm font-bold text-[#e5c45a]">{feedback}</p> : null}<button type="submit" disabled={isPending} className="min-h-11 rounded-xl bg-[#c9a227] px-5 text-sm font-black text-black disabled:opacity-50">{isPending ? 'جارٍ الحفظ…' : rating ? 'حفظ التعديل' : 'إرسال التقييم'}</button></form></section>;
}
