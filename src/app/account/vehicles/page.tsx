import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { addVehicleAction, deleteVehicleAction, updateVehicleAction } from '@/app/actions/customer';
import { Car, Plus, Trash2, ChevronRight, CheckCircle2, Pencil } from 'lucide-react';

export const metadata = {
  title: 'سياراتي المسجلة | بريق للعناية بالسيارات',
};

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; kind?: string }>;
}) {
  const user = await requireRole([UserRole.CUSTOMER]);
  const query = await searchParams;

  const customer = await db.customerProfile.findUnique({
    where: { userId: user.id },
    include: { vehicles: { orderBy: { createdAt: 'desc' } } },
  });

  if (!customer) {
    redirect('/login');
  }

  const vehicles = customer.vehicles;

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
              <Car className="w-7 h-7 text-[#c9a227]" />
              <span>إدارة سياراتك المسجلة</span>
            </h1>
            <p className="text-xs text-neutral-400 mt-1">سجل سياراتك الشخصية لتسريع اختيارها وتخصيص الخدمة المناسبة عند الحجز.</p>
          </div>
        </div>

        {/* Add Vehicle Form */}
        <div className="p-6 rounded-3xl bg-[#141414] border border-[#c9a227]/30 space-y-6 shadow-xl">
          <h2 className="text-base font-bold text-[#e5c45a] flex items-center gap-2 border-b border-neutral-800 pb-3">
            <Plus className="w-4 h-4 text-[#c9a227]" />
            <span>إضافة سيارة جديدة لملفك</span>
          </h2>

          <form action={async (formData) => {
            'use server';
            const result = await addVehicleAction(formData);
            const error = 'error' in result ? result.error : undefined;
            redirect(`/account/vehicles?kind=${error ? 'error' : 'success'}&notice=${encodeURIComponent(error || 'تم حفظ السيارة بنجاح.')}`);
          }} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1">
              <label className="text-neutral-300 font-semibold block">الماركة (Make) *</label>
              <input
                type="text"
                name="make"
                required
                placeholder="مثال: تويوتا، مرسيدس، بي إم دبليو"
                className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-neutral-300 font-semibold block">الموديل (Model) *</label>
              <input
                type="text"
                name="model"
                required
                placeholder="مثال: كامري، E200، X5"
                className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-neutral-300 font-semibold block">سنة الصنع *</label>
              <input
                type="text"
                name="year"
                required
                defaultValue="2024"
                className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-neutral-300 font-semibold block">اللون *</label>
              <input
                type="text"
                name="color"
                required
                placeholder="مثال: أسود ميتاليك، أبيض لؤلؤي"
                className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-neutral-300 font-semibold block">تصنيف وحجم السيارة *</label>
              <select
                name="vehicleSize"
                required
                className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
              >
                <option value="SEDAN">سيدان / صالون (SEDAN)</option>
                <option value="CROSSOVER">كروس أوفر / SUV صغيرة (CROSSOVER)</option>
                <option value="SUV">SUV متوسطة / عائلية (SUV)</option>
                <option value="LARGE_SUV">SUV كبيرة / فاخرة (LARGE SUV)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-neutral-300 font-semibold block">رقم اللوحة (اختياري)</label>
              <input
                type="text"
                name="plateNumber"
                placeholder="مثال: أ ب ج 1234"
                className="w-full bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
              />
            </div>

            <div className="sm:col-span-2 md:col-span-3 space-y-1">
              <label className="text-neutral-300 font-semibold block">ملاحظات مهمة للفريق (اختياري)</label>
              <textarea
                name="notes"
                rows={2}
                placeholder="مثال: يوجد طلاء حماية أو خدش قائم يراد تجنبه"
                className="w-full resize-y bg-[#080808] border border-neutral-800 rounded-xl p-3 text-white focus:outline-none focus:border-[#c9a227]"
              />
            </div>

            <div className="sm:col-span-2 md:col-span-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t border-neutral-800/80">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-neutral-300">
                <input type="checkbox" name="isDefault" className="accent-[#c9a227] w-4 h-4 rounded" />
                <span>تعيين هذه السيارة كسيارة افتراضية للحجوزات المستقبلية</span>
              </label>

              <button
                type="submit"
                className="gold-gradient text-[#080808] font-bold px-6 py-2.5 rounded-xl text-xs shadow-md hover:brightness-110 transition-all"
              >
                حفظ السيارة المسجلة 🚘
              </button>
            </div>
          </form>
        </div>

        {/* Vehicles List */}
        <div className="space-y-4">
          <h2 className="text-base font-bold text-[#e5c45a]">قائمة السيارات المسجلة ({vehicles.length})</h2>

          {vehicles.length === 0 ? (
            <div className="p-8 rounded-3xl bg-[#141414] border border-dashed border-neutral-800 text-center text-neutral-500 text-xs">
              لا توجد سيارات مسجلة بحسابك حتى الآن. أضف سيارتك الأولى الآن بالنموذج أعلاه!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {vehicles.map((v) => (
                <div
                  key={v.id}
                  className={`p-5 rounded-2xl bg-[#141414] border ${
                    v.isDefault ? 'border-[#c9a227]/60 shadow-lg shadow-[#c9a227]/5' : 'border-neutral-800'
                  } space-y-4 flex flex-col justify-between hover:border-[#c9a227]/40 transition-all`}
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#c9a227]/10 text-[#e5c45a] border border-[#c9a227]/30">
                            {v.vehicleSize}
                          </span>
                          {v.isDefault && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>السيارة الافتراضية</span>
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-white mt-2">
                          🚗 {v.make} {v.model} ({v.year})
                        </h3>
                      </div>
                    </div>

                    <div className="text-xs text-neutral-400 space-y-1">
                      <div><strong className="text-neutral-300">اللون:</strong> {v.color}</div>
                      {v.plateNumber && <div><strong className="text-neutral-300">رقم اللوحة:</strong> {v.plateNumber}</div>}
                      {v.notes && <div><strong className="text-neutral-300">ملاحظات للفريق:</strong> {v.notes}</div>}
                    </div>
                  </div>

                  <details className="rounded-xl border border-neutral-800 bg-[#080808]/50 p-3 text-xs">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 font-bold text-[#e5c45a] marker:hidden">
                      <Pencil className="size-3.5" aria-hidden="true" />
                      تعديل بيانات السيارة
                    </summary>
                    <form action={async (formData) => {
                      'use server';
                      const result = await updateVehicleAction(formData);
                      const error = 'error' in result ? result.error : undefined;
                      redirect(`/account/vehicles?kind=${error ? 'error' : 'success'}&notice=${encodeURIComponent(error || 'تم تحديث السيارة.')}`);
                    }} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <input type="hidden" name="vehicleId" value={v.id} />
                      <label className="space-y-1 text-neutral-300"><span>الماركة *</span><input name="make" required defaultValue={v.make} className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="space-y-1 text-neutral-300"><span>الموديل *</span><input name="model" required defaultValue={v.model} className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="space-y-1 text-neutral-300"><span>سنة الصنع *</span><input name="year" type="number" min={1990} max={2030} required defaultValue={v.year} className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="space-y-1 text-neutral-300"><span>اللون *</span><input name="color" required defaultValue={v.color} className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="space-y-1 text-neutral-300"><span>الحجم *</span><select name="vehicleSize" required defaultValue={v.vehicleSize} className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]"><option value="SEDAN">سيدان / صالون</option><option value="CROSSOVER">كروس أوفر</option><option value="SUV">SUV</option><option value="LARGE_SUV">SUV كبيرة</option></select></label>
                      <label className="space-y-1 text-neutral-300"><span>رقم اللوحة</span><input name="plateNumber" defaultValue={v.plateNumber ?? ''} className="w-full rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="space-y-1 text-neutral-300 sm:col-span-2"><span>ملاحظات للفريق</span><textarea name="notes" rows={2} defaultValue={v.notes ?? ''} className="w-full resize-y rounded-lg border border-neutral-800 bg-[#141414] p-2.5 text-white focus:outline-none focus:border-[#c9a227]" /></label>
                      <label className="flex items-center gap-2 text-neutral-300 sm:col-span-2"><input type="checkbox" name="isDefault" defaultChecked={v.isDefault} className="size-4 accent-[#c9a227]" />تعيين كسيارة افتراضية</label>
                      <button type="submit" className="justify-self-start rounded-lg gold-gradient px-4 py-2.5 font-bold text-[#080808] hover:brightness-110 sm:col-span-2">حفظ التعديلات</button>
                    </form>
                  </details>

                  <div className="pt-3 border-t border-neutral-800 flex justify-between items-center text-xs">
                    <Link
                      href={`/services?vehicleId=${v.id}`}
                      className="font-bold text-[#e5c45a] hover:underline"
                    >
                      حجز خدمة لهذه السيارة ⚡
                    </Link>

                    <form action={async (formData) => {
                      'use server';
                      const result = await deleteVehicleAction(formData);
                      const error = 'error' in result ? result.error : undefined;
                      redirect(`/account/vehicles?kind=${error ? 'error' : 'success'}&notice=${encodeURIComponent(error || 'تم حذف السيارة.')}`);
                    }}>
                      <input type="hidden" name="vehicleId" value={v.id} />
                      <button
                        type="submit"
                        className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 font-semibold"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف</span>
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
