'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Award,
  Calendar,
  Car,
  Layers,
  MapPin,
  Sparkles,
  Star,
  User,
} from 'lucide-react';

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

export default function AccountSidebarNav({ isCustomer }: { isCustomer: boolean }) {
  const pathname = usePathname();
  const items = isCustomer ? CUSTOMER_NAV_ITEMS : STAFF_NAV_ITEMS;

  return (
    <nav
      className="mt-4 flex gap-1.5 overflow-x-auto pb-1 lg:pb-0 border-t border-neutral-800/80 pt-4 lg:flex-col lg:overflow-visible"
      aria-label="صفحات الحساب"
    >
      {items.map(({ href, label, icon: Icon, exact }) => {
        const isActive = exact
          ? pathname === href
          : pathname === href || (href !== '/account' && href !== '/' && pathname.startsWith(href));

        return (
          <Link
            key={href}
            href={href}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-3.5 text-xs font-bold transition-all ${
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
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
