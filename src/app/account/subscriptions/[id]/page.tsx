import Link from 'next/link';
import {
  SubscriptionPaymentProofStatus,
  SubscriptionStatus,
  UserRole,
  VisitLedgerAction,
} from '@prisma/client';
import { notFound } from 'next/navigation';
import {
  ArrowRight,
  Award,
  CalendarDays,
  Car,
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { expireActiveSubscriptions } from '@/lib/engine/subscription-expiration';
import { getEffectiveSubscriptionStatus } from '@/lib/engine/subscription';
import SubscriptionPaymentProofForm from './SubscriptionPaymentProofForm';

export const metadata = {
  title: 'تفاصيل الاشتراك | بريق للعناية بالسيارات',
};

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  PENDING_PAYMENT: 'بانتظار مراجعة الدفع اليدوي',
  ACTIVE: 'نشط',
  FROZEN: 'مجمد مؤقتًا',
  EXPIRED: 'منتهي الصلاحية',
  CANCELLED: 'ملغي',
  COMPLETED: 'اكتملت الزيارات',
};

const LEDGER_LABELS: Record<VisitLedgerAction, string> = {
  PURCHASE: 'إنشاء رصيد الباقة',
  BOOKING_RESERVED: 'حجز زيارة لموعد',
  BOOKING_COMPLETED: 'خصم زيارة بعد اكتمال الخدمة',
  BOOKING_CANCELLED_RESTORED: 'تحرير أو استعادة زيارة',
  MANUAL_ADJUSTMENT: 'تعديل موثق على الاشتراك',
};

const PAYMENT_PROOF_LABELS: Record<SubscriptionPaymentProofStatus, string> = {
  UNDER_REVIEW: 'قيد المراجعة',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  AMOUNT_MISMATCH: 'المبلغ غير مطابق',
  REUPLOAD_REQUIRED: 'مطلوب إعادة الرفع',
  DUPLICATE_SUSPECTED: 'اشتباه بتكرار الإثبات',
};

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole([UserRole.CUSTOMER]);
  await expireActiveSubscriptions();
  const { id } = await params;
  const customer = await db.customerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!customer) notFound();

  const subscription = await db.customerSubscription.findFirst({
    where: { id, customerId: customer.id },
    include: {
      branch: {
        select: {
          nameAr: true,
          paymentMethods: {
            where: { active: true },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              name: true,
              accountNumber: true,
              accountName: true,
              instructions: true,
            },
          },
        },
      },
      vehicles: {
        include: {
          vehicle: {
            select: { id: true, make: true, model: true, plateNumber: true },
          },
        },
      },
      plan: {
        include: {
          services: {
            include: {
              service: {
                select: {
                  id: true,
                  slug: true,
                  nameAr: true,
                  shortDescriptionAr: true,
                  durationMinutes: true,
                  basePrice: true,
                },
              },
            },
          },
        },
      },
      serviceBalances: {
        select: {
          serviceId: true,
          totalVisits: true,
          usedVisits: true,
          remainingVisits: true,
        },
      },
      visitLedger: {
        orderBy: { createdAt: 'desc' },
        include: {
          booking: { select: { id: true, bookingNumber: true } },
        },
      },
      paymentProofs: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          proofFileUrl: true,
          mimeType: true,
          amountSubmitted: true,
          referenceNumber: true,
          transferTimestamp: true,
          status: true,
          reviewNotes: true,
          reviewedAt: true,
          createdAt: true,
          paymentMethod: { select: { name: true } },
        },
      },
    },
  });
  if (!subscription) notFound();

  const status = getEffectiveSubscriptionStatus(subscription);
  const progress = subscription.totalVisits > 0
    ? Math.min(100, Math.round((subscription.usedVisits / subscription.totalVisits) * 100))
    : 0;
  const latestPaymentProof = subscription.paymentProofs[0];
  const canUploadPaymentProof = status === SubscriptionStatus.PENDING_PAYMENT
    && latestPaymentProof?.status !== SubscriptionPaymentProofStatus.APPROVED;
  const serviceBalanceById = new Map(
    subscription.serviceBalances.map((balance) => [balance.serviceId, balance]),
  );

  return (
    <div className="space-y-8 pb-12" dir="rtl">
      <header className="border-b border-neutral-800 pb-6">
        <Link
          href="/account/subscriptions"
          className="inline-flex items-center gap-2 text-xs font-bold text-[#e5c45a] hover:underline focus:outline-none focus:ring-2 focus:ring-[#e5c45a]"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          العودة إلى الاشتراكات
        </Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold text-neutral-500">
              <Award className="size-4 text-[#c9a227]" aria-hidden="true" />
              #{subscription.id.slice(0, 8).toUpperCase()}
            </p>
            <h1 className="mt-2 text-3xl font-black text-white">{subscription.plan.nameAr}</h1>
          </div>
          <span className="w-fit rounded-full border border-[#c9a227]/35 bg-[#c9a227]/10 px-4 py-2 text-xs font-bold text-[#f0d36d]">
            {STATUS_LABELS[status]}
          </span>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="ملخص الاشتراك">
        <div className="rounded-2xl border border-[#c9a227]/35 bg-[#14130f] p-5 sm:col-span-1">
          <p className="text-[11px] font-bold text-neutral-500">الرصيد المتبقي</p>
          <p className="mt-2 text-4xl font-black text-[#f0d36d]">
            {subscription.remainingVisits}
            <span className="mr-2 text-sm font-medium text-neutral-500">من {subscription.totalVisits}</span>
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-black ring-1 ring-neutral-800">
            <div className="h-full rounded-full gold-gradient" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-[#121212] p-5">
          <p className="flex items-center gap-2 text-[11px] font-bold text-neutral-500">
            <CalendarDays className="size-4 text-[#c9a227]" aria-hidden="true" />
            مدة الباقة
          </p>
          <p className="mt-3 text-sm font-bold text-white">
            {subscription.startDate.toLocaleDateString('ar-EG')} — {subscription.endDate.toLocaleDateString('ar-EG')}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-[#121212] p-5">
          <p className="flex items-center gap-2 text-[11px] font-bold text-neutral-500">
            <MapPin className="size-4 text-[#c9a227]" aria-hidden="true" />
            الفرع
          </p>
          <p className="mt-3 text-sm font-bold text-white">{subscription.branch.nameAr}</p>
        </div>
      </section>

      <section className="rounded-3xl border border-[#c9a227]/25 bg-[#121212] p-6" aria-labelledby="subscription-payment-title">
        <h2 id="subscription-payment-title" className="flex items-center gap-2 text-base font-black text-white">
          <FileText className="size-5 text-[#c9a227]" aria-hidden="true" />
          إثبات دفع الاشتراك
        </h2>
        <p className="mt-2 text-xs leading-6 text-neutral-500">
          المطلوب تحويل {subscription.purchasePrice.toLocaleString('ar-EG')} ج.م بالضبط. لا يبدأ الاشتراك قبل اعتماد أحدث إثبات يدويًا.
        </p>

        {latestPaymentProof ? (
          <div className="mt-5 rounded-2xl border border-neutral-800 bg-[#080808] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-white">{latestPaymentProof.paymentMethod.name}</p>
                <p className="mt-1 text-[11px] text-neutral-500">
                  {latestPaymentProof.amountSubmitted.toLocaleString('ar-EG')} ج.م
                  {latestPaymentProof.referenceNumber ? ` · مرجع ${latestPaymentProof.referenceNumber}` : ''}
                </p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${
                latestPaymentProof.status === SubscriptionPaymentProofStatus.APPROVED
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : latestPaymentProof.status === SubscriptionPaymentProofStatus.UNDER_REVIEW
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : 'border-red-500/30 bg-red-500/10 text-red-300'
              }`}>
                {PAYMENT_PROOF_LABELS[latestPaymentProof.status]}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-neutral-500">
              <Link href={latestPaymentProof.proofFileUrl} target="_blank" rel="noreferrer" className="font-bold text-[#e5c45a] hover:underline">
                فتح الملف الخاص
              </Link>
              <span>{latestPaymentProof.createdAt.toLocaleString('ar-EG')}</span>
            </div>
            {latestPaymentProof.reviewNotes ? (
              <p className="mt-3 rounded-xl border border-neutral-800 px-3 py-2 text-xs leading-6 text-neutral-400">
                ملاحظة المراجع: {latestPaymentProof.reviewNotes}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-dashed border-neutral-700 p-5 text-center text-xs text-neutral-500">
            لم يُرفع إثبات دفع بعد.
          </p>
        )}

        {canUploadPaymentProof ? (
          <div className="mt-6 border-t border-neutral-800 pt-6">
            <SubscriptionPaymentProofForm
              subscriptionId={subscription.id}
              expectedAmount={subscription.purchasePrice}
              methods={subscription.branch.paymentMethods}
            />
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-neutral-800 bg-[#121212] p-6" aria-labelledby="linked-vehicles-title">
        <h2 id="linked-vehicles-title" className="flex items-center gap-2 text-base font-black text-white">
          <Car className="size-5 text-[#c9a227]" aria-hidden="true" />
          السيارات المرتبطة
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {subscription.vehicles.map(({ vehicle }) => (
            <span key={vehicle.id} className="rounded-xl border border-neutral-700 bg-[#080808] px-4 py-2 text-xs text-neutral-300">
              {vehicle.make} {vehicle.model}{vehicle.plateNumber ? ` · ${vehicle.plateNumber}` : ''}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-[#c9a227]/20 bg-[#121212] p-6" aria-labelledby="included-services-title">
        <h2 id="included-services-title" className="flex items-center gap-2 text-base font-black text-[#f0d36d]">
          <Sparkles className="size-5" aria-hidden="true" />
          الخدمات المشمولة
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {subscription.plan.services.map(({ service }) => {
            const serviceBalance = serviceBalanceById.get(service.id);
            const canBookService = status === SubscriptionStatus.ACTIVE
              && (serviceBalance?.remainingVisits ?? subscription.remainingVisits) > 0;
            return (
              <article key={service.id} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4">
                <h3 className="text-sm font-bold text-white">{service.nameAr}</h3>
                <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-neutral-500">{service.shortDescriptionAr}</p>
                {serviceBalance ? (
                  <p className="mt-3 rounded-lg border border-[#c9a227]/20 bg-[#c9a227]/[0.06] px-2.5 py-2 text-[11px] font-bold text-[#f0d36d]">
                    المتبقي لهذه الخدمة: {serviceBalance.remainingVisits} من {serviceBalance.totalVisits}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center justify-between border-t border-neutral-800 pt-3 text-[10px] text-neutral-400">
                  <span className="flex items-center gap-1"><Clock className="size-3.5 text-[#c9a227]" aria-hidden="true" /> {service.durationMinutes} دقيقة</span>
                  {canBookService ? (
                    <Link href={`/services/${service.slug}`} className="font-bold text-[#e5c45a] hover:underline">اختيار موعد</Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-neutral-800 bg-[#121212] p-6" aria-labelledby="visit-ledger-title">
        <h2 id="visit-ledger-title" className="flex items-center gap-2 text-base font-black text-white">
          <CheckCircle2 className="size-5 text-[#c9a227]" aria-hidden="true" />
          سجل الرصيد ({subscription.visitLedger.length})
        </h2>

        {subscription.visitLedger.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed border-neutral-700 p-6 text-center text-xs text-neutral-500">
            لا توجد حركات رصيد مسجلة بعد.
          </p>
        ) : (
          <div className="mt-5 divide-y divide-neutral-800 overflow-hidden rounded-2xl border border-neutral-800">
            {subscription.visitLedger.map((entry) => (
              <article key={entry.id} className="grid gap-3 bg-[#080808] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="text-xs font-bold text-white">{LEDGER_LABELS[entry.action]}</p>
                  <p className="mt-1 text-[11px] leading-5 text-neutral-500">{entry.reason || 'حركة موثقة على الاشتراك'}</p>
                  <p className="mt-1 text-[10px] text-neutral-600">
                    {entry.createdAt.toLocaleString('ar-EG')}
                    {entry.booking ? ` · حجز ${entry.booking.bookingNumber}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-neutral-500">{entry.balanceBefore} ← {entry.remainingAfter}</span>
                  <span className={`min-w-14 rounded-lg border px-2 py-1 text-center font-black ${
                    entry.visitChange < 0
                      ? 'border-red-500/30 bg-red-500/10 text-red-300'
                      : entry.visitChange > 0
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-neutral-700 bg-neutral-900 text-neutral-400'
                  }`}>
                    {entry.visitChange > 0 ? '+' : ''}{entry.visitChange}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
