import Navbar from '@/components/SafeNavbar';
import Footer from '@/components/Footer';
import { getCurrentUser } from '@/lib/auth/session';
import { createPublicMetadata } from '@/lib/seo';
import { db } from '@/lib/db';
import {
  cancellationPolicySnapshot,
  DEFAULT_CANCELLATION_POLICY,
} from '@/lib/policies/cancellation';
import { FileText } from 'lucide-react';

export const metadata = createPublicMetadata({
  title: 'سياسة التعديل والإلغاء',
  description: 'تعرف على مهلة تعديل أو إلغاء حجز بريق وخطوات الاسترداد وحالات تعذر الوصول.',
  path: '/policies/cancellation',
});

export default async function CancellationPolicyPage() {
  const [user, configuredPolicy] = await Promise.all([
    getCurrentUser(),
    db.cancellationPolicy.findFirst({
      where: { active: true, isDefault: true },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);
  const policy = configuredPolicy
    ? cancellationPolicySnapshot(configuredPolicy)
    : DEFAULT_CANCELLATION_POLICY;

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col font-sans">
      <Navbar user={user} />

      <main id="main-content" className="flex-1 pt-32 pb-24 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#141414] border border-[#c9a227]/30 text-xs font-semibold text-[#e5c45a]">
            <FileText className="w-4 h-4 text-[#c9a227]" aria-hidden="true" />
            <span>السياسات والشروط</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black gold-gradient-text">سياسة التعديل والإلغاء والاسترداد</h1>
          <p className="text-xs text-neutral-500">{policy.nameAr} · الإصدار {policy.version}</p>
        </div>

        <div className="p-8 rounded-3xl glass-card border border-[#c9a227]/20 space-y-6 text-sm text-neutral-300 leading-relaxed">
          <section className="space-y-2">
            <h2 className="font-bold text-base text-[#e5c45a]">1. مهلة طلب التعديل أو الإلغاء</h2>
            {policy.allowsCancellation ? (
              <p>
                {policy.noticeHours === 0
                  ? 'يمكن تقديم طلب الإلغاء من الحساب حتى قبل بدء موعد الخدمة.'
                  : `تُعد مهلة الإلغاء المبكر ${policy.noticeHours} ساعة قبل موعد التنفيذ المعتمد.`}
                {' '}
                {policy.allowsLateRequests
                  ? 'يمكن إرسال الطلب بعد انتهاء المهلة وحتى قبل بدء الخدمة، لكنه يُصنف طلبًا متأخرًا ويخضع لمراجعة التشغيل والتسوية المالية.'
                  : 'بعد انتهاء المهلة لا يقبل النظام طلب الإلغاء من الحساب، ويجب التواصل مع الدعم.'}
              </p>
            ) : (
              <p>السياسة الافتراضية الحالية لا تتيح طلب الإلغاء من الحساب، ويجب التواصل مع الدعم لمراجعة الحالة.</p>
            )}
            <p>
              {policy.allowsRescheduling
                ? 'تتيح السياسة طلب تعديل الموعد ضمن المهلة نفسها، ويظل الموعد البديل خاضعًا للتوفر وموافقة التشغيل.'
                : 'لا تتيح السياسة طلب تعديل الموعد من الحساب، ويجب التواصل مع الدعم.'}
            </p>
            <p className="whitespace-pre-line rounded-2xl border border-white/10 bg-black/20 p-4 text-neutral-400">{policy.policyTextAr}</p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-base text-[#e5c45a]">2. الاسترداد اليدوي</h2>
            <p>لأن جميع المدفوعات تتم يدوياً، يتم تنفيذ الاستردادات المقبولة يدوياً عبر فودافون كاش أو InstaPay أو التحويل البنكي مع توثيق إيصال الاسترداد وسجله في حساب العميل.</p>
          </section>

          <section className="space-y-2">
            <h2 className="font-bold text-base text-[#e5c45a]">3. عدم حضور العميل أو تعذر الدخول</h2>
            <p>في حالة وصول الفريق إلى الموقع وتعذر الدخول بسبب عدم استخراج تصريح البوابة أو عدم تواجد العميل، يتم التواصل هاتفياً وواتساب، وفي حالة عدم الرد قد يتم إعادة جدولة الموعد أو تطبيـق رسوم انتقال حسب قرار مدير التشغيل.</p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
