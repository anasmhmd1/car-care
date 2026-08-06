import Link from 'next/link';
import { FileType, UserRole } from '@prisma/client';
import { ArrowRight, Images } from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import GalleryReviewPanel from './GalleryReviewPanel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'مراجعة معرض قبل وبعد | بريق',
  robots: { index: false, follow: false },
};

export default async function AdminGalleryPage() {
  await requireRole([UserRole.OWNER]);
  const files = await db.bookingFile.findMany({
    where: {
      fileType: { in: [FileType.BEFORE_SERVICE, FileType.AFTER_SERVICE] },
      mimeType: { startsWith: 'image/' },
      booking: { deletedAt: null },
    },
    select: {
      id: true,
      fileType: true,
      fileUrl: true,
      createdAt: true,
      customerGalleryConsentAt: true,
      approvedForGallery: true,
      galleryApprovedAt: true,
      booking: {
        select: {
          bookingNumber: true,
          service: { select: { nameAr: true } },
          branch: { select: { nameAr: true } },
          customer: { select: { user: { select: { fullName: true } } } },
        },
      },
    },
    orderBy: [{ customerGalleryConsentAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });

  return (
    <main className="min-h-screen bg-[#080808] px-4 py-10 text-white sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold text-[#d4af37]"><Images className="size-4" aria-hidden="true" /> موافقة مزدوجة وخصوصية افتراضية</p>
            <h1 className="mt-2 text-3xl font-black">معرض صور قبل وبعد</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-white/50">لا تصبح أي صورة عامة إلا بعد موافقة العميل الصريحة ثم اعتماد المالك. سحب موافقة العميل يلغي النشر فورًا.</p>
          </div>
          <Link href="/admin?section=quality" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-bold hover:border-[#d4af37]/40"><ArrowRight className="size-4" aria-hidden="true" /> العودة للجودة</Link>
        </header>
        <GalleryReviewPanel
          files={files.map((file) => ({
            id: file.id,
            fileType: file.fileType === FileType.BEFORE_SERVICE ? 'BEFORE_SERVICE' : 'AFTER_SERVICE',
            fileUrl: file.fileUrl,
            createdAt: file.createdAt.toISOString(),
            customerGalleryConsentAt: file.customerGalleryConsentAt?.toISOString() ?? null,
            approvedForGallery: file.approvedForGallery,
            galleryApprovedAt: file.galleryApprovedAt?.toISOString() ?? null,
            bookingNumber: file.booking.bookingNumber,
            serviceName: file.booking.service.nameAr,
            branchName: file.booking.branch.nameAr,
            customerName: file.booking.customer.user.fullName,
          }))}
        />
      </div>
    </main>
  );
}
