import { UserRole } from '@prisma/client';
import type { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { getAccessibleBranchIds } from '@/lib/auth/authorization';
import { reportToCsv } from '@/lib/reports/csv';
import { parseReportFilters } from '@/lib/reports/filters';
import { buildReports } from '@/lib/reports/report';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const actor = await requireRole([
    UserRole.OPERATIONS_MANAGER,
    UserRole.OWNER,
    UserRole.SYSTEM_SUPER_ADMIN,
  ]);
  const filters = parseReportFilters(request.nextUrl.searchParams);
  const accessibleBranchIds = await getAccessibleBranchIds(actor);
  const allowedBranchIds = accessibleBranchIds === null
    ? null
    : (await Promise.all(accessibleBranchIds.map(async (branchId) => ({
        branchId,
        allowed: await hasPermission(actor, 'reports.revenue', { type: 'BRANCH', id: branchId }),
      })))).filter(({ allowed }) => allowed).map(({ branchId }) => branchId);
  if (
    (allowedBranchIds === null && !(await hasPermission(actor, 'reports.revenue'))) ||
    (allowedBranchIds !== null && allowedBranchIds.length === 0)
  ) {
    return Response.json({ error: 'لا تملك صلاحية عرض تقارير الإيرادات.' }, { status: 403 });
  }
  const report = await buildReports(filters, allowedBranchIds);
  const body = reportToCsv(report);
  const fileName = `bareeq-report-${filters.from}-${filters.to}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
