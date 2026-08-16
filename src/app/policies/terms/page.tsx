import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import { getCurrentUser } from '@/lib/auth/session';
import { createPublicMetadata } from '@/lib/seo';
import { FileCheck } from 'lucide-react';
import { db } from '@/lib/db';
import { readPoliciesContent } from '@/lib/policies-content';

export const metadata = createPublicMetadata({
  title: 'شروط وسياسة الاستخدام',
  description: 'تعرف على شروط وسياسة استخدام منصة بريق وخطوات الحجز وإجراءات تقديم الخدمة.',
  path: '/policies/terms',
});

export const dynamic = 'force-dynamic';

export default async function TermsPage() {
  const [user, brand] = await Promise.all([
    getCurrentUser().catch(() => null),
    db.brandSettings.findFirst({ select: { homepageContent: true } }).catch(() => null),
  ]);

  const policies = readPoliciesContent(brand?.homepageContent);

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col font-sans" dir="rtl">
      <Navbar user={user} />

      <main id="main-content" className="flex-1 pt-32 pb-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#141414] border border-[#cea355]/30 text-xs font-semibold text-[#edce8b]">
            <FileCheck className="w-4 h-4 text-[#cea355]" aria-hidden="true" />
            <span>الشروط والأحكام</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white">{policies.termsTitle}</h1>
        </div>

        <div className="p-8 rounded-3xl bg-[#101010] border border-[#cea355]/20 space-y-6 text-sm text-neutral-300 leading-relaxed shadow-xl">
          {policies.termsSections.map((sec, idx) => (
            <section key={idx} className="space-y-2">
              <h2 className="font-bold text-base text-[#edce8b]">{sec.title}</h2>
              <p className="text-neutral-300 leading-relaxed">{sec.content}</p>
            </section>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
