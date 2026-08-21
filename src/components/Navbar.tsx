'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { User, LogOut, Car, Home, Layers, MapPin, HelpCircle } from 'lucide-react';
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
        return 'SUPER ADMIN';
      case 'OWNER':
        return 'OWNER';
      case 'OPERATIONS_MANAGER':
        return 'MANAGER';
      case 'EMPLOYEE':
        return 'STAFF';
      default:
        return 'MY ACCOUNT';
    }
  };

  return (
    <>
      <SkipLink />
      <header className={`fixed top-0 left-0 right-0 z-50 transition-[background-color,border-color,padding,box-shadow] duration-300 ${scrolled ? 'bg-[#080808]/90 backdrop-blur-md border-b border-[#cea355]/20 py-3 shadow-xl' : 'bg-transparent py-5'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-row items-center justify-between">

          {/* 1. ACTION BUTTONS (MIRRORED POSITION: FAR RIGHT in RTL, both Desktop & Mobile) */}
          <div className="flex items-center gap-1.5 xs:gap-2.5 sm:gap-3 shrink-0">
            {user ? (
              <>
                {/* Dashboard Link */}
                <Link
                  href={getDashboardLink()}
                  className="flex items-center gap-1.5 xs:gap-2 px-3 py-1.5 xs:px-4 xs:py-2 rounded-xl gold-gradient text-white font-bold text-xs xs:text-sm shadow-lg shadow-[#cea355]/25 hover:brightness-110 active:scale-95 transition-[filter,transform]"
                >
                  <User className="w-3.5 h-3.5 xs:w-4 xs:h-4 text-white" aria-hidden="true" />
                  <span>Dashboard ({user.fullName.split(' ')[0]})</span>
                  <span className="hidden sm:inline-block text-[10px] bg-black/30 text-white px-2 py-0.5 rounded font-black border border-white/20">
                    {getRoleBadge(user.role)}
                  </span>
                </Link>

                {/* Logout Button */}
                <form action={logoutAction} className="hidden sm:block">
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#141414] border border-red-500/30 text-white hover:bg-red-500/10 transition-colors text-xs font-semibold"
                    title="Logout"
                  >
                    <LogOut className="w-3.5 h-3.5 text-white" aria-hidden="true" />
                    <span>Logout</span>
                  </button>
                </form>
              </>
            ) : (
              <>
                {/* Primary Golden Button: LOGIN */}
                <Link
                  href="/login"
                  className="flex items-center justify-center px-4 py-1.5 xs:px-5 xs:py-2 rounded-2xl bg-gradient-to-r from-[#d99b42] to-[#b87d2b] text-white font-black text-xs xs:text-sm shadow-lg shadow-[#d99b42]/20 hover:brightness-110 active:scale-95 transition-all"
                >
                  <span className="whitespace-nowrap uppercase tracking-wider text-white">LOGIN</span>
                </Link>

                {/* Secondary Button: SIGN UP */}
                <Link
                  href="/register"
                  className="flex items-center justify-center px-3.5 py-1.5 xs:px-4.5 xs:py-2 rounded-2xl bg-black/60 border border-white/30 text-white hover:bg-white/10 transition-colors text-xs xs:text-sm font-bold"
                >
                  <span className="whitespace-nowrap uppercase tracking-wider text-white">SIGN UP</span>
                </Link>
              </>
            )}
          </div>

          {/* 2. NAVIGATION LINKS (Desktop only, LTR ordered icon first then name) */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold tracking-wide text-neutral-300" dir="ltr" aria-label="Main Navigation">
            <Link href="/" className="hover:text-[#edce8b] transition-colors flex items-center gap-1.5">
              <Home className="w-4 h-4 text-[#cea355]" aria-hidden="true" />
              <span>Home</span>
            </Link>
            <Link href="/services" className="hover:text-[#edce8b] transition-colors flex items-center gap-1.5">
              <Car className="w-4 h-4 text-[#cea355]" aria-hidden="true" />
              <span>Services</span>
            </Link>
            <Link href="/plans" className="hover:text-[#edce8b] transition-colors flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#cea355]" aria-hidden="true" />
              <span>Plans</span>
            </Link>
            <Link href="/faq" className="hover:text-[#edce8b] transition-colors flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-[#cea355]" aria-hidden="true" />
              <span>FAQ</span>
            </Link>
          </nav>

          {/* 3. BRAND LOGO (FAR LEFT; Toggles Mobile Menu Popup on Mobile) */}
          <div className="flex items-center shrink-0">
            {/* Desktop Brand Logo Link */}
            <Link href="/" className="hidden md:flex items-center" aria-label="BAREEQ — Homepage">
              <BareeqLogo size="md" variant="header" />
            </Link>

            {/* Mobile Clickable Brand Logo Button to Toggle Navigation Popup */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden flex items-center gap-1.5 focus:outline-none rounded-xl p-1 active:scale-95 transition-transform"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
            >
              <BareeqLogo size="sm" variant="header" />
            </button>
          </div>
        </div>

        {/* Compact Floating Mobile Navigation Popup Window (Illuminated & Glowing) */}
        {mobileMenuOpen && (
          <div
            id="mobile-navigation"
            aria-label="Mobile Navigation"
            dir="ltr"
            className="fixed top-[68px] left-4 xs:left-6 mt-1 w-52 xs:w-56 z-[100] rounded-2xl bg-[#0c0c0c]/98 backdrop-blur-2xl border border-[#cea355]/50 p-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.9)] border-t-[#cea355]/80 space-y-1 md:hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white hover:text-[#edce8b] hover:bg-[#cea355]/20 font-bold text-sm tracking-wide transition-all group active:scale-98"
            >
              <Home className="w-4 h-4 text-[#cea355] drop-shadow-[0_0_6px_rgba(206,163,85,0.8)] group-hover:scale-110 transition-transform" />
              <span className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">Home</span>
            </Link>

            <Link
              href="/services"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white hover:text-[#edce8b] hover:bg-[#cea355]/20 font-bold text-sm tracking-wide transition-all group active:scale-98"
            >
              <Car className="w-4 h-4 text-[#cea355] drop-shadow-[0_0_6px_rgba(206,163,85,0.8)] group-hover:scale-110 transition-transform" />
              <span className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">Services</span>
            </Link>

            <Link
              href="/plans"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white hover:text-[#edce8b] hover:bg-[#cea355]/20 font-bold text-sm tracking-wide transition-all group active:scale-98"
            >
              <Layers className="w-4 h-4 text-[#cea355] drop-shadow-[0_0_6px_rgba(206,163,85,0.8)] group-hover:scale-110 transition-transform" />
              <span className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">Plans</span>
            </Link>

            <Link
              href="/faq"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white hover:text-[#edce8b] hover:bg-[#cea355]/20 font-bold text-sm tracking-wide transition-all group active:scale-98"
            >
              <HelpCircle className="w-4 h-4 text-[#cea355] drop-shadow-[0_0_6px_rgba(206,163,85,0.8)] group-hover:scale-110 transition-transform" />
              <span className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">FAQ</span>
            </Link>

            {user && (
              <div className="pt-2 mt-1 border-t border-neutral-800 space-y-1">
                <Link
                  href={getDashboardLink()}
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl gold-gradient text-white font-extrabold text-xs shadow-md"
                >
                  <span className="text-white">Dashboard ({user.fullName.split(' ')[0]})</span>
                </Link>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="w-full text-center py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-semibold text-xs"
                  >
                    Logout
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Mobile Backdrop Overlay (Closes menu on clicking anywhere outside) */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-xs md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}
      </header>
    </>
  );
}
