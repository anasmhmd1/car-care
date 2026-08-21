'use client';

import { Suspense, useActionState, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { registerAction } from '@/app/actions/auth';
import { User, Phone, MessageSquare, Lock, UserPlus, LogIn, Eye, EyeOff } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const loginHref = callback ? `/login?callback=${encodeURIComponent(callback)}` : '/login';

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
        <div className="relative w-full max-w-md bg-neutral-900/80 backdrop-blur-2xl p-7 sm:p-9 rounded-3xl border border-[#cea355]/25 shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_50px_rgba(206,163,85,0.06)] ring-1 ring-white/5 space-y-6 transition-all">
          
          {/* Header */}
          <div className="text-center flex flex-col items-center space-y-4">
            <Link 
              href="/" 
              className="inline-block transition-transform duration-300 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cea355] rounded-2xl p-1" 
              aria-label="العودة إلى الصفحة الرئيسية"
            >
              <BareeqLogo size="lg" />
            </Link>
            <div className="space-y-1.5 pt-1">
              <h1 className="text-2xl font-black text-white tracking-tight">إنشاء حساب عميل جديد</h1>
              <p className="text-xs sm:text-sm text-neutral-400 font-normal">سجل بياناتك للبدء في حجز خدمات العناية ومتابعة سياراتك</p>
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
          <form action={formAction} className="space-y-4" aria-describedby={state?.error ? 'auth-error' : undefined}>
            {callback ? <input type="hidden" name="callback" value={callback} /> : null}
            
            {/* Full Name */}
            <div className="space-y-1.5 group">
              <label htmlFor="register-name" className="text-xs font-medium text-neutral-300 block">الاسم بالكامل</label>
              <div className="relative">
                <User className="w-4 h-4 text-neutral-500 group-focus-within:text-[#edce8b] absolute top-1/2 -translate-y-1/2 right-3.5 transition-colors pointer-events-none" aria-hidden="true" />
                <input
                  id="register-name"
                  type="text"
                  name="fullName"
                  required
                  placeholder="أحمد محمود"
                  autoComplete="name"
                  className="w-full bg-[#0a0a0c] border border-neutral-800 text-white rounded-xl py-3 pr-10 pl-4 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-[#cea355] focus:ring-2 focus:ring-[#cea355]/20 transition-all text-right"
                />
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-1.5 group">
              <label htmlFor="register-phone" className="text-xs font-medium text-neutral-300 block">رقم الهاتف (المعرف الأساسي)</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-neutral-500 group-focus-within:text-[#edce8b] absolute top-1/2 -translate-y-1/2 right-3.5 transition-colors pointer-events-none" aria-hidden="true" />
                <input
                  id="register-phone"
                  type="tel"
                  name="phone"
                  required
                  placeholder="010XXXXXXXX"
                  autoComplete="tel"
                  inputMode="tel"
                  spellCheck={false}
                  className="w-full bg-[#0a0a0c] border border-neutral-800 text-white rounded-xl py-3 pr-10 pl-4 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-[#cea355] focus:ring-2 focus:ring-[#cea355]/20 transition-all font-sans text-right"
                />
              </div>
            </div>

            {/* WhatsApp (Optional) */}
            <div className="space-y-1.5 group">
              <label htmlFor="register-whatsapp" className="text-xs font-medium text-neutral-300 block">
                <span>رقم WhatsApp</span>
                <span className="text-neutral-500 text-[10px] mr-1.5">(اختياري)</span>
              </label>
              <div className="relative">
                <MessageSquare className="w-4 h-4 text-neutral-500 group-focus-within:text-[#edce8b] absolute top-1/2 -translate-y-1/2 right-3.5 transition-colors pointer-events-none" aria-hidden="true" />
                <input
                  id="register-whatsapp"
                  type="tel"
                  name="whatsapp"
                  placeholder="نفس رقم الهاتف أو رقم آخر"
                  autoComplete="tel"
                  inputMode="tel"
                  spellCheck={false}
                  className="w-full bg-[#0a0a0c] border border-neutral-800 text-white rounded-xl py-3 pr-10 pl-4 text-sm placeholder:text-neutral-600 focus:outline-none focus:border-[#cea355] focus:ring-2 focus:ring-[#cea355]/20 transition-all font-sans text-right"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5 group">
              <label htmlFor="register-password" className="text-xs font-medium text-neutral-300 block">كلمة المرور</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 group-focus-within:text-[#edce8b] absolute top-1/2 -translate-y-1/2 right-3.5 transition-colors pointer-events-none" aria-hidden="true" />
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  required
                  placeholder="••••••••"
                  autoComplete="new-password"
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

            {/* Policy Agreement Checkbox */}
            <div className="pt-2">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-neutral-300 leading-relaxed">
                <input
                  id="policy-agreement"
                  type="checkbox"
                  name="policyAgreement"
                  required
                  className="mt-0.5 rounded border-neutral-700 text-[#cea355] focus:ring-[#cea355] bg-[#0a0a0c] accent-[#cea355] cursor-pointer"
                />
                <span>
                  أوافق على <Link href="/policies/booking" className="text-[#edce8b] underline hover:text-white transition-colors">شروط الحجز والتحويل</Link> و <Link href="/policies/privacy" className="text-[#edce8b] underline hover:text-white transition-colors">سياسة الخصوصية</Link>.
                </span>
              </label>
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
                  <span>جاري إنشاء الحساب…</span>
                </div>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" aria-hidden="true" />
                  <span>إنشاء الحساب والبدء</span>
                </>
              )}
            </button>
          </form>

          {/* Footer Navigation Link */}
          <div className="text-center pt-3 text-xs text-neutral-400 border-t border-neutral-800/80 flex items-center justify-center gap-1.5">
            <span>لديك حساب بالفعل؟</span>
            <Link 
              href={loginHref} 
              className="text-[#edce8b] font-bold hover:text-white transition-colors inline-flex items-center gap-1 hover:underline"
            >
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              <span>تسجيل الدخول</span>
            </Link>
          </div>

        </div>
      </main>
    </>
  );
}

