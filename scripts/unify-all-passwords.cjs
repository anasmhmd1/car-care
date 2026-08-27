const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('Password123!', 10);

  // Update all active users with standard password and mustChangePwd: false
  const updated = await prisma.user.updateMany({
    data: {
      passwordHash: hash,
      mustChangePwd: false,
      active: true,
    },
  });
  console.log(`Updated ${updated.count} users to standard password: Password123!`);

  // Clear all security locks and rate limits
  const cleared = await prisma.securityThrottle.deleteMany();
  console.log(`Cleared ${cleared.count} security throttle locks.`);
}

main().finally(() => prisma.$disconnect());
