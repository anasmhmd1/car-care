'use client';

import Image from 'next/image';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, EyeOff, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { reviewGalleryFileAction } from '@/app/actions/gallery';

interface GalleryFileDto {
  id: string;
  fileType: 'BEFORE_SERVICE' | 'AFTER_SERVICE';
  fileUrl: string;
  createdAt: string;
  customerGalleryConsentAt: string | null;
  approvedForGallery: boolean;
  galleryApprovedAt: string | null;
  bookingNumber: string;
  serviceName: string;
  branchName: string;
  customerName: string;
}

interface Props { files: GalleryFileDto[] }

type ReviewDialog = { file: GalleryFileDto; decision: 'APPROVE' | 'REJECT' } | null;

export default function GalleryReviewPanel({ files }: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<ReviewDialog>(null);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog(file: GalleryFileDto, decision: 'APPROVE' | 'REJECT') {
    setDialog({ file, decision });
    setReason('');
    setFeedback(null);
  }

  function submitReview() {
    if (!dialog || reason.trim().length < 5) {
      setFeedback({ kind: 'error', message: 'اكتب سببًا واضحًا لا يقل عن 5 أحرف.' });
      return;
    }
    const formData = new FormData();
    formData.set('fileId', dialog.file.id);
    formData.set('decision', dialog.decision);
    formData.set('reason', reason.trim());
    startTransition(async () => {
      const result = await reviewGalleryFileAction(formData);
      if (result.error) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      setDialog(null);
      setFeedback({ kind: 'success', message: dialog.decision === 'APPROVE' ? 'تم اعتماد الصورة للنشر العام.' : 'تم رفض الصورة أو إلغاء نشرها.' });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {feedback && !dialog ? <p role="status" aria-live="polite" className={`rounded-2xl border px-4 py-3 text-sm font-bold ${feedback.kind === 'error' ? 'border-red-500/35 bg-red-500/10 text-red-200' : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'}`}>{feedback.message}</p> : null}
      {files.length === 0 ? <section className="rounded-3xl border border-white/10 bg-[#141414] p-12 text-center"><h2 className="text-xl font-bold">لا توجد صور توثيقية</h2><p className="mt-2 text-sm text-white/45">ستظهر صور قبل وبعد هنا بعد رفعها من فريق التنفيذ.</p></section> : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {files.map((file) => (
            <article key={file.id} className="overflow-hidden rounded-3xl border border-white/10 bg-[#141414]">
              <div className="relative aspect-[4/3] bg-black"><Image src={file.fileUrl} alt={`${file.fileType === 'BEFORE_SERVICE' ? 'قبل' : 'بعد'} خدمة ${file.serviceName}`} fill sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw" unoptimized className="object-cover" /></div>
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-bold text-white/70">{file.fileType === 'BEFORE_SERVICE' ? 'قبل التنفيذ' : 'بعد التنفيذ'}</span><span className={`rounded-full border px-3 py-1 text-xs font-bold ${file.approvedForGallery ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : file.customerGalleryConsentAt ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-white/10 bg-white/[0.04] text-white/40'}`}>{file.approvedForGallery ? 'منشورة' : file.customerGalleryConsentAt ? 'بانتظار المالك' : 'خاصة'}</span></div>
                <div><p dir="ltr" className="font-mono text-sm font-bold text-[#e5c45a]">{file.bookingNumber}</p><p className="mt-2 text-sm text-white/70">{file.serviceName} · {file.customerName}</p><p className="mt-1 text-xs text-white/40">{file.branchName}</p></div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/50">{file.customerGalleryConsentAt ? `موافقة العميل: ${new Date(file.customerGalleryConsentAt).toLocaleString('ar-EG')}` : 'لم يمنح العميل موافقة النشر.'}</div>
                <div className="flex flex-wrap gap-2">
                  {!file.approvedForGallery ? <button type="button" disabled={!file.customerGalleryConsentAt} onClick={() => openDialog(file, 'APPROVE')} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-3 text-xs font-black text-[#080808] disabled:cursor-not-allowed disabled:opacity-35"><CheckCircle2 className="size-4" aria-hidden="true" /> اعتماد النشر</button> : null}
                  {(file.approvedForGallery || file.customerGalleryConsentAt) ? <button type="button" onClick={() => openDialog(file, 'REJECT')} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/35 px-3 text-xs font-bold text-red-200 hover:bg-red-500/10"><EyeOff className="size-4" aria-hidden="true" /> {file.approvedForGallery ? 'إلغاء النشر' : 'رفض'}</button> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {dialog ? <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="gallery-review-dialog-title"><div className="w-full max-w-lg space-y-5 rounded-3xl border border-[#c9a227]/40 bg-[#141414] p-6 sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-xs font-bold text-[#d4af37]"><ShieldCheck className="size-4" aria-hidden="true" /> قرار نشر موثق</p><h2 id="gallery-review-dialog-title" className="mt-2 text-xl font-black">{dialog.decision === 'APPROVE' ? 'اعتماد الصورة للمعرض العام' : 'رفض الصورة أو إلغاء نشرها'}</h2></div><button type="button" disabled={pending} onClick={() => { setDialog(null); setFeedback(null); }} aria-label="إغلاق" className="rounded-lg p-2 text-white/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]"><X className="size-5" aria-hidden="true" /></button></div>{feedback ? <p role="alert" className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 text-sm font-bold text-red-200">{feedback.message}</p> : null}<div><label htmlFor="gallery-review-reason" className="mb-2 block text-sm font-bold">سبب القرار *</label><textarea id="gallery-review-reason" value={reason} onChange={(event) => setReason(event.target.value)} autoFocus minLength={5} maxLength={500} rows={4} className="w-full resize-y rounded-xl border border-white/15 bg-[#080808] p-3 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]" /></div><div className="flex justify-end gap-3"><button type="button" disabled={pending} onClick={() => { setDialog(null); setFeedback(null); }} className="min-h-11 rounded-xl bg-white/10 px-5 text-sm font-bold">إلغاء</button><button type="button" disabled={pending} onClick={submitReview} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-black disabled:opacity-50 ${dialog.decision === 'APPROVE' ? 'bg-[#d4af37] text-[#080808]' : 'bg-red-500 text-white'}`}>{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null} تأكيد القرار</button></div></div></div> : null}
    </div>
  );
}
