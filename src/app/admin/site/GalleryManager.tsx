'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Images,
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
  HelpCircle,
} from 'lucide-react';
import PublicImage from '@/components/PublicImage';
import {
  DEFAULT_GALLERY_ITEMS,
  PRESET_GALLERY_IMAGES,
  type GalleryItem,
} from '@/lib/gallery-items';
import { saveGalleryAction, resetGalleryAction } from '@/app/actions/owner-gallery';

interface GalleryManagerProps {
  initialGallery: GalleryItem[];
}

export default function GalleryManager({ initialGallery }: GalleryManagerProps) {
  const router = useRouter();
  const [gallery, setGallery] = useState<GalleryItem[]>(initialGallery);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Add new gallery photo template
  function handleAddNew() {
    const newId = `gal_${Date.now()}`;
    const newItem: GalleryItem = {
      id: newId,
      titleAr: 'صورة جديدة للمعرض',
      image: '/images/bareeq_hero_car.png',
      altAr: 'صورة لخدمات بريق',
      active: true,
      priority: gallery.length + 1,
    };
    setGallery((prev) => [...prev, newItem]);
    setEditingId(newId);
    setFeedback(null);
  }

  function handleRemove(id: string) {
    if (gallery.length <= 1) {
      setFeedback({ kind: 'error', message: 'يجب الإبقاء على صورة واحدة على الأقل في المعرض.' });
      return;
    }
    setGallery((prev) => prev.filter((g) => g.id !== id));
    if (editingId === id) setEditingId(null);
    setFeedback(null);
  }

  function handleUpdateField<K extends keyof GalleryItem>(id: string, field: K, value: GalleryItem[K]) {
    setGallery((prev) =>
      prev.map((g) => (g.id === id ? { ...g, [field]: value } : g))
    );
  }

  function movePriority(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= gallery.length) return;

    const newGallery = [...gallery];
    const temp = newGallery[index];
    newGallery[index] = newGallery[targetIndex];
    newGallery[targetIndex] = temp;

    // Update priorities based on new indices
    const updated = newGallery.map((item, idx) => ({
      ...item,
      priority: idx + 1,
    }));

    setGallery(updated);
  }

  function handleSave() {
    setFeedback(null);
    startTransition(async () => {
      const res = await saveGalleryAction(gallery);
      if (res.error) {
        setFeedback({ kind: 'error', message: res.error });
      } else {
        setFeedback({ kind: 'success', message: res.message || 'تم حفظ ونشر معرض الصور بنجاح.' });
        router.refresh();
      }
    });
  }

  function handleReset() {
    if (!window.confirm('هل أنت متأكد من استعادة الصور الافتراضية للمعرض؟')) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await resetGalleryAction();
      if (res.error) {
        setFeedback({ kind: 'error', message: res.error });
      } else {
        setGallery(DEFAULT_GALLERY_ITEMS);
        setEditingId(null);
        setFeedback({ kind: 'success', message: 'تمت استعادة الصور الافتراضية بنجاح.' });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8" dir="rtl">
      
      {/* Action Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-[#121212] p-6 rounded-3xl border border-neutral-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Images className="w-5 h-5 text-[#cea355]" />
            <span>معرض الصور والنتائج الحقيقية (Gallery)</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
            تحكم كامل في الصور المعروضة بقسم &quot;لمسات بريق — نتائج حقيقية&quot;، مع إمكانية تعديل أسماء الصور، استبدال الروابط، وإعادة الترتيب.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleAddNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1c1c1c] border border-[#cea355]/40 hover:border-[#cea355] text-[#edce8b] text-xs font-bold transition-all shadow-md active:scale-95"
          >
            <Plus className="w-4 h-4 text-[#cea355]" />
            <span>إضافة صورة للمعرض</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white text-xs font-medium transition-all"
            title="استعادة الصور الافتراضية"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الافتراضي</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl gold-gradient text-white text-xs font-extrabold shadow-lg shadow-[#cea355]/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
          >
            {isPending ? (
              <>
                <LoaderCircle className="w-4 h-4 animate-spin" />
                <span>جارٍ الحفظ...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>حفظ ونشر التعديلات</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
            feedback.kind === 'error'
              ? 'bg-red-950/40 border-red-800/80 text-red-300'
              : 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <HelpCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Gallery Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {gallery.map((item, index) => {
          const isEditing = editingId === item.id;

          return (
            <div
              key={item.id}
              className={`rounded-3xl border transition-all overflow-hidden flex flex-col justify-between ${
                isEditing
                  ? 'bg-[#151515] border-[#cea355] shadow-2xl shadow-[#cea355]/10'
                  : item.active
                  ? 'bg-[#101010] border-neutral-800 hover:border-neutral-700'
                  : 'bg-[#0a0a0a] border-neutral-900 opacity-60'
              }`}
            >
              {/* Image Preview & Quick Controls */}
              <div className="relative h-56 bg-[#080808] overflow-hidden group">
                <PublicImage
                  src={item.image}
                  alt={item.titleAr}
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

                {/* Priority & Status Badges */}
                <div className="absolute top-3 start-3 flex items-center gap-1.5 z-10">
                  <span className="w-6 h-6 rounded-lg bg-black/70 backdrop-blur-md text-[11px] font-bold text-[#edce8b] border border-white/10 flex items-center justify-center">
                    {index + 1}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold border backdrop-blur-md ${
                      item.active
                        ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-400'
                        : 'bg-neutral-900/80 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    {item.active ? 'ظاهرة بالموقع' : 'مخفية'}
                  </span>
                </div>

                {/* Quick Action Buttons on Image */}
                <div className="absolute top-3 end-3 flex items-center gap-1.5 z-10">
                  <button
                    type="button"
                    onClick={() => movePriority(index, 'up')}
                    disabled={index === 0}
                    className="w-7 h-7 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-white hover:text-[#cea355] flex items-center justify-center disabled:opacity-25"
                    title="تحريك لأعلى"
                  >
                    <MoveUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePriority(index, 'down')}
                    disabled={index === gallery.length - 1}
                    className="w-7 h-7 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-white hover:text-[#cea355] flex items-center justify-center disabled:opacity-25"
                    title="تحريك لأسفل"
                  >
                    <MoveDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    className="w-7 h-7 rounded-lg bg-red-950/70 backdrop-blur-md border border-red-800/40 text-red-400 hover:text-red-200 flex items-center justify-center"
                    title="حذف الصورة"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Title on Image Overlay */}
                <div className="absolute bottom-3 start-3 end-3 z-10">
                  <p className="text-xs font-bold text-white truncate drop-shadow-md">
                    {item.titleAr}
                  </p>
                </div>
              </div>

              {/* Form / Details */}
              <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                {isEditing ? (
                  <div className="space-y-3.5">
                    {/* Title Input */}
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-300 mb-1">
                        اسم وعنوان الصورة
                      </label>
                      <input
                        type="text"
                        value={item.titleAr}
                        onChange={(e) => handleUpdateField(item.id, 'titleAr', e.target.value)}
                        placeholder="مثال: لمعان دهان بتركيبة الواكس من بريق"
                        className="w-full rounded-xl bg-[#0a0a0a] border border-neutral-700 px-3 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-[#cea355] focus:outline-none"
                      />
                    </div>

                    {/* Image URL Input */}
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-300 mb-1">
                        رابط الصورة
                      </label>
                      <input
                        type="text"
                        value={item.image}
                        onChange={(e) => handleUpdateField(item.id, 'image', e.target.value)}
                        placeholder="/images/bareeq_hero_car.png أو رابط مباشر"
                        dir="ltr"
                        className="w-full rounded-xl bg-[#0a0a0a] border border-neutral-700 px-3 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-[#cea355] focus:outline-none font-mono"
                      />
                    </div>

                    {/* Presets Picker */}
                    <div>
                      <label className="block text-[10px] font-semibold text-neutral-400 mb-1.5">
                        أو اختر صورة جاهزة من مكتبة المنصة:
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {PRESET_GALLERY_IMAGES.map((preset, pIdx) => (
                          <button
                            key={pIdx}
                            type="button"
                            onClick={() => handleUpdateField(item.id, 'image', preset.url)}
                            className={`p-1.5 rounded-lg border text-[10px] text-right truncate transition-all ${
                              item.image === preset.url
                                ? 'bg-[#cea355]/20 border-[#cea355] text-[#edce8b] font-bold'
                                : 'bg-[#0a0a0a] border-neutral-800 text-neutral-400 hover:text-white'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Alt Text (SEO) */}
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-300 mb-1">
                        النص البديل (Alt Text - SEO)
                      </label>
                      <input
                        type="text"
                        value={item.altAr}
                        onChange={(e) => handleUpdateField(item.id, 'altAr', e.target.value)}
                        placeholder="وصف مختصر لمحتوى الصورة لمحركات البحث"
                        className="w-full rounded-xl bg-[#0a0a0a] border border-neutral-700 px-3 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-[#cea355] focus:outline-none"
                      />
                    </div>

                    {/* Active Status Switch */}
                    <div className="pt-2 flex items-center justify-between border-t border-neutral-800">
                      <span className="text-xs text-neutral-300 font-medium">حالة الظهور بالمعرض:</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateField(item.id, 'active', !item.active)}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                          item.active
                            ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-400'
                            : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                        }`}
                      >
                        {item.active ? (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>مفعلة</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>مخفية</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Done Editing Button */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="w-full py-2 rounded-xl bg-[#202020] hover:bg-[#282828] text-white text-xs font-bold border border-neutral-700 transition-all"
                      >
                        تم التعديل
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-white line-clamp-1">{item.titleAr}</h4>
                      <p className="text-[11px] text-neutral-400 line-clamp-1 font-mono dir-ltr text-right">
                        {item.image}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80">
                      <button
                        type="button"
                        onClick={() => handleUpdateField(item.id, 'active', !item.active)}
                        className={`text-[11px] font-bold flex items-center gap-1.5 transition-colors ${
                          item.active ? 'text-emerald-400 hover:text-emerald-300' : 'text-neutral-500 hover:text-neutral-300'
                        }`}
                      >
                        {item.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        <span>{item.active ? 'ظاهرة' : 'مخفية'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingId(item.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1a1a1a] hover:bg-[#222222] text-[#edce8b] border border-[#cea355]/30 hover:border-[#cea355] text-xs font-bold transition-all"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>تعديل الصورة</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
