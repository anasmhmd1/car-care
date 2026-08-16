'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ImagePlus,
  PackagePlus,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  saveCancellationPolicyAction,
  saveServiceAddonAction,
  saveServiceProductAction,
} from '@/app/actions/catalog';
import { prepareImageForUpload } from '@/lib/client/image-upload';

export type VehicleSizeCode = 'SEDAN' | 'CROSSOVER' | 'SUV' | 'LARGE_SUV';

export interface CatalogVariantDto {
  vehicleSize: VehicleSizeCode;
  price: number;
  durationMinutes: number;
  slotCount: number;
  depositValue: number | null;
}

export interface BranchOverrideDto {
  branchId: string;
  active: boolean;
  bookableOnline: boolean;
  priceOverride: number | null;
  durationOverrideMinutes: number | null;
}

export interface CatalogMaterialRequirementDto {
  materialId: string;
  quantity: number;
  required: boolean;
  notes: string | null;
}

export interface CatalogMaterialDto {
  id: string;
  nameAr: string;
  unit: string;
  active: boolean;
}

export interface CatalogServiceDto {
  id: string;
  cancellationPolicyId: string;
  nameAr: string;
  nameEn: string | null;
  slug: string;
  shortDescriptionAr: string;
  fullDescriptionAr: string;
  coverImage: string;
  galleryImages: string[];
  includedItems: string[];
  excludedItems: string[];
  benefits: string[];
  preparationInstructions: string | null;
  basePrice: number;
  priceType: string;
  durationMinutes: number;
  slotCount: number;
  requiredTeamSize: number;
  requiresDeposit: boolean;
  depositType: string;
  depositValue: number;
  requiresFullPrepayment: boolean;
  active: boolean;
  bookableOnline: boolean;
  subscriptionEligible: boolean;
  minimumBeforePhotos: number;
  minimumAfterPhotos: number;
  variants: CatalogVariantDto[];
  addonIds: string[];
  branchOverrides: BranchOverrideDto[];
  materialRequirements: CatalogMaterialRequirementDto[];
}

export interface CatalogCancellationPolicyDto {
  id: string;
  code: string;
  nameAr: string;
  version: string;
  noticeHours: number;
  allowsCancellation: boolean;
  allowsRescheduling: boolean;
  allowsLateRequests: boolean;
  policyTextAr: string;
  active: boolean;
  isDefault: boolean;
  linkedServices: number;
}

export interface CatalogAddonDto {
  id: string;
  nameAr: string;
  nameEn: string | null;
  price: number;
  durationMinutes: number;
  slotCount: number;
  active: boolean;
  linkedServices: number;
}

interface CatalogManagerProps {
  services: CatalogServiceDto[];
  addons: CatalogAddonDto[];
  branches: Array<{ id: string; nameAr: string }>;
  cancellationPolicies: CatalogCancellationPolicyDto[];
  materials: CatalogMaterialDto[];
}

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

const inputClass = 'mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20';
const areaClass = `${inputClass} min-h-28 py-3 leading-6`;
const VEHICLE_SIZES: Array<{ code: VehicleSizeCode; label: string }> = [
  { code: 'SEDAN', label: 'سيدان' },
  { code: 'CROSSOVER', label: 'كروس أوفر' },
  { code: 'SUV', label: 'SUV' },
  { code: 'LARGE_SUV', label: 'SUV كبيرة' },
];

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function responseMessage(value: unknown): { url?: string; error?: string } {
  if (!value || typeof value !== 'object') return { error: 'استجابة رفع غير صالحة.' };
  const record = value as Record<string, unknown>;
  return {
    url: typeof record.url === 'string' ? record.url : undefined,
    error: typeof record.error === 'string' ? record.error : undefined,
  };
}

function NoticeBox({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-xs font-bold ${notice.kind === 'error' ? 'border-red-400/30 bg-red-400/10 text-red-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'}`}>{notice.text}</p>;
}

function ProductEditor({ service, addons, branches, cancellationPolicies, materials }: {
  service?: CatalogServiceDto;
  addons: CatalogAddonDto[];
  branches: Array<{ id: string; nameAr: string }>;
  cancellationPolicies: CatalogCancellationPolicyDto[];
  materials: CatalogMaterialDto[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [coverImage, setCoverImage] = useState(service?.coverImage ?? '/images/service-care.svg');
  const [galleryImages, setGalleryImages] = useState(service?.galleryImages ?? []);
  const [variants, setVariants] = useState<CatalogVariantDto[]>(service?.variants ?? []);
  const [addonIds, setAddonIds] = useState<string[]>(service?.addonIds ?? []);
  const [branchOverrides, setBranchOverrides] = useState<BranchOverrideDto[]>(service?.branchOverrides ?? []);
  const [materialRequirements, setMaterialRequirements] = useState<CatalogMaterialRequirementDto[]>(service?.materialRequirements ?? []);
  const [depositType, setDepositType] = useState<string>(service?.depositType ?? 'PERCENTAGE');
  const [isUploading, setIsUploading] = useState(false);

  function variantFor(size: VehicleSizeCode) {
    return variants.find((variant) => variant.vehicleSize === size);
  }

  function toggleVariant(size: VehicleSizeCode, enabled: boolean) {
    setVariants((current) => enabled
      ? [...current, { vehicleSize: size, price: service?.basePrice ?? 0, durationMinutes: service?.durationMinutes ?? 60, slotCount: 1, depositValue: null }]
      : current.filter((variant) => variant.vehicleSize !== size));
  }

  function updateVariant(size: VehicleSizeCode, patch: Partial<CatalogVariantDto>) {
    setVariants((current) => current.map((variant) => variant.vehicleSize === size ? { ...variant, ...patch } : variant));
  }

  function toggleBranch(branchId: string, enabled: boolean) {
    setBranchOverrides((current) => enabled
      ? [...current, { branchId, active: true, bookableOnline: true, priceOverride: null, durationOverrideMinutes: null }]
      : current.filter((override) => override.branchId !== branchId));
  }

  function updateBranch(branchId: string, patch: Partial<BranchOverrideDto>) {
    setBranchOverrides((current) => current.map((override) => override.branchId === branchId ? { ...override, ...patch } : override));
  }

  function materialRequirementFor(materialId: string) {
    return materialRequirements.find((requirement) => requirement.materialId === materialId);
  }

  function toggleMaterialRequirement(materialId: string, enabled: boolean) {
    setMaterialRequirements((current) => enabled
      ? [...current, { materialId, quantity: 1, required: true, notes: null }]
      : current.filter((requirement) => requirement.materialId !== materialId));
  }

  function updateMaterialRequirement(materialId: string, patch: Partial<CatalogMaterialRequirementDto>) {
    setMaterialRequirements((current) => current.map((requirement) => (
      requirement.materialId === materialId ? { ...requirement, ...patch } : requirement
    )));
  }

  async function uploadImages(files: FileList | null, mode: 'cover' | 'gallery') {
    if (!files?.length) return;
    setIsUploading(true);
    setNotice(null);
    try {
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files).slice(0, mode === 'cover' ? 1 : 10)) {
        const preparedFile = await prepareImageForUpload(file, { maxDimension: 2200, quality: 0.86 });
        const data = new FormData();
        data.set('file', preparedFile);
        const response = await fetch('/api/catalog-media', { method: 'POST', body: data });
        const payload = responseMessage(await response.json());
        if (!response.ok || !payload.url) throw new Error(payload.error ?? 'تعذر رفع الصورة.');
        uploadedUrls.push(payload.url);
      }
      if (mode === 'cover') setCoverImage(uploadedUrls[0]);
      else setGalleryImages((current) => [...new Set([...current, ...uploadedUrls])].slice(0, 10));
      setNotice({ kind: 'success', text: 'تم رفع الصورة؛ احفظ الخدمة لتثبيتها في الكتالوج.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر رفع الصورة.' });
    } finally {
      setIsUploading(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set('coverImage', coverImage);
    data.set('galleryImages', JSON.stringify(galleryImages));
    data.set('variants', JSON.stringify(variants));
    data.set('addonIds', JSON.stringify(addonIds));
    data.set('branchOverrides', JSON.stringify(branchOverrides));
    data.set('materialRequirements', JSON.stringify(materialRequirements));
    setNotice(null);
    startTransition(async () => {
      const result = await saveServiceProductAction(data);
      if (result.error) {
        setNotice({ kind: 'error', text: result.error });
        return;
      }
      setNotice({ kind: 'success', text: result.message ?? 'تم حفظ الخدمة.' });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-7" aria-label={service ? `تعديل ${service.nameAr}` : 'إضافة خدمة جديدة'}>
      {service ? <input type="hidden" name="serviceId" value={service.id} /> : null}
      <NoticeBox notice={notice} />

      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <h2 className="text-lg font-black">بيانات المنتج والمحتوى</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-bold text-white/70">الاسم بالعربية<input name="nameAr" required minLength={2} defaultValue={service?.nameAr ?? ''} className={inputClass} /></label>
          <label className="text-xs font-bold text-white/70">الاسم بالإنجليزية<input name="nameEn" defaultValue={service?.nameEn ?? ''} className={inputClass} dir="ltr" /></label>
          <label className="text-xs font-bold text-white/70">الرابط المختصر<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={service?.slug ?? ''} className={inputClass} dir="ltr" /></label>
          <label className="text-xs font-bold text-white/70">نوع التسعير<select name="priceType" defaultValue={service?.priceType ?? 'FIXED'} className={inputClass}><option value="FIXED">سعر ثابت</option><option value="STARTS_FROM">يبدأ من</option><option value="VARIANT_BASED">حسب حجم السيارة</option></select></label>
        </div>
        <label className="mt-4 block text-xs font-bold text-white/70">الوصف المختصر<textarea name="shortDescriptionAr" required minLength={5} maxLength={300} defaultValue={service?.shortDescriptionAr ?? ''} className={areaClass} /></label>
        <label className="mt-4 block text-xs font-bold text-white/70">الوصف الكامل<textarea name="fullDescriptionAr" required minLength={10} maxLength={5000} defaultValue={service?.fullDescriptionAr ?? ''} className={`${areaClass} min-h-40`} /></label>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-xs font-bold text-white/70">المشمول — سطر لكل عنصر<textarea name="includedItems" defaultValue={service?.includedItems.join('\n') ?? ''} className={areaClass} /></label>
          <label className="text-xs font-bold text-white/70">غير المشمول<textarea name="excludedItems" defaultValue={service?.excludedItems.join('\n') ?? ''} className={areaClass} /></label>
          <label className="text-xs font-bold text-white/70">مميزات الخدمة الرئيسية (تظهر في الكتالوج وصفحة الخدمة — سطر لكل ميزة)<textarea name="benefits" placeholder="عناية متنقلة لباب بيتك&#10;مواد متخصصة فائقة الجودة&#10;توثيق دقيق قبل وبعد التنفيذ" defaultValue={service?.benefits.join('\n') ?? ''} className={areaClass} /></label>
        </div>
        <label className="mt-4 block text-xs font-bold text-white/70">تعليمات التحضير<textarea name="preparationInstructions" defaultValue={service?.preparationInstructions ?? ''} className={areaClass} /></label>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <h2 className="flex items-center gap-2 text-lg font-black"><ImagePlus className="size-5 text-[#d4af37]" aria-hidden="true" />صور الخدمة</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-[220px_1fr]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50"><Image src={coverImage} alt="معاينة صورة غلاف الخدمة" width={800} height={450} unoptimized className="aspect-video h-full w-full object-cover" /></div>
          <div className="space-y-3">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/10 px-4 text-xs font-bold text-[#f0d36d] focus-within:ring-2 focus-within:ring-[#d4af37]"><ImagePlus className="size-4" aria-hidden="true" />{isUploading ? 'جارٍ الرفع…' : 'رفع صورة الغلاف'}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={isUploading} onChange={(event) => void uploadImages(event.target.files, 'cover')} /></label>
            <label className="block text-xs font-bold text-white/70">أو رابط HTTPS / مسار محلي<input value={coverImage} onChange={(event) => setCoverImage(event.target.value)} className={inputClass} dir="ltr" /></label>
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-bold text-white/75 focus-within:ring-2 focus-within:ring-[#d4af37]"><Plus className="size-4" aria-hidden="true" />رفع صور المعرض<input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={isUploading} onChange={(event) => void uploadImages(event.target.files, 'gallery')} /></label>
          </div>
        </div>
        {galleryImages.length ? <div className="mt-4 flex flex-wrap gap-2">{galleryImages.map((image) => <button key={image} type="button" title="حذف الصورة من المعرض" onClick={() => setGalleryImages((current) => current.filter((item) => item !== image))} className="relative overflow-hidden rounded-xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-red-400"><Image src={image} alt="صورة من معرض الخدمة" width={120} height={80} unoptimized className="h-16 w-24 object-cover" /><span className="absolute inset-x-0 bottom-0 bg-black/75 py-1 text-[9px] text-red-200">حذف</span></button>)}</div> : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <h2 className="text-lg font-black">السعر والمدة وقواعد التنفيذ</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-bold text-white/70 sm:col-span-2 xl:col-span-4">سياسة الإلغاء
            <select
              name="cancellationPolicyId"
              required
              defaultValue={service?.cancellationPolicyId ?? cancellationPolicies.find((policy) => policy.active && policy.isDefault)?.id ?? cancellationPolicies.find((policy) => policy.active)?.id ?? ''}
              className={inputClass}
            >
              <option value="" disabled>اختر سياسة الإلغاء</option>
              {cancellationPolicies
                .filter((policy) => policy.active || policy.id === service?.cancellationPolicyId)
                .map((policy) => (
                  <option key={policy.id} value={policy.id} disabled={!policy.active}>
                    {policy.nameAr} · {policy.noticeHours} ساعة · إصدار {policy.version}{policy.isDefault ? ' · الافتراضية' : ''}{!policy.active ? ' · متوقفة' : ''}
                  </option>
                ))}
            </select>
            <span className="mt-2 block font-normal leading-5 text-white/40">تُحفظ نسخة ثابتة من هذه السياسة داخل كل حجز جديد.</span>
          </label>
          <label className="text-xs font-bold text-white/70">السعر الأساسي<input name="basePrice" type="number" min="0" required defaultValue={service?.basePrice ?? 0} className={inputClass} /></label>
          <label className="text-xs font-bold text-white/70">المدة بالدقائق<input name="durationMinutes" type="number" min="15" required defaultValue={service?.durationMinutes ?? 60} className={inputClass} /></label>
          <label className="text-xs font-bold text-white/70">عدد الـSlots<input name="slotCount" type="number" min="1" required defaultValue={service?.slotCount ?? 1} className={inputClass} /></label>
          <label className="text-xs font-bold text-white/70">حجم الفريق المطلوب<input name="requiredTeamSize" type="number" min="1" required defaultValue={service?.requiredTeamSize ?? 2} className={inputClass} /></label>
          <label className="text-xs font-bold text-white/70">
            نوع العربون
            <select
              name="depositType"
              value={depositType}
              onChange={(event) => setDepositType(event.target.value)}
              className={inputClass}
            >
              <option value="PERCENTAGE">نسبة مئوية (%)</option>
              <option value="FIXED">مبلغ ثابت (ج.م)</option>
            </select>
          </label>
          <label className="text-xs font-bold text-white/70">
            قيمة العربون {depositType === 'PERCENTAGE' ? '(كنسبة % من السعر)' : '(مبلغ ثابت بالجنيه)'}
            <input
              name="depositValue"
              type="number"
              min="0"
              max={depositType === 'PERCENTAGE' ? 100 : 100000}
              required
              defaultValue={service?.depositValue ?? (depositType === 'PERCENTAGE' ? 30 : 200)}
              placeholder={depositType === 'PERCENTAGE' ? 'مثال: 30' : 'مثال: 200'}
              className={inputClass}
            />
          </label>
          <label className="text-xs font-bold text-white/70">أقل صور قبل<input name="minimumBeforePhotos" type="number" min="0" required defaultValue={service?.minimumBeforePhotos ?? 2} className={inputClass} /></label>
          <label className="text-xs font-bold text-white/70">أقل صور بعد<input name="minimumAfterPhotos" type="number" min="0" required defaultValue={service?.minimumAfterPhotos ?? 2} className={inputClass} /></label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3 text-xs font-bold text-white/75">
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3"><input name="requiresDeposit" type="checkbox" defaultChecked={service?.requiresDeposit ?? true} />يتطلب عربونًا</label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3"><input name="requiresFullPrepayment" type="checkbox" defaultChecked={service?.requiresFullPrepayment ?? false} />دفع كامل مقدمًا (100%)</label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3"><input name="active" type="checkbox" defaultChecked={service?.active ?? true} />نشطة</label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3"><input name="bookableOnline" type="checkbox" defaultChecked={service?.bookableOnline ?? true} />حجز إلكتروني</label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3"><input name="subscriptionEligible" type="checkbox" defaultChecked={service?.subscriptionEligible ?? true} />مشمولة بالاشتراكات</label>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <h2 className="text-lg font-black">Variants حسب حجم السيارة</h2>
        <div className="mt-5 space-y-3">{VEHICLE_SIZES.map(({ code, label }) => { const variant = variantFor(code); return <div key={code} className="rounded-xl border border-white/10 p-4"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={Boolean(variant)} onChange={(event) => toggleVariant(code, event.target.checked)} />{label}</label>{variant ? <div className="mt-3 grid gap-3 sm:grid-cols-4"><label className="text-[11px] text-white/60">السعر<input type="number" min="0" value={variant.price} onChange={(event) => updateVariant(code, { price: Number(event.target.value) })} className={inputClass} /></label><label className="text-[11px] text-white/60">المدة<input type="number" min="15" value={variant.durationMinutes} onChange={(event) => updateVariant(code, { durationMinutes: Number(event.target.value) })} className={inputClass} /></label><label className="text-[11px] text-white/60">Slots<input type="number" min="1" value={variant.slotCount} onChange={(event) => updateVariant(code, { slotCount: Number(event.target.value) })} className={inputClass} /></label><label className="text-[11px] text-white/60">عربون مخصص<input type="number" min="0" value={variant.depositValue ?? ''} onChange={(event) => updateVariant(code, { depositValue: numberOrNull(event.target.value) })} className={inputClass} /></label></div> : null}</div>; })}</div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 xl:col-span-2" aria-labelledby="service-materials-title">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="service-materials-title" className="text-lg font-black">مواد ومستلزمات التنفيذ</h2>
              <p className="mt-1 text-xs leading-5 text-white/50">تُحفظ الكميات والملاحظات مع الخدمة نفسها، وتظهر تلقائيًا للفريق في قائمة تنفيذ الحجز.</p>
            </div>
            <Link href="/operations/resources" className="text-xs font-bold text-[#f0d36d] underline-offset-4 hover:underline">إدارة الأصناف والمخزون</Link>
          </div>

          {materials.length ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {materials.map((material) => {
                const requirement = materialRequirementFor(material.id);
                const canEnable = material.active || Boolean(requirement);
                return (
                  <div key={material.id} className={`rounded-xl border p-4 ${requirement ? 'border-[#d4af37]/35 bg-[#d4af37]/[0.04]' : 'border-white/10 bg-black/20'}`}>
                    <label className="flex min-h-7 items-center gap-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(requirement)}
                        disabled={!canEnable}
                        onChange={(event) => toggleMaterialRequirement(material.id, event.target.checked)}
                      />
                      <span>{material.nameAr}</span>
                      <span className="mr-auto text-[11px] font-normal text-white/45">{material.unit}</span>
                      {!material.active ? <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-100">موقوف</span> : null}
                    </label>
                    {requirement ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-[130px_1fr]">
                        <label className="text-[11px] font-bold text-white/60">الكمية لكل تنفيذ
                          <input
                            type="number"
                            min="1"
                            max="1000000"
                            required
                            value={requirement.quantity}
                            onChange={(event) => updateMaterialRequirement(material.id, { quantity: Number(event.target.value) })}
                            className={inputClass}
                          />
                        </label>
                        <label className="text-[11px] font-bold text-white/60">ملاحظات للفريق (اختياري)
                          <input
                            value={requirement.notes ?? ''}
                            maxLength={1000}
                            onChange={(event) => updateMaterialRequirement(material.id, { notes: event.target.value || null })}
                            className={inputClass}
                          />
                        </label>
                        <label className="flex min-h-10 items-center gap-2 text-[11px] font-bold text-white/70 sm:col-span-2">
                          <input
                            type="checkbox"
                            checked={requirement.required}
                            onChange={(event) => updateMaterialRequirement(material.id, { required: event.target.checked })}
                          />
                          مادة إلزامية قبل بدء التنفيذ
                        </label>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-white/15 p-5 text-sm leading-7 text-white/55">
              لا توجد أصناف مواد بعد. أضف الأصناف من إدارة الموارد ثم ارجع لتحديد المواد المطلوبة للخدمة.
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h2 className="text-lg font-black">الإضافات المتاحة</h2><div className="mt-4 space-y-2">{addons.length ? addons.map((addon) => <label key={addon.id} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/10 px-3 text-xs"><span className="flex items-center gap-2"><input type="checkbox" checked={addonIds.includes(addon.id)} onChange={(event) => setAddonIds((current) => event.target.checked ? [...current, addon.id] : current.filter((id) => id !== addon.id))} />{addon.nameAr}</span><span className="text-[#f0d36d]">{addon.price} ج.م · {addon.durationMinutes} د</span></label>) : <p className="text-xs text-white/45">أنشئ إضافة من القسم أسفل الصفحة أولًا.</p>}</div></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"><h2 className="text-lg font-black">تخصيص الخدمة حسب الفرع</h2><div className="mt-4 space-y-3">{branches.map((branch) => { const override = branchOverrides.find((item) => item.branchId === branch.id); return <div key={branch.id} className="rounded-xl border border-white/10 p-3"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={Boolean(override)} onChange={(event) => toggleBranch(branch.id, event.target.checked)} />{branch.nameAr}</label>{override ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-[11px] text-white/60">سعر مخصص<input type="number" min="0" value={override.priceOverride ?? ''} onChange={(event) => updateBranch(branch.id, { priceOverride: numberOrNull(event.target.value) })} className={inputClass} /></label><label className="text-[11px] text-white/60">مدة مخصصة<input type="number" min="15" value={override.durationOverrideMinutes ?? ''} onChange={(event) => updateBranch(branch.id, { durationOverrideMinutes: numberOrNull(event.target.value) })} className={inputClass} /></label><label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={override.active} onChange={(event) => updateBranch(branch.id, { active: event.target.checked })} />نشطة في الفرع</label><label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={override.bookableOnline} onChange={(event) => updateBranch(branch.id, { bookableOnline: event.target.checked })} />حجز إلكتروني</label></div> : null}</div>; })}</div></div>
      </section>

      <div className="sticky bottom-4 z-20 flex justify-end"><button type="submit" disabled={isPending || isUploading} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#d4af37] px-7 text-sm font-black text-black shadow-2xl disabled:opacity-50"><Save className="size-4" aria-hidden="true" />{isPending ? 'جارٍ الحفظ…' : 'حفظ المنتج كاملًا'}</button></div>
    </form>
  );
}

function CancellationPolicyEditor({ policy }: { policy?: CatalogCancellationPolicyDto }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setNotice(null);
    startTransition(async () => {
      const result = await saveCancellationPolicyAction(data);
      if (result.error) {
        setNotice({ kind: 'error', text: result.error });
        return;
      }
      setNotice({ kind: 'success', text: result.message ?? 'تم حفظ السياسة.' });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-5 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      {policy ? <input type="hidden" name="policyId" value={policy.id} /> : null}
      <NoticeBox notice={notice} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-bold text-white/70">اسم السياسة<input name="nameAr" required minLength={2} maxLength={120} defaultValue={policy?.nameAr ?? ''} className={inputClass} /></label>
        <label className="text-xs font-bold text-white/70">الكود<input name="code" dir="ltr" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={policy?.code ?? ''} className={inputClass} /></label>
        <label className="text-xs font-bold text-white/70">الإصدار<input name="version" dir="ltr" required maxLength={50} defaultValue={policy?.version ?? '2026-08-01'} className={inputClass} /></label>
        <label className="text-xs font-bold text-white/70">مهلة الإلغاء بالساعات<input name="noticeHours" type="number" min="0" max="720" required defaultValue={policy?.noticeHours ?? 6} className={inputClass} /></label>
      </div>
      <label className="block text-xs font-bold text-white/70">النص العربي المعتمد
        <textarea name="policyTextAr" required minLength={20} maxLength={10000} defaultValue={policy?.policyTextAr ?? ''} className={`${areaClass} min-h-36`} />
      </label>
      <div className="flex flex-wrap gap-3 text-xs font-bold text-white/75">
        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3"><input name="allowsCancellation" type="checkbox" defaultChecked={policy?.allowsCancellation ?? true} />تسمح بطلب الإلغاء</label>
        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3"><input name="allowsRescheduling" type="checkbox" defaultChecked={policy?.allowsRescheduling ?? true} />تسمح بطلب تعديل الموعد</label>
        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3"><input name="allowsLateRequests" type="checkbox" defaultChecked={policy?.allowsLateRequests ?? true} />تسمح بطلب متأخر للمراجعة</label>
        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3"><input name="active" type="checkbox" defaultChecked={policy?.active ?? true} />نشطة</label>
        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3"><input name="isDefault" type="checkbox" defaultChecked={policy?.isDefault ?? false} />السياسة الافتراضية العامة</label>
      </div>
      {policy ? <p className="text-xs text-white/40">مرتبطة حاليًا بـ {policy.linkedServices} خدمة. تعديلها يؤثر في الحجوزات الجديدة فقط؛ الحجوزات السابقة تحتفظ بنسختها.</p> : null}
      <div className="flex justify-end border-t border-white/10 pt-4">
        <button type="submit" disabled={isPending} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#d4af37]/35 px-5 text-xs font-bold text-[#f0d36d] disabled:opacity-50"><Save className="size-4" aria-hidden="true" />{isPending ? 'جارٍ الحفظ…' : 'حفظ السياسة'}</button>
      </div>
    </form>
  );
}

function AddonEditor({ addon }: { addon?: CatalogAddonDto }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(null);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await saveServiceAddonAction(data);
      if (result.error) setNotice({ kind: 'error', text: result.error });
      else { setNotice({ kind: 'success', text: result.message ?? 'تم الحفظ.' }); router.refresh(); }
    });
  }
  return <form onSubmit={submit} className="mt-5 grid gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5 md:grid-cols-6">{addon ? <input type="hidden" name="addonId" value={addon.id} /> : null}<div className="md:col-span-6"><NoticeBox notice={notice} /></div><label className="text-xs font-bold text-white/70 md:col-span-2">اسم الإضافة<input name="nameAr" required defaultValue={addon?.nameAr ?? ''} className={inputClass} /></label><label className="text-xs font-bold text-white/70">السعر<input name="price" type="number" min="0" required defaultValue={addon?.price ?? 0} className={inputClass} /></label><label className="text-xs font-bold text-white/70">الدقائق<input name="durationMinutes" type="number" min="0" required defaultValue={addon?.durationMinutes ?? 15} className={inputClass} /></label><label className="text-xs font-bold text-white/70">Slots<input name="slotCount" type="number" min="0" required defaultValue={addon?.slotCount ?? 0} className={inputClass} /></label><div className="flex items-end gap-3"><label className="flex min-h-11 items-center gap-2 text-xs"><input name="active" type="checkbox" defaultChecked={addon?.active ?? true} />نشطة</label><button type="submit" disabled={isPending} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#d4af37]/35 px-4 text-xs font-bold text-[#f0d36d]"><Save className="size-4" aria-hidden="true" />حفظ</button></div></form>;
}

export default function CatalogManager({ services, addons, branches, cancellationPolicies, materials }: CatalogManagerProps) {
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(services[0]?.id ?? null);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(cancellationPolicies.find((policy) => policy.isDefault)?.id ?? cancellationPolicies[0]?.id ?? null);
  const [selectedAddonId, setSelectedAddonId] = useState<string | null>(null);
  const selectedService = useMemo(() => services.find((service) => service.id === selectedServiceId), [services, selectedServiceId]);
  const selectedPolicy = useMemo(() => cancellationPolicies.find((policy) => policy.id === selectedPolicyId), [cancellationPolicies, selectedPolicyId]);
  const selectedAddon = useMemo(() => addons.find((addon) => addon.id === selectedAddonId), [addons, selectedAddonId]);

  return (
    <div className="min-h-screen bg-[#080808] text-white" dir="rtl">
      <main className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/admin?section=services" className="inline-flex items-center gap-2 text-xs font-bold text-[#d4af37]">
              <ArrowRight className="size-4" aria-hidden="true" />
              العودة إلى لوحة المالك
            </Link>
            <p className="mt-5 flex items-center gap-2 text-xs font-bold text-[#d4af37]">
              <Sparkles className="size-4" aria-hidden="true" />
              كتالوج بريق التشغيلي
            </p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">الخدمات كمنتجات متكاملة</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-white/50">
              المحتوى والصور والتسعير والمدة والعربون والـVariants والإضافات وإعداد كل فرع تُحفظ في معاملة واحدة موثقة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/site?tab=collections"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/10 px-4 text-xs font-bold text-[#f0d36d] hover:bg-[#d4af37]/20 transition-all"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              <span>إدارة مجموعات العناية (الكوليكشن)</span>
            </Link>
            <button type="button" onClick={() => setSelectedServiceId(null)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-5 text-xs font-black text-black">
              <PackagePlus className="size-4" aria-hidden="true" />
              منتج جديد
            </button>
          </div>
        </header>

        <div className="mt-7 grid gap-7 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-2 xl:sticky xl:top-5 xl:self-start" aria-label="قائمة الخدمات"><button type="button" onClick={() => setSelectedServiceId(null)} className={`w-full rounded-xl border p-3 text-right text-sm font-bold ${selectedServiceId === null ? 'border-[#d4af37]/50 bg-[#d4af37]/10 text-[#f0d36d]' : 'border-white/10 text-white/60'}`}>+ خدمة جديدة</button>{services.map((service) => <button key={service.id} type="button" onClick={() => setSelectedServiceId(service.id)} className={`w-full rounded-xl border p-3 text-right transition ${selectedServiceId === service.id ? 'border-[#d4af37]/50 bg-[#d4af37]/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}><span className="block truncate text-sm font-bold">{service.nameAr}</span><span className="mt-1 block text-[10px] text-white/40">{service.active ? 'نشطة' : 'متوقفة'} · {service.variants.length} variants · {service.addonIds.length} إضافات</span></button>)}</aside>
          <ProductEditor key={selectedService?.id ?? 'new'} service={selectedService} addons={addons.filter((addon) => addon.active || selectedService?.addonIds.includes(addon.id))} branches={branches} cancellationPolicies={cancellationPolicies} materials={materials} />
        </div>

        <section className="mt-12 border-t border-white/10 pt-8" aria-labelledby="cancellation-policies-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="flex items-center gap-2 text-xs font-bold text-[#d4af37]"><ShieldCheck className="size-4" aria-hidden="true" />قواعد محفوظة لكل حجز</p><h2 id="cancellation-policies-title" className="mt-1 text-2xl font-black">إدارة سياسات الإلغاء</h2></div>
            <button type="button" onClick={() => setSelectedPolicyId(null)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-bold"><Plus className="size-4" aria-hidden="true" />سياسة جديدة</button>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {cancellationPolicies.map((policy) => (
              <button key={policy.id} type="button" onClick={() => setSelectedPolicyId(policy.id)} className={`rounded-xl border px-3 py-2 text-xs ${selectedPolicyId === policy.id ? 'border-[#d4af37]/50 bg-[#d4af37]/10 text-[#f0d36d]' : 'border-white/10 text-white/60'}`}>
                {policy.nameAr} · {policy.noticeHours} ساعة · {policy.linkedServices} خدمة{policy.isDefault ? ' · افتراضية' : ''}{policy.active ? <CheckCircle2 className="mr-1 inline size-3 text-emerald-300" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
          <CancellationPolicyEditor key={selectedPolicy?.id ?? 'new-policy'} policy={selectedPolicy} />
        </section>

        <section className="mt-12 border-t border-white/10 pt-8" aria-labelledby="addons-title"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold text-[#d4af37]">إضافات مشتركة</p><h2 id="addons-title" className="mt-1 text-2xl font-black">إدارة Add-ons</h2></div><button type="button" onClick={() => setSelectedAddonId(null)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 px-4 text-xs font-bold"><Plus className="size-4" aria-hidden="true" />إضافة جديدة</button></div><div className="mt-5 flex flex-wrap gap-2">{addons.map((addon) => <button key={addon.id} type="button" onClick={() => setSelectedAddonId(addon.id)} className={`rounded-xl border px-3 py-2 text-xs ${selectedAddonId === addon.id ? 'border-[#d4af37]/50 bg-[#d4af37]/10 text-[#f0d36d]' : 'border-white/10 text-white/60'}`}>{addon.nameAr} · {addon.linkedServices} خدمة {addon.active ? <CheckCircle2 className="mr-1 inline size-3 text-emerald-300" aria-hidden="true" /> : null}</button>)}</div><AddonEditor key={selectedAddon?.id ?? 'new-addon'} addon={selectedAddon} /></section>
      </main>
    </div>
  );
}
