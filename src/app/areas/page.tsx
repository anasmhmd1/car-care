import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { createPublicMetadata } from '@/lib/seo';
import { MessageSquare, Compass, ChevronRight } from 'lucide-react';
import { getPublicBranchContact, whatsappHref } from '@/lib/public-contact';

export const dynamic = 'force-dynamic';

export const metadata = createPublicMetadata({
  title: 'مناطق التغطية',
  description: 'تعرف على مناطق التغطية التي تشملها خدمة بريق المتنقلة.',
  path: '/areas',
});

function cleanZoneName(name: string) {
  return name.replace(/^Zone\s*\d+\s*[-—]\s*/i, '').trim();
}

export default async function AreasPage() {
  const user = await getCurrentUser();
  const [zones, branch] = await Promise.all([
    db.coverageZone.findMany({
      where: { branch: { status: 'ACTIVE' } },
      include: {
        areas: {
          where: { active: true },
          orderBy: [{ priority: 'asc' }, { compound: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    }),
    getPublicBranchContact(),
  ]);

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-[#cea355] selection:text-black" dir="rtl">
      <Navbar user={user} />

      <main id="main-content" className="flex-1 pt-32 pb-24 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-16">
        
        {/* Page Header */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <h1 className="text-3xl sm:text-5xl font-black text-white">مناطق التغطية</h1>
          <p className="text-white text-sm sm:text-base leading-relaxed">
            نخدم حاليًا مناطق وكمبوندات مختارة لضمان أعلى معايير الجودة والالتزام الصارم بالمواعيد.
          </p>
        </div>

        {/* Zones Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {zones.length === 0 ? (
            <section className="col-span-full rounded-3xl border border-neutral-800 bg-[#121212] p-12 text-center space-y-3" aria-labelledby="areas-empty-title">
              <Compass className="w-10 h-10 text-neutral-500 mx-auto" />
              <h2 id="areas-empty-title" className="text-xl font-bold text-white">يتم تحديث نطاقات التغطية</h2>
              <p className="text-sm text-white">تواصل معنا للتأكد من إمكانية وصول فريق بريق إلى موقعك.</p>
              <Link href="/services" className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gold-gradient text-white text-xs font-bold">
                <span>استعراض كافة الخدمات</span>
                <ChevronRight className="w-4 h-4 rotate-180" />
              </Link>
            </section>
          ) : (
            zones.map((zone) => (
              <div
                key={zone.id}
                className="p-8 rounded-3xl bg-[#121212] border border-[#cea355]/30 hover:border-[#cea355] transition-all duration-300 flex flex-col justify-start space-y-5 glass-card-hover group"
              >
                <div className="border-b border-neutral-800 pb-4">
                  <h2 className="text-xl font-black text-white group-hover:text-[#edce8b] transition-colors">
                    {cleanZoneName(zone.name)}
                  </h2>
                </div>

                {zone.description && (
                  <p className="text-xs text-white leading-relaxed">{zone.description}</p>
                )}

                <div className="space-y-2.5 pt-1">
                  <span className="text-xs font-bold text-[#edce8b] block">الكمبوندات والمناطق المدعومة:</span>
                  <div className="flex flex-wrap gap-2">
                    {zone.areas.map((area) => (
                      <span
                        key={area.id}
                        className="px-3.5 py-1.5 rounded-xl bg-[#1a1a1a] border border-neutral-700/80 text-xs font-bold text-white hover:border-[#cea355] transition-all"
                      >
                        {area.compound}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Outside Coverage Box */}
        <div className="p-8 sm:p-10 rounded-3xl bg-[#121212] border border-[#cea355]/30 text-center space-y-5 max-w-2xl mx-auto shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-[#cea355]/15 border border-[#cea355]/40 flex items-center justify-center text-white mx-auto">
            <Compass className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-black text-white">هل موقعك خارج نطاق التغطية الحالي؟</h2>
          <p className="text-white text-xs sm:text-sm leading-relaxed">
            إذا كنت في منطقة أو كمبوند غير مدرج بالقائمة، يسعدنا تواصلك المباشر مع فريقنا للاستفسار عن إمكانية الجدولة الخاصة لموقعك.
          </p>
          {branch ? (
            <a
              href={whatsappHref(branch.whatsapp, 'مرحبًا فريق بريق، أريد الاستفسار عن إمكانية تغطية موقعي')}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/25 font-extrabold text-xs transition-all shadow-lg active:scale-98"
            >
              <MessageSquare className="w-4 h-4 text-emerald-300" aria-hidden="true" />
              <span>تواصل معنا عبر WhatsApp</span>
            </a>
          ) : (
            <Link
              href="/contact"
              className="inline-flex items-center justify-center min-h-11 rounded-xl gold-gradient px-6 text-xs font-bold text-white shadow-md"
            >
              تواصل معنا
            </Link>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
