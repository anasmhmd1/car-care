import type { Metadata } from 'next';
import Link from 'next/link';
import { UserRole } from '@prisma/client';
import { getAccessibleBranchIds } from '@/lib/auth/authorization';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import PasswordResetQueue from './PasswordResetQueue';

export const metadata: Metadata = {
  title: 'طلبات استعادة كلمة المرور',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function PasswordResetRequestsPage() {
  const actor = await requireRole([
    UserRole.OPERATIONS_MANAGER,
    UserRole.OWNER,
    UserRole.SYSTEM_SUPER_ADMIN,
  ]);
  const branchIds = await getAccessibleBranchIds(actor);
  const requests = await db.passwordResetRequest.findMany({
    where: {
      ...(branchIds === null ? {} : {
        targetUser: {
          customerProfile: {
            is: { bookings: { some: { branchId: { in: branchIds } } } },
          },
        },
      }),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    take: 100,
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedAt: true,
      handledByUser: { select: { fullName: true } },
      targetUser: {
        select: {
          fullName: true,
          phone: true,
          whatsapp: true,
          customerProfile: {
            select: {
              bookings: {
                distinct: ['branchId'],
                select: { branch: { select: { nameAr: true } } },
                take: 20,
              },
            },
          },
        },
      },
    },
  });
  const homeHref = actor.role === UserRole.OPERATIONS_MANAGER ? '/operations' : '/admin';

  return (
    <main dir="rtl" className="min-h-screen bg-[#080808] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold text-[#d4af37]">SECURE MANUAL RECOVERY</p><h1 className="mt-2 text-3xl font-black sm:text-5xl">استعادة كلمات المرور</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-white/45">طابور يدوي موثق: تحقق من العميل، أنشئ كلمة مؤقتة، وأجبره على تغييرها عند أول دخول.</p></div><Link href={homeHref} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-5 text-xs font-bold text-white/70 hover:border-[#d4af37]/40">العودة للوحة التشغيل</Link></header>
        <PasswordResetQueue requests={requests.map((request) => ({
          id: request.id,
          status: request.status,
          customerName: request.targetUser.fullName,
          phone: request.targetUser.phone,
          whatsapp: request.targetUser.whatsapp ?? request.targetUser.phone,
          branchNames: request.targetUser.customerProfile?.bookings.map(({ branch }) => branch.nameAr) ?? [],
          createdAt: request.createdAt.toISOString(),
          completedAt: request.completedAt?.toISOString() ?? null,
          handledBy: request.handledByUser?.fullName ?? null,
        }))} />
      </div>
    </main>
  );
}
