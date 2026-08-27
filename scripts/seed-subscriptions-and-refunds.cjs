/* eslint-disable @typescript-eslint/no-require-imports */
const {
  PrismaClient,
  SubscriptionStatus,
  SubscriptionPaymentProofStatus,
  RefundStatus,
  VisitLedgerAction,
  PaymentMethodType,
} = require('@prisma/client');
const { randomUUID } = require('node:crypto');
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

const NOW = new Date();
function daysAgo(days, hours = 10, minutes = 0) {
  const d = new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function main() {
  console.log('\n===============================================================');
  console.log('💳 SEEDING SUBSCRIPTION REVENUES & APPROVED REFUNDS FOR 30 DAYS');
  console.log('===============================================================\n');

  const branches = await prisma.branch.findMany({ where: { status: 'ACTIVE' } });
  const branchCairo = branches.find(b => b.nameAr.includes('القاهرة')) || branches[0];
  const branchZayed = branches.find(b => b.nameAr.includes('زايد')) || branches[0];

  const opsManager = await prisma.user.findFirst({ where: { role: 'OPERATIONS_MANAGER' } });
  const leadTech = await prisma.user.findFirst({ where: { role: 'EMPLOYEE' } });

  const paymentMethods = await prisma.branchPaymentMethod.findMany({ where: { active: true } });
  const instapayMethod = paymentMethods.find(p => p.type === PaymentMethodType.INSTAPAY) || paymentMethods[0];
  const vodafoneMethod = paymentMethods.find(p => p.type === PaymentMethodType.WALLET) || paymentMethods[0];
  const bankMethod = paymentMethods.find(p => p.type === PaymentMethodType.BANK_TRANSFER) || paymentMethods[0];

  // --------------------------------------------------------------------------
  // STEP 1: CREATE / ENSURE SUBSCRIPTION PLANS
  // --------------------------------------------------------------------------
  let plans = await prisma.subscriptionPlan.findMany();
  if (plans.length === 0) {
    const plan1 = await prisma.subscriptionPlan.create({
      data: {
        nameAr: 'باقة بريق الملكية الشهرية (4 زيارات VIP)',
        descriptionAr: 'تشمل 4 زيارات شهرية تفصيلية للعناية العميقة والنانو سيراميك للسيارات الفارهة.',
        price: 3200,
        validityDays: 30,
        visitCount: 4,
        allowedVehicleCount: 2,
        active: true,
      },
    });
    const plan2 = await prisma.subscriptionPlan.create({
      data: {
        nameAr: 'باقة بريق الشاملة الشهرية (4 زيارات)',
        descriptionAr: 'تشمل 4 زيارات شهرية للغسيل الشامل بالبخار والتعقيم وإزالة البقع.',
        price: 2400,
        validityDays: 30,
        visitCount: 4,
        allowedVehicleCount: 1,
        active: true,
      },
    });
    const plan3 = await prisma.subscriptionPlan.create({
      data: {
        nameAr: 'باقة بريق الدورية الاقتصادية (4 زيارات)',
        descriptionAr: 'تشمل 4 زيارات أسبوعية للحفاظ على لمعان ونظافة السيارة طوال الشهر.',
        price: 1800,
        validityDays: 30,
        visitCount: 4,
        allowedVehicleCount: 1,
        active: true,
      },
    });
    plans = [plan1, plan2, plan3];
  }

  // Link plans to branches
  for (const plan of plans) {
    for (const branch of [branchCairo, branchZayed]) {
      await prisma.subscriptionPlanBranch.upsert({
        where: { planId_branchId: { planId: plan.id, branchId: branch.id } },
        update: {},
        create: { planId: plan.id, branchId: branch.id },
      });
    }
  }

  // --------------------------------------------------------------------------
  // STEP 2: SEED 3 APPROVED SUBSCRIPTIONS WITH PAYMENT PROOFS
  // --------------------------------------------------------------------------
  console.log('📦 [1/2] Seeding 3 approved subscriptions with proof revenue...');

  const vipCustomers = await prisma.customerProfile.findMany({
    take: 3,
    include: { user: true, vehicles: true },
  });

  const subConfigs = [
    {
      cust: vipCustomers[0],
      plan: plans[0],
      branch: branchCairo,
      method: instapayMethod,
      daysAgo: 22,
      price: plans[0].price || 3200,
      used: 2,
      ref: 'INSTA-SUB-994821',
    },
    {
      cust: vipCustomers[1] || vipCustomers[0],
      plan: plans[1] || plans[0],
      branch: branchCairo,
      method: bankMethod,
      daysAgo: 15,
      price: (plans[1] || plans[0]).price || 2400,
      used: 1,
      ref: 'CIB-SUB-881234',
    },
    {
      cust: vipCustomers[2] || vipCustomers[0],
      plan: plans[2] || plans[0],
      branch: branchZayed,
      method: vodafoneMethod,
      daysAgo: 8,
      price: (plans[2] || plans[0]).price || 1800,
      used: 1,
      ref: 'VOD-SUB-775190',
    },
  ];

  let totalSubRevenue = 0;

  for (const sc of subConfigs) {
    const startDate = daysAgo(sc.daysAgo);
    const endDate = daysAgo(sc.daysAgo - 30);
    const reviewedAt = daysAgo(sc.daysAgo, 11, 30);

    const subscription = await prisma.customerSubscription.create({
      data: {
        customerId: sc.cust.id,
        planId: sc.plan.id,
        branchId: sc.branch.id,
        purchasePrice: sc.price,
        startDate,
        endDate,
        totalVisits: sc.plan.visitCount,
        usedVisits: sc.used,
        remainingVisits: sc.plan.visitCount - sc.used,
        status: SubscriptionStatus.ACTIVE,
        createdAt: startDate,
      },
    });

    if (sc.cust.vehicles.length > 0) {
      await prisma.subscriptionVehicle.create({
        data: {
          subscriptionId: subscription.id,
          vehicleId: sc.cust.vehicles[0].id,
        },
      });
    }

    // Payment Proof
    const proofFileUrl = `/api/files/subscription-proofs/sub-proof-${subscription.id}.jpg`;
    await prisma.subscriptionPaymentProof.create({
      data: {
        subscriptionId: subscription.id,
        paymentMethodId: sc.method.id,
        proofFileUrl,
        mimeType: 'image/jpeg',
        sizeBytes: 195000,
        amountSubmitted: sc.price,
        referenceNumber: sc.ref,
        transferTimestamp: startDate,
        status: SubscriptionPaymentProofStatus.APPROVED,
        uploadedByUserId: sc.cust.user.id,
        reviewedByUserId: opsManager?.id || null,
        reviewedAt,
        reviewNotes: 'تم التحقق من استلام قيمة الباقة الشهرية وتفعيل الاشتراك بنجاح',
        createdAt: startDate,
      },
    });

    // Visit Ledger entries
    await prisma.subscriptionVisitLedger.create({
      data: {
        subscriptionId: subscription.id,
        action: VisitLedgerAction.PURCHASE,
        visitChange: sc.plan.visitCount,
        balanceBefore: 0,
        remainingAfter: sc.plan.visitCount,
        reason: 'تفعيل دورة الاشتراك الشهري للباقة',
        adjustedByUserId: opsManager?.id || null,
        createdAt: startDate,
      },
    });

    if (sc.used >= 1) {
      await prisma.subscriptionVisitLedger.create({
        data: {
          subscriptionId: subscription.id,
          action: VisitLedgerAction.BOOKING_COMPLETED,
          visitChange: -1,
          balanceBefore: sc.plan.visitCount,
          remainingAfter: sc.plan.visitCount - 1,
          reason: 'استهلاك الزيارة الأولى',
          adjustedByUserId: leadTech?.id || null,
          createdAt: daysAgo(sc.daysAgo - 5),
        },
      });
    }

    if (sc.used >= 2) {
      await prisma.subscriptionVisitLedger.create({
        data: {
          subscriptionId: subscription.id,
          action: VisitLedgerAction.BOOKING_COMPLETED,
          visitChange: -1,
          balanceBefore: sc.plan.visitCount - 1,
          remainingAfter: sc.plan.visitCount - 2,
          reason: 'استهلاك الزيارة الثانية',
          adjustedByUserId: leadTech?.id || null,
          createdAt: daysAgo(sc.daysAgo - 12),
        },
      });
    }

    totalSubRevenue += sc.price;
  }

  console.log(`   ✅ Created 3 active approved subscriptions with ${totalSubRevenue.toLocaleString()} EGP revenue.`);

  // --------------------------------------------------------------------------
  // STEP 3: SEED APPROVED REFUNDS FOR CANCELLED BOOKINGS
  // --------------------------------------------------------------------------
  console.log('💸 [2/2] Seeding approved refund records for cancelled bookings...');

  const cancelledBookings = await prisma.booking.findMany({
    where: { bookingStatus: 'CANCELLED' },
    include: { customer: { include: { user: true } }, cancellationRequest: true },
    take: 3,
  });

  const refundAmounts = [350, 250, 400];
  const refundMethods = ['INSTAPAY', 'VODAFONE_CASH', 'BANK_TRANSFER'];
  let totalRefundsAmount = 0;

  for (let i = 0; i < cancelledBookings.length; i++) {
    const cb = cancelledBookings[i];
    const amount = refundAmounts[i] || 300;
    const method = refundMethods[i] || 'INSTAPAY';
    const refundDate = daysAgo(10 - i * 3, 14, 0);

    const existingRefund = await prisma.refund.findFirst({ where: { bookingId: cb.id } });
    if (!existingRefund) {
      await prisma.refund.create({
        data: {
          bookingId: cb.id,
          amount,
          refundMethod: method === 'INSTAPAY' ? 'إنستاباي' : (method === 'VODAFONE_CASH' ? 'فودافون كاش' : 'تحويل بنكي CIB'),
          referenceNumber: `REFUND-TXN-${202600 + i}`,
          proofFileUrl: `/api/files/refunds/receipt-${cb.id}.jpg`,
          refundTimestamp: refundDate,
          status: i === 1 ? RefundStatus.PARTIALLY_REFUNDED : RefundStatus.REFUNDED,
          recordedByUserId: opsManager?.id || cb.customer.user.id,
          approvedByUserId: opsManager?.id || null,
          approvedAt: refundDate,
          notes: i === 1 ? 'تسوية استرداد جزئي (إلغاء متأخر مع خصم رسوم الإلغاء)' : 'تم إرجاع كامل المبلغ للعميل بموجب إشعار التحويل البنكي',
          createdAt: refundDate,
        },
      });
      totalRefundsAmount += amount;
    }
  }

  console.log(`   ✅ Created ${cancelledBookings.length} approved refunds totaling -${totalRefundsAmount.toLocaleString()} EGP.`);

  // --------------------------------------------------------------------------
  // SUMMARY REPORT
  // --------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('🎉 REVENUE AND REFUND UPDATES APPLIED SUCCESSFULLY!');
  console.log('===============================================================');
  console.log(`⭐ New Subscription Revenue: +${totalSubRevenue.toLocaleString()} EGP (3 active approved subscriptions)`);
  console.log(`⭐ Total Approved Refunds:   -${totalRefundsAmount.toLocaleString()} EGP (${cancelledBookings.length} transactions)`);
  console.log('===============================================================\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Failed with Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
