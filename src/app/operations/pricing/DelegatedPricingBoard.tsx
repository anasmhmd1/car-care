'use client';

import { FormEvent, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, BadgeDollarSign, Building2, Home, Save } from 'lucide-react';
import { updateDelegatedServicePriceAction } from '@/app/actions/delegated-pricing';

interface PriceService {
  id: string;
  nameAr: string;
  basePrice: number;
  active: boolean;
}

interface BranchPriceService {
  branchServiceId: string;
  serviceId: string;
  nameAr: string;
  basePrice: number;
  priceOverride: number | null;
  active: boolean;
}

interface Props {
  globalServices: PriceService[];
  branches: Array<{
    id: string;
    nameAr: string;
    services: BranchPriceService[];
  }>;
  homeHref?: string;
}

const inputClass = 'w-full rounded-xl border border-neutral-700 bg-[#080808] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20';

export default function DelegatedPricingBoard({ globalServices, branches, homeHref = '/operations' }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  function submitPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await updateDelegatedServicePriceAction(data);
        if (result.error) {
          setFeedback({ tone: 'error', message: result.error });
          return;
        }
        setFeedback({ tone: 'success', message: 'تم تحديث التسعير بنجاح.' });
        router.refresh();
      } catch {
        setFeedback({ tone: 'error', message: 'تعذر حفظ السعر الآن. حاول مجددًا.' });
      }
    });
  }

  return (
    <main className="min-h-screen bg-[#080808] px-4 py-8 text-white sm:px-6">
      <div className="mx-auto max-w-5xl space-y-7">
        <header className="rounded-3xl border border-[#c9a227]/35 bg-[#141414] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link
              href={homeHref}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 px-3.5 py-2 text-xs font-bold text-neutral-300 hover:border-[#c9a227]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a227] transition-all"
            >
              <ArrowRight className="size-4" aria-hidden="true" />
              {homeHref === '/admin' ? 'العودة للوحة المالك' : 'العودة للتشغيل'}
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-bold text-white/75 hover:border-white/20 hover:text-white transition-all"
            >
              <Home className="size-4 text-neutral-400" aria-hidden="true" />
              الصفحة الرئيسية
            </Link>
          </div>
          <div className="mt-6 flex items-start gap-4">
            <span className="rounded-2xl bg-[#c9a227]/10 p-3 text-[#e5c45a]">
              <BadgeDollarSign className="size-7" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold text-[#e5c45a]">نطاق مفوّض ومحكوم بالسجل</p>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">إدارة الأسعار فقط</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-neutral-400">
                لا تتيح هذه الشاشة إنشاء الخدمات أو حذفها أو تغيير الإتاحة أو المدة أو العربون. كل تعديل سعر يُسجل مع المنفّذ والنطاق.
              </p>
            </div>
          </div>
        </header>

        <div aria-live="polite" className="min-h-5">
          {feedback ? (
            <p className={`rounded-xl border px-4 py-3 text-sm ${feedback.tone === 'success' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
              {feedback.message}
            </p>
          ) : null}
        </div>

        {globalServices.length ? (
          <section aria-labelledby="base-prices-title" className="space-y-4 rounded-3xl border border-neutral-800 bg-[#141414] p-5 sm:p-7">
            <div>
              <h2 id="base-prices-title" className="text-xl font-black">الأسعار الأساسية</h2>
              <p className="mt-1 text-xs text-neutral-500">تظهر فقط عند وجود تفويض عالمي صريح.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {globalServices.map((service) => (
                <form key={service.id} onSubmit={submitPrice} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4">
                  <input type="hidden" name="serviceId" value={service.id} />
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor={`base-${service.id}`} className="font-bold">{service.nameAr}</label>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] ${service.active ? 'bg-emerald-500/10 text-emerald-300' : 'bg-neutral-800 text-neutral-400'}`}>
                      {service.active ? 'نشطة' : 'متوقفة'}
                    </span>
                  </div>
                  <div className="mt-4 flex items-end gap-2">
                    <div className="flex-1">
                      <span className="mb-1.5 block text-xs text-neutral-400">السعر الأساسي (ج.م)</span>
                      <input id={`base-${service.id}`} name="price" type="number" min={0} max={1_000_000} defaultValue={service.basePrice} required className={inputClass} />
                    </div>
                    <button type="submit" disabled={isPending} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#c9a227] px-4 text-xs font-black text-black disabled:opacity-50">
                      <Save className="size-4" aria-hidden="true" /> حفظ
                    </button>
                  </div>
                </form>
              ))}
            </div>
          </section>
        ) : null}

        {branches.map((branch) => (
          <section key={branch.id} aria-labelledby={`branch-${branch.id}`} className="space-y-4 rounded-3xl border border-neutral-800 bg-[#141414] p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <Building2 className="size-5 text-[#c9a227]" aria-hidden="true" />
              <div>
                <h2 id={`branch-${branch.id}`} className="text-xl font-black">سعر فرع {branch.nameAr}</h2>
                <p className="mt-1 text-xs text-neutral-500">اترك الحقل فارغًا للعودة إلى السعر الأساسي.</p>
              </div>
            </div>
            {branch.services.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {branch.services.map((service) => (
                  <form key={service.branchServiceId} onSubmit={submitPrice} className="rounded-2xl border border-neutral-800 bg-[#080808] p-4">
                    <input type="hidden" name="serviceId" value={service.serviceId} />
                    <input type="hidden" name="branchId" value={branch.id} />
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor={`branch-price-${service.branchServiceId}`} className="font-bold">{service.nameAr}</label>
                      <span className="text-xs text-neutral-500">الأساسي {service.basePrice} ج.م</span>
                    </div>
                    <div className="mt-4 flex items-end gap-2">
                      <div className="flex-1">
                        <span className="mb-1.5 block text-xs text-neutral-400">سعر الفرع (ج.م)</span>
                        <input id={`branch-price-${service.branchServiceId}`} name="price" type="number" min={0} max={1_000_000} defaultValue={service.priceOverride ?? ''} placeholder={String(service.basePrice)} className={inputClass} />
                      </div>
                      <button type="submit" disabled={isPending} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#c9a227] px-4 text-xs font-black text-black disabled:opacity-50">
                        <Save className="size-4" aria-hidden="true" /> حفظ
                      </button>
                    </div>
                  </form>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-neutral-700 p-8 text-center text-sm text-neutral-500">لا توجد خدمات مرتبطة بهذا الفرع.</p>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
