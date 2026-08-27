const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { phone: '01234567891' } });
  console.log('User:', user.fullName, user.phone, user.passwordHash);
  const passwordsToTest = [
    'Password123!',
    'password123!',
    '12345678',
    '123456789',
    'Password123',
    'password',
    'Password',
    '123456',
    '01234567891',
    'nour1234',
    'Nour1234!',
    'Nour123!',
    'Admin123!',
    'Pass1234',
    'Pass123!',
  ];
  let found = false;
  for (const p of passwordsToTest) {
    if (await bcrypt.compare(p, user.passwordHash)) {
      console.log('>>> MATCH FOUND FOR PASSWORD: <<<', p);
      found = true;
    }
  }
  if (!found) {
    console.log('No matches found among common test passwords.');
  }
}

main().finally(() => prisma.$disconnect());
