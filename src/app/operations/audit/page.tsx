import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { UserRole } from '@prisma/client';
import { getAccessibleBranchIds } from '@/lib/auth/authorization';
import { hasPermission } from '@/lib/auth/permissions';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';

export const metadata: Metadata = {
  title: 'سجل التدقيق الفرعي | بريق',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const AUDIT_ROLES = [
  UserRole.OPERATIONS_MANAGER,
  UserRole.OWNER,
  UserRole.SYSTEM_SUPER_ADMIN,
] as const;

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(value);
}

export default async function OperationsAuditPage() {
  const actor = await requireRole([...AUDIT_ROLES]);
  const accessibleBranchIds = await getAccessibleBranchIds(actor);
  const allowedBranchIds = accessibleBranchIds === null
    ? null
    : (await Promise.all(accessibleBranchIds.map(async (branchId) => ({
        branchId,
        allowed: await hasPermission(actor, 'audit.view', {
          type: 'BRANCH',
          id: branchId,
        }),
      }))))
        .filter(({ allowed }) => allowed)
        .map(({ branchId }) => branchId);

  if (
    (allowedBranchIds === null && !(await hasPermission(actor, 'audit.view'))) ||
    (allowedBranchIds !== null && allowedBranchIds.length === 0)
  ) {
    redirect('/operations');
  }

  const logs = await db.auditLog.findMany({
    where: allowedBranchIds === null
      ? {}
      : { branchId: { in: allowedBranchIds } },
    orderBy: { createdAt: 'desc' },
    take: 150,
    select: {
      id: true,
      action: true,
      actorRole: true,
      entityType: true,
      entityId: true,
      reason: true,
      createdAt: true,
      actor: { select: { fullName: true } },
      branch: { select: { nameAr: true } },
    },
  });

  return (
    <main dir="rtl" className="min-h-screen bg-[#080808] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl border border-[#d4af37]/25 bg-[#111] p-6 sm:p-8">
          <Link href="/operations" className="inline-flex min-h-11 items-center rounded-xl border border-white/10 px-4 text-xs font-bold text-white/65 hover:border-[#d4af37]/40 hover:text-[#e5c45a]">
            العودة إلى لوحة التشغيل
          </Link>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-[#d4af37]">Audit / Branch Scope</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">سجل التدقيق التشغيلي</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/45">
            {actor.role === UserRole.OPERATIONS_MANAGER
              ? 'تظهر فقط الأحداث المرتبطة بالفروع المسندة لحسابك والمسموحة بصلاحية audit.view.'
              : 'عرض آخر 150 حدثًا مسجلًا على مستوى بريق.'}
          </p>
        </header>

        <section aria-label="أحداث سجل التدقيق" className="space-y-3">
          {logs.length ? logs.map((log) => (
            <article key={log.id} className="rounded-2xl border border-white/9 bg-[#111] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p dir="ltr" className="break-words font-mono text-sm font-black text-[#e5c45a]">{log.action}</p>
                  <p className="mt-2 text-xs text-white/45">
                    {log.actor?.fullName ?? 'System'} · {log.actorRole} · {log.branch?.nameAr ?? 'نطاق عام'}
                  </p>
                </div>
                <time dateTime={log.createdAt.toISOString()} className="shrink-0 text-xs text-white/35">
                  {formatDateTime(log.createdAt)}
                </time>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/45">
                <span dir="ltr" className="rounded-full bg-white/[0.055] px-2 py-1">{log.entityType}</span>
                <span dir="ltr" className="max-w-full truncate rounded-full bg-white/[0.055] px-2 py-1">{log.entityId}</span>
              </div>
              {log.reason ? <p className="mt-3 text-sm leading-6 text-white/55">{log.reason}</p> : null}
            </article>
          )) : (
            <p className="rounded-2xl border border-dashed border-white/10 bg-[#111] p-10 text-center text-sm text-white/40">
              لا توجد أحداث مرتبطة بنطاقك حتى الآن.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
