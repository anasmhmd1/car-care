import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import { getCurrentUser } from '@/lib/auth/session';
import { createPublicMetadata } from '@/lib/seo';
import { FileText } from 'lucide-react';

export const metadata = createPublicMetadata({
  title: 'سياسة الحجز والدفع',
  description: 'تعرف على خطوات تأكيد حجز بريق ومهلة رفع إثبات التحويل وتعليمات دخول مناطق الخدمة.',
  path: '/policies/booking',
});

export default async function BookingPolicyPage() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col font-sans">
      <Navbar user={user} />

      <main id="main-content" className="flex-1 pt-32 pb-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#141414] border border-[#c9a227]/30 text-xs font-semibold text-[#e5c45a]">
            <FileText className="w-4 h-4 text-[#c9a227]" aria-hidden="true" />
            <span>السياسات والشروط</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black gold-gradient-text">سياسة الحجز والتحويل اليدوي</h1>
        </div>

        <div className="p-8 rounded-3xl glass-card border border-[#c9a227]/20 space-y-6 text-sm text-neutral-300 leading-relaxed">
          <section className="space-y-2">
            <h2 className="font-bold text-base text-[#e5c45a]">1. تأكيد الموعد والعربون</h2>
            <p>يصبح الحجز مؤكدًا بعد مراجعة إثبات التحويل عبر وسيلة الدفع المختارة واعتماده من موظف مراجعة المدفوعات.</p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-base text-[#e5c45a]">2. مهلة الاحتفاظ المؤقت بالموعد</h2>
            <p>يحتفظ النظام بالموعد المختار مؤقتاً أثناء مرحلة إرسال الطلب ورفع إثبات التحويل. إذا لم يتم رفع الإثبات خلال المهلة المحددة، يتم تحرير الموعد تلقائياً لإتاحته لعملاء آخرين.</p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-base text-[#e5c45a]">3. تعليمات دخول الكمبوندات</h2>
            <p>مسؤولية استخراج أو إبلاغ أمن الكمبوند بتصريح دخول فريق بريق تقع على العميل، وذلك لضمان وصول الفريق في الوقت المحدد دون تأخير.</p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
