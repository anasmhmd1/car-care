import Link from 'next/link';
import { UserRole } from '@prisma/client';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { getAccessibleBranchIds } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { expireActiveSubscriptions } from '@/lib/engine/subscription-expiration';
import { redirect } from 'next/navigation';
import SubscriptionManagementPanel from './SubscriptionManagementPanel';
import SubscriptionPlanManager from './SubscriptionPlanManager';

export const metadata = {
  title: 'خطط واشتراكات العملاء | بريق',
};

export default async function AdminSubscriptionsPage() {
  const actor = await requireRole([
    UserRole.OPERATIONS_MANAGER,
    UserRole.OWNER,
    UserRole.SYSTEM_SUPER_ADMIN,
  ]);
  const canManagePlans = actor.role !== UserRole.OPERATIONS_MANAGER;
  const accessibleBranchIds = await getAccessibleBranchIds(actor);
  const allowedBranchIds = accessibleBranchIds === null
    ? null
    : (await Promise.all(accessibleBranchIds.map(async (branchId) => ({
        branchId,
        allowed: await hasPermission(actor, 'subscription.manage', { type: 'BRANCH', id: branchId }),
      })))).filter(({ allowed }) => allowed).map(({ branchId }) => branchId);
  if (
    (allowedBranchIds === null && !(await hasPermission(actor, 'subscription.manage'))) ||
    (allowedBranchIds !== null && allowedBranchIds.length === 0)
  ) redirect(actor.role === UserRole.OPERATIONS_MANAGER ? '/operations' : '/admin');

  await expireActiveSubscriptions({ branchIds: allowedBranchIds });

  const [subscriptions, plans, services, branches] = await Promise.all([
    db.customerSubscription.findMany({
      where: allowedBranchIds === null ? {} : { branchId: { in: allowedBranchIds } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        purchasePrice: true,
        totalVisits: true,
        usedVisits: true,
        remainingVisits: true,
        endDate: true,
        customer: {
          select: {
            user: { select: { fullName: true, phone: true } },
          },
        },
        plan: {
          select: {
            nameAr: true,
            price: true,
            freezeAllowed: true,
            maxFreezeDays: true,
          },
        },
        branch: { select: { nameAr: true } },
        serviceBalances: {
          select: {
            serviceId: true,
            totalVisits: true,
            remainingVisits: true,
            service: { select: { nameAr: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        paymentProofs: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            id: true,
            proofFileUrl: true,
            amountSubmitted: true,
            referenceNumber: true,
            status: true,
            reviewNotes: true,
            createdAt: true,
            paymentMethod: { select: { name: true } },
          },
        },
      },
    }),
    db.subscriptionPlan.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        nameAr: true,
        descriptionAr: true,
        price: true,
        validityDays: true,
        visitCount: true,
        allowedVehicleCount: true,
        freezeAllowed: true,
        maxFreezeDays: true,
        rules: true,
        active: true,
        services: { select: { serviceId: true, visitQuota: true } },
        branches: { select: { branchId: true } },
        _count: { select: { subscriptions: true } },
      },
    }),
    db.service.findMany({
      orderBy: [{ subscriptionEligible: 'desc' }, { active: 'desc' }, { nameAr: 'asc' }],
      select: { id: true, nameAr: true, active: true, subscriptionEligible: true },
    }),
    db.branch.findMany({
      where: allowedBranchIds === null ? {} : { id: { in: allowedBranchIds } },
      orderBy: [{ status: 'asc' }, { nameAr: 'asc' }],
      select: { id: true, nameAr: true, status: true },
    }),
  ]);

  const serializedPlans = plans.map((plan) => ({
    id: plan.id,
    nameAr: plan.nameAr,
    descriptionAr: plan.descriptionAr,
    price: plan.price,
    validityDays: plan.validityDays,
    visitCount: plan.visitCount,
    allowedVehicleCount: plan.allowedVehicleCount,
    freezeAllowed: plan.freezeAllowed,
    maxFreezeDays: plan.maxFreezeDays,
    rules: plan.rules === null ? '{}' : JSON.stringify(plan.rules, null, 2),
    active: plan.active,
    serviceIds: plan.services.map(({ serviceId }) => serviceId),
    serviceQuotas: plan.services.reduce<Record<string, number | null>>((quotas, service) => {
      quotas[service.serviceId] = service.visitQuota;
      return quotas;
    }, {}),
    branchIds: plan.branches.map(({ branchId }) => branchId),
    subscriptionCount: plan._count.subscriptions,
  }));

  return (
    <main className="min-h-screen bg-[#080808] px-4 py-10 text-white sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-10">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold text-[#d4af37]">
              <ShieldCheck className="size-4" aria-hidden="true" />
              إدارة موثقة لكتالوج الاشتراكات ورصيد العملاء
            </p>
            <h1 className="mt-2 text-3xl font-black">خطط الاشتراك ودورة حياة العميل</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-white/50">
              أنشئ عروض الاشتراك واربطها بالخدمات والفروع، ثم راجع التفعيل والتجميد والتمديد وحركة الزيارات من مساحة تشغيل واحدة.
            </p>
          </div>
          <Link href={actor.role === UserRole.OPERATIONS_MANAGER ? '/operations' : '/admin'} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-bold hover:border-[#d4af37]/40 focus:outline-none focus:ring-2 focus:ring-[#d4af37]">
            <ArrowRight className="size-4" aria-hidden="true" />
            العودة للوحة التشغيل
          </Link>
        </header>

        {canManagePlans ? (
          <SubscriptionPlanManager
            plans={serializedPlans}
            services={services}
            branches={branches}
          />
        ) : null}

        <section aria-labelledby="customer-subscriptions-heading" className="space-y-5 border-t border-white/10 pt-9">
          <div>
            <p className="text-[11px] font-black tracking-[0.14em] text-[#d4af37]">التنفيذ التشغيلي</p>
            <h2 id="customer-subscriptions-heading" className="mt-2 text-2xl font-black text-white">اشتراكات العملاء</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-white/45">
              كل تفعيل أو تجميد أو تمديد أو تعديل رصيد يُنفذ داخل معاملة واحدة، مع سبب وسجل تدقيق وحركة رصيد قابلة للتتبع.
            </p>
          </div>

          <SubscriptionManagementPanel
            subscriptions={subscriptions.map((subscription) => ({
              id: subscription.id,
              customerName: subscription.customer.user.fullName,
              customerPhone: subscription.customer.user.phone,
              planName: subscription.plan.nameAr,
              expectedPrice: subscription.purchasePrice,
              branchName: subscription.branch.nameAr,
              status: subscription.status,
              totalVisits: subscription.totalVisits,
              usedVisits: subscription.usedVisits,
              remainingVisits: subscription.remainingVisits,
              endDate: subscription.endDate.toISOString(),
              freezeAllowed: subscription.plan.freezeAllowed,
              maxFreezeDays: subscription.plan.maxFreezeDays,
              serviceBalances: subscription.serviceBalances.map((balance) => ({
                serviceId: balance.serviceId,
                nameAr: balance.service.nameAr,
                totalVisits: balance.totalVisits,
                remainingVisits: balance.remainingVisits,
              })),
              paymentProof: subscription.paymentProofs[0] ? {
                ...subscription.paymentProofs[0],
                createdAt: subscription.paymentProofs[0].createdAt.toISOString(),
              } : null,
            }))}
          />
        </section>
      </div>
    </main>
  );
}
