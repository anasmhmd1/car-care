import type { Metadata } from 'next';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import BranchCreationPanel, { type ManagedBranchDto } from './BranchCreationPanel';

export const metadata: Metadata = {
  title: 'إضافة فرع | إدارة بريق',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminBranchesPage() {
  await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const [brand, branches] = await Promise.all([
    db.brandSettings.findFirst({ select: { maxBranches: true } }),
    db.branch.findMany({
      orderBy: [{ status: 'asc' }, { nameAr: 'asc' }],
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        code: true,
        address: true,
        phone: true,
        whatsapp: true,
        status: true,
        dailyBookingLimit: true,
        workingHours: {
          orderBy: { dayOfWeek: 'asc' },
          select: { dayOfWeek: true, isClosed: true, openTime: true, closeTime: true },
        },
        _count: { select: { teams: true, coverageZones: true } },
      },
    }),
  ]);

  const branchDtos: ManagedBranchDto[] = branches.map((branch) => ({
    id: branch.id,
    nameAr: branch.nameAr,
    nameEn: branch.nameEn,
    code: branch.code,
    address: branch.address,
    phone: branch.phone,
    whatsapp: branch.whatsapp,
    status: branch.status,
    dailyBookingLimit: branch.dailyBookingLimit,
    workingHours: branch.workingHours,
    teamCount: branch._count.teams,
    zoneCount: branch._count.coverageZones,
  }));

  return <BranchCreationPanel maxBranches={brand?.maxBranches ?? 1} currentBranchCount={branches.length} branches={branchDtos} />;
}
