'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  ArrowRight,
  ImagePlus,
  PackagePlus,
  Plus,
  Save,
  Sparkles,
} from 'lucide-react';
import { saveServiceProductAction } from '@/app/actions/catalog';
import { prepareImageForUpload } from '@/lib/client/image-upload';
import {
  detectMaterialUnitMeta,
  convertToDatabaseQuantity,
  resolveDisplayQuantityFromDatabase,
} from '@/lib/inventory/units';

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

function ServiceMaterialRequirementField({
  material,
  requirement,
  inputClass,
  onChange,
}: {
  material: { id: string; nameAr: string; unit: string; active: boolean };
  requirement: CatalogMaterialRequirementDto;
  inputClass: string;
  onChange: (patch: Partial<CatalogMaterialRequirementDto>) => void;
}) {
  const meta = useMemo(() => detectMaterialUnitMeta(material.unit), [material.unit]);

  const [selectedSubUnit, setSelectedSubUnit] = useState<string>(() => {
    const resolved = resolveDisplayQuantityFromDatabase(requirement.quantity, material.unit);
    return resolved.subUnit;
  });

  const [displayQty, setDisplayQty] = useState<string>(() => {
    const resolved = resolveDisplayQuantityFromDatabase(requirement.quantity, material.unit);
    return String(resolved.displayValue);
  });

  const currentOption = meta.options.find((opt) => opt.value === selectedSubUnit) ?? meta.options[0];
  const numVal = parseFloat(displayQty);
  const baseQty = Number.isFinite(numVal) && numVal > 0 ? convertToDatabaseQuantity(numVal, selectedSubUnit, material.unit) : 0;

  function handleSubUnitChange(newSubUnit: string) {
    if (newSubUnit === selectedSubUnit) return;
    const oldOption = meta.options.find((opt) => opt.value === selectedSubUnit) ?? meta.options[0];
    const targetOption = meta.options.find((opt) => opt.value === newSubUnit) ?? meta.options[0];

    setSelectedSubUnit(newSubUnit);
    if (Number.isFinite(numVal) && numVal > 0) {
      const inBase = numVal * oldOption.factorToBase;
      const newDisplay = inBase / targetOption.factorToBase;
      const roundedDisplay = Math.round(newDisplay * 1000) / 1000;
      setDisplayQty(String(roundedDisplay));
      onChange({ quantity: convertToDatabaseQuantity(roundedDisplay, newSubUnit, material.unit) });
    }
  }

  function handleQtyChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valStr = e.target.value;
    setDisplayQty(valStr);
    const parsed = parseFloat(valStr);
    if (Number.isFinite(parsed) && parsed > 0) {
      const converted = convertToDatabaseQuantity(parsed, selectedSubUnit, material.unit);
      onChange({ quantity: converted });
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {meta.options.length > 1 ? (
        <div>
          <span className="block mb-1.5 text-[11px] font-bold text-white/70">وحدة قياس الاستهلاك:</span>
          <div className="flex flex-wrap gap-1.5">
            {meta.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSubUnitChange(opt.value)}
                className={`rounded-lg px-3 py-1 text-xs font-bold transition-all cursor-pointer ${
                  selectedSubUnit === opt.value
                    ? 'bg-[#d4af37] text-black shadow-md shadow-[#d4af37]/20 font-black'
                    : 'border border-white/15 bg-white/5 text-white/70 hover:border-white/30'
                }`}
              >
                {opt.labelAr}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <label className="text-[11px] font-bold text-white/60">
          الكمية المستهلكة ({currentOption.shortLabelAr})
          <input
            type="number"
            step="any"
            min="0.0001"
            max="1000000"
            required
            placeholder={currentOption.placeholder}
            value={displayQty}
            onChange={handleQtyChange}
            className={inputClass}
          />
        </label>
        <label className="text-[11px] font-bold text-white/60">
          ملاحظات للفريق (اختياري)
          <input
            value={requirement.notes ?? ''}
            maxLength={1000}
            onChange={(event) =>
              onChange({ notes: event.target.value || null })
            }
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-[11px]">
        <span className="text-white/60">
          خصم المخزون الفعلي: <strong className="text-[#f0d36d]">{baseQty} {meta.baseUnit}</strong> لكل تنفيذ
        </span>
        {meta.options.length > 1 && selectedSubUnit !== meta.options.find((o) => o.factorToBase === 1)?.value ? (
          <span className="text-[10px] text-white/40">
            ({displayQty || '0'} {currentOption.shortLabelAr} = {baseQty} {meta.baseUnit})
          </span>
        ) : null}
      </div>

      <label className="flex min-h-8 items-center gap-2 text-[11px] font-bold text-white/70 cursor-pointer">
        <input
          type="checkbox"
          checked={requirement.required}
          onChange={(event) =>
            onChange({ required: event.target.checked })
          }
        />
        مادة إلزامية قبل بدء التنفيذ
      </label>
    </div>
  );
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
  branchOverrides: BranchOverrideDto[];
  materialRequirements: CatalogMaterialRequirementDto[];
}

export interface CatalogManagerProps {
  services: CatalogServiceDto[];
  branches: Array<{ id: string; nameAr: string; slotUnitMinutes?: number }>;
  materials: CatalogMaterialDto[];
  initialServiceId?: string | null;
  isNew?: boolean;
}

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

const inputClass = 'mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20';
const areaClass = `${inputClass} min-h-28 py-3 leading-6`;

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
  return (
    <p
      role={notice.kind === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border p-3 text-xs font-bold ${
        notice.kind === 'error'
          ? 'border-red-400/30 bg-red-400/10 text-red-200'
          : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
      }`}
    >
      {notice.text}
    </p>
  );
}

function formatDurationArabic(minutes: number): string {
  if (minutes === 15) return 'ربع ساعة';
  if (minutes === 30) return 'نصف ساعة';
  if (minutes === 45) return '45 دقيقة';
  if (minutes === 60) return 'ساعة واحدة';
  if (minutes === 90) return 'ساعة ونصف';
  if (minutes === 120) return 'ساعتان';
  if (minutes === 150) return 'ساعتان ونصف';
  if (minutes === 180) return '3 ساعات';
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) {
    if (hours >= 3 && hours <= 10) return `${hours} ساعات`;
    return `${hours} ساعة`;
  }
  if (rem === 30) {
    if (hours === 1) return 'ساعة ونصف';
    if (hours === 2) return 'ساعتان ونصف';
    return `${hours} ساعات ونصف`;
  }
  return `${hours} س و ${rem} د`;
}

function ProductEditor({
  service,
  branches,
  materials,
  onServiceSaved,
}: {
  service?: CatalogServiceDto;
  branches: Array<{ id: string; nameAr: string; slotUnitMinutes?: number }>;
  materials: CatalogMaterialDto[];
  onServiceSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [coverImage, setCoverImage] = useState(service?.coverImage ?? '/images/service-care.svg');
  const [galleryImages, setGalleryImages] = useState(service?.galleryImages ?? []);
  const [branchOverrides, setBranchOverrides] = useState<BranchOverrideDto[]>(service?.branchOverrides ?? []);
  const [materialRequirements, setMaterialRequirements] = useState<CatalogMaterialRequirementDto[]>(service?.materialRequirements ?? []);
  const [depositType, setDepositType] = useState<string>(service?.depositType ?? 'FIXED');
  const [isUploading, setIsUploading] = useState(false);

  function toggleBranch(branchId: string, enabled: boolean) {
    const branch = branches.find((b) => b.id === branchId);
    const branchSlot = branch?.slotUnitMinutes || 30;
    const defaultMins = 2 * branchSlot;
    setBranchOverrides((current) =>
      enabled
        ? [
            ...current,
            {
              branchId,
              active: true,
              bookableOnline: true,
              priceOverride: null,
              durationOverrideMinutes: defaultMins,
            },
          ]
        : current.filter((override) => override.branchId !== branchId),
    );
  }

  function updateBranch(branchId: string, patch: Partial<BranchOverrideDto>) {
    setBranchOverrides((current) =>
      current.map((override) => (override.branchId === branchId ? { ...override, ...patch } : override)),
    );
  }

  function materialRequirementFor(materialId: string) {
    return materialRequirements.find((requirement) => requirement.materialId === materialId);
  }

  function toggleMaterialRequirement(materialId: string, enabled: boolean) {
    setMaterialRequirements((current) =>
      enabled
        ? [...current, { materialId, quantity: 1, required: true, notes: null }]
        : current.filter((requirement) => requirement.materialId !== materialId),
    );
  }

  function updateMaterialRequirement(materialId: string, patch: Partial<CatalogMaterialRequirementDto>) {
    setMaterialRequirements((current) =>
      current.map((requirement) =>
        requirement.materialId === materialId ? { ...requirement, ...patch } : requirement,
      ),
    );
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
    data.set('variants', JSON.stringify([]));
    data.set('addonIds', JSON.stringify([]));
    data.set('branchOverrides', JSON.stringify(branchOverrides.map((item) => ({
      ...item,
      priceOverride: null,
    }))));
    data.set('materialRequirements', JSON.stringify(materialRequirements));

    // Derive base duration and slot count from the active branches
    const activeOverride =
      branchOverrides.find((o) => o.active && o.durationOverrideMinutes && o.durationOverrideMinutes > 0) ||
      branchOverrides[0];
    const activeBranch = activeOverride ? branches.find((b) => b.id === activeOverride.branchId) : branches[0];
    const branchSlot = activeBranch?.slotUnitMinutes || 30;
    const fallbackMins = activeOverride?.durationOverrideMinutes ?? service?.durationMinutes ?? (2 * branchSlot);
    const fallbackSlots = Math.max(1, Math.round(fallbackMins / branchSlot));

    data.set('slotCount', String(fallbackSlots));
    data.set('durationMinutes', String(fallbackMins));
    if (service?.cancellationPolicyId) {
      data.set('cancellationPolicyId', service.cancellationPolicyId);
    }
    setNotice(null);
    startTransition(async () => {
      const result = await saveServiceProductAction(data);
      if (result.error) {
        setNotice({ kind: 'error', text: result.error });
        return;
      }
      setNotice({ kind: 'success', text: result.message ?? 'تم حفظ الخدمة.' });
      if (result.serviceId) {
        onServiceSaved?.(result.serviceId);
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-7" aria-label={service ? `تعديل ${service.nameAr}` : 'إضافة خدمة جديدة'}>
      {service ? <input type="hidden" name="serviceId" value={service.id} /> : null}
      {service?.cancellationPolicyId ? <input type="hidden" name="cancellationPolicyId" value={service.cancellationPolicyId} /> : null}
      <NoticeBox notice={notice} />

      {/* بيانات المنتج والمحتوى */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <h2 className="text-lg font-black">بيانات الخدمة والمحتوى</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-bold text-white/70">
            الاسم بالعربية
            <input name="nameAr" required minLength={2} defaultValue={service?.nameAr ?? ''} className={inputClass} />
          </label>
          <label className="text-xs font-bold text-white/70">
            الاسم بالإنجليزية
            <input name="nameEn" defaultValue={service?.nameEn ?? ''} className={inputClass} dir="ltr" />
          </label>
          <label className="text-xs font-bold text-white/70">
            الرابط المختصر (Slug)
            <input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={service?.slug ?? ''} className={inputClass} dir="ltr" />
          </label>
          <label className="text-xs font-bold text-white/70">
            نوع عرض السعر
            <select name="priceType" defaultValue={service?.priceType ?? 'FIXED'} className={inputClass}>
              <option value="FIXED">سعر ثابت</option>
              <option value="STARTS_FROM">يبدأ من</option>
            </select>
          </label>
        </div>
        <label className="mt-4 block text-xs font-bold text-white/70">
          الوصف المختصر
          <textarea name="shortDescriptionAr" required minLength={5} maxLength={300} defaultValue={service?.shortDescriptionAr ?? ''} className={areaClass} />
        </label>
        <label className="mt-4 block text-xs font-bold text-white/70">
          الوصف الكامل
          <textarea name="fullDescriptionAr" required minLength={10} maxLength={5000} defaultValue={service?.fullDescriptionAr ?? ''} className={`${areaClass} min-h-40`} />
        </label>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-xs font-bold text-white/70">
            المشمول — سطر لكل عنصر
            <textarea name="includedItems" defaultValue={service?.includedItems.join('\n') ?? ''} className={areaClass} />
          </label>
          <label className="text-xs font-bold text-white/70">
            غير المشمول
            <textarea name="excludedItems" defaultValue={service?.excludedItems.join('\n') ?? ''} className={areaClass} />
          </label>
          <label className="text-xs font-bold text-white/70">
            مميزات الخدمة الرئيسية (سطر لكل ميزة)
            <textarea
              name="benefits"
              placeholder="عناية متنقلة لباب بيتك&#10;مواد متخصصة فائقة الجودة&#10;توثيق دقيق قبل وبعد التنفيذ"
              defaultValue={service?.benefits.join('\n') ?? ''}
              className={areaClass}
            />
          </label>
        </div>
        <label className="mt-4 block text-xs font-bold text-white/70">
          تعليمات التحضير
          <textarea name="preparationInstructions" defaultValue={service?.preparationInstructions ?? ''} className={areaClass} />
        </label>
      </section>

      {/* صور الخدمة */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <h2 className="flex items-center gap-2 text-lg font-black">
          <ImagePlus className="size-5 text-[#d4af37]" aria-hidden="true" />
          صور الخدمة
        </h2>
        <div className="mt-5 grid gap-5 md:grid-cols-[220px_1fr]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50">
            <Image src={coverImage} alt="معاينة صورة غلاف الخدمة" width={800} height={450} unoptimized className="aspect-video h-full w-full object-cover" />
          </div>
          <div className="flex flex-col justify-center space-y-3">
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#d4af37]/30 bg-[#d4af37]/10 px-5 text-xs font-bold text-[#f0d36d] hover:bg-[#d4af37]/20 transition-all focus-within:ring-2 focus-within:ring-[#d4af37]">
                <ImagePlus className="size-4" aria-hidden="true" />
                {isUploading ? 'جارٍ الرفع…' : 'رفع صورة الغلاف من الجهاز'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={isUploading} onChange={(event) => void uploadImages(event.target.files, 'cover')} />
              </label>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/15 px-5 text-xs font-bold text-white/75 hover:border-white/30 transition-all focus-within:ring-2 focus-within:ring-[#d4af37]">
                <Plus className="size-4" aria-hidden="true" />
                {isUploading ? 'جارٍ الرفع…' : 'رفع صور المعرض (سلايدر)'}
                <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={isUploading} onChange={(event) => void uploadImages(event.target.files, 'gallery')} />
              </label>
            </div>
            <p className="text-[11px] text-white/45">
              اختر ملف الصورة مباشرة من جهازك (JPG, PNG, WebP) ليتم ضغطها ورفعها تلقائيًا بأعلى جودة.
            </p>
          </div>
        </div>
        {galleryImages.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {galleryImages.map((image) => (
              <button
                key={image}
                type="button"
                title="حذف الصورة من المعرض"
                onClick={() => setGalleryImages((current) => current.filter((item) => item !== image))}
                className="relative overflow-hidden rounded-xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                <Image src={image} alt="صورة من معرض الخدمة" width={120} height={80} unoptimized className="h-16 w-24 object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-black/75 py-1 text-[9px] text-red-200">حذف</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {/* السعر والتنفيذ */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
        <h2 className="text-lg font-black">السعر وقواعد التنفيذ</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs font-bold text-white/70">
            السعر الأساسي (ج.م)
            <input name="basePrice" type="number" min="0" required defaultValue={service?.basePrice ?? 0} className={inputClass} />
          </label>

          <label className="text-xs font-bold text-white/70">
            حجم الفريق المطلوب (فنيين)
            <input name="requiredTeamSize" type="number" min="1" required defaultValue={service?.requiredTeamSize ?? 2} className={inputClass} />
            <span className="mt-1 block text-[10px] text-white/40">
              الحد الأدنى لفريق التنفيذ
            </span>
          </label>
          <label className="text-xs font-bold text-white/70">
            نوع العربون
            <select
              name="depositType"
              value={depositType}
              onChange={(event) => setDepositType(event.target.value)}
              className={inputClass}
            >
              <option value="FIXED">مبلغ ثابت (ج.م)</option>
              <option value="PERCENTAGE">نسبة مئوية (%)</option>
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
        </div>
        <div className="mt-5 flex flex-wrap gap-3 text-xs font-bold text-white/75">
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3">
            <input name="requiresDeposit" type="checkbox" defaultChecked={service?.requiresDeposit ?? true} />
            يتطلب عربونًا
          </label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3">
            <input name="requiresFullPrepayment" type="checkbox" defaultChecked={service?.requiresFullPrepayment ?? false} />
            دفع كامل مقدمًا (100%)
          </label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3">
            <input name="active" type="checkbox" defaultChecked={service?.active ?? true} />
            نشطة
          </label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3">
            <input name="bookableOnline" type="checkbox" defaultChecked={service?.bookableOnline ?? true} />
            حجز إلكتروني
          </label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3">
            <input name="subscriptionEligible" type="checkbox" defaultChecked={service?.subscriptionEligible ?? true} />
            مشمولة بالاشتراكات
          </label>
        </div>
      </section>

      {/* مواد ومستلزمات التنفيذ وتخصيص الفروع */}
      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 xl:col-span-2" aria-labelledby="service-materials-title">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="service-materials-title" className="text-lg font-black">مواد ومستلزمات التنفيذ</h2>
              <p className="mt-1 text-xs leading-5 text-white/50">تُحفظ الكميات والملاحظات مع الخدمة نفسها، وتظهر تلقائيًا للفريق في قائمة تنفيذ الحجز.</p>
            </div>
            <Link href="/admin/setup" className="text-xs font-bold text-[#f0d36d] underline-offset-4 hover:underline">
              إدارة الأصناف والمخزون
            </Link>
          </div>

          {materials.length ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {materials.map((material) => {
                const requirement = materialRequirementFor(material.id);
                const canEnable = material.active || Boolean(requirement);
                return (
                  <div
                    key={material.id}
                    className={`rounded-xl border p-4 ${
                      requirement ? 'border-[#d4af37]/35 bg-[#d4af37]/[0.04]' : 'border-white/10 bg-black/20'
                    }`}
                  >
                    <label className="flex min-h-7 items-center gap-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(requirement)}
                        disabled={!canEnable}
                        onChange={(event) => toggleMaterialRequirement(material.id, event.target.checked)}
                      />
                      <span>{material.nameAr}</span>
                      <span className="mr-auto text-[11px] font-normal text-white/45">{material.unit}</span>
                      {!material.active ? (
                        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-100">
                          موقوف
                        </span>
                      ) : null}
                    </label>
                    {requirement ? (
                      <ServiceMaterialRequirementField
                        material={material}
                        requirement={requirement}
                        inputClass={inputClass}
                        onChange={(patch) => updateMaterialRequirement(material.id, patch)}
                      />
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

        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 xl:col-span-2">
          <h2 className="text-lg font-black">إتاحة وتخصيص السلوتات حسب الفرع</h2>
          <p className="mt-1 text-xs text-white/50">
            حدد إتاحة الخدمة في كل فرع تشغيلي وعدد السلوتات والمدة المخصصة لها وفق وحدة سلوت الفرع.
          </p>
          <div className="mt-4 space-y-3">
            {branches.map((branch) => {
              const override = branchOverrides.find((item) => item.branchId === branch.id);
              const branchSlot = branch.slotUnitMinutes || 30;
              const currentMins = override?.durationOverrideMinutes ?? (2 * branchSlot);
              return (
                <div key={branch.id} className="rounded-xl border border-white/10 p-3">
                  <label className="flex items-center gap-2 text-xs font-bold">
                    <input
                      type="checkbox"
                      checked={Boolean(override)}
                      onChange={(event) => toggleBranch(branch.id, event.target.checked)}
                    />
                    {branch.nameAr}
                  </label>
                  {override ? (
                    <div className="mt-3 space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="font-bold text-white/70">عدد السلوتات والمدة المخصصة لهذا الفرع</span>
                          <span className="inline-flex items-center gap-1 rounded-md border border-[#d4af37]/30 bg-[#d4af37]/10 px-2 py-0.5 text-[10px] font-bold text-[#f0d36d]">
                            وحدة السلوت بالفرع: {branchSlot} دقيقة
                          </span>
                        </div>
                        <select
                          value={currentMins}
                          onChange={(event) =>
                            updateBranch(branch.id, { durationOverrideMinutes: Number(event.target.value) })
                          }
                          className={inputClass}
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16].map((slots) => {
                            const mins = slots * branchSlot;
                            const label =
                              slots === 1 ? 'سلوت واحد' : slots === 2 ? 'سلوتان' : slots <= 10 ? `${slots} سلوتات` : `${slots} سلوت`;
                            return (
                              <option key={slots} value={mins}>
                                {label} — {mins} دقيقة ({formatDurationArabic(mins)})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 pt-0.5">
                        <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={override.active}
                            onChange={(event) => updateBranch(branch.id, { active: event.target.checked })}
                          />
                          نشطة في الفرع
                        </label>
                        <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={override.bookableOnline}
                            onChange={(event) => updateBranch(branch.id, { bookableOnline: event.target.checked })}
                          />
                          حجز إلكتروني
                        </label>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="sticky bottom-4 z-20 flex justify-end">
        <button
          type="submit"
          disabled={isPending || isUploading}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#d4af37] px-7 text-sm font-black text-black shadow-2xl disabled:opacity-50"
        >
          <Save className="size-4" aria-hidden="true" />
          {isPending ? 'جارٍ الحفظ…' : 'حفظ الخدمة'}
        </button>
      </div>
    </form>
  );
}

export default function CatalogManager({
  services,
  branches,
  materials,
  initialServiceId,
  isNew,
}: CatalogManagerProps) {
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(() => {
    if (isNew) return null;
    if (initialServiceId && services.some((s) => s.id === initialServiceId)) return initialServiceId;
    return services[0]?.id ?? null;
  });

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId),
    [services, selectedServiceId],
  );

  return (
    <div className="min-h-screen bg-[#080808] text-white" dir="rtl">
      <main className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/admin?section=services" className="inline-flex items-center gap-2 text-xs font-bold text-[#d4af37]">
              <ArrowRight className="size-4" aria-hidden="true" />
              العودة إلى لوحة المالك (قسم الخدمات)
            </Link>
            <p className="mt-5 flex items-center gap-2 text-xs font-bold text-[#d4af37]">
              <Sparkles className="size-4" aria-hidden="true" />
              كتالوج بريق التشغيلي
            </p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">إدارة وتعديل الخدمات</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-white/50">
              المحتوى والصور والتسعير والمدة والعربون ومستلزمات التنفيذ وإعداد كل فرع تُحفظ في معاملة واحدة موثقة.
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
            <button
              type="button"
              onClick={() => setSelectedServiceId(null)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-5 text-xs font-black text-black"
            >
              <PackagePlus className="size-4" aria-hidden="true" />
              خدمة جديدة
            </button>
          </div>
        </header>

        <div className="mt-7 grid gap-7 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-2 xl:sticky xl:top-5 xl:self-start" aria-label="قائمة الخدمات">
            <button
              type="button"
              onClick={() => setSelectedServiceId(null)}
              className={`w-full rounded-xl border p-3 text-right text-sm font-bold transition ${
                selectedServiceId === null
                  ? 'border-[#d4af37]/50 bg-[#d4af37]/10 text-[#f0d36d] shadow-lg shadow-[#d4af37]/10'
                  : 'border-white/10 text-white/60 hover:border-white/20'
              }`}
            >
              + إضافة خدمة جديدة
            </button>
            {services.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => setSelectedServiceId(service.id)}
                className={`w-full rounded-xl border p-3 text-right transition ${
                  selectedServiceId === service.id
                    ? 'border-[#d4af37]/50 bg-[#d4af37]/10 ring-1 ring-[#d4af37]/30'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                }`}
              >
                <span className="block truncate text-sm font-bold text-white">{service.nameAr}</span>
                <span className="mt-1 block text-[10px] text-white/40">
                  {service.active ? 'نشطة' : 'متوقفة'} · {service.durationMinutes} دقيقة · {service.basePrice} ج.م
                </span>
              </button>
            ))}
          </aside>
          <ProductEditor
            key={selectedService?.id ?? 'new'}
            service={selectedService}
            branches={branches}
            materials={materials}
            onServiceSaved={(savedId) => setSelectedServiceId(savedId)}
          />
        </div>
      </main>
    </div>
  );
}
