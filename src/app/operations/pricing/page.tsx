import type { Metadata } from 'next';
import { BranchStatus, UserRole } from '@prisma/client';
import { redirect } from 'next/navigation';
import { getAccessibleBranchIds } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import DelegatedPricingBoard from './DelegatedPricingBoard';

export const metadata: Metadata = {
  title: 'الأسعار المفوّضة | بريق',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function DelegatedPricingPage() {
  const actor = await requireRole([
    UserRole.OPERATIONS_MANAGER,
    UserRole.OWNER,
    UserRole.SYSTEM_SUPER_ADMIN,
  ]);
  const accessibleBranchIds = await getAccessibleBranchIds(actor);
  const branches = await db.branch.findMany({
    where: {
      status: BranchStatus.ACTIVE,
      ...(accessibleBranchIds === null
        ? {}
        : { id: { in: accessibleBranchIds } }),
    },
    orderBy: { nameAr: 'asc' },
    select: { id: true, nameAr: true },
  });

  const [canEditBasePrice, branchPermissions] = await Promise.all([
    hasPermission(actor, 'catalog.price.manage'),
    Promise.all(branches.map(async (branch) => ({
      branchId: branch.id,
      allowed: await hasPermission(actor, 'catalog.price.manage', {
        type: 'BRANCH',
        id: branch.id,
      }),
    }))),
  ]);
  const allowedBranchIds = new Set(
    branchPermissions
      .filter(({ allowed }) => allowed)
      .map(({ branchId }) => branchId),
  );

  if (!canEditBasePrice && allowedBranchIds.size === 0) redirect('/operations');

  const [globalServices, branchRows] = await Promise.all([
    canEditBasePrice
      ? db.service.findMany({
          orderBy: [{ active: 'desc' }, { nameAr: 'asc' }],
          select: { id: true, nameAr: true, basePrice: true, active: true },
        })
      : Promise.resolve([]),
    allowedBranchIds.size
      ? db.branch.findMany({
          where: { id: { in: [...allowedBranchIds] } },
          orderBy: { nameAr: 'asc' },
          select: {
            id: true,
            nameAr: true,
            services: {
              orderBy: { service: { nameAr: 'asc' } },
              select: {
                id: true,
                active: true,
                priceOverride: true,
                service: {
                  select: {
                    id: true,
                    nameAr: true,
                    basePrice: true,
                    active: true,
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  return (
    <DelegatedPricingBoard
      globalServices={globalServices}
      branches={branchRows.map((branch) => ({
        id: branch.id,
        nameAr: branch.nameAr,
        services: branch.services.map((branchService) => ({
          branchServiceId: branchService.id,
          serviceId: branchService.service.id,
          nameAr: branchService.service.nameAr,
          basePrice: branchService.service.basePrice,
          priceOverride: branchService.priceOverride,
          active: branchService.active && branchService.service.active,
        })),
      }))}
    />
  );
}
