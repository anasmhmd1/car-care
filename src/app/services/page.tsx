import Link from 'next/link';
import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import PublicImage from '@/components/PublicImage';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { createPublicMetadata } from '@/lib/seo';
import { Clock, Check, Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = createPublicMetadata({
  title: 'خدمات العناية بالسيارات',
  description: 'قارن خدمات بريق للعناية المتنقلة بالسيارات من حيث المشتملات والمدة والسعر، ثم ابدأ الحجز.',
  path: '/services',
});

export default async function ServicesPage() {
  const user = await getCurrentUser();
  const services = await db.service.findMany({
    where: { active: true, bookableOnline: true },
    select: {
      id: true,
      slug: true,
      nameAr: true,
      shortDescriptionAr: true,
      coverImage: true,
      durationMinutes: true,
      basePrice: true,
      includedItems: true,
    },
    orderBy: { basePrice: 'asc' },
  });

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col font-sans">
      <Navbar user={user} />

      <main id="main-content" className="flex-1 pt-32 pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        
        {/* Header */}
        <div className="text-center space-y-4 mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#141414] border border-[#c9a227]/30 text-xs font-semibold text-[#e5c45a]">
            <Sparkles className="w-4 h-4 text-[#c9a227]" aria-hidden="true" />
            <span>منتجات العناية بالسيارات المتنقلة</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black gold-gradient-text">خدمات بريق المتخصصة</h1>
          <p className="text-neutral-400 text-sm max-w-2xl mx-auto leading-relaxed">
            جميع خدماتنا تُنفّذ بمواد مخصصة وحماية فائقة للسطح. اختر الخدمة واعرض تفاصيلها أو ابدأ الحجز مباشرة.
          </p>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.length === 0 ? (
            <section className="md:col-span-2 lg:col-span-3 rounded-3xl border border-neutral-800 bg-[#141414] p-10 text-center" aria-labelledby="services-empty-title">
              <h2 id="services-empty-title" className="text-xl font-bold text-white">لا توجد خدمات متاحة عبر الموقع حاليًا</h2>
              <p className="mt-2 text-sm text-neutral-400">يمكنك التواصل مع فريق بريق لمعرفة الخدمات والمواعيد المتاحة.</p>
              <Link href="/contact" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-[#cea355]/40 px-5 py-2.5 text-sm font-bold text-[#edce8b] hover:bg-[#cea355]/10 transition-colors">
                تواصل معنا
              </Link>
            </section>
          ) : services.map((service) => (
            <div
              key={service.id}
              className="rounded-3xl glass-card border border-[#c9a227]/20 hover:border-[#c9a227]/60 transition-[border-color,box-shadow] flex flex-col justify-between overflow-hidden group gold-glow-hover"
            >
              <div>
                <div className="relative h-56 overflow-hidden">
                  <PublicImage
                    src={service.coverImage}
                    alt={service.nameAr}
                    sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-[#e5c45a] border border-[#c9a227]/30 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#c9a227]" aria-hidden="true" />
                    <span>{service.durationMinutes} دقيقة</span>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <h2 className="text-xl font-bold text-white group-hover:text-[#e5c45a] transition-colors">
                    {service.nameAr}
                  </h2>
                  <p className="text-neutral-400 text-xs leading-relaxed line-clamp-3">
                    {service.shortDescriptionAr}
                  </p>

                  {/* Included Items */}
                  {Array.isArray(service.includedItems) && (
                    <div className="space-y-2 pt-2 border-t border-neutral-800">
                      <span className="text-[11px] font-semibold text-[#e5c45a]">تشمل الخدمة:</span>
                      <ul className="space-y-1">
                        {(service.includedItems as string[]).slice(0, 3).map((item, idx) => (
                          <li key={idx} className="text-xs text-neutral-300 flex items-center gap-2">
                            <Check className="w-3.5 h-3.5 text-[#c9a227] shrink-0" aria-hidden="true" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Price & Action */}
              <div className="p-6 bg-[#141414]/60 border-t border-neutral-800/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-neutral-400 block">السعر الأساسي</span>
                  <span className="text-2xl font-black text-[#e5c45a]">{service.basePrice} <span className="text-xs font-normal text-neutral-400">ج.م</span></span>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/services/${service.slug}`}
                    className="px-3.5 py-2 rounded-xl bg-[#080808] border border-[#c9a227]/30 text-xs font-semibold text-neutral-300 hover:text-white transition-colors"
                  >
                    التفاصيل
                  </Link>
                  <Link
                    href={`/services/${service.slug}/book`}
                    className="px-4 py-2 rounded-xl gold-gradient text-[#080808] font-bold text-xs hover:brightness-110 transition-[filter,transform] shadow-md"
                  >
                    احجز الآن
                  </Link>
                </div>
              </div>

            </div>
          ))}
        </div>

      </main>

      <Footer />
    </div>
  );
}
