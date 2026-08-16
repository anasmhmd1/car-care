'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileCheck2,
  Plus,
  Trash2,
  Check,
  CheckCircle2,
  LoaderCircle,
  RotateCcw,
  Shield,
  FileText,
  HelpCircle,
} from 'lucide-react';
import {
  DEFAULT_POLICIES_CONTENT,
  type PoliciesContent,
  type PolicySection,
} from '@/lib/policies-content';
import { savePoliciesAction, resetPoliciesAction } from '@/app/actions/owner-policies';

interface PoliciesManagerProps {
  initialPolicies: PoliciesContent;
}

export default function PoliciesManager({ initialPolicies }: PoliciesManagerProps) {
  const router = useRouter();
  const [policies, setPolicies] = useState<PoliciesContent>(initialPolicies);
  const [activeSubTab, setActiveSubTab] = useState<'terms' | 'privacy'>('terms');
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Add section to current policy
  function handleAddSection(type: 'terms' | 'privacy') {
    const key = type === 'terms' ? 'termsSections' : 'privacySections';
    const newSection: PolicySection = {
      title: `${policies[key].length + 1}. بند جديد`,
      content: 'نص وتفاصيل هذا البند والشروط الخاصة به.',
    };
    setPolicies((prev) => ({
      ...prev,
      [key]: [...prev[key], newSection],
    }));
    setFeedback(null);
  }

  function handleRemoveSection(type: 'terms' | 'privacy', index: number) {
    const key = type === 'terms' ? 'termsSections' : 'privacySections';
    if (policies[key].length <= 1) {
      setFeedback({ kind: 'error', message: 'يجب الإبقاء على بند واحد على الأقل.' });
      return;
    }
    setPolicies((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, idx) => idx !== index),
    }));
    setFeedback(null);
  }

  function handleUpdateSection(type: 'terms' | 'privacy', index: number, field: keyof PolicySection, value: string) {
    const key = type === 'terms' ? 'termsSections' : 'privacySections';
    setPolicies((prev) => ({
      ...prev,
      [key]: prev[key].map((sec, idx) => (idx === index ? { ...sec, [field]: value } : sec)),
    }));
  }

  function handleSave() {
    setFeedback(null);
    startTransition(async () => {
      const res = await savePoliciesAction(policies);
      if (res.error) {
        setFeedback({ kind: 'error', message: res.error });
      } else {
        setFeedback({ kind: 'success', message: res.message || 'تم حفظ ونشر السياسات بنجاح.' });
        router.refresh();
      }
    });
  }

  function handleReset() {
    if (!window.confirm('هل أنت متأكد من استعادة النصوص الافتراضية للسياسات والشروط؟')) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await resetPoliciesAction();
      if (res.error) {
        setFeedback({ kind: 'error', message: res.error });
      } else {
        setPolicies(DEFAULT_POLICIES_CONTENT);
        setFeedback({ kind: 'success', message: 'تمت استعادة السياسات الافتراضية بنجاح.' });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8" dir="rtl">
      
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-[#121212] p-6 rounded-3xl border border-neutral-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <FileCheck2 className="w-5 h-5 text-[#cea355]" />
            <span>إدارة نصوص السياسات والشروط والخصوصية</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
            تحكم كامل في نصوص &quot;شروط وسياسة الاستخدام&quot; و &quot;سياسة الخصوصية وحماية البيانات&quot; التي تظهر في أزرار الفوتر وصفحات السياسات.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white text-xs font-medium transition-all"
            title="استعادة النصوص الافتراضية"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الافتراضي</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl gold-gradient text-white text-xs font-extrabold shadow-lg shadow-[#cea355]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
          >
            {isPending ? (
              <>
                <LoaderCircle className="w-4 h-4 animate-spin" />
                <span>جارٍ الحفظ...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>حفظ ونشر السياسات</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
            feedback.kind === 'error'
              ? 'bg-red-950/40 border-red-800/80 text-red-300'
              : 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <HelpCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Sub Tabs: Terms vs Privacy */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setActiveSubTab('terms')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold transition-all ${
            activeSubTab === 'terms'
              ? 'bg-[#1e1e1e] border border-[#cea355] text-[#edce8b] shadow-lg'
              : 'bg-[#101010] border border-neutral-800 text-neutral-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4 text-[#cea355]" />
          <span>شروط وسياسة الاستخدام (Terms of Service)</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-black/40 text-white">
            {policies.termsSections.length} بنود
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('privacy')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold transition-all ${
            activeSubTab === 'privacy'
              ? 'bg-[#1e1e1e] border border-[#cea355] text-[#edce8b] shadow-lg'
              : 'bg-[#101010] border border-neutral-800 text-neutral-400 hover:text-white'
          }`}
        >
          <Shield className="w-4 h-4 text-[#cea355]" />
          <span>سياسة الخصوصية وحماية البيانات (Privacy Policy)</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-black/40 text-white">
            {policies.privacySections.length} بنود
          </span>
        </button>
      </div>

      {/* Tab Content: Terms of Service */}
      {activeSubTab === 'terms' && (
        <div className="space-y-6 bg-[#101010] p-6 rounded-3xl border border-neutral-800">
          <div>
            <label className="block text-xs font-bold text-neutral-300 mb-1.5">
              العنوان الرئيسي لصفحة شروط الاستخدام
            </label>
            <input
              type="text"
              value={policies.termsTitle}
              onChange={(e) => setPolicies((prev) => ({ ...prev, termsTitle: e.target.value }))}
              placeholder="شروط وسياسة الاستخدام"
              className="w-full rounded-xl bg-[#0a0a0a] border border-neutral-700 px-4 py-2.5 text-xs text-white placeholder:text-neutral-600 focus:border-[#cea355] focus:outline-none"
            />
          </div>

          <div className="space-y-4 pt-2 border-t border-neutral-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">بنود وفقرات شروط الاستخدام</h3>
              <button
                type="button"
                onClick={() => handleAddSection('terms')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1c1c1c] border border-[#cea355]/40 hover:border-[#cea355] text-[#edce8b] text-xs font-bold transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة بند جديد</span>
              </button>
            </div>

            <div className="space-y-4">
              {policies.termsSections.map((sec, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-[#0a0a0a] border border-neutral-800 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <input
                      type="text"
                      value={sec.title}
                      onChange={(e) => handleUpdateSection('terms', idx, 'title', e.target.value)}
                      placeholder="عنوان البند (مثال: 1. تأكيد الموعد والعربون)"
                      className="flex-1 rounded-xl bg-[#121212] border border-neutral-700 px-3 py-2 text-xs font-bold text-white focus:border-[#cea355] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveSection('terms', idx)}
                      className="w-8 h-8 rounded-lg bg-red-950/40 border border-red-800/40 text-red-400 hover:text-red-200 flex items-center justify-center shrink-0"
                      title="حذف البند"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={sec.content}
                    onChange={(e) => handleUpdateSection('terms', idx, 'content', e.target.value)}
                    placeholder="نص وتفاصيل البند..."
                    rows={3}
                    className="w-full rounded-xl bg-[#121212] border border-neutral-700 p-3 text-xs text-neutral-300 placeholder:text-neutral-600 focus:border-[#cea355] focus:outline-none leading-relaxed"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Privacy Policy */}
      {activeSubTab === 'privacy' && (
        <div className="space-y-6 bg-[#101010] p-6 rounded-3xl border border-neutral-800">
          <div>
            <label className="block text-xs font-bold text-neutral-300 mb-1.5">
              العنوان الرئيسي لصفحة سياسة الخصوصية
            </label>
            <input
              type="text"
              value={policies.privacyTitle}
              onChange={(e) => setPolicies((prev) => ({ ...prev, privacyTitle: e.target.value }))}
              placeholder="سياسة الخصوصية وحماية البيانات"
              className="w-full rounded-xl bg-[#0a0a0a] border border-neutral-700 px-4 py-2.5 text-xs text-white placeholder:text-neutral-600 focus:border-[#cea355] focus:outline-none"
            />
          </div>

          <div className="space-y-4 pt-2 border-t border-neutral-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">بنود وفقرات سياسة الخصوصية</h3>
              <button
                type="button"
                onClick={() => handleAddSection('privacy')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1c1c1c] border border-[#cea355]/40 hover:border-[#cea355] text-[#edce8b] text-xs font-bold transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة بند جديد</span>
              </button>
            </div>

            <div className="space-y-4">
              {policies.privacySections.map((sec, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-[#0a0a0a] border border-neutral-800 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <input
                      type="text"
                      value={sec.title}
                      onChange={(e) => handleUpdateSection('privacy', idx, 'title', e.target.value)}
                      placeholder="عنوان البند (مثال: 1. استخدام بيانات العميل)"
                      className="flex-1 rounded-xl bg-[#121212] border border-neutral-700 px-3 py-2 text-xs font-bold text-white focus:border-[#cea355] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveSection('privacy', idx)}
                      className="w-8 h-8 rounded-lg bg-red-950/40 border border-red-800/40 text-red-400 hover:text-red-200 flex items-center justify-center shrink-0"
                      title="حذف البند"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={sec.content}
                    onChange={(e) => handleUpdateSection('privacy', idx, 'content', e.target.value)}
                    placeholder="نص وتفاصيل البند..."
                    rows={3}
                    className="w-full rounded-xl bg-[#121212] border border-neutral-700 p-3 text-xs text-neutral-300 placeholder:text-neutral-600 focus:border-[#cea355] focus:outline-none leading-relaxed"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
