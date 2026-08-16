import { redirect } from 'next/navigation';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';

interface RevenuePageProps {
  searchParams: Promise<{
    month?: string;
    q?: string;
    type?: 'all' | 'booking' | 'subscription' | 'refund';
  }>;
}

export default async function MonthlyRevenuePage({ searchParams }: RevenuePageProps) {
  await requireRole([
    UserRole.OWNER,
    UserRole.SYSTEM_SUPER_ADMIN,
    UserRole.OPERATIONS_MANAGER,
  ]);

  const query = await searchParams;
  const params = new URLSearchParams();
  params.set('tab', 'revenue');
  if (query.month) params.set('month', query.month);
  if (query.q) params.set('q', query.q);
  if (query.type) params.set('type', query.type);

  redirect(`/admin/reports?${params.toString()}`);
}
