'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, EyeOff, LoaderCircle, MessageSquareText, Star } from 'lucide-react';
import { moderateCustomerRatingAction } from '@/app/actions/customer-experience';

export interface CustomerRatingDto {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
  approvedForPublic: boolean;
  approvedAt: string | null;
  customerName: string;
  bookingNumber: string;
  serviceName: string;
  branchName: string;
}

interface RatingReviewPanelProps {
  ratings: CustomerRatingDto[];
}

function Stars({ score }: { score: number }) {
  return <span className="flex gap-0.5" aria-label={`${score} من 5 نجوم`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} className={`size-4 ${index < score ? 'fill-[#d4af37] text-[#d4af37]' : 'text-white/20'}`} aria-hidden="true" />)}</span>;
}

export default function RatingReviewPanel({ ratings }: RatingReviewPanelProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [, startTransition] = useTransition();

  function setVisibility(rating: CustomerRatingDto, approved: boolean) {
    setFeedback(null);
    setPendingId(rating.id);
    const formData = new FormData();
    formData.set('ratingId', rating.id);
    formData.set('approved', String(approved));
    startTransition(async () => {
      const result = await moderateCustomerRatingAction(formData);
      setPendingId(null);
      if (result.error) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      setFeedback({ kind: 'success', message: approved ? 'تم اعتماد التقييم للنشر في الصفحة الرئيسية.' : 'تم إخفاء التقييم من الصفحة الرئيسية.' });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {feedback ? <p role={feedback.kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`rounded-2xl border px-4 py-3 text-sm font-bold ${feedback.kind === 'error' ? 'border-red-500/35 bg-red-500/10 text-red-100' : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100'}`}>{feedback.message}</p> : null}
      {ratings.length === 0 ? <section className="rounded-3xl border border-white/10 bg-[#141414] p-12 text-center"><MessageSquareText className="mx-auto size-7 text-[#d4af37]" aria-hidden="true" /><h2 className="mt-4 text-xl font-black">لا توجد تقييمات حتى الآن</h2><p className="mt-2 text-sm leading-6 text-white/50">بعد اكتمال أول حجز، يستطيع العميل إرسال تقييمه من صفحة الحجز.</p></section> : <div className="grid gap-5 lg:grid-cols-2">{ratings.map((rating) => {
        const pending = pendingId === rating.id;
        const canPublish = Boolean(rating.comment?.trim());
        return <article key={rating.id} className="flex flex-col rounded-3xl border border-white/10 bg-[#141414] p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><Stars score={rating.score} /><p className="mt-3 text-sm font-bold text-white">{rating.customerName}</p><p dir="ltr" className="mt-1 font-mono text-xs text-[#e5c45a]">{rating.bookingNumber}</p></div><span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${rating.approvedForPublic ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-100'}`}>{rating.approvedForPublic ? 'منشور' : 'بانتظار المراجعة'}</span></div><div className="mt-5 flex-1 rounded-2xl bg-black/20 p-4"><p className="text-sm leading-7 text-white/80">{rating.comment?.trim() || 'لم يترك العميل تعليقًا نصيًا؛ لا يمكن إظهار التقييم كتجربة عميل عامة.'}</p></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/45"><div><dt>الخدمة</dt><dd className="mt-1 truncate text-sm text-white/75">{rating.serviceName}</dd></div><div><dt>الفرع</dt><dd className="mt-1 truncate text-sm text-white/75">{rating.branchName}</dd></div><div className="col-span-2"><dt>أرسل في</dt><dd className="mt-1 text-sm text-white/75">{new Date(rating.createdAt).toLocaleString('ar-EG')}</dd></div></dl><div className="mt-5 flex flex-wrap gap-3">{!rating.approvedForPublic ? <button type="button" disabled={pending || !canPublish} title={!canPublish ? 'يلزم تعليق نصي لنشر التجربة.' : undefined} onClick={() => setVisibility(rating, true)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-4 text-sm font-black text-[#080808] disabled:cursor-not-allowed disabled:opacity-40">{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}اعتماد للنشر</button> : <button type="button" disabled={pending} onClick={() => setVisibility(rating, false)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/35 px-4 text-sm font-bold text-red-200 hover:bg-red-500/10 disabled:opacity-50">{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}إخفاء من الصفحة الرئيسية</button>}</div></article>;
      })}</div>}
    </div>
  );
}
