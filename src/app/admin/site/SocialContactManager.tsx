'use client';

import type { FormEvent } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Share2,
  Phone,
  MessageCircle,
  ExternalLink,
  LoaderCircle,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Building2,
  HelpCircle,
} from 'lucide-react';
import {
  saveSocialAndContactAction,
} from '@/app/actions/owner-social';
import {
  DEFAULT_SOCIAL_LINKS,
  type SocialLinks,
} from '@/lib/social-links';

interface BranchContactDto {
  id: string;
  nameAr: string;
  phone: string;
  whatsapp: string;
}

interface SocialContactManagerProps {
  initialSocialLinks: SocialLinks;
  activeBranch?: BranchContactDto | null;
}

export default function SocialContactManager({
  initialSocialLinks,
  activeBranch,
}: SocialContactManagerProps) {
  const router = useRouter();
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(initialSocialLinks);
  const [phone, setPhone] = useState<string>(activeBranch?.phone ?? '');
  const [whatsapp, setWhatsapp] = useState<string>(activeBranch?.whatsapp ?? '');
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function updateSocialField(key: keyof SocialLinks, value: string) {
    setSocialLinks((current) => ({ ...current, [key]: value }));
  }

  function handleReset() {
    setSocialLinks(DEFAULT_SOCIAL_LINKS);
    setFeedback({
      kind: 'success',
      message: 'تمت استعادة الروابط الافتراضية في النموذج. اضغط حفظ التعديلات لاعتمادها.',
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const formData = new FormData();
    formData.set('facebook', socialLinks.facebook ?? '');
    formData.set('tiktok', socialLinks.tiktok ?? '');
    formData.set('instagram', socialLinks.instagram ?? '');
    if (activeBranch?.id) {
      formData.set('branchId', activeBranch.id);
    }
    formData.set('phone', phone);
    formData.set('whatsapp', whatsapp);

    startTransition(async () => {
      const result = await saveSocialAndContactAction(formData);
      if (result.error) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      setFeedback({
        kind: 'success',
        message: result.message ?? 'تم حفظ ونشر روابط السوشيال وبيانات التواصل بنجاح.',
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {/* Header Info */}
      <div className="rounded-3xl border border-neutral-800 bg-[#0d0d0d]/80 p-6 backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#cea355]">
              <Share2 className="w-4 h-4" />
              <span>قنوات التواصل والتواجد الرقمي</span>
            </div>
            <h2 className="mt-1 text-2xl font-black text-white">
              روابط السوشيال ميديا وأرقام تواصل معنا
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-neutral-400">
              تحكم في حسابات بريق على فيسبوك وتيك توك وانستجرام الظاهرة بالفوتر، بالإضافة لرقم الهاتف والواتساب لزر التواصل المباشر.
            </p>
          </div>

          <button
            type="button"
            onClick={handleReset}
            disabled={pending}
            className="inline-flex items-center gap-2 self-start sm:self-center px-4 py-2.5 rounded-xl border border-neutral-800 bg-[#141414] hover:bg-[#1c1c1c] text-xs font-bold text-neutral-300 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الافتراضي</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center gap-3 rounded-2xl border p-4 text-xs sm:text-sm font-bold animate-in fade-in duration-200 ${
            feedback.kind === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          }`}
        >
          {feedback.kind === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Main Grid: Form + Live Preview */}
      <div className="grid gap-8 lg:grid-cols-12 items-start">
        
        {/* Form Column */}
        <form onSubmit={handleSubmit} className="space-y-6 lg:col-span-7">
          
          {/* Section 1: Social Media Links */}
          <div className="rounded-3xl border border-neutral-800 bg-[#0d0d0d]/90 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#cea355]" />
                <h3 className="text-base font-bold text-white">
                  حسابات منصات التواصل الاجتماعي
                </h3>
              </div>
              <span className="text-[11px] text-neutral-400">تظهر في أسفل كل صفحات الموقع (Footer)</span>
            </div>

            {/* Facebook URL */}
            <div className="space-y-2">
              <label className="flex items-center justify-between text-xs font-bold text-neutral-300">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  رابط صفحة فيسبوك (Facebook URL)
                </span>
                {socialLinks.facebook && (
                  <a
                    href={socialLinks.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#cea355] hover:underline"
                  >
                    <span>فتح الرابط</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </label>
              <div className="relative">
                <input
                  type="url"
                  dir="ltr"
                  placeholder="https://facebook.com/bareeq"
                  value={socialLinks.facebook ?? ''}
                  onChange={(e) => updateSocialField('facebook', e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-[#141414] px-4 py-3 text-xs sm:text-sm text-white placeholder-neutral-600 focus:border-[#cea355] focus:outline-none transition-all font-mono"
                />
              </div>
              <p className="text-[11px] text-neutral-400">
                اتركه فارغًا إذا كنت لا ترغب في ظهور أيقونة فيسبوك.
              </p>
            </div>

            {/* TikTok URL */}
            <div className="space-y-2">
              <label className="flex items-center justify-between text-xs font-bold text-neutral-300">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-pink-500" />
                  رابط حساب تيك توك (TikTok URL)
                </span>
                {socialLinks.tiktok && (
                  <a
                    href={socialLinks.tiktok}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#cea355] hover:underline"
                  >
                    <span>فتح الرابط</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </label>
              <div className="relative">
                <input
                  type="url"
                  dir="ltr"
                  placeholder="https://tiktok.com/@bareeq"
                  value={socialLinks.tiktok ?? ''}
                  onChange={(e) => updateSocialField('tiktok', e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-[#141414] px-4 py-3 text-xs sm:text-sm text-white placeholder-neutral-600 focus:border-[#cea355] focus:outline-none transition-all font-mono"
                />
              </div>
              <p className="text-[11px] text-neutral-400">
                اتركه فارغًا إذا كنت لا ترغب في ظهور أيقونة تيك توك.
              </p>
            </div>

            {/* Instagram URL */}
            <div className="space-y-2">
              <label className="flex items-center justify-between text-xs font-bold text-neutral-300">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  رابط حساب انستجرام (Instagram URL)
                </span>
                {socialLinks.instagram && (
                  <a
                    href={socialLinks.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#cea355] hover:underline"
                  >
                    <span>فتح الرابط</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </label>
              <div className="relative">
                <input
                  type="url"
                  dir="ltr"
                  placeholder="https://instagram.com/bareeq"
                  value={socialLinks.instagram ?? ''}
                  onChange={(e) => updateSocialField('instagram', e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-[#141414] px-4 py-3 text-xs sm:text-sm text-white placeholder-neutral-600 focus:border-[#cea355] focus:outline-none transition-all font-mono"
                />
              </div>
              <p className="text-[11px] text-neutral-400">
                اتركه فارغًا إذا كنت لا ترغب في ظهور أيقونة انستجرام.
              </p>
            </div>

          </div>

          {/* Section 2: Direct Contact Phone & WhatsApp */}
          <div className="rounded-3xl border border-neutral-800 bg-[#0d0d0d]/90 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#cea355]" />
                <h3 className="text-base font-bold text-white">
                  أرقام التواصل المباشر (تواصل معنا والواتساب للبراند)
                </h3>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-[#cea355]/15 text-[#edce8b] border border-[#cea355]/30">
                <Sparkles className="w-3 h-3" />
                <span>خدمة عملاء بريق الموحدة</span>
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Phone Call */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-neutral-300">
                  <Phone className="w-3.5 h-3.5 text-[#cea355]" />
                  <span>رقم الهاتف المباشر (Phone Call)</span>
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  required
                  placeholder="01012345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-[#141414] px-4 py-3 text-xs sm:text-sm text-white placeholder-neutral-600 focus:border-[#cea355] focus:outline-none transition-all font-mono"
                />
                <p className="text-[11px] text-neutral-400">
                  يستخدم عند ضغط العميل على اتصال هاتفي.
                </p>
              </div>

              {/* WhatsApp */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-neutral-300">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>رقم الواتساب (WhatsApp Direct)</span>
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  required
                  placeholder="01012345678"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full rounded-2xl border border-neutral-800 bg-[#141414] px-4 py-3 text-xs sm:text-sm text-white placeholder-neutral-600 focus:border-[#cea355] focus:outline-none transition-all font-mono"
                />
                <p className="text-[11px] text-neutral-400">
                  يستخدم لفتح محادثة واتساب المباشرة تلقائياً.
                </p>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl gold-gradient px-8 text-xs sm:text-sm font-black text-white shadow-xl shadow-[#cea355]/20 hover:scale-[1.02] active:scale-98 transition-all disabled:opacity-50 cursor-pointer"
            >
              {pending ? (
                <>
                  <LoaderCircle className="w-4 h-4 animate-spin" />
                  <span>جارٍ حفظ وتحديث البيانات…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>حفظ الروابط وبيانات التواصل</span>
                </>
              )}
            </button>
          </div>

        </form>

        {/* Live Preview Column */}
        <div className="space-y-6 lg:col-span-5">
          
          <div className="rounded-3xl border border-neutral-800 bg-[#0d0d0d]/90 p-6 space-y-6 sticky top-6">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#cea355] animate-pulse" />
                <h3 className="text-sm font-bold text-white">معاينة حية (Live Preview)</h3>
              </div>
              <span className="text-[11px] text-neutral-400">كما تظهر للزائر بالموقع</span>
            </div>

            {/* 1. Footer Social Preview */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-neutral-400 block">
                ١. معاينة أيقونات السوشيال في الفوتر
              </span>
              <div className="rounded-2xl border border-neutral-900 bg-[#050505] p-5 flex flex-col items-center justify-center gap-4 text-center">
                <span className="text-xs text-neutral-500 font-medium">
                  تابع بريق عبر منصات التواصل:
                </span>
                
                <div className="flex items-center gap-3">
                  {/* Facebook */}
                  {socialLinks.facebook?.trim() ? (
                    <div
                      title={socialLinks.facebook}
                      className="w-10 h-10 rounded-2xl border border-neutral-800 bg-[#101010] text-[#edce8b] flex items-center justify-center shadow-md shadow-[#cea355]/10"
                    >
                      <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                    </div>
                  ) : null}

                  {/* TikTok */}
                  {socialLinks.tiktok?.trim() ? (
                    <div
                      title={socialLinks.tiktok}
                      className="w-10 h-10 rounded-2xl border border-neutral-800 bg-[#101010] text-[#edce8b] flex items-center justify-center shadow-md shadow-[#cea355]/10"
                    >
                      <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                      </svg>
                    </div>
                  ) : null}

                  {/* Instagram */}
                  {socialLinks.instagram?.trim() ? (
                    <div
                      title={socialLinks.instagram}
                      className="w-10 h-10 rounded-2xl border border-neutral-800 bg-[#101010] text-[#edce8b] flex items-center justify-center shadow-md shadow-[#cea355]/10"
                    >
                      <svg className="w-4.5 h-4.5 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    </div>
                  ) : null}

                  {!socialLinks.facebook?.trim() && !socialLinks.tiktok?.trim() && !socialLinks.instagram?.trim() && (
                    <span className="text-[11px] text-neutral-600">لا توجد أيقونات مفعّلة حاليًا</span>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Floating Contact Widget Preview */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-neutral-400 block">
                ٢. أرقام الاتصال لزر التواصل العائم (تواصل مع الدعم)
              </span>
              <div className="rounded-2xl border border-neutral-900 bg-[#050505] p-4 space-y-2.5">
                {/* WhatsApp Pill */}
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#18140c] border border-[#cea355]/40 text-xs">
                  <div className="flex items-center gap-2 text-white">
                    <MessageCircle className="w-4 h-4 text-[#edce8b]" />
                    <span className="font-bold">WhatsApp:</span>
                  </div>
                  <span className="font-mono text-[#edce8b] text-[11px]" dir="ltr">
                    {whatsapp || 'لم يحدد'}
                  </span>
                </div>

                {/* Phone Pill */}
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#18140c] border border-[#cea355]/40 text-xs">
                  <div className="flex items-center gap-2 text-white">
                    <Phone className="w-4 h-4 text-[#edce8b]" />
                    <span className="font-bold">Phone Call:</span>
                  </div>
                  <span className="font-mono text-[#edce8b] text-[11px]" dir="ltr">
                    {phone || 'لم يحدد'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-neutral-500">
              <HelpCircle className="w-3.5 h-3.5 inline-block text-[#cea355] ml-1.5" />
              عند الضغط على &laquo;حفظ الروابط&raquo;، تنعكس الأرقام والروابط فورًا على كافة صفحات الموقع والزر العائم.
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
