import Link from 'next/link';
import { Phone, MessageSquare, MapPin, Shield, Clock } from 'lucide-react';
import BareeqLogo from '@/components/BareeqLogo';
import { getPublicBranchContact, phoneHref, whatsappHref } from '@/lib/public-contact';

export default async function Footer() {
  const branch = await getPublicBranchContact();

  return (
    <footer className="bg-[#050505] border-t border-[#c9a227]/20 pt-16 pb-10 text-neutral-400 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          
          {/* Brand Intro */}
          <div className="space-y-4 md:col-span-1">
            <Link href="/" aria-label="بريق — الصفحة الرئيسية">
              <BareeqLogo size="lg" />
            </Link>
            <p className="text-neutral-400 leading-relaxed text-xs">
              بريق براند عناية متنقلة فاخرة بالسيارات يصل إليك في المنزل أو مكان العمل بأحدث المعدات ومواد العناية المخصصة لكل جزء بالسيارة.
            </p>
            <div className="flex items-center gap-3 pt-2 text-xs text-[#e5c45a]">
              <Shield className="w-4 h-4 text-[#c9a227]" aria-hidden="true" />
              <span>جودة مضمونة وصور قبل وبعد التنفيذ</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h2 className="text-white font-bold text-base mb-4 border-b border-[#c9a227]/30 pb-2 inline-block">روابط سريعة</h2>
            <ul className="space-y-2.5">
              <li><Link href="/" className="hover:text-[#e5c45a] transition-colors">الرئيسية</Link></li>
              <li><Link href="/services" className="hover:text-[#e5c45a] transition-colors">جميع الخدمات كمنتجات</Link></li>
              <li><Link href="/plans" className="hover:text-[#e5c45a] transition-colors">باقات الاشتراكات والزيارات</Link></li>
              <li><Link href="/before-after" className="hover:text-[#e5c45a] transition-colors">معرض الصور قبل وبعد</Link></li>
              <li><Link href="/areas" className="hover:text-[#e5c45a] transition-colors">مناطق التغطية والكمبوندات</Link></li>
            </ul>
          </div>

          {/* Policies & Info */}
          <div>
            <h2 className="text-white font-bold text-base mb-4 border-b border-[#c9a227]/30 pb-2 inline-block">السياسات والشروط</h2>
            <ul className="space-y-2.5">
              <li><Link href="/policies/booking" className="hover:text-[#e5c45a] transition-colors">سياسة الحجز والتحويل اليدوي</Link></li>
              <li><Link href="/policies/cancellation" className="hover:text-[#e5c45a] transition-colors">سياسة الإلغاء والاسترداد والتعديل</Link></li>
              <li><Link href="/policies/privacy" className="hover:text-[#e5c45a] transition-colors">سياسة الخصوصية وحماية البيانات</Link></li>
              <li><Link href="/faq" className="hover:text-[#e5c45a] transition-colors">الأسئلة الشائعة</Link></li>
            </ul>
          </div>

          {/* Contact & Branch */}
          <div className="space-y-3">
            <h2 className="text-white font-bold text-base mb-4 border-b border-[#c9a227]/30 pb-2 inline-block">تواصل مع الفرع الرئيسي</h2>
            <div className="flex items-start gap-2.5 text-xs text-neutral-300">
              <MapPin className="w-4 h-4 text-[#c9a227] shrink-0 mt-0.5" aria-hidden="true" />
              <span>{branch ? `${branch.nameAr} — ${branch.address}` : 'لا يوجد فرع نشط متاح للتواصل حاليًا'}</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-neutral-300">
              <Clock className="w-4 h-4 text-[#c9a227] shrink-0" aria-hidden="true" />
              <Link href="/contact" className="hover:text-[#e5c45a]">راجع مواعيد العمل المسجلة لكل يوم</Link>
            </div>
            {branch ? <div className="pt-2 flex flex-col gap-2">
              <a
                href={phoneHref(branch.phone)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#141414] border border-[#c9a227]/30 text-neutral-200 hover:text-[#e5c45a] text-xs transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-[#c9a227]" aria-hidden="true" />
                <span>اتصال هاتفياً: {branch.phone}</span>
              </a>
              <a
                href={whatsappHref(branch.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#141414] border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                <span>فتح المحادثة عبر WhatsApp</span>
              </a>
            </div> : null}
          </div>

        </div>

        <div className="border-t border-neutral-900 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 gap-4">
          <p>© {new Date().getFullYear()} بريق (Bareeq Mobile Car Care). جميع الحقوق محفوظة.</p>
          <p className="flex items-center gap-2">
            <span>نظام تشغيل خاص ببراند بريق</span>
            <span className="text-[#c9a227]">•</span>
            <span translate="no">Premium Luxury Detailing</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
