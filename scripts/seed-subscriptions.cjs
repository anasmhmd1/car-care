const { PrismaClient, SubscriptionStatus, VisitLedgerAction } = require('@prisma/client');
const prisma = new PrismaClient();

const NOW = new Date();
function daysAgo(days, hours = 10, minutes = 0) {
  const d = new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function main() {
  const existingSub = await prisma.customerSubscription.count();
  if (existingSub > 0) {
    console.log('Subscriptions already exist:', existingSub);
    return;
  }

  const plans = await prisma.subscriptionPlan.findMany({ where: { active: true } });
  const branches = await prisma.branch.findMany({ where: { status: 'ACTIVE' } });
  const customers = await prisma.customerProfile.findMany({
    include: { vehicles: true, user: true }
  });
  const ops = await prisma.user.findFirst({ where: { role: 'OPERATIONS_MANAGER' } });
  const tech = await prisma.user.findFirst({ where: { role: 'EMPLOYEE' } });

  if (plans.length > 0 && customers.length > 0 && branches.length > 0) {
    const plan = plans[0];
    const customer = customers[0];
    const vehicle = customer.vehicles[0];

    const sub = await prisma.customerSubscription.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        branchId: branches[0].id,
        purchasePrice: plan.price,
        startDate: daysAgo(25),
        endDate: daysAgo(-35),
        totalVisits: plan.visitCount,
        usedVisits: 2,
        remainingVisits: plan.visitCount - 2,
        status: SubscriptionStatus.ACTIVE,
        createdAt: daysAgo(25),
      }
    });

    if (vehicle) {
      await prisma.subscriptionVehicle.create({
        data: {
          subscriptionId: sub.id,
          vehicleId: vehicle.id,
        }
      });
    }

    await prisma.subscriptionVisitLedger.createMany({
      data: [
        {
          subscriptionId: sub.id,
          action: VisitLedgerAction.PURCHASE,
          visitChange: plan.visitCount,
          balanceBefore: 0,
          remainingAfter: plan.visitCount,
          reason: 'بدء دورة الاشتراك الشهري للباقة الملكية',
          adjustedByUserId: ops?.id || null,
          createdAt: daysAgo(25),
        },
        {
          subscriptionId: sub.id,
          action: VisitLedgerAction.BOOKING_COMPLETED,
          visitChange: -1,
          balanceBefore: plan.visitCount,
          remainingAfter: plan.visitCount - 1,
          reason: 'استهلاك الزيارة الأولى لغسيل بريق الملكي',
          adjustedByUserId: tech?.id || null,
          createdAt: daysAgo(18),
        },
        {
          subscriptionId: sub.id,
          action: VisitLedgerAction.MANUAL_ADJUSTMENT,
          visitChange: -1,
          balanceBefore: plan.visitCount - 1,
          remainingAfter: plan.visitCount - 2,
          reason: 'استهلاك الزيارة الثانية للتلميع الشامل',
          adjustedByUserId: tech?.id || null,
          createdAt: daysAgo(7),
        },
      ]
    });

    console.log('✅ Created VIP Customer Subscription with 3 visit ledger transactions!');
  }
}

main().finally(() => prisma.$disconnect());
