'use client';

import { useState, useTransition } from 'react';
import { KeyRound, LoaderCircle } from 'lucide-react';
import { requestPasswordResetAction } from '@/app/actions/customer';

export default function PasswordResetRequestForm() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setMessage('');
    setError('');
    startTransition(async () => {
      const result = await requestPasswordResetAction(formData);
      if ('error' in result && result.error) setError(result.error);
      else if ('message' in result) setMessage(result.message);
    });
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="password-reset-request" className="flex min-h-11 w-full items-center justify-between gap-3 text-right text-xs font-bold text-[#edce8b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cea355]">
        <span className="inline-flex items-center gap-2"><KeyRound className="size-4" aria-hidden="true" /> نسيت كلمة المرور؟</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <form id="password-reset-request" action={submit} className="mt-3 space-y-3 border-t border-white/10 pt-4">
          <p className="text-xs leading-6 text-neutral-400">أرسل رقم الحساب. بعد التحقق اليدوي من هويتك سيتواصل معك الفريق بكلمة مؤقتة؛ لا نرسل SMS أو بريدًا آليًا.</p>
          <div>
            <label htmlFor="reset-phone" className="mb-1.5 block text-xs font-semibold text-neutral-300">رقم هاتف الحساب</label>
            <input id="reset-phone" name="phone" type="tel" required minLength={8} maxLength={20} inputMode="tel" autoComplete="tel" dir="ltr" className="min-h-11 w-full rounded-xl border border-neutral-800 bg-[#080808] px-4 text-sm text-white outline-none focus:border-[#cea355] focus:ring-2 focus:ring-[#cea355]/25" />
          </div>
          {error ? <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-xs text-red-200">{error}</p> : null}
          {message ? <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-200">{message}</p> : null}
          <button type="submit" disabled={pending} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#cea355]/40 bg-[#cea355]/10 px-4 text-xs font-bold text-[#edce8b] disabled:opacity-60">
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <KeyRound className="size-4" aria-hidden="true" />}
            إرسال طلب الاستعادة
          </button>
        </form>
      ) : null}
    </section>
  );
}
