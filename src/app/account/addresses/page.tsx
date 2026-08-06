import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { addAddressAction, deleteAddressAction, updateAddressAction } from '@/app/actions/customer';
import { MapPin, Plus, Trash2, ChevronRight, CheckCircle2, Navigation, Pencil } from 'lucide-react';
import { sanitizeLocationUrl } from '@/lib/security/url';

export const metadata = {
  title: 'عناويني المسجلة | بريق للعناية بالسيارات',
};

export default async function AddressesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; kind?: string }>;
}) {
  const user = await requireRole([UserRole.CUSTOMER]);
  const query = await searchParams;

  const customer = await db.customerProfile.findUnique({
    where: { userId: user.id },
    include: { addresses: { orderBy: { createdAt: 'desc' } } },
  });

  if (!customer) {
    redirect('/login');
  }

  const addresses = customer.addresses;

  return (
    <div className="space-y-10 pb-12" dir="rtl">
        {query.notice ? (
          <p role={query.kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-3 text-xs font-bold ${query.kind === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
            {query.notice}
          </p>
        ) : null}
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-5">
          <div>
            <Link href="/account" className="text-xs text-[#e5c45a] font-bold hover:underline flex items-center gap-1">
              <ChevronRight className="w-4 h-4 text-[#c9a227]" />
              <span>العودة للوحة حسابي</span>
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-2 flex items-center gap-2">
              <MapPin className="w-7 h-7 text-[#c9a227]" />
              <span>عناويني ومواقع تنفيذ الخدمة</span>
            </h1>
            <p className="text-xs text-neutral-400 mt-1">سجل مواقعك ومنازلكم لتسهيل اختيار موقع استقبال سيارة الخدمة المتنقلة عند الحجز.</p>
          </div>
        </div>

        {/* Add Address Form */}
        <div className="p-6 rounded-3xl bg-[#141414] border border-[#c9a227]/30 space-y-6 shadow-xl">
          <h2 className="text-base font-bold text-[#e5c45a] flex items-center gap-2 border-b border-neutral-800 pb-3">
            <Plus className="w-4 h-4 text-[#c9a227]" />
            <span>إضافة عنوان جديد لملفك</span>
          </h2>

          <form action={async (formData) => {
            'use server';
            const result = await addAddressAction(formData);
            const error = 'error' in result ? result.error : undefined;
            redirect(`/account/addresses?kind=${error ? 'error' : 'success'}&notice=${encodeURIComponent(error || 'تم حفظ العنوان بنجاح.')}`);
          }} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">

            <div className="space-y-1">
              <label className="text-neutral-300 font-semibold block">المحافظة *</label>
              <input
                type="text"
                name="governorate"
                required
                defaultValue="الجيزة"
                className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-neutral-300 font-semibold block">المدينة / المنطقة *</label>
              <input
                type="text"
                name="city"
                required
                defaultValue="الشيخ زايد"
                className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-neutral-300 font-semibold block">المنطقة / الحي *</label>
              <input
                type="text"
                name="district"
                required
                placeholder="مثال: الحي الأول"
                className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-neutral-300 font-semibold block">الشارع *</label>
              <input
                type="text"
                name="street"
                required
                placeholder="اسم الشارع الرئيسي"
                className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-neutral-300 font-semibold block">الكمبوند / المجمع *</label>
              <input
                type="text"
                name="compound"
                required
                placeholder="مثال: Allegria, Beverly Hills"
                className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-neutral-300 font-semibold block">رقم المبنى / الفيلا *</label>
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
                placeholder="مثال: شقة 12"
                className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-neutral-300 font-semibold block">علامة مميزة (اختياري)</label>
              <input
                type="text"
                name="landmark"
                placeholder="مثال: بجوار البوابة الرئيسية"
                className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-neutral-300 font-semibold block">تعليمات دخول البوابة والأمن</label>
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

            <div className="sm:col-span-2 md:col-span-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t border-neutral-800/80">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-neutral-300">
                <input type="checkbox" name="isDefault" className="accent-[#c9a227] w-4 h-4 rounded" />
                <span>تعيين هذا العنوان كعنوان افتراضي للحجوزات المستقبلية</span>
              </label>

              <button
                type="submit"
                className="gold-gradient text-[#080808] font-bold px-6 py-2.5 rounded-xl text-xs shadow-md hover:brightness-110 transition-all"
              >
                حفظ العنوان 📍
              </button>
            </div>
          </form>
        </div>

        {/* Addresses List */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-[#e5c45a]">العناوين المسجلة ({addresses.length})</h2>

          {addresses.length === 0 ? (
            <div className="p-8 rounded-3xl bg-[#141414] border border-dashed border-neutral-800 text-center text-neutral-500 text-xs">
              لا توجد عناوين مسجلة بحسابك حتى الآن. أضف عنوانك الأول بالنموذج أعلاه!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {addresses.map((a) => (
                <div
                  key={a.id}
                  className={`p-5 rounded-2xl bg-[#141414] border ${
                    a.isDefault ? 'border-[#c9a227]/60 shadow-lg shadow-[#c9a227]/5' : 'border-neutral-800'
                  } space-y-4 flex flex-col justify-between hover:border-[#c9a227]/40 transition-all`}
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#141414] text-neutral-300 border border-neutral-700">
                            {a.city}
                          </span>
                          {a.isDefault && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>العنوان الافتراضي</span>
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-white mt-2">
                          📍 {a.street} - مبنى/فيلا {a.buildingNumber}
                        </h3>
                      </div>
                    </div>

                    <div className="text-xs text-neutral-400 space-y-1">
                      <div><strong className="text-neutral-300">المحافظة والمنطقة:</strong> {a.governorate} - {a.city} - {a.district}</div>
                      {a.compound && <div><strong className="text-neutral-300">الكمبوند:</strong> {a.compound}</div>}
                      {a.unitNumber && <div><strong className="text-neutral-300">الوحدة:</strong> {a.unitNumber}</div>}
                      {a.landmark && <div><strong className="text-neutral-300">علامة مميزة:</strong> {a.landmark}</div>}
                      {a.gateInstructions && <div><strong className="text-neutral-300">الدخول والأمن:</strong> {a.gateInstructions}</div>}
                      {sanitizeLocationUrl(a.locationUrl) && (
                        <div className="pt-1">
                          <a href={sanitizeLocationUrl(a.locationUrl)!} target="_blank" rel="noopener noreferrer" className="text-[#e5c45a] hover:underline font-bold flex items-center gap-1">
                            <Navigation className="w-3.5 h-3.5 text-[#c9a227]" />
                            <span>فتح موقع الخريطة في Google Maps</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <details className="rounded-xl border border-neutral-800 bg-[#080808]/50 p-3 text-xs">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 font-bold text-[#e5c45a] marker:hidden">
                      <Pencil className="size-3.5" aria-hidden="true" />
                      تعديل بيانات العنوان
                    </summary>
                    <form action={async (formData) => {
                      'use server';
                      const result = await updateAddressAction(formData);
                      const error = 'error' in result ? result.error : undefined;
                      redirect(`/account/addresses?kind=${error ? 'error' : 'success'}&notice=${encodeURIComponent(error || 'تم تحديث العنوان.')}`);
                    }} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <input type="hidden" name="addressId" value={a.id} />
                      <label className="space-y-1 text-neutral-300"><span>المحافظة *</span><input name="governorate" required defaultValue={a.governorate} className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="space-y-1 text-neutral-300"><span>المدينة *</span><input name="city" required defaultValue={a.city} className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="space-y-1 text-neutral-300"><span>المنطقة / الحي *</span><input name="district" required defaultValue={a.district} className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="space-y-1 text-neutral-300"><span>الكمبوند *</span><input name="compound" required defaultValue={a.compound} className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="space-y-1 text-neutral-300"><span>الشارع *</span><input name="street" required defaultValue={a.street} className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="space-y-1 text-neutral-300"><span>رقم المبنى *</span><input name="buildingNumber" required defaultValue={a.buildingNumber} className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="space-y-1 text-neutral-300"><span>رقم الوحدة</span><input name="unitNumber" defaultValue={a.unitNumber ?? ''} className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="space-y-1 text-neutral-300"><span>علامة مميزة</span><input name="landmark" defaultValue={a.landmark ?? ''} className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="space-y-1 text-neutral-300 sm:col-span-2"><span>تعليمات البوابة والأمن</span><input name="gateInstructions" defaultValue={a.gateInstructions ?? ''} className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="space-y-1 text-neutral-300 sm:col-span-2"><span>رابط الخريطة</span><input name="locationUrl" type="url" defaultValue={a.locationUrl ?? ''} placeholder="https://maps.google.com/..." className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="flex items-center gap-2 text-neutral-300 sm:col-span-2"><input type="checkbox" name="isDefault" defaultChecked={a.isDefault} className="size-4 accent-[#c9a227]" />تعيين كعنوان افتراضي</label>
                      <button type="submit" className="justify-self-start rounded-lg gold-gradient px-4 py-2.5 font-bold text-[#080808] hover:brightness-110 sm:col-span-2">حفظ التعديلات</button>
                    </form>
                  </details>

                  <div className="pt-3 border-t border-neutral-800 flex justify-between items-center text-xs">
                    <form action={async (formData) => {
                      'use server';
                      const result = await deleteAddressAction(formData);
                      const error = 'error' in result ? result.error : undefined;
                      redirect(`/account/addresses?kind=${error ? 'error' : 'success'}&notice=${encodeURIComponent(error || 'تم حذف العنوان.')}`);
                    }}>
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
              ))}
            </div>
          )}
        </div>
    </div>
  );
}
