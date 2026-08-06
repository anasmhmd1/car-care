import Link from 'next/link';
import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import { getCurrentUser } from '@/lib/auth/session';
import { createPublicMetadata } from '@/lib/seo';
import { Sparkles, Award, Truck, Clock, ShieldCheck, CheckCircle2, ArrowRight } from 'lucide-react';

export const metadata = createPublicMetadata({
  title: 'عن بريق',
  description: 'تعرف على طريقة عمل بريق وتجهيز فرق العناية المتنقلة ونظام توثيق الجودة قبل الخدمة وبعدها.',
  path: '/about',
});

export default async function AboutPage() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col font-sans">
      <Navbar user={user} />

      <main id="main-content" className="flex-1 pt-32 pb-24 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-16">
        {/* Hero Section */}
        <div className="text-center space-y-5">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#141414] border border-[#c9a227]/30 text-xs font-semibold text-[#e5c45a]">
            <Sparkles className="w-4 h-4 text-[#c9a227]" aria-hidden="true" />
            <span>تجربة استثنائية للعناية بالسيارات</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black gold-gradient-text leading-tight">
            لماذا يختار النخبة بريق؟
          </h1>
          <p className="text-neutral-400 text-base sm:text-lg max-w-3xl mx-auto leading-relaxed">
            نحن لا نقدم مجرد غسيل أو تنظيف تقليدي للسيارة، بل نعيد لسيارتك بريقها الفاخر كأنها خرجت من المعرض للتو، وبأعلى مستويات الرفاهية في موقعك دون إهدار وقتك.
          </p>
        </div>

        {/* Pillars Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-8 rounded-3xl bg-[#141414] border border-[#c9a227]/20 space-y-4 text-center hover:border-[#c9a227]/50 transition-[border-color,box-shadow] flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-[#080808] border border-[#c9a227]/30 flex items-center justify-center text-[#c9a227]">
              <Award className="w-7 h-7" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-bold text-[#e5c45a]">مواد مختارة لكل سطح</h2>
            <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed">
              نختار مواد العناية وفق نوع السطح وتعليمات الاستخدام، مع أدوات منفصلة للطلاء والزجاج والجنوط والمقصورة الداخلية.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-[#141414] border border-[#c9a227]/20 space-y-4 text-center hover:border-[#c9a227]/50 transition-[border-color,box-shadow] flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-[#080808] border border-[#c9a227]/30 flex items-center justify-center text-[#c9a227]">
              <Truck className="w-7 h-7" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-bold text-[#e5c45a]">وحدات تشغيل متنقلة</h2>
            <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed">
              فريق بريق يصلك بسيارات الخدمة المتنقلة المجهزة بالكامل بمصدر مياه محلاة ومولدات كهرباء صامتة ومعدات غسيل بالبخار دون استخدام مواردك.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-[#141414] border border-[#c9a227]/20 space-y-4 text-center hover:border-[#c9a227]/50 transition-[border-color,box-shadow] flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-[#080808] border border-[#c9a227]/30 flex items-center justify-center text-[#c9a227]">
              <Clock className="w-7 h-7" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-bold text-[#e5c45a]">جدولة تراعي وقت الانتقال</h2>
            <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed">
              تراعي المواعيد المتاحة مدة الخدمة ووقت الانتقال بين المناطق لتقليل التأخير وتنظيم يوم فريق التنفيذ.
            </p>
          </div>
        </div>

        {/* Quality Checklist Statement */}
        <div className="p-8 md:p-12 rounded-3xl bg-gradient-to-br from-[#141414] via-[#141414] to-[#1f1906] border border-[#c9a227]/40 space-y-6 shadow-2xl">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-[#c9a227]" aria-hidden="true" />
            <h2 className="text-2xl sm:text-3xl font-bold text-white">فحص جودة موثق</h2>
          </div>
          <p className="text-neutral-300 text-sm sm:text-base leading-relaxed">
            تمر الخدمة بقائمة فحص مرتبطة بنوعها، مع صور توثيقية قبل التنفيذ وبعده لمراجعة النتيجة داخل سجل الحجز.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-neutral-300 pt-2">
            <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" /> <span>مراجعة السطح الخارجي</span></div>
            <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" /> <span>فحص الجنوط والإطارات</span></div>
            <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" /> <span>مراجعة الزجاج والمرايا</span></div>
            <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" /> <span>مراجعة المقصورة</span></div>
          </div>

          <div className="pt-4 flex flex-wrap gap-4">
            <Link
              href="/services"
              className="gold-gradient text-[#080808] font-bold px-8 py-3.5 rounded-xl text-xs sm:text-sm flex items-center gap-2 shadow-lg hover:brightness-110 transition-[filter,transform]"
            >
              <span>احجز خدمتك الآن</span>
              <ArrowRight className="w-4 h-4 rotate-180" aria-hidden="true" />
            </Link>
            <Link
              href="/before-after"
              className="px-8 py-3.5 rounded-xl bg-[#080808] text-white font-bold text-xs sm:text-sm border border-neutral-800 hover:border-[#c9a227] transition-[color,border-color]"
            >
              معرض النتائج
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
