'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, LoaderCircle, Phone, ShieldCheck, X } from 'lucide-react';
import { requestPasswordResetAction } from '@/app/actions/customer';

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPhone?: string;
}

export default function PasswordResetModal({
  isOpen,
  onClose,
  initialPhone = '',
}: PasswordResetModalProps) {
  const [phone, setPhone] = useState(initialPhone);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!isOpen) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.set('phone', phone.trim());

    startTransition(async () => {
      try {
        const result = await requestPasswordResetAction(formData);
        if ('error' in result && result.error) {
          setError(result.error);
        } else if ('message' in result && result.message) {
          setSuccessMessage(
            'تم تسجيل طلب استعادة كلمة المرور بنجاح! إذا كان هذا الرقم مسجلاً لدينا، سيتم تفعيل الطلب فوراً وسيتواصل معك فريق التشغيل للتحقق وتزويدك بكلمة المرور المؤقتة.',
          );
        }
      } catch {
        setError('حدث خطأ أثناء إرسال الطلب. يرجى المحاولة مرة أخرى.');
      }
    });
  }

  function handleClose() {
    if (pending) return;
    setError(null);
    setSuccessMessage(null);
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md rounded-3xl border border-[#cea355]/30 bg-[#0e0e11] p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.9),0_0_40px_rgba(206,163,85,0.1)] ring-1 ring-white/5 space-y-5 text-white text-right">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          disabled={pending}
          aria-label="إغلاق النافذة"
          className="absolute top-5 left-5 grid size-9 place-items-center rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#cea355]"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#cea355]/15 border border-[#cea355]/30 text-[#edce8b]">
            <KeyRound className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="reset-modal-title" className="text-lg font-black text-white">
              استعادة كلمة المرور
            </h2>
            <p className="text-xs text-neutral-400">تحقق موثق لحماية حسابك</p>
          </div>
        </div>

        {/* Info Note */}
        <div className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-neutral-300 leading-relaxed">
          <ShieldCheck className="size-4 text-[#edce8b] shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            لأمان حسابك، لا نرسل روابط تلقائية. بعد إدخال رقم هاتفك، سيقوم مدير التشغيل بمطابقة بيانات الحساب وتأكيد هويتك ثم تزويدك بكلمة مرور مؤقتة.
          </span>
        </div>

        {/* Status Alerts */}
        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs font-semibold text-red-300 leading-relaxed"
          >
            {error}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="space-y-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-200 leading-relaxed"
          >
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              <span>تم استلام الطلب</span>
            </div>
            <p>{successMessage}</p>
          </div>
        )}

        {/* Form or Close Action */}
        {!successMessage ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="reset-phone-input" className="block text-xs font-semibold text-neutral-300">
                رقم هاتف الحساب
              </label>
              <div className="relative">
                <Phone
                  className="w-4 h-4 text-neutral-500 absolute top-1/2 -translate-y-1/2 right-3.5 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="reset-phone-input"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010XXXXXXXX"
                  autoComplete="tel"
                  inputMode="tel"
                  dir="ltr"
                  className="w-full rounded-xl border border-neutral-800 bg-[#060608] py-3 pr-10 pl-4 text-sm text-white placeholder:text-neutral-600 focus:border-[#cea355] focus:outline-none focus:ring-2 focus:ring-[#cea355]/20 font-sans text-right transition"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={pending}
                className="flex-1 min-h-11 rounded-xl border border-white/10 px-4 text-xs font-bold text-neutral-300 hover:text-white hover:border-white/25 transition"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={pending || !phone.trim()}
                className="flex-1 min-h-11 rounded-xl bg-gradient-to-r from-[#edce8b] via-[#cea355] to-[#b5883f] px-4 text-xs font-extrabold text-[#080808] shadow-[0_4px_15px_rgba(206,163,85,0.25)] hover:brightness-105 active:scale-[0.99] transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {pending ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    <span>جاري الإرسال…</span>
                  </>
                ) : (
                  <span>إرسال طلب الاستعادة</span>
                )}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={handleClose}
            className="w-full min-h-11 rounded-xl bg-gradient-to-r from-[#edce8b] via-[#cea355] to-[#b5883f] px-4 text-xs font-extrabold text-[#080808] shadow-[0_4px_15px_rgba(206,163,85,0.25)] hover:brightness-105 transition"
          >
            حسناً، فهمت
          </button>
        )}
      </div>
    </div>
  );
}
