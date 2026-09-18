'use client';

import { Suspense, useActionState, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { loginAction } from '@/app/actions/auth';
import { Phone, Lock, LogIn, UserPlus, Eye, EyeOff } from 'lucide-react';
import BareeqLogo from '@/components/BareeqLogo';
import SkipLink from '@/components/SkipLink';
import PasswordResetModal from './PasswordResetModal';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageWithCallback />
    </Suspense>
  );
}

function LoginPageFallback() {
  return (
    <>
      <SkipLink />
      <main id="main-content" className="min-h-screen bg-[#060608] text-white flex items-center justify-center px-4 py-12">
        <div role="status" aria-live="polite" aria-busy="true" className="w-full max-w-md rounded-3xl border border-[#cea355]/25 bg-neutral-900/80 p-9 text-center shadow-2xl">
          <h1 className="text-2xl font-black">تسجيل الدخول</h1>
          <p className="mt-3 text-sm text-neutral-400">جارٍ تحميل الصفحة…</p>
        </div>
      </main>
    </>
  );
}

function LoginPageWithCallback() {
  const callback = useSearchParams().get('callback');
  return <LoginPageContent callback={callback} />;
}

function LoginPageContent({ callback }: { callback: string | null }) {
  const [state, formAction, pending] = useActionState(loginAction, null);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const registerHref = callback ? `/register?callback=${encodeURIComponent(callback)}` : '/register';

  return (
    <>
      <SkipLink />
      <main id="main-content" className="min-h-screen relative bg-[#060608] text-white flex flex-col justify-center items-center px-4 py-12 overflow-hidden selection:bg-[#cea355]/30 selection:text-[#edce8b]">
        
        {/* Luxury Ambient Glow Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-b from-[#cea355]/15 to-transparent rounded-full blur-[120px] opacity-70" />
          <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[400px] h-[300px] bg-[#cea355]/10 rounded-full blur-[100px]" />
          <div className="absolute inset-0 bg-[radial-gradient(#cea355_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.03]" />
        </div>

        {/* Card Container */}
        <div className="relative w-full max-w-md bg-neutral-900/80 backdrop-blur-2xl p-7 sm:p-9 rounded-3xl border border-[#cea355]/25 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_50px_rgba(206,163,85,0.06)] ring-1 ring-white/5 space-y-7 transition-all">
          
          {/* Official Brand Logo & Header */}
          <div className="text-center flex flex-col items-center space-y-4">
            <Link 
              href="/" 
              className="inline-block transition-transform duration-300 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cea355] rounded-2xl p-1" 
              aria-label="العودة إلى الصفحة الرئيسية"
            >
              <BareeqLogo size="lg" />
            </Link>
            
            <div className="space-y-1.5 pt-1">
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center justify-center gap-2">
                <span>تسجيل الدخول</span>
              </h1>
              <p className="text-xs sm:text-sm text-neutral-400 font-normal">
                مرحباً بك مجدداً في تجربة كار كير للعناية الفائقة
              </p>
            </div>
          </div>

          {/* Error Alert */}
          {state?.error && (
            <div id="auth-error" role="alert" aria-live="assertive" className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-semibold text-center flex items-center justify-center gap-2 animate-in fade-in duration-300">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span>{state.error}</span>
            </div>
          )}

          {/* Form */}
          <form action={formAction} className="space-y-4.5" aria-describedby={state?.error ? 'auth-error' : undefined}>
            {callback ? <input type="hidden" name="callback" value={callback} /> : null}
            
            {/* Phone or Email Input */}
            <div className="space-y-1.5 group">
              <label htmlFor="login-phone" className="text-xs font-medium text-neutral-300 block">
                رقم الهاتف أو البريد الإلكتروني
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-neutral-500 group-focus-within:text-[#edce8b] absolute top-1/2 -translate-y-1/2 right-3.5 transition-colors pointer-events-none" aria-hidden="true" />
                <input
                  id="login-phone"
                  type="text"
                  name="phone"
                  required
                  placeholder="010XXXXXXXX"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  autoComplete="username tel"
                  spellCheck={false}
                  className="w-full bg-[#0a0a0c] border border-neutral-800 text-white rounded-xl py-3 pr-10 pl-4 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-[#cea355] focus:ring-2 focus:ring-[#cea355]/20 transition-all font-sans text-right"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5 group">
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="text-xs font-medium text-neutral-300 block">
                  كلمة المرور
                </label>
                <button
                  type="button"
                  onClick={() => setShowResetModal(true)}
                  className="text-xs text-[#edce8b] hover:text-[#f3e4a8] hover:underline font-bold transition-colors cursor-pointer"
                >
                  نسيت كلمة المرور؟
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 group-focus-within:text-[#edce8b] absolute top-1/2 -translate-y-1/2 right-3.5 transition-colors pointer-events-none" aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-[#0a0a0c] border border-neutral-800 text-white rounded-xl py-3 pr-10 pl-11 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-[#cea355] focus:ring-2 focus:ring-[#cea355]/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="absolute top-1/2 -translate-y-1/2 left-3 text-neutral-500 hover:text-neutral-300 p-1 rounded-lg transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#cea355]"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="w-full min-h-[48px] mt-2 py-3.5 rounded-xl font-extrabold text-sm text-[#080808] bg-gradient-to-r from-[#edce8b] via-[#cea355] to-[#b5883f] shadow-[0_4px_20px_rgba(206,163,85,0.3)] hover:shadow-[0_6px_25px_rgba(206,163,85,0.45)] hover:brightness-105 active:scale-[0.99] transition-all disabled:cursor-wait disabled:opacity-70 flex items-center justify-center gap-2 cursor-pointer"
            >
              {pending ? (
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#080808] border-t-transparent rounded-full animate-spin" />
                  <span>جاري التحقق…</span>
                </div>
              ) : (
                <>
                  <LogIn className="w-4 h-4" aria-hidden="true" />
                  <span>تسجيل الدخول</span>
                </>
              )}
            </button>
          </form>

          {/* Footer Navigation Link */}
          <div className="text-center pt-3 text-xs text-neutral-400 border-t border-neutral-800/80 flex items-center justify-center gap-1.5">
            <span>ليس لديك حساب بعد؟</span>
            <Link 
              href={registerHref} 
              className="text-[#edce8b] font-bold hover:text-white transition-colors inline-flex items-center gap-1 hover:underline"
            >
              <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>إنشاء حساب جديد</span>
            </Link>
          </div>

        </div>
      </main>

      {/* Password Reset Modal */}
      <PasswordResetModal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        initialPhone={phoneInput}
      />
    </>
  );
}
