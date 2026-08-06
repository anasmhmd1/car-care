import Link from 'next/link';
import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { createPublicMetadata } from '@/lib/seo';
import { Check, Layers } from 'lucide-react';

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
  });

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col font-sans">
      <Navbar user={user} />

      <main id="main-content" className="flex-1 pt-32 pb-24 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-12">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#141414] border border-[#c9a227]/30 text-xs font-semibold text-[#e5c45a]">
            <Layers className="w-4 h-4 text-[#c9a227]" aria-hidden="true" />
            <span>باقات الاشتراكات والزيارات المخصصة</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black gold-gradient-text">باقات العناية الدورية بالسيارات</h1>
          <p className="text-neutral-400 text-sm max-w-2xl mx-auto leading-relaxed">
            استمتع بزيارات دورية مجدولة لسيارتك بأسعار مميزة، مع حفظ رصيد الزيارات وتتبعها داخل حسابك الشخصي.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.length === 0 ? (
            <section className="md:col-span-2 rounded-3xl border border-neutral-800 bg-[#141414] p-10 text-center" aria-labelledby="plans-empty-title">
              <h2 id="plans-empty-title" className="text-xl font-bold text-white">لا توجد باقات متاحة حاليًا</h2>
              <p className="mt-2 text-sm text-neutral-400">يمكنك حجز خدمة فردية الآن أو العودة لاحقًا للاطلاع على الباقات الجديدة.</p>
              <Link href="/services" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl gold-gradient px-5 py-2.5 text-sm font-bold text-[#080808] hover:brightness-110 transition-[filter,transform]">
                تصفح الخدمات
              </Link>
            </section>
          ) : plans.map((plan) => (
            <div id={`plan-${plan.id}`} key={plan.id} className="scroll-mt-28 p-8 rounded-3xl glass-card border border-[#c9a227]/30 space-y-6 flex flex-col justify-between gold-glow-hover">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#e5c45a] bg-[#c9a227]/10 px-3 py-1 rounded-full border border-[#c9a227]/30">
                    صلاحية {plan.validityDays} يوم
                  </span>
                  <span className="text-xs text-neutral-400 font-semibold">{plan.visitCount} زيارات مشمولة</span>
                </div>

                <h2 className="text-2xl font-black text-white">{plan.nameAr}</h2>
                <p className="text-neutral-400 text-xs leading-relaxed">{plan.descriptionAr}</p>

                <div className="pt-4 border-t border-neutral-800 space-y-2">
                  <span className="text-xs font-bold text-[#e5c45a] block">الخدمات المشمولة بالباقة:</span>
                  <ul className="space-y-1">
                    {plan.services.map(({ service, visitQuota }) => (
                      <li key={service.id} className="text-xs text-neutral-300 flex items-center gap-2">
                        <Check className="w-4 h-4 text-[#c9a227] shrink-0" aria-hidden="true" />
                        <span>{service.nameAr}{visitQuota !== null ? ` — ${visitQuota} زيارة` : ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-4 text-3xl font-black text-[#e5c45a]">
                  {plan.price} <span className="text-sm font-normal text-neutral-400">ج.م</span>
                </div>
              </div>

              <Link
                href={`/account/subscriptions?plan=${plan.id}`}
                className="w-full text-center py-3.5 rounded-xl gold-gradient text-[#080808] font-bold text-sm shadow-md hover:brightness-110 transition-[filter,transform]"
              >
                طلب الاشتراك اليدوي
              </Link>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
