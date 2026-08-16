import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import PublicImage from '@/components/PublicImage';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { createPublicMetadata } from '@/lib/seo';
import { Camera } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = createPublicMetadata({
  title: 'معرض صور قبل وبعد',
  description: 'شاهد صورًا موثقة من نتائج خدمات بريق المنشورة بعد موافقة أصحابها.',
  path: '/before-after',
});

export default async function BeforeAfterPage() {
  const user = await getCurrentUser();

  const publicFiles = await db.bookingFile.findMany({
    where: {
      approvedForGallery: true,
      customerGalleryConsentAt: { not: null },
      galleryApprovedAt: { not: null },
      fileType: { in: ['BEFORE_SERVICE', 'AFTER_SERVICE'] },
      mimeType: { startsWith: 'image/' },
    },
    include: { booking: { include: { service: true } } },
    take: 12,
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col font-sans">
      <Navbar user={user} />

      <main id="main-content" className="flex-1 pt-32 pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-12">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#141414] border border-[#c9a227]/30 text-xs font-semibold text-[#e5c45a]">
            <Camera className="w-4 h-4 text-[#c9a227]" aria-hidden="true" />
            <span>نتائج وجودة التنفيذ</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black gold-gradient-text">معرض الصور قبل وبعد الخدمة</h1>
          <p className="text-neutral-400 text-sm max-w-2xl mx-auto leading-relaxed">
            استعرض نتائج خدمة العناية المتنقلة الفاخرة لعملائنا (يتم النشر بموافقة العميل).
          </p>
        </div>

        {publicFiles.length === 0 ? (
          <section className="mx-auto max-w-2xl rounded-3xl border border-[#c9a227]/25 bg-[#141414] p-8 sm:p-10 text-center" aria-labelledby="gallery-empty-title">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#c9a227]/30 bg-[#c9a227]/10 text-[#edce8b]">
              <Camera className="h-7 w-7" aria-hidden="true" />
            </div>
            <h2 id="gallery-empty-title" className="mt-5 text-xl font-bold text-white">سيتم نشر النتائج المعتمدة هنا</h2>
            <p className="mt-2 text-sm leading-7 text-neutral-400">
              لا توجد صور عامة حاليًا. لا ننشر أي صورة قبل اعتمادها والحصول على موافقة العميل.
            </p>
          </section>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {publicFiles.map((file) => (
              <div key={file.id} className="p-4 rounded-2xl glass-card border border-[#c9a227]/20 space-y-2">
                <div className="relative h-48 overflow-hidden rounded-xl bg-neutral-900">
                  <PublicImage
                    src={file.fileUrl}
                    alt={`نتيجة خدمة ${file.booking.service.nameAr}`}
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-xs font-bold text-[#e5c45a] block">{file.booking.service.nameAr}</span>
              </div>
            ))}
          </div>
        )}

      </main>

      <Footer />
    </div>
  );
}
