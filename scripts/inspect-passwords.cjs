const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log(`Total users in DB: ${users.length}`);

  const target = await prisma.user.findFirst({ where: { phone: '01234567891' } });
  console.log('Target user 01234567891:', target);

  if (target) {
    const isP1 = await bcrypt.compare('Password123!', target.passwordHash);
    console.log('Matches Password123!:', isP1);
  }

  // Check login Action implementation
  console.log('\nChecking all users phones and roles:');
  for (const u of users) {
    const match = await bcrypt.compare('Password123!', u.passwordHash);
    console.log(`${u.phone} | ${u.role} | ${u.fullName} | Active: ${u.active} | Match: ${match}`);
  }
}

main().finally(() => prisma.$disconnect());
