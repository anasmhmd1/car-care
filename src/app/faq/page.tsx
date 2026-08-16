import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import { getCurrentUser } from '@/lib/auth/session';
import { HelpCircle, CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/db';
import { createPublicMetadata, serializeJsonLd } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata = createPublicMetadata({
  title: 'الأسئلة الشائعة',
  description: 'إجابات واضحة عن الحجز والدفع والتغطية والاشتراكات وسياسات خدمة بريق.',
  path: '/faq',
});

interface FAQItem {
  q: string;
  a: string;
}

function isFaqList(value: unknown): value is FAQItem[] {
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

export default async function FAQPage() {
  const [user, brand] = await Promise.all([
    getCurrentUser(),
    db.brandSettings.findFirst({ select: { faqs: true } }),
  ]);

  const defaultFaqs: FAQItem[] = [
    {
      q: 'هل الخدمة تحتاج مصدر مياه أو كهرباء من موقع العميل؟',
      a: 'فريق بريق مجهز بالكامل بوحدات تشغيل ذاتية ومصدر مياه وكهرباء مخصص للمهمة المتنقلة.'
    },
    {
      q: 'كيف أضمن عدم تعارض المواعيد عند الحجز؟',
      a: 'يعتمد نظام بريق على Availability Engine حقيقي يحسب زمن الانتقال وساعات عمل الفريق لمنع أي Double Booking.'
    },
    {
      q: 'كيف يتم تأكيد الدفع اليدوي؟',
      a: 'بعد رفع صورة التحويل (فودافون كاش أو إنستاباي)، يتم مراجعة الإثبات يدوياً خلال دقائق من موظف المراجعة وتأكيد الحجز.'
    },
    {
      q: 'ماذا يحدث إذا كان إثبات التحويل غير صحيح أو المبلغ ناقص؟',
      a: 'يصلك إشعار بالسبب المباشر داخل حسابك (مثل نقص المبلغ أو صورة غير واضحة) مع إمكانية رفع إثبات صحيح جديد.'
    },
    {
      q: 'هل يمكنني طلب تعديل الموعد أو الإلغاء؟',
      a: 'نعم، يمكن تقديم طلب تعديل أو إلغاء من صفحة الحجز في حسابك وفق المهلة والشروط الظاهرة في سياسة الخدمة المقبولة عند الحجز.'
    },
    {
      q: 'كيف يتم التعامل مع الاسترداد اليدوي (Manual Refund)؟',
      a: 'يتم تحويل المبلغ المسترد يدوياً عبر فودافون كاش أو InstaPay وتوثيق صورة التحويل داخل السجل الإلكتروني للحجز.'
    },
    {
      q: 'هل يمكن استخدام الاشتراك لأكثر من سيارة؟',
      a: 'حسب نوع الخطة: باقة العناية الفردية لسيارة واحدة، بينما تتيح باقة العائلة الملكية ربط حتى 3 سيارات.'
    },
    {
      q: 'هل الخدمة متاحة في منطقتي؟',
      a: 'نغطي مختلف المناطق والكمبوندات الرئيسية من خلال فروع تشغيلنا المجهزة لضمان أعلى مستويات الالتزام بالمواعيد والجودة.'
    },
    {
      q: 'كيف أتواصل مع الفرع عبر WhatsApp؟',
      a: 'يمكنك فتح المحادثة المباشرة مع الفرع بالضغط على زر WhatsApp المتوفر بكل صفحة وبحسابك الشخصي.'
    }
  ];

  const faqs = isFaqList(brand?.faqs) && brand.faqs.length > 0
    ? brand.faqs
    : defaultFaqs;

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col font-sans">
      <Navbar user={user} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd) }}
      />

      <main id="main-content" className="flex-1 pt-32 pb-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#141414] border border-[#c9a227]/30 text-xs font-semibold text-[#e5c45a]">
            <HelpCircle className="w-4 h-4 text-[#c9a227]" aria-hidden="true" />
            <span>الأسئلة الشائعة</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black gold-gradient-text">جميع استفسارات خدمة بريق</h1>
        </div>

        <div className="space-y-4 text-right">
          {faqs.map((faq) => (
            <div key={faq.q} className="p-6 rounded-2xl bg-[#141414] border border-[#c9a227]/20 space-y-2">
              <h2 className="font-bold text-white text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#c9a227] shrink-0" aria-hidden="true" />
                {faq.q}
              </h2>
              <p className="text-neutral-400 text-xs pr-6 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
