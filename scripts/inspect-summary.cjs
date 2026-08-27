const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const statusCounts = await prisma.booking.groupBy({
    by: ['bookingStatus'],
    _count: true,
  });

  const paymentStatusCounts = await prisma.booking.groupBy({
    by: ['paymentStatus'],
    _count: true,
  });

  const staff = await prisma.user.findMany({
    where: { role: { not: 'CUSTOMER' } },
    select: { phone: true, fullName: true, role: true, active: true },
    orderBy: { role: 'asc' }
  });

  const sampleCustomers = await prisma.user.findMany({
    where: { role: 'CUSTOMER' },
    take: 6,
    select: {
      phone: true,
      fullName: true,
      customerProfile: {
        select: {
          vehicles: { select: { make: true, model: true, plateNumber: true, vehicleSize: true } },
          addresses: { select: { district: true, city: true, compound: true } }
        }
      }
    }
  });

  const totalPayments = await prisma.payment.aggregate({ _sum: { amount: true }, _count: true });

  console.log('=== BOOKINGS BY STATUS ===');
  console.log(statusCounts);
  console.log('=== BOOKINGS BY PAYMENT STATUS ===');
  console.log(paymentStatusCounts);
  console.log('=== STAFF ACCOUNTS ===');
  console.log(staff);
  console.log('=== SAMPLE CUSTOMERS ===');
  console.log(JSON.stringify(sampleCustomers, null, 2));
  console.log('=== FINANCIALS ===');
  console.log(`Total Revenue: ${totalPayments._sum.amount?.toLocaleString()} EGP across ${totalPayments._count} payments`);
}

main().finally(() => prisma.$disconnect());
