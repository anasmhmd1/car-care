import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { createPublicMetadata } from '@/lib/seo';
import { MapPin, MessageSquare } from 'lucide-react';
import { getPublicBranchContact, whatsappHref } from '@/lib/public-contact';

export const dynamic = 'force-dynamic';

export const metadata = createPublicMetadata({
  title: 'مناطق التغطية',
  description: 'تعرف على مناطق وكمبوندات الشيخ زايد التي تغطيها خدمة بريق المتنقلة.',
  path: '/areas',
});

export default async function AreasPage() {
  const user = await getCurrentUser();
  const [zones, branch] = await Promise.all([
    db.coverageZone.findMany({
      where: { branch: { status: 'ACTIVE' } },
      include: { areas: { where: { active: true }, orderBy: [{ priority: 'asc' }, { compound: 'asc' }] } },
      orderBy: { name: 'asc' },
    }),
    getPublicBranchContact(),
  ]);

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col font-sans">
      <Navbar user={user} />

      <main id="main-content" className="flex-1 pt-32 pb-24 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-12">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#141414] border border-[#c9a227]/30 text-xs font-semibold text-[#e5c45a]">
            <MapPin className="w-4 h-4 text-[#c9a227]" aria-hidden="true" />
            <span>نطاق التغطية والجغرافيا الحالية</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black gold-gradient-text">مناطق التغطية والكمبوندات</h1>
          <p className="text-neutral-400 text-sm max-w-2xl mx-auto leading-relaxed">
            نخدم حاليًا مناطق مختارة في الشيخ زايد لضمان جودة التنفيذ والالتزام بالمواعيد.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {zones.length === 0 ? (
            <section className="md:col-span-3 rounded-3xl border border-neutral-800 bg-[#141414] p-10 text-center" aria-labelledby="areas-empty-title">
              <h2 id="areas-empty-title" className="text-xl font-bold text-white">يتم تحديث مناطق التغطية</h2>
              <p className="mt-2 text-sm text-neutral-400">تواصل معنا للتأكد من إمكانية وصول الفريق إلى موقعك.</p>
            </section>
          ) : zones.map((zone) => (
            <div key={zone.id} className="p-8 rounded-3xl glass-card border border-[#c9a227]/20 space-y-4">
              <h2 className="text-xl font-bold text-[#e5c45a] border-b border-neutral-800 pb-3">{zone.name}</h2>
              <p className="text-xs text-neutral-400">{zone.description}</p>

              <div className="space-y-2 pt-2">
                <span className="text-xs font-semibold text-white block">الكمبوندات والمناطق المدعومة:</span>
                <div className="flex flex-wrap gap-2">
                  {zone.areas.map((area) => (
                    <span key={area.id} className="px-3 py-1.5 rounded-lg bg-[#080808] border border-neutral-800 text-xs text-neutral-300">
                      {area.compound}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Outside Coverage Box */}
        <div className="p-8 rounded-3xl bg-[#141414] border border-neutral-800 text-center space-y-4 max-w-2xl mx-auto">
          <h2 className="text-lg font-bold text-white">هل موقعك خارج نطاق التغطية الحالي؟</h2>
          <p className="text-xs text-neutral-400 leading-relaxed">
            إذا كنت في منطقة قريبة خارج الشيخ زايد، يمكنك التواصل المباشر مع فرعنا عبر WhatsApp للاستفسار عن إمكانية الجدولة الخاصة.
          </p>
          {branch ? <a
            href={whatsappHref(branch.whatsapp, 'مرحبًا فريق بريق، أريد الاستفسار عن تغطية موقعي')}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 font-bold text-xs hover:bg-emerald-500/20 transition-colors"
          >
            <MessageSquare className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span>تواصل معنا عبر WhatsApp</span>
          </a> : <Link href="/contact" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#c9a227]/40 px-6 text-xs font-bold text-[#e5c45a]">راجع بيانات التواصل</Link>}
        </div>
      </main>

      <Footer />
    </div>
  );
}
