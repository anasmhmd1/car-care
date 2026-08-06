'use client';

import type { FormEvent } from 'react';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ExternalLink, FileText, LoaderCircle, RotateCcw } from 'lucide-react';
import { updateFaqsContentAction, updateHomepageContentAction } from '@/app/actions/owner-brand';
import { HelpCircle, Plus, Trash2 } from 'lucide-react';
import { DEFAULT_HOMEPAGE_CONTENT, type FaqItem, type HomepageContent } from '@/lib/homepage-content';

interface ContentField {
  key: keyof HomepageContent;
  label: string;
  description: string;
  multiline?: boolean;
}

interface ContentGroup {
  title: string;
  description: string;
  fields: ContentField[];
}

const groups: ContentGroup[] = [
  {
    title: 'الواجهة الافتتاحية',
    description: 'الرسالة الأولى وأزرار التحويل الأساسية في أعلى الصفحة الرئيسية.',
    fields: [
      { key: 'heroEyebrow', label: 'السطر التعريفي', description: 'يظهر داخل الشارة أعلى العنوان.' },
      { key: 'heroTitle', label: 'بداية العنوان', description: 'يظهر قبل العبارة الذهبية.' },
      { key: 'heroAccent', label: 'العبارة المميزة', description: 'تظهر بالتدرج الذهبي داخل العنوان.' },
      { key: 'heroDescription', label: 'وصف الواجهة', description: 'ملخص القيمة التي يحصل عليها العميل.', multiline: true },
      { key: 'heroPrimaryCta', label: 'زر الحجز', description: 'نص زر الذهاب إلى الخدمات.' },
      { key: 'heroSecondaryCta', label: 'زر الباقات', description: 'نص زر الذهاب إلى الاشتراكات.' },
    ],
  },
  {
    title: 'رسائل الثقة والخدمات',
    description: 'عناوين الأقسام التي تشرح التجربة والخدمات وطريقة الحجز.',
    fields: [
      { key: 'valueTitle', label: 'عنوان مزايا الخدمة', description: 'العنوان الوصفي لقسم المزايا.' },
      { key: 'whyEyebrow', label: 'شارة لماذا بريق', description: 'السطر الصغير فوق القسم.' },
      { key: 'whyTitle', label: 'عنوان لماذا بريق', description: 'العنوان الرئيسي للقسم.' },
      { key: 'whyDescription', label: 'وصف لماذا بريق', description: 'فقرة موجزة تشرح الاختلاف.', multiline: true },
      { key: 'stepsEyebrow', label: 'شارة خطوات الحجز', description: 'السطر الصغير فوق الخطوات.' },
      { key: 'stepsTitle', label: 'عنوان خطوات الحجز', description: 'العنوان الرئيسي للخطوات.' },
      { key: 'servicesEyebrow', label: 'شارة الخدمات', description: 'السطر الصغير فوق قائمة الخدمات.' },
      { key: 'servicesTitle', label: 'عنوان الخدمات', description: 'العنوان الرئيسي للخدمات.' },
    ],
  },
  {
    title: 'الاشتراكات والثقة الاجتماعية',
    description: 'النصوص التي تحيط بالباقات وتجارب العملاء المعتمدة.',
    fields: [
      { key: 'plansEyebrow', label: 'شارة الباقات', description: 'السطر الصغير فوق الباقات.' },
      { key: 'plansTitle', label: 'عنوان الباقات', description: 'العنوان الرئيسي للباقات.' },
      { key: 'testimonialsEyebrow', label: 'شارة آراء العملاء', description: 'السطر الصغير فوق التقييمات.' },
      { key: 'testimonialsTitle', label: 'عنوان آراء العملاء', description: 'العنوان الرئيسي للتجارب.' },
      { key: 'coverageEyebrow', label: 'شارة مناطق التغطية', description: 'السطر الصغير فوق المناطق.' },
      { key: 'coverageTitle', label: 'عنوان مناطق التغطية', description: 'العنوان الرئيسي للمناطق.' },
    ],
  },
  {
    title: 'الدعم والدعوة الختامية',
    description: 'نص الاتصال المباشر والدعوة النهائية للحجز.',
    fields: [
      { key: 'contactEyebrow', label: 'شارة التواصل', description: 'السطر الصغير فوق قسم الدعم.' },
      { key: 'contactTitle', label: 'عنوان التواصل', description: 'العنوان الرئيسي لقسم الدعم.' },
      { key: 'contactDescription', label: 'وصف التواصل', description: 'يوضح متى يتواصل العميل مع الفريق.', multiline: true },
      { key: 'closingTitle', label: 'العنوان الختامي', description: 'آخر رسالة قبل زر الحجز.' },
      { key: 'closingDescription', label: 'وصف الدعوة الختامية', description: 'جملة داعمة أسفل العنوان.', multiline: true },
    ],
  },
];

interface SiteContentManagerProps {
  initialContent: HomepageContent;
  initialFaqs?: FaqItem[];
}

export default function SiteContentManager({ initialContent, initialFaqs = [] }: SiteContentManagerProps) {
  const router = useRouter();
  const [content, setContent] = useState<HomepageContent>(initialContent);
  const [faqs, setFaqs] = useState<FaqItem[]>(initialFaqs);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function updateField(key: keyof HomepageContent, value: string) {
    setContent((current) => ({ ...current, [key]: value }));
  }

  function restoreDefaults() {
    setContent(DEFAULT_HOMEPAGE_CONTENT);
    setFeedback({ kind: 'success', message: 'تمت استعادة النصوص الافتراضية في النموذج. احفظ التغييرات لنشرها.' });
  }

  function handleFaqChange(index: number, field: keyof FaqItem, value: string) {
    setFaqs((prev) => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], [field]: value };
      }
      return copy;
    });
  }

  function addFaqItem() {
    setFaqs((prev) => [...prev, { q: 'سؤال جديد', a: 'الإجابة التفصيلية هنا...' }]);
  }

  function removeFaqItem(index: number) {
    setFaqs((prev) => prev.filter((_, i) => i !== index));
  }

  function saveFaqs() {
    setFeedback(null);
    const formData = new FormData();
    formData.set('faqsJson', JSON.stringify(faqs));
    startTransition(async () => {
      const result = await updateFaqsContentAction(formData);
      if ('error' in result && result.error) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      setFeedback({ kind: 'success', message: result.message ?? 'تم حفظ ونشر الأسئلة الشائعة بنجاح.' });
      router.refresh();
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const formData = new FormData();
    for (const [key, value] of Object.entries(content)) formData.set(key, value);
    startTransition(async () => {
      const result = await updateHomepageContentAction(formData);
      if ('error' in result && result.error) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      setFeedback({ kind: 'success', message: result.message ?? 'تم حفظ المحتوى.' });
      router.refresh();
    });
  }

  return (
    <main className="min-h-screen bg-[#080808] px-4 py-10 text-white sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="flex items-center gap-2 text-xs font-bold text-[#d4af37]"><FileText className="size-4" aria-hidden="true" /> إدارة المحتوى</p><h1 className="mt-2 text-3xl font-black">محتوى الموقع والأسئلة الشائعة</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-white/55">حدّث رسائل الموقع والأسئلة الشائعة بدون تعديل كود. التعديلات تنشر فوراً للمستخدمين.</p></div><div className="flex flex-wrap gap-3"><Link href="/faq" target="_blank" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-bold text-white/80"><ExternalLink className="size-4" aria-hidden="true" />صفحة FAQ</Link><Link href="/" target="_blank" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d4af37]/35 bg-[#d4af37]/[0.06] px-4 text-sm font-bold text-[#e5c45a]"><ExternalLink className="size-4" aria-hidden="true" />معاينة الموقع</Link><Link href="/admin" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-bold">لوحة المالك</Link></div></header>
        {feedback ? <div role={feedback.kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`rounded-2xl border px-5 py-4 text-sm font-bold ${feedback.kind === 'error' ? 'border-red-500/35 bg-red-500/10 text-red-100' : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100'}`}>{feedback.message}</div> : null}

        {/* FAQs Management Section */}
        <section className="rounded-3xl border border-[#d4af37]/30 bg-[#141414] p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-5">
            <div>
              <h2 className="text-xl font-black flex items-center gap-2">
                <HelpCircle className="size-5 text-[#d4af37]" />
                <span>إدارة الأسئلة الشائعة (FAQ)</span>
              </h2>
              <p className="mt-1 text-sm text-white/50">تظهر هذه الأسئلة في الصفحة الرئيسية وصفحة الأسئلة الشائعة المستقلة.</p>
            </div>
            <button type="button" onClick={addFaqItem} className="inline-flex items-center gap-1.5 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 px-4 py-2 text-xs font-bold text-[#e5c45a] hover:bg-[#d4af37]/20">
              <Plus className="size-4" /> إضافة سؤال جديد
            </button>
          </div>

          <div className="space-y-4">
            {faqs.map((item, idx) => (
              <div key={idx} className="rounded-2xl border border-white/10 bg-[#080808] p-5 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-bold text-[#e5c45a]">سؤال {idx + 1}</span>
                  <button type="button" onClick={() => removeFaqItem(idx)} className="text-red-400 hover:text-red-300 text-xs font-bold flex items-center gap-1">
                    <Trash2 className="size-3.5" /> حذف
                  </button>
                </div>
                <input required maxLength={240} value={item.q} onChange={(e) => handleFaqChange(idx, 'q', e.target.value)} placeholder="السؤال" className="w-full rounded-xl border border-white/10 bg-[#141414] px-4 py-2.5 text-sm text-white outline-none focus:border-[#d4af37]" />
                <textarea required maxLength={1_200} value={item.a} onChange={(e) => handleFaqChange(idx, 'a', e.target.value)} placeholder="الإجابة" rows={2} className="w-full rounded-xl border border-white/10 bg-[#141414] px-4 py-2.5 text-sm text-white outline-none focus:border-[#d4af37]" />
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button type="button" disabled={pending} onClick={saveFaqs} className="inline-flex items-center gap-2 rounded-xl bg-[#d4af37] px-6 py-2.5 text-xs font-black text-black hover:brightness-110 disabled:opacity-50">
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              <span>حفظ وتحديث الأسئلة الشائعة</span>
            </button>
          </div>
        </section>

        <form id="site-content-form" onSubmit={submit} className="space-y-6">{groups.map((group) => <section key={group.title} className="rounded-3xl border border-white/10 bg-[#141414] p-6 sm:p-8"><div className="border-b border-white/10 pb-5"><h2 className="text-xl font-black">{group.title}</h2><p className="mt-1 text-sm leading-6 text-white/50">{group.description}</p></div><div className="mt-6 grid gap-5 sm:grid-cols-2">{group.fields.map((field) => <label key={field.key} className={`block text-sm font-bold ${field.multiline ? 'sm:col-span-2' : ''}`}><span>{field.label}</span><span className="mt-1 block text-xs font-normal leading-5 text-white/45">{field.description}</span>{field.multiline ? <textarea name={field.key} value={content[field.key]} onChange={(event) => updateField(field.key, event.target.value)} required maxLength={1_200} rows={4} className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-sm leading-6 text-white outline-none transition focus:border-[#d4af37]" /> : <input name={field.key} value={content[field.key]} onChange={(event) => updateField(field.key, event.target.value)} required maxLength={240} className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]" />}</label>)}</div></section>)}</form>
        <div className="sticky bottom-4 z-10 rounded-2xl border border-[#d4af37]/25 bg-[#12100a]/95 p-4 shadow-2xl backdrop-blur sm:flex sm:items-center sm:justify-between"><p className="text-sm leading-6 text-white/65">يُسجل كل نشر في سجل المراجعة، وتظهر النصوص كـنص آمن فقط.</p><div className="mt-3 flex flex-col-reverse gap-3 sm:mt-0 sm:flex-row"><button type="button" disabled={pending} onClick={restoreDefaults} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-5 text-sm font-bold text-white/80 hover:bg-white/[0.05] disabled:opacity-50"><RotateCcw className="size-4" aria-hidden="true" />استعادة الافتراضي</button><button form="site-content-form" type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-6 text-sm font-black text-[#080808] disabled:opacity-50">{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}{pending ? 'جارٍ الحفظ…' : 'حفظ ونشر المحتوى'}</button></div></div>
      </div>
    </main>
  );
}
