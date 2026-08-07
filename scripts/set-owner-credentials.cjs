/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient, UserRole } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const email = 'bbareeq1@gmail.com';
  const rawPassword = '*#@123bareeq321@#*';
  const passwordHash = await bcrypt.hash(rawPassword, 12);

  const existingOwnerByEmail = await prisma.user.findUnique({
    where: { email },
  });

  const existingOwnerByRole = await prisma.user.findFirst({
    where: { role: UserRole.OWNER, deletedAt: null },
  });

  const targetId = existingOwnerByEmail?.id || existingOwnerByRole?.id || 'seed-user-owner';
  const phone = existingOwnerByEmail?.phone || existingOwnerByRole?.phone || '201111111111';

  const user = await prisma.user.upsert({
    where: { id: targetId },
    update: {
      email,
      passwordHash,
      role: UserRole.OWNER,
      active: true,
      mustChangePwd: false,
    },
    create: {
      id: 'seed-user-owner',
      fullName: 'مالك بريق',
      phone,
      email,
      passwordHash,
      role: UserRole.OWNER,
      active: true,
      mustChangePwd: false,
    },
  });

  console.log(`[Success] Owner account updated successfully:`);
  console.log(`- ID: ${user.id}`);
  console.log(`- Role: ${user.role}`);
  console.log(`- Email: ${user.email}`);
  console.log(`- Phone: ${user.phone}`);
}

main()
  .catch((err) => {
    console.error('Failed to set owner credentials:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
