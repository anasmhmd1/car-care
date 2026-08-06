'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  BadgeCheck,
  Building2,
  CirclePlus,
  Edit3,
  LockKeyhole,
  PackageOpen,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import {
  createSubscriptionPlanAction,
  deleteSubscriptionPlanAction,
  updateSubscriptionPlanAction,
} from '@/app/actions/owner';

export interface SubscriptionPlanAdminItem {
  id: string;
  nameAr: string;
  descriptionAr: string;
  price: number;
  validityDays: number;
  visitCount: number;
  allowedVehicleCount: number;
  freezeAllowed: boolean;
  maxFreezeDays: number;
  rules: string;
  active: boolean;
  serviceIds: string[];
  serviceQuotas: Record<string, number | null>;
  branchIds: string[];
  subscriptionCount: number;
}

export interface SubscriptionPlanServiceOption {
  id: string;
  nameAr: string;
  active: boolean;
  subscriptionEligible: boolean;
}

export interface SubscriptionPlanBranchOption {
  id: string;
  nameAr: string;
  status: 'ACTIVE' | 'PAUSED' | 'DISABLED';
}

type PlanActionResult = {
  success?: boolean;
  error?: string;
  message?: string;
  planId?: string;
};

type EditorState = { plan: SubscriptionPlanAdminItem | null };
type SafetyState = {
  plan: SubscriptionPlanAdminItem;
  mode: 'DEACTIVATE' | 'DELETE_UNLINKED';
};
type Feedback = { kind: 'success' | 'error'; text: string };

const currencyFormatter = new Intl.NumberFormat('ar-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat('ar-EG');

const inputClass = 'mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#090909] px-3.5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 disabled:cursor-not-allowed disabled:opacity-45';
const secondaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-4 text-xs font-bold text-white/75 transition hover:border-[#d4af37]/35 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37] disabled:cursor-not-allowed disabled:opacity-45';

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function PlanMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-3">
      <dt className="text-[10px] font-bold text-white/35">{label}</dt>
      <dd className="mt-1 text-sm font-black tabular-nums text-white/85">{value}</dd>
    </div>
  );
}

export default function SubscriptionPlanManager({
  plans,
  services,
  branches,
}: {
  plans: SubscriptionPlanAdminItem[];
  services: SubscriptionPlanServiceOption[];
  branches: SubscriptionPlanBranchOption[];
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [safetyAction, setSafetyAction] = useState<SafetyState | null>(null);
  const [freezeAllowed, setFreezeAllowed] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [useServiceQuotas, setUseServiceQuotas] = useState(true);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isPending, startTransition] = useTransition();

  function openEditor(plan: SubscriptionPlanAdminItem | null): void {
    setFeedback(null);
    setFreezeAllowed(plan?.freezeAllowed ?? false);
    setSelectedServiceIds(plan?.serviceIds ?? []);
    setUseServiceQuotas(plan
      ? Object.values(plan.serviceQuotas).some((quota) => quota !== null)
      : true);
    setEditor({ plan });
  }

  function toggleService(serviceId: string, checked: boolean): void {
    setSelectedServiceIds((current) => (
      checked
        ? [...new Set([...current, serviceId])]
        : current.filter((id) => id !== serviceId)
    ));
  }

  function submitPlan(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    const isEditing = Boolean(editor?.plan);
    const action: (data: FormData) => Promise<PlanActionResult> = isEditing
      ? updateSubscriptionPlanAction
      : createSubscriptionPlanAction;

    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (result.error) {
          setFeedback({ kind: 'error', text: result.error });
          return;
        }
        setEditor(null);
        setFeedback({
          kind: 'success',
          text: result.message ?? (isEditing ? 'تم تحديث الخطة.' : 'تم إنشاء الخطة.'),
        });
        router.refresh();
      } catch {
        setFeedback({ kind: 'error', text: 'تعذر الاتصال بالخادم. أعد المحاولة.' });
      }
    });
  }

  function submitSafetyAction(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const formData = new FormData(form);

    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await deleteSubscriptionPlanAction(formData);
        if ('error' in result) {
          setFeedback({ kind: 'error', text: result.error });
          return;
        }
        setSafetyAction(null);
        setFeedback({ kind: 'success', text: result.message ?? 'تم حفظ الإجراء.' });
        router.refresh();
      } catch {
        setFeedback({ kind: 'error', text: 'تعذر الاتصال بالخادم. أعد المحاولة.' });
      }
    });
  }

  const termsLocked = Boolean(editor?.plan && editor.plan.subscriptionCount > 0);
  const reactivationLocked = Boolean(termsLocked && editor?.plan && !editor.plan.active);

  return (
    <section aria-labelledby="subscription-plans-heading" className="space-y-5">
      <div className="overflow-hidden rounded-3xl border border-[#d4af37]/20 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.12),transparent_42%),#101010]">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-black tracking-[0.14em] text-[#e4c762]">
              <Sparkles className="size-4" aria-hidden="true" />
              كتالوج الزيارات الدورية
            </p>
            <h2 id="subscription-plans-heading" className="mt-3 max-w-2xl text-2xl font-black leading-tight text-white sm:text-3xl">
              صمّم ما يشتريه العميل وما يحق له حجزه
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/50">
              كل خطة تربط السعر والمدة والزيارات بالسيارات والخدمات والفروع المسموح بها. تعطيل الخطة يوقف البيع الجديد فقط ويحافظ على سجلات العملاء الحالية.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openEditor(null)}
            disabled={isPending || !services.some((service) => service.subscriptionEligible) || branches.length === 0}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-5 text-sm font-black text-[#151007] shadow-[0_14px_36px_rgba(212,175,55,0.16)] transition hover:bg-[#e4c762] focus:outline-none focus:ring-2 focus:ring-[#f5dc86] focus:ring-offset-2 focus:ring-offset-[#101010] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <CirclePlus className="size-5" aria-hidden="true" />
            إضافة خطة جديدة
          </button>
        </div>
        {(!services.some((service) => service.subscriptionEligible) || branches.length === 0) ? (
          <p className="border-t border-amber-400/15 bg-amber-400/[0.06] px-5 py-3 text-xs leading-6 text-amber-200 sm:px-7">
            يلزم تسجيل خدمة مؤهلة للاشتراك وفرع واحد على الأقل قبل إنشاء خطة.
          </p>
        ) : null}
      </div>

      {feedback ? (
        <p
          role="status"
          aria-live="polite"
          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${feedback.kind === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}
        >
          {feedback.text}
        </p>
      ) : null}

      {plans.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-10 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-[#d4af37]/25 bg-[#d4af37]/10 text-[#e4c762]">
            <PackageOpen className="size-6" aria-hidden="true" />
          </span>
          <h3 className="mt-4 text-lg font-black text-white">لا توجد خطط اشتراك بعد</h3>
          <p className="mt-2 text-sm text-white/45">أنشئ أول خطة وحدد الخدمات والفروع التي تغطيها.</p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] p-5 sm:p-6"
            >
              <span className={`absolute inset-y-0 right-0 w-1 ${plan.active ? 'bg-[#d4af37]' : 'bg-white/15'}`} aria-hidden="true" />
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[10px] font-black ${plan.active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-white/15 bg-white/[0.04] text-white/45'}`}>
                      {plan.active ? 'متاحة للبيع' : 'معطلة'}
                    </span>
                    <span className="text-[10px] text-white/25">#{plan.id.slice(0, 8).toUpperCase()}</span>
                  </div>
                  <h3 className="mt-3 break-words text-xl font-black text-white">{plan.nameAr}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/45">{plan.descriptionAr}</p>
                </div>
                <p className="shrink-0 text-2xl font-black tabular-nums text-[#e4c762]">
                  {formatCurrency(plan.price)}
                </p>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <PlanMetric label="الزيارات" value={numberFormatter.format(plan.visitCount)} />
                <PlanMetric label="الصلاحية" value={`${numberFormatter.format(plan.validityDays)} يوم`} />
                <PlanMetric label="السيارات" value={numberFormatter.format(plan.allowedVehicleCount)} />
                <PlanMetric label="الاشتراكات" value={numberFormatter.format(plan.subscriptionCount)} />
              </dl>

              <div className="mt-5 grid gap-3 text-xs sm:grid-cols-2">
                <div className="rounded-2xl border border-white/[0.07] bg-black/15 p-4">
                  <p className="flex items-center gap-2 font-bold text-white/60">
                    <Wrench className="size-4 text-[#d4af37]" aria-hidden="true" />
                    {numberFormatter.format(plan.serviceIds.length)} خدمات
                  </p>
                  <p className="mt-2 line-clamp-2 leading-5 text-white/35">
                    {services.filter((service) => plan.serviceIds.includes(service.id)).map((service) => service.nameAr).join('، ') || 'لا توجد خدمات مرتبطة'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-black/15 p-4">
                  <p className="flex items-center gap-2 font-bold text-white/60">
                    <Building2 className="size-4 text-[#d4af37]" aria-hidden="true" />
                    {numberFormatter.format(plan.branchIds.length)} فروع
                  </p>
                  <p className="mt-2 line-clamp-2 leading-5 text-white/35">
                    {branches.filter((branch) => plan.branchIds.includes(branch.id)).map((branch) => branch.nameAr).join('، ') || 'لا توجد فروع مرتبطة'}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.07] pt-5">
                <button type="button" onClick={() => openEditor(plan)} disabled={isPending} className={secondaryButtonClass}>
                  <Edit3 className="size-4" aria-hidden="true" />
                  تعديل الخطة
                </button>
                {plan.active ? (
                  <button
                    type="button"
                    onClick={() => { setFeedback(null); setSafetyAction({ plan, mode: 'DEACTIVATE' }); }}
                    disabled={isPending}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-4 text-xs font-bold text-amber-200 transition hover:bg-amber-500/[0.13] focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-45"
                  >
                    <Archive className="size-4" aria-hidden="true" />
                    تعطيل البيع
                  </button>
                ) : null}
                {!plan.active && plan.subscriptionCount === 0 ? (
                  <button
                    type="button"
                    onClick={() => { setFeedback(null); setSafetyAction({ plan, mode: 'DELETE_UNLINKED' }); }}
                    disabled={isPending}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-4 text-xs font-bold text-red-200 transition hover:bg-red-500/[0.13] focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-45"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    حذف نهائي
                  </button>
                ) : null}
                {!plan.active && plan.subscriptionCount > 0 ? (
                  <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-[11px] text-white/40">
                    <LockKeyhole className="size-3.5" aria-hidden="true" />
                    محفوظة لارتباطها باشتراكات
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {editor ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/85 p-3 backdrop-blur-sm sm:p-6"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !isPending) setEditor(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="subscription-plan-editor-title"
            className="mx-auto my-3 w-full max-w-5xl overflow-hidden rounded-3xl border border-white/12 bg-[#111] shadow-2xl sm:my-8"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-[linear-gradient(110deg,rgba(212,175,55,0.1),transparent_55%)] p-5 sm:p-6">
              <div>
                <p className="text-[11px] font-black text-[#e4c762]">هوية الخطة واستحقاقاتها</p>
                <h2 id="subscription-plan-editor-title" className="mt-2 text-2xl font-black text-white">
                  {editor.plan ? `تعديل ${editor.plan.nameAr}` : 'إنشاء خطة اشتراك'}
                </h2>
                <p className="mt-2 text-xs leading-6 text-white/45">حقول السعر والرصيد تُنسخ عند شراء العميل؛ أما الخدمات والفروع فتحدد أين يستخدم اشتراكه.</p>
              </div>
              <button type="button" onClick={() => setEditor(null)} disabled={isPending} aria-label="إغلاق محرر الخطة" className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 text-white/55 hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#d4af37]">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={submitPlan} className="space-y-7 p-5 sm:p-6">
              {editor.plan ? <input type="hidden" name="planId" value={editor.plan.id} /> : null}
              {termsLocked && editor.plan ? (
                <>
                  <input type="hidden" name="freezeAllowed" value={editor.plan.freezeAllowed ? 'true' : 'false'} />
                  <input type="hidden" name="maxFreezeDays" value={editor.plan.maxFreezeDays} />
                  {reactivationLocked ? <input type="hidden" name="active" value="false" /> : null}
                  {editor.plan.serviceIds.map((serviceId) => (
                    <input key={`locked-service-${serviceId}`} type="hidden" name="serviceIds" value={serviceId} />
                  ))}
                  {editor.plan.serviceIds.map((serviceId) => {
                    const quota = editor.plan?.serviceQuotas[serviceId];
                    return quota === null || quota === undefined ? null : (
                      <input key={`locked-quota-${serviceId}`} type="hidden" name={`serviceQuota:${serviceId}`} value={quota} />
                    );
                  })}
                  {editor.plan.branchIds.map((branchId) => (
                    <input key={`locked-branch-${branchId}`} type="hidden" name="branchIds" value={branchId} />
                  ))}
                </>
              ) : null}
              {feedback?.kind === 'error' ? (
                <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
                  {feedback.text}
                </p>
              ) : null}
              {termsLocked && editor.plan ? (
                <div role="status" className="flex gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.08] p-4 text-sm leading-6 text-amber-100">
                  <LockKeyhole className="mt-0.5 size-5 shrink-0 text-amber-300" aria-hidden="true" />
                  <p>لهذه الخطة {numberFormatter.format(editor.plan.subscriptionCount)} اشتراك قائم؛ الاستحقاقات التجارية مقفلة لحماية العملاء. يمكنك تعديل الاسم والوصف وتعطيل البيع فقط. أنشئ خطة جديدة إذا احتجت عرضًا أو نطاقًا مختلفًا.</p>
                </div>
              ) : null}

              <div className="grid gap-5 lg:grid-cols-2">
                <label className="text-xs font-bold text-white/70">
                  اسم الخطة بالعربية *
                  <input name="nameAr" required minLength={2} maxLength={120} defaultValue={editor.plan?.nameAr ?? ''} autoComplete="off" autoFocus className={inputClass} />
                </label>
                <label className="text-xs font-bold text-white/70">
                  السعر بالجنيه *
                  <input name="price" type="number" required min={1} max={10_000_000} step={1} inputMode="numeric" readOnly={termsLocked} aria-readonly={termsLocked || undefined} defaultValue={editor.plan?.price ?? 1} className={inputClass} />
                </label>
                <label className="text-xs font-bold text-white/70 lg:col-span-2">
                  الوصف الظاهر للعميل *
                  <textarea name="descriptionAr" required minLength={3} maxLength={2000} rows={3} defaultValue={editor.plan?.descriptionAr ?? ''} className={`${inputClass} py-3 leading-6`} />
                </label>
              </div>

              <fieldset>
                <legend className="text-sm font-black text-white">رصيد الخطة وحدودها</legend>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs font-bold text-white/65">مدة الصلاحية بالأيام *<input name="validityDays" type="number" min={1} max={3650} required readOnly={termsLocked} aria-readonly={termsLocked || undefined} defaultValue={editor.plan?.validityDays ?? 30} className={inputClass} /></label>
                  <label className="text-xs font-bold text-white/65">عدد الزيارات *<input name="visitCount" type="number" min={1} max={10_000} required readOnly={termsLocked} aria-readonly={termsLocked || undefined} defaultValue={editor.plan?.visitCount ?? 4} className={inputClass} /></label>
                  <label className="text-xs font-bold text-white/65">السيارات المسموحة *<input name="allowedVehicleCount" type="number" min={1} max={50} required readOnly={termsLocked} aria-readonly={termsLocked || undefined} defaultValue={editor.plan?.allowedVehicleCount ?? 1} className={inputClass} /></label>
                  <label className="text-xs font-bold text-white/65">أقصى أيام تجميد *<input key={`${editor.plan?.id ?? 'new'}:${freezeAllowed}`} name="maxFreezeDays" type="number" min={freezeAllowed ? 1 : 0} max={3650} required defaultValue={freezeAllowed ? (editor.plan?.maxFreezeDays || 7) : 0} disabled={termsLocked || !freezeAllowed} className={inputClass} /></label>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 text-xs font-bold text-white/70">
                    <input name="freezeAllowed" type="checkbox" disabled={termsLocked} defaultChecked={editor.plan?.freezeAllowed ?? false} onChange={(event) => setFreezeAllowed(event.target.checked)} className="size-4 accent-[#d4af37] disabled:opacity-45" />
                    السماح بتجميد الاشتراك
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 text-xs font-bold text-white/70">
                    <input name="active" type="checkbox" disabled={reactivationLocked} defaultChecked={editor.plan?.active ?? true} className="size-4 accent-[#d4af37] disabled:opacity-45" />
                    الخطة نشطة ومتاحة للبيع
                  </label>
                </div>
              </fieldset>

              <div className="grid gap-5 lg:grid-cols-2">
                <fieldset className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <legend className="px-2 text-sm font-black text-white">الخدمات المشمولة *</legend>
                  <p className="mb-3 text-[11px] leading-5 text-white/35">اختر خدمة واحدة على الأقل. الخدمة المتوقفة لا يمكن نشرها داخل خطة نشطة.</p>
                  <label className="mb-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[#d4af37]/20 bg-[#d4af37]/[0.05] px-3 text-xs font-bold text-[#efe2a7]">
                    <input type="checkbox" checked={useServiceQuotas} disabled={termsLocked} onChange={(event) => setUseServiceQuotas(event.target.checked)} className="size-4 accent-[#d4af37] disabled:opacity-45" />
                    توزيع الزيارات على كل خدمة بشكل مستقل
                  </label>
                  {useServiceQuotas ? <p className="mb-3 text-[11px] leading-5 text-white/40">اكتب رصيد كل خدمة؛ مجموع الأرصدة يجب أن يساوي عدد زيارات الباقة. عطّل الخيار لباقة برصيد مشترك بين الخدمات.</p> : null}
                  <div className="grid max-h-56 gap-2 overflow-y-auto pe-1 sm:grid-cols-2">
                    {services.map((service) => (
                      <div key={service.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 text-xs text-white/70">
                        <input
                          name="serviceIds"
                          value={service.id}
                          type="checkbox"
                          disabled={termsLocked || !service.subscriptionEligible}
                          checked={selectedServiceIds.includes(service.id)}
                          onChange={(event) => toggleService(service.id, event.target.checked)}
                          className="size-4 shrink-0 accent-[#d4af37] disabled:opacity-40"
                        />
                        <span className="min-w-0 flex-1 truncate">{service.nameAr}</span>
                        {useServiceQuotas && selectedServiceIds.includes(service.id) ? (
                          <input
                            key={`${editor.plan?.id ?? 'new'}:${service.id}:${selectedServiceIds.length}`}
                            name={`serviceQuota:${service.id}`}
                            type="number"
                            min={1}
                            max={10_000}
                            required
                            aria-label={`رصيد ${service.nameAr}`}
                            defaultValue={editor.plan?.serviceQuotas[service.id] ?? (selectedServiceIds.length === 1 ? (editor.plan?.visitCount ?? 4) : 1)}
                            disabled={termsLocked}
                            className="h-9 w-16 rounded-lg border border-white/10 bg-black/30 px-2 text-center text-xs font-bold text-[#efe2a7] outline-none focus:border-[#d4af37] disabled:opacity-45"
                          />
                        ) : null}
                        {!service.subscriptionEligible ? <span className="text-[9px] text-red-300">غير مؤهلة</span> : !service.active ? <span className="text-[9px] text-amber-300">متوقفة</span> : null}
                      </div>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <legend className="px-2 text-sm font-black text-white">الفروع المتاحة *</legend>
                  <p className="mb-3 text-[11px] leading-5 text-white/35">حدد الفروع التي يمكن شراء الخطة واستخدامها فيها.</p>
                  <div className="grid max-h-56 gap-2 overflow-y-auto pe-1 sm:grid-cols-2">
                    {branches.map((branch) => (
                      <label key={branch.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 text-xs text-white/70">
                        <input name="branchIds" value={branch.id} type="checkbox" disabled={termsLocked} defaultChecked={editor.plan?.branchIds.includes(branch.id) ?? false} className="size-4 shrink-0 accent-[#d4af37] disabled:opacity-45" />
                        <span className="min-w-0 flex-1 truncate">{branch.nameAr}</span>
                        {branch.status !== 'ACTIVE' ? <span className="text-[9px] text-amber-300">غير نشط</span> : null}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <label className="text-xs font-bold text-white/70">
                  قواعد إضافية بصيغة JSON
                  <textarea
                    name="rules"
                    maxLength={20_000}
                    rows={7}
                    dir="ltr"
                    spellCheck={false}
                    defaultValue={editor.plan?.rules ?? '{}'}
                    readOnly={termsLocked}
                    aria-readonly={termsLocked || undefined}
                    className={`${inputClass} py-3 font-mono text-xs leading-6`}
                  />
                  <span className="mt-2 block font-normal leading-5 text-white/30">مثال: {`{ "advanceBookingHours": 24, "weekendsAllowed": true }`}</span>
                </label>
                <label className="text-xs font-bold text-white/70">
                  سبب الإنشاء أو التعديل *
                  <textarea name="reason" required minLength={3} maxLength={500} rows={7} placeholder="وثّق لماذا أُنشئت الخطة أو ما الذي تغير فيها." className={`${inputClass} py-3 leading-6`} />
                </label>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setEditor(null)} disabled={isPending} className={secondaryButtonClass}>إلغاء</button>
                <button type="submit" disabled={isPending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-6 text-xs font-black text-[#151007] transition hover:bg-[#e4c762] focus:outline-none focus:ring-2 focus:ring-[#f5dc86] disabled:cursor-wait disabled:opacity-50">
                  <BadgeCheck className="size-4" aria-hidden="true" />
                  {isPending ? 'جارٍ الحفظ…' : editor.plan ? 'حفظ التعديلات' : 'إنشاء الخطة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {safetyAction ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/90 p-4 backdrop-blur-sm"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !isPending) setSafetyAction(null);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="plan-safety-title" className="w-full max-w-lg rounded-3xl border border-red-500/25 bg-[#111] p-5 shadow-2xl sm:p-6">
            <span className="grid size-12 place-items-center rounded-2xl border border-red-500/25 bg-red-500/10 text-red-300">
              {safetyAction.mode === 'DEACTIVATE' ? <Archive className="size-5" aria-hidden="true" /> : <ShieldAlert className="size-5" aria-hidden="true" />}
            </span>
            <h2 id="plan-safety-title" className="mt-4 text-xl font-black text-white">
              {safetyAction.mode === 'DEACTIVATE' ? 'تعطيل بيع الخطة' : 'حذف الخطة نهائيًا'}
            </h2>
            <p className="mt-3 text-sm leading-7 text-white/55">
              {safetyAction.mode === 'DEACTIVATE'
                ? `لن تظهر «${safetyAction.plan.nameAr}» للشراء الجديد، وستظل اشتراكات العملاء وسجلاتها محفوظة.`
                : `هذا الإجراء متاح لأن «${safetyAction.plan.nameAr}» غير نشطة ولم تُستخدم في أي اشتراك. سيحذف تعريفها وعلاقاتها نهائيًا.`}
            </p>

            <form onSubmit={submitSafetyAction} className="mt-5 space-y-4">
              <input type="hidden" name="planId" value={safetyAction.plan.id} />
              <input type="hidden" name="mode" value={safetyAction.mode} />
              {feedback?.kind === 'error' ? (
                <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200">
                  {feedback.text}
                </p>
              ) : null}
              {safetyAction.mode === 'DELETE_UNLINKED' ? (
                <label className="block text-xs font-bold text-white/70">
                  اكتب اسم الخطة للتأكيد: <span className="text-red-300">{safetyAction.plan.nameAr}</span>
                  <input name="confirmation" required autoComplete="off" autoFocus className={inputClass} />
                </label>
              ) : null}
              <label className="block text-xs font-bold text-white/70">
                سبب الإجراء *
                <textarea name="reason" required minLength={3} maxLength={500} rows={4} autoFocus={safetyAction.mode === 'DEACTIVATE'} className={`${inputClass} py-3 leading-6`} />
              </label>
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setSafetyAction(null)} disabled={isPending} className={secondaryButtonClass}>تراجع</button>
                <button type="submit" disabled={isPending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-500 px-5 text-xs font-black text-white transition hover:bg-red-400 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-wait disabled:opacity-50">
                  {safetyAction.mode === 'DEACTIVATE' ? <Archive className="size-4" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                  {isPending ? 'جارٍ التنفيذ…' : safetyAction.mode === 'DEACTIVATE' ? 'تعطيل الخطة' : 'حذف نهائي موثق'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
