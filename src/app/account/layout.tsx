import Link from 'next/link';
import { UserRole } from '@prisma/client';
import { LogOut } from 'lucide-react';
import BareeqLogo from '@/components/BareeqLogo';
import { requireAuth } from '@/lib/auth/session';
import { logoutAction } from '@/app/actions/auth';
import AccountSidebarNav from './AccountSidebarNav';
import AccountMobileNav from './AccountMobileNav';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth({ allowPasswordChangeRequired: true });
  const isCustomer = user.role === UserRole.CUSTOMER;

  return (
    <div className="min-h-screen bg-[#080808] text-white" dir="rtl">
      {/* Sleek Mobile Header with Slide-over Drawer for small screens */}
      <AccountMobileNav
        user={{
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
        }}
        isCustomer={isCustomer}
      />

      <div className="mx-auto grid w-full max-w-7xl gap-7 px-4 py-5 sm:px-6 lg:grid-cols-[270px_minmax(0,1fr)] lg:px-8 lg:py-10">
        {/* Desktop Sticky Sidebar (Hidden on mobile) */}
        <aside className="hidden lg:block rounded-3xl border border-[#c9a227]/25 bg-[#121212] p-5 lg:sticky lg:top-6 lg:self-start">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e5c45a]" aria-label="العودة إلى موقع بريق">
              <BareeqLogo size="sm" showText />
            </Link>
          </div>

          <div className="mt-4 border-t border-neutral-800 pt-4">
            <p className="text-[10px] font-bold text-[#e5c45a]">{isCustomer ? 'حساب العميل' : 'إعدادات الحساب'}</p>
            <p className="mt-1 truncate text-sm font-black">{user.fullName}</p>
            <p className="mt-1 truncate text-[11px] text-neutral-500 font-mono">{user.phone}</p>
          </div>

          <AccountSidebarNav isCustomer={isCustomer} />

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
