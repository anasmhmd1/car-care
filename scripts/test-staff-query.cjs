const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: { phone: { in: ['01234567891', '01000000003', '01124156626', '01000000015'] } },
  });

  for (const emp of users) {
    const teamMember = await prisma.teamMember.findFirst({
      where: { userId: emp.id },
      include: { team: { include: { operationalVehicles: true } } },
    });

    const bookings = teamMember
      ? await prisma.booking.findMany({
          where: {
            assignedTeamId: teamMember.teamId,
            branchId: teamMember.team.branchId,
            deletedAt: null,
            bookingStatus: { notIn: ['CLOSED', 'CANCELLED', 'REJECTED', 'EXPIRED'] },
            terminalReopenSourceStatus: null,
          },
          select: {
            bookingNumber: true,
            bookingStatus: true,
            startAt: true,
            service: { select: { nameAr: true } },
            assignedEmployee: { select: { fullName: true } },
          },
          orderBy: { startAt: 'asc' },
        })
      : [];

    console.log(`\n👨‍🔧 موظف: ${emp.fullName} (${emp.phone})`);
    console.log(`   الفريق: ${teamMember?.team.name || 'غير مخصص'}`);
    console.log(`   السيارة الميدانية: ${teamMember?.team.operationalVehicles.map(v => v.code).join(', ')}`);
    console.log(`   عدد المهام الميدانية النشطة: ${bookings.length}`);
    bookings.forEach(b => {
      console.log(`     - [${b.bookingStatus}] ${b.bookingNumber} | ${b.service.nameAr} | موعد: ${b.startAt.toLocaleTimeString('ar-EG')}`);
    });
  }
}

main().finally(() => prisma.$disconnect());
