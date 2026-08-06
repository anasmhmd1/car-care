'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { User, LogOut, Menu, X, Car, Home, Layers, UserPlus, LogIn } from 'lucide-react';
import BareeqLogo from '@/components/BareeqLogo';
import SkipLink from '@/components/SkipLink';
import { logoutAction } from '@/app/actions/auth';

interface NavbarProps {
  user?: {
    id: string;
    fullName: string;
    role: string;
  } | null;
}

export default function Navbar({ user }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const getDashboardLink = () => {
    if (!user) return '/login';
    switch (user.role) {
      case 'SYSTEM_SUPER_ADMIN':
        return '/system-admin';
      case 'OWNER':
        return '/admin';
      case 'OPERATIONS_MANAGER':
        return '/operations';
      case 'EMPLOYEE':
        return '/staff';
      default:
        return '/account';
    }
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'SYSTEM_SUPER_ADMIN':
        return 'مدير النظام السوبر';
      case 'OWNER':
        return 'مالك المشروع';
      case 'OPERATIONS_MANAGER':
        return 'مدير التشغيل';
      case 'EMPLOYEE':
        return 'فني تشغيل';
      default:
        return 'حسابي';
    }
  };

  return (
    <>
    <SkipLink />
    <header className={`fixed top-0 left-0 right-0 z-50 transition-[background-color,border-color,padding,box-shadow] duration-300 ${scrolled ? 'bg-[#080808]/90 backdrop-blur-md border-b border-[#cea355]/20 py-3 shadow-xl' : 'bg-transparent py-5'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-row-reverse md:flex-row items-center justify-between">
        
        {/* 1. ACTION BUTTONS (MIRRORED POSITION: FAR RIGHT in RTL) */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          {user ? (
            <>
              {/* Dashboard Link */}
              <Link
                href={getDashboardLink()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl gold-gradient text-[#080808] font-bold text-sm shadow-lg shadow-[#cea355]/25 hover:brightness-110 active:scale-95 transition-[filter,transform]"
              >
                <User className="w-4 h-4 text-[#080808]" aria-hidden="true" />
                <span>لوحة التحكم ({user.fullName.split(' ')[0]})</span>
                <span className="text-[10px] bg-[#080808]/20 text-[#080808] px-2 py-0.5 rounded font-black border border-black/10">
                  {getRoleBadge(user.role)}
                </span>
              </Link>

              {/* Logout Button */}
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#141414] border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors text-xs font-semibold"
                  title="تسجيل الخروج وتبديل الحساب"
                >
                  <LogOut className="w-3.5 h-3.5 text-red-400" aria-hidden="true" />
                  <span>تسجيل الخروج</span>
                </button>
              </form>
            </>
          ) : (
            <>
              {/* Primary Golden Button: Login */}
              <Link
                href="/login"
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl gold-gradient text-[#080808] font-bold text-sm shadow-lg shadow-[#cea355]/25 hover:brightness-110 active:scale-95 transition-[filter,transform]"
              >
                <LogIn className="w-4 h-4 text-[#080808]" aria-hidden="true" />
                <span>تسجيل الدخول</span>
              </Link>

              {/* Secondary Button: Register */}
              <Link
                href="/register"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#141414] border border-[#cea355]/30 text-[#edce8b] hover:bg-[#cea355]/10 transition-colors text-sm font-semibold"
              >
                <UserPlus className="w-4 h-4" aria-hidden="true" />
                <span>إنشاء حساب</span>
              </Link>
            </>
          )}
        </div>

        {/* 2. NAVIGATION LINKS (MIRRORED ORDER: MIDDLE in RTL) */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-neutral-300" aria-label="التنقل الرئيسي">
          <Link href="/faq" className="hover:text-[#edce8b] transition-colors">الأسئلة الشائعة</Link>
          <Link href="/areas" className="hover:text-[#edce8b] transition-colors">مناطق الخدمة</Link>
          <Link href="/plans" className="hover:text-[#edce8b] transition-colors flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[#cea355]" aria-hidden="true" /> الاشتراكات
          </Link>
          <Link href="/services" className="hover:text-[#edce8b] transition-colors flex items-center gap-1.5">
            <Car className="w-4 h-4 text-[#cea355]" aria-hidden="true" /> الخدمات
          </Link>
          <Link href="/" className="hover:text-[#edce8b] transition-colors flex items-center gap-1.5">
            <Home className="w-4 h-4 text-[#cea355]" aria-hidden="true" /> الرئيسية
          </Link>
        </nav>

        {/* 3. BRAND LOGO (MIRRORED POSITION: FAR LEFT in RTL, stays LEFT on mobile) */}
        <Link href="/" className="flex items-center shrink-0" aria-label="بريق — الصفحة الرئيسية">
          <div className="block sm:hidden">
            <BareeqLogo size="sm" />
          </div>
          <div className="hidden sm:block">
            <BareeqLogo size="md" />
          </div>
        </Link>

        {/* Mobile Menu Button */}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden min-h-11 min-w-11 p-2.5 rounded-xl text-neutral-200 hover:text-[#edce8b] bg-[#141414] border border-[#cea355]/30 shadow-md active:scale-95 transition-[color,transform]"
          aria-label={mobileMenuOpen ? 'إغلاق قائمة التنقل' : 'فتح قائمة التنقل'}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation"
        >
          {mobileMenuOpen ? <X className="w-6 h-6 text-[#edce8b]" aria-hidden="true" /> : <Menu className="w-6 h-6 text-[#edce8b]" aria-hidden="true" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <nav id="mobile-navigation" aria-label="التنقل على الهاتف" className="md:hidden max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain bg-[#0c0c0c] border-b border-[#cea355]/20 px-6 py-6 space-y-4 animate-in slide-in-from-top duration-200">
          <Link href="/" onClick={() => setMobileMenuOpen(false)} className="block text-neutral-200 py-2 font-medium hover:text-[#edce8b]">الرئيسية</Link>
          <Link href="/services" onClick={() => setMobileMenuOpen(false)} className="block text-neutral-200 py-2 font-medium hover:text-[#edce8b]">الخدمات</Link>
          <Link href="/plans" onClick={() => setMobileMenuOpen(false)} className="block text-neutral-200 py-2 font-medium hover:text-[#edce8b]">الاشتراكات</Link>
          <Link href="/areas" onClick={() => setMobileMenuOpen(false)} className="block text-neutral-200 py-2 font-medium hover:text-[#edce8b]">مناطق الخدمة</Link>
          <Link href="/faq" onClick={() => setMobileMenuOpen(false)} className="block text-neutral-200 py-2 font-medium hover:text-[#edce8b]">الأسئلة الشائعة</Link>
          
          <div className="pt-4 border-t border-neutral-800 flex flex-col gap-3">
            {user ? (
              <>
                <Link
                  href={getDashboardLink()}
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-3 rounded-xl gold-gradient text-[#080808] font-bold text-sm shadow-md"
                >
                  لوحة التحكم ({user.fullName}) - {getRoleBadge(user.role)}
                </Link>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="w-full text-center py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-semibold text-sm"
                  >
                    تسجيل الخروج (تبديل الحساب)
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-3 rounded-xl gold-gradient text-[#080808] font-bold text-sm shadow-md"
                >
                  تسجيل الدخول
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 rounded-xl bg-[#141414] border border-[#cea355]/30 text-[#edce8b] font-semibold text-sm"
                >
                  إنشاء حساب جديد
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
    </>
  );
}
