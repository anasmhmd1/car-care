import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import { getCurrentUser } from '@/lib/auth/session';
import { createPublicMetadata } from '@/lib/seo';
import { Phone, MessageSquare, Clock, MapPin, Sparkles } from 'lucide-react';
import { arabicDayNames, getPublicBranchContact, phoneHref, whatsappHref } from '@/lib/public-contact';

export const dynamic = 'force-dynamic';

export const metadata = createPublicMetadata({
  title: 'تواصل معنا',
  description: 'تواصل مع فريق بريق عبر الهاتف أو واتساب للاستفسار عن الخدمات والمواعيد ومناطق التغطية.',
  path: '/contact',
});

export default async function ContactPage() {
  const user = await getCurrentUser();
  const branch = await getPublicBranchContact();

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col font-sans">
      <Navbar user={user} />

      <main id="main-content" className="flex-1 pt-32 pb-24 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#141414] border border-[#c9a227]/30 text-xs font-semibold text-[#e5c45a]">
            <Sparkles className="w-4 h-4 text-[#c9a227]" aria-hidden="true" />
            <span>خدمة العملاء والدعم الفني</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black gold-gradient-text">تواصل مع فريق بريق</h1>
          <p className="text-neutral-400 text-sm max-w-xl mx-auto leading-relaxed">
            نحن هنا لمساعدتك في اختيار الخدمة المناسبة لسيارتك، متابعة حجوزاتك، أو الإجابة على كافة استفساراتك.
          </p>
        </div>

        {/* Contact Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Phone Call Card */}
          <div className="p-8 rounded-3xl bg-[#141414] border border-[#c9a227]/20 space-y-6 flex flex-col justify-between hover:border-[#c9a227]/50 transition-[border-color,box-shadow]">
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#080808] border border-[#c9a227]/30 flex items-center justify-center text-[#c9a227]">
                <Phone className="w-7 h-7" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-bold text-[#e5c45a]">الاتصال الهاتفي المباشر</h2>
              <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed">
                تواصل فوراً مع مسؤول الدعم الفني والعمليات لحجز المواعيد الاستثنائية أو الاستفسار عن مناطق التغطية.
              </p>
            </div>

            {branch ? <a
              href={phoneHref(branch.phone)}
              className="w-full text-center gold-gradient text-[#080808] font-bold px-6 py-3.5 rounded-xl text-xs sm:text-sm shadow-md hover:brightness-110 transition-[filter,transform] flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" aria-hidden="true" />
              <span>اتصل بنا الآن: {branch.phone}</span>
            </a> : <p className="rounded-xl border border-neutral-800 bg-[#080808] p-3 text-center text-sm text-neutral-500">لا يوجد رقم فرع نشط متاح حاليًا.</p>}
          </div>

          {/* WhatsApp Direct Card */}
          <div className="p-8 rounded-3xl bg-[#141414] border border-emerald-500/20 space-y-6 flex flex-col justify-between hover:border-emerald-500/50 transition-[background-color,border-color]">
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#080808] border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <MessageSquare className="w-7 h-7" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-bold text-emerald-400">محادثة WhatsApp المباشرة</h2>
              <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed">
                راسلنا عبر واتساب لإرسال صور وموقعك الجغرافي أو الاستفسار عن الاشتراكات والعروض الشهرية.
              </p>
            </div>

            {branch ? <a
              href={whatsappHref(branch.whatsapp, 'مرحبًا فريق بريق، أرغب في الاستفسار عن الخدمات')}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-center bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 font-bold px-6 py-3.5 rounded-xl text-xs sm:text-sm hover:bg-emerald-500/20 transition-[background-color,border-color] flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              <span>محادثة WhatsApp فورية</span>
            </a> : <p className="rounded-xl border border-neutral-800 bg-[#080808] p-3 text-center text-sm text-neutral-500">لا يوجد رقم واتساب لفرع نشط حاليًا.</p>}
          </div>
        </div>

        {/* Info Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-6 rounded-2xl bg-[#141414] border border-neutral-800 flex items-center gap-4">
            <Clock className="w-6 h-6 text-[#c9a227]" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-bold text-white">ساعات عمل الدعم والتشغيل</h3>
              {branch?.workingHours.length ? <ul className="mt-2 grid gap-1 text-xs text-neutral-400 sm:grid-cols-2">
                {branch.workingHours.map((hours) => <li key={hours.dayOfWeek}><span className="font-bold text-neutral-300">{arabicDayNames[hours.dayOfWeek] ?? `اليوم ${hours.dayOfWeek}`}: </span>{hours.isClosed ? 'إجازة' : `${hours.openTime}–${hours.closeTime}${hours.breakStartTime && hours.breakEndTime ? ` · استراحة ${hours.breakStartTime}–${hours.breakEndTime}` : ''}`}</li>)}
              </ul> : <p className="text-xs text-neutral-400 mt-0.5">لم تُسجل ساعات عمل لفرع نشط بعد.</p>}
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#141414] border border-neutral-800 flex items-center gap-4">
            <MapPin className="w-6 h-6 text-[#c9a227]" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-bold text-white">نطاق التغطية الرئيسي</h3>
              <p className="text-xs text-neutral-400 mt-0.5">{branch ? `${branch.nameAr} — ${branch.address}` : 'راجع صفحة مناطق التغطية لمعرفة آخر تحديث.'}</p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
