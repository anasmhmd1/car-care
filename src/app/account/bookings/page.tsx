import Link from 'next/link';
import { UserRole } from '@prisma/client';
import { Calendar, Car, ChevronLeft, Clock } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getCustomerFacingStatusLabel } from '@/lib/engine/state-machine';

export const metadata = {
  title: 'حجوزاتي | بريق للعناية بالسيارات',
};

export default async function CustomerBookingsPage() {
  const user = await requireRole([UserRole.CUSTOMER]);
  const customer = await db.customerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  const bookings = customer
    ? await db.booking.findMany({
        where: { customerId: customer.id },
        include: {
          service: { select: { nameAr: true } },
          vehicle: { select: { make: true, model: true } },
        },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  return (
    <div className="space-y-8 pb-12" dir="rtl">
      <header className="flex flex-col gap-4 border-b border-neutral-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-white">سجل حجوزاتي</h1>
          <p className="mt-2 text-sm text-neutral-400">تابع الدفع والتنفيذ والصور وطلبات التعديل لكل حجز.</p>
        </div>
        <Link href="/services" className="inline-flex min-h-11 items-center justify-center rounded-xl gold-gradient px-5 text-xs font-black text-[#080808] focus:outline-none focus:ring-2 focus:ring-[#e5c45a]">
          حجز جديد
        </Link>
      </header>

      {bookings.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-neutral-700 bg-[#121212] p-12 text-center">
          <Calendar className="mx-auto size-10 text-neutral-600" aria-hidden="true" />
          <h2 className="mt-4 text-base font-black text-white">لا توجد حجوزات حتى الآن</h2>
          <p className="mt-2 text-xs text-neutral-500">اختر خدمتك الأولى وسيعرض الحجز هنا فورًا.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const customerVisibleStatus = booking.terminalReopenSourceStatus
              ?? booking.bookingStatus;
            return (
            <article key={booking.id} className="rounded-2xl border border-neutral-800 bg-[#121212] p-5 transition hover:border-[#c9a227]/45 sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-[#e5c45a]">{booking.bookingNumber}</span>
                    <span className="rounded-full border border-[#c9a227]/25 bg-[#c9a227]/10 px-2.5 py-1 text-[10px] font-bold text-[#f0d36d]">
                      {getCustomerFacingStatusLabel(customerVisibleStatus)}
                    </span>
                  </div>
                  <h2 className="mt-3 text-base font-black text-white">{booking.service.nameAr}</h2>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-neutral-400">
                    <span className="flex items-center gap-1.5"><Clock className="size-3.5 text-[#c9a227]" aria-hidden="true" />{booking.startAt.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    <span className="flex items-center gap-1.5"><Car className="size-3.5 text-[#c9a227]" aria-hidden="true" />{booking.vehicle.make} {booking.vehicle.model}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-5 border-t border-neutral-800 pt-4 sm:border-0 sm:pt-0">
                  <div>
                    <p className="text-[10px] text-neutral-500">الإجمالي</p>
                    <p className="mt-1 text-sm font-black text-[#e5c45a]">{booking.totalPrice} ج.م</p>
                  </div>
                  <Link href={`/account/bookings/${booking.id}`} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[#c9a227]/30 px-4 text-xs font-bold text-[#e5c45a] focus:outline-none focus:ring-2 focus:ring-[#e5c45a]">
                    التفاصيل <ChevronLeft className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
