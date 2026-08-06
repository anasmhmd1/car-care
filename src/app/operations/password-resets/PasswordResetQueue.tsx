'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { Check, Copy, KeyRound, LoaderCircle, ShieldX, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  rejectPasswordResetRequestAction,
  resolvePasswordResetRequestAction,
} from '@/app/actions/password-reset';

export interface PasswordResetRequestDto {
  id: string;
  status: string;
  customerName: string;
  phone: string;
  whatsapp: string;
  branchNames: string[];
  createdAt: string;
  completedAt: string | null;
  handledBy: string | null;
}

interface DialogState {
  request: PasswordResetRequestDto;
  mode: 'RESOLVE' | 'REJECT';
}

function secureTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_';
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const random = Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
  return `Bq7!${random}`;
}

const inputClass = 'mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080808] px-3 text-sm text-white outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20';

export default function PasswordResetQueue({ requests }: { requests: PasswordResetRequestDto[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [feedback, setFeedback] = useState('');
  const [completed, setCompleted] = useState(false);
  const [pending, startTransition] = useTransition();

  function openDialog(request: PasswordResetRequestDto, mode: DialogState['mode']) {
    setDialog({ request, mode });
    setTemporaryPassword(mode === 'RESOLVE' ? secureTemporaryPassword() : '');
    setFeedback('');
    setCompleted(false);
  }

  function closeDialog() {
    setDialog(null);
    setTemporaryPassword('');
    setFeedback('');
    setCompleted(false);
    router.refresh();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    const formData = new FormData(event.currentTarget);
    formData.set('requestId', dialog.request.id);
    if (dialog.mode === 'RESOLVE') formData.set('temporaryPassword', temporaryPassword);
    setFeedback('');
    startTransition(async () => {
      const result = dialog.mode === 'RESOLVE'
        ? await resolvePasswordResetRequestAction(formData)
        : await rejectPasswordResetRequestAction(formData);
      if (result.error) {
        setFeedback(result.error);
        return;
      }
      setCompleted(true);
      setFeedback(dialog.mode === 'RESOLVE'
        ? 'تم الحفظ وإلغاء الجلسات. انقل الكلمة الظاهرة للعميل يدويًا ثم أغلق النافذة.'
        : 'تم رفض الطلب وتوثيق السبب.');
    });
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setFeedback('تم نسخ الكلمة المؤقتة. شاركها يدويًا مع العميل بعد التحقق من هويته.');
    } catch {
      setFeedback('تعذر النسخ تلقائيًا؛ حدّد الكلمة وانسخها يدويًا.');
    }
  }

  return (
    <>
      <section aria-labelledby="pending-reset-title" className="rounded-3xl border border-white/10 bg-[#111] p-5 sm:p-7">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold text-[#d4af37]">MANUAL IDENTITY CHECK</p><h2 id="pending-reset-title" className="mt-2 text-2xl font-black">طلبات الاستعادة</h2></div>
          <p className="max-w-xl text-xs leading-6 text-white/45">تحقق من الهوية خارج النظام، ثم أنشئ كلمة مؤقتة. لا يرسل بريق أي SMS أو بريد أو WhatsApp آلي.</p>
        </div>
        {requests.length === 0 ? (
          <div className="py-14 text-center"><KeyRound className="mx-auto size-10 text-white/20" aria-hidden="true" /><p className="mt-4 font-bold text-white/70">لا توجد طلبات مطابقة</p></div>
        ) : (
          <div className="mt-5 grid gap-3">
            {requests.map((request) => (
              <article key={request.id} className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-black">{request.customerName}</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${request.status === 'PENDING' ? 'bg-amber-300/10 text-amber-200' : request.status === 'RESOLVED' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-red-400/10 text-red-200'}`}>{request.status}</span></div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50"><a href={`tel:${request.phone}`} dir="ltr" className="hover:text-[#d4af37]">{request.phone}</a><span>{new Date(request.createdAt).toLocaleString('ar-EG')}</span><span>{request.branchNames.join(' · ') || 'بلا حجز سابق'}</span></div>
                    {request.handledBy ? <p className="mt-2 text-[11px] text-white/35">عولج بواسطة {request.handledBy}</p> : null}
                  </div>
                  {request.status === 'PENDING' ? (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button type="button" onClick={() => openDialog(request, 'RESOLVE')} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#d4af37] px-4 text-xs font-black text-black"><KeyRound className="size-4" aria-hidden="true" /> تحقق وأنشئ كلمة</button>
                      <button type="button" onClick={() => openDialog(request, 'REJECT')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-400/25 px-4 text-xs font-bold text-red-200"><ShieldX className="size-4" aria-hidden="true" /> رفض</button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {dialog ? (
        <div role="dialog" aria-modal="true" aria-labelledby="reset-dialog-title" className="fixed inset-0 z-[80] grid place-items-center bg-black/85 p-4 backdrop-blur-sm">
          <form onSubmit={submit} className="w-full max-w-xl space-y-5 rounded-3xl border border-[#d4af37]/25 bg-[#111] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold text-[#d4af37]">{dialog.mode === 'RESOLVE' ? 'تحقق يدوي وإعادة تعيين' : 'رفض الطلب'}</p><h2 id="reset-dialog-title" className="mt-2 text-xl font-black">{dialog.request.customerName}</h2><p dir="ltr" className="mt-1 text-xs text-white/45">{dialog.request.phone}</p></div><button type="button" onClick={closeDialog} disabled={pending} aria-label="إغلاق" className="grid size-11 place-items-center rounded-xl border border-white/10 text-white/50"><X className="size-5" aria-hidden="true" /></button></div>
            {dialog.mode === 'RESOLVE' ? (
              <div><label htmlFor="temporary-password" className="text-sm font-bold text-white/70">كلمة المرور المؤقتة *</label><div className="flex gap-2"><input id="temporary-password" name="temporaryPassword" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} minLength={14} maxLength={128} required dir="ltr" autoComplete="new-password" readOnly={completed} className={`${inputClass} font-mono`} /><button type="button" onClick={copyPassword} className="mt-2 grid size-11 shrink-0 place-items-center rounded-xl border border-white/10" aria-label="نسخ كلمة المرور"><Copy className="size-4" aria-hidden="true" /></button></div><button type="button" disabled={completed} onClick={() => setTemporaryPassword(secureTemporaryPassword())} className="mt-2 text-xs font-bold text-[#d4af37] disabled:opacity-40">توليد كلمة جديدة</button></div>
            ) : null}
            <div><label htmlFor="verification-reason" className="text-sm font-bold text-white/70">{dialog.mode === 'RESOLVE' ? 'كيف تم التحقق من الهوية؟ *' : 'سبب الرفض *'}</label><textarea id="verification-reason" name="verificationReason" required minLength={5} maxLength={1000} rows={4} readOnly={completed} className={`${inputClass} resize-y py-3`} /></div>
            {feedback ? <p role="status" className={`rounded-xl p-3 text-xs leading-6 ${completed ? 'bg-emerald-400/10 text-emerald-100' : 'bg-red-400/10 text-red-100'}`}>{feedback}</p> : null}
            <div className="flex justify-end gap-2">{completed ? <button type="button" onClick={closeDialog} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-5 text-xs font-black text-black"><Check className="size-4" aria-hidden="true" /> تم التواصل والإغلاق</button> : <><button type="button" onClick={closeDialog} disabled={pending} className="min-h-11 rounded-xl border border-white/10 px-5 text-xs font-bold">تراجع</button><button type="submit" disabled={pending} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-xs font-black ${dialog.mode === 'RESOLVE' ? 'bg-[#d4af37] text-black' : 'bg-red-500 text-white'}`}>{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}{dialog.mode === 'RESOLVE' ? 'حفظ وإلغاء الجلسات' : 'تأكيد الرفض'}</button></>}</div>
          </form>
        </div>
      ) : null}
    </>
  );
}
