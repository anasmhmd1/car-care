import Link from 'next/link';
import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import PublicImage from '@/components/PublicImage';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { createPublicMetadata } from '@/lib/seo';
import { readServiceCollections } from '@/lib/service-collections';
import { readGalleryItems } from '@/lib/gallery-items';
import {
  Sparkles,
  Calendar,
  ShieldCheck,
  ChevronRight,
  Star,
  MapPin,
  AlertCircle,
  Wrench,
  ShieldAlert,
  ArrowLeft,
  Layers
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = createPublicMetadata({
  title: 'CAR CARE',
  description: 'CAR CARE Premium Mobile Auto Care — official website.',
  path: '/',
});

function publicCustomerName(fullName: string) {
  const trimmed = fullName.trim();
  return trimmed || 'عميل كار كير';
}

function isFaqList(value: unknown): value is Array<{ q: string; a: string }> {
  return Array.isArray(value) && value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      'q' in item &&
      'a' in item &&
      typeof item.q === 'string' &&
      typeof item.a === 'string',
  );
}

export default async function HomePage() {
  let user: Awaited<ReturnType<typeof getCurrentUser>> = null;
  let testimonials: Array<{
    id: string;
    score: number;
    comment: string | null;
    customer: { user: { fullName: string } };
    booking: { service: { nameAr: string } };
  }> = [];
  let brand: { homepageContent: unknown; faqs: unknown } | null = null;

  try {
    const results = await Promise.all([
      getCurrentUser().catch(() => null),
      db.customerServiceRating.findMany({
        where: { approvedForPublic: true, comment: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          score: true,
          comment: true,
          customer: { select: { user: { select: { fullName: true } } } },
          booking: { select: { service: { select: { nameAr: true } } } },
        },
      }).catch(() => []),
      db.brandSettings.findFirst({ select: { homepageContent: true, faqs: true } }).catch(() => null),
    ]);

    [user, testimonials, brand] = results;
  } catch (err) {
    console.error('Error fetching HomePage data:', err);
  }

  const publishedTestimonials = testimonials.filter((rating) => rating.comment?.trim());

  const fallbackTestimonials = [
    {
      id: 'rev_1',
      score: 5,
      comment: 'تجربة ممتازة جداً، الغسيل الجاف ممتاز ولمعان الدهان بعد الواكس رائع وريحني من مشوار المغسلة.',
      customer: { user: { fullName: 'م. أحمد الشناوي' } },
      booking: { service: { nameAr: 'باقة العناية الشاملة VIP' } },
    },
    {
      id: 'rev_2',
      score: 5,
      comment: 'دقة عالية في المواعيد واحترافية في تنظيف الفرش والجلد بدون أي روائح مزعجة. أنصح بهم بشدة.',
      customer: { user: { fullName: 'د. طارق محمود' } },
      booking: { service: { nameAr: 'غسيل داخلي وتطهير الفرش' } },
    },
    {
      id: 'rev_3',
      score: 5,
      comment: 'سيارة التشغيل مجهزة بكل المعدات ولم يحتاجوا لأي مياه أو كهرباء من الفيلا، شغل فندقي فاخر.',
      customer: { user: { fullName: 'أ. كريم عبد الرحمن' } },
      booking: { service: { nameAr: 'غسيل جاف خارجي وتلميع جنوط' } },
    },
  ];

  const displayTestimonials = publishedTestimonials.length > 0
    ? publishedTestimonials
    : fallbackTestimonials;

  const defaultFaqs = [
    {
      q: 'هل تحتاج خدمة كار كير لمصدر مياه أو كهرباء من موقع العميل؟',
      a: 'لا نهائياً، سيارات تشغيل كار كير مجهزة بالكامل بوحدات ذاتية ومعدات احترافية ومصادر خاصة للمهمة المتنقلة دون إزعاج بالكمبوند.'
    },
    {
      q: 'لماذا تعتبر تقنية الغسيل الجاف من كار كير أفضل من الغسيل بالمياه؟',
      a: 'تعتمد كار كير على 9 منتجات متخصصة ترفع الأتربة وتغلفها، مما يمنع الخدوش السطحية وبهتان الدهان ويحمي المحرك والكهرباء من أي تسريب للمياه.'
    },
    {
      q: 'كيف تضمن كار كير حماية الدهان والسطح الخارجي؟',
      a: 'تتضمن المواد طبقة واكس واقية تمنح السيارة لمعاناً زجاجياً فائقاً وتقلل التصاق الأتربة، مما يحافظ على القيمة السوقية لسيارتك.'
    },
    {
      q: 'كيف تعمل باقات اشتراكات كار كير الدورية في حساب العميل؟',
      a: 'الاشتراك يمنحك رصيد زيارات دورية ثابتة شهرياً. عند اختيار موعد الحجز من حسابك، يتم استخدام بياناتك المحفوظة تلقائياً ويُطلب منك تحديد بيانات السيارة فقط.'
    },
    {
      q: 'ما هي مناطق التغطية المتاحة حالياً لخدمة كار كير؟',
      a: 'نغطي مختلف المناطق والكمبوندات الرئيسية عبر فروع تشغيلنا المجهزة ونضمن التزاماً تاماً بالمواعيد الدقيقة.'
    }
  ];

  const faqs = isFaqList(brand?.faqs) && brand.faqs.length > 0 ? brand.faqs : defaultFaqs;
  const collections = readServiceCollections(brand?.homepageContent).filter((c) => c.active);
  const galleryItems = readGalleryItems(brand?.homepageContent).filter((g) => g.active);

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-[#cea355] selection:text-black">
      <Navbar user={user} />

      <main id="main-content" className="flex-1 overflow-x-hidden">

        {/* ---------------------------------------------------- */}
        {/* 1. HERO SECTION — DUAL DESKTOP & MOBILE EDITION     */}
        {/* ---------------------------------------------------- */}
        <section className="relative min-h-[85vh] lg:min-h-[750px] w-full flex flex-col justify-between overflow-hidden bg-[#000000] border-b border-neutral-900 pt-20 pb-8 lg:pt-24 lg:pb-12">

          {/* Desktop Background: Full-Bleed Studio BMW Photo */}
          <div className="hidden lg:block absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <PublicImage
              src="/images/bareeq_user_bmw_hero_bg.png"
              alt="BAREEQ — Premium Mobile Auto Care"
              sizes="100vw"
              priority
              quality={100}
              unoptimized={true}
              className="w-full h-full object-cover object-center scale-100"
            />
            {/* Soft Ambient Contrast Vignette for Left Side text readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent pointer-events-none z-[1]" />
          </div>

          {/* ==================================================== */}
          {/* A. DESKTOP HERO CONTENT (TEXT ON LEFT / BOTTLES ON RIGHT) */}
          {/* ==================================================== */}
          <div className="hidden lg:block max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full mt-4 mb-auto">
            <div className="flex flex-row items-center justify-between gap-8">

              {/* Right Side spacer (keeps the bottles & detailing kit on the right 100% visible) */}
              <div className="w-1/2" />

              {/* Left Side Text Container (over the van) */}
              <div className="w-1/2 space-y-10 text-right">

                {/* Main Title */}
                <div className="w-full" dir="ltr">
                  <div className="inline-block text-left">
                    <h1 className="text-5xl xl:text-6xl font-black tracking-tight leading-[1.12]">
                      <span className="block text-[#d99b42] drop-shadow-md">Premium Mobile</span>
                      <span className="block text-[#d99b42] drop-shadow-md">Auto Care,</span>
                      <span className="block text-white drop-shadow-md">Crafted for</span>
                      <span className="inline-block text-white drop-shadow-md relative pb-1">
                        Your Time.
                        {/* Orange Accent Line starting from Y to the end of Your Time. */}
                        <span className="absolute -bottom-2 left-0 right-0 h-[3px] bg-[#d99b42] rounded-full shadow-[0_0_12px_rgba(217,155,66,0.7)]" />
                      </span>
                    </h1>
                  </div>
                </div>

                {/* Description & Buttons pushed down into the open space */}
                <div className="space-y-6 pt-6 xl:pt-12">
                  <p className="text-neutral-200 text-lg leading-relaxed max-w-xl font-normal drop-shadow-md">
                    نقدم خدمة غسيل جاف وعناية احترافية متنقلة تحافظ على طلاء السيارة ومظهرها الداخلي والخارجي، بأعلى مستوى من الجودة والاحترافية.
                  </p>

                  {/* CTA Buttons */}
                  <div className="flex flex-row items-center gap-4 pt-2">
                    <Link
                      href="/services"
                      className="flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-2xl bg-gradient-to-r from-[#d99b42] to-[#b87d2b] text-white font-extrabold text-base shadow-xl shadow-[#d99b42]/25 hover:brightness-110 active:scale-98 transition-all group"
                    >
                      <Calendar className="w-5 h-5 text-white group-hover:scale-110 transition-transform" aria-hidden="true" />
                      <span>احجز خدمتك الآن</span>
                    </Link>

                    <Link
                      href="/plans"
                      className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-black/80 border border-[#d99b42]/50 text-white hover:bg-[#d99b42]/15 hover:border-[#d99b42] font-bold text-base transition-all backdrop-blur-md shadow-lg"
                    >
                      <ChevronRight className="w-4 h-4 text-white" aria-hidden="true" />
                      <span>استعرض الباقات</span>
                    </Link>
                  </div>
                </div>

              </div>

            </div>
          </div>

          {/* ==================================================== */}
          {/* B. MOBILE HERO CONTENT (EXACT MATCH TO MOCKUP)       */}
          {/* ==================================================== */}
          <div className="lg:hidden max-w-7xl mx-auto px-5 relative z-10 w-full flex flex-col justify-between flex-1 pt-1 pb-6 space-y-4">

            {/* Top: English Headline with Orange Accent Line under Your Time. */}
            <div className="w-full flex justify-end pt-2" dir="ltr">
              <div className="text-right inline-block">
                <h1 className="text-3xl xs:text-4xl font-black tracking-tight leading-[1.14]">
                  <span className="block text-[#d99b42]">Premium Mobile</span>
                  <span className="block text-[#d99b42]">Auto Care,</span>
                  <span className="block text-white">Crafted for</span>
                  <span className="inline-block text-white relative pb-1">
                    Your Time.
                    {/* Orange/Gold Accent Line starting exactly from 'Y' to the end of 'Your Time.' */}
                    <span className="absolute -bottom-1.5 left-0 right-0 h-[2.5px] bg-[#d99b42] rounded-full shadow-[0_0_10px_rgba(217,155,66,0.7)]" />
                  </span>
                </h1>
              </div>
            </div>

            {/* Middle Visual: BMW image seamlessly blended into black background */}
            <div className="w-full relative aspect-[4/3] xs:aspect-[1.38/1] overflow-hidden my-0">
              <PublicImage
                src="/images/bareeq_user_bmw_hero_bg.png"
                alt="BAREEQ Mobile Care BMW"
                sizes="100vw"
                priority
                quality={100}
                unoptimized={true}
                className="w-full h-full object-cover object-center"
              />
              {/* Subtle narrow black blend vignette around edges to melt seamlessly into the background */}
              <div className="absolute inset-0 pointer-events-none [box-shadow:inset_0_0_12px_6px_#000000] z-[2]" />
              <div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-black to-transparent pointer-events-none z-[2]" />
              <div className="absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-black to-transparent pointer-events-none z-[2]" />
            </div>

            {/* Bottom: Arabic Description + 2 Side-by-Side Rounded Buttons */}
            <div className="space-y-4 pt-1 text-right">
              <p className="text-neutral-200 text-xs xs:text-sm leading-relaxed font-normal drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
                نقدم خدمة غسيل جاف وعناية احترافية متنقلة تحافظ على طلاء السيارة ومظهرها الداخلي والخارجي، بأعلى مستوى من الجودة والاحترافية.
              </p>

              <div className="flex flex-row items-center justify-between gap-2.5 xs:gap-3 pt-1 w-full">
                {/* Right Button (Primary): احجز خدمتك الآن */}
                <Link
                  href="/services"
                  className="flex-1 flex items-center justify-center gap-2 px-3.5 py-3.5 rounded-2xl bg-gradient-to-r from-[#d99b42] to-[#b87d2b] text-white font-black text-xs xs:text-sm shadow-xl shadow-[#d99b42]/25 hover:brightness-110 active:scale-98 transition-all"
                >
                  <span className="whitespace-nowrap">احجز خدمتك الآن</span>
                  <Calendar className="w-4 h-4 text-white shrink-0" aria-hidden="true" />
                </Link>

                {/* Left Button (Secondary): استعرض الباقات */}
                <Link
                  href="/plans"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-3.5 rounded-2xl bg-black/90 border border-[#d99b42]/50 text-white hover:bg-[#d99b42]/15 font-bold text-xs xs:text-sm transition-all backdrop-blur-md shadow-lg active:scale-98"
                >
                  <span className="whitespace-nowrap">استعرض الباقات</span>
                  <ChevronRight className="w-3.5 h-3.5 text-white shrink-0" aria-hidden="true" />
                </Link>
              </div>
            </div>

          </div>

        </section>

        {/* ---------------------------------------------------- */}
        {/* 2. OUR SERVICES (4 QUICK FEATURE CARDS IN 1 ROW)     */}
        {/* ---------------------------------------------------- */}
        <section className="py-12 sm:py-16 bg-[#050505] relative border-b border-neutral-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            
            {/* Section Header: OUR SERVICES */}
            <div className="text-center space-y-2">
              <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-[#121212] border border-[#cea355]/40 text-xs font-black uppercase tracking-[0.25em] text-[#edce8b] shadow-md">
                OUR SERVICES
              </span>
            </div>

            {/* 4 Cards Grid: Exact Order matching reference image (RTL: غسيل كيماوي للفرش -> تلميع موتور -> غسيل داخلي -> غسيل خارجي) */}
            <div className="grid grid-cols-4 gap-1.5 xs:gap-2 sm:gap-4 lg:gap-6 max-w-6xl mx-auto items-stretch">
              
              {/* Card 1 (Right): غسيل كيماوي للفرش */}
              <div className="rounded-xl sm:rounded-3xl bg-[#181818] p-2 xs:p-2.5 sm:p-5 lg:p-7 text-center flex flex-col items-center justify-start transition-all duration-300 hover:bg-[#202020] shadow-xl group">
                <div className="h-9 xs:h-11 sm:h-14 lg:h-16 flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform mb-1 sm:mb-3">
                  <svg className="w-7 h-7 xs:w-9 xs:h-9 sm:w-12 sm:h-12 lg:w-14 lg:h-14 text-white" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 10C22 18 14 26 18 34C22 42 14 50 18 54" stroke="white" strokeWidth="3" strokeLinecap="round" />
                    <path d="M32 10C36 18 28 26 32 34C36 42 28 50 32 54" stroke="white" strokeWidth="3" strokeLinecap="round" />
                    <path d="M46 10C50 18 42 26 46 34C50 42 42 50 46 54" stroke="white" strokeWidth="3" strokeLinecap="round" />
                    <circle cx="25" cy="18" r="3" fill="white" />
                    <circle cx="39" cy="22" r="3" fill="white" />
                    <circle cx="25" cy="44" r="2.5" fill="white" />
                    <circle cx="39" cy="46" r="2.5" fill="white" />
                  </svg>
                </div>
                <div className="h-7 xs:h-8 sm:h-10 lg:h-12 flex items-center justify-center text-center w-full mb-1 sm:mb-2">
                  <h3 className="text-[8.5px] xs:text-[10px] sm:text-base lg:text-xl font-black text-white group-hover:text-[#edce8b] transition-colors leading-tight text-center">
                    غسيل كيماوي للفرش
                  </h3>
                </div>
                <div className="w-full">
                  <p className="text-[7px] xs:text-[8px] sm:text-xs lg:text-sm text-neutral-300 leading-tight sm:leading-relaxed font-normal text-center">
                    إزالة البقع والروائح الكريهة مع الحفاظ على فرش السيارة نظيفاً.
                  </p>
                </div>
              </div>

              {/* Card 2: تلميع موتور */}
              <div className="rounded-xl sm:rounded-3xl bg-[#181818] p-2 xs:p-2.5 sm:p-5 lg:p-7 text-center flex flex-col items-center justify-start transition-all duration-300 hover:bg-[#202020] shadow-xl group">
                <div className="h-9 xs:h-11 sm:h-14 lg:h-16 flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform mb-1 sm:mb-3">
                  <svg className="w-7 h-7 xs:w-9 xs:h-9 sm:w-12 sm:h-12 lg:w-14 lg:h-14 text-white" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M32 8L14 15V32C14 44.5 21.7 54.3 32 58C42.3 54.3 50 44.5 50 32V15L32 8Z" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M23 27L41 39" stroke="white" strokeWidth="3" strokeLinecap="round" />
                    <path d="M41 27L23 39" stroke="white" strokeWidth="3" strokeLinecap="round" />
                    <path d="M32 21V45" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="h-7 xs:h-8 sm:h-10 lg:h-12 flex items-center justify-center text-center w-full mb-1 sm:mb-2">
                  <h3 className="text-[8.5px] xs:text-[10px] sm:text-base lg:text-xl font-black text-white group-hover:text-[#edce8b] transition-colors leading-tight text-center">
                    تلميع موتور
                  </h3>
                </div>
                <div className="w-full">
                  <p className="text-[7px] xs:text-[8px] sm:text-xs lg:text-sm text-neutral-300 leading-tight sm:leading-relaxed font-normal text-center">
                    لمعان وحماية طويلة الأمد لموتور سيارتك.
                  </p>
                </div>
              </div>

              {/* Card 3: غسيل داخلي */}
              <div className="rounded-xl sm:rounded-3xl bg-[#181818] p-2 xs:p-2.5 sm:p-5 lg:p-7 text-center flex flex-col items-center justify-start transition-all duration-300 hover:bg-[#202020] shadow-xl group">
                <div className="h-9 xs:h-11 sm:h-14 lg:h-16 flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform mb-1 sm:mb-3">
                  <svg className="w-7 h-7 xs:w-9 xs:h-9 sm:w-12 sm:h-12 lg:w-14 lg:h-14 text-white" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="15" y="10" width="10" height="7" rx="3.5" stroke="white" strokeWidth="2.8" />
                    <path d="M13 21H27C28.1 21 29 21.9 29 23V37C29 38.1 28.1 39 27 39H13C11.9 39 11 38.1 11 37V23C11 21.9 11.9 21 13 21Z" stroke="white" strokeWidth="2.8" />
                    <path d="M9 43H31C32.1 43 33 43.9 33 45V48C33 50.2 31.2 52 29 52H11C8.8 52 7 50.2 7 48V45C7 43.9 7.9 43 9 43Z" stroke="white" strokeWidth="2.8" />
                    <rect x="39" y="10" width="10" height="7" rx="3.5" stroke="white" strokeWidth="2.8" />
                    <path d="M37 21H51C52.1 21 53 21.9 53 23V37C53 38.1 52.1 39 51 39H37C35.9 39 35 38.1 35 37V23C35 21.9 35.9 21 37 21Z" stroke="white" strokeWidth="2.8" />
                    <path d="M33 43H55C56.1 43 57 43.9 57 45V48C57 50.2 55.2 52 53 52H35C32.8 52 31 50.2 31 48V45C31 43.9 31.9 43 33 43Z" stroke="white" strokeWidth="2.8" />
                  </svg>
                </div>
                <div className="h-7 xs:h-8 sm:h-10 lg:h-12 flex items-center justify-center text-center w-full mb-1 sm:mb-2">
                  <h3 className="text-[8.5px] xs:text-[10px] sm:text-base lg:text-xl font-black text-white group-hover:text-[#edce8b] transition-colors leading-tight text-center">
                    غسيل داخلي
                  </h3>
                </div>
                <div className="w-full">
                  <p className="text-[7px] xs:text-[8px] sm:text-xs lg:text-sm text-neutral-300 leading-tight sm:leading-relaxed font-normal text-center">
                    تنظيف عميق لفرش السيارة من أجل داخلية منعشة وصحية.
                  </p>
                </div>
              </div>

              {/* Card 4 (Left): غسيل خارجي */}
              <div className="rounded-xl sm:rounded-3xl bg-[#181818] p-2 xs:p-2.5 sm:p-5 lg:p-7 text-center flex flex-col items-center justify-start transition-all duration-300 hover:bg-[#202020] shadow-xl group">
                <div className="h-9 xs:h-11 sm:h-14 lg:h-16 flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform mb-1 sm:mb-3">
                  <svg className="w-7 h-7 xs:w-9 xs:h-9 sm:w-12 sm:h-12 lg:w-14 lg:h-14 text-white" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 8L16 13L21 15L16 17L14 22L12 17L7 15L12 13L14 8Z" fill="white" />
                    <path d="M26 6L27.5 9.5L31 11L27.5 12.5L26 16L24.5 12.5L21 11L24.5 9.5L26 6Z" fill="white" />
                    <path d="M8 24L9 26.5L11.5 27.5L9 28.5L8 31L7 28.5L4.5 27.5L7 26.5L8 24Z" fill="white" />
                    <path d="M18 36L23 26H41L46 36" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M12 36H52C54.2 36 56 37.8 56 40V46C56 47.1 55.1 48 54 48H52M12 36C9.8 36 8 37.8 8 40V46C8 47.1 8.9 48 10 48H12M12 36V48" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M14 41H20" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M44 41H50" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="18" cy="48" r="4.5" stroke="white" strokeWidth="3" fill="#181818" />
                    <circle cx="46" cy="48" r="4.5" stroke="white" strokeWidth="3" fill="#181818" />
                    <path d="M22.5 48H41.5" stroke="white" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="h-7 xs:h-8 sm:h-10 lg:h-12 flex items-center justify-center text-center w-full mb-1 sm:mb-2">
                  <h3 className="text-[8.5px] xs:text-[10px] sm:text-base lg:text-xl font-black text-white group-hover:text-[#edce8b] transition-colors leading-tight text-center">
                    غسيل خارجي
                  </h3>
                </div>
                <div className="w-full">
                  <p className="text-[7px] xs:text-[8px] sm:text-xs lg:text-sm text-neutral-300 leading-tight sm:leading-relaxed font-normal text-center">
                    غسيل جاف آمن يزيل الأتربة ويعزز اللمعان.
                  </p>
                </div>
              </div>

            </div>

            {/* Bottom Button: استعرض جميع الخدمات */}
            <div className="text-center pt-3">
              <Link
                href="/services"
                className="inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-2xl gold-gradient text-white hover:brightness-110 text-sm sm:text-base font-extrabold transition-all shadow-xl shadow-[#cea355]/25 active:scale-98"
              >
                <span>استعرض جميع الخدمات</span>
                <ChevronRight className="w-4 h-4 rotate-180 text-white" aria-hidden="true" />
              </Link>
            </div>

          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 3. SPEC FEATURE CARDS (3 COLUMNS ON ALL SCREENS)     */}
        {/* ---------------------------------------------------- */}
        <section className="py-6 sm:py-8 bg-[#050505] border-b border-neutral-900">
          <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
            <div className="grid grid-cols-3 gap-1.5 xs:gap-2 sm:gap-4 lg:gap-5 text-center">
              
              {/* Item 1 */}
              <div className="flex flex-col items-center justify-start p-2.5 xs:p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-[#181818] space-y-1.5 sm:space-y-2 transition-all hover:bg-[#202020] shadow-md overflow-hidden">
                <div className="w-8 h-8 xs:w-9 xs:h-9 sm:w-12 sm:h-12 flex items-center justify-center text-white shrink-0">
                  <MapPin className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="space-y-0.5 w-full">
                  <h4 className="text-[9.5px] xs:text-xs sm:text-base font-bold text-white leading-tight whitespace-nowrap">الخدمة حتى باب منزلك</h4>
                  <p className="text-[8px] xs:text-[9.5px] sm:text-xs text-neutral-300 leading-tight">نصل إليك أينما كنت</p>
                </div>
              </div>

              {/* Item 2 */}
              <div className="flex flex-col items-center justify-start p-2.5 xs:p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-[#181818] space-y-1.5 sm:space-y-2 transition-all hover:bg-[#202020] shadow-md overflow-hidden">
                <div className="w-8 h-8 xs:w-9 xs:h-9 sm:w-12 sm:h-12 flex items-center justify-center text-white shrink-0">
                  <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="space-y-0.5 w-full">
                  <h4 className="text-[9.5px] xs:text-xs sm:text-base font-bold text-white leading-tight whitespace-nowrap">منتجات آمنة على الطلاء</h4>
                  <p className="text-[8px] xs:text-[9.5px] sm:text-xs text-neutral-300 leading-tight">أعلى جودة حماية ولمعان</p>
                </div>
              </div>

              {/* Item 3 */}
              <div className="flex flex-col items-center justify-start p-2.5 xs:p-3 sm:p-5 rounded-xl sm:rounded-2xl bg-[#181818] space-y-1.5 sm:space-y-2 transition-all hover:bg-[#202020] shadow-md overflow-hidden">
                <div className="w-8 h-8 xs:w-9 xs:h-9 sm:w-12 sm:h-12 flex items-center justify-center text-white shrink-0">
                  <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="space-y-0.5 w-full">
                  <h4 className="text-[9.5px] xs:text-xs sm:text-base font-bold text-white leading-tight whitespace-nowrap">بدون استخدام المياه</h4>
                  <p className="text-[8px] xs:text-[9.5px] sm:text-xs text-neutral-300 leading-tight">تقنية غسيل جاف متطورة</p>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 3. QUALITY PILLARS & BRANDED PRODUCTS SHOWCASE */}
        {/* ---------------------------------------------------- */}
        <section id="why-bareeq" className="py-12 sm:py-20 lg:py-28 bg-[#050505] relative overflow-hidden">
          {/* Subtle Ambient Background Glows */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#cea355]/5 rounded-full blur-[140px] pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-8 sm:space-y-12">

            {/* Section Header */}
            <div className="text-center max-w-4xl mx-auto px-2">
              <h2 className="text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-snug sm:leading-tight lg:leading-[1.28] tracking-tight">
                لماذا تختار غسيل <span className="gold-gradient-text">كار كير</span> الجاف بدلاً من الغسيل التقليدي بالمياه؟
              </h2>
            </div>

            {/* Ultra-Wide 16:9 BAREEQ Branded Panoramic Product Banner Image */}
            <div className="relative w-full rounded-2xl lg:rounded-3xl border border-[#cea355]/40 bg-[#070707] shadow-[0_15px_60px_rgba(0,0,0,0.95)] overflow-hidden group">
              <div className="relative w-full aspect-[16/9] sm:aspect-[16/8] lg:aspect-[16/7.5] overflow-hidden bg-[#070707]">
                <PublicImage
                  src="/images/bareeq_dry_products_hq.jpg"
                  alt="منتجات كار كير CAR CARE الرسمية للعناية الجافة بالسيارات"
                  sizes="100vw"
                  priority
                  className="w-full h-full object-cover object-center scale-105 group-hover:scale-110 transition-transform duration-700"
                />
              </div>
            </div>

            {/* 4 Feature Pillars Grid (2x2 on Mobile, 4 Columns on Desktop) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-5 lg:gap-6">

              {/* Pillar 1 */}
              <div className="relative rounded-2xl lg:rounded-3xl p-5 sm:p-6 bg-gradient-to-b from-[#151515] via-[#101010] to-[#0a0a0a] border border-[#cea355]/25 hover:border-[#cea355] transition-all duration-300 glass-card-hover flex flex-col justify-between space-y-4 group overflow-hidden">
                <div className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-[#cea355]/50 to-transparent pointer-events-none" />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-[#cea355]/15 border border-[#cea355]/40 flex items-center justify-center text-white group-hover:scale-110 group-hover:bg-[#cea355] group-hover:text-white transition-all">
                      <Layers className="w-5 h-5 text-white" />
                    </div>
                    <span className="w-7 h-7 rounded-lg gold-gradient text-black font-black text-xs flex items-center justify-center shadow-md">
                      1
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-[#edce8b] transition-colors leading-tight">
                    منتجات عناية مخصصة فائقة الجودة
                  </h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    تركيبات احترافية آمنة لكل سطح بالسيارة: الدهان، الجلد، الفرش، التابلوه، الزجاج، والجنوط والموتور.
                  </p>
                </div>
              </div>

              {/* Pillar 2 */}
              <div className="relative rounded-2xl lg:rounded-3xl p-5 sm:p-6 bg-gradient-to-b from-[#151515] via-[#101010] to-[#0a0a0a] border border-[#cea355]/25 hover:border-[#cea355] transition-all duration-300 glass-card-hover flex flex-col justify-between space-y-4 group overflow-hidden">
                <div className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-[#cea355]/50 to-transparent pointer-events-none" />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-[#cea355]/15 border border-[#cea355]/40 flex items-center justify-center text-white group-hover:scale-110 group-hover:bg-[#cea355] group-hover:text-white transition-all">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <span className="w-7 h-7 rounded-lg gold-gradient text-black font-black text-xs flex items-center justify-center shadow-md">
                      2
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-[#edce8b] transition-colors leading-tight">
                    غسيل جاف 100% بدون مياه
                  </h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    يمنع تشكل البارومة والصدأ، ولا يسبب أي تسريب مياه للدوائر الكهربائية والحساسات.
                  </p>
                </div>
              </div>

              {/* Pillar 3 */}
              <div className="relative rounded-2xl lg:rounded-3xl p-5 sm:p-6 bg-gradient-to-b from-[#151515] via-[#101010] to-[#0a0a0a] border border-[#cea355]/25 hover:border-[#cea355] transition-all duration-300 glass-card-hover flex flex-col justify-between space-y-4 group overflow-hidden">
                <div className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-[#cea355]/50 to-transparent pointer-events-none" />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-[#cea355]/15 border border-[#cea355]/40 flex items-center justify-center text-white group-hover:scale-110 group-hover:bg-[#cea355] group-hover:text-white transition-all">
                      <ShieldCheck className="w-5 h-5 text-white" />
                    </div>
                    <span className="w-7 h-7 rounded-lg gold-gradient text-black font-black text-xs flex items-center justify-center shadow-md">
                      3
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-[#edce8b] transition-colors leading-tight">
                    طبقة واكس واقية
                  </h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    تمنح طبقة حماية على الدهان تقلل التصاق الأتربة وتساعد في الحفاظ على القيمة السوقية للسيارة.
                  </p>
                </div>
              </div>

              {/* Pillar 4 */}
              <div className="relative rounded-2xl lg:rounded-3xl p-5 sm:p-6 bg-gradient-to-b from-[#151515] via-[#101010] to-[#0a0a0a] border border-[#cea355]/25 hover:border-[#cea355] transition-all duration-300 glass-card-hover flex flex-col justify-between space-y-4 group overflow-hidden">
                <div className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-[#cea355]/50 to-transparent pointer-events-none" />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-[#cea355]/15 border border-[#cea355]/40 flex items-center justify-center text-white group-hover:scale-110 group-hover:bg-[#cea355] group-hover:text-white transition-all">
                      <Wrench className="w-5 h-5 text-white" />
                    </div>
                    <span className="w-7 h-7 rounded-lg gold-gradient text-black font-black text-xs flex items-center justify-center shadow-md">
                      4
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-[#edce8b] transition-colors leading-tight">
                    تجهيز كامل بدون إزعاج
                  </h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    فريق كار كير مجهز بوحدات تشغيل ذاتية كاملة دون الحاجة لمصدر مياه أو كهرباء من موقعك.
                  </p>
                </div>
              </div>

            </div>

          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 4. CARE COLLECTIONS (DYNAMIC OWNER-MANAGED)          */}
        {/* ---------------------------------------------------- */}
        {collections.length > 0 && (
          <section className="py-24 bg-[#080808] border-y border-neutral-800/80">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

              <div className="flex flex-col md:flex-row md:items-end justify-between mb-14 gap-4">
                <div className="space-y-2">
                  <h2 className="text-3xl sm:text-4xl font-black text-white">خدمات مخصصة لكل خامة بالسيارة</h2>
                </div>
                <Link
                  href="/services?view=all"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl gold-gradient text-white font-extrabold text-xs sm:text-sm shadow-md shadow-[#cea355]/20 hover:brightness-110 active:scale-95 transition-all"
                >
                  <span>استعرض كافة الخدمات والباقات</span>
                  <ChevronRight className="w-4 h-4 rotate-180" aria-hidden="true" />
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {collections.map((col) => (
                  <div
                    key={col.id}
                    className="group relative rounded-3xl overflow-hidden border border-[#cea355]/30 bg-[#121212] hover:border-[#cea355] transition-all duration-500 flex flex-col justify-between"
                  >
                    <div className="h-84 relative overflow-hidden bg-[#0d0d0d]">
                      <PublicImage
                        src={col.image}
                        alt={col.titleAr}
                        sizes="(min-width: 768px) 33vw, 100vw"
                        className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/40 to-transparent" />
                    </div>
                    <div className="p-7 relative z-10 -mt-16 space-y-4 flex-1 flex flex-col justify-between">
                      <div className="space-y-3">
                        <h3 className="text-2xl font-bold text-white group-hover:text-[#edce8b] transition-colors">{col.titleAr}</h3>
                        <p className="text-xs text-neutral-300 leading-relaxed">
                          {col.descriptionAr}
                        </p>
                      </div>
                      <Link
                        href={col.serviceIds && col.serviceIds.length > 0 ? `/services?collection=${col.id}` : '/services'}
                        className="pt-3 inline-flex items-center gap-2 text-xs font-extrabold text-white hover:gap-3 transition-all"
                      >
                        <span>التفاصيل والحجز</span>
                        <ArrowLeft className="w-4 h-4 text-white" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </section>
        )}



        {/* ---------------------------------------------------- */}
        {/* 6. PANORAMIC FULL-WIDTH HERO BANNER */}
        {/* ---------------------------------------------------- */}
        <section className="relative py-32 overflow-hidden bg-black border-y border-neutral-800">
          <div className="absolute inset-0">
            <PublicImage
              src="/images/bareeq_banner_van.png"
              alt="سيارات تشغيل كار كير المجهزة بالكامل حتى باب منزلك"
              sizes="100vw"
              className="w-full h-full object-cover opacity-35 scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-transparent" />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-right max-w-2xl me-auto">
            <div className="space-y-6">
              <h2 className="text-3xl sm:text-5xl font-black text-white leading-tight">
                تجربة عناية متنقلة راقية <span className="gold-gradient-text">تليق بسيارتك ووقتك</span>
              </h2>

              <p className="text-white text-sm sm:text-base leading-relaxed">
                لا داعي لإضاعة ساعات الانتظار في المغاسل أو المخاطرة بالغسيل العشوائي. وحدات كار كير المجهزة تصلك أينما كنت مع الالتزام التام بالمواعيد المحددة.
              </p>

              <div className="pt-3">
                <Link
                  href="/services?view=all"
                  className="inline-flex items-center justify-center gap-3 px-8 py-4.5 rounded-2xl gold-gradient text-white font-extrabold text-base shadow-2xl hover:brightness-110 transition-all active:scale-98"
                >
                  <Calendar className="w-5 h-5 text-white" aria-hidden="true" />
                  <span>احجز الخدمة المتنقلة الآن</span>
                </Link>
              </div>
            </div>
          </div>
        </section>



        {/* ---------------------------------------------------- */}
        {/* 8. KNOWLEDGE & COMPARISON (DRY WASH VS WATER WASH) */}
        {/* ---------------------------------------------------- */}
        <section className="py-28 bg-[#050505]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
              <h2 className="text-3xl sm:text-4xl font-black text-white">لماذا يعتبر الغسيل التقليدي بالمياه خياراً خاطئاً؟</h2>
              <p className="text-neutral-400 text-xs sm:text-sm">
                حقائق توضح الأضرار الناتجة عن الطرق التقليدية وكيف يحمي نظام كار كير الجاف قيمة سيارتك.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

              {/* Card 1 */}
              <div className="p-8 rounded-3xl bg-[#121212] border border-red-500/30 space-y-4 hover:border-red-500/60 transition-all glass-card-hover">
                <div className="w-13 h-13 rounded-2xl bg-red-500/10 border border-red-500/30 text-white flex items-center justify-center">
                  <ShieldAlert className="w-6 h-6 text-white" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-bold text-white">أضرار الغسيل التقليدي بالمياه</h3>
                <ul className="space-y-2.5 text-xs text-neutral-300 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 font-bold">•</span>
                    <span>بهتان الدهان وظهور خدوش دائرية من الفوط غير النظيفة.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 font-bold">•</span>
                    <span>تراكم المياه بالفواصل مما يسبب الصدأ والبارومة مع الوقت.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 font-bold">•</span>
                    <span>تسريب المياه للمكونات الحساسة والدوائر الكهربائية بالمحرك.</span>
                  </li>
                </ul>
              </div>

              {/* Card 2 */}
              <div className="p-8 rounded-3xl bg-[#121212] border border-amber-500/30 space-y-4 hover:border-amber-500/60 transition-all glass-card-hover">
                <div className="w-13 h-13 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-white flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-white" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-bold text-white">مخاطر الكيماويات العشوائية</h3>
                <ul className="space-y-2.5 text-xs text-neutral-300 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold">•</span>
                    <span>المواد القاسية تسبب تشقق وجفاف التابلوه والجلد والفرش.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold">•</span>
                    <span>ترك روائح حادة نفاذة قد تؤثر على الصحة العامة.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold">•</span>
                    <span>استخدام مادة واحدة لكل أجزاء السيارة بدون مراعاة الخامات.</span>
                  </li>
                </ul>
              </div>

              {/* Card 3 — Featured System */}
              <div className="p-8 rounded-3xl bg-[#121212] border border-[#cea355]/30 space-y-4 hover:border-[#cea355]/60 transition-all glass-card-hover">
                <div className="w-13 h-13 rounded-2xl bg-[#cea355]/10 border border-[#cea355]/30 text-white flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-white" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-bold text-white">ابتكار بريق: العناية الجافة 100%</h3>
                <ul className="space-y-2.5 text-xs text-neutral-300 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-[#cea355] font-bold">•</span>
                    <span>9 منتجات متخصصة آمنة مصنعة محلياً لكل جزء بالسيارة.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#cea355] font-bold">•</span>
                    <span>طبقة واكس واقية تمنح لمعاناً زجاجياً وتمنع التصاق الأتربة.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#cea355] font-bold">•</span>
                    <span>الحفاظ الكامل على القيمة السوقية ومظهر السيارة على المدى الطويل.</span>
                  </li>
                </ul>
              </div>

            </div>

          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 9. VISUAL GALLERY — BENTO GRID */}
        {/* ---------------------------------------------------- */}
        {/* 9. VISUAL GALLERY — BENTO GRID (DYNAMIC OWNER-MANAGED) */}
        {/* ---------------------------------------------------- */}
        {galleryItems.length > 0 && (
          <section className="py-28 bg-[#090909] border-t border-neutral-800/80">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

              <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
                <h2 className="text-3xl sm:text-4xl font-black text-white">لمسات بريق — نتائج حقيقية تتحدث عن الدقة</h2>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                {galleryItems.map((item) => (
                  <div key={item.id} className="rounded-3xl overflow-hidden border border-[#cea355]/25 h-68 relative group shadow-lg">
                    <PublicImage
                      src={item.image}
                      alt={item.altAr || item.titleAr}
                      sizes="(min-width: 768px) 33vw, 50vw"
                      className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-5 flex items-end">
                      <span className="text-xs font-extrabold text-[#edce8b]">{item.titleAr}</span>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </section>
        )}

        {/* ---------------------------------------------------- */}
        {/* 10. CUSTOMER TESTIMONIALS */}
        {/* ---------------------------------------------------- */}
        {/* 11. FAQ SECTION */}
        {/* ---------------------------------------------------- */}
        <section className="py-28 bg-[#050505]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16 space-y-3">
              <h2 className="text-3xl sm:text-4xl font-black text-white">الأسئلة الشائعة حول خدمات بريق</h2>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, idx) => (
                <div key={idx} className="p-7 rounded-3xl bg-[#121212] border border-[#cea355]/20 space-y-3 hover:border-[#cea355]/50 transition-all">
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-3">
                    <span className="w-7 h-7 rounded-xl gold-gradient text-black text-xs flex items-center justify-center font-extrabold shrink-0 shadow-md">؟</span>
                    <span>{faq.q}</span>
                  </h3>
                  <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed ps-10">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 12. CUSTOMER TESTIMONIALS (REVIEWED & APPROVED BY OWNER) */}
        {/* ---------------------------------------------------- */}
        <section className="py-28 bg-[#080808] border-t border-neutral-800/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
              <h2 className="text-3xl sm:text-4xl font-black text-white">آراء وتقييمات العملاء</h2>
              <p className="text-neutral-400 text-xs sm:text-sm">
                تجارب حقيقية معتمدة وموثقة من عملاء بريق بعد تنفيذ الخدمة.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {displayTestimonials.map((t) => (
                <div key={t.id} className="p-8 rounded-3xl bg-[#121212] border border-[#cea355]/25 space-y-5 flex flex-col justify-between hover:border-[#cea355]/50 transition-all duration-300 shadow-lg group">
                  <div className="space-y-4">
                    <div className="flex items-center gap-1 text-[#cea355]">
                      {Array.from({ length: t.score }).map((_, i) => (
                        <Star key={i} className="w-4.5 h-4.5 fill-[#cea355] text-[#cea355]" aria-hidden="true" />
                      ))}
                    </div>
                    <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed italic">&quot;{t.comment}&quot;</p>
                  </div>

                  <div className="pt-4 border-t border-neutral-800/80 flex items-center justify-between text-xs">
                    <span className="font-extrabold text-white">{publicCustomerName(t.customer.user.fullName)}</span>
                    <span className="text-[#edce8b] font-medium">{t.booking.service.nameAr}</span>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
