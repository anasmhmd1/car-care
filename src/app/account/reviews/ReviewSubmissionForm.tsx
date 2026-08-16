'use client';

import React, { useState, useTransition } from 'react';
import { Star, CheckCircle2, LoaderCircle } from 'lucide-react';
import { submitCustomerRatingAction } from '@/app/actions/customer-experience';

interface ReviewSubmissionFormProps {
  bookingId: string;
  serviceName: string;
  initialScore?: number;
  initialComment?: string;
  isApproved?: boolean;
}

export default function ReviewSubmissionForm({
  bookingId,
  serviceName,
  initialScore = 5,
  initialComment = '',
  isApproved = false,
}: ReviewSubmissionFormProps) {
  const [score, setScore] = useState<number>(initialScore);
  const [hoverScore, setHoverScore] = useState<number>(0);
  const [comment, setComment] = useState<string>(initialComment);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const activeScore = hoverScore || score;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);

    const formData = new FormData();
    formData.append('bookingId', bookingId);
    formData.append('score', String(score));
    if (comment.trim()) {
      formData.append('comment', comment.trim());
    }

    startTransition(async () => {
      const res = await submitCustomerRatingAction(formData);
      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else {
        setFeedback({
          type: 'success',
          message: 'تم حفظ تقييمك بنجاح! سيظهر التقييم على الصفحة الرئيسية بعد مراجعة واعتماد الإدارة.',
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-neutral-800 bg-[#0a0a0a] p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs text-neutral-400">تقييم تجربة الخدمة</p>
          <p className="text-sm font-bold text-white mt-0.5">{serviceName}</p>
        </div>

        {/* Star Rating Control */}
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setScore(star)}
              onMouseEnter={() => setHoverScore(star)}
              onMouseLeave={() => setHoverScore(0)}
              className="p-1 text-neutral-600 transition-all hover:scale-110 focus:outline-none"
              aria-label={`${star} من 5 نجوم`}
            >
              <Star
                className={`size-6 ${
                  star <= activeScore
                    ? 'fill-[#f59e0b] text-[#f59e0b] filter drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]'
                    : 'text-neutral-700'
                }`}
              />
            </button>
          ))}
          <span className="mr-2 text-sm font-mono font-bold text-[#f59e0b]">
            {score} / 5
          </span>
        </div>
      </div>

      <div>
        <label htmlFor={`comment-${bookingId}`} className="block text-xs font-semibold text-neutral-400 mb-1.5">
          رأيك وملاحظاتك عن جودة الخدمة (اختياري)
        </label>
        <textarea
          id={`comment-${bookingId}`}
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="شاركنا رأيك في سرعة ودقة الخدمة، ونظافة السيارة بعد الانتهاء..."
          className="w-full resize-none rounded-xl border border-neutral-800 bg-[#121212] p-3 text-xs text-white placeholder-neutral-600 focus:border-[#c9a227] focus:outline-none"
        />
      </div>

      {isApproved && (
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>هذا التقييم معتمد ومنشور حالياً على الصفحة الرئيسية.</span>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-xl border p-3 text-xs font-bold ${
            feedback.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl gold-gradient px-5 text-xs font-bold text-[#080808] transition hover:brightness-110 disabled:opacity-50"
        >
          {isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
          <span>{initialComment || initialScore ? 'تحديث التقييم' : 'إرسال التقييم'}</span>
        </button>
      </div>
    </form>
  );
}
