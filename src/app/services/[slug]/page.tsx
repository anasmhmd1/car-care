import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { createPublicMetadata, serializeJsonLd, siteUrl } from '@/lib/seo';
import {
  ArrowRight,
  Calendar,
  Clock,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import ServiceImageGallery from './ServiceImageGallery';
import { getServiceGalleryImages, getServiceRealImage } from '@/lib/service-images';

export const dynamic = 'force-dynamic';

interface ServiceDetailProps {
  params: Promise<{ slug: string }>;
}

const getService = cache((slug: string) =>
  db.service.findFirst({
    where: { slug, active: true, bookableOnline: true },
    include: {
      variants: true,
      addonLinks: { include: { addon: true } },
    },
  }),
);

export async function generateMetadata({ params }: ServiceDetailProps): Promise<Metadata> {
  const { slug } = await params;
  const service = await getService(slug);

  if (!service) {
    return {
      title: 'الخدمة غير موجودة',
      robots: { index: false, follow: false },
    };
  }

  return createPublicMetadata({
    title: service.nameAr,
    description: service.shortDescriptionAr,
    path: `/services/${service.slug}`,
  });
}

export default async function ServiceDetailPage({ params }: ServiceDetailProps) {
  const { slug } = await params;
  const [user, service] = await Promise.all([getCurrentUser(), getService(slug)]);

  if (!service) {
    notFound();
  }

  const resolvedCoverImage = getServiceRealImage(service.slug, service.coverImage);
  const galleryImages = getServiceGalleryImages(
    service.slug,
    service.coverImage,
    Array.isArray(service.galleryImages) ? (service.galleryImages as string[]) : [],
  );

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.nameAr,
    description: service.shortDescriptionAr,
    url: new URL(`/services/${service.slug}`, siteUrl).toString(),
    image: resolvedCoverImage,
    provider: { '@id': `${siteUrl.origin}/#business` },
    areaServed: { '@type': 'AdministrativeArea', name: 'مناطق التغطية والخدمة' },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'EGP',
      price: service.basePrice,
      availability: 'https://schema.org/InStock',
      url: new URL(`/services/${service.slug}/book`, siteUrl).toString(),
    },
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col font-sans">
      <Navbar user={user} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(serviceJsonLd) }}
      />

      <main id="main-content" className="flex-1 pt-28 sm:pt-32 pb-24 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-8">
        
        {/* Back Link */}
        <div>
          <Link
            href="/services"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#e5c45a] hover:underline"
          >
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
            <span>العودة لجميع الخدمات</span>
          </Link>
        </div>

        {/* 1. TOP: Images & Interactive Slider */}
        <section aria-label="معرض صور الخدمة">
          <ServiceImageGallery images={galleryImages} serviceName={service.nameAr} />
        </section>

        {/* 2. Title, Duration Badge & Description */}
        <section className="space-y-3.5 w-full">
          <div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#141414] border border-[#c9a227]/30 text-xs font-bold text-[#e5c45a]">
              <Clock className="w-4 h-4 text-[#c9a227]" aria-hidden="true" />
              <span>المدة المتوقعة: {service.durationMinutes} دقيقة</span>
            </div>
          </div>

          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white leading-tight sm:leading-tight tracking-normal w-full break-words">
            {service.nameAr}
          </h1>
          <p className="text-neutral-300 text-sm sm:text-base leading-relaxed w-full">
            {service.fullDescriptionAr || service.shortDescriptionAr}
          </p>
        </section>

        {/* 3. Booking CTA & Deposit Info Box (Under Description) */}
        <section className="rounded-3xl border border-[#d4af37]/30 bg-gradient-to-br from-[#181816] via-[#121210] to-[#0a0a09] p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 pb-6 border-b border-white/10">
            <div className="flex flex-wrap items-center gap-6 sm:gap-10">
              <div>
                <span className="text-xs font-bold text-neutral-400 block mb-1">السعر</span>
                <span className="text-3xl sm:text-4xl font-black text-[#e5c45a]">{service.basePrice} ج.م</span>
              </div>
              <div className="border-r border-white/10 pr-6 sm:pr-10">
                <span className="text-xs font-bold text-neutral-400 block mb-1">مبلغ العربون المبدئي</span>
                <span className="text-xl sm:text-2xl font-black text-white">
                  {service.depositType === 'PERCENTAGE' ? `${service.depositValue}%` : `${service.depositValue} ج.م`}
                </span>
                <span className="text-[11px] text-neutral-400 block mt-0.5">لتأكيد حجز الموعد مسبقاً</span>
              </div>
            </div>

            <Link
              href={`/services/${service.slug}/book`}
              className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl gold-gradient text-[#080808] font-black text-base sm:text-lg shadow-xl shadow-[#c9a227]/25 hover:brightness-110 active:scale-98 transition-all shrink-0"
            >
              <Calendar className="w-5 h-5" aria-hidden="true" />
              <span>احجز هذه الخدمة الآن</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-neutral-300">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-[#c9a227] shrink-0" aria-hidden="true" />
              <span>تأكيد الموعد مسبقاً وفريق مجهز بالكامل للموقع</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-[#c9a227] shrink-0" aria-hidden="true" />
              <span>توثيق دقيق قبل وبعد التنفيذ مع فحص الجودة</span>
            </div>
          </div>
        </section>

        {/* 4. Features / Benefits */}
        {Array.isArray(service.benefits) && service.benefits.length > 0 && (
          <section aria-labelledby="service-benefits-title" className="space-y-4 pt-4 border-t border-neutral-800">
            <h2 id="service-benefits-title" className="text-lg sm:text-xl font-bold text-white">
              مميزات الخدمة الرئيسية
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(service.benefits as string[]).map((benefit, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-[#141414] border border-[#c9a227]/25">
                  <span className="text-xs sm:text-sm font-semibold text-neutral-200 leading-relaxed">{benefit}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Bottom Call to Action */}
        <div className="pt-6 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-lg font-bold text-white">جاهز لتجربة عناية بريق الفاخرة لسيارتك؟</p>
            <p className="text-xs text-neutral-400">حدد موعدك وموقعك وسيصل فريقنا المجهز بالكامل لباب بيتك.</p>
          </div>
          <Link
            href={`/services/${service.slug}/book`}
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl gold-gradient text-[#080808] font-black text-sm shadow-lg shadow-[#c9a227]/20 hover:brightness-110 transition shrink-0"
          >
            <Calendar className="w-4 h-4" aria-hidden="true" />
            <span>احجز الآن ({service.basePrice} ج.م)</span>
          </Link>
        </div>

      </main>

      <Footer />
    </div>
  );
}
