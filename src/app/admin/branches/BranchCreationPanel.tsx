'use client';

import type { FormEvent } from 'react';
import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, CheckCircle2, Clock3, LoaderCircle, ShieldCheck } from 'lucide-react';
import { createBranchDirectAction } from '@/app/actions/owner-brand';
import { updateBranchStatusAction, updateBrandMaxBranchesAction } from '@/app/actions/system-admin';

export interface ManagedBranchDto {
  id: string;
  nameAr: string;
  nameEn: string | null;
  code: string;
  address: string;
  phone: string;
  whatsapp: string;
  status: string;
  dailyBookingLimit: number;
  workingHours: Array<{ dayOfWeek: number; isClosed: boolean; openTime: string; closeTime: string }>;
  teamCount: number;
  zoneCount: number;
}

interface BranchCreationPanelProps {
  maxBranches: number;
  currentBranchCount: number;
  branches: ManagedBranchDto[];
}

export default function BranchCreationPanel({
  maxBranches,
  currentBranchCount,
  branches,
}: BranchCreationPanelProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const atLimit = currentBranchCount >= maxBranches;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createBranchDirectAction(formData);
      if ('error' in result && result.error) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      formRef.current?.reset();
      setFeedback({ kind: 'success', message: result.message ?? 'تم إنشاء الفرع.' });
      router.refresh();
    });
  }

  function handleBranchStatusChange(branchId: string, newStatus: string) {
    setFeedback(null);
    const formData = new FormData();
    formData.set('branchId', branchId);
    formData.set('status', newStatus);
    formData.set('reason', 'تعديل حالة الفرع من لوحة تحكم المالك');
    startTransition(async () => {
      const result = await updateBranchStatusAction(formData);
      if ('error' in result && result.error) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      setFeedback({ kind: 'success', message: 'تم تحديث حالة الفرع بنجاح.' });
      router.refresh();
    });
  }

  function handleUpdateMaxBranches(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateBrandMaxBranchesAction(formData);
      if ('error' in result && result.error) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }
      setFeedback({ kind: 'success', message: 'تم تحديث أقصى عدد فروع مسموح بنجاح.' });
      router.refresh();
    });
  }

  return (
    <main className="min-h-screen bg-[#080808] px-4 py-10 text-white sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold text-[#d4af37]"><Building2 className="size-4" aria-hidden="true" /> إدارة هيكل التشغيل</p>
            <h1 className="mt-2 text-3xl font-black">إدارة الفروع وحالتها</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-white/55">أنشئ الفرع مباشرة، وعدّل حالة الفروع الحالية، وحدد أقصى طاقة للفروع لعلامتك التجارية.</p>
          </div>
          <Link href="/admin?section=branches" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 text-sm font-bold hover:border-[#d4af37]/40">العودة إلى لوحة المالك</Link>
        </header>

        {feedback ? <div role={feedback.kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`rounded-2xl border px-5 py-4 text-sm font-bold ${feedback.kind === 'error' ? 'border-red-500/35 bg-red-500/10 text-red-100' : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100'}`}>{feedback.message}</div> : null}

        <section className={`rounded-2xl border p-5 ${atLimit ? 'border-amber-500/35 bg-amber-500/[0.08]' : 'border-[#d4af37]/25 bg-[#d4af37]/[0.05]'}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold">الفروع المستخدمة: <span className="tabular-nums text-[#e5c45a]">{currentBranchCount} / {maxBranches}</span></p>
              <p className="mt-1 text-xs leading-6 text-white/55">يمكنك بصفتك المالك تعديل الحد الأقصى للفروع أو تغيير حالة الفروع مباشرة.</p>
            </div>
            <form onSubmit={handleUpdateMaxBranches} className="flex items-center gap-2">
              <label className="text-xs font-bold text-white/80 shrink-0">تعديل الحد:</label>
              <input name="maxBranches" type="number" min={currentBranchCount} max={100} defaultValue={maxBranches} required className="w-20 rounded-xl border border-white/20 bg-[#080808] px-3 py-1.5 text-center text-xs font-mono text-white outline-none focus:border-[#d4af37]" />
              <button type="submit" disabled={pending} className="rounded-xl bg-[#d4af37] px-3 py-1.5 text-xs font-bold text-black hover:brightness-110 disabled:opacity-50">تحديث</button>
            </form>
          </div>
        </section>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <form ref={formRef} onSubmit={submit} className="rounded-3xl border border-white/10 bg-[#141414] p-6 sm:p-8">
            <div className="flex items-start gap-3 border-b border-white/10 pb-5"><ShieldCheck className="mt-0.5 size-5 text-[#d4af37]" aria-hidden="true" /><div><h2 className="text-xl font-black">بيانات الفرع الأساسية</h2><p className="mt-1 text-sm text-white/50">كل الحقول بعلامة تستخدم مباشرة في التشغيل والحجز.</p></div></div>
            <fieldset disabled={pending || atLimit} className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-bold">اسم الفرع بالعربية<input name="nameAr" required minLength={2} maxLength={120} autoComplete="organization" className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]" placeholder="بريق الفرع الرئيسي" /></label>
              <label className="block text-sm font-bold">الاسم بالإنجليزية <input name="nameEn" maxLength={120} className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]" placeholder="Bareeq Main Branch" dir="ltr" /></label>
              <label className="block text-sm font-bold">كود الفرع<input name="code" required minLength={3} maxLength={24} pattern="[A-Za-z0-9-]{3,24}" className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-left font-mono text-sm uppercase text-white outline-none transition focus:border-[#d4af37]" placeholder="CAI-MAIN-01" dir="ltr" /></label>
              <label className="block text-sm font-bold">الطاقة اليومية<input name="dailyBookingLimit" required type="number" min={1} max={500} defaultValue={20} inputMode="numeric" className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]" /></label>
              <label className="block text-sm font-bold sm:col-span-2">العنوان التفصيلي<textarea name="address" required minLength={5} maxLength={500} rows={3} className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]" placeholder="المحافظة، المنطقة، الشارع، والمعلم الأقرب" /></label>
              <label className="block text-sm font-bold">هاتف الفرع<input name="phone" required type="tel" inputMode="tel" pattern="\+?[0-9]{10,15}" className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-left font-mono text-sm text-white outline-none transition focus:border-[#d4af37]" placeholder="01012345678" dir="ltr" /></label>
              <label className="block text-sm font-bold">واتساب الفرع<input name="whatsapp" required type="tel" inputMode="tel" pattern="\+?[0-9]{10,15}" className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-left font-mono text-sm text-white outline-none transition focus:border-[#d4af37]" placeholder="01012345678" dir="ltr" /></label>
            </fieldset>
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-white/60"><p className="font-bold text-white">ما الذي يُنشأ تلقائيًا؟</p><ul className="mt-2 list-inside list-disc space-y-1"><li>عضويتك في الفرع الجديد.</li><li>أيام العمل من 09:00 إلى 17:00، مع إغلاق يوم الجمعة.</li><li>إعدادات مواعيد افتراضية وسعة يومية قابلة للتعديل لاحقًا.</li></ul></div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Link href="/admin/setup" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-bold text-white/75 hover:bg-white/[0.05]">إعدادات الفروع الحالية</Link><button type="submit" disabled={pending || atLimit} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-6 text-sm font-black text-[#080808] disabled:cursor-not-allowed disabled:opacity-50">{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}{pending ? 'جارٍ إنشاء الفرع…' : 'إنشاء الفرع مباشرة'}</button></div>
          </form>

          <aside className="space-y-5">
            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6"><div className="flex items-center gap-3"><Clock3 className="size-5 text-[#d4af37]" aria-hidden="true" /><h2 className="font-black">إعداد ما بعد الإنشاء</h2></div><ol className="mt-4 space-y-3 text-sm leading-6 text-white/60"><li><span className="ml-2 font-bold text-[#e5c45a]">1.</span>أنشئ مناطق التغطية.</li><li><span className="ml-2 font-bold text-[#e5c45a]">2.</span>أضف فريق التشغيل والموظفين.</li><li><span className="ml-2 font-bold text-[#e5c45a]">3.</span>فعّل وسائل الدفع والخدمات المناسبة.</li></ol><Link href="/admin/setup" className="mt-5 inline-flex text-sm font-bold text-[#e5c45a] hover:underline">فتح مركز إعداد التشغيل ←</Link></section>
            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
              <h2 className="font-black">الفروع المسجلة وحالتها</h2>
              {branches.length === 0 ? <p className="mt-3 text-sm leading-6 text-white/50">لا توجد فروع حتى الآن.</p> : (
                <ul className="mt-4 space-y-4">
                  {branches.map((branch) => (
                    <li key={branch.id} className="rounded-xl border border-white/10 p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{branch.nameAr}</p>
                          <p dir="ltr" className="mt-1 font-mono text-xs text-white/40">{branch.code}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${branch.status === 'ACTIVE' ? 'bg-emerald-400/10 text-emerald-300 border border-emerald-400/30' : branch.status === 'PAUSED' ? 'bg-amber-400/10 text-amber-300 border border-amber-400/30' : 'bg-red-400/10 text-red-300 border border-red-400/30'}`}>
                          {branch.status === 'ACTIVE' ? 'نشط' : branch.status === 'PAUSED' ? 'متوقف مؤقتاً' : 'معطل'}
                        </span>
                      </div>
                      <p className="text-xs text-white/45">{branch.teamCount} فرق · {branch.zoneCount} مناطق · حد {branch.dailyBookingLimit}</p>
                      <div className="pt-2 border-t border-white/5 flex items-center gap-1.5">
                        <span className="text-[11px] text-white/50 block ml-1">تعديل الحالة:</span>
                        {branch.status !== 'ACTIVE' && (
                          <button type="button" disabled={pending} onClick={() => handleBranchStatusChange(branch.id, 'ACTIVE')} className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-200 text-[10px] font-bold hover:bg-emerald-500/30">تنشيط</button>
                        )}
                        {branch.status !== 'PAUSED' && (
                          <button type="button" disabled={pending} onClick={() => handleBranchStatusChange(branch.id, 'PAUSED')} className="px-2 py-1 rounded bg-amber-500/20 text-amber-200 text-[10px] font-bold hover:bg-amber-500/30">إيقاف مؤقت</button>
                        )}
                        {branch.status !== 'DISABLED' && (
                          <button type="button" disabled={pending} onClick={() => handleBranchStatusChange(branch.id, 'DISABLED')} className="px-2 py-1 rounded bg-red-500/20 text-red-200 text-[10px] font-bold hover:bg-red-500/30">تعطيل</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
