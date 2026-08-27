const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { phone: '01234567891' } });
  console.log('User:', user.fullName, user.phone);

  const testPass = 'Password123!';
  const isValid = await bcrypt.compare(testPass, user.passwordHash);
  console.log(`Testing password "${testPass}": Result = ${isValid}`);
}

main().finally(() => prisma.$disconnect());
