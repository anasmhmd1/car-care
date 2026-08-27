import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, MessageSquareText } from 'lucide-react';
import { UserRole } from '@prisma/client';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { getAccessibleBranchIds } from '@/lib/auth/authorization';
import {
  bookingPermissionScopes,
  hasPermissionAcrossScopes,
} from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import RatingReviewPanel, { type CustomerRatingDto } from './RatingReviewPanel';

export const metadata: Metadata = {
  title: 'مراجعة تقييمات العملاء | إدارة بريق',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function CustomerReviewsPage() {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN, UserRole.OPERATIONS_MANAGER]);
  const accessibleBranchIds = await getAccessibleBranchIds(actor);
  const reviewableBranchIds = accessibleBranchIds ?? (
    await db.branch.findMany({ select: { id: true } })
  ).map(({ id }) => id);
  const backHref = actor.role === UserRole.OPERATIONS_MANAGER ? '/operations' : '/admin';

  if (reviewableBranchIds.length === 0) {
    redirect(actor.role === UserRole.OPERATIONS_MANAGER ? '/operations' : '/admin');
  }

  const ratings = await db.customerServiceRating.findMany({
    where: { booking: { branchId: { in: reviewableBranchIds } } },
    orderBy: [{ approvedForPublic: 'asc' }, { createdAt: 'desc' }],
    take: 250,
    select: {
      id: true,
      score: true,
      comment: true,
      createdAt: true,
      approvedForPublic: true,
      approvedAt: true,
      customer: { select: { user: { select: { fullName: true } } } },
      booking: {
        select: {
          bookingNumber: true,
          branchId: true,
          assignedTeamId: true,
          service: { select: { nameAr: true } },
          branch: { select: { nameAr: true } },
        },
      },
    },
  });
  // Ratings are serialized into a client component, so branch eligibility alone
  // is insufficient: an assigned team's explicit DENY must suppress the entire
  // record before its customer and booking details leave the server.
  const reviewPermissionCache = new Map<string, Promise<boolean>>();
  const canReviewBooking = (booking: { branchId: string; assignedTeamId: string | null }) => {
    const cacheKey = `${booking.branchId}:${booking.assignedTeamId ?? ''}`;
    const cachedDecision = reviewPermissionCache.get(cacheKey);
    if (cachedDecision) return cachedDecision;

    const decision = hasPermissionAcrossScopes(
      actor,
      'quality.review',
      bookingPermissionScopes(booking),
    );
    reviewPermissionCache.set(cacheKey, decision);
    return decision;
  };
  const readableRatings = (await Promise.all(ratings.map(async (rating) => ({
    rating,
    allowed: await canReviewBooking(rating.booking),
  })))).filter(({ allowed }) => allowed).map(({ rating }) => rating);

  const ratingDtos: CustomerRatingDto[] = readableRatings.map((rating) => ({
    id: rating.id,
    score: rating.score,
    comment: rating.comment,
    createdAt: rating.createdAt.toISOString(),
    approvedForPublic: rating.approvedForPublic,
    approvedAt: rating.approvedAt?.toISOString() ?? null,
    customerName: rating.customer.user.fullName,
    bookingNumber: rating.booking.bookingNumber,
    serviceName: rating.booking.service.nameAr,
    branchName: rating.booking.branch.nameAr,
  }));

  return (
    <main className="min-h-screen bg-[#080808] px-4 py-10 text-white sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="flex items-center gap-2 text-xs font-bold text-[#d4af37]"><MessageSquareText className="size-4" aria-hidden="true" /> صوت العميل</p><h1 className="mt-2 text-3xl font-black">مراجعة تقييمات العملاء</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-white/55">لا يظهر أي تعليق في الصفحة الرئيسية قبل اعتمادك. تعديل العميل لتقييمه يعيد التعليق تلقائيًا إلى المراجعة.</p></div><Link href={backHref} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 text-sm font-bold hover:border-[#d4af37]/40"><ArrowRight className="size-4" aria-hidden="true" />العودة إلى الجودة</Link></header>
        <RatingReviewPanel ratings={ratingDtos} />
      </div>
    </main>
  );
}
