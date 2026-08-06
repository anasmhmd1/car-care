import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import { getCurrentUser } from '@/lib/auth/session';
import { createPublicMetadata } from '@/lib/seo';
import { Lock } from 'lucide-react';

export const metadata = createPublicMetadata({
  title: 'سياسة الخصوصية',
  description: 'تعرف على طريقة استخدام بريق لبيانات العميل وحماية صور التنفيذ وإثباتات الدفع.',
  path: '/policies/privacy',
});

export default async function PrivacyPolicyPage() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col font-sans">
      <Navbar user={user} />

      <main id="main-content" className="flex-1 pt-32 pb-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#141414] border border-[#c9a227]/30 text-xs font-semibold text-[#e5c45a]">
            <Lock className="w-4 h-4 text-[#c9a227]" aria-hidden="true" />
            <span>حماية البيانات والخصوصية</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black gold-gradient-text">سياسة الخصوصية وحماية الصور</h1>
        </div>

        <div className="p-8 rounded-3xl glass-card border border-[#c9a227]/20 space-y-6 text-sm text-neutral-300 leading-relaxed">
          <section className="space-y-2">
            <h2 className="font-bold text-base text-[#e5c45a]">1. استخدام بيانات العميل</h2>
            <p>تستخدم بيانات الاسم، رقم الهاتف، الموقع، ورقم الواتساب حصرياً لتنفيذ خدمة بريق والتواصل المباشر بشأن الحجوزات وإشعارات المواعيد، ولا يتم مشاركتها مع أي أطراف تسويقية خارجية.</p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-base text-[#e5c45a]">2. خصوصية الصور وإثباتات التحويل</h2>
            <p>تُخزن صور إثبات التحويل وصور التوثيق قبل التنفيذ وبعده في مساحة خاصة، وتكون متاحة للعميل وفريق التشغيل المصرح له. ولا تُنشر أي صورة في المعرض العام إلا بعد موافقة العميل الصريحة.</p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
