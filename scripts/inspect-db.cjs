const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const bookingsCount = await prisma.booking.count();
  const usersCount = await prisma.user.count();
  const paymentsSum = await prisma.payment.aggregate({ _sum: { amount: true }, _count: true });
  const reviewsCount = await prisma.customerServiceRating.count();
  const qualityCount = await prisma.qualityReview.count();
  const invoicesCount = await prisma.invoice.count();
  const filesCount = await prisma.bookingFile.count();

  console.log('Bookings:', bookingsCount);
  console.log('Users:', usersCount);
  console.log('Payments Count:', paymentsSum._count, 'Total Revenue:', paymentsSum._sum.amount, 'EGP');
  console.log('Reviews:', reviewsCount);
  console.log('Quality Reviews:', qualityCount);
  console.log('Invoices:', invoicesCount);
  console.log('Files (Proofs & Before/After):', filesCount);

  const sampleBookings = await prisma.booking.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: {
      bookingNumber: true,
      bookingStatus: true,
      paymentStatus: true,
      totalPrice: true,
      startAt: true,
    }
  });
  console.log('Recent Sample Bookings:', sampleBookings);
}

main().finally(() => prisma.$disconnect());
