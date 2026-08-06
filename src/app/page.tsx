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
  Sparkle
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
  const [user, services, plans, coverageAreas, branchContact, testimonials, brand] = await Promise.all([
    getCurrentUser(),
    db.service.findMany({
      where: { active: true, bookableOnline: true },
      take: 6,
      orderBy: { basePrice: 'asc' },
    }),
    db.subscriptionPlan.findMany({
      where: { active: true },
      take: 3,
      orderBy: { price: 'asc' },
    }),
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
    }),
    getPublicBranchContact(),
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
    }),
    db.brandSettings.findFirst({ select: { homepageContent: true, faqs: true } }),
  ]);

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

  // 6 Quick categories matching icon bar in target design
  const quickCategories = [
    { name: 'غسيل خارجي فقط', desc: 'تنظيف جاف وطبقة واكس', icon: Car, href: '/services' },
    { name: 'غسيل داخلي فقط', desc: 'تنظيف وتطهير الفرش والجلد', icon: Sparkles, href: '/services' },
    { name: 'غسيل شامل متكامل', desc: 'عناية كاملة داخلي وخارجي', icon: Award, href: '/services' },
    { name: 'غسيل عميق للفرش', desc: 'إزالة البقع والعناية بالجلد', icon: ShieldCheck, href: '/services' },
    { name: 'غسيل سقف السيارة', desc: 'تنظيف عميق لبطانة السقف', icon: Layers, href: '/services' },
    { name: 'عناية حجرة الموتور', desc: 'تنظيف آمن بدون استخدام مياه', icon: Wrench, href: '/services' },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans selection:bg-[#c9a227] selection:text-black">
      <Navbar user={user} />

      <main id="main-content" className="flex-1">

        {/* ---------------------------------------------------- */}
        {/* 1. HERO SECTION — PURE BLACK CUTOUT LUXURY CAR */}
        {/* ---------------------------------------------------- */}
        <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden bg-black">
          {/* Ambient Lighting Glow Behind Car */}
          <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-[#c9a227]/12 rounded-full blur-[170px] pointer-events-none" />
          <div className="absolute top-1/4 right-5 w-96 h-96 bg-[#e5c45a]/5 rounded-full blur-[140px] pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center min-h-[480px] lg:min-h-[560px]">
              
              {/* Right Text Column */}
              <div className="lg:col-span-6 space-y-6 text-right z-10">
                <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#121212] border border-[#c9a227]/40 text-xs font-bold text-[#e5c45a] gold-glow">
                  <Sparkle className="w-4 h-4 text-[#c9a227] animate-pulse" aria-hidden="true" />
                  <span>عناية متنقلة فارهة بالسيارات بالشيخ زايد</span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight tracking-tight text-white">
                  عناية استثنائية تصلك حتى باب منزلك <span className="gold-gradient-text">بدون مياه</span>
                </h1>

                <p className="text-neutral-300 text-base sm:text-lg leading-relaxed max-w-2xl">
                  تعتمد <strong className="text-[#e5c45a]">بريق</strong> على نظام غسيل جاف احترافي باستخدام <strong className="text-[#e5c45a]">9 منتجات متخصصة</strong> تحافظ على حالة السيارة الخارجيّة والداخليّة، وتمنح الدهان طبقة واكس واقية من الخدوش بدون مخاطر الغسيل التقليدي.
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-3">
                  <Link
                    href="/services"
                    className="flex items-center justify-center gap-3 px-8 py-4 rounded-xl gold-gradient text-[#080808] font-black text-base shadow-2xl shadow-[#c9a227]/30 hover:brightness-110 active:scale-95 transition-all"
                  >
                    <Calendar className="w-5 h-5" aria-hidden="true" />
                    <span>احجز خدمتك الآن</span>
                  </Link>

                  <Link
                    href="/plans"
                    className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#121212] border border-[#c9a227]/40 text-[#e5c45a] hover:bg-[#c9a227]/10 font-bold text-base transition-colors"
                  >
                    <span>استكشف باقات الاشتراكات</span>
                    <ChevronRight className="w-5 h-5 rotate-180" aria-hidden="true" />
                  </Link>
                </div>

                {/* Trust Badges Bar */}
                <div className="pt-8 grid grid-cols-3 gap-4 border-t border-neutral-800/80 text-center sm:text-right">
                  <div className="space-y-1">
                    <div className="text-xl sm:text-2xl font-black text-[#e5c45a]">9 منتجات</div>
                    <div className="text-xs text-neutral-400">مخصصة لكل جزء بالسيارة</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xl sm:text-2xl font-black text-[#e5c45a]">غسيل جاف 100%</div>
                    <div className="text-xs text-neutral-400">حماية من البارومة والكهرباء</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xl sm:text-2xl font-black text-[#e5c45a]">خدمة متنقلة</div>
                    <div className="text-xs text-neutral-400">تصلك داخل كمبوندات زايد</div>
                  </div>
                </div>
              </div>

              {/* Left Visual Column — Full Height Transparent Cutout Porsche */}
              <div className="lg:col-span-6 relative flex items-center justify-center h-full min-h-[380px] sm:min-h-[480px] lg:min-h-[580px] py-4">
                <div className="relative w-full h-full flex items-center justify-center group">
                  <PublicImage
                    src="/images/bareeq_hero_car_cutout.png"
                    alt="بريق — عناية احترافية بالسيارات الفارهة"
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    priority
                    className="w-full h-auto max-h-[560px] object-contain drop-shadow-[0_20px_50px_rgba(201,162,39,0.25)] group-hover:scale-105 transition-transform duration-700 pointer-events-auto"
                  />

                  {/* Floating Badges seamlessly over black canvas */}
                  <div className="absolute bottom-2 left-2 right-2 sm:bottom-4 sm:left-4 sm:right-4 flex items-center justify-between text-xs text-[#e5c45a] pointer-events-none z-20">
                    <span className="bg-black/95 px-4 py-2 rounded-full border border-[#c9a227]/40 backdrop-blur-md font-semibold shadow-2xl">
                      لمعان واكس فائق وحماية الدهان
                    </span>
                    <span className="flex items-center gap-1.5 font-bold bg-black/95 px-3.5 py-2 rounded-full border border-[#c9a227]/40 backdrop-blur-md shadow-2xl">
                      <Star className="w-4 h-4 fill-[#c9a227] text-[#c9a227]" aria-hidden="true" /> 4.9/5
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 2. CATEGORY ICON SELECTOR BAR */}
        {/* ---------------------------------------------------- */}
        <section className="py-10 bg-black border-y border-neutral-800/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {quickCategories.map((cat, idx) => {
                const IconComp = cat.icon;
                return (
                  <Link
                    key={idx}
                    href={cat.href}
                    className="group p-5 rounded-2xl bg-[#121212] border border-[#c9a227]/20 hover:border-[#c9a227] hover:bg-[#1a1914] transition-all text-center flex flex-col items-center justify-center space-y-3"
                  >
                    <div className="w-12 h-12 rounded-xl bg-[#c9a227]/10 border border-[#c9a227]/30 text-[#e5c45a] flex items-center justify-center group-hover:scale-110 group-hover:bg-[#c9a227] group-hover:text-black transition-all">
                      <IconComp className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-[#e5c45a] transition-colors">{cat.name}</h3>
                      <p className="text-[10px] text-neutral-400 mt-1 line-clamp-1">{cat.desc}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 3. QUALITY PILLARS — DRIVEN TO DELIVER QUALITY (FIXED PADDING & UNCROPPED PRODUCT PHOTO) */}
        {/* ---------------------------------------------------- */}
        <section id="why-bareeq" className="pt-32 pb-24 bg-black relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
              <span className="text-xs font-extrabold tracking-widest text-[#e5c45a] uppercase">منظومة عناية احترافية متكاملة</span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight">
                لماذا تختار غسيل <span className="gold-gradient-text">بريق</span> الجاف بدلاً من الغسيل التقليدي بالمياه؟
              </h2>
              <p className="text-neutral-400 text-sm leading-relaxed max-w-2xl mx-auto">
                نقدم بديلاً أكثر أماناً وتنظيماً يحمي سيارتك من بهتان الدهان والبارومة مع توفير وقتك وجهدك.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              
              {/* Right 2 Callouts */}
              <div className="lg:col-span-3 space-y-6">
                <div className="p-6 rounded-2xl bg-[#121212] border border-[#c9a227]/25 space-y-2 hover:border-[#c9a227]/60 transition-colors text-right">
                  <div className="w-10 h-10 rounded-lg gold-gradient flex items-center justify-center text-black font-extrabold text-sm">1</div>
                  <h3 className="text-base font-bold text-white">9 مواد مصنعة محلياً</h3>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    منتج مخصص آمن لكل سطح: الدهان، الجلد، الفرش، التابلوه، الزجاج، والجنوط والموتور.
                  </p>
                </div>

                <div className="p-6 rounded-2xl bg-[#121212] border border-[#c9a227]/25 space-y-2 hover:border-[#c9a227]/60 transition-colors text-right">
                  <div className="w-10 h-10 rounded-lg gold-gradient flex items-center justify-center text-black font-extrabold text-sm">2</div>
                  <h3 className="text-base font-bold text-white">غسيل جاف 100% بدون مياه</h3>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    يمنع تشكل البارومة والصدأ، ولا يسبب أي تسريب مياه للدوائر الكهربائية والحساسات.
                  </p>
                </div>
              </div>

              {/* Center Hero Product Visual (Uncropped Photo) */}
              <div className="lg:col-span-6 relative text-center">
                <div className="relative inline-block rounded-3xl p-4 border border-[#c9a227]/40 bg-gradient-to-b from-[#141414] to-[#080808] shadow-2xl w-full">
                  <div className="relative w-full h-[380px] sm:h-[440px] flex items-center justify-center overflow-hidden rounded-2xl bg-[#0a0a0a] p-2">
                    <PublicImage
                      src="/images/bareeq_dry_product.png"
                      alt="منتجات بريق المتخصصة للعناية الجافة بالسيارات"
                      sizes="(min-width: 1024px) 40vw, 90vw"
                      className="w-full h-full object-contain mx-auto rounded-2xl"
                    />
                  </div>
                  <div className="mt-4 p-4 rounded-xl bg-black/80 border border-[#c9a227]/30 backdrop-blur-md">
                    <span className="text-xs font-bold text-[#e5c45a] block">تركيبة الواكس الواقية للدهان من بريق</span>
                    <span className="text-[11px] text-neutral-300">تمنح لمعاناً فائقاً وتمنع التصاق الأتربة والخدوش السطحية</span>
                  </div>
                </div>
              </div>

              {/* Left 2 Callouts */}
              <div className="lg:col-span-3 space-y-6">
                <div className="p-6 rounded-2xl bg-[#121212] border border-[#c9a227]/25 space-y-2 hover:border-[#c9a227]/60 transition-colors text-right">
                  <div className="w-10 h-10 rounded-lg gold-gradient flex items-center justify-center text-black font-extrabold text-sm">3</div>
                  <h3 className="text-base font-bold text-white">طبقة واكس واقية</h3>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    تمنح طبقة حماية على الدهان تقلل التصاق الأتربة وتساعد في الحفاظ على القيمة السوقية للسيارة.
                  </p>
                </div>

                <div className="p-6 rounded-2xl bg-[#121212] border border-[#c9a227]/25 space-y-2 hover:border-[#c9a227]/60 transition-colors text-right">
                  <div className="w-10 h-10 rounded-lg gold-gradient flex items-center justify-center text-black font-extrabold text-sm">4</div>
                  <h3 className="text-base font-bold text-white">تجهيز كامل بدون إزعاج</h3>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    فريق بريق مجهز بوحدات تشغيل ذاتية كاملة دون الحاجة لمصدر مياه أو كهرباء من موقعك.
                  </p>
                </div>
              </div>

            </div>

          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 4. THREE TALL CARE CARDS (MATCHING FERRARI / LAMBO / PORSCHE CARDS IN TARGET DESIGN) */}
        {/* ---------------------------------------------------- */}
        <section className="py-20 bg-black border-y border-neutral-800/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
              <div className="space-y-2">
                <span className="text-xs font-bold text-[#e5c45a]">أركان العناية الفائقة من بريق</span>
                <h2 className="text-3xl font-black text-white">خدمات مخصصة لكل خامة بالسيارة</h2>
              </div>
              <Link href="/services" className="text-xs font-bold text-[#e5c45a] hover:underline flex items-center gap-1">
                <span>استكشف كافة الخدمات</span>
                <ChevronRight className="w-4 h-4 rotate-180" aria-hidden="true" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              
              {/* Card 1: Exterior Care */}
              <div className="group relative rounded-3xl overflow-hidden border border-[#c9a227]/30 bg-[#141414] hover:border-[#c9a227] transition-all">
                <div className="h-80 relative overflow-hidden">
                  <PublicImage
                    src="/images/bareeq_exterior_care.png"
                    alt="العناية بالهيكل الخارجي والدهان والجنوط"
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                </div>
                <div className="p-6 relative z-10 -mt-16 space-y-3">
                  <span className="px-3 py-1 rounded-full bg-[#c9a227]/20 border border-[#c9a227]/40 text-[11px] font-bold text-[#e5c45a] inline-block">
                    الدهان والجنوط والزجاج
                  </span>
                  <h3 className="text-xl font-bold text-white">العناية الخارجية بالدهان</h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    غسيل جاف ممتاز من بريق يعيد للمعان الدهان بريقه مع طبقة واكس واقية تمنع خدوش الغسيل التقليدي.
                  </p>
                  <Link href="/services" className="pt-2 inline-flex items-center gap-2 text-xs font-bold text-[#e5c45a] hover:gap-3 transition-all">
                    <span>التفاصيل والحجز</span>
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* Card 2: Interior Care */}
              <div className="group relative rounded-3xl overflow-hidden border border-[#c9a227]/30 bg-[#141414] hover:border-[#c9a227] transition-all">
                <div className="h-80 relative overflow-hidden">
                  <PublicImage
                    src="/images/bareeq_interior_care.png"
                    alt="العناية بالفرش والجلد والتابلوه"
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                </div>
                <div className="p-6 relative z-10 -mt-16 space-y-3">
                  <span className="px-3 py-1 rounded-full bg-[#c9a227]/20 border border-[#c9a227]/40 text-[11px] font-bold text-[#e5c45a] inline-block">
                    الجلد والفرش والتابلوه
                  </span>
                  <h3 className="text-xl font-bold text-white">العناية الداخلية وتنظيف الجلد</h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    منتجات ترطيب وتنظيف متخصصة تمنع جفاف وتشققات الجلد والتابلوه بدون روائح حادة.
                  </p>
                  <Link href="/services" className="pt-2 inline-flex items-center gap-2 text-xs font-bold text-[#e5c45a] hover:gap-3 transition-all">
                    <span>التفاصيل والحجز</span>
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* Card 3: Engine Care */}
              <div className="group relative rounded-3xl overflow-hidden border border-[#c9a227]/30 bg-[#141414] hover:border-[#c9a227] transition-all">
                <div className="h-80 relative overflow-hidden">
                  <PublicImage
                    src="/images/bareeq_engine_care.png"
                    alt="تنظيف وحماية حجرة الموتور"
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                </div>
                <div className="p-6 relative z-10 -mt-16 space-y-3">
                  <span className="px-3 py-1 rounded-full bg-[#c9a227]/20 border border-[#c9a227]/40 text-[11px] font-bold text-[#e5c45a] inline-block">
                    أمان وحماية الموتور
                  </span>
                  <h3 className="text-xl font-bold text-white">تنظيف حجرة الموتور بعناية</h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    تنظيف أمن ومدروس من بريق يمنع تعريض المكونات والدوائر الكهربائية للمياه أو المواد الضارة.
                  </p>
                  <Link href="/services" className="pt-2 inline-flex items-center gap-2 text-xs font-bold text-[#e5c45a] hover:gap-3 transition-all">
                    <span>التفاصيل والحجز</span>
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>

            </div>

          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 5. SERVICES CATALOG SECTION (WITH REAL AI PHOTOGRAPHY) */}
        {/* ---------------------------------------------------- */}
        <section className="py-24 bg-[#080808]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
              <div>
                <span className="text-xs font-bold text-[#e5c45a]">كتالوج بريق للعناية</span>
                <h2 className="text-3xl font-black text-white mt-1">الخدمات الأكثر طلباً بالشيخ زايد</h2>
              </div>
              <Link href="/services" className="text-xs font-bold text-[#e5c45a] hover:underline flex items-center gap-1">
                <span>تصفح جميع الخدمات ({services.length})</span>
                <ChevronRight className="w-4 h-4 rotate-180" aria-hidden="true" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {services.map((service) => {
                const realImg = getServiceRealImage(service.slug, service.coverImage);
                return (
                  <div key={service.id} className="rounded-3xl bg-[#141414] border border-[#c9a227]/25 overflow-hidden flex flex-col justify-between hover:border-[#c9a227] transition-all group">
                    <div>
                      <div className="h-56 relative overflow-hidden bg-[#0d0d0d]">
                        <PublicImage
                          src={realImg}
                          alt={service.nameAr}
                          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute top-3 right-3 bg-black/85 px-3 py-1 rounded-full border border-[#c9a227]/40 text-[11px] font-bold text-[#e5c45a] backdrop-blur-md">
                          المدة: {service.durationMinutes} دقيقة
                        </div>
                      </div>

                      <div className="p-6 space-y-4">
                        <h3 className="text-xl font-bold text-white group-hover:text-[#e5c45a] transition-colors">{service.nameAr}</h3>
                        <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2">{service.shortDescriptionAr}</p>

                        {Array.isArray(service.includedItems) && service.includedItems.length > 0 && (
                          <div className="space-y-1.5 pt-2 border-t border-neutral-800">
                            {(service.includedItems as string[]).slice(0, 3).map((item, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs text-neutral-300">
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#c9a227] shrink-0" aria-hidden="true" />
                                <span className="truncate">{item}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-6 pt-0 space-y-4">
                      <div className="flex items-center justify-between border-t border-neutral-800 pt-4">
                        <div>
                          <span className="text-[10px] text-neutral-400 block">السعر يبدأ من</span>
                          <span className="text-2xl font-black text-[#e5c45a]">{service.basePrice} ج.م</span>
                        </div>
                        <Link
                          href={`/services/${service.slug}/book`}
                          className="px-5 py-2.5 rounded-xl gold-gradient text-black font-bold text-xs hover:brightness-110 transition-all shadow-lg shadow-[#c9a227]/20"
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
        <section className="relative py-28 overflow-hidden bg-black border-y border-neutral-800">
          <div className="absolute inset-0">
            <PublicImage
              src="/images/bareeq_banner_van.png"
              alt="سيارات تشغيل بريق المجهزة بالكامل بالشيخ زايد"
              sizes="100vw"
              className="w-full h-full object-cover opacity-40 scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-right max-w-2xl me-auto">
            <div className="space-y-6">
              <span className="px-3.5 py-1.5 rounded-full bg-[#c9a227]/20 border border-[#c9a227]/40 text-xs font-bold text-[#e5c45a] inline-block">
                راحة تامة أمام منزلك أو مقر عملك
              </span>
              
              <h2 className="text-3xl sm:text-5xl font-black text-white leading-tight">
                تجربة عناية متنقلة راقية <span className="gold-gradient-text">تليق بسيارتك ووقتك</span>
              </h2>

              <p className="text-neutral-300 text-sm sm:text-base leading-relaxed">
                لا داعي لإضاعة ساعات الانتظار في المغاسل أو المخاطرة بالغسيل العشوائي. وحدات بريق المجهزة تصلك أينما كنت في الشيخ زايد مع الالتزام التام بالمواعيد المحددة.
              </p>

              <div className="pt-2">
                <Link
                  href="/services"
                  className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl gold-gradient text-black font-black text-base shadow-2xl hover:brightness-110 transition-all"
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
        <section className="py-24 bg-[#0c0c0c] border-b border-neutral-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
              <span className="text-xs font-bold text-[#e5c45a]">الاشتراكات العائلية والدورية من بريق</span>
              <h2 className="text-3xl font-black text-white">باقات عناية مستمرة طوال الشهر</h2>
              <p className="text-neutral-400 text-xs sm:text-sm">
                احصل على زيارات دورية مجدولة وتوفير حقيقي مع حفظ رصيد الزيارات داخل حسابك التفاعلي.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {plans.map((plan) => (
                <div key={plan.id} className="relative rounded-3xl bg-[#141414] border border-[#c9a227]/30 p-8 space-y-6 flex flex-col justify-between hover:border-[#c9a227] transition-all">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 rounded-full bg-[#c9a227]/10 text-[#e5c45a] text-xs font-bold border border-[#c9a227]/30">
                        صلاحية {plan.validityDays} يوم
                      </span>
                      <Award className="w-6 h-6 text-[#c9a227]" aria-hidden="true" />
                    </div>

                    <h3 className="text-2xl font-black text-white">{plan.nameAr}</h3>
                    <p className="text-xs text-neutral-400 leading-relaxed">{plan.descriptionAr}</p>

                    <div className="py-4 border-y border-neutral-800">
                      <span className="text-3xl font-black text-[#e5c45a]">{plan.price} ج.م</span>
                      <span className="text-xs text-neutral-400 me-2">/ باقة دورية</span>
                    </div>

                    <ul className="space-y-2 text-xs text-neutral-300">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#c9a227]" />
                        <span>تشمل {plan.visitCount} زيارات عناية جافة شاملة</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#c9a227]" />
                        <span>تأكيد المواعيد تلقائياً بدون طلب بياناتك مجدداً</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#c9a227]" />
                        <span>أولوية الإسناد لفرق التشغيل المخصصة</span>
                      </li>
                    </ul>
                  </div>

                  <Link
                    href="/plans"
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl gold-gradient text-black font-extrabold text-sm hover:brightness-110 transition-all shadow-lg shadow-[#c9a227]/20"
                  >
                    <span>اشترك الآن وحافظ على نظافة سيارتك</span>
                  </Link>
                </div>
              ))}
            </div>

          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 8. KNOWLEDGE & ARTICLES — DRY WASH VS WATER WASH */}
        {/* ---------------------------------------------------- */}
        <section className="py-24 bg-[#080808]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
              <span className="text-xs font-bold text-[#e5c45a]">دليل بريق للعناية بالسيارات</span>
              <h2 className="text-3xl font-black text-white">لماذا يعتبر الغسيل التقليدي بالمياه خياراً خاطئاً؟</h2>
              <p className="text-neutral-400 text-xs sm:text-sm">
                حقائق توضح الأضرار الناتجة عن الطرق التقليدية وكيف يحمي نظام بريق الجاف قيمة سيارتك.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              
              {/* Card 1 */}
              <div className="p-7 rounded-3xl bg-[#121212] border border-red-500/20 space-y-4 hover:border-red-500/40 transition-colors">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-400 flex items-center justify-center">
                  <ShieldAlert className="w-6 h-6" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-bold text-white">أضرار الغسيل التقليدي بالمياه</h3>
                <ul className="space-y-2 text-xs text-neutral-300 leading-relaxed">
                  <li>• بهتان الدهان وظهور خدوش دائرية من الفوط غير النظيفة.</li>
                  <li>• تراكم المياه بالفواصل مما يسبب الصدأ والبارومة مع الوقت.</li>
                  <li>• تسريب المياه للمكونات الحساسة والدوائر الكهربائية بالمحرك.</li>
                </ul>
              </div>

              {/* Card 2 */}
              <div className="p-7 rounded-3xl bg-[#121212] border border-amber-500/20 space-y-4 hover:border-amber-500/40 transition-colors">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-bold text-white">مخاطر الكيماويات العشوائية</h3>
                <ul className="space-y-2 text-xs text-neutral-300 leading-relaxed">
                  <li>• المواد القاسية تسبب تشقق وجفاف التابلوه والجلد والفرش.</li>
                  <li>• ترك روائح حادة نفاذة قد تؤثر على الصحة العامة.</li>
                  <li>• استخدام مادة واحدة لكل أجزاء السيارة بدون مراعاة الخامات.</li>
                </ul>
              </div>

              {/* Card 3 */}
              <div className="p-7 rounded-3xl bg-[#121212] border border-[#c9a227]/40 space-y-4 hover:border-[#c9a227] transition-colors gold-glow">
                <div className="w-12 h-12 rounded-2xl gold-gradient text-black flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-bold text-white">ابتكار بريق: العناية الجافة 100%</h3>
                <ul className="space-y-2 text-xs text-neutral-300 leading-relaxed">
                  <li>• 9 منتجات متخصصة آمنة مصنعة محلياً لكل جزء بالسيارة.</li>
                  <li>• طبقة واكس واقية تمنح لمعاناً زجاجياً وتمنع التصاق الأتربة.</li>
                  <li>• الحفاظ الكامل على القيمة السوقية ومظهر السيارة على المدى الطويل.</li>
                </ul>
              </div>

            </div>

          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 9. VISUAL GALLERY — BENTO GRID */}
        {/* ---------------------------------------------------- */}
        <section className="py-24 bg-[#0d0d0d] border-t border-neutral-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            
            <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
              <span className="text-xs font-bold text-[#e5c45a]">معرض الفخامة</span>
              <h2 className="text-3xl font-black text-white">لمسات بريق — نتائج حقيقية تتحدث عن الدقة</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              
              <div className="rounded-2xl overflow-hidden border border-[#c9a227]/20 h-64 relative group">
                <PublicImage
                  src="/images/bareeq_hero_car.png"
                  alt="لمعان دهان السيارة الخارجي من بريق"
                  sizes="(min-width: 768px) 33vw, 50vw"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity p-4 flex items-end">
                  <span className="text-xs font-bold text-[#e5c45a]">لمعان دهان بتركيبة الواكس من بريق</span>
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden border border-[#c9a227]/20 h-64 relative group">
                <PublicImage
                  src="/images/bareeq_interior_care.png"
                  alt="تنظيف وترطيب جلد السيارة من بريق"
                  sizes="(min-width: 768px) 33vw, 50vw"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity p-4 flex items-end">
                  <span className="text-xs font-bold text-[#e5c45a]">ترطيب وتطهير المقاعد الجلدية</span>
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden border border-[#c9a227]/20 h-64 relative group">
                <PublicImage
                  src="/images/bareeq_engine_care.png"
                  alt="تنظيف حجرة المحرك"
                  sizes="(min-width: 768px) 33vw, 50vw"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity p-4 flex items-end">
                  <span className="text-xs font-bold text-[#e5c45a]">تنظيف آمن لحجرة الموتور</span>
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden border border-[#c9a227]/20 h-64 relative group">
                <PublicImage
                  src="/images/bareeq_dry_product.png"
                  alt="منتجات بريق التسعة"
                  sizes="(min-width: 768px) 33vw, 50vw"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity p-4 flex items-end">
                  <span className="text-xs font-bold text-[#e5c45a]">منتجات بريق الـ 9 المتخصصة</span>
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden border border-[#c9a227]/20 h-64 relative group">
                <PublicImage
                  src="/images/bareeq_exterior_care.png"
                  alt="تلميع الجنوط والإطارات"
                  sizes="(min-width: 768px) 33vw, 50vw"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity p-4 flex items-end">
                  <span className="text-xs font-bold text-[#e5c45a]">تلميع وحماية الجنوط والفرامل</span>
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden border border-[#c9a227]/20 h-64 relative group">
                <PublicImage
                  src="/images/bareeq_banner_van.png"
                  alt="سيارة تشغيل بريق المتنقلة"
                  sizes="(min-width: 768px) 33vw, 50vw"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity p-4 flex items-end">
                  <span className="text-xs font-bold text-[#e5c45a]">وحدات التجهيز الذاتي بالكمبوند</span>
                </div>
              </div>

            </div>

          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 10. CUSTOMER TESTIMONIALS */}
        {/* ---------------------------------------------------- */}
        {publishedTestimonials.length > 0 && (
          <section className="py-24 bg-[#080808]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              
              <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
                <span className="text-xs font-bold text-[#e5c45a]">ثقة ملاك السيارات بالشيخ زايد</span>
                <h2 className="text-3xl font-black text-white">آراء عملاء بريق</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {publishedTestimonials.map((t) => (
                  <div key={t.id} className="p-7 rounded-3xl bg-[#141414] border border-[#c9a227]/25 space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center gap-1 text-[#c9a227]">
                        {Array.from({ length: t.score }).map((_, i) => (
                          <Star key={i} className="w-4 h-4 fill-[#c9a227]" aria-hidden="true" />
                        ))}
                      </div>
                      <p className="text-xs text-neutral-300 leading-relaxed italic">&quot;{t.comment}&quot;</p>
                    </div>

                    <div className="pt-4 border-t border-neutral-800 flex items-center justify-between text-xs">
                      <span className="font-bold text-white">{publicCustomerName(t.customer.user.fullName)}</span>
                      <span className="text-neutral-400">{t.booking.service.nameAr}</span>
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
        <section className="py-20 bg-[#0c0c0c] border-t border-neutral-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-xs font-bold text-[#e5c45a]">
                  <MapPin className="w-4 h-4" />
                  <span>مناطق التغطية بالشيخ زايد</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white">نخدم جميع كمبوندات وأحياء الشيخ زايد</h2>
              </div>

              <div className="flex flex-wrap gap-2 max-w-2xl">
                {coverageAreas.map((area) => (
                  <span key={area.id} className="px-3.5 py-1.5 rounded-full bg-[#141414] border border-[#c9a227]/30 text-xs font-semibold text-neutral-200">
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
        <section className="py-24 bg-[#080808]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16 space-y-3">
              <span className="text-xs font-bold text-[#e5c45a]">إجابات وشفافية</span>
              <h2 className="text-3xl font-black text-white">الأسئلة الشائعة حول خدمات بريق</h2>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, idx) => (
                <div key={idx} className="p-6 rounded-2xl bg-[#141414] border border-[#c9a227]/20 space-y-2">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full gold-gradient text-black text-xs flex items-center justify-center font-bold">؟</span>
                    <span>{faq.q}</span>
                  </h3>
                  <p className="text-xs text-neutral-400 leading-relaxed ps-8">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- */}
        {/* 13. CONTACT SECTION */}
        {/* ---------------------------------------------------- */}
        <section className="py-20 bg-[#0d0d0d] border-t border-neutral-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
            <h2 className="text-3xl font-black text-white">هل لديك استفسار خاص بسيارتك؟</h2>
            <p className="text-xs sm:text-sm text-neutral-400 max-w-xl mx-auto">
              فريق بريق على استعداد تام للإجابة على جميع الاستفسارات وتنسيق المواعيد الخاصة للحجوزات العائلية أو أسطول السيارات.
            </p>

            <div className="flex flex-wrap justify-center gap-4 pt-4">
              {branchContact?.phone && (
                <a
                  href={phoneHref(branchContact.phone)}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#141414] border border-[#c9a227]/40 text-[#e5c45a] font-bold text-sm hover:bg-[#c9a227]/10 transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  <span>اتصل بنا: {branchContact.phone}</span>
                </a>
              )}

              {branchContact?.whatsapp && (
                <a
                  href={whatsappHref(branchContact.whatsapp, 'مرحباً، أود الاستفسار عن خدمات بريق للعناية بالسيارات')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-bold text-sm hover:bg-emerald-900/60 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
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
