const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { phone: '01234567891' } });
  const isMatch = await bcrypt.compare('12345678', user.passwordHash);
  console.log(`User: ${user.fullName} (${user.phone}) -> Password '12345678' Match: ${isMatch}`);

  const owner = await prisma.user.findFirst({ where: { phone: '01000000001' } });
  const ownerMatch = await bcrypt.compare('12345678', owner.passwordHash);
  console.log(`Owner: ${owner.fullName} (${owner.phone}) -> Password '12345678' Match: ${ownerMatch}`);
}

main().finally(() => prisma.$disconnect());
