'use client';

import { Suspense, useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { registerAction } from '@/app/actions/auth';
import { User, Phone, MessageSquare, Lock, UserPlus, LogIn } from 'lucide-react';
import BareeqLogo from '@/components/BareeqLogo';
import SkipLink from '@/components/SkipLink';

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterPageContent callback={null} />}>
      <RegisterPageWithCallback />
    </Suspense>
  );
}

function RegisterPageWithCallback() {
  const callback = useSearchParams().get('callback');
  return <RegisterPageContent callback={callback} />;
}

function RegisterPageContent({ callback }: { callback: string | null }) {
  const [state, formAction, pending] = useActionState(registerAction, null);
  const loginHref = callback ? `/login?callback=${encodeURIComponent(callback)}` : '/login';

  return (
    <>
      <SkipLink />
      <main id="main-content" className="min-h-screen bg-[#080808] text-white flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md space-y-8 bg-[#141414] p-6 sm:p-8 rounded-3xl border border-[#cea355]/30 shadow-2xl glass-card">
        
        {/* Header */}
        <div className="text-center flex flex-col items-center space-y-3">
          <Link href="/" className="inline-block transition-transform hover:scale-105" aria-label="العودة إلى الصفحة الرئيسية">
            <BareeqLogo size="lg" showText={true} />
          </Link>
          <div className="pt-2">
            <h1 className="text-xl font-extrabold text-white">إنشاء حساب عميل جديد</h1>
            <p className="text-xs text-neutral-400 mt-1">سجل بياناتك للبدء في حجز خدمات العناية ومتابعة سياراتك</p>
          </div>
        </div>

        {/* Error Alert */}
        {state?.error && (
          <div id="auth-error" role="alert" aria-live="assertive" className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-semibold text-center">
            {state.error}
          </div>
        )}

        {/* Form */}
        <form action={formAction} className="space-y-4" aria-describedby={state?.error ? 'auth-error' : undefined}>
          {callback ? <input type="hidden" name="callback" value={callback} /> : null}
          <div className="space-y-1">
            <label htmlFor="register-name" className="text-xs font-semibold text-neutral-300 block">الاسم بالكامل</label>
            <div className="relative">
              <User className="w-4 h-4 text-neutral-500 absolute top-3.5 right-3.5" aria-hidden="true" />
              <input
                id="register-name"
                type="text"
                name="fullName"
                required
                placeholder="أحمد محمود"
                autoComplete="name"
                className="w-full bg-[#080808] border border-neutral-800 focus:border-[#cea355] focus-visible:ring-2 focus-visible:ring-[#cea355]/35 rounded-xl pr-10 pl-4 py-3 text-sm text-white placeholder-neutral-600 transition-[border-color,box-shadow]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="register-phone" className="text-xs font-semibold text-neutral-300 block">رقم الهاتف (المعرف الأساسي)</label>
            <div className="relative">
              <Phone className="w-4 h-4 text-neutral-500 absolute top-3.5 right-3.5" aria-hidden="true" />
              <input
                id="register-phone"
                type="tel"
                name="phone"
                required
                placeholder="010XXXXXXXX"
                autoComplete="tel"
                inputMode="tel"
                spellCheck={false}
                dir="ltr"
                className="w-full bg-[#080808] border border-neutral-800 focus:border-[#cea355] focus-visible:ring-2 focus-visible:ring-[#cea355]/35 rounded-xl pr-10 pl-4 py-3 text-sm text-white placeholder-neutral-600 transition-[border-color,box-shadow] text-right"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="register-whatsapp" className="text-xs font-semibold text-neutral-300 block">رقم WhatsApp (اختياري)</label>
            <div className="relative">
              <MessageSquare className="w-4 h-4 text-neutral-500 absolute top-3.5 right-3.5" aria-hidden="true" />
              <input
                id="register-whatsapp"
                type="tel"
                name="whatsapp"
                placeholder="نفس رقم الهاتف أو رقم آخر"
                autoComplete="tel"
                inputMode="tel"
                spellCheck={false}
                dir="ltr"
                className="w-full bg-[#080808] border border-neutral-800 focus:border-[#cea355] focus-visible:ring-2 focus-visible:ring-[#cea355]/35 rounded-xl pr-10 pl-4 py-3 text-sm text-white placeholder-neutral-600 transition-[border-color,box-shadow] text-right"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="register-password" className="text-xs font-semibold text-neutral-300 block">كلمة المرور</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-500 absolute top-3.5 right-3.5" aria-hidden="true" />
              <input
                id="register-password"
                type="password"
                name="password"
                required
                placeholder="••••••••"
                autoComplete="new-password"
                className="w-full bg-[#080808] border border-neutral-800 focus:border-[#cea355] focus-visible:ring-2 focus-visible:ring-[#cea355]/35 rounded-xl pr-10 pl-4 py-3 text-sm text-white placeholder-neutral-600 transition-[border-color,box-shadow]"
              />
            </div>
          </div>

          {/* Policy Agreement Checkbox */}
          <div className="pt-2">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-neutral-300">
              <input
                id="policy-agreement"
                type="checkbox"
                name="policyAgreement"
                required
                className="mt-0.5 rounded border-neutral-700 text-[#cea355] focus:ring-[#cea355] bg-[#080808]"
              />
              <span>
                أوافق على <Link href="/policies/booking" className="text-[#edce8b] underline">شروط الحجز والتحويل اليدوي</Link> و <Link href="/policies/privacy" className="text-[#edce8b] underline">سياسة الخصوصية</Link>.
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="w-full min-h-12 py-3.5 rounded-xl gold-gradient text-[#080808] font-bold text-sm shadow-lg shadow-[#cea355]/25 hover:brightness-110 active:scale-95 transition-[filter,transform,opacity] disabled:cursor-wait disabled:opacity-70 flex items-center justify-center gap-2 mt-4"
          >
            {pending ? (
              <span>جاري إنشاء الحساب…</span>
            ) : (
              <>
                <UserPlus className="w-4 h-4" aria-hidden="true" />
                <span>إنشاء الحساب والبدء</span>
              </>
            )}
          </button>
        </form>

        <div className="text-center pt-4 text-xs text-neutral-400 border-t border-neutral-800">
          لديك حساب بالفعل؟{' '}
          <Link href={loginHref} className="text-[#edce8b] font-bold hover:underline inline-flex items-center gap-1">
            <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
            <span>تسجيل الدخول</span>
          </Link>
        </div>

      </div>
      </main>
    </>
  );
}
