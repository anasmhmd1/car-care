import { UserRole, BookingStatus } from '@prisma/client';
import { Star, Clock, Car, Sparkles, CheckCircle2 } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import ReviewSubmissionForm from './ReviewSubmissionForm';

export const metadata = {
  title: 'تقييماتي | بريق للعناية بالسيارات',
  description: 'شاركنا تقييمك للخدمات المنفذة، وتظهر تقييماتك المعتمدة على الصفحة الرئيسية.',
};

export default async function CustomerReviewsPage() {
  const user = await requireRole([UserRole.CUSTOMER]);

  const customer = await db.customerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  const completedBookings = customer
    ? await db.booking.findMany({
        where: {
          customerId: customer.id,
          deletedAt: null,
          bookingStatus: {
            in: [
              BookingStatus.SERVICE_COMPLETED,
              BookingStatus.DELIVERED,
              BookingStatus.CLOSED,
            ],
          },
        },
        include: {
          service: { select: { nameAr: true } },
          vehicle: { select: { make: true, model: true } },
          customerRating: true,
        },
        orderBy: { startAt: 'desc' },
      })
    : [];

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Header Info */}
      <div className="rounded-3xl border border-[#c9a227]/30 bg-[#121212] p-5 sm:p-6">
        <div className="flex items-center gap-2 text-xs font-bold text-[#e5c45a]">
          <Sparkles className="size-4" />
          <span>صوت العميل وتجارب الخدمة</span>
        </div>
        <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">تقييماتي</h1>
        <p className="mt-2 text-xs sm:text-sm text-neutral-400 leading-relaxed">
          تقييمك لتجارب الخدمة المكتملة يساعدنا على الحفاظ على أعلى معايير الجودة. بعد إرسال تقييمك ومراجعته من الإدارة، سيتم نشره على الصفحة الرئيسية لموقع بريق.
        </p>
      </div>

      {/* Reviews & Completed Services List */}
      {completedBookings.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-neutral-800 bg-[#141414] p-10 text-center space-y-3">
          <Star className="mx-auto size-12 text-neutral-700" />
          <h2 className="text-base font-bold text-white">لا توجد خدمات مكتملة قابلة للتقييم حتى الآن</h2>
          <p className="text-xs text-neutral-500 max-w-md mx-auto">
            بمجرد إتمام حجزك القادم وتنفيذه بواسطة الفريق، ستتمكن من تقييم الخدمة هنا بنقرة واحدة.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {completedBookings.map((booking) => {
            const hasRating = !!booking.customerRating;
            const isApproved = booking.customerRating?.approvedForPublic ?? false;

            return (
              <article
                key={booking.id}
                className="rounded-3xl border border-neutral-800 bg-[#141414] p-5 sm:p-6 space-y-4 hover:border-neutral-700 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#e5c45a]">
                        {booking.bookingNumber}
                      </span>
                      {hasRating && (
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                            isApproved
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {isApproved ? (
                            <>
                              <CheckCircle2 className="size-3" />
                              <span>منشور على الرئيسية</span>
                            </>
                          ) : (
                            <span>بانتظار موافقة الإدارة للنشر</span>
                          )}
                        </span>
                      )}
                    </div>
                    <h2 className="text-base font-bold text-white mt-1">
                      {booking.service.nameAr}
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5 text-[#c9a227]" />
                      {booking.startAt.toLocaleString('ar-EG', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Car className="size-3.5 text-[#c9a227]" />
                      {booking.vehicle.make} {booking.vehicle.model}
                    </span>
                  </div>
                </div>

                {/* Form to submit or update rating */}
                <ReviewSubmissionForm
                  bookingId={booking.id}
                  serviceName={booking.service.nameAr}
                  initialScore={booking.customerRating?.score ?? 5}
                  initialComment={booking.customerRating?.comment ?? ''}
                  isApproved={isApproved}
                />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
