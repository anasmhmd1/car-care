'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Layers,
  Plus,
  Trash2,
  Edit2,
  Check,
  CheckCircle2,
  LoaderCircle,
  RotateCcw,
  Eye,
  EyeOff,
  MoveUp,
  MoveDown,
} from 'lucide-react';
import PublicImage from '@/components/PublicImage';
import {
  DEFAULT_SERVICE_COLLECTIONS,
  PRESET_COLLECTION_IMAGES,
  type ServiceCollection,
} from '@/lib/service-collections';
import { saveServiceCollectionsAction } from '@/app/actions/owner-collections';

interface ServiceOption {
  id: string;
  nameAr: string;
  slug: string;
  basePrice: number;
  durationMinutes: number;
}

interface CollectionsManagerProps {
  initialCollections: ServiceCollection[];
  availableServices: ServiceOption[];
}

export default function CollectionsManager({
  initialCollections,
  availableServices,
}: CollectionsManagerProps) {
  const router = useRouter();
  const [collections, setCollections] = useState<ServiceCollection[]>(initialCollections);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // New collection template
  function handleAddNew() {
    const newId = `col_${Date.now()}`;
    const newCol: ServiceCollection = {
      id: newId,
      titleAr: 'مجموعة عناية جديدة',
      badge: 'تصنيف الخامة',
      descriptionAr: 'وصف تفصيلي للخدمات والمواد المستخدمة في هذه المجموعة.',
      image: '/images/bareeq_exterior_care.png',
      serviceIds: availableServices.slice(0, 2).map((s) => s.id),
      active: true,
      priority: collections.length + 1,
    };
    setCollections((prev) => [...prev, newCol]);
    setEditingId(newId);
    setFeedback(null);
  }

  function handleRemove(id: string) {
    if (collections.length <= 1) {
      setFeedback({ kind: 'error', message: 'يجب الإبقاء على مجموعة واحدة على الأقل.' });
      return;
    }
    setCollections((prev) => prev.filter((c) => c.id !== id));
    if (editingId === id) setEditingId(null);
    setFeedback(null);
  }

  function handleUpdateField<K extends keyof ServiceCollection>(id: string, field: K, value: ServiceCollection[K]) {
    setCollections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  }

  function toggleServiceInCollection(colId: string, serviceId: string) {
    setCollections((prev) =>
      prev.map((c) => {
        if (c.id !== colId) return c;
        const exists = c.serviceIds.includes(serviceId);
        const updated = exists
          ? c.serviceIds.filter((id) => id !== serviceId)
          : [...c.serviceIds, serviceId];
        return { ...c, serviceIds: updated };
      })
    );
  }

  function movePriority(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= collections.length) return;

    const copy = [...collections];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;

    // reassign priorities
    const updated = copy.map((item, idx) => ({ ...item, priority: idx + 1 }));
    setCollections(updated);
  }

  function handleSaveAll() {
    setFeedback(null);
    startTransition(async () => {
      const res = await saveServiceCollectionsAction(collections);
      if (res.error) {
        setFeedback({ kind: 'error', message: res.error });
      } else {
        setFeedback({ kind: 'success', message: 'تم حفظ ونشر مجموعات الخدمات في الموقع بنجاح.' });
        router.refresh();
      }
    });
  }

  function handleRestoreDefaults() {
    if (!confirm('هل أنت متأكد من استعادة المجموعات الافتراضية؟')) return;
    setCollections(DEFAULT_SERVICE_COLLECTIONS);
    setEditingId(null);
    setFeedback({ kind: 'success', message: 'تم استرجاع المجموعات الافتراضية في المحرر. اضغط حفظ لنشرها.' });
  }

  return (
    <div className="space-y-8">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#141414] p-6 rounded-3xl border border-[#cea355]/30">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#edce8b]" />
            <h2 className="text-xl font-black text-white">إدارة مجموعات العناية (الكوليكشن)</h2>
          </div>
          <p className="text-xs text-neutral-400">
            تظهر هذه المجموعات في واجهة الصفحة الرئيسية. يمكنك تعديل العناوين، الصور، وربط الخدمات المخصصة لكل مجموعة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="px-4 py-2.5 rounded-xl bg-black/50 border border-neutral-700 text-xs font-bold text-neutral-300 hover:text-white hover:border-neutral-500 transition-all flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الافتراضي</span>
          </button>

          <button
            type="button"
            onClick={handleAddNew}
            className="px-4 py-2.5 rounded-xl bg-[#1a1a1a] border border-[#cea355]/50 text-xs font-bold text-[#edce8b] hover:bg-[#cea355]/20 transition-all flex items-center gap-1.5 shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مجموعة جديدة</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isPending}
            className="px-6 py-2.5 rounded-xl gold-gradient text-white font-extrabold text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50"
          >
            {isPending ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>حفظ ونشر التعديلات</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2.5 ${
            feedback.kind === 'error'
              ? 'bg-red-500/10 border-red-500/30 text-red-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}
        >
          {feedback.kind === 'success' && <CheckCircle2 className="w-4 h-4" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Collections List */}
      <div className="space-y-6">
        {collections.map((col, index) => {
          const isEditing = editingId === col.id;
          return (
            <div
              key={col.id}
              className={`rounded-3xl border transition-all overflow-hidden ${
                isEditing
                  ? 'border-[#cea355] bg-[#121212] shadow-[0_0_30px_rgba(206,163,85,0.15)]'
                  : 'border-neutral-800 bg-[#0f0f0f] hover:border-neutral-700'
              }`}
            >
              {/* Card Summary Header */}
              <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#141414]/80 border-b border-neutral-800/80">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden border border-[#cea355]/30 bg-black shrink-0 relative">
                    <PublicImage
                      src={col.image}
                      alt={col.titleAr}
                      sizes="64px"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-[#cea355]/20 text-[#edce8b] text-[10px] font-bold border border-[#cea355]/30">
                        {col.badge}
                      </span>
                      {!col.active && (
                        <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-[10px] font-bold">
                          مخفية
                        </span>
                      )}
                      <span className="text-xs text-neutral-400">
                        ({col.serviceIds.length} خدمة مربوطة)
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-white mt-1">{col.titleAr}</h3>
                  </div>
                </div>

                {/* Card Controls */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    title="تحريك لأعلى"
                    disabled={index === 0}
                    onClick={() => movePriority(index, 'up')}
                    className="p-2 rounded-xl bg-black border border-neutral-800 text-neutral-400 hover:text-white disabled:opacity-30"
                  >
                    <MoveUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    title="تحريك لأسفل"
                    disabled={index === collections.length - 1}
                    onClick={() => movePriority(index, 'down')}
                    className="p-2 rounded-xl bg-black border border-neutral-800 text-neutral-400 hover:text-white disabled:opacity-30"
                  >
                    <MoveDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateField(col.id, 'active', !col.active)}
                    className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 ${
                      col.active
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    {col.active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : col.id)}
                    className="px-3.5 py-2 rounded-xl bg-[#1a1a1a] border border-[#cea355]/40 text-xs font-bold text-white hover:bg-[#cea355]/20 transition-all flex items-center gap-1"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-[#edce8b]" />
                    <span>{isEditing ? 'إغلاق التعديل' : 'تعديل البيانات'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(col.id)}
                    className="p-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Editing Form Panel */}
              {isEditing && (
                <div className="p-6 sm:p-8 space-y-6 bg-[#111111]">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    
                    {/* Title */}
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-xs font-bold text-neutral-300">عنوان الكوليكشن</label>
                      <input
                        type="text"
                        value={col.titleAr}
                        onChange={(e) => handleUpdateField(col.id, 'titleAr', e.target.value)}
                        className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#cea355]"
                        placeholder="مثال: العناية الخارجية بالدهان"
                      />
                    </div>

                    {/* Description */}
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-xs font-bold text-neutral-300">وصف الكوليكشن</label>
                      <textarea
                        rows={2}
                        value={col.descriptionAr}
                        onChange={(e) => handleUpdateField(col.id, 'descriptionAr', e.target.value)}
                        className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#cea355]"
                        placeholder="شرح موجز عن نوع العناية والمواد المستخدمة..."
                      />
                    </div>

                    {/* Image Selection */}
                    <div className="md:col-span-2 space-y-3">
                      <label className="text-xs font-bold text-neutral-300 flex items-center justify-between">
                        <span>صورة الكوليكشن</span>
                        <span className="text-[11px] text-neutral-500 font-normal">اختر من الصور الجاهزة أو ضع مسار الصورة</span>
                      </label>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        {PRESET_COLLECTION_IMAGES.map((preset) => {
                          const isSelected = col.image === preset.url;
                          return (
                            <button
                              key={preset.url}
                              type="button"
                              onClick={() => handleUpdateField(col.id, 'image', preset.url)}
                              className={`relative rounded-2xl overflow-hidden border p-1 text-right transition-all group ${
                                isSelected
                                  ? 'border-[#cea355] bg-[#cea355]/10 shadow-md ring-2 ring-[#cea355]/30'
                                  : 'border-neutral-800 bg-[#090909] hover:border-neutral-700'
                              }`}
                            >
                              <div className="h-16 w-full rounded-xl overflow-hidden bg-black relative">
                                <PublicImage
                                  src={preset.url}
                                  alt={preset.label}
                                  sizes="120px"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                                {isSelected && (
                                  <div className="absolute top-1 left-1 w-5 h-5 rounded-full gold-gradient flex items-center justify-center text-white shadow">
                                    <Check className="w-3 h-3" />
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] font-bold text-white block mt-1.5 px-1 truncate">
                                {preset.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="pt-2">
                        <input
                          type="text"
                          value={col.image}
                          onChange={(e) => handleUpdateField(col.id, 'image', e.target.value)}
                          className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-xs text-neutral-300 font-mono focus:outline-none focus:border-[#cea355]"
                          placeholder="مسار مخصص للصورة مثل /images/custom.png"
                        />
                      </div>
                    </div>

                    {/* Services Selector for this Collection */}
                    <div className="md:col-span-2 space-y-3 pt-4 border-t border-neutral-800/80">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-sm font-black text-white block">
                            الخدمات التابعة لهذه المجموعة ({col.serviceIds.length} محددة)
                          </label>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            حدد الخدمات التي تندرج تحت هذا الكوليكشن عند استعراضه.
                          </p>
                        </div>
                      </div>

                      {availableServices.length === 0 ? (
                        <p className="text-xs text-neutral-500">لا توجد خدمات مضافة في النظام حتى الآن.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                          {availableServices.map((service) => {
                            const isChecked = col.serviceIds.includes(service.id);
                            return (
                              <label
                                key={service.id}
                                className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                                  isChecked
                                    ? 'bg-[#cea355]/10 border-[#cea355]/60 text-white'
                                    : 'bg-[#080808] border-neutral-800/80 text-neutral-400 hover:border-neutral-700'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleServiceInCollection(col.id, service.id)}
                                  className="accent-[#cea355] w-4 h-4 mt-0.5 rounded shrink-0"
                                />
                                <div className="space-y-0.5">
                                  <span className="text-xs font-bold text-white block">{service.nameAr}</span>
                                  <span className="text-[11px] text-neutral-400 block">
                                    {service.basePrice} ج.م • {service.durationMinutes} دقيقة
                                  </span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
