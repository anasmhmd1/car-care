const { PrismaClient, SubscriptionPaymentProofStatus, RefundStatus } = require('@prisma/client');
const prisma = new PrismaClient();

const CAIRO_TIME_ZONE = 'Africa/Cairo';

async function main() {
  const from = new Date('2026-08-01T00:00:00.000Z');
  const to = new Date('2026-08-28T00:00:00.000Z');
  const dateRange = { gte: from, lt: to };

  const [bookingPayments, subscriptionProofs, refunds] = await Promise.all([
    prisma.payment.findMany({
      where: { createdAt: dateRange },
      include: { booking: { include: { service: true, branch: true } } },
    }),
    prisma.subscriptionPaymentProof.findMany({
      where: {
        status: SubscriptionPaymentProofStatus.APPROVED,
        reviewedAt: dateRange,
      },
      include: { subscription: { include: { plan: true, branch: true } } },
    }),
    prisma.refund.findMany({
      where: {
        status: { in: [RefundStatus.REFUNDED, RefundStatus.PARTIALLY_REFUNDED] },
        createdAt: dateRange,
      },
      include: { booking: { include: { service: true, branch: true } } },
    }),
  ]);

  const bookingRev = bookingPayments.reduce((s, p) => s + p.amount, 0);
  const subRev = subscriptionProofs.reduce((s, p) => s + p.amountSubmitted, 0);
  const refundsTotal = refunds.reduce((s, r) => s + r.amount, 0);
  const gross = bookingRev + subRev;
  const net = gross - refundsTotal;

  console.log('=== FINANCIAL OVERVIEW CHECK ===');
  console.log(`Booking Revenue:        ${bookingRev.toLocaleString()} EGP (${bookingPayments.length} payments)`);
  console.log(`Subscription Revenue:   ${subRev.toLocaleString()} EGP (${subscriptionProofs.length} approved subs)`);
  console.log(`Gross Revenue:          ${gross.toLocaleString()} EGP`);
  console.log(`Approved Refunds:      -${refundsTotal.toLocaleString()} EGP (${refunds.length} refunds)`);
  console.log(`Net Revenue & Profit:   ${net.toLocaleString()} EGP`);
}

main().finally(() => prisma.$disconnect());
