'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { ArrowLeft, Car, Check, LoaderCircle } from 'lucide-react';
import { requestSubscriptionPurchaseAction } from '@/app/actions/subscription';

export interface SubscriptionPlanOption {
  id: string;
  nameAr: string;
  descriptionAr: string;
  price: number;
  validityDays: number;
  visitCount: number;
  allowedVehicleCount: number;
  serviceQuotas: Array<{ nameAr: string; visitQuota: number | null }>;
}

export interface SubscriptionVehicleOption {
  id: string;
  label: string;
}

interface Props {
  plans: SubscriptionPlanOption[];
  vehicles: SubscriptionVehicleOption[];
  initialPlanId?: string;
  idempotencyKey: string;
}

const moneyFormatter = new Intl.NumberFormat('ar-EG');

export default function SubscriptionPurchaseForm({
  plans,
  vehicles,
  initialPlanId,
  idempotencyKey,
}: Props) {
  const router = useRouter();
  const firstPlanId = plans.some(({ id }) => id === initialPlanId)
    ? initialPlanId as string
    : plans[0]?.id ?? '';
  const [planId, setPlanId] = useState(firstPlanId);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>(
    vehicles[0] ? [vehicles[0].id] : [],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedPlan = plans.find(({ id }) => id === planId) ?? plans[0];
  function toggleVehicle(vehicleId: string): void {
    setMessage(null);
    setSelectedVehicleIds((current) => {
      if (current.includes(vehicleId)) return current.filter((id) => id !== vehicleId);
      if (!selectedPlan || current.length >= selectedPlan.allowedVehicleCount) return current;
      return [...current, vehicleId];
    });
  }

  function submitPurchase(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setMessage(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await requestSubscriptionPurchaseAction(formData);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      if (result.subscriptionId) {
        router.push(`/account/subscriptions/${result.subscriptionId}`);
        router.refresh();
      }
    });
  }

  if (plans.length === 0) return null;

  return (
    <section
      className="overflow-hidden rounded-[2rem] border border-[#c9a227]/35 bg-[#11100d] shadow-[0_24px_80px_rgba(0,0,0,.35)]"
      aria-labelledby="purchase-subscription-title"
    >
      <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative border-b border-[#c9a227]/20 p-6 sm:p-8 lg:border-b-0 lg:border-l">
          <div className="absolute inset-y-6 left-0 w-px bg-gradient-to-b from-transparent via-[#e5c45a]/60 to-transparent" aria-hidden="true" />
          <p className="text-[11px] font-bold tracking-[0.18em] text-[#e5c45a]">طلب اشتراك يدوي</p>
          <h2 id="purchase-subscription-title" className="mt-3 text-2xl font-black text-white sm:text-3xl">
            اختر رصيد العناية المناسب
          </h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-neutral-400">
            أرسل الطلب الآن، ثم يراجع فريق بريق الدفع اليدوي ويفعّل الباقة. لن تُخصم أي زيارة عند الحجز؛ الخصم بعد اكتمال الخدمة فقط.
          </p>

          {selectedPlan ? (
            <div className="mt-7 rounded-2xl border border-dashed border-[#c9a227]/45 bg-black/25 p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-neutral-500">الباقة المختارة</p>
                  <p className="mt-1 font-bold text-[#f1d77a]">{selectedPlan.nameAr}</p>
                </div>
                <p className="text-2xl font-black text-white">
                  {moneyFormatter.format(selectedPlan.price)} <span className="text-xs font-medium text-neutral-500">ج.م</span>
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2" aria-label={`${selectedPlan.visitCount} زيارات مشمولة`}>
                {Array.from({ length: selectedPlan.visitCount }, (_, index) => (
                  <span
                    key={index}
                    className="grid size-8 place-items-center rounded-full border border-[#c9a227]/45 bg-[#c9a227]/10 text-[10px] font-black text-[#e5c45a]"
                  >
                    {index + 1}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-xs text-neutral-500">
                صلاحية {selectedPlan.validityDays} يومًا · حتى {selectedPlan.allowedVehicleCount} سيارة
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-neutral-400">
                {selectedPlan.serviceQuotas.map(({ nameAr, visitQuota }) => (
                  <span key={nameAr} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">
                    {nameAr}{visitQuota !== null ? `: ${visitQuota}` : ''}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <form onSubmit={submitPurchase} className="space-y-5 p-6 sm:p-8">
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

          <label className="block space-y-2 text-sm font-bold text-neutral-200">
            <span>الخطة</span>
            <select
              name="planId"
              value={planId}
              onChange={(event) => {
                setPlanId(event.target.value);
                setSelectedVehicleIds(vehicles[0] ? [vehicles[0].id] : []);
                setMessage(null);
              }}
              className="min-h-12 w-full rounded-xl border border-neutral-700 bg-[#080808] px-4 text-sm text-white outline-none transition focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20"
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.nameAr}</option>
              ))}
            </select>
          </label>

          <p className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-xs leading-6 text-sky-100">
            يحدد النظام الفرع تلقائيًا من أحدث حجز مؤهل لك، أو من أول فرع نشط متاح للخطة. لن تحتاج إلى اختيار فرع يدويًا.
          </p>

          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-neutral-200">
              السيارات المرتبطة <span className="font-normal text-neutral-500">(بحد أقصى {selectedPlan?.allowedVehicleCount ?? 1})</span>
            </legend>
            {vehicles.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {vehicles.map((vehicle) => {
                  const checked = selectedVehicleIds.includes(vehicle.id);
                  const disabled = !checked && selectedVehicleIds.length >= (selectedPlan?.allowedVehicleCount ?? 1);
                  return (
                    <label
                      key={vehicle.id}
                      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 text-xs transition ${
                        checked
                          ? 'border-[#c9a227]/60 bg-[#c9a227]/10 text-white'
                          : 'border-neutral-800 bg-[#080808] text-neutral-400'
                      } ${disabled ? 'cursor-not-allowed opacity-45' : 'hover:border-[#c9a227]/40'}`}
                    >
                      <input
                        type="checkbox"
                        name="vehicleIds"
                        value={vehicle.id}
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleVehicle(vehicle.id)}
                        className="sr-only"
                      />
                      <span className={`grid size-6 place-items-center rounded-full border ${checked ? 'border-[#c9a227] bg-[#c9a227] text-black' : 'border-neutral-700'}`}>
                        {checked ? <Check className="size-3.5" aria-hidden="true" /> : <Car className="size-3.5" aria-hidden="true" />}
                      </span>
                      <span>{vehicle.label}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <Link href="/account/vehicles" className="flex min-h-12 items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 text-xs font-bold text-amber-200">
                أضف سيارة قبل طلب الاشتراك
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Link>
            )}
          </fieldset>

          {message ? (
            <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isPending || vehicles.length === 0 || selectedVehicleIds.length === 0}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl gold-gradient px-5 text-sm font-black text-[#080808] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#e5c45a] focus:ring-offset-2 focus:ring-offset-[#11100d] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isPending ? 'جارٍ إرسال الطلب…' : 'إرسال طلب الشراء والتفعيل'}
          </button>
        </form>
      </div>
    </section>
  );
}
