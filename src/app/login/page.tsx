'use client';

import { Suspense, useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { loginAction } from '@/app/actions/auth';
import { Phone, Lock, LogIn, UserPlus } from 'lucide-react';
import BareeqLogo from '@/components/BareeqLogo';
import SkipLink from '@/components/SkipLink';
import PasswordResetRequestForm from './PasswordResetRequestForm';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageContent callback={null} />}>
      <LoginPageWithCallback />
    </Suspense>
  );
}

function LoginPageWithCallback() {
  const callback = useSearchParams().get('callback');
  return <LoginPageContent callback={callback} />;
}

function LoginPageContent({ callback }: { callback: string | null }) {
  const [state, formAction, pending] = useActionState(loginAction, null);
  const registerHref = callback ? `/register?callback=${encodeURIComponent(callback)}` : '/register';

  return (
    <>
      <SkipLink />
      <main id="main-content" className="min-h-screen bg-[#080808] text-white flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md space-y-8 bg-[#141414] p-6 sm:p-8 rounded-3xl border border-[#cea355]/30 shadow-2xl glass-card">
        
        {/* Official Brand Logo Header */}
        <div className="text-center flex flex-col items-center space-y-3">
          <Link href="/" className="inline-block transition-transform hover:scale-105" aria-label="العودة إلى الصفحة الرئيسية">
            <BareeqLogo size="lg" showText={true} />
          </Link>
          <div className="pt-2">
            <h1 className="text-xl font-extrabold text-white">تسجيل الدخول إلى حسابك</h1>
            <p className="text-xs text-neutral-400 mt-1">ادخل رقم الهاتف وكلمة المرور لمتابعة لوحتك وحجوزاتك</p>
          </div>
        </div>

        {/* Error Alert */}
        {state?.error && (
          <div id="auth-error" role="alert" aria-live="assertive" className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-semibold text-center">
            {state.error}
          </div>
        )}

        {/* Form */}
        <form action={formAction} className="space-y-5" aria-describedby={state?.error ? 'auth-error' : undefined}>
          {callback ? <input type="hidden" name="callback" value={callback} /> : null}
          <div className="space-y-1.5">
            <label htmlFor="login-phone" className="text-xs font-semibold text-neutral-300 block">رقم الهاتف (رقم الحساب)</label>
            <div className="relative">
              <Phone className="w-4 h-4 text-neutral-500 absolute top-3.5 right-3.5" aria-hidden="true" />
              <input
                id="login-phone"
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="text-xs font-semibold text-neutral-300 block">كلمة المرور</label>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-500 absolute top-3.5 right-3.5" aria-hidden="true" />
              <input
                id="login-password"
                type="password"
                name="password"
                required
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-[#080808] border border-neutral-800 focus:border-[#cea355] focus-visible:ring-2 focus-visible:ring-[#cea355]/35 rounded-xl pr-10 pl-4 py-3 text-sm text-white placeholder-neutral-600 transition-[border-color,box-shadow]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="w-full min-h-12 py-3.5 rounded-xl gold-gradient text-[#080808] font-bold text-sm shadow-lg shadow-[#cea355]/25 hover:brightness-110 active:scale-95 transition-[filter,transform,opacity] disabled:cursor-wait disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {pending ? (
              <span>جاري التحقق…</span>
            ) : (
              <>
                <LogIn className="w-4 h-4" aria-hidden="true" />
                <span>تسجيل الدخول</span>
              </>
            )}
          </button>
        </form>

        <PasswordResetRequestForm />

        {/* Footer Link */}
        <div className="text-center pt-4 text-xs text-neutral-400 border-t border-neutral-800">
          ليس لديك حساب بعد؟{' '}
          <Link href={registerHref} className="text-[#edce8b] font-bold hover:underline inline-flex items-center gap-1">
            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>إنشاء حساب جديد</span>
          </Link>
        </div>

      </div>
      </main>
    </>
  );
}
