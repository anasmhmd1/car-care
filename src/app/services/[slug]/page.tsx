import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import PublicImage from '@/components/PublicImage';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { createPublicMetadata, serializeJsonLd, siteUrl } from '@/lib/seo';
import { Clock, ShieldCheck, Check, Sparkles, Calendar, Car, ArrowRight } from 'lucide-react';

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

  const galleryImages = [
    service.coverImage,
    ...(Array.isArray(service.galleryImages)
      ? service.galleryImages.filter((image): image is string => typeof image === 'string' && image.length > 0)
      : []),
  ].filter((image, index, images) => images.indexOf(image) === index);

  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.nameAr,
    description: service.shortDescriptionAr,
    url: new URL(`/services/${service.slug}`, siteUrl).toString(),
    image: service.coverImage,
    provider: { '@id': `${siteUrl.origin}/#business` },
    areaServed: { '@type': 'City', name: 'الشيخ زايد' },
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

      <main id="main-content" className="flex-1 pt-32 pb-24 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        
        {/* Back link */}
        <Link href="/services" className="inline-flex items-center gap-2 text-xs font-semibold text-[#e5c45a] hover:underline mb-8">
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
          <span>العودة لجميع الخدمات</span>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Main Info (Right) */}
          <div className="lg:col-span-7 space-y-8">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#141414] border border-[#c9a227]/30 text-xs font-semibold text-[#e5c45a]">
                <Clock className="w-3.5 h-3.5 text-[#c9a227]" aria-hidden="true" />
                <span>المدة المتوقعة: {service.durationMinutes} دقيقة</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-white">{service.nameAr}</h1>
              <p className="text-neutral-300 text-sm leading-relaxed">{service.fullDescriptionAr}</p>
            </div>

            <section aria-labelledby="service-gallery-title" className="space-y-4 border-t border-neutral-800 pt-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 id="service-gallery-title" className="text-lg font-bold text-white">صور الخدمة</h2>
                  <p className="mt-1 text-xs text-neutral-400">نماذج توضح مراحل ونتيجة الخدمة.</p>
                </div>
                <span className="shrink-0 rounded-full border border-[#c9a227]/25 bg-[#c9a227]/10 px-3 py-1 text-xs font-semibold text-[#e5c45a]">
                  {galleryImages.length} صور
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {galleryImages.map((image, index) => (
                  <div key={image} className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-[#141414] ${index === 0 ? 'col-span-2 row-span-2 aspect-[4/3]' : 'aspect-square'}`}>
                    <PublicImage
                      src={image}
                      alt={`${service.nameAr} — صورة ${index + 1}`}
                      sizes={index === 0 ? '(min-width: 1024px) 36vw, 66vw' : '(min-width: 1024px) 18vw, 33vw'}
                      priority={index === 0}
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Features / Benefits */}
            {Array.isArray(service.benefits) && service.benefits.length > 0 && (
              <section aria-labelledby="service-benefits-title" className="space-y-4 pt-4 border-t border-neutral-800">
                <h2 id="service-benefits-title" className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#c9a227]" aria-hidden="true" />
                  <span>مميزات الخدمة الرئيسية</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(service.benefits as string[]).map((benefit, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-[#141414] border border-[#c9a227]/25 flex items-start gap-3">
                      <ShieldCheck className="w-5 h-5 text-[#c9a227] shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="text-xs font-semibold text-neutral-200 leading-relaxed">{benefit}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Included vs Excluded */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-neutral-800">
              {Array.isArray(service.includedItems) && service.includedItems.length > 0 && (
                <div className="space-y-3 p-5 rounded-2xl bg-[#141414] border border-[#c9a227]/20">
                  <h2 className="font-bold text-[#e5c45a] text-sm">مشتملات الخدمة</h2>
                  <ul className="space-y-2 text-xs text-neutral-300">
                    {(service.includedItems as string[]).map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-[#c9a227] shrink-0" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(service.excludedItems) && service.excludedItems.length > 0 && (
                <div className="space-y-3 p-5 rounded-2xl bg-[#141414] border border-neutral-800">
                  <h2 className="font-bold text-neutral-300 text-sm">غير مشمول</h2>
                  <ul className="space-y-2 text-xs text-neutral-500">
                    {(service.excludedItems as string[]).map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Vehicle Variants Price Table */}
            {service.variants.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-neutral-800">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Car className="w-5 h-5 text-[#c9a227]" aria-hidden="true" />
                  <span>الأسعار والمدد حسب حجم السيارة</span>
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {service.variants.map((variant) => (
                    <div key={variant.id} className="p-4 rounded-xl bg-[#141414] border border-[#c9a227]/20 text-center space-y-1">
                      <span className="text-xs font-semibold text-neutral-300 block">{variant.vehicleSize}</span>
                      <span className="text-lg font-black text-[#e5c45a] block">{variant.price} ج.م</span>
                      <span className="text-[10px] text-neutral-400 block">{variant.durationMinutes} دقيقة</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Addons */}
            {service.addonLinks.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-neutral-800">
                <h2 className="text-lg font-bold text-white">إضافات مخصصة يمكنك اختيارها عند الحجز</h2>
                <div className="space-y-2">
                  {service.addonLinks.map(({ addon }) => (
                    <div key={addon.id} className="p-3.5 rounded-xl bg-[#141414] border border-neutral-800 flex items-center justify-between text-xs">
                      <span className="font-medium text-neutral-200">{addon.nameAr}</span>
                      <span className="font-bold text-[#e5c45a]">+{addon.price} ج.م</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sticky Booking Action (Left) */}
          <div className="lg:col-span-5">
            <div className="sticky top-28 p-6 rounded-3xl glass-card border border-[#c9a227]/30 space-y-6">
              <div className="relative h-52 rounded-2xl overflow-hidden">
                <PublicImage
                  src={service.coverImage}
                  alt={service.nameAr}
                  sizes="(min-width: 1024px) 40vw, 100vw"
                  className="w-full h-full object-cover"
                  priority
                />
              </div>

              <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <div>
                  <span className="text-xs text-neutral-400 block">السعر النهائي يبدأ من</span>
                  <span className="text-3xl font-black text-[#e5c45a]">{service.basePrice} ج.م</span>
                </div>
                <div className="text-left">
                  <span className="text-xs text-neutral-400 block">العربون المبدئي</span>
                  <span className="text-sm font-bold text-neutral-200">
                    {service.depositType === 'PERCENTAGE' ? `${service.depositValue}%` : `${service.depositValue} ج.م`}
                  </span>
                </div>
              </div>

              <div className="space-y-3 text-xs text-neutral-300">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#c9a227]" aria-hidden="true" />
                  <span>تأكيد الموعد مسبقاً مع إثبات تحويل العربون</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#c9a227]" aria-hidden="true" />
                  <span>صور وتوثيق دقيق قبل وبعد تنفيذ الخدمة</span>
                </div>
              </div>

              <Link
                href={`/services/${service.slug}/book`}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl gold-gradient text-[#080808] font-black text-base shadow-xl shadow-[#c9a227]/30 hover:brightness-110 transition-[filter,transform]"
              >
                <Calendar className="w-5 h-5" aria-hidden="true" />
                <span>احجز هذه الخدمة الآن</span>
              </Link>
            </div>
          </div>

        </div>

      </main>

      <Footer />
    </div>
  );
}
