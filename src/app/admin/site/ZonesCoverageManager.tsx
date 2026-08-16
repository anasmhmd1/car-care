'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  MapPin,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  Building2,
  X,
  Compass,
} from 'lucide-react';
import { saveZoneWithAreasAction, deleteZoneAction } from '@/app/actions/owner-zones';

export interface CoverageAreaItem {
  id: string;
  compound: string;
  district: string;
  active: boolean;
  priority: number;
}

export interface CoverageZoneItem {
  id: string;
  branchId: string;
  name: string;
  description: string | null;
  areas: CoverageAreaItem[];
}

interface BranchDto {
  id: string;
  nameAr: string;
}

interface ZonesCoverageManagerProps {
  initialZones: CoverageZoneItem[];
  defaultBranchId: string;
  branches?: BranchDto[];
}

export default function ZonesCoverageManager({
  initialZones,
  defaultBranchId,
  branches = [],
}: ZonesCoverageManagerProps) {
  const router = useRouter();
  const [zones, setZones] = useState<CoverageZoneItem[]>(initialZones);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    defaultBranchId || branches[0]?.id || initialZones[0]?.branchId || ''
  );
  const filteredZones = zones.filter((z) => !selectedBranchId || z.branchId === selectedBranchId);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(filteredZones[0]?.id ?? null);
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // New compound input state per zone
  const [newCompoundInputs, setNewCompoundInputs] = useState<Record<string, string>>({});

  function handleAddZone() {
    const activeBranch = selectedBranchId || defaultBranchId;
    const tempId = `temp_${Date.now()}`;
    const newZone: CoverageZoneItem = {
      id: tempId,
      branchId: activeBranch,
      name: 'نطاق تغطية جديد',
      description: 'وصف المنطقة والأحياء المدعومة...',
      areas: [
        { id: `temp_area_${Date.now()}_1`, compound: 'المنطقة الأولى', district: 'المنطقة الأولى', active: true, priority: 1 },
      ],
    };
    setZones([newZone, ...zones]);
    setEditingZoneId(tempId);
    setNotice({ kind: 'success', text: 'تمت إضافة نطاق جديد للفرع المختار. قم بتعديل الاسم والأحياء ثم اضغط حفظ.' });
  }

  function handleUpdateZoneField(zoneId: string, field: 'name' | 'description', value: string) {
    setZones((prev) =>
      prev.map((z) => (z.id === zoneId ? { ...z, [field]: value } : z))
    );
  }

  function handleAddCompound(zoneId: string) {
    const compoundName = (newCompoundInputs[zoneId] || '').trim();
    if (!compoundName) return;

    setZones((prev) =>
      prev.map((z) => {
        if (z.id !== zoneId) return z;
        const newArea: CoverageAreaItem = {
          id: `temp_area_${Date.now()}_${Math.random()}`,
          compound: compoundName,
          district: compoundName,
          active: true,
          priority: z.areas.length + 1,
        };
        return { ...z, areas: [...z.areas, newArea] };
      })
    );

    setNewCompoundInputs((prev) => ({ ...prev, [zoneId]: '' }));
  }

  function handleRemoveCompound(zoneId: string, areaId: string) {
    setZones((prev) =>
      prev.map((z) => {
        if (z.id !== zoneId) return z;
        return { ...z, areas: z.areas.filter((a) => a.id !== areaId) };
      })
    );
  }

  function handleSaveZone(zone: CoverageZoneItem) {
    if (!zone.name.trim()) {
      setNotice({ kind: 'error', text: 'اسم الزون مطلوب.' });
      return;
    }

    setNotice(null);
    startTransition(async () => {
      const isNew = zone.id.startsWith('temp_');
      const result = await saveZoneWithAreasAction({
        zoneId: isNew ? undefined : zone.id,
        branchId: zone.branchId || defaultBranchId,
        name: zone.name,
        description: zone.description || '',
        compounds: zone.areas.map((a) => ({
          id: a.id.startsWith('temp_') ? undefined : a.id,
          compound: a.compound,
          district: a.district || a.compound,
        })),
      });

      if (result.error) {
        setNotice({ kind: 'error', text: result.error });
      } else {
        setNotice({ kind: 'success', text: result.message || 'تم حفظ النطاق بنجاح.' });
        router.refresh();
      }
    });
  }

  function handleDeleteZone(zoneId: string) {
    if (zoneId.startsWith('temp_')) {
      setZones((prev) => prev.filter((z) => z.id !== zoneId));
      return;
    }

    if (!confirm('هل أنت متأكد من حذف هذا النطاق وكافة الأحياء والكمبوندات التابعة له؟')) {
      return;
    }

    setNotice(null);
    startTransition(async () => {
      const result = await deleteZoneAction(zoneId);
      if (result.error) {
        setNotice({ kind: 'error', text: result.error });
      } else {
        setZones((prev) => prev.filter((z) => z.id !== zoneId));
        setNotice({ kind: 'success', text: result.message || 'تم حذف النطاق بنجاح.' });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8 text-right" dir="rtl">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-[#141414] to-[#0c0c0c] border border-[#cea355]/30 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#edce8b]" />
            <h2 className="text-xl font-black text-white">إدارة نطاقات التغطية والكمبوندات</h2>
          </div>
          <p className="text-xs text-neutral-300">
            أضف أو عدّل أسماء الزونات (مثل الشيخ زايد، التجمع الخامس) وضع داخل كل زون الأحياء والكمبوندات المدعومة.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAddZone}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl gold-gradient text-white font-extrabold text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#cea355]/20 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة نطاق / زون جديد</span>
        </button>
      </div>

      {/* Branch Selector Tabs */}
      {branches && branches.length > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#0d0d0d] border border-neutral-800">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-300">
            <Building2 className="w-4 h-4 text-[#cea355]" />
            <span>الفرع الحالي لإدارة النطاقات:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {branches.map((b) => {
              const count = zones.filter((z) => z.branchId === b.id).length;
              const isSelected = (selectedBranchId || defaultBranchId) === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setSelectedBranchId(b.id);
                    const firstInBranch = zones.find((z) => z.branchId === b.id);
                    setEditingZoneId(firstInBranch?.id ?? null);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    isSelected
                      ? 'gold-gradient text-black shadow-lg shadow-[#cea355]/20'
                      : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
                  }`}
                >
                  <span>{b.nameAr}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${isSelected ? 'bg-black/20 text-black' : 'bg-neutral-800 text-neutral-400'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Notifications */}
      {notice && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in duration-300 ${
            notice.kind === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border border-red-500/30 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            )}
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="p-1 hover:opacity-75"
            aria-label="إغلاق الإشعار"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Zones List */}
      <div className="space-y-6">
        {filteredZones.length === 0 ? (
          <div className="p-12 text-center rounded-3xl border border-neutral-800 bg-[#0f0f0f] space-y-3">
            <MapPin className="w-10 h-10 text-neutral-600 mx-auto" />
            <p className="text-sm font-bold text-white">لا توجد نطاقات تغطية لهذا الفرع حالياً</p>
            <p className="text-xs text-neutral-400">ابدأ بإضافة نطاقك الأول لإظهاره في صفحة مناطق التغطية وشاشة الحجز.</p>
            <button
              type="button"
              onClick={handleAddZone}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl gold-gradient text-white text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة زون للفرع الآن</span>
            </button>
          </div>
        ) : (
          filteredZones.map((zone, idx) => {
            const isEditing = editingZoneId === zone.id;
            return (
              <div
                key={zone.id}
                className={`rounded-3xl border transition-all duration-300 overflow-hidden ${
                  isEditing
                    ? 'border-[#cea355] bg-[#121212] shadow-2xl shadow-[#cea355]/10'
                    : 'border-neutral-800/90 bg-[#0d0d0d] hover:border-neutral-700'
                }`}
              >
                {/* Zone Header Bar */}
                <div className="p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800/80 bg-[#141414]/70">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl gold-gradient text-black font-black text-xs flex items-center justify-center shadow-md shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <h3 className="text-lg font-black text-white flex items-center gap-2">
                        <span>{zone.name || 'بدون اسم'}</span>
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#cea355]/15 text-[#edce8b] border border-[#cea355]/30">
                          {zone.areas.length} أحياء وكمبوندات
                        </span>
                      </h3>
                      {zone.description && (
                        <p className="text-xs text-neutral-300 mt-1">{zone.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setEditingZoneId(isEditing ? null : zone.id)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-[#1a1a1a] border border-neutral-700 text-neutral-200 hover:text-white hover:border-[#cea355] transition-all"
                    >
                      {isEditing ? 'إغلاق التعديل' : 'تعديل النطاق'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveZone(zone)}
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl gold-gradient text-white text-xs font-extrabold hover:brightness-110 transition-all disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>حفظ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteZone(zone.id)}
                      disabled={isPending}
                      className="p-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all"
                      title="حذف النطاق"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Edit Form Body */}
                {isEditing && (
                  <div className="p-6 sm:p-8 space-y-6 bg-[#111111]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      
                      {/* Zone Name */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-300">
                          اسم النطاق / الزون الرئيسي
                        </label>
                        <input
                          type="text"
                          value={zone.name}
                          onChange={(e) => handleUpdateZoneField(zone.id, 'name', e.target.value)}
                          className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#cea355]"
                          placeholder="مثال: الشيخ زايد، أو التجمع الخامس"
                        />
                      </div>

                      {/* Zone Description */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-300">
                          وصف النطاق (يظهر في صفحة التغطية)
                        </label>
                        <input
                          type="text"
                          value={zone.description || ''}
                          onChange={(e) => handleUpdateZoneField(zone.id, 'description', e.target.value)}
                          className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#cea355]"
                          placeholder="مثال: الأحياء السكنية والكمبوندات المركزية بالشيخ زايد"
                        />
                      </div>

                    </div>

                    {/* Compounds / Sub-areas List & Input */}
                    <div className="space-y-3 pt-4 border-t border-neutral-800">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <label className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-[#edce8b]" />
                          <span>الأحياء والكمبوندات المدعومة داخل هذا الزون:</span>
                        </label>
                        <span className="text-[11px] text-neutral-400">
                          اكتب اسم الحي أو الكمبوند واضغط إضافة
                        </span>
                      </div>

                      {/* Add new compound input */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newCompoundInputs[zone.id] || ''}
                          onChange={(e) =>
                            setNewCompoundInputs((prev) => ({
                              ...prev,
                              [zone.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCompound(zone.id);
                            }
                          }}
                          placeholder="اكتب اسم الحي أو الكمبوند (مثال: الحي الثامن، بيفرلي هيلز، سوديك)..."
                          className="flex-1 bg-[#080808] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[#cea355]"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddCompound(zone.id)}
                          className="px-5 py-3 rounded-xl bg-[#1c1c1c] border border-[#cea355]/40 text-[#edce8b] hover:bg-[#cea355]/20 font-bold text-xs transition-all shrink-0"
                        >
                          + إضافة
                        </button>
                      </div>

                      {/* Compounds Tags */}
                      <div className="flex flex-wrap gap-2.5 pt-2">
                        {zone.areas.map((area) => (
                          <span
                            key={area.id}
                            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#161616] border border-neutral-700 text-xs font-bold text-white group hover:border-[#cea355] transition-all"
                          >
                            <span>{area.compound}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveCompound(zone.id, area.id)}
                              className="text-neutral-400 hover:text-red-400 p-0.5 rounded-md hover:bg-neutral-800 transition-all"
                              title="حذف هذا الكمبوند"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Bottom Save Action */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
                      <button
                        type="button"
                        onClick={() => handleSaveZone(zone)}
                        disabled={isPending}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl gold-gradient text-white font-extrabold text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#cea355]/20"
                      >
                        <Save className="w-4 h-4" />
                        <span>حفظ بيانات هذا النطاق</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
