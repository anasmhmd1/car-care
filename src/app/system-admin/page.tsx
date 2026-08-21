import Link from 'next/link';
import BareeqLogo from '@/components/BareeqLogo';
import { requireRole } from '@/lib/auth/session';
import { logoutAction } from '@/app/actions/auth';
import { LogOut, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/db';
import { UserRole } from '@prisma/client';
import {
  publicUserSelect,
  sanitizeClientData,
} from '@/lib/auth/authorization';
import SystemAdminClient from './SystemAdminClient';

export default async function SystemAdminPage() {
  await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const [brand, branchRequests, owners, branches, auditLogs, securityEvents, appSettings] = await Promise.all([
    db.brandSettings.findFirst(),
    db.branchRequest.findMany({
      include: { owner: { select: publicUserSelect } },
      orderBy: { createdAt: 'desc' },
    }),
    db.user.findMany({
      where: { role: UserRole.OWNER },
      select: publicUserSelect,
      orderBy: { createdAt: 'asc' },
    }),
    db.branch.findMany({
      select: {
        id: true,
        nameAr: true,
        code: true,
        address: true,
        phone: true,
        whatsapp: true,
        status: true,
        assignmentMode: true,
        createdAt: true,
        _count: { select: { teams: true, coverageZones: true, memberships: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.auditLog.findMany({
      select: {
        id: true,
        action: true,
        actorRole: true,
        entityType: true,
        entityId: true,
        reason: true,
        createdAt: true,
        actor: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.securityEvent.findMany({
      select: {
        id: true,
        eventType: true,
        description: true,
        ipAddress: true,
        createdAt: true,
        user: { select: { fullName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.appSetting.findMany({ orderBy: { key: 'asc' } }),
  ]);

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col font-sans">
      <main className="flex-1 py-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-8">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <BareeqLogo size="sm" showText={true} />
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#edce8b] uppercase tracking-wider bg-[#cea355]/15 border border-[#cea355]/30 px-3 py-1 rounded-full">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>لوحة الإدارة العليا وحوكمة النظام</span>
              </div>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white">إدارة البنية التحتية، الفروع، وسجلات الحوكمة</h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold text-neutral-300 flex items-center gap-2 transition-all"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>لوحة المالك الرئيسية</span>
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-xs font-bold text-red-400 flex items-center gap-2 transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج</span>
              </button>
            </form>
          </div>
        </div>

        <SystemAdminClient
          brand={brand}
          branchRequests={sanitizeClientData(branchRequests)}
          owners={sanitizeClientData(owners)}
          branches={sanitizeClientData(branches)}
          auditLogs={sanitizeClientData(auditLogs)}
          securityEvents={sanitizeClientData(securityEvents)}
          appSettings={sanitizeClientData(appSettings)}
        />

      </main>
    </div>
  );
}
