import Link from 'next/link';
import { UserRole } from '@prisma/client';
import {
  Award,
  Calendar,
  Car,
  FileText,
  Home,
  LogOut,
  MapPin,
  MessageCircle,
  Sparkles,
  User,
} from 'lucide-react';
import BareeqLogo from '@/components/BareeqLogo';
import { requireAuth } from '@/lib/auth/session';
import { logoutAction } from '@/app/actions/auth';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth({ allowPasswordChangeRequired: true });
  const isCustomer = user.role === UserRole.CUSTOMER;
  const navItems = isCustomer
    ? [
        { href: '/account', label: 'الرئيسية', icon: Sparkles },
        { href: '/account/bookings', label: 'حجوزاتي', icon: Calendar },
        { href: '/account/vehicles', label: 'سياراتي', icon: Car },
        { href: '/account/addresses', label: 'عناويني', icon: MapPin },
        { href: '/account/subscriptions', label: 'اشتراكاتي', icon: Award },
        { href: '/account/invoices', label: 'فواتيري', icon: FileText },
        { href: '/account/support', label: 'الدعم', icon: MessageCircle },
        { href: '/account/profile', label: 'الملف والأمان', icon: User },
      ]
    : [{ href: '/account/profile', label: 'الملف والأمان', icon: User }];

  return (
    <div className="min-h-screen bg-[#080808] text-white" dir="rtl">
      <div className="mx-auto grid w-full max-w-7xl gap-7 px-4 py-6 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-8 lg:py-10">
        <aside className="rounded-3xl border border-[#c9a227]/25 bg-[#121212] p-4 lg:sticky lg:top-6 lg:self-start lg:p-5">
          <div className="flex items-center justify-between gap-4 lg:block">
            <Link href="/" className="inline-flex rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5c45a]" aria-label="العودة إلى موقع بريق">
              <BareeqLogo size="sm" showText />
            </Link>
            <Link href="/" className="inline-flex size-10 items-center justify-center rounded-xl border border-neutral-800 text-neutral-400 hover:text-white lg:hidden" aria-label="الموقع العام">
              <Home className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-4 border-t border-neutral-800 pt-4">
            <p className="text-[10px] font-bold text-[#e5c45a]">{isCustomer ? 'حساب العميل' : 'إعدادات الحساب'}</p>
            <p className="mt-1 truncate text-sm font-black">{user.fullName}</p>
            <p className="mt-1 truncate text-[11px] text-neutral-500">{user.phone}</p>
          </div>

          <nav className="mt-4 flex gap-2 overflow-x-auto border-t border-neutral-800 pt-4 lg:flex-col" aria-label="صفحات الحساب">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-bold text-neutral-300 transition hover:bg-white/[0.05] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#e5c45a]">
                <Icon className="size-4 text-[#c9a227]" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>

          <form action={logoutAction} className="mt-4 border-t border-neutral-800 pt-4">
            <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 text-xs font-bold text-red-300 transition hover:bg-red-500/15 focus:outline-none focus:ring-2 focus:ring-red-400">
              <LogOut className="size-4" aria-hidden="true" />
              تسجيل الخروج
            </button>
          </form>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
