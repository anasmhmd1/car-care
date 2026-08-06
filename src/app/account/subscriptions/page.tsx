import { randomUUID } from 'crypto';
import Link from 'next/link';
import { SubscriptionStatus, UserRole } from '@prisma/client';
import { ArrowLeft, Award, CalendarDays, MapPin, Sparkles } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { expireActiveSubscriptions } from '@/lib/engine/subscription-expiration';
import { getEffectiveSubscriptionStatus } from '@/lib/engine/subscription';
import SubscriptionPurchaseForm from './SubscriptionPurchaseForm';

export const metadata = {
  title: 'اشتراكاتي | بريق للعناية بالسيارات',
};

const STATUS_PRESENTATION: Record<SubscriptionStatus, { label: string; className: string }> = {
  PENDING_PAYMENT: {
    label: 'بانتظار مراجعة الدفع',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  },
  ACTIVE: {
    label: 'نشط',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
  FROZEN: {
    label: 'مجمد مؤقتًا',
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  },
  EXPIRED: {
    label: 'منتهي الصلاحية',
    className: 'border-neutral-700 bg-neutral-800 text-neutral-400',
  },
  CANCELLED: {
    label: 'ملغي',
    className: 'border-red-500/30 bg-red-500/10 text-red-300',
  },
  COMPLETED: {
    label: 'اكتملت الزيارات',
    className: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  },
};

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const user = await requireRole([UserRole.CUSTOMER]);
  await expireActiveSubscriptions();
  const [customer, plans, query] = await Promise.all([
    db.customerProfile.findUnique({
      where: { userId: user.id },
      select: {
        vehicles: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          select: { id: true, make: true, model: true, plateNumber: true },
        },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          include: {
            plan: {
              select: {
                nameAr: true,
                descriptionAr: true,
                price: true,
              },
            },
            branch: { select: { nameAr: true } },
          },
        },
      },
    }),
    db.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: { price: 'asc' },
      select: {
        id: true,
        nameAr: true,
        descriptionAr: true,
        price: true,
        validityDays: true,
        visitCount: true,
        allowedVehicleCount: true,
        services: {
          select: {
            visitQuota: true,
            service: { select: { nameAr: true } },
          },
        },
      },
    }),
    searchParams,
  ]);

  if (!customer) return null;

  const planOptions = plans.map((plan) => ({
    id: plan.id,
    nameAr: plan.nameAr,
    descriptionAr: plan.descriptionAr,
    price: plan.price,
    validityDays: plan.validityDays,
    visitCount: plan.visitCount,
    allowedVehicleCount: plan.allowedVehicleCount,
    serviceQuotas: plan.services.map(({ service, visitQuota }) => ({
      nameAr: service.nameAr,
      visitQuota,
    })),
  }));
  const vehicleOptions = customer.vehicles.map((vehicle) => ({
    id: vehicle.id,
    label: `${vehicle.make} ${vehicle.model}${vehicle.plateNumber ? ` · ${vehicle.plateNumber}` : ''}`,
  }));

  return (
    <div className="space-y-10 pb-12" dir="rtl">
      <header className="flex flex-col gap-5 border-b border-neutral-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold text-[#e5c45a]">
            <Award className="size-4" aria-hidden="true" />
            رصيد العناية الدوري
          </p>
          <h1 className="mt-2 text-3xl font-black text-white">اشتراكاتي وزياراتي</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-neutral-400">
            تابع حالة كل باقة، الزيارات المتبقية، والسيارات المرتبطة. الحجز يحجز الزيارة مؤقتًا، ولا يخصمها إلا بعد اكتمال الخدمة.
          </p>
        </div>
        <Link
          href="/plans"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#c9a227]/35 bg-[#c9a227]/10 px-4 text-xs font-bold text-[#e5c45a] transition hover:bg-[#c9a227]/15 focus:outline-none focus:ring-2 focus:ring-[#e5c45a]"
        >
          مقارنة كل الباقات
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      </header>

      <SubscriptionPurchaseForm
        plans={planOptions}
        vehicles={vehicleOptions}
        initialPlanId={query.plan}
        idempotencyKey={randomUUID()}
      />

      <section className="space-y-4" aria-labelledby="current-subscriptions-title">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold tracking-[0.16em] text-neutral-500">السجل الحالي</p>
            <h2 id="current-subscriptions-title" className="mt-1 text-xl font-black text-white">
              طلباتك واشتراكاتك ({customer.subscriptions.length})
            </h2>
          </div>
        </div>

        {customer.subscriptions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-neutral-700 bg-[#111] p-10 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full border border-[#c9a227]/30 bg-[#c9a227]/10 text-[#e5c45a]">
              <Sparkles className="size-6" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-bold text-white">لا يوجد طلب اشتراك بعد</h3>
            <p className="mt-2 text-sm text-neutral-500">اختر الباقة والسيارات من النموذج أعلاه، وسيظهر الطلب هنا فورًا.</p>
          </div>
        ) : (
          <div className="grid gap-5">
            {customer.subscriptions.map((subscription) => {
              const status = getEffectiveSubscriptionStatus(subscription);
              const statusPresentation = STATUS_PRESENTATION[status];
              const progress = subscription.totalVisits > 0
                ? Math.min(100, Math.round((subscription.usedVisits / subscription.totalVisits) * 100))
                : 0;

              return (
                <article
                  key={subscription.id}
                  className="group rounded-3xl border border-neutral-800 bg-[#121212] p-5 transition hover:border-[#c9a227]/35 sm:p-6"
                >
                  <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${statusPresentation.className}`}>
                          {statusPresentation.label}
                        </span>
                        <span className="text-[10px] text-neutral-600">#{subscription.id.slice(0, 8).toUpperCase()}</span>
                      </div>
                      <h3 className="mt-3 text-xl font-black text-[#f0d36d]">{subscription.plan.nameAr}</h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-6 text-neutral-500">{subscription.plan.descriptionAr}</p>

                      <div className="mt-5 max-w-xl">
                        <div className="mb-2 flex items-center justify-between text-xs">
                          <span className="font-bold text-neutral-300">المتبقي {subscription.remainingVisits} من {subscription.totalVisits}</span>
                          <span className="text-neutral-500">اُستخدمت {subscription.usedVisits} زيارة</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-black ring-1 ring-neutral-800" aria-label={`نسبة الزيارات المستخدمة ${progress}%`}>
                          <div className="h-full rounded-full gold-gradient" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="grid min-w-52 gap-3 border-t border-neutral-800 pt-5 text-xs md:border-r md:border-t-0 md:pr-6 md:pt-0">
                      <p className="flex items-center gap-2 text-neutral-400">
                        <MapPin className="size-4 text-[#c9a227]" aria-hidden="true" />
                        {subscription.branch.nameAr}
                      </p>
                      <p className="flex items-center gap-2 text-neutral-400">
                        <CalendarDays className="size-4 text-[#c9a227]" aria-hidden="true" />
                        حتى {subscription.endDate.toLocaleDateString('ar-EG')}
                      </p>
                      <Link
                        href={`/account/subscriptions/${subscription.id}`}
                        className="mt-1 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-[#080808] px-4 font-bold text-white transition hover:border-[#c9a227] focus:outline-none focus:ring-2 focus:ring-[#e5c45a]"
                      >
                        التفاصيل وسجل الزيارات
                        <ArrowLeft className="size-3.5 text-[#c9a227]" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
