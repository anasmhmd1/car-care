'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Award,
  Calendar,
  Car,
  Layers,
  LogOut,
  MapPin,
  Menu,
  Sparkles,
  Star,
  User,
  X,
} from 'lucide-react';
import BareeqLogo from '@/components/BareeqLogo';
import { logoutAction } from '@/app/actions/auth';

interface AccountNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  exact?: boolean;
}

const CUSTOMER_NAV_ITEMS: AccountNavItem[] = [
  { href: '/account', label: 'الرئيسية', icon: Sparkles, exact: true },
  { href: '/services', label: 'الخدمات', icon: Layers },
  { href: '/account/subscriptions', label: 'اشتراكاتي', icon: Award },
  { href: '/account/bookings', label: 'حجوزاتي', icon: Calendar },
  { href: '/account/vehicles', label: 'سياراتي', icon: Car },
  { href: '/account/addresses', label: 'عناويني', icon: MapPin },
  { href: '/account/reviews', label: 'التقييمات', icon: Star },
  { href: '/account/profile', label: 'الملف والأمان', icon: User },
];

const STAFF_NAV_ITEMS: AccountNavItem[] = [
  { href: '/account/profile', label: 'الملف والأمان', icon: User },
];

interface AccountMobileNavProps {
  user: {
    fullName: string;
    phone: string;
    role: string;
  };
  isCustomer: boolean;
}

export default function AccountMobileNav({ user, isCustomer }: AccountMobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const items = isCustomer ? CUSTOMER_NAV_ITEMS : STAFF_NAV_ITEMS;

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      {/* Sleek Mobile Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[#c9a227]/20 bg-[#0c0c0c]/95 px-4 py-3 shadow-lg backdrop-blur-md lg:hidden">
        <Link href="/account" className="inline-flex rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5c45a]" aria-label="الرئيسية">
          <BareeqLogo size="sm" showText />
        </Link>

        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#c9a227]/40 bg-[#c9a227]/10 px-3 py-2 text-xs font-bold text-[#e5c45a] transition hover:bg-[#c9a227]/20 focus:outline-none focus:ring-2 focus:ring-[#e5c45a]"
          aria-label="فتح قائمة الحساب"
        >
          <Menu className="size-4" aria-hidden="true" />
          <span>القائمة</span>
        </button>
      </header>

      {/* Slide-over Mobile Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div
            className="fixed inset-y-0 right-0 z-50 flex w-[85%] max-w-xs flex-col justify-between border-l border-[#c9a227]/30 bg-[#121212] p-5 shadow-2xl transition-transform duration-300"
            dir="rtl"
          >
            <div>
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <BareeqLogo size="sm" showText />
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#e5c45a]"
                  aria-label="إغلاق القائمة"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>

              {/* Customer Info */}
              <div className="mt-4 rounded-2xl border border-neutral-800 bg-[#080808] p-3.5">
                <p className="text-[10px] font-bold text-[#e5c45a]">{isCustomer ? 'حساب العميل' : 'إعدادات الحساب'}</p>
                <p className="mt-0.5 truncate text-sm font-black text-white">{user.fullName}</p>
                <p className="mt-0.5 truncate text-[11px] text-neutral-500 font-mono">{user.phone}</p>
              </div>

              {/* Nav Links */}
              <nav className="mt-4 flex flex-col gap-1.5" aria-label="صفحات الحساب">
                {items.map(({ href, label, icon: Icon, exact }) => {
                  const isActive = exact
                    ? pathname === href
                    : pathname === href || (href !== '/account' && href !== '/' && pathname.startsWith(href));

                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setIsOpen(false)}
                      className={`inline-flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-xs font-bold transition-all ${
                        isActive
                          ? 'border border-[#cea355] bg-[#cea355]/15 text-[#edce8b] shadow-sm shadow-[#cea355]/10 font-black ring-1 ring-[#cea355]/30'
                          : 'border border-transparent text-neutral-400 hover:border-neutral-800 hover:bg-white/[0.04] hover:text-white'
                      }`}
                    >
                      <Icon
                        className={`size-4 shrink-0 transition-colors ${
                          isActive ? 'text-[#edce8b]' : 'text-[#c9a227]'
                        }`}
                        aria-hidden="true"
                      />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Bottom Actions */}
            <div className="mt-6 space-y-2 border-t border-neutral-800 pt-4">
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 text-xs font-bold text-red-300 transition hover:bg-red-500/15 focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  تسجيل الخروج
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
