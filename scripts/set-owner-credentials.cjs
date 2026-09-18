/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient, UserRole } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  const rawPassword = '303126';
  const passwordHash = await bcrypt.hash(rawPassword, 10);

  // Check if owner or user with this phone or email exists
  const existingOwner = await prisma.user.findFirst({
    where: {
      OR: [
        { email: 'bbareeq1@gmail.com' },
        { role: UserRole.OWNER },
        { id: 'seed-user-owner' },
      ],
    },
  });

  const targetId = existingOwner?.id || 'seed-user-owner';
  const phone = existingOwner?.phone || '201111111111';
  const email = existingOwner?.email || 'bbareeq1@gmail.com';
  const fullName = existingOwner?.fullName || 'كريم';

  const user = await prisma.user.upsert({
    where: { id: targetId },
    update: {
      phone,
      email,
      fullName,
      passwordHash,
      role: UserRole.OWNER,
      active: true,
      mustChangePwd: false,
    },
    create: {
      id: targetId,
      fullName: 'المالك',
      phone,
      email,
      passwordHash,
      role: UserRole.OWNER,
      active: true,
      mustChangePwd: false,
    },
  });

  // Clear security throttles and locks so login is immediately allowed
  const clearedThrottles = await prisma.securityThrottle.deleteMany();

  console.log(`[Success] Owner account updated successfully:`);
  console.log(`- ID: ${user.id}`);
  console.log(`- Role: ${user.role}`);
  console.log(`- Username/Phone: ${user.phone}`);
  console.log(`- Password: ${rawPassword}`);
  console.log(`- Cleared throttles: ${clearedThrottles.count}`);
}

main()
  .catch((err) => {
    console.error('Failed to set owner credentials:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
