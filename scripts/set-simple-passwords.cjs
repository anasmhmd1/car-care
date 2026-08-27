const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const simplePassword = '12345678';
  const hash = await bcrypt.hash(simplePassword, 10);

  const updated = await prisma.user.updateMany({
    data: {
      passwordHash: hash,
      mustChangePwd: false,
      active: true,
    },
  });

  const cleared = await prisma.securityThrottle.deleteMany();

  console.log(`\n===============================================================`);
  console.log(`✅ UPDATED ALL ${updated.count} USERS TO SIMPLE 8-DIGIT PASSWORD: ${simplePassword}`);
  console.log(`✅ CLEARED ${cleared.count} SECURITY THROTTLES & LOCKS`);
  console.log(`===============================================================\n`);

  const users = await prisma.user.findMany({ select: { phone: true, fullName: true, role: true } });
  for (const u of users) {
    console.log(`📞 [${u.phone}] - ${u.fullName} (${u.role}) -> Pass: ${simplePassword}`);
  }
}

main()
  .catch((e) => {
    console.error('Failed:', e);
  })
  .finally(() => prisma.$disconnect());
