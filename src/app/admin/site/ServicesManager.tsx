'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  Boxes,
  Car,
  CheckSquare,
  Clock,
  ExternalLink,
  ImagePlus,
  ListChecks,
  PackagePlus,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { saveServiceProductAction } from '@/app/actions/catalog';
import { prepareImageForUpload } from '@/lib/client/image-upload';

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

export interface ChecklistTemplateItemDto {
  id?: string;
  labelAr: string;
  descriptionAr?: string | null;
  required: boolean;
  requiresPhoto: boolean;
  requiresNote: boolean;
  active?: boolean;
}

export interface SiteServiceDto {
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
  branchOverrides: BranchOverrideDto[];
  materialRequirements: CatalogMaterialRequirementDto[];
  checklistItems?: ChecklistTemplateItemDto[];
}

export interface ServicesManagerProps {
  services: SiteServiceDto[];
  branches: Array<{ id: string; nameAr: string }>;
  materials: CatalogMaterialDto[];
  initialServiceId?: string | null;
  isNew?: boolean;
}

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

const inputClass =
  'mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-[#cea355] focus:ring-2 focus:ring-[#cea355]/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';
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
      className={`rounded-xl border p-3.5 text-xs font-bold ${
        notice.kind === 'error'
          ? 'border-red-400/30 bg-red-400/10 text-red-200'
          : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
      }`}
    >
      {notice.text}
    </p>
  );
}

function ServiceEditor({
  service,
  branches,
  materials,
  onServiceSaved,
}: {
  service?: SiteServiceDto;
  branches: Array<{ id: string; nameAr: string }>;
  materials: CatalogMaterialDto[];
  onServiceSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [nameEn, setNameEn] = useState(service?.nameEn ?? '');
  const autoSlug = useMemo(() => {
    return nameEn
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }, [nameEn]);

  const [coverImage, setCoverImage] = useState(service?.coverImage ?? '/images/service-care.svg');
  const [galleryImages, setGalleryImages] = useState(service?.galleryImages ?? []);
  const [branchOverrides, setBranchOverrides] = useState<BranchOverrideDto[]>(service?.branchOverrides ?? []);
  const [materialRequirements, setMaterialRequirements] = useState<CatalogMaterialRequirementDto[]>(
    service?.materialRequirements ?? [],
  );

  const [checklistItems, setChecklistItems] = useState<ChecklistTemplateItemDto[]>(() => {
    if (service?.checklistItems && service.checklistItems.length > 0) {
      return service.checklistItems;
    }
    return [
      { labelAr: 'فحص وتصوير حالة السيارة وتأكيد بيانات الحجز', required: true, requiresPhoto: false, requiresNote: false, active: true },
      { labelAr: 'تنظيف وتلميع الهيكل الخارجي والجنوط والإطارات', required: true, requiresPhoto: false, requiresNote: false, active: true },
      { labelAr: 'تجفيف الزجاج وفتحات الأبواب واللمسات الدقيقة', required: true, requiresPhoto: false, requiresNote: false, active: true },
      { labelAr: 'فحص الجودة النهائي وتأكيد إتمام الخدمة', required: true, requiresPhoto: false, requiresNote: false, active: true },
    ];
  });
  const [newChecklistLabel, setNewChecklistLabel] = useState('');

  const [slotCount, setSlotCount] = useState<number>(() => {
    if (service?.slotCount && service.slotCount >= 1) return service.slotCount;
    if (service?.durationMinutes) return Math.max(1, Math.round(service.durationMinutes / 60));
    return 1;
  });
  const calculatedDurationMinutes = slotCount * 60;
  const [isUploading, setIsUploading] = useState(false);

  function addChecklistItem() {
    if (!newChecklistLabel.trim()) return;
    setChecklistItems((current) => [
      ...current,
      {
        labelAr: newChecklistLabel.trim(),
        required: true,
        requiresPhoto: false,
        requiresNote: false,
        active: true,
      },
    ]);
    setNewChecklistLabel('');
  }

  function removeChecklistItem(index: number) {
    setChecklistItems((current) => current.filter((_, i) => i !== index));
  }

  function updateChecklistItem(index: number, patch: Partial<ChecklistTemplateItemDto>) {
    setChecklistItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function toggleBranch(branchId: string, enabled: boolean) {
    setBranchOverrides((current) =>
      enabled
        ? [...current, { branchId, active: true, bookableOnline: true, priceOverride: null, durationOverrideMinutes: null }]
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
    data.set('nameEn', nameEn.trim());
    data.set('slug', autoSlug || service?.slug || 'service');
    data.set('priceType', 'FIXED');
    data.set('depositType', 'FIXED');
    data.set('coverImage', coverImage);
    data.set('galleryImages', JSON.stringify(galleryImages));
    data.set('variants', JSON.stringify([]));
    data.set('addonIds', JSON.stringify([]));
    data.set('branchOverrides', JSON.stringify(branchOverrides));
    data.set('materialRequirements', JSON.stringify(materialRequirements));
    data.set('checklistItems', JSON.stringify(checklistItems));
    data.set('includedItems', JSON.stringify([]));
    data.set('excludedItems', JSON.stringify([]));
    data.set('slotCount', String(slotCount));
    data.set('durationMinutes', String(calculatedDurationMinutes));
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
      setNotice({ kind: 'success', text: result.message ?? 'تم حفظ الخدمة بنجاح.' });
      if (result.serviceId) {
        onServiceSaved?.(result.serviceId);
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6" aria-label={service ? `تعديل ${service.nameAr}` : 'إضافة خدمة جديدة'}>
      {service ? <input type="hidden" name="serviceId" value={service.id} /> : null}
      {service?.cancellationPolicyId ? (
        <input type="hidden" name="cancellationPolicyId" value={service.cancellationPolicyId} />
      ) : null}
      <input type="hidden" name="priceType" value="FIXED" />
      <NoticeBox notice={notice} />

      {/* Header bar of editor */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#cea355]/30 bg-gradient-to-r from-[#cea355]/[0.08] via-neutral-950/40 to-[#cea355]/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#cea355]/20 border border-[#cea355]/40 text-[#edce8b]">
            <Pencil className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-white">
              {service ? `تعديل خدمة: ${service.nameAr}` : 'إضافة خدمة جديدة للمنصة'}
            </h2>
            <p className="text-xs leading-5 text-neutral-400">
              تعديل الاسم، السعر الثابت، المدة، الصور، قائمة مهام الموظفين، والمواد المستهلكة من المخزون.
            </p>
          </div>
        </div>
        {service?.slug ? (
          <Link
            href={`/services/${service.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-900/80 px-3.5 text-xs font-bold text-neutral-300 hover:border-[#cea355] hover:text-white transition-all shrink-0"
          >
            <ExternalLink className="size-3.5 text-[#cea355]" />
            <span>معاينة صفحة الخدمة</span>
          </Link>
        ) : null}
      </div>

      {/* 1. Basic Content */}
      <section className="rounded-2xl border border-neutral-800 bg-[#111114]/90 p-5 shadow-xl">
        <h3 className="text-sm font-black text-white flex items-center gap-2">
          <Sparkles className="size-4 text-[#cea355]" />
          بيانات الخدمة والمحتوى
        </h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-bold text-neutral-300">
            الاسم بالعربية
            <input
              name="nameAr"
              required
              minLength={2}
              defaultValue={service?.nameAr ?? ''}
              placeholder="مثال: غسيل بريق الخارجي الأساسي"
              className={inputClass}
            />
          </label>
          <label className="text-xs font-bold text-neutral-300">
            الاسم بالإنجليزية (يحدد الرابط المختصر تلقائيًا)
            <input
              name="nameEn"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="e.g. Bareeq Essential Exterior"
              className={inputClass}
              dir="ltr"
            />
            {autoSlug ? (
              <span className="mt-1.5 block text-[11px] font-mono text-[#edce8b]" dir="ltr">
                رابط الخدمة: /services/{autoSlug}
              </span>
            ) : null}
          </label>
        </div>
        <label className="mt-4 block text-xs font-bold text-neutral-300">
          الوصف المختصر
          <textarea
            name="shortDescriptionAr"
            required
            minLength={5}
            maxLength={300}
            defaultValue={service?.shortDescriptionAr ?? ''}
            placeholder="وصف مختصر يظهر في كروت الخدمات وقائمة الحجز..."
            className={areaClass}
          />
        </label>
        <label className="mt-4 block text-xs font-bold text-neutral-300">
          الوصف الكامل
          <textarea
            name="fullDescriptionAr"
            required
            minLength={10}
            maxLength={5000}
            defaultValue={service?.fullDescriptionAr ?? ''}
            placeholder="تفاصيل الخدمة والخطوات والمواصفات الكاملة..."
            className={`${areaClass} min-h-32`}
          />
        </label>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-bold text-neutral-300">
            مميزات الخدمة الرئيسية (سطر لكل ميزة)
            <textarea
              name="benefits"
              placeholder="عناية متنقلة لباب بيتك&#10;مواد متخصصة فائقة الجودة&#10;توثيق دقيق قبل وبعد التنفيذ"
              defaultValue={service?.benefits.join('\n') ?? ''}
              className={areaClass}
            />
          </label>
          <label className="text-xs font-bold text-neutral-300">
            تعليمات التحضير والتجهيز (اختياري)
            <textarea
              name="preparationInstructions"
              placeholder="مثال: يرجى ترك مساحة مناسبة حول السيارة وتأكيد إغلاق النوافذ."
              defaultValue={service?.preparationInstructions ?? ''}
              className={areaClass}
            />
          </label>
        </div>
      </section>

      {/* 2. Media */}
      <section className="rounded-2xl border border-neutral-800 bg-[#111114]/90 p-5 shadow-xl">
        <h3 className="text-sm font-black text-white flex items-center gap-2">
          <ImagePlus className="size-4 text-[#cea355]" />
          صور الخدمة
        </h3>
        <div className="mt-4 grid gap-5 md:grid-cols-[200px_1fr]">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50">
            <Image
              src={coverImage}
              alt="معاينة صورة غلاف الخدمة"
              width={800}
              height={450}
              unoptimized
              className="aspect-video h-full w-full object-cover"
            />
          </div>
          <div className="flex flex-col justify-center space-y-3">
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#cea355]/40 bg-[#cea355]/10 px-5 text-xs font-bold text-[#edce8b] hover:bg-[#cea355]/20 transition-all focus-within:ring-2 focus-within:ring-[#cea355]">
                <ImagePlus className="size-4" aria-hidden="true" />
                {isUploading ? 'جارٍ الرفع…' : 'رفع صورة الغلاف من الجهاز'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={isUploading}
                  onChange={(event) => void uploadImages(event.target.files, 'cover')}
                />
              </label>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-5 text-xs font-bold text-neutral-200 hover:border-neutral-500 transition-all focus-within:ring-2 focus-within:ring-[#cea355]">
                <Plus className="size-4" aria-hidden="true" />
                {isUploading ? 'جارٍ الرفع…' : 'رفع صور المعرض (سلايدر)'}
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={isUploading}
                  onChange={(event) => void uploadImages(event.target.files, 'gallery')}
                />
              </label>
            </div>
            <p className="text-[11px] text-neutral-400">
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
                <span className="absolute inset-x-0 bottom-0 bg-black/80 py-1 text-[9px] text-red-200">حذف</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {/* 3. Pricing, Slot-based Duration & Execution Rules */}
      <section className="rounded-2xl border border-neutral-800 bg-[#111114]/90 p-5 shadow-xl">
        <h3 className="text-sm font-black text-white flex items-center gap-2">
          <Clock className="size-4 text-[#cea355]" />
          السعر الثابت والمدة وقواعد التنفيذ
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-bold text-neutral-300">
            السعر الثابت للخدمة (ج.م)
            <input name="basePrice" type="number" min="0" required defaultValue={service?.basePrice ?? 0} className={inputClass} />
          </label>

          <label className="text-xs font-bold text-neutral-300">
            عدد السلوتات التشغيلية (Slots)
            <select
              name="slotCount"
              value={slotCount}
              onChange={(e) => setSlotCount(Math.max(1, Number(e.target.value)))}
              className={inputClass}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((count) => (
                <option key={count} value={count}>
                  {count} سلوت ({count * 60} دقيقة {count === 1 ? '— ساعة واحدة' : count === 2 ? '— ساعتان' : `— ${count} ساعات`})
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[10px] text-neutral-400">
              السلوت الواحد = 60 دقيقة في جدول المواعيد
            </span>
          </label>

          <div className="flex flex-col justify-start">
            <span className="text-xs font-bold text-neutral-300">المدة المعروضة للعميل</span>
            <div className="mt-2 flex min-h-11 items-center justify-between rounded-xl border border-[#cea355]/35 bg-[#cea355]/10 px-3.5 text-sm font-black text-[#edce8b]">
              <span>{calculatedDurationMinutes} دقيقة</span>
              <span className="text-xs font-semibold text-neutral-300">
                {slotCount === 1 ? 'ساعة واحدة' : slotCount === 2 ? 'ساعتان' : `${slotCount} ساعات`}
              </span>
            </div>
            <span className="mt-1 block text-[10px] text-emerald-400">
              تظهر للعميل كدقائق/ساعات دون ذكر السلوتات
            </span>
            <input type="hidden" name="durationMinutes" value={calculatedDurationMinutes} />
          </div>

          <label className="text-xs font-bold text-neutral-300">
            حجم الفريق المطلوب (فنيين)
            <input
              name="requiredTeamSize"
              type="number"
              min="1"
              required
              defaultValue={service?.requiredTeamSize ?? 2}
              className={inputClass}
            />
            <span className="mt-1 block text-[10px] text-neutral-400">
              الحد الأدنى لفريق التنفيذ
            </span>
          </label>

          <label className="text-xs font-bold text-neutral-300">
            قيمة العربون الثابت (ج.م)
            <input
              name="depositValue"
              type="number"
              min="0"
              max={100000}
              required
              defaultValue={service?.depositValue ?? 100}
              placeholder="مثال: 100"
              className={inputClass}
            />
            <span className="mt-1 block text-[10px] text-neutral-400">
              مبلغ نقدي ثابت بالجنيه يُدفع عند تأكيد الحجز
            </span>
          </label>
          <input type="hidden" name="depositType" value="FIXED" />
          <input type="hidden" name="minimumBeforePhotos" value="0" />
          <input type="hidden" name="minimumAfterPhotos" value="0" />
        </div>

        <div className="mt-5 flex flex-wrap gap-3 text-xs font-bold text-neutral-200">
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 hover:border-neutral-700 cursor-pointer">
            <input name="requiresDeposit" type="checkbox" defaultChecked={service?.requiresDeposit ?? true} />
            يتطلب عربونًا
          </label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 hover:border-neutral-700 cursor-pointer">
            <input name="requiresFullPrepayment" type="checkbox" defaultChecked={service?.requiresFullPrepayment ?? false} />
            دفع كامل مقدمًا (100%)
          </label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 hover:border-neutral-700 cursor-pointer">
            <input name="active" type="checkbox" defaultChecked={service?.active ?? true} />
            نشطة
          </label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 hover:border-neutral-700 cursor-pointer">
            <input name="bookableOnline" type="checkbox" defaultChecked={service?.bookableOnline ?? true} />
            حجز إلكتروني
          </label>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 hover:border-neutral-700 cursor-pointer">
            <input name="subscriptionEligible" type="checkbox" defaultChecked={service?.subscriptionEligible ?? true} />
            مشمولة بالاشتراكات
          </label>
        </div>
      </section>

      {/* 4. Employee Execution Checklist */}
      <section className="rounded-2xl border border-neutral-800 bg-[#111114]/90 p-5 shadow-xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#cea355]/20 border border-[#cea355]/40 text-[#edce8b]">
              <ListChecks className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">قائمة مهام وتشيك ليست التنفيذ للموظفين</h3>
              <p className="mt-0.5 text-xs text-neutral-400">
                تظهر للفنيين وموظفي التنفيذ في تطبيق الميدان أثناء تنفيذ الحجز، ولا تظهر للعميل. إتمام جميع البنود مطلوب لاكتمال الحجز وخصم المخزون.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-bold text-amber-200 shrink-0">
            خاص بالموظفين فقط
          </span>
        </div>

        {/* Add new checklist item form */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={newChecklistLabel}
            onChange={(e) => setNewChecklistLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addChecklistItem();
              }
            }}
            placeholder="اكتب خطوة أو مهمة جديدة للموظف (مثال: تنظيف وتلميع الهيكل الخارجي)..."
            className="flex-1 min-h-11 rounded-xl border border-white/10 bg-black/40 px-3.5 text-xs text-white outline-none transition focus:border-[#cea355] focus:ring-2 focus:ring-[#cea355]/20"
          />
          <button
            type="button"
            onClick={addChecklistItem}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#cea355] px-4 text-xs font-bold text-neutral-950 hover:bg-[#edce8b] transition-all shrink-0"
          >
            <Plus className="size-4" />
            <span>إضافة بند للمهمة</span>
          </button>
        </div>

        {/* Checklist items list */}
        {checklistItems.length ? (
          <div className="mt-4 space-y-2.5">
            {checklistItems.map((item, index) => (
              <div
                key={item.id ?? `checklist-${index}`}
                className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-black/30 p-3.5 transition-all hover:border-neutral-700 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-1 items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#cea355]/20 text-[11px] font-black text-[#edce8b]">
                    {index + 1}
                  </span>
                  <input
                    type="text"
                    value={item.labelAr}
                    onChange={(e) => updateChecklistItem(index, { labelAr: e.target.value })}
                    className="flex-1 rounded-lg border border-white/5 bg-transparent px-2.5 py-1.5 text-xs font-medium text-white transition focus:border-[#cea355] focus:bg-black/60 focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.required}
                      onChange={(e) => updateChecklistItem(index, { required: e.target.checked })}
                    />
                    <span>إلزامية</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.requiresNote}
                      onChange={(e) => updateChecklistItem(index, { requiresNote: e.target.checked })}
                    />
                    <span>تتطلب ملاحظة</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeChecklistItem(index)}
                    title="حذف هذا البند"
                    className="flex size-8 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-neutral-800 p-5 text-center text-xs text-neutral-400">
            لم تتم إضافة أي بنود في قائمة مهام الموظفين بعد. أضف خطوات العمل أعلاه.
          </div>
        )}
      </section>

      {/* 5. Materials and Inventory Link */}
      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-neutral-800 bg-[#111114]/90 p-5 shadow-xl xl:col-span-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#cea355]/20 border border-[#cea355]/40 text-[#edce8b]">
                <Boxes className="size-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">مواد ومستلزمات التنفيذ من المخزون</h3>
                <p className="mt-0.5 text-xs leading-5 text-neutral-400">
                  حدد المواد المستهلكة لكل تنفيذ. يتم خصم هذه الكميات تلقائيًا من رصيد عهدة الموظف ومخزون الفرع بمجرد إتمام خطوات الخدمة واكتمال الحجز.
                </p>
              </div>
            </div>
            <Link href="/operations/resources" className="text-xs font-bold text-[#edce8b] hover:underline shrink-0">
              إدارة الأصناف والمخزون
            </Link>
          </div>

          {materials.length ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {materials.map((material) => {
                const requirement = materialRequirementFor(material.id);
                const canEnable = material.active || Boolean(requirement);
                return (
                  <div
                    key={material.id}
                    className={`rounded-xl border p-4 transition-all ${
                      requirement ? 'border-[#cea355]/40 bg-[#cea355]/[0.05]' : 'border-neutral-800 bg-black/30'
                    }`}
                  >
                    <label className="flex min-h-7 items-center gap-2 text-sm font-bold text-white cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(requirement)}
                        disabled={!canEnable}
                        onChange={(event) => toggleMaterialRequirement(material.id, event.target.checked)}
                      />
                      <span>{material.nameAr}</span>
                      <span className="mr-auto text-[11px] font-normal text-neutral-400">{material.unit}</span>
                      {!material.active ? (
                        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-200">
                          موقوف
                        </span>
                      ) : null}
                    </label>
                    {requirement ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-[130px_1fr]">
                        <label className="text-[11px] font-bold text-neutral-300">
                          الكمية المستهلكة لكل حجز ({material.unit})
                          <input
                            type="number"
                            min="1"
                            max="1000000"
                            required
                            value={requirement.quantity}
                            onChange={(event) =>
                              updateMaterialRequirement(material.id, { quantity: Number(event.target.value) })
                            }
                            className={inputClass}
                          />
                        </label>
                        <label className="text-[11px] font-bold text-neutral-300">
                          ملاحظات للموظف (اختياري)
                          <input
                            value={requirement.notes ?? ''}
                            maxLength={1000}
                            placeholder="مثال: استخدام الفوطة المايكروفايبر الزرقاء"
                            onChange={(event) =>
                              updateMaterialRequirement(material.id, { notes: event.target.value || null })
                            }
                            className={inputClass}
                          />
                        </label>
                        <label className="flex min-h-10 items-center gap-2 text-[11px] font-bold text-neutral-300 sm:col-span-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={requirement.required}
                            onChange={(event) =>
                              updateMaterialRequirement(material.id, { required: event.target.checked })
                            }
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
            <div className="mt-4 rounded-xl border border-dashed border-neutral-800 p-5 text-sm text-neutral-400">
              لا توجد أصناف مواد بعد. أضف الأصناف من إدارة الموارد ثم ارجع لتحديد المواد المطلوبة للخدمة.
            </div>
          )}
        </div>

        {/* 6. Branch Customization */}
        <div className="rounded-2xl border border-neutral-800 bg-[#111114]/90 p-5 shadow-xl xl:col-span-2">
          <h3 className="text-sm font-black text-white">تخصيص الخدمة حسب الفرع</h3>
          <div className="mt-4 space-y-3">
            {branches.map((branch) => {
              const override = branchOverrides.find((item) => item.branchId === branch.id);
              return (
                <div key={branch.id} className="rounded-xl border border-neutral-800 bg-black/30 p-3.5">
                  <label className="flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(override)}
                      onChange={(event) => toggleBranch(branch.id, event.target.checked)}
                    />
                    {branch.nameAr}
                  </label>
                  {override ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-[11px] text-neutral-300">
                        سعر مخصص للفرع
                        <input
                          type="number"
                          min="0"
                          value={override.priceOverride ?? ''}
                          onChange={(event) =>
                            updateBranch(branch.id, { priceOverride: numberOrNull(event.target.value) })
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="text-[11px] text-neutral-300">
                        مدة مخصصة للفرع
                        <select
                          value={override.durationOverrideMinutes ?? ''}
                          onChange={(event) =>
                            updateBranch(branch.id, { durationOverrideMinutes: numberOrNull(event.target.value) })
                          }
                          className={inputClass}
                        >
                          <option value="">حسب السلوتات القياسية للخدمة ({calculatedDurationMinutes} دقيقة)</option>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((s) => (
                            <option key={s} value={s * 60}>
                              {s} سلوت ({s * 60} دقيقة {s === 1 ? '— ساعة' : s === 2 ? '— ساعتان' : `— ${s} ساعات`})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={override.active}
                          onChange={(event) => updateBranch(branch.id, { active: event.target.checked })}
                        />
                        نشطة في هذا الفرع
                      </label>
                      <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={override.bookableOnline}
                          onChange={(event) => updateBranch(branch.id, { bookableOnline: event.target.checked })}
                        />
                        متاحة للحجز الإلكتروني
                      </label>
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
          className="inline-flex min-h-12 items-center gap-2 rounded-xl gold-gradient px-8 text-sm font-black text-black shadow-2xl hover:brightness-110 disabled:opacity-50 transition-all cursor-pointer"
        >
          <Save className="size-4" aria-hidden="true" />
          {isPending ? 'جارٍ الحفظ…' : 'حفظ الخدمة'}
        </button>
      </div>
    </form>
  );
}

export default function ServicesManager({
  services,
  branches,
  materials,
  initialServiceId,
  isNew,
}: ServicesManagerProps) {
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(() => {
    if (isNew) return null;
    if (initialServiceId && services.some((s) => s.id === initialServiceId)) return initialServiceId;
    return services[0]?.id ?? null;
  });
  const [searchQuery, setSearchQuery] = useState('');

  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return services;
    return services.filter(
      (s) =>
        s.nameAr.toLowerCase().includes(q) ||
        (s.nameEn && s.nameEn.toLowerCase().includes(q)) ||
        s.slug.toLowerCase().includes(q),
    );
  }, [services, searchQuery]);

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId),
    [services, selectedServiceId],
  );

  return (
    <div className="space-y-6">
      {/* Tab Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-800/80 pb-5">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Car className="size-5 text-[#cea355]" />
            إدارة وتعديل الخدمات
          </h2>
          <p className="mt-1 text-xs text-neutral-400">
            إدارة الأسعار والمدد بالسلوتات، الوصف، الصور، والمستلزمات لجميع خدمات المنصة.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedServiceId(null)}
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-xs font-black transition-all cursor-pointer ${
            selectedServiceId === null
              ? 'gold-gradient text-black shadow-lg shadow-[#cea355]/20'
              : 'border border-[#cea355]/40 bg-[#cea355]/10 text-[#edce8b] hover:bg-[#cea355]/20'
          }`}
        >
          <PackagePlus className="size-4" />
          <span>+ إضافة خدمة جديدة</span>
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid gap-7 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="space-y-3 lg:sticky lg:top-5 lg:self-start" aria-label="قائمة الخدمات">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في الخدمات…"
              className="w-full rounded-xl border border-neutral-800 bg-[#121212] py-2.5 pr-9 pl-3 text-xs text-white placeholder-neutral-500 outline-none focus:border-[#cea355]"
            />
          </div>

          <button
            type="button"
            onClick={() => setSelectedServiceId(null)}
            className={`w-full rounded-xl border p-3 text-right text-xs font-black transition cursor-pointer ${
              selectedServiceId === null
                ? 'border-[#cea355]/60 bg-[#cea355]/15 text-[#edce8b] shadow-md shadow-[#cea355]/10'
                : 'border-neutral-800 bg-[#121212] text-neutral-400 hover:border-neutral-700 hover:text-white'
            }`}
          >
            + إضافة خدمة جديدة
          </button>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredServices.map((service) => {
              const isSelected = selectedServiceId === service.id;
              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => setSelectedServiceId(service.id)}
                  className={`w-full rounded-xl border p-3 text-right transition cursor-pointer ${
                    isSelected
                      ? 'border-[#cea355]/60 bg-[#cea355]/10 ring-1 ring-[#cea355]/30'
                      : 'border-neutral-800/80 bg-[#111114]/80 hover:border-neutral-700 hover:bg-[#16161a]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`block truncate text-xs font-bold ${isSelected ? 'text-white' : 'text-neutral-200'}`}>
                      {service.nameAr}
                    </span>
                    <span
                      className={`size-2 shrink-0 rounded-full ${
                        service.active ? 'bg-emerald-400' : 'bg-neutral-600'
                      }`}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-neutral-400">
                    <span>{service.durationMinutes} دقيقة</span>
                    <span className="font-bold text-[#edce8b]">{service.basePrice} ج.م</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Editor Area */}
        <main className="min-w-0">
          <ServiceEditor
            key={selectedService?.id ?? 'new-service'}
            service={selectedService}
            branches={branches}
            materials={materials}
            onServiceSaved={(savedId) => setSelectedServiceId(savedId)}
          />
        </main>
      </div>
    </div>
  );
}
