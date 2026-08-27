const { PrismaClient, BookingHoldStatus } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  
  // Extend any active holds so they don't expire prematurely
  const extended = await prisma.bookingHold.updateMany({
    where: {
      status: BookingHoldStatus.ACTIVE,
      expiresAt: { lt: new Date(now.getTime() + 120 * 60_000) }
    },
    data: {
      expiresAt: new Date(now.getTime() + 120 * 60_000)
    }
  });

  console.log(`✅ Extended ${extended.count} active holds to 120 minutes.`);
}

main().finally(() => prisma.$disconnect());
