const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.auditLog.findMany({ take: 15, orderBy: { createdAt: 'desc' } });
  console.log('Recent audit logs:');
  for (const l of logs) {
    console.log(`${l.createdAt.toISOString()} | ${l.action} | ${l.entityType} | ${l.entityId} | ${l.reason}`);
  }
}

main().finally(() => prisma.$disconnect());
