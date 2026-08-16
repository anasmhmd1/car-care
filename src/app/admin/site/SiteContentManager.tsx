'use client';

import type { FormEvent } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, FileText, LoaderCircle, RotateCcw } from 'lucide-react';
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
  defaultSection?: 'content' | 'faqs' | 'all';
}

export default function SiteContentManager({
  initialContent,
  initialFaqs = [],
  defaultSection = 'all',
}: SiteContentManagerProps) {
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
      setFeedback({ kind: 'success', message: result.message ?? 'تم حفظ ونشر المحتوى بنجاح.' });
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {feedback ? (
        <div
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`rounded-2xl border px-5 py-4 text-xs font-bold ${
            feedback.kind === 'error'
              ? 'border-red-500/35 bg-red-500/10 text-red-300'
              : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {/* FAQs Management Section */}
      {(defaultSection === 'faqs' || defaultSection === 'all') && (
        <section className="rounded-3xl border border-[#cea355]/30 bg-[#121212] p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
            <div>
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-[#edce8b]" />
                <span>إدارة الأسئلة الشائعة (FAQ)</span>
              </h2>
              <p className="mt-1 text-xs text-neutral-400">تظهر هذه الأسئلة في الصفحة الرئيسية وصفحة الأسئلة الشائعة المستقلة.</p>
            </div>
            <button
              type="button"
              onClick={addFaqItem}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#cea355]/40 bg-[#cea355]/10 px-4 py-2 text-xs font-bold text-[#edce8b] hover:bg-[#cea355]/20 transition-all self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" /> إضافة سؤال جديد
            </button>
          </div>

          <div className="space-y-4">
            {faqs.map((item, idx) => (
              <div key={idx} className="rounded-2xl border border-neutral-800 bg-[#080808] p-5 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-bold text-[#edce8b]">سؤال {idx + 1}</span>
                  <button type="button" onClick={() => removeFaqItem(idx)} className="text-red-400 hover:text-red-300 text-xs font-bold flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> حذف
                  </button>
                </div>
                <input
                  required
                  maxLength={240}
                  value={item.q}
                  onChange={(e) => handleFaqChange(idx, 'q', e.target.value)}
                  placeholder="السؤال"
                  className="w-full rounded-xl border border-neutral-800 bg-[#121212] px-4 py-2.5 text-xs text-white outline-none focus:border-[#cea355]"
                />
                <textarea
                  required
                  maxLength={1_200}
                  value={item.a}
                  onChange={(e) => handleFaqChange(idx, 'a', e.target.value)}
                  placeholder="الإجابة"
                  rows={2}
                  className="w-full rounded-xl border border-neutral-800 bg-[#121212] px-4 py-2.5 text-xs text-white outline-none focus:border-[#cea355]"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={pending}
              onClick={saveFaqs}
              className="inline-flex items-center gap-2 rounded-xl gold-gradient px-6 py-2.5 text-xs font-black text-white hover:brightness-110 disabled:opacity-50 shadow-md"
            >
              {pending ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>حفظ وتحديث الأسئلة الشائعة</span>
            </button>
          </div>
        </section>
      )}

      {/* Page Content Form */}
      {(defaultSection === 'content' || defaultSection === 'all') && (
        <>
          <form id="site-content-form" onSubmit={submit} className="space-y-6">
            {groups.map((group) => (
              <section key={group.title} className="rounded-3xl border border-neutral-800 bg-[#121212] p-6 sm:p-8">
                <div className="border-b border-neutral-800 pb-5">
                  <h2 className="text-xl font-black text-white">{group.title}</h2>
                  <p className="mt-1 text-xs leading-5 text-neutral-400">{group.description}</p>
                </div>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  {group.fields.map((field) => (
                    <label key={field.key} className={`block text-xs font-bold text-neutral-300 ${field.multiline ? 'sm:col-span-2' : ''}`}>
                      <span>{field.label}</span>
                      <span className="mt-1 block text-[11px] font-normal leading-4 text-neutral-500">{field.description}</span>
                      {field.multiline ? (
                        <textarea
                          name={field.key}
                          value={content[field.key]}
                          onChange={(event) => updateField(field.key, event.target.value)}
                          required
                          maxLength={1_200}
                          rows={3}
                          className="mt-2 w-full resize-y rounded-xl border border-neutral-800 bg-[#080808] px-4 py-3 text-xs leading-relaxed text-white outline-none transition focus:border-[#cea355]"
                        />
                      ) : (
                        <input
                          name={field.key}
                          value={content[field.key]}
                          onChange={(event) => updateField(field.key, event.target.value)}
                          required
                          maxLength={240}
                          className="mt-2 w-full rounded-xl border border-neutral-800 bg-[#080808] px-4 py-2.5 text-xs text-white outline-none transition focus:border-[#cea355]"
                        />
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </form>

          <div className="sticky bottom-4 z-10 rounded-2xl border border-[#cea355]/30 bg-[#121212]/95 p-4 shadow-2xl backdrop-blur sm:flex sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-neutral-400">يُسجل كل نشر في سجل المراجعة، وتظهر النصوص بصورة آمنة ومباشرة.</p>
            <div className="mt-3 flex flex-col-reverse gap-3 sm:mt-0 sm:flex-row">
              <button
                type="button"
                disabled={pending}
                onClick={restoreDefaults}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-black/50 px-5 text-xs font-bold text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-50 transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                استعادة الافتراضي
              </button>
              <button
                form="site-content-form"
                type="submit"
                disabled={pending}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl gold-gradient px-6 text-xs font-black text-white hover:brightness-110 disabled:opacity-50 transition-all shadow-lg"
              >
                {pending ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {pending ? 'جارٍ الحفظ…' : 'حفظ ونشر المحتوى'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
