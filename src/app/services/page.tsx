import Link from 'next/link';
import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import PublicImage from '@/components/PublicImage';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { createPublicMetadata } from '@/lib/seo';
import { readServiceCollections } from '@/lib/service-collections';
import { Clock, CheckCircle2, Award, Layers, Filter, X } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = createPublicMetadata({
  title: 'خدمات العناية بالسيارات',
  description: 'استعرض جميع خدمات العناية المتنقلة وباقات الاشتراكات الدورية من بريق مع تفاصيل الأسعار والحجز المباشر.',
  path: '/services',
});

import { getServiceRealImage } from '@/lib/service-images';

interface ServicesPageProps {
  searchParams?: Promise<{ collection?: string; view?: string }> | { collection?: string; view?: string };
}

export default async function ServicesPage({ searchParams }: ServicesPageProps) {
  const resolvedParams = searchParams ? await Promise.resolve(searchParams) : {};
  const activeCollectionId = resolvedParams?.collection;
  
  // Default is 'services' (only services) unless explicitly requested 'all'
  const isViewAll = resolvedParams?.view === 'all' && !activeCollectionId;
  const showServices = true;
  const showPlans = isViewAll;

  const [user, brand, allServices, plans] = await Promise.all([
    getCurrentUser().catch(() => null),
    db.brandSettings.findFirst({ select: { homepageContent: true } }).catch(() => null),
    db.service.findMany({
      where: { active: true, bookableOnline: true },
      select: {
        id: true,
        slug: true,
        nameAr: true,
        shortDescriptionAr: true,
        coverImage: true,
        durationMinutes: true,
        slotCount: true,
        basePrice: true,
        requiresDeposit: true,
        depositType: true,
        depositValue: true,
        requiresFullPrepayment: true,
        benefits: true,
        includedItems: true,
      },
      orderBy: { basePrice: 'asc' },
    }),
    db.subscriptionPlan.findMany({
      where: { active: true },
      include: { services: { include: { service: true } } },
      orderBy: { price: 'asc' },
    }),
  ]);

  const collections = readServiceCollections(brand?.homepageContent).filter((c) => c.active);
  const selectedCollection = activeCollectionId ? collections.find((c) => c.id === activeCollectionId) : null;

  // Filter services if a specific collection with assigned services is selected
  const displayedServices = selectedCollection
    ? allServices.filter((s) => {
        if (selectedCollection.serviceIds && selectedCollection.serviceIds.length > 0) {
          return selectedCollection.serviceIds.includes(s.id);
        }
        const cid = selectedCollection.id.toLowerCase();
        const ctitle = selectedCollection.titleAr.toLowerCase();
        const slug = s.slug.toLowerCase();
        const sname = s.nameAr.toLowerCase();

        if (cid.includes('exterior') || ctitle.includes('خارجي') || ctitle.includes('دهان')) {
          return slug.includes('exterior') || slug.includes('complete') || slug.includes('vip') || sname.includes('خارجي') || sname.includes('شامل') || sname.includes('ملكية');
        }
        if (cid.includes('interior') || ctitle.includes('داخلي') || ctitle.includes('جلد') || ctitle.includes('فرش')) {
          return slug.includes('interior') || slug.includes('upholstery') || slug.includes('roof') || slug.includes('complete') || sname.includes('داخلي') || sname.includes('فرش') || sname.includes('سقف');
        }
        if (cid.includes('engine') || ctitle.includes('موتور') || ctitle.includes('محرك')) {
          return slug.includes('engine') || slug.includes('vip') || sname.includes('موتور') || sname.includes('محرك');
        }
        return true;
      })
    : allServices;

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-[#cea355] selection:text-black" dir="rtl">
      <Navbar user={user} />

      <main id="main-content" className="flex-1 pt-32 pb-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-14">
        
        {/* Page Header */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <h1 className="text-3xl sm:text-5xl font-black text-white">
            {isViewAll ? 'كافة الخدمات وباقات العناية' : 'خدمات بريق المتخصصة'}
          </h1>
          <p className="text-white text-sm sm:text-base leading-relaxed">
            {isViewAll
              ? 'جميع خدماتنا وباقاتنا تُنفّذ بمواد مخصصة وحماية فائقة للدهان والفرش بدون قطرة مياه. اختر الخدمة الفردية أو باقة الزيارات الدورية المناسبة لك.'
              : 'جميع خدماتنا تُنفّذ بمواد مخصصة وحماية فائقة للدهان والفرش بدون قطرة مياه، مع حجز مباشر لكل زيارة.'}
          </p>
        </div>

        {/* View Switcher / Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800/80 pb-6">
          <div className="flex items-center gap-2 p-1 rounded-2xl bg-[#111111] border border-neutral-800">
            <Link
              href="/services"
              className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${
                !isViewAll
                  ? 'gold-gradient text-neutral-950 shadow-md shadow-[#cea355]/20'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>الخدمات الفردية</span>
            </Link>
            <Link
              href="/services?view=all"
              className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center gap-2 ${
                isViewAll
                  ? 'gold-gradient text-neutral-950 shadow-md shadow-[#cea355]/20'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
              }`}
            >
              <Award className="w-4 h-4" />
              <span>كافة الخدمات والاشتراكات</span>
            </Link>
          </div>

          <span className="text-xs text-neutral-400 font-semibold">
            {displayedServices.length} خدمات متاحة للحجز
          </span>
        </div>

        {/* Collections Filter Pills */}
        {collections.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <span className="text-xs font-bold text-neutral-400 ml-2 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#cea355]" />
              <span>التصنيفات:</span>
            </span>
            <Link
              href="/services"
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                !activeCollectionId
                  ? 'border-[#cea355] bg-[#cea355]/15 text-[#edce8b]'
                  : 'border-neutral-800 bg-[#121212] text-neutral-400 hover:border-neutral-700 hover:text-white'
              }`}
            >
              الكل ({allServices.length})
            </Link>
            {collections.map((col) => {
              const isSelected = activeCollectionId === col.id;
              return (
                <Link
                  key={col.id}
                  href={`/services?collection=${encodeURIComponent(col.id)}`}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                    isSelected
                      ? 'border-[#cea355] bg-[#cea355]/15 text-[#edce8b]'
                      : 'border-neutral-800 bg-[#121212] text-neutral-400 hover:border-neutral-700 hover:text-white'
                  }`}
                >
                  <span>{col.titleAr}</span>
                  {isSelected && <X className="w-3 h-3 text-[#cea355]" />}
                </Link>
              );
            })}
          </div>
        )}

        {/* ==================================================== */}
        {/* 1. SERVICES GRID SECTION                             */}
        {/* ==================================================== */}
        {showServices && (
          <section id="individual-services" className="space-y-6">
            {displayedServices.length === 0 ? (
              <section aria-label="لا توجد خدمات مطابقة" className="text-center py-20 rounded-3xl bg-[#121212] border border-neutral-800">
                <p className="text-neutral-400 text-sm font-semibold">لا توجد خدمات متاحة ضمن هذا التصنيف حالياً.</p>
                <Link href="/services" className="mt-4 inline-block px-5 py-2.5 rounded-xl gold-gradient text-neutral-950 font-bold text-xs">
                  عرض كافة الخدمات
                </Link>
              </section>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {displayedServices.map((service) => {
                  const realImg = getServiceRealImage(service.slug, service.coverImage);
                  const slotCount = service.slotCount || Math.max(1, Math.round(service.durationMinutes / 60));
                  const depositEgp = service.requiresFullPrepayment
                    ? service.basePrice
                    : service.depositType === 'PERCENTAGE'
                      ? Math.round((service.basePrice * (service.depositValue || 30)) / 100)
                      : (service.depositValue || 30);

                  return (
                    <div
                      key={service.id}
                      className="rounded-3xl bg-[#121212] border border-[#cea355]/25 hover:border-[#cea355] transition-all glass-card-hover flex flex-col justify-between overflow-hidden group"
                    >
                      <div>
                        <div className={`relative h-60 overflow-hidden ${realImg.includes('logo') ? 'bg-gradient-to-b from-[#141412] to-[#080808] flex items-center justify-center' : 'bg-[#0d0d0d]'}`}>
                          <PublicImage
                            src={realImg}
                            alt={service.nameAr}
                            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                            className={
                              realImg.includes('logo')
                                ? 'max-h-32 w-auto object-contain p-6 drop-shadow-[0_4px_20px_rgba(206,163,85,0.25)] group-hover:scale-105 transition-transform duration-500'
                                : 'w-full h-full object-cover group-hover:scale-108 transition-transform duration-700'
                            }
                          />
                          <div className="absolute top-4 right-4 bg-black/85 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-bold text-[#edce8b] border border-[#cea355]/40 flex items-center gap-1.5 shadow-lg">
                            <Clock className="w-3.5 h-3.5 text-[#d4af37]" />
                            <span>المدة: {service.durationMinutes} دقيقة ({slotCount} سلوت)</span>
                          </div>
                        </div>

                        <div className="p-7 space-y-4">
                          <h3 className="text-xl font-extrabold text-white group-hover:text-[#edce8b] transition-colors">
                            {service.nameAr}
                          </h3>
                          <p className="text-neutral-300 text-xs leading-relaxed line-clamp-2">
                            {service.shortDescriptionAr}
                          </p>

                          {((Array.isArray(service.benefits) && service.benefits.length > 0)
                            ? (service.benefits as string[])
                            : (Array.isArray(service.includedItems) ? (service.includedItems as string[]) : [])
                          ).length > 0 && (
                            <div className="space-y-2 pt-3 border-t border-neutral-800/80">
                              {((Array.isArray(service.benefits) && service.benefits.length > 0)
                                ? (service.benefits as string[])
                                : (Array.isArray(service.includedItems) ? (service.includedItems as string[]) : [])
                              ).slice(0, 3).map((item, idx) => (
                                <div key={idx} className="text-xs text-neutral-300 flex items-center gap-2">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-[#cea355] shrink-0" />
                                  <span className="truncate text-neutral-200">{item}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="p-7 pt-0 space-y-4">
                        <div className="flex items-center justify-between border-t border-neutral-800/80 pt-4">
                          <div>
                            <span className="text-[11px] text-neutral-400 block font-medium">السعر يبدأ من</span>
                            <span className="text-2xl font-black text-[#edce8b]">{service.basePrice} <span className="text-xs font-normal text-white">ج.م</span></span>
                            {service.requiresFullPrepayment ? (
                              <span className="mt-1 block text-[10px] font-bold text-amber-400">
                                دفع كامل المبلغ مسبقاً
                              </span>
                            ) : service.requiresDeposit ? (
                              <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#f3e4a8] bg-[#d4af37]/15 border border-[#d4af37]/35 px-2 py-0.5 rounded-md">
                                <span>العربون:</span>
                                <span className="text-white">{depositEgp} ج.م</span>
                                {service.depositType === 'PERCENTAGE' && <span className="text-[#cea355]">({service.depositValue}%)</span>}
                              </span>
                            ) : (
                              <span className="mt-1 block text-[10px] font-bold text-emerald-400">
                                بدون عربون مسبق
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Link
                              href={`/services/${service.slug}`}
                              className="px-4 py-2.5 rounded-xl bg-[#1a1a1a] border border-[#cea355]/30 text-xs font-bold text-white hover:border-[#cea355] transition-all"
                            >
                              التفاصيل
                            </Link>
                            <Link
                              href={`/services/${service.slug}/book`}
                              className="px-5 py-2.5 rounded-xl gold-gradient text-neutral-950 font-extrabold text-xs hover:brightness-110 transition-all shadow-lg shadow-[#cea355]/20 active:scale-95"
                            >
                              احجز الآن
                            </Link>
                          </div>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ==================================================== */}
        {/* 2. SUBSCRIPTION PLANS SECTION (ONLY ON VIEW ALL)     */}
        {/* ==================================================== */}
        {showPlans && plans.length > 0 && (
          <section id="subscription-plans" className="space-y-10 pt-8 border-t border-neutral-900">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-neutral-800/80 pb-6">
              <div className="space-y-1">
                <span className="text-xs font-bold text-[#edce8b] uppercase tracking-wider">اشتراكات دورية وتوفير مستمر</span>
                <h2 className="text-2xl sm:text-3xl font-black text-white">باقات الاشتراكات الشهرية والعائلية</h2>
              </div>
              <span className="text-xs font-semibold text-white bg-[#121212] px-3.5 py-1.5 rounded-full border border-neutral-800">
                {plans.length} باقات دورية
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {plans.map((plan, idx) => {
                const isFeatured = idx === 1 || plan.price > 2000;
                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-3xl bg-[#121212] p-8 space-y-6 flex flex-col justify-between transition-all glass-card-hover ${
                      isFeatured
                        ? 'border-2 border-[#cea355] shadow-[0_0_35px_rgba(206,163,85,0.25)]'
                        : 'border border-[#cea355]/30 hover:border-[#cea355]'
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="px-3 py-1 rounded-full bg-[#cea355]/15 text-[#edce8b] text-xs font-bold border border-[#cea355]/30">
                          صلاحية {plan.validityDays} يوم
                        </span>
                        <Award className="w-6 h-6 text-white" aria-hidden="true" />
                      </div>

                      <h3 className="text-2xl font-black text-white">{plan.nameAr}</h3>
                      <p className="text-xs text-white leading-relaxed">{plan.descriptionAr}</p>

                      <div className="py-4 border-y border-neutral-800/80">
                        <span className="text-3xl font-black text-[#edce8b]">{plan.price} ج.م</span>
                        <span className="text-xs text-white me-2">/ باقة دورية</span>
                      </div>

                      <div className="space-y-3 pt-1">
                        <span className="text-xs font-bold text-[#edce8b] block">الخدمات والمزايا المشمولة:</span>
                        <ul className="space-y-2.5 text-xs text-white">
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-white shrink-0" aria-hidden="true" />
                            <span>تشمل {plan.visitCount} زيارات عناية جافة شاملة</span>
                          </li>
                          {plan.services.map(({ service, visitQuota }) => (
                            <li key={service.id} className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-white shrink-0" aria-hidden="true" />
                              <span>{service.nameAr}{visitQuota !== null ? ` — ${visitQuota} زيارة` : ''}</span>
                            </li>
                          ))}
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-white shrink-0" aria-hidden="true" />
                            <span>تأكيد المواعيد تلقائياً بدون طلب بياناتك مجدداً</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-white shrink-0" aria-hidden="true" />
                            <span>أولوية الإسناد لفرق التشغيل المخصصة</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <Link
                      href={`/account/subscriptions?plan=${plan.id}`}
                      className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-extrabold text-sm transition-all shadow-lg active:scale-98 ${
                        isFeatured
                          ? 'gold-gradient text-white shadow-[#cea355]/30 hover:brightness-110'
                          : 'bg-[#1a1a1a] text-white border border-[#cea355]/40 hover:bg-[#cea355]/20 hover:border-[#cea355]'
                      }`}
                    >
                      <span>اشترك الآن</span>
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

      </main>

      <Footer />
    </div>
  );
}
