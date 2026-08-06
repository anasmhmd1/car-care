import Link from 'next/link';
import { UserRole } from '@prisma/client';
import {
  Award,
  Calendar,
  Car,
  ChevronLeft,
  Clock,
  Coins,
  MapPin,
  Sparkles,
  User,
} from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getCustomerFacingStatusLabel } from '@/lib/engine/state-machine';
import { expireActiveSubscriptions } from '@/lib/engine/subscription-expiration';

export const metadata = {
  title: 'لوحة حسابي | بريق للعناية بالسيارات',
  description: 'إدارة حجوزاتك وسياراتك وعناوينك واشتراكاتك ورصيدك في بريق.',
};

const TERMINAL_STATUSES = ['CLOSED', 'CANCELLED', 'REJECTED', 'EXPIRED'] as const;

export default async function AccountPage() {
  const user = await requireRole([UserRole.CUSTOMER]);
  await expireActiveSubscriptions();
  const customer = await db.customerProfile.findUnique({
    where: { userId: user.id },
    select: {
      creditBalance: true,
      _count: {
        select: {
          bookings: true,
          vehicles: true,
          addresses: true,
          subscriptions: true,
        },
      },
      bookings: {
        where: {
          bookingStatus: { notIn: [...TERMINAL_STATUSES] },
          terminalReopenSourceStatus: null,
        },
        take: 1,
        orderBy: { startAt: 'asc' },
        include: { service: { select: { nameAr: true } } },
      },
      subscriptions: {
        where: { status: 'ACTIVE' },
        select: { remainingVisits: true },
      },
      creditTransactions: {
        take: 3,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          balanceAfter: true,
          reason: true,
          createdAt: true,
        },
      },
    },
  });

  const nextBooking = customer?.bookings[0];
  const remainingVisits = customer?.subscriptions.reduce(
    (total, subscription) => total + subscription.remainingVisits,
    0
  ) ?? 0;

  const cards = [
    {
      href: '/account/bookings',
      label: `حجوزاتي (${customer?._count.bookings ?? 0})`,
      description: 'تابع الحجوزات الحالية والسابقة، الدفع، الصور، وطلبات التعديل.',
      icon: Calendar,
    },
    {
      href: '/account/vehicles',
      label: `سياراتي (${customer?._count.vehicles ?? 0})`,
      description: 'احفظ بيانات السيارات لتسريع الحجز وربطها بالاشتراكات.',
      icon: Car,
    },
    {
      href: '/account/addresses',
      label: `عناويني (${customer?._count.addresses ?? 0})`,
      description: 'أدر مواقع تنفيذ الخدمة وبيانات دخول الكمبوند.',
      icon: MapPin,
    },
    {
      href: '/account/subscriptions',
      label: `اشتراكاتي (${customer?._count.subscriptions ?? 0})`,
      description: `${remainingVisits} زيارة متبقية في الاشتراكات النشطة.`,
      icon: Award,
    },
    {
      href: '/account/profile',
      label: 'الملف الشخصي والأمان',
      description: 'حدّث بيانات الاتصال وكلمة المرور بصورة آمنة.',
      icon: User,
    },
  ];

  return (
    <div className="space-y-8 pb-12" dir="rtl">
      <header className="rounded-3xl border border-[#c9a227]/30 bg-[#14130f] p-6 shadow-2xl sm:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#c9a227]/30 bg-[#c9a227]/10 px-3 py-1 text-xs font-bold text-[#e5c45a]">
              <Sparkles className="size-3.5" aria-hidden="true" />
              حساب عميل بريق
            </p>
            <h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">أهلًا، {user.fullName}</h1>
            <p className="mt-2 text-xs text-neutral-400">{user.phone}{user.whatsapp ? ` · واتساب ${user.whatsapp}` : ''}</p>
          </div>
          <Link
            href="/services"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl gold-gradient px-6 text-sm font-black text-[#080808] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#e5c45a]"
          >
            <Calendar className="size-4" aria-hidden="true" />
            حجز خدمة جديدة
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="ملخص الحساب">
        <div className="rounded-2xl border border-neutral-800 bg-[#121212] p-5">
          <p className="text-xs font-bold text-neutral-500">رصيد التعويضات</p>
          <p className="mt-2 text-2xl font-black text-[#f0d36d]">{customer?.creditBalance ?? 0} ج.م</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-[#121212] p-5">
          <p className="text-xs font-bold text-neutral-500">الزيارات المتبقية</p>
          <p className="mt-2 text-2xl font-black text-white">{remainingVisits}</p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-[#121212] p-5">
          <p className="text-xs font-bold text-neutral-500">الحجوزات النشطة</p>
          <p className="mt-2 text-2xl font-black text-white">{nextBooking ? 'يوجد حجز قادم' : 'لا يوجد'}</p>
        </div>
      </section>

      {nextBooking ? (
        <section className="rounded-3xl border border-[#c9a227]/35 bg-[#121212] p-6" aria-labelledby="next-booking-title">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold text-[#e5c45a]">
                <Clock className="size-4" aria-hidden="true" />
                حجزك القادم · {nextBooking.bookingNumber}
              </p>
              <h2 id="next-booking-title" className="mt-2 text-lg font-black text-white">{nextBooking.service.nameAr}</h2>
              <p className="mt-2 text-xs text-neutral-400">
                {nextBooking.startAt.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
                {' · '}{getCustomerFacingStatusLabel(nextBooking.bookingStatus)}
              </p>
            </div>
            <Link href={`/account/bookings/${nextBooking.id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#c9a227]/35 px-4 text-xs font-bold text-[#e5c45a] focus:outline-none focus:ring-2 focus:ring-[#e5c45a]">
              متابعة التفاصيل
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2" aria-label="روابط إدارة الحساب">
        {cards.map(({ href, label, description, icon: Icon }) => (
          <Link key={href} href={href} className="group rounded-2xl border border-neutral-800 bg-[#121212] p-5 transition hover:border-[#c9a227]/45 focus:outline-none focus:ring-2 focus:ring-[#e5c45a]">
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-black text-[#c9a227]">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <ChevronLeft className="size-5 text-neutral-600 transition group-hover:text-[#e5c45a]" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-base font-black text-white">{label}</h2>
            <p className="mt-2 text-xs leading-6 text-neutral-500">{description}</p>
          </Link>
        ))}
      </section>

      {customer?.creditTransactions.length ? (
        <section className="rounded-3xl border border-neutral-800 bg-[#121212] p-6" aria-labelledby="credit-ledger-title">
          <h2 id="credit-ledger-title" className="flex items-center gap-2 text-base font-black text-white">
            <Coins className="size-5 text-[#c9a227]" aria-hidden="true" />
            آخر حركات رصيد التعويضات
          </h2>
          <div className="mt-4 divide-y divide-neutral-800">
            {customer.creditTransactions.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-4 py-3 text-xs">
                <div>
                  <p className="font-bold text-neutral-200">{entry.reason}</p>
                  <p className="mt-1 text-neutral-600">{entry.createdAt.toLocaleString('ar-EG')}</p>
                </div>
                <p className={`text-left font-black ${entry.amount >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>{entry.amount >= 0 ? '+' : ''}{entry.amount} ج.م<br /><span className="text-[10px] font-medium text-neutral-500">الرصيد {entry.balanceAfter}</span></p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
