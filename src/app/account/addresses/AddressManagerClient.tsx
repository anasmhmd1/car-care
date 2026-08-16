'use client';

import { useState } from 'react';
import { Plus, Trash2, CheckCircle2, Navigation, Pencil, AlertCircle, Building2, MapPin } from 'lucide-react';
import { sanitizeLocationUrl } from '@/lib/security/url';

export interface CoverageAreaItem {
  id: string;
  compound: string;
  district: string;
  city: string;
  governorate: string;
}

export interface CoverageZoneItem {
  id: string;
  name: string;
  areas: CoverageAreaItem[];
}

export interface SavedAddressItem {
  id: string;
  governorate: string;
  city: string;
  district: string;
  compound: string;
  street: string;
  buildingNumber: string;
  unitNumber: string | null;
  landmark: string | null;
  gateInstructions: string | null;
  locationUrl: string | null;
  isDefault: boolean;
}

interface AddressManagerClientProps {
  initialAddresses: SavedAddressItem[];
  coverageZones: CoverageZoneItem[];
  addAddressAction: (formData: FormData) => Promise<void>;
  updateAddressAction: (formData: FormData) => Promise<void>;
  deleteAddressAction: (formData: FormData) => Promise<void>;
}

function normalize(text: string) {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

function findMatchingArea(address: SavedAddressItem, zones: CoverageZoneItem[]) {
  const allAreas = zones.flatMap((z) => z.areas);
  const normComp = normalize(address.compound);
  const normCity = normalize(address.city);
  const normDist = normalize(address.district);

  return allAreas.find((area) => {
    const areaComp = normalize(area.compound);
    const areaCity = normalize(area.city);
    const areaDist = normalize(area.district);

    if (areaComp === normComp && areaCity === normCity) return true;
    if (areaComp && normComp && (areaComp.includes(normComp) || normComp.includes(areaComp))) return true;
    if (areaCity === normCity && areaDist === normDist) return true;
    return false;
  });
}

function EditAddressForm({
  address,
  coverageZones,
  updateAddressAction,
}: {
  address: SavedAddressItem;
  coverageZones: CoverageZoneItem[];
  updateAddressAction: (formData: FormData) => Promise<void>;
}) {
  const matchedArea = findMatchingArea(address, coverageZones);
  const initialZone = coverageZones.find((z) => z.areas.some((a) => a.id === matchedArea?.id)) || coverageZones[0];
  const [editZoneId, setEditZoneId] = useState<string>(initialZone?.id || '');
  const activeEditZone = coverageZones.find((z) => z.id === editZoneId) || coverageZones[0];
  const [editAreaId, setEditAreaId] = useState<string>(matchedArea?.id || activeEditZone?.areas[0]?.id || '');
  const activeEditArea = activeEditZone?.areas.find((a) => a.id === editAreaId) || activeEditZone?.areas[0];

  function handleEditZoneChange(newZoneId: string) {
    setEditZoneId(newZoneId);
    const z = coverageZones.find((item) => item.id === newZoneId);
    if (z && z.areas[0]) {
      setEditAreaId(z.areas[0].id);
    }
  }

  return (
    <form
      action={async (formData) => {
        await updateAddressAction(formData);
      }}
      className="mt-4 space-y-4"
    >
      <input type="hidden" name="addressId" value={address.id} />
      <input type="hidden" name="coverageAreaId" value={activeEditArea?.id || ''} />
      <input type="hidden" name="governorate" value={activeEditArea?.governorate || 'الجيزة'} />
      <input type="hidden" name="city" value={activeEditArea?.city || activeEditZone?.name || ''} />
      <input type="hidden" name="district" value={activeEditArea?.district || activeEditArea?.compound || ''} />
      <input type="hidden" name="compound" value={activeEditArea?.compound || ''} />

      <div className="p-4 rounded-2xl bg-[#101010] border border-neutral-800 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-[#e5c45a]">
          <Building2 className="w-4 h-4 text-[#c9a227]" />
          <span>تحديد النطاق والكمبوند المعتمد</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-neutral-300 font-semibold block text-xs">
              المنطقة / النطاق الرئيسي
            </label>
            <select
              value={activeEditZone?.id || ''}
              onChange={(e) => handleEditZoneChange(e.target.value)}
              className="w-full rounded-xl border border-neutral-700 bg-[#161616] p-2.5 text-white text-xs focus:outline-none focus:border-[#c9a227]"
            >
              {coverageZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-neutral-300 font-semibold block text-xs">
              الحي / الكمبوند / المنطقة الفرعية
            </label>
            <select
              value={editAreaId}
              onChange={(e) => setEditAreaId(e.target.value)}
              className="w-full rounded-xl border border-neutral-700 bg-[#161616] p-2.5 text-white text-xs focus:outline-none focus:border-[#c9a227]"
            >
              {activeEditZone?.areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.compound}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1 text-neutral-300">
          <span>الشارع</span>
          <input
            name="street"
            required
            defaultValue={address.street}
            placeholder="اسم الشارع"
            className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]"
          />
        </label>
        <label className="space-y-1 text-neutral-300">
          <span>رقم المبنى / الفيلا</span>
          <input
            name="buildingNumber"
            required
            defaultValue={address.buildingNumber}
            placeholder="رقم المبنى أو الفيلا"
            className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]"
          />
        </label>
        <label className="space-y-1 text-neutral-300">
          <span>رقم الوحدة (اختياري)</span>
          <input
            name="unitNumber"
            defaultValue={address.unitNumber ?? ''}
            placeholder="رقم الشقة أو الوحدة"
            className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]"
          />
        </label>
        <label className="space-y-1 text-neutral-300">
          <span>علامة مميزة (اختياري)</span>
          <input
            name="landmark"
            defaultValue={address.landmark ?? ''}
            placeholder="بجوار كذا..."
            className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]"
          />
        </label>
        <label className="space-y-1 text-neutral-300 sm:col-span-2">
          <span>تعليمات البوابة والأمن (اختياري)</span>
          <input
            name="gateInstructions"
            defaultValue={address.gateInstructions ?? ''}
            placeholder="تعليمات الدخول أو الأمن"
            className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]"
          />
        </label>
        <label className="space-y-1 text-neutral-300 sm:col-span-2">
          <span>رابط الخريطة Google Maps (اختياري)</span>
          <input
            name="locationUrl"
            type="url"
            defaultValue={address.locationUrl ?? ''}
            placeholder="https://maps.google.com/..."
            className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]"
          />
        </label>
        <label className="flex items-center gap-2 text-neutral-300 sm:col-span-2">
          <input
            type="checkbox"
            name="isDefault"
            defaultChecked={address.isDefault}
            className="size-4 accent-[#c9a227]"
          />
          <span>تعيين كعنوان افتراضي</span>
        </label>
      </div>

      <button
        type="submit"
        className="w-full sm:w-auto rounded-xl gold-gradient px-6 py-2.5 font-bold text-[#080808] hover:brightness-110 shadow-md"
      >
        حفظ التعديلات
      </button>
    </form>
  );
}

export default function AddressManagerClient({
  initialAddresses,
  coverageZones,
  addAddressAction,
  updateAddressAction,
  deleteAddressAction,
}: AddressManagerClientProps) {
  // Form selection state for adding address
  const [selectedZoneId, setSelectedZoneId] = useState<string>(coverageZones[0]?.id || '');
  const activeZone = coverageZones.find((z) => z.id === selectedZoneId) || coverageZones[0];
  const [selectedAreaId, setSelectedAreaId] = useState<string>(activeZone?.areas[0]?.id || '');

  const activeArea = activeZone?.areas.find((a) => a.id === selectedAreaId) || activeZone?.areas[0];

  function handleZoneChange(newZoneId: string) {
    setSelectedZoneId(newZoneId);
    const z = coverageZones.find((item) => item.id === newZoneId);
    if (z && z.areas[0]) {
      setSelectedAreaId(z.areas[0].id);
    }
  }

  return (
    <div className="space-y-8">
      {/* Add Address Form Card */}
      <div className="p-6 sm:p-7 rounded-3xl bg-[#141414] border border-[#c9a227]/30 space-y-6 shadow-xl">
        <div className="border-b border-neutral-800 pb-4">
          <h2 className="text-base font-bold text-[#e5c45a] flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#c9a227]" />
            <span>إضافة موقع جديد لملفك</span>
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            اختر المنطقة والكمبوند التابع لنطاقات التغطية المعتمدة لضمان سهولة حجز وتنفيذ الخدمة.
          </p>
        </div>

        {coverageZones.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-[#0a0a0a] p-6 text-center text-xs text-neutral-400">
            لا توجد مناطق تغطية مفعّلة حالياً من الإدارة. يُرجى مراجعة إدارة النظام.
          </div>
        ) : (
          <form
            action={async (formData) => {
              await addAddressAction(formData);
            }}
            className="space-y-4 text-xs"
          >
            {/* Zone & Compound Selection */}
            <div className="rounded-2xl bg-[#0c0c0c] border border-neutral-800/80 p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-[#e5c45a]">
                <Building2 className="w-4 h-4 text-[#c9a227]" />
                <span>نطاق التغطية والكمبوند المعتمد</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="add-zone-select" className="text-neutral-300 font-semibold block">
                    المنطقة / النطاق الرئيسي
                  </label>
                  <select
                    id="add-zone-select"
                    value={activeZone?.id || ''}
                    onChange={(e) => handleZoneChange(e.target.value)}
                    className="w-full bg-[#141414] border border-neutral-700 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
                  >
                    {coverageZones.map((z) => (
                      <option key={z.id} value={z.id} className="bg-neutral-900 text-white">
                        {z.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="add-area-select" className="text-neutral-300 font-semibold block">
                    الحي / الكمبوند / المنطقة الفرعية
                  </label>
                  <select
                    id="add-area-select"
                    value={selectedAreaId}
                    onChange={(e) => setSelectedAreaId(e.target.value)}
                    className="w-full bg-[#141414] border border-neutral-700 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
                  >
                    {activeZone?.areas.map((area) => (
                      <option key={area.id} value={area.id} className="bg-neutral-900 text-white">
                        {area.compound}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Hidden inputs automatically populated from the active coverage area */}
              <input type="hidden" name="coverageAreaId" value={activeArea?.id || ''} />
              <input type="hidden" name="governorate" value={activeArea?.governorate || 'الجيزة'} />
              <input type="hidden" name="city" value={activeArea?.city || activeZone?.name || ''} />
              <input type="hidden" name="district" value={activeArea?.district || activeArea?.compound || ''} />
              <input type="hidden" name="compound" value={activeArea?.compound || ''} />
            </div>

            {/* Street and building details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-1">
              <div className="space-y-1">
                <label className="text-neutral-300 font-semibold block">الشارع</label>
                <input
                  type="text"
                  name="street"
                  required
                  placeholder="اسم الشارع الرئيسي أو الداخلي"
                  className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-neutral-300 font-semibold block">رقم المبنى / الفيلا</label>
                <input
                  type="text"
                  name="buildingNumber"
                  required
                  placeholder="رقم الفيلا أو عمارة"
                  className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-neutral-300 font-semibold block">رقم الوحدة (اختياري)</label>
                <input
                  type="text"
                  name="unitNumber"
                  placeholder="مثال: شقة 12 / دوبلكس"
                  className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-neutral-300 font-semibold block">علامة مميزة (اختياري)</label>
                <input
                  type="text"
                  name="landmark"
                  placeholder="مثال: بجوار النادي أو البوابة 3"
                  className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-neutral-300 font-semibold block">تعليمات دخول البوابة والأمن (اختياري)</label>
                <input
                  type="text"
                  name="gateInstructions"
                  placeholder="مثال: إبلاغ الأمن باسم الفيلا عند البوابة"
                  className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
                />
              </div>

              <div className="sm:col-span-2 md:col-span-3 space-y-1">
                <label className="text-neutral-300 font-semibold block">رابط الخريطة Google Maps (اختياري)</label>
                <input
                  type="url"
                  name="locationUrl"
                  placeholder="https://maps.google.com/?q=..."
                  className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-3 border-t border-neutral-800/80">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-neutral-300">
                <input type="checkbox" name="isDefault" className="accent-[#c9a227] w-4 h-4 rounded" />
                <span>تعيين هذا الموقع كموقع افتراضي للحجوزات</span>
              </label>

              <button
                type="submit"
                className="gold-gradient text-[#080808] font-bold px-6 py-2.5 rounded-xl text-xs shadow-md hover:brightness-110 transition-all"
              >
                حفظ العنوان 📍
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Saved Addresses List */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-[#e5c45a]">العناوين المسجلة ({initialAddresses.length})</h2>

        {initialAddresses.length === 0 ? (
          <div className="p-8 rounded-3xl bg-[#141414] border border-dashed border-neutral-800 text-center text-neutral-500 text-xs">
            لا توجد عناوين مسجلة بحسابك حتى الآن. أضف موقعك الأول بالنموذج أعلاه!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {initialAddresses.map((a) => {
              const matchedArea = findMatchingArea(a, coverageZones);

              return (
                <div
                  key={a.id}
                  className={`p-5 rounded-2xl bg-[#141414] border ${
                    a.isDefault ? 'border-[#c9a227]/60 shadow-lg shadow-[#c9a227]/5' : 'border-neutral-800'
                  } space-y-4 flex flex-col justify-between hover:border-[#c9a227]/40 transition-all`}
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1a1a1a] text-neutral-300 border border-neutral-700">
                            {a.compound || a.city}
                          </span>
                          {a.isDefault && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-[#e5c45a] border border-[#c9a227]/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-[#c9a227]" />
                              <span>العنوان الافتراضي</span>
                            </span>
                          )}
                          {matchedArea ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              ✓ نطاق خدمة معتمد
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              <span>بحاجة لتحديث النطاق</span>
                            </span>
                          )}
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-white mt-2">
                          📍 {a.street} - مبنى/فيلا {a.buildingNumber}
                        </h3>
                      </div>
                    </div>

                    <div className="text-xs text-neutral-400 space-y-1 bg-[#0a0a0a]/50 p-3 rounded-xl border border-neutral-800/50">
                      <div>
                        <strong className="text-neutral-300">الكمبوند والمنطقة:</strong> {a.compound} — {a.city}
                      </div>
                      {a.unitNumber && (
                        <div>
                          <strong className="text-neutral-300">الوحدة:</strong> {a.unitNumber}
                        </div>
                      )}
                      {a.landmark && (
                        <div>
                          <strong className="text-neutral-300">علامة مميزة:</strong> {a.landmark}
                        </div>
                      )}
                      {a.gateInstructions && (
                        <div>
                          <strong className="text-neutral-300">الدخول والأمن:</strong> {a.gateInstructions}
                        </div>
                      )}
                      {sanitizeLocationUrl(a.locationUrl) && (
                        <div className="pt-1">
                          <a
                            href={sanitizeLocationUrl(a.locationUrl)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#e5c45a] hover:underline font-bold flex items-center gap-1"
                          >
                            <Navigation className="w-3.5 h-3.5 text-[#c9a227]" />
                            <span>فتح موقع الخريطة في Google Maps</span>
                          </a>
                        </div>
                      )}
                    </div>

                    {!matchedArea && (
                      <p className="text-[11px] text-amber-300/90 bg-amber-950/20 border border-amber-800/30 p-2.5 rounded-xl">
                        ⚠️ هذا العنوان مسجل بنطاق قديم أو غير محدد. اضغط «تعديل بيانات العنوان» بالأسفل واختر النطاق والكمبوند المعتمد لتتمكن من الحجز به فوراً.
                      </p>
                    )}
                  </div>

                  <details className="rounded-xl border border-neutral-800 bg-[#080808]/50 p-3 text-xs">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 font-bold text-[#e5c45a] marker:hidden">
                      <Pencil className="size-3.5" aria-hidden="true" />
                      <span>تعديل بيانات العنوان</span>
                    </summary>
                    <EditAddressForm
                      address={a}
                      coverageZones={coverageZones}
                      updateAddressAction={updateAddressAction}
                    />
                  </details>

                  <div className="pt-3 border-t border-neutral-800 flex justify-between items-center text-xs">
                    <form
                      action={async (formData) => {
                        await deleteAddressAction(formData);
                      }}
                    >
                      <input type="hidden" name="addressId" value={a.id} />
                      <button
                        type="submit"
                        className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 font-semibold"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف العنوان</span>
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
