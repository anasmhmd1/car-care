'use client';

import type { FormEvent } from 'react';
import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  createBranchDirectAction,
  deleteBranchAction,
  updateBranchAction,
} from '@/app/actions/owner-brand';
import { updateBranchStatusAction } from '@/app/actions/system-admin';

export interface ManagedBranchDto {
  id: string;
  nameAr: string;
  nameEn: string | null;
  code: string;
  address: string;
  phone: string;
  whatsapp: string;
  status: string;
  assignmentMode: string;
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
  branches,
}: BranchCreationPanelProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [editingBranch, setEditingBranch] = useState<ManagedBranchDto | null>(null);
  const [deletingBranch, setDeletingBranch] = useState<ManagedBranchDto | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);

  function handleStartCreate() {
    setEditingBranch(null);
    setFeedback(null);
    formRef.current?.reset();
  }

  function handleStartEdit(branch: ManagedBranchDto) {
    setEditingBranch(branch);
    setFeedback(null);
    // Smooth scroll to form on mobile
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = editingBranch
        ? await updateBranchAction(formData)
        : await createBranchDirectAction(formData);

      if ('error' in result && result.error) {
        setFeedback({ kind: 'error', message: result.error });
        return;
      }

      if (!editingBranch) {
        formRef.current?.reset();
      }
      setFeedback({
        kind: 'success',
        message: result.message ?? (editingBranch ? 'تم تحديث بيانات الفرع بنجاح.' : 'تم إنشاء الفرع بنجاح.'),
      });
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

  function handleDeleteConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deletingBranch) return;
    setFeedback(null);
    const formData = new FormData(event.currentTarget);
    formData.set('branchId', deletingBranch.id);
    startTransition(async () => {
      const result = await deleteBranchAction(formData);
      if ('error' in result && result.error) {
        setFeedback({ kind: 'error', message: result.error });
        setDeletingBranch(null);
        return;
      }
      if (editingBranch?.id === deletingBranch.id) {
        setEditingBranch(null);
        formRef.current?.reset();
      }
      setFeedback({ kind: 'success', message: result.message ?? 'تم حذف الفرع بنجاح.' });
      setDeletingBranch(null);
      router.refresh();
    });
  }

  return (
    <main className="min-h-screen bg-[#080808] px-4 py-10 text-white sm:px-6 lg:px-8" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold text-[#d4af37]">
              <Building2 className="size-4" aria-hidden="true" /> إدارة هيكل التشغيل
            </p>
            <h1 className="mt-2 text-3xl font-black">إدارة وتعديل الفروع</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-white/55">
              أنشئ فروعًا جديدة، عدّل بيانات وسعة الفروع الحالية، أو احذف الفروع غير المرتبطة بحجوزات.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {editingBranch ? (
              <button
                type="button"
                onClick={handleStartCreate}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-4 text-xs font-black text-black shadow-md shadow-[#d4af37]/20 hover:brightness-110 transition-all"
              >
                <Plus className="size-4" aria-hidden="true" />
                <span>إنشاء فرع جديد</span>
              </button>
            ) : null}
            <Link
              href="/admin/setup"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 text-sm font-bold hover:border-[#d4af37]/40"
            >
              العودة إلى مركز إعداد التشغيل
            </Link>
          </div>
        </header>

        {feedback ? (
          <div
            role={feedback.kind === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className={`rounded-2xl border px-5 py-4 text-sm font-bold ${
              feedback.kind === 'error'
                ? 'border-red-500/35 bg-red-500/10 text-red-100'
                : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100'
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* Main Edit / Create Form */}
          <form
            ref={formRef}
            key={editingBranch ? `edit-${editingBranch.id}` : 'create-new'}
            onSubmit={submit}
            className="rounded-3xl border border-white/10 bg-[#141414] p-6 sm:p-8 flex flex-col justify-between shadow-xl"
          >
            <div>
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
                <div className="flex items-start gap-3">
                  {editingBranch ? (
                    <Pencil className="mt-0.5 size-5 text-[#d4af37]" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="mt-0.5 size-5 text-[#d4af37]" aria-hidden="true" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black">
                        {editingBranch ? `تعديل بيانات فرع: ${editingBranch.nameAr}` : 'بيانات الفرع الجديد'}
                      </h2>
                      {editingBranch ? (
                        <span className="rounded-md border border-[#d4af37]/40 bg-[#d4af37]/10 px-2 py-0.5 text-[11px] font-bold text-[#e5c45a]">
                          وضع التعديل
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-white/50">
                      {editingBranch
                        ? 'تعديل بيانات التواصل والسعة ونمط التوزيع الخاصة بهذا الفرع.'
                        : 'كل الحقول بعلامة تستخدم مباشرة في التشغيل وجدولة المواعيد.'}
                    </p>
                  </div>
                </div>

                {editingBranch ? (
                  <button
                    type="button"
                    onClick={handleStartCreate}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-bold text-white/70 hover:bg-white/[0.06] hover:text-white"
                  >
                    <Plus className="size-3.5" />
                    <span>فرع جديد</span>
                  </button>
                ) : null}
              </div>

              {editingBranch ? <input type="hidden" name="branchId" value={editingBranch.id} /> : null}

              <fieldset disabled={pending} className="mt-6 grid gap-5 sm:grid-cols-2">
                <label className="block text-sm font-bold">
                  اسم الفرع بالعربية
                  <input
                    name="nameAr"
                    required
                    minLength={2}
                    maxLength={120}
                    defaultValue={editingBranch?.nameAr ?? ''}
                    autoComplete="organization"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]"
                    placeholder="بريق الفرع الرئيسي"
                  />
                </label>
                <label className="block text-sm font-bold">
                  الاسم بالإنجليزية (اختياري)
                  <input
                    name="nameEn"
                    maxLength={120}
                    defaultValue={editingBranch?.nameEn ?? ''}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]"
                    placeholder="Bareeq Main Branch"
                    dir="ltr"
                  />
                </label>
                <label className="block text-sm font-bold">
                  كود الفرع
                  <input
                    name="code"
                    required
                    minLength={3}
                    maxLength={24}
                    defaultValue={editingBranch?.code ?? ''}
                    pattern="[A-Za-z0-9-]{3,24}"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-left font-mono text-sm uppercase text-white outline-none transition focus:border-[#d4af37]"
                    placeholder="CAI-MAIN-01"
                    dir="ltr"
                  />
                </label>
                <label className="block text-sm font-bold">
                  الطاقة اليومية (حجز/يوم)
                  <input
                    name="dailyBookingLimit"
                    required
                    type="number"
                    min={1}
                    max={500}
                    defaultValue={editingBranch?.dailyBookingLimit ?? 20}
                    inputMode="numeric"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]"
                  />
                </label>
                <label className="block text-sm font-bold sm:col-span-2">
                  العنوان التفصيلي
                  <textarea
                    name="address"
                    required
                    minLength={5}
                    maxLength={500}
                    rows={3}
                    defaultValue={editingBranch?.address ?? ''}
                    className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]"
                    placeholder="المحافظة، المنطقة، الشارع، والمعلم الأقرب"
                  />
                </label>
                <label className="block text-sm font-bold">
                  هاتف الفرع
                  <input
                    name="phone"
                    required
                    type="tel"
                    inputMode="tel"
                    pattern="\+?[0-9]{10,15}"
                    defaultValue={editingBranch?.phone ?? ''}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-left font-mono text-sm text-white outline-none transition focus:border-[#d4af37]"
                    placeholder="01012345678"
                    dir="ltr"
                  />
                </label>
                <label className="block text-sm font-bold">
                  واتساب الفرع
                  <input
                    name="whatsapp"
                    required
                    type="tel"
                    inputMode="tel"
                    pattern="\+?[0-9]{10,15}"
                    defaultValue={editingBranch?.whatsapp ?? ''}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-left font-mono text-sm text-white outline-none transition focus:border-[#d4af37]"
                    placeholder="01012345678"
                    dir="ltr"
                  />
                </label>

                {editingBranch ? (
                  <>
                    <label className="block text-sm font-bold">
                      نمط توزيع الحجوزات
                      <select
                        name="assignmentMode"
                        defaultValue={editingBranch.assignmentMode ?? 'MANUAL'}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]"
                      >
                        <option value="MANUAL" className="bg-[#111]">يدوي (بواسطة مدير التشغيل)</option>
                        <option value="AUTOMATIC" className="bg-[#111]">تلقائي (توزيع آلي على الفرق)</option>
                      </select>
                    </label>
                    <label className="block text-sm font-bold">
                      حالة الفرع
                      <select
                        name="status"
                        defaultValue={editingBranch.status ?? 'ACTIVE'}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-[#080808] px-4 py-3 text-sm text-white outline-none transition focus:border-[#d4af37]"
                      >
                        <option value="ACTIVE" className="bg-[#111]">نشط (Active)</option>
                        <option value="PAUSED" className="bg-[#111]">متوقف مؤقتاً (Paused)</option>
                        <option value="DISABLED" className="bg-[#111]">معطل (Disabled)</option>
                      </select>
                    </label>
                  </>
                ) : null}
              </fieldset>

              {!editingBranch ? (
                <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-white/60">
                  <p className="font-bold text-white">ما الذي يُنشأ تلقائيًا عند الإضافة؟</p>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    <li>عضويتك في الفرع الجديد.</li>
                    <li>أيام العمل من 09:00 إلى 17:00، مع إغلاق يوم الجمعة.</li>
                    <li>إعدادات مواعيد افتراضية وسعة يومية قابلة للتعديل لاحقًا.</li>
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-white/10 pt-6">
              {editingBranch ? (
                <button
                  type="button"
                  onClick={() => setDeletingBranch(editingBranch)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 text-xs font-bold text-red-200 hover:bg-red-500/20 transition-all"
                >
                  <Trash2 className="size-4 text-red-400" />
                  <span>حذف الفرع</span>
                </button>
              ) : (
                <Link
                  href="/admin/setup"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-bold text-white/75 hover:bg-white/[0.05]"
                >
                  إعدادات الفروع في مركز التشغيل
                </Link>
              )}

              <div className="flex flex-wrap gap-2.5">
                {editingBranch ? (
                  <button
                    type="button"
                    onClick={handleStartCreate}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-4 text-xs font-bold text-white/70 hover:bg-white/[0.05]"
                  >
                    إلغاء
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-6 text-sm font-black text-[#080808] shadow-lg shadow-[#d4af37]/20 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  )}
                  {pending
                    ? 'جارٍ الحفظ…'
                    : editingBranch
                    ? 'حفظ تعديلات الفرع'
                    : 'إنشاء الفرع مباشرة'}
                </button>
              </div>
            </div>
          </form>

          {/* Sidebar: Branch list and status controls */}
          <aside className="space-y-5">
            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 shadow-lg">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h2 className="font-black text-base text-white">الفروع المسجلة ({branches.length})</h2>
                  <p className="text-xs text-white/45 mt-0.5">انقر على أي فرع لتعديله أو حذفه</p>
                </div>
                <button
                  type="button"
                  onClick={handleStartCreate}
                  className="inline-flex items-center gap-1 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 px-2.5 py-1.5 text-xs font-bold text-[#f3e4a8] hover:bg-[#d4af37]/20"
                >
                  <Plus className="size-3.5" />
                  <span>جديد</span>
                </button>
              </div>

              {branches.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-white/50">لا توجد فروع حتى الآن.</p>
              ) : (
                <ul className="mt-4 space-y-3.5">
                  {branches.map((branch) => {
                    const isSelected = editingBranch?.id === branch.id;
                    return (
                      <li
                        key={branch.id}
                        className={`rounded-2xl border p-4 space-y-3 transition-all ${
                          isSelected
                            ? 'border-[#d4af37] bg-[#d4af37]/[0.08] shadow-md shadow-[#d4af37]/10'
                            : 'border-white/10 bg-black/40 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-white">{branch.nameAr}</p>
                            <p dir="ltr" className="mt-0.5 font-mono text-xs text-white/40">
                              {branch.code}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                              branch.status === 'ACTIVE'
                                ? 'bg-emerald-400/10 text-emerald-300 border border-emerald-400/30'
                                : branch.status === 'PAUSED'
                                ? 'bg-amber-400/10 text-amber-300 border border-amber-400/30'
                                : 'bg-red-400/10 text-red-300 border border-red-400/30'
                            }`}
                          >
                            {branch.status === 'ACTIVE' ? 'نشط' : branch.status === 'PAUSED' ? 'متوقف مؤقتاً' : 'معطل'}
                          </span>
                        </div>

                        <p className="text-xs text-white/45">
                          {branch.teamCount} فرق · {branch.zoneCount} مناطق · طاقة {branch.dailyBookingLimit} حجز/يوم
                        </p>

                        {/* Action buttons: Edit, Delete, Quick Status */}
                        <div className="pt-2.5 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(branch)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                isSelected
                                  ? 'bg-[#d4af37] text-black font-black'
                                  : 'bg-white/10 text-white hover:bg-white/20'
                              }`}
                            >
                              <Pencil className="size-3" />
                              <span>تعديل</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setDeletingBranch(branch)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 text-red-300 text-xs font-bold hover:bg-red-500/20 border border-red-500/20 transition-all"
                              title="حذف الفرع"
                            >
                              <Trash2 className="size-3 text-red-400" />
                              <span>حذف</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            {branch.status !== 'ACTIVE' && (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => handleBranchStatusChange(branch.id, 'ACTIVE')}
                                className="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-200 text-[10px] font-bold hover:bg-emerald-500/30"
                              >
                                تنشيط
                              </button>
                            )}
                            {branch.status !== 'PAUSED' && (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => handleBranchStatusChange(branch.id, 'PAUSED')}
                                className="px-2 py-1 rounded-md bg-amber-500/20 text-amber-200 text-[10px] font-bold hover:bg-amber-500/30"
                              >
                                إيقاف
                              </button>
                            )}
                            {branch.status !== 'DISABLED' && (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => handleBranchStatusChange(branch.id, 'DISABLED')}
                                className="px-2 py-1 rounded-md bg-red-500/20 text-red-200 text-[10px] font-bold hover:bg-red-500/30"
                              >
                                تعطيل
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
              <div className="flex items-center gap-3">
                <Clock3 className="size-5 text-[#d4af37]" aria-hidden="true" />
                <h2 className="font-black text-sm">إعداد ما بعد الإنشاء أو التعديل</h2>
              </div>
              <ol className="mt-4 space-y-2.5 text-xs leading-6 text-white/60">
                <li><span className="ml-2 font-bold text-[#e5c45a]">1.</span>أنشئ واضبط مناطق التغطية.</li>
                <li><span className="ml-2 font-bold text-[#e5c45a]">2.</span>أضف فرق التشغيل والموظفين الفنيين.</li>
                <li><span className="ml-2 font-bold text-[#e5c45a]">3.</span>فعّل وسائل الدفع وساعات العمل.</li>
              </ol>
              <Link
                href="/admin/setup"
                className="mt-4 inline-flex text-xs font-bold text-[#e5c45a] hover:underline"
              >
                فتح مركز إعداد التشغيل ←
              </Link>
            </section>
          </aside>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deletingBranch ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-3xl border border-red-500/30 bg-[#0f0f13] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                <AlertTriangle className="size-5" />
                <span>تأكيد حذف الفرع</span>
              </div>
              <button
                type="button"
                onClick={() => setDeletingBranch(null)}
                className="p-1 rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-2 text-sm text-white/80">
              <p>
                هل أنت متأكد من رغبتك في حذف فرع{' '}
                <span className="font-bold text-white">"{deletingBranch.nameAr}"</span> ({deletingBranch.code})؟
              </p>
              <p className="text-xs text-white/50 leading-5">
                لا يمكن حذف الفرع إلا إذا لم يحتوي على حجوزات أو اشتراكات نشطة في النظام. سيتم حذف الإعدادات المرتبطة به.
              </p>
            </div>

            <form onSubmit={handleDeleteConfirm} className="space-y-3 pt-2">
              <label className="block text-xs font-bold text-white/70">
                سبب الحذف (اختياري):
                <input
                  name="reason"
                  placeholder="مثال: إغلاق النشاط في المنطقة"
                  maxLength={500}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#080808] px-3.5 py-2.5 text-xs text-white outline-none focus:border-red-400"
                />
              </label>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setDeletingBranch(null)}
                  disabled={pending}
                  className="px-4 py-2.5 rounded-xl border border-white/10 text-xs font-bold text-white/70 hover:bg-white/10"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-black text-white shadow-lg shadow-red-600/30 disabled:opacity-50"
                >
                  {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  <span>{pending ? 'جارٍ الحذف…' : 'تأكيد الحذف النهائي'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
