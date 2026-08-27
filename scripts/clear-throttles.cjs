const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const throttles = await prisma.securityThrottle.findMany();
  console.log(`Throttles count: ${throttles.length}`, throttles);

  // Clear any existing throttles/locks so the user is NEVER blocked while testing
  const deleted = await prisma.securityThrottle.deleteMany();
  console.log(`Cleared ${deleted.count} security throttle records.`);
}

main().finally(() => prisma.$disconnect());
