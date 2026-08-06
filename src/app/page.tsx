import Link from 'next/link';
import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import PublicImage from '@/components/PublicImage';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { createPublicMetadata } from '@/lib/seo';
import { getPublicBranchContact, phoneHref, whatsappHref } from '@/lib/public-contact';
import {
  Sparkles,
  Calendar,
  ShieldCheck,
  Award,
  ChevronRight,
  CheckCircle2,
  Star,
  MapPin,
  AlertCircle,
  Phone,
  MessageCircle,
  Car,
  Wrench,
  ShieldAlert,
  ArrowLeft,
  Layers,
  Sparkle,
  Clock
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = createPublicMetadata({
  title: 'بريق — خدمة غسيل جاف متنقل وعناية احترافية بالسيارات في الشيخ زايد',
  description: 'احجز خدمة عناية متنقلة لسيارتك مع بريق في الشيخ زايد بدون مياه وبمنتجات 9 متخصصة تحافظ على الدهان وقيمة السيارة.',
  path: '/',
});

function publicCustomerName(fullName: string) {
  const nameParts = fullName.trim().split(/\s+/).filter(Boolean);
  if (nameParts.length === 0) return 'عميل بريق';
  if (nameParts.length === 1) return `${nameParts[0][0]}…`;
  return `${nameParts[0]} ${nameParts[1][0]}.`;
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

/** Map database service cover images to real high-resolution AI photography */
function getServiceRealImage(slug: string, coverImage: string): string {
  if (coverImage && !coverImage.endsWith('.svg') && !coverImage.includes('/services/')) {
    return coverImage;
  }
  const s = slug.toLowerCase();
  if (s.includes('exterior') || s.includes('khariji') || s.includes('outside') || s.includes('أساسي')) {
    return '/images/bareeq_exterior_care.png';
  }
  if (s.includes('interior') || s.includes('dakhili') || s.includes('inside') || s.includes('مكثفة')) {
    return '/images/bareeq_interior_care.png';
  }
  if (s.includes('engine') || s.includes('motor') || s.includes('موتور')) {
    return '/images/bareeq_engine_care.png';
  }
  if (s.includes('full') || s.includes('shamil') || s.includes('شامل')) {
    return '/images/bareeq_hero_car.png';
  }
  if (s.includes('headliner') || s.includes('roof') || s.includes('سقف')) {
    return '/images/bareeq_interior_care.png';
  }
  return '/images/bareeq_exterior_care.png';
}

export default async function HomePage() {
  let user = null;
  let services: any[] = [];
  let plans: any[] = [];
  let coverageAreas: any[] = [];
  let branchContact = null;
  let testimonials: any[] = [];
  let brand = null;

  try {
    const results = await Promise.all([
      getCurrentUser().catch(() => null),
      db.service.findMany({
        where: { active: true, bookableOnline: true },
        take: 6,
        orderBy: { basePrice: 'asc' },
      }).catch(() => []),
      db.subscriptionPlan.findMany({
        where: { active: true },
        take: 3,
        orderBy: { price: 'asc' },
      }).catch(() => []),
      db.coverageArea.findMany({
        where: { active: true, zone: { branch: { status: 'ACTIVE' } } },
        select: {
          id: true,
          compound: true,
          district: true,
          city: true,
          zone: { select: { branch: { select: { nameAr: true } } } },
        },
        orderBy: [{ priority: 'asc' }, { compound: 'asc' }],
        take: 14,
      }).catch(() => []),
      getPublicBranchContact().catch(() => null),
      db.customerServiceRating.findMany({
        where: { approvedForPublic: true, comment: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 3,
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

    [user, services, plans, coverageAreas, branchContact, testimonials, brand] = results;
  } catch (err) {
    console.error('Error fetching HomePage data:', err);
  }

  const publishedTestimonials = testimonials.filter((rating) => rating.comment?.trim());

  const defaultFaqs = [
    {
      q: 'هل تحتاج خدمة بريق لمصدر مياه أو كهرباء من موقع العميل؟',
      a: 'لا نهائياً، سيارات تشغيل بريق مجهزة بالكامل بوحدات ذاتية ومعدات احترافية ومصادر خاصة للمهمة المتنقلة دون إزعاج بالكمبوند.'
    },
    {
      q: 'لماذا تعتبر تقنية الغسيل الجاف من بريق أفضل من الغسيل بالمياه؟',
      a: 'تعتمد بريق على 9 منتجات متخصصة ترفع الأتربة وتغلفها، مما يمنع الخدوش السطحية وبهتان الدهان ويحمي المحرك والكهرباء من أي تسريب للمياه.'
    },
    {
      q: 'كيف تضمن بريق حماية الدهان والسطح الخارجي؟',
      a: 'تتضمن المواد طبقة واكس واقية تمنح السيارة لمعاناً زجاجياً فائقاً وتقلل التصاق الأتربة، مما يحافظ على القيمة السوقية لسيارتك.'
    },
    {
      q: 'كيف تعمل باقات اشتراكات بريق الدورية في حساب العميل؟',
      a: 'الاشتراك يمنحك رصيد زيارات دورية ثابتة شهرياً. عند اختيار موعد الحجز من حسابك، يتم استخدام بياناتك المحفوظة تلقائياً ويُطلب منك تحديد بيانات السيارة فقط.'
    },
    {
      q: 'ما هي مناطق التغطية المتاحة حالياً لخدمة بريق؟',
      a: 'نغطي جميع كمبوندات وأحياء الشيخ زايد عبر فروعنا المخصصة ونضمن التزاماً تاماً بالمواعيد الدقيقة.'
    }
  ];

  const faqs = isFaqList(brand?.faqs) && brand.faqs.length > 0 ? brand.faqs : defaultFaqs;

  // 6 Quick categories matching supercar selector bar
  const quickCategories = [
    { name: 'غسيل خارجي فقط', desc: 'تنظيف جاف وطبقة واكس', icon: Car, href: '/services' },
    { name: 'غسيل داخلي فقط', desc: 'تنظيف وتطهير الفرش والجلد', icon: Sparkles, href: '/services' },
    { name: 'غسيل شامل متكامل', desc: 'عناية كاملة داخلي وخارجي', icon: Award, href: '/services' },
    { name: 'غسيل عميق للفرش', desc: 'إزالة البقع والعناية بالجلد', icon: ShieldCheck, href: '/services' },
    { name: 'غسيل سقف السيارة', desc: 'تنظيف عميق لبطانة السقف', icon: Layers, href: '/services' },
    { name: 'عناية حجرة الموتور', desc: 'تنظيف آمن بدون استخدام مياه', icon: Wrench, href: '/services' },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-[#cea355] selection:text-black">
      <Navbar user={user} />

      <main id="main-content" className="flex-1 overflow-x-hidden">

        {/* ---------------------------------------------------- */}
        {/* 1. HERO SECTION — 100% EXACT MATCH REFERENCE EDITION */}
        {/* ---------------------------------------------------- */}
        <section className="relative min-h-[85vh] lg:min-h-[750px] w-full flex flex-col justify-between overflow-hidden bg-[#000000] border-b border-neutral-900 pt-20 pb-8 lg:pt-24 lg:pb-12">

          {/* Background Full-Bleed Maybach Studio Photo */}
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <PublicImage
              src="/images/bareeq_user_bmw_hero_bg.png"
              alt="بريق — خدمة عناية متنقلة فاخرة بالسيارات"
              sizes="100vw"
              priority
              quality={100}
              unoptimized={true}
              className="w-full h-full object-cover object-center lg:object-left-center scale-100"
            />
            {/* Subtle Mobile Side-Edge Softening Overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/50 lg:hidden pointer-events-none z-[1]" />
          </div>

          {/* ==================================================== */}
          {/* A. DESKTOP HERO CONTENT (UNTOUCHED 100% REFERENCE)   */}
          {/* ==================================================== */}
          <div className="hidden lg:block max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full mt-4 mb-auto">
            <div className="flex flex-row items-center justify-between gap-8">

              {/* Right Side Text Container (RTL) */}
              <div className="w-1/2 space-y-7 text-right">

                {/* Main Title */}
                <h1 className="text-6xl font-black text-white leading-[1.38] tracking-tight">
                  عناية استثنائية <br />
                  لسيارتك أينما كنت <br />
                  <span className="gold-gradient-text inline-block border-b-2 border-[#cea355]/40 pb-1 mt-1">بدون مياه</span>
                </h1>

                {/* Description */}
                <p className="text-neutral-300 text-lg leading-relaxed max-w-xl font-normal drop-shadow-md">
                  نقدم خدمة غسيل جاف وعناية احترافية متنقلة تحافظ على طلاء السيارة ومظهرها الداخلي والخارجي، بأعلى مستوى من الجودة والرفاهية.
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-row items-center gap-4 pt-2">
                  <Link
                    href="/services"
                    className="flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl gold-gradient text-[#080808] font-extrabold text-base shadow-xl shadow-[#cea355]/20 hover:brightness-110 active:scale-98 transition-all group"
                  >
                    <Calendar className="w-5 h-5 text-black group-hover:scale-110 transition-transform" aria-hidden="true" />
                    <span>احجز خدمتك الآن</span>
                  </Link>

                  <Link
                    href="/plans"
                    className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-black/70 border border-[#cea355]/40 text-white hover:bg-[#cea355]/15 hover:border-[#cea355] font-bold text-base transition-all backdrop-blur-md shadow-lg"
                  >
                    <ChevronRight className="w-4 h-4 rotate-180 text-[#cea355]" aria-hidden="true" />
                    <span>استعرض الباقات</span>
                  </Link>
                </div>

              </div>

              {/* Left Side spacer on Desktop so the car is completely visible on the left */}
              <div className="w-1/2" />

            </div>
          </div>

          {/* Desktop Bottom 3 Specs Highlight Bar */}
          <div className="hidden lg:block max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full pt-8 mt-6 border-t border-neutral-900/80">
            <div className="grid grid-cols-3 gap-6 text-right">

              {/* Spec Item 1: الخدمة حتى باب منزلك */}
              <div className="flex items-center gap-3.5 pr-2">
                <div className="w-10 h-10 rounded-full border border-[#cea355]/40 bg-black/60 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-[#cea355]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">الخدمة حتى باب منزلك</h4>
                  <p className="text-xs text-neutral-400">نصل إليك أينما كنت</p>
                </div>
              </div>

              {/* Spec Item 2: منتجات آمنة على الطلاء */}
              <div className="flex items-center gap-3.5 pr-2 border-r border-neutral-800/80">
                <div className="w-10 h-10 rounded-full border border-[#cea355]/40 bg-black/60 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-[#cea355]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">منتجات آمنة على الطلاء</h4>
                  <p className="text-xs text-neutral-400">أعلى جودة حماية ولمعان</p>
                </div>
              </div>

              {/* Spec Item 3: بدون استخدام المياه */}
              <div className="flex items-center gap-3.5 pr-2 border-r border-neutral-800/80">
                <div className="w-10 h-10 rounded-full border border-[#cea355]/40 bg-black/60 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5 text-[#cea355]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">بدون استخدام المياه</h4>
                  <p className="text-xs text-neutral-400">تقنية غسيل جاف متطورة</p>
                </div>
              </div>

            </div>
          </div>

          {/* ==================================================== */}
          {/* B. MOBILE HERO CONTENT (CUSTOM MOBILE DESIGN ONLY)   */}
          {/* ==================================================== */}
          <div className="lg:hidden max-w-7xl mx-auto px-4 relative z-10 w-full flex flex-col justify-between pt-4 pb-4">

            {/* Top: H1 Title in position */}
            <div className="text-right pt-2">
              <h1 className="text-3xl xs:text-4xl font-black text-white leading-[1.3] tracking-tight">
                عناية استثنائية <br />
                لسيارتك أينما كنت <br />
                <span className="gold-gradient-text inline-block border-b-2 border-[#cea355]/40 pb-1 mt-1">بدون مياه</span>
              </h1>
            </div>

            {/* Middle Spacer: Clear view of the car image on Mobile */}
            <div className="h-96 xs:h-[400px] sm:h-[460px] w-full" aria-hidden="true" />

            {/* Bottom: Description + Side-by-Side Centered Buttons sitting directly over background */}
            <div className="space-y-4 pt-14 pb-2 text-center">
              <p className="text-neutral-200 text-xs sm:text-sm leading-relaxed text-right font-normal drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                نقدم خدمة غسيل جاف وعناية احترافية متنقلة تحافظ على طلاء السيارة ومظهرها الداخلي والخارجي، بأعلى مستوى من الجودة والرفاهية.
              </p>

              <div className="flex flex-row items-center justify-center gap-2.5 pt-1 w-full">
                <Link
                  href="/services"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl gold-gradient text-[#080808] font-extrabold text-xs shadow-lg shadow-[#cea355]/20 hover:brightness-110 active:scale-98 transition-all group"
                >
                  <Calendar className="w-4 h-4 text-black group-hover:scale-110 transition-transform" aria-hidden="true" />
                  <span className="whitespace-nowrap">احجز خدمتك الآن</span>
                </Link>

                <Link
                  href="/plans"
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-3 rounded-xl bg-black/80 border border-[#cea355]/40 text-white hover:bg-[#cea355]/15 font-bold text-xs transition-all backdrop-blur-md shadow-md active:scale-98"
                >
                  <ChevronRight className="w-3.5 h-3.5 rotate-180 text-[#cea355]" aria-hidden="true" />
                  <span className="whitespace-nowrap">استعرض الباقات</span>
                </Link>
              </div>
            </div>

          </div>

        </section>

        {/* ---------------------------------------------------- */}
        {/* MOBILE SPEC FEATURE CARDS (3 COLUMNS BELOW HERO)     */}
        {/* ---------------------------------------------------- */}
        <section className="py-5 bg-[#0a0a0a] border-b border-neutral-900 lg:hidden">
          <div className="max-w-7xl mx-auto px-2 sm:px-6">
            <div className="grid grid-cols-3 gap-1.5 sm:gap-3 text-center">
              
              {/* Item 1 */}
              <div className="flex flex-col items-center justify-start p-2 sm:p-2.5 rounded-2xl bg-[#121212] border border-[#cea355]/25 space-y-1.5 shadow-md overflow-hidden">
                <div className="w-8.5 h-8.5 rounded-xl border border-[#cea355]/40 bg-gradient-to-br from-[#cea355]/20 to-black flex items-center justify-center shrink-0 shadow-inner">
                  <MapPin className="w-4 h-4 text-[#cea355]" />
                </div>
                <div className="space-y-0.5 w-full">
                  <h4 className="text-[9.5px] xs:text-[10.5px] sm:text-xs font-black text-white leading-tight whitespace-nowrap">الخدمة حتى باب منزلك</h4>
                  <p className="text-[9px] xs:text-[9.5px] text-neutral-400 leading-tight whitespace-nowrap">نصل إليك أينما كنت</p>
                </div>
              </div>

              {/* Item 2 */}
              <div className="flex flex-col items-center justify-start p-2 sm:p-2.5 rounded-2xl bg-[#121212] border border-[#cea355]/25 space-y-1.5 shadow-md overflow-hidden">
                <div className="w-8.5 h-8.5 rounded-xl border border-[#cea355]/40 bg-gradient-to-br from-[#cea355]/20 to-black flex items-center justify-center shrink-0 shadow-inner">
                  <ShieldCheck className="w-4 h-4 text-[#cea355]" />
                </div>
                <div className="space-y-0.5 w-full">
                  <h4 className="text-[9.5px] xs:text-[10.5px] sm:text-xs font-black text-white leading-tight whitespace-nowrap">منتجات آمنة على الطلاء</h4>
                  <p className="text-[9px] xs:text-[9.5px] text-neutral-400 leading-tight whitespace-nowrap">أعلى جودة حماية ولمعان</p>
                </div>
              </div>

              {/* Item 3 */}
              <div className="flex flex-col items-center justify-start p-2 sm:p-2.5 rounded-2xl bg-[#121212] border border-[#cea355]/25 space-y-1.5 shadow-md overflow-hidden">
                <div className="w-8.5 h-8.5 rounded-xl border border-[#cea355]/40 bg-gradient-to-br from-[#cea355]/20 to-black flex items-center justify-center shrink-0 shadow-inner">
                  <Sparkles className="w-4 h-4 text-[#cea355]" />
                </div>
                <div className="space-y-0.5 w-full">
                  <h4 className="text-[9.5px] xs:text-[10.5px] sm:text-xs font-black text-white leading-tight whitespace-nowrap">بدون استخدام المياه</h4>
                  <p className="text-[9px] xs:text-[9.5px] text-neutral-400 leading-tight whitespace-nowrap">تقنية غسيل جاف متطورة</p>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 2. CATEGORY ICON SELECTOR BAR */}
        {/* ---------------------------------------------------- */}
        <section className="py-12 bg-[#080808] border-y border-neutral-800/80 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs font-bold text-[#edce8b] uppercase tracking-wider">اختيارات سريعة</span>
              <span className="text-xs text-neutral-400">حدد نوع الخدمة لمشاهدة التفاصيل</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {quickCategories.map((cat, idx) => {
                const IconComp = cat.icon;
                return (
                  <Link
                    key={idx}
                    href={cat.href}
                    className="group p-5 rounded-2xl glass-card border border-[#cea355]/20 hover:border-[#cea355] hover:bg-[#16140e] glass-card-hover text-center flex flex-col items-center justify-center space-y-3"
                  >
                    <div className="w-13 h-13 rounded-2xl bg-[#cea355]/10 border border-[#cea355]/30 text-[#edce8b] flex items-center justify-center group-hover:scale-110 group-hover:bg-[#cea355] group-hover:text-black transition-all duration-300">
                      <IconComp className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-extrabold text-white group-hover:text-[#edce8b] transition-colors">{cat.name}</h3>
                      <p className="text-[11px] text-neutral-400 mt-1 line-clamp-1">{cat.desc}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 3. QUALITY PILLARS — BENTO GRID */}
        {/* ---------------------------------------------------- */}
        <section id="why-bareeq" className="py-32 bg-[#050505] relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

            <div className="text-center max-w-3xl mx-auto mb-20 space-y-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#cea355]/10 border border-[#cea355]/30 text-xs font-bold text-[#edce8b]">
                <ShieldCheck className="w-4 h-4 text-[#cea355]" />
                <span>منظومة عناية احترافية متكاملة</span>
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight">
                لماذا تختار غسيل <span className="gold-gradient-text">بريق</span> الجاف بدلاً من الغسيل التقليدي بالمياه؟
              </h2>
              <p className="text-neutral-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
                نقدم بديلاً أكثر أماناً وتنظيماً يحمي سيارتك من بهتان الدهان والبارومة مع توفير وقتك وجهدك.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">

              {/* Right 2 Callouts */}
              <div className="lg:col-span-3 flex flex-col justify-between space-y-6">
                <div className="p-7 rounded-3xl glass-card border border-[#cea355]/25 space-y-3 hover:border-[#cea355] transition-all glass-card-hover text-right flex-1 flex flex-col justify-center">
                  <div className="w-11 h-11 rounded-xl gold-gradient flex items-center justify-center text-black font-black text-base shadow-md">1</div>
                  <h3 className="text-lg font-bold text-white">9 مواد مصنعة محلياً</h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    منتج مخصص آمن لكل سطح: الدهان، الجلد، الفرش، التابلوه، الزجاج، والجنوط والموتور.
                  </p>
                </div>

                <div className="p-7 rounded-3xl glass-card border border-[#cea355]/25 space-y-3 hover:border-[#cea355] transition-all glass-card-hover text-right flex-1 flex flex-col justify-center">
                  <div className="w-11 h-11 rounded-xl gold-gradient flex items-center justify-center text-black font-black text-base shadow-md">2</div>
                  <h3 className="text-lg font-bold text-white">غسيل جاف 100% بدون مياه</h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    يمنع تشكل البارومة والصدأ، ولا يسبب أي تسريب مياه للدوائر الكهربائية والحساسات.
                  </p>
                </div>
              </div>

              {/* Center Hero Product Visual (Uncropped Photo Showcase) */}
              <div className="lg:col-span-6 relative text-center flex flex-col items-center justify-center">
                <div className="relative rounded-3xl p-5 border border-[#cea355]/40 bg-gradient-to-b from-[#141414] to-[#080808] shadow-2xl w-full h-full flex flex-col justify-between">
                  <div className="relative w-full h-[360px] sm:h-[420px] flex items-center justify-center overflow-hidden rounded-2xl bg-[#090909] p-3">
                    <PublicImage
                      src="/images/bareeq_dry_product.png"
                      alt="منتجات بريق المتخصصة للعناية الجافة بالسيارات"
                      sizes="(min-width: 1024px) 40vw, 90vw"
                      className="w-full h-full object-contain mx-auto rounded-2xl hover:scale-105 transition-transform duration-700"
                    />
                  </div>
                  <div className="mt-4 p-5 rounded-2xl bg-black/90 border border-[#cea355]/30 backdrop-blur-md text-center space-y-1">
                    <span className="text-sm font-black text-[#edce8b] block">تركيبة الواكس الواقية للدهان من بريق</span>
                    <span className="text-xs text-neutral-300">تمنح لمعاناً فائقاً وتمنع التصاق الأتربة والخدوش السطحية</span>
                  </div>
                </div>
              </div>

              {/* Left 2 Callouts */}
              <div className="lg:col-span-3 flex flex-col justify-between space-y-6">
                <div className="p-7 rounded-3xl glass-card border border-[#cea355]/25 space-y-3 hover:border-[#cea355] transition-all glass-card-hover text-right flex-1 flex flex-col justify-center">
                  <div className="w-11 h-11 rounded-xl gold-gradient flex items-center justify-center text-black font-black text-base shadow-md">3</div>
                  <h3 className="text-lg font-bold text-white">طبقة واكس واقية</h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    تمنح طبقة حماية على الدهان تقلل التصاق الأتربة وتساعد في الحفاظ على القيمة السوقية للسيارة.
                  </p>
                </div>

                <div className="p-7 rounded-3xl glass-card border border-[#cea355]/25 space-y-3 hover:border-[#cea355] transition-all glass-card-hover text-right flex-1 flex flex-col justify-center">
                  <div className="w-11 h-11 rounded-xl gold-gradient flex items-center justify-center text-black font-black text-base shadow-md">4</div>
                  <h3 className="text-lg font-bold text-white">تجهيز كامل بدون إزعاج</h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    فريق بريق مجهز بوحدات تشغيل ذاتية كاملة دون الحاجة لمصدر مياه أو كهرباء من موقعك.
                  </p>
                </div>
              </div>

            </div>

          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 4. THREE TALL CARE CARDS (SUPERCAR CARDS STYLE) */}
        {/* ---------------------------------------------------- */}
        <section className="py-24 bg-[#080808] border-y border-neutral-800/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            <div className="flex flex-col md:flex-row md:items-end justify-between mb-14 gap-4">
              <div className="space-y-2">
                <span className="text-xs font-bold text-[#edce8b] uppercase tracking-wider">أركان العناية الفائقة</span>
                <h2 className="text-3xl sm:text-4xl font-black text-white">خدمات مخصصة لكل خامة بالسيارة</h2>
              </div>
              <Link href="/services" className="text-xs font-bold text-[#edce8b] hover:text-white flex items-center gap-1 bg-[#141414] px-4 py-2 rounded-xl border border-[#cea355]/30 transition-all">
                <span>استكشف كافة الخدمات</span>
                <ChevronRight className="w-4 h-4 rotate-180" aria-hidden="true" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

              {/* Card 1: Exterior Care */}
              <div className="group relative rounded-3xl overflow-hidden border border-[#cea355]/30 bg-[#121212] hover:border-[#cea355] transition-all duration-500 flex flex-col justify-between">
                <div className="h-84 relative overflow-hidden bg-[#0d0d0d]">
                  <PublicImage
                    src="/images/bareeq_exterior_care.png"
                    alt="العناية بالهيكل الخارجي والدهان والجنوط"
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/40 to-transparent" />
                </div>
                <div className="p-7 relative z-10 -mt-16 space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    <span className="px-3.5 py-1 rounded-full bg-[#cea355]/20 border border-[#cea355]/40 text-xs font-bold text-[#edce8b] inline-block">
                      الدهان والجنوط والزجاج
                    </span>
                    <h3 className="text-2xl font-bold text-white group-hover:text-[#edce8b] transition-colors">العناية الخارجية بالدهان</h3>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      غسيل جاف ممتاز من بريق يعيد للمعان الدهان بريقه مع طبقة واكس واقية تمنع خدوش الغسيل التقليدي.
                    </p>
                  </div>
                  <Link href="/services" className="pt-3 inline-flex items-center gap-2 text-xs font-extrabold text-[#edce8b] hover:gap-3 transition-all">
                    <span>التفاصيل والحجز</span>
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* Card 2: Interior Care */}
              <div className="group relative rounded-3xl overflow-hidden border border-[#cea355]/30 bg-[#121212] hover:border-[#cea355] transition-all duration-500 flex flex-col justify-between">
                <div className="h-84 relative overflow-hidden bg-[#0d0d0d]">
                  <PublicImage
                    src="/images/bareeq_interior_care.png"
                    alt="العناية بالفرش والجلد والتابلوه"
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/40 to-transparent" />
                </div>
                <div className="p-7 relative z-10 -mt-16 space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    <span className="px-3.5 py-1 rounded-full bg-[#cea355]/20 border border-[#cea355]/40 text-xs font-bold text-[#edce8b] inline-block">
                      الجلد والفرش والتابلوه
                    </span>
                    <h3 className="text-2xl font-bold text-white group-hover:text-[#edce8b] transition-colors">العناية الداخلية وتنظيف الجلد</h3>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      منتجات ترطيب وتنظيف متخصصة تمنع جفاف وتشققات الجلد والتابلوه بدون روائح حادة.
                    </p>
                  </div>
                  <Link href="/services" className="pt-3 inline-flex items-center gap-2 text-xs font-extrabold text-[#edce8b] hover:gap-3 transition-all">
                    <span>التفاصيل والحجز</span>
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* Card 3: Engine Care */}
              <div className="group relative rounded-3xl overflow-hidden border border-[#cea355]/30 bg-[#121212] hover:border-[#cea355] transition-all duration-500 flex flex-col justify-between">
                <div className="h-84 relative overflow-hidden bg-[#0d0d0d]">
                  <PublicImage
                    src="/images/bareeq_engine_care.png"
                    alt="تنظيف وحماية حجرة الموتور"
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/40 to-transparent" />
                </div>
                <div className="p-7 relative z-10 -mt-16 space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    <span className="px-3.5 py-1 rounded-full bg-[#cea355]/20 border border-[#cea355]/40 text-xs font-bold text-[#edce8b] inline-block">
                      أمان وحماية الموتور
                    </span>
                    <h3 className="text-2xl font-bold text-white group-hover:text-[#edce8b] transition-colors">تنظيف حجرة الموتور بعناية</h3>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      تنظيف آمن ومدروس من بريق يمنع تعريض المكونات والدوائر الكهربائية للمياه أو المواد الضارة.
                    </p>
                  </div>
                  <Link href="/services" className="pt-3 inline-flex items-center gap-2 text-xs font-extrabold text-[#edce8b] hover:gap-3 transition-all">
                    <span>التفاصيل والحجز</span>
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>

            </div>

          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 5. SERVICES CATALOG SECTION */}
        {/* ---------------------------------------------------- */}
        <section className="py-28 bg-[#050505]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            <div className="flex flex-col md:flex-row md:items-end justify-between mb-14 gap-4">
              <div>
                <span className="text-xs font-bold text-[#edce8b] uppercase tracking-wider">كتالوج بريق للعناية</span>
                <h2 className="text-3xl sm:text-4xl font-black text-white mt-1">الخدمات الأكثر طلباً بالشيخ زايد</h2>
              </div>
              <Link href="/services" className="text-xs font-bold text-[#edce8b] hover:underline flex items-center gap-1">
                <span>تصفح جميع الخدمات ({services.length})</span>
                <ChevronRight className="w-4 h-4 rotate-180" aria-hidden="true" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {services.map((service) => {
                const realImg = getServiceRealImage(service.slug, service.coverImage);
                return (
                  <div key={service.id} className="rounded-3xl bg-[#121212] border border-[#cea355]/25 overflow-hidden flex flex-col justify-between hover:border-[#cea355] transition-all glass-card-hover group">
                    <div>
                      <div className="h-60 relative overflow-hidden bg-[#0d0d0d]">
                        <PublicImage
                          src={realImg}
                          alt={service.nameAr}
                          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                          className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700"
                        />
                        <div className="absolute top-4 right-4 bg-black/85 px-3.5 py-1.5 rounded-full border border-[#cea355]/40 text-xs font-bold text-[#edce8b] backdrop-blur-md flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#cea355]" />
                          <span>المدة: {service.durationMinutes} دقيقة</span>
                        </div>
                      </div>

                      <div className="p-7 space-y-4">
                        <h3 className="text-xl font-extrabold text-white group-hover:text-[#edce8b] transition-colors">{service.nameAr}</h3>
                        <p className="text-xs text-neutral-300 leading-relaxed line-clamp-2">{service.shortDescriptionAr}</p>

                        {Array.isArray(service.includedItems) && service.includedItems.length > 0 && (
                          <div className="space-y-2 pt-3 border-t border-neutral-800/80">
                            {(service.includedItems as string[]).slice(0, 3).map((item, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs text-neutral-300">
                                <CheckCircle2 className="w-4 h-4 text-[#cea355] shrink-0" aria-hidden="true" />
                                <span className="truncate">{item}</span>
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
                          <span className="text-2xl font-black text-[#edce8b]">{service.basePrice} ج.م</span>
                        </div>
                        <Link
                          href={`/services/${service.slug}/book`}
                          className="px-6 py-3 rounded-xl gold-gradient text-black font-extrabold text-xs hover:brightness-110 transition-all shadow-lg shadow-[#cea355]/20 active:scale-95"
                        >
                          احجز الآن
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 6. PANORAMIC FULL-WIDTH HERO BANNER */}
        {/* ---------------------------------------------------- */}
        <section className="relative py-32 overflow-hidden bg-black border-y border-neutral-800">
          <div className="absolute inset-0">
            <PublicImage
              src="/images/bareeq_banner_van.png"
              alt="سيارات تشغيل بريق المجهزة بالكامل بالشيخ زايد"
              sizes="100vw"
              className="w-full h-full object-cover opacity-35 scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-transparent" />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-right max-w-2xl me-auto">
            <div className="space-y-6">
              <span className="px-4 py-1.5 rounded-full bg-[#cea355]/20 border border-[#cea355]/40 text-xs font-extrabold text-[#edce8b] inline-block">
                راحة تامة أمام منزلك أو مقر عملك
              </span>

              <h2 className="text-3xl sm:text-5xl font-black text-white leading-tight">
                تجربة عناية متنقلة راقية <span className="gold-gradient-text">تليق بسيارتك ووقتك</span>
              </h2>

              <p className="text-neutral-300 text-sm sm:text-base leading-relaxed">
                لا داعي لإضاعة ساعات الانتظار في المغاسل أو المخاطرة بالغسيل العشوائي. وحدات بريق المجهزة تصلك أينما كنت في الشيخ زايد مع الالتزام التام بالمواعيد المحددة.
              </p>

              <div className="pt-3">
                <Link
                  href="/services"
                  className="inline-flex items-center justify-center gap-3 px-8 py-4.5 rounded-2xl gold-gradient text-black font-extrabold text-base shadow-2xl hover:brightness-110 transition-all active:scale-98"
                >
                  <Calendar className="w-5 h-5" aria-hidden="true" />
                  <span>احجز الخدمة المتنقلة الآن</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 7. SUBSCRIPTIONS PACKAGES */}
        {/* ---------------------------------------------------- */}
        <section className="py-28 bg-[#070707] border-b border-neutral-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
              <span className="text-xs font-bold text-[#edce8b] uppercase tracking-wider">الاشتراكات العائلية والدورية</span>
              <h2 className="text-3xl sm:text-4xl font-black text-white">باقات عناية مستمرة طوال الشهر</h2>
              <p className="text-neutral-400 text-xs sm:text-sm">
                احصل على زيارات دورية مجدولة وتوفير حقيقي مع حفظ رصيد الزيارات داخل حسابك التفاعلي.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {plans.map((plan, idx) => {
                const isFeatured = idx === 1 || plan.price > 1000;
                return (
                  <div
                    key={plan.id}
                    className={`relative rounded-3xl bg-[#121212] p-8 space-y-6 flex flex-col justify-between transition-all glass-card-hover ${isFeatured
                      ? 'border-2 border-[#cea355] shadow-[0_0_35px_rgba(206,163,85,0.25)]'
                      : 'border border-[#cea355]/30 hover:border-[#cea355]'
                      }`}
                  >
                    {isFeatured && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 gold-gradient px-4 py-1 rounded-full text-black font-extrabold text-[11px] uppercase tracking-wider shadow-md">
                        الباقة الأكثر طلبًا
                      </div>
                    )}

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="px-3 py-1 rounded-full bg-[#cea355]/15 text-[#edce8b] text-xs font-bold border border-[#cea355]/30">
                          صلاحية {plan.validityDays} يوم
                        </span>
                        <Award className="w-6 h-6 text-[#cea355]" aria-hidden="true" />
                      </div>

                      <h3 className="text-2xl font-black text-white">{plan.nameAr}</h3>
                      <p className="text-xs text-neutral-400 leading-relaxed">{plan.descriptionAr}</p>

                      <div className="py-4 border-y border-neutral-800/80">
                        <span className="text-3xl font-black text-[#edce8b]">{plan.price} ج.م</span>
                        <span className="text-xs text-neutral-400 me-2">/ باقة دورية</span>
                      </div>

                      <ul className="space-y-2.5 text-xs text-neutral-300">
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#cea355] shrink-0" />
                          <span>تشمل {plan.visitCount} زيارات عناية جافة شاملة</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#cea355] shrink-0" />
                          <span>تأكيد المواعيد تلقائياً بدون طلب بياناتك مجدداً</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-[#cea355] shrink-0" />
                          <span>أولوية الإسناد لفرق التشغيل المخصصة</span>
                        </li>
                      </ul>
                    </div>

                    <Link
                      href="/plans"
                      className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-extrabold text-sm transition-all shadow-lg active:scale-98 ${isFeatured
                        ? 'gold-gradient text-black shadow-[#cea355]/30 hover:brightness-110'
                        : 'bg-[#1a1a1a] text-[#edce8b] border border-[#cea355]/40 hover:bg-[#cea355]/20'
                        }`}
                    >
                      <span>اشترك الآن وحافظ على نظافة سيارتك</span>
                    </Link>
                  </div>
                );
              })}
            </div>

          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 8. KNOWLEDGE & COMPARISON (DRY WASH VS WATER WASH) */}
        {/* ---------------------------------------------------- */}
        <section className="py-28 bg-[#050505]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
              <span className="text-xs font-bold text-[#edce8b] uppercase tracking-wider">دليل بريق للعناية بالسيارات</span>
              <h2 className="text-3xl sm:text-4xl font-black text-white">لماذا يعتبر الغسيل التقليدي بالمياه خياراً خاطئاً؟</h2>
              <p className="text-neutral-400 text-xs sm:text-sm">
                حقائق توضح الأضرار الناتجة عن الطرق التقليدية وكيف يحمي نظام بريق الجاف قيمة سيارتك.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

              {/* Card 1 */}
              <div className="p-8 rounded-3xl bg-[#121212] border border-red-500/30 space-y-4 hover:border-red-500/60 transition-all glass-card-hover">
                <div className="w-13 h-13 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center">
                  <ShieldAlert className="w-6 h-6" aria-hidden="true" />
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
                <div className="w-13 h-13 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" aria-hidden="true" />
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
              <div className="p-8 rounded-3xl bg-[#121212] border-2 border-[#cea355] space-y-4 transition-all glass-card-hover shadow-[0_0_30px_rgba(206,163,85,0.2)]">
                <div className="w-13 h-13 rounded-2xl gold-gradient text-black flex items-center justify-center shadow-lg">
                  <ShieldCheck className="w-6 h-6" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-bold text-white">ابتكار بريق: العناية الجافة 100%</h3>
                <ul className="space-y-2.5 text-xs text-neutral-300 leading-relaxed">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#cea355] shrink-0 mt-0.5" />
                    <span>9 منتجات متخصصة آمنة مصنعة محلياً لكل جزء بالسيارة.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#cea355] shrink-0 mt-0.5" />
                    <span>طبقة واكس واقية تمنح لمعاناً زجاجياً وتمنع التصاق الأتربة.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#cea355] shrink-0 mt-0.5" />
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
        <section className="py-28 bg-[#090909] border-t border-neutral-800/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
              <span className="text-xs font-bold text-[#edce8b] uppercase tracking-wider">معرض الفخامة</span>
              <h2 className="text-3xl sm:text-4xl font-black text-white">لمسات بريق — نتائج حقيقية تتحدث عن الدقة</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-5">

              <div className="rounded-3xl overflow-hidden border border-[#cea355]/25 h-68 relative group shadow-lg">
                <PublicImage
                  src="/images/bareeq_hero_car.png"
                  alt="لمعان دهان السيارة الخارجي من بريق"
                  sizes="(min-width: 768px) 33vw, 50vw"
                  className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-5 flex items-end">
                  <span className="text-xs font-extrabold text-[#edce8b]">لمعان دهان بتركيبة الواكس من بريق</span>
                </div>
              </div>

              <div className="rounded-3xl overflow-hidden border border-[#cea355]/25 h-68 relative group shadow-lg">
                <PublicImage
                  src="/images/bareeq_interior_care.png"
                  alt="تنظيف وترطيب جلد السيارة من بريق"
                  sizes="(min-width: 768px) 33vw, 50vw"
                  className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-5 flex items-end">
                  <span className="text-xs font-extrabold text-[#edce8b]">ترطيب وتطهير المقاعد الجلدية</span>
                </div>
              </div>

              <div className="rounded-3xl overflow-hidden border border-[#cea355]/25 h-68 relative group shadow-lg">
                <PublicImage
                  src="/images/bareeq_engine_care.png"
                  alt="تنظيف حجرة المحرك"
                  sizes="(min-width: 768px) 33vw, 50vw"
                  className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-5 flex items-end">
                  <span className="text-xs font-extrabold text-[#edce8b]">تنظيف آمن لحجرة الموتور</span>
                </div>
              </div>

              <div className="rounded-3xl overflow-hidden border border-[#cea355]/25 h-68 relative group shadow-lg">
                <PublicImage
                  src="/images/bareeq_dry_product.png"
                  alt="منتجات بريق التسعة"
                  sizes="(min-width: 768px) 33vw, 50vw"
                  className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-5 flex items-end">
                  <span className="text-xs font-extrabold text-[#edce8b]">منتجات بريق الـ 9 المتخصصة</span>
                </div>
              </div>

              <div className="rounded-3xl overflow-hidden border border-[#cea355]/25 h-68 relative group shadow-lg">
                <PublicImage
                  src="/images/bareeq_exterior_care.png"
                  alt="تلميع الجنوط والإطارات"
                  sizes="(min-width: 768px) 33vw, 50vw"
                  className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-5 flex items-end">
                  <span className="text-xs font-extrabold text-[#edce8b]">تلميع وحماية الجنوط والفرامل</span>
                </div>
              </div>

              <div className="rounded-3xl overflow-hidden border border-[#cea355]/25 h-68 relative group shadow-lg">
                <PublicImage
                  src="/images/bareeq_banner_van.png"
                  alt="سيارة تشغيل بريق المتنقلة"
                  sizes="(min-width: 768px) 33vw, 50vw"
                  className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-5 flex items-end">
                  <span className="text-xs font-extrabold text-[#edce8b]">وحدات التجهيز الذاتي بالكمبوند</span>
                </div>
              </div>

            </div>

          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 10. CUSTOMER TESTIMONIALS */}
        {/* ---------------------------------------------------- */}
        {publishedTestimonials.length > 0 && (
          <section className="py-28 bg-[#050505]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

              <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
                <span className="text-xs font-bold text-[#edce8b] uppercase tracking-wider">ثقة ملاك السيارات بالشيخ زايد</span>
                <h2 className="text-3xl sm:text-4xl font-black text-white">آراء عملاء بريق</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {publishedTestimonials.map((t) => (
                  <div key={t.id} className="p-8 rounded-3xl bg-[#121212] border border-[#cea355]/25 space-y-5 flex flex-col justify-between glass-card-hover">
                    <div className="space-y-4">
                      <div className="flex items-center gap-1 text-[#cea355]">
                        {Array.from({ length: t.score }).map((_, i) => (
                          <Star key={i} className="w-4.5 h-4.5 fill-[#cea355]" aria-hidden="true" />
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
        )}

        {/* ---------------------------------------------------- */}
        {/* 11. COVERAGE AREAS IN SHEIKH ZAYED */}
        {/* ---------------------------------------------------- */}
        <section className="py-24 bg-[#080808] border-t border-neutral-800/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="space-y-3 max-w-xl">
                <div className="inline-flex items-center gap-2 text-xs font-bold text-[#edce8b]">
                  <MapPin className="w-4 h-4 text-[#cea355]" />
                  <span>مناطق التغطية بالشيخ زايد</span>
                </div>
                <h2 className="text-2xl sm:text-4xl font-black text-white">نخدم جميع كمبوندات وأحياء الشيخ زايد</h2>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  تتواجد سياراتنا المجهزة في فروع التشغيل الإستراتيجية بالشيخ زايد لتلبية طلباتك في الوقت المحدد تماماً.
                </p>
              </div>

              <div className="flex flex-wrap gap-2.5 max-w-2xl">
                {coverageAreas.map((area) => (
                  <span
                    key={area.id}
                    className="px-4 py-2 rounded-2xl bg-[#121212] border border-[#cea355]/30 text-xs font-bold text-neutral-200 hover:border-[#cea355] hover:text-[#edce8b] transition-colors"
                  >
                    {area.compound || area.district}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 12. FAQ SECTION */}
        {/* ---------------------------------------------------- */}
        <section className="py-28 bg-[#050505]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16 space-y-3">
              <span className="text-xs font-bold text-[#edce8b] uppercase tracking-wider">إجابات وشفافية</span>
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
        {/* 13. CONTACT SECTION */}
        {/* ---------------------------------------------------- */}
        <section className="py-24 bg-[#080808] border-t border-neutral-800/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-7">
            <h2 className="text-3xl sm:text-4xl font-black text-white">هل لديك استفسار خاص بسيارتك؟</h2>
            <p className="text-xs sm:text-base text-neutral-300 max-w-xl mx-auto leading-relaxed">
              فريق بريق على استعداد تام للإجابة على جميع الاستفسارات وتنسيق المواعيد الخاصة للحجوزات العائلية أو أسطول السيارات.
            </p>

            <div className="flex flex-wrap justify-center gap-4 pt-3">
              {branchContact?.phone && (
                <a
                  href={phoneHref(branchContact.phone)}
                  className="inline-flex items-center gap-2.5 px-7 py-4 rounded-2xl bg-[#121212] border border-[#cea355]/40 text-[#edce8b] font-bold text-sm hover:bg-[#cea355]/15 transition-all shadow-lg"
                >
                  <Phone className="w-4.5 h-4.5 text-[#cea355]" />
                  <span>اتصل بنا: {branchContact.phone}</span>
                </a>
              )}

              {branchContact?.whatsapp && (
                <a
                  href={whatsappHref(branchContact.whatsapp, 'مرحباً، أود الاستفسار عن خدمات بريق للعناية بالسيارات')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2.5 px-7 py-4 rounded-2xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-400 font-bold text-sm hover:bg-emerald-900/70 transition-all shadow-lg"
                >
                  <MessageCircle className="w-4.5 h-4.5" />
                  <span>محادثة واتساب مباشرة</span>
                </a>
              )}
            </div>
          </div>
        </section>

      </main>

      <Footer />
    </div>
  );
}
