import Link from 'next/link';
import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { createPublicMetadata } from '@/lib/seo';
import { Award, CheckCircle2, Layers } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = createPublicMetadata({
  title: 'باقات العناية الدورية',
  description: 'استعرض باقات بريق وعدد الزيارات والخدمات المشمولة ومدة صلاحية كل باقة.',
  path: '/plans',
});

export default async function PlansPage() {
  const user = await getCurrentUser();
  const plans = await db.subscriptionPlan.findMany({
    where: { active: true },
    include: { services: { include: { service: true } } },
    orderBy: { price: 'asc' },
  });

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-[#cea355] selection:text-black" dir="rtl">
      <Navbar user={user} />

      <main id="main-content" className="flex-1 pt-32 pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-14">
        <div className="text-center space-y-4">
          <h1 className="text-3xl sm:text-5xl font-black text-white">باقات العناية الدورية بالسيارات</h1>
          <p className="text-white text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            استمتع بزيارات دورية مجدولة لسيارتك بأسعار مميزة، مع حفظ رصيد الزيارات وتتبعها داخل حسابك الشخصي.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.length === 0 ? (
            <section className="col-span-full rounded-3xl border border-neutral-800 bg-[#121212] p-10 text-center" aria-labelledby="plans-empty-title">
              <h2 id="plans-empty-title" className="text-xl font-bold text-white">لا توجد باقات متاحة حاليًا</h2>
              <p className="mt-2 text-sm text-white">يمكنك حجز خدمة فردية الآن أو العودة لاحقًا للاطلاع على الباقات الجديدة.</p>
              <Link href="/services" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl gold-gradient px-6 py-2.5 text-sm font-extrabold text-white hover:brightness-110 transition-all">
                تصفح الخدمات
              </Link>
            </section>
          ) : plans.map((plan, idx) => {
            const isFeatured = idx === 1 || plan.price > 2000;
            return (
              <div
                id={`plan-${plan.id}`}
                key={plan.id}
                className={`relative scroll-mt-28 rounded-3xl bg-[#121212] p-8 space-y-6 flex flex-col justify-between transition-all glass-card-hover ${
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

                  <h2 className="text-2xl font-black text-white">{plan.nameAr}</h2>
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
      </main>

      <Footer />
    </div>
  );
}
