'use client';

import type { FormEvent, ReactNode } from 'react';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CarFront,
  ClipboardList,
  History,
  Package,
  Plus,
  Save,
  ShieldCheck,
  Truck,
  Users,
} from 'lucide-react';
import {
  assignBookingOperationalResourcesAction,
  recordInventoryMovementAction,
  saveBranchMaterialStockAction,
  saveOperationalMaterialAction,
  saveOperationalVehicleAction,
  saveServiceMaterialRequirementAction,
  type OperationsResourceActionResult,
} from '@/app/actions/operations-resources';

export interface ResourceBranchDto {
  id: string;
  code: string;
  nameAr: string;
  status: string;
  teams: Array<{
    id: string;
    name: string;
    members: Array<{ id: string; fullName: string }>;
  }>;
}

export interface ResourceMaterialDto {
  id: string;
  sku: string;
  nameAr: string;
  nameEn: string | null;
  unit: string;
  defaultReorderPoint: number;
  active: boolean;
  requirementCount: number;
  stockCount: number;
}

export interface ServiceMaterialDto {
  id: string;
  nameAr: string;
  active: boolean;
  materialRequirements: Array<{
    id: string;
    materialId: string;
    quantity: number;
    required: boolean;
    notes: string | null;
    material: { nameAr: string; sku: string; unit: string; active: boolean };
  }>;
}

export interface ResourceStockDto {
  id: string;
  branchId: string;
  materialId: string;
  quantityOnHand: number;
  reservedQuantity: number;
  reorderPoint: number | null;
  active: boolean;
  updatedAt: string;
  branchName: string;
  material: { nameAr: string; sku: string; unit: string; defaultReorderPoint: number; active: boolean };
  movements: Array<{
    id: string;
    type: string;
    quantityChange: number;
    balanceAfter: number;
    reason: string | null;
    createdAt: string;
    bookingNumber: string | null;
    createdByName: string;
  }>;
}

export interface ResourceVehicleDto {
  id: string;
  branchId: string;
  teamId: string | null;
  code: string;
  plateNumber: string | null;
  make: string;
  model: string;
  year: number | null;
  status: string;
  notes: string | null;
  branchName: string;
  teamName: string | null;
  bookingCount: number;
}

export interface ResourceBookingDto {
  id: string;
  branchId: string;
  bookingNumber: string;
  startAt: string;
  endAt: string;
  bookingStatus: string;
  assignedTeamId: string;
  assignedEmployeeId: string | null;
  operationalVehicleId: string | null;
  branchName: string;
  serviceName: string;
  teamName: string;
  employeeName: string | null;
  operationalVehicleLabel: string | null;
}

interface Props {
  actorRole: string;
  canManageCatalog: boolean;
  branches: ResourceBranchDto[];
  materials: ResourceMaterialDto[];
  services: ServiceMaterialDto[];
  stocks: ResourceStockDto[];
  vehicles: ResourceVehicleDto[];
  bookings: ResourceBookingDto[];
}

type Tab = 'catalog' | 'stock' | 'fleet' | 'assignments';
type Notice = { kind: 'success' | 'error'; text: string } | null;

const inputClass = 'mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none transition focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20 disabled:cursor-not-allowed disabled:opacity-50';
const panelClass = 'rounded-3xl border border-white/10 bg-white/[0.025] p-5 shadow-2xl shadow-black/10 sm:p-6';

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(new Date(value));
}

function noticeFromResult(result: OperationsResourceActionResult, fallback: string): Notice {
  return result.error
    ? { kind: 'error', text: result.error }
    : { kind: 'success', text: result.message ?? fallback };
}

function StockBadge({ stock }: { stock: ResourceStockDto }) {
  const available = stock.quantityOnHand - stock.reservedQuantity;
  const reorderPoint = stock.reorderPoint ?? stock.material.defaultReorderPoint;
  const low = available <= reorderPoint;
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${!stock.active
      ? 'border-neutral-600 bg-neutral-700/30 text-neutral-300'
      : low
        ? 'border-amber-400/35 bg-amber-400/10 text-amber-200'
        : 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200'}`}>
      {!stock.active ? 'متوقف' : low ? 'يحتاج إعادة طلب' : 'متاح'}
    </span>
  );
}

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <div
      role={notice.kind === 'error' ? 'alert' : 'status'}
      className={`rounded-2xl border px-4 py-3 text-sm ${notice.kind === 'error'
        ? 'border-red-400/30 bg-red-400/10 text-red-100'
        : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'}`}
    >
      {notice.text}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-xs font-bold transition ${active
        ? 'border-[#d4af37]/60 bg-[#d4af37]/15 text-[#f0d36d]'
        : 'border-white/10 bg-black/20 text-white/65 hover:border-white/25 hover:text-white'}`}
    >
      {icon}
      {label}
    </button>
  );
}

function MaterialEditor({ material, onResult }: {
  material?: ResourceMaterialDto;
  onResult: (notice: Notice) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await saveOperationalMaterialAction(formData);
      onResult(noticeFromResult(result, 'تم حفظ صنف المادة.'));
      if (!result.error) router.refresh();
    });
  }

  return (
    <form key={material?.id ?? 'new'} onSubmit={submit} className="grid gap-4 rounded-2xl border border-[#d4af37]/20 bg-black/20 p-4 md:grid-cols-2 xl:grid-cols-3">
      {material ? <input type="hidden" name="materialId" value={material.id} /> : null}
      <label className="text-xs font-bold text-white/70">كود الصنف *
        <input name="sku" required pattern="[A-Za-z0-9][A-Za-z0-9._-]{1,63}" defaultValue={material?.sku ?? ''} className={inputClass} dir="ltr" placeholder="SHAMPOO-01" />
      </label>
      <label className="text-xs font-bold text-white/70">الاسم بالعربية *
        <input name="nameAr" required minLength={2} maxLength={140} defaultValue={material?.nameAr ?? ''} className={inputClass} />
      </label>
      <label className="text-xs font-bold text-white/70">الاسم بالإنجليزية
        <input name="nameEn" maxLength={140} defaultValue={material?.nameEn ?? ''} className={inputClass} dir="ltr" />
      </label>
      <label className="text-xs font-bold text-white/70">وحدة القياس *
        <input name="unit" required maxLength={40} defaultValue={material?.unit ?? 'قطعة'} className={inputClass} placeholder="لتر / عبوة / قطعة" />
      </label>
      <label className="text-xs font-bold text-white/70">نقطة إعادة الطلب الافتراضية
        <input name="defaultReorderPoint" type="number" min="0" required defaultValue={material?.defaultReorderPoint ?? 0} className={inputClass} />
      </label>
      <div className="flex items-end justify-between gap-3">
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-bold text-white/75">
          <input name="active" type="checkbox" defaultChecked={material?.active ?? true} /> نشط
        </label>
        <button type="submit" disabled={isPending} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#d4af37] px-4 text-xs font-black text-black disabled:opacity-50">
          <Save className="size-4" aria-hidden="true" />{isPending ? 'جارٍ الحفظ…' : material ? 'حفظ التعديل' : 'إضافة صنف'}
        </button>
      </div>
    </form>
  );
}

function RequirementEditor({ service, materials, requirement, onResult }: {
  service: ServiceMaterialDto;
  materials: ResourceMaterialDto[];
  requirement?: ServiceMaterialDto['materialRequirements'][number];
  onResult: (notice: Notice) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await saveServiceMaterialRequirementAction(formData);
      onResult(noticeFromResult(result, 'تم حفظ متطلب الخدمة.'));
      if (!result.error) router.refresh();
    });
  }

  return (
    <form key={requirement?.id ?? `new-${service.id}`} onSubmit={submit} className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:grid-cols-[minmax(0,1.5fr)_120px_1fr_auto]">
      <input type="hidden" name="serviceId" value={service.id} />
      {requirement ? <input type="hidden" name="requirementId" value={requirement.id} /> : null}
      <label className="text-xs font-bold text-white/70">الصنف
        <select name="materialId" required defaultValue={requirement?.materialId ?? ''} className={inputClass}>
          <option value="" disabled>اختر المادة</option>
          {materials.filter((material) => material.active || material.id === requirement?.materialId).map((material) => (
            <option key={material.id} value={material.id}>{material.nameAr} · {material.unit}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-bold text-white/70">الكمية
        <input name="quantity" type="number" min="1" required defaultValue={requirement?.quantity ?? 1} className={inputClass} />
      </label>
      <label className="text-xs font-bold text-white/70">ملاحظة للفريق
        <input name="notes" maxLength={1000} defaultValue={requirement?.notes ?? ''} className={inputClass} placeholder="اختياري" />
      </label>
      <div className="flex items-end gap-2">
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs text-white/75">
          <input name="required" type="checkbox" defaultChecked={requirement?.required ?? true} /> إلزامي
        </label>
        <button type="submit" disabled={isPending} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#d4af37]/40 px-4 text-xs font-bold text-[#f0d36d] disabled:opacity-50">
          <Save className="size-4" aria-hidden="true" />{isPending ? '…' : 'حفظ'}
        </button>
      </div>
    </form>
  );
}

function StockEditor({ stock, branches, materials, defaultBranchId, onResult }: {
  stock?: ResourceStockDto;
  branches: ResourceBranchDto[];
  materials: ResourceMaterialDto[];
  defaultBranchId: string;
  onResult: (notice: Notice) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await saveBranchMaterialStockAction(formData);
      onResult(noticeFromResult(result, 'تم حفظ مخزون الفرع.'));
      if (!result.error) router.refresh();
    });
  }

  return (
    <form key={stock?.id ?? `new-${defaultBranchId}`} onSubmit={submit} className="grid gap-4 rounded-2xl border border-[#d4af37]/20 bg-black/20 p-4 md:grid-cols-2 xl:grid-cols-3">
      {stock ? <input type="hidden" name="stockId" value={stock.id} /> : null}
      <label className="text-xs font-bold text-white/70">الفرع
        <select name="branchId" required defaultValue={stock?.branchId ?? defaultBranchId} disabled={Boolean(stock)} className={inputClass}>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.nameAr}</option>)}
        </select>
        {stock ? <input type="hidden" name="branchId" value={stock.branchId} /> : null}
      </label>
      <label className="text-xs font-bold text-white/70">الصنف
        <select name="materialId" required defaultValue={stock?.materialId ?? ''} disabled={Boolean(stock)} className={inputClass}>
          <option value="" disabled>اختر صنفًا</option>
          {materials.filter((material) => material.active || material.id === stock?.materialId).map((material) => <option key={material.id} value={material.id}>{material.nameAr} · {material.unit}</option>)}
        </select>
        {stock ? <input type="hidden" name="materialId" value={stock.materialId} /> : null}
      </label>
      {!stock ? <label className="text-xs font-bold text-white/70">رصيد افتتاحي
        <input name="initialQuantity" type="number" min="0" required defaultValue={0} className={inputClass} />
      </label> : <div className="rounded-xl border border-white/10 p-3 text-xs text-white/55">الرصيد الفعلي: <strong className="text-white">{stock.quantityOnHand}</strong> {stock.material.unit}<br />يُعدّل عبر «حركة مخزون» للحفاظ على السجل.</div>}
      <label className="text-xs font-bold text-white/70">كمية محجوزة
        <input name="reservedQuantity" type="number" min="0" required defaultValue={stock?.reservedQuantity ?? 0} className={inputClass} />
      </label>
      <label className="text-xs font-bold text-white/70">نقطة إعادة الطلب
        <input name="reorderPoint" type="number" min="0" defaultValue={stock?.reorderPoint ?? ''} placeholder={stock ? String(stock.material.defaultReorderPoint) : 'افتراضي الصنف'} className={inputClass} />
      </label>
      <label className="text-xs font-bold text-white/70">سبب الإعداد أو التعديل
        <input name="reason" maxLength={500} defaultValue="" className={inputClass} placeholder="اختياري" />
      </label>
      <div className="flex items-end justify-between gap-3">
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-bold text-white/75"><input name="active" type="checkbox" defaultChecked={stock?.active ?? true} /> نشط</label>
        <button type="submit" disabled={isPending} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#d4af37] px-4 text-xs font-black text-black disabled:opacity-50"><Save className="size-4" aria-hidden="true" />{isPending ? 'جارٍ الحفظ…' : stock ? 'حفظ الإعداد' : 'إضافة للمخزون'}</button>
      </div>
    </form>
  );
}

function InventoryMovementForm({ stock, bookings, onResult }: {
  stock: ResourceStockDto;
  bookings: ResourceBookingDto[];
  onResult: (notice: Notice) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState('RECEIPT');
  const isAdjustment = type === 'ADJUSTMENT';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await recordInventoryMovementAction(formData);
      onResult(noticeFromResult(result, 'تم تسجيل حركة المخزون.'));
      if (!result.error) router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 border-t border-white/10 pt-4 md:grid-cols-[150px_120px_minmax(0,1fr)_auto]">
      <input type="hidden" name="branchStockId" value={stock.id} />
      <label className="text-[11px] font-bold text-white/60">نوع الحركة
        <select name="type" value={type} onChange={(event) => setType(event.target.value)} className={inputClass}>
          <option value="RECEIPT">توريد (+)</option>
          <option value="RETURN">مرتجع (+)</option>
          <option value="CONSUMPTION">استهلاك (-)</option>
          <option value="WASTE">هالك (-)</option>
          <option value="ADJUSTMENT">تسوية ±</option>
        </select>
      </label>
      <label className="text-[11px] font-bold text-white/60">الكمية
        <input name="quantity" type="number" required min={isAdjustment ? undefined : 1} defaultValue={isAdjustment ? 0 : 1} className={inputClass} placeholder={isAdjustment ? 'مثل -2 أو 2' : '1'} />
      </label>
      <label className="text-[11px] font-bold text-white/60">السبب *
        <input name="reason" required minLength={2} maxLength={500} className={inputClass} placeholder="فاتورة توريد، استهلاك للمهمة…" />
      </label>
      <button type="submit" disabled={isPending || !stock.active} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d4af37]/40 px-4 text-xs font-bold text-[#f0d36d] disabled:opacity-50"><History className="size-4" aria-hidden="true" />{isPending ? '…' : 'تسجيل'}</button>
      {bookings.length ? <label className="md:col-span-3 text-[11px] font-bold text-white/60">ربط اختياري بحجز (مفيد للاستهلاك أو المرتجع)
        <select name="bookingId" defaultValue="" className={inputClass}>
          <option value="">بدون ربط بحجز</option>
          {bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.bookingNumber} · {booking.serviceName}</option>)}
        </select>
      </label> : null}
      <p className="md:col-span-4 text-[11px] leading-5 text-white/40">لا يمكن تقليل الرصيد عن الكمية المحجوزة ({stock.reservedQuantity} {stock.material.unit}). استخدم تسوية سالبة أو موجبة عند الجرد.</p>
    </form>
  );
}

function VehicleEditor({ vehicle, branches, onResult }: {
  vehicle?: ResourceVehicleDto;
  branches: ResourceBranchDto[];
  onResult: (notice: Notice) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [branchId, setBranchId] = useState(vehicle?.branchId ?? branches[0]?.id ?? '');
  const branch = branches.find((item) => item.id === branchId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await saveOperationalVehicleAction(formData);
      onResult(noticeFromResult(result, 'تم حفظ سيارة التشغيل.'));
      if (!result.error) router.refresh();
    });
  }

  return (
    <form key={vehicle?.id ?? 'new-vehicle'} onSubmit={submit} className="grid gap-4 rounded-2xl border border-[#d4af37]/20 bg-black/20 p-4 md:grid-cols-2 xl:grid-cols-3">
      {vehicle ? <input type="hidden" name="operationalVehicleId" value={vehicle.id} /> : null}
      <label className="text-xs font-bold text-white/70">الفرع
        <select name="branchId" required value={branchId} onChange={(event) => setBranchId(event.target.value)} className={inputClass}>
          {branches.map((item) => <option key={item.id} value={item.id}>{item.nameAr}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold text-white/70">الفريق المسؤول
        <select name="teamId" defaultValue={vehicle?.teamId ?? ''} key={`${vehicle?.id ?? 'new'}-${branchId}`} className={inputClass}>
          <option value="">غير مخصص لفريق</option>
          {branch?.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-bold text-white/70">كود سيارة التشغيل *
        <input name="code" required pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,49}" defaultValue={vehicle?.code ?? ''} className={inputClass} dir="ltr" placeholder="OPS-01" />
      </label>
      <label className="text-xs font-bold text-white/70">رقم اللوحة
        <input name="plateNumber" maxLength={60} defaultValue={vehicle?.plateNumber ?? ''} className={inputClass} dir="ltr" />
      </label>
      <label className="text-xs font-bold text-white/70">الماركة *
        <input name="make" required maxLength={80} defaultValue={vehicle?.make ?? ''} className={inputClass} />
      </label>
      <label className="text-xs font-bold text-white/70">الموديل *
        <input name="model" required maxLength={80} defaultValue={vehicle?.model ?? ''} className={inputClass} />
      </label>
      <label className="text-xs font-bold text-white/70">سنة الصنع
        <input name="year" type="number" min="1950" max="2100" defaultValue={vehicle?.year ?? ''} className={inputClass} />
      </label>
      <label className="text-xs font-bold text-white/70">الحالة
        <select name="status" defaultValue={vehicle?.status ?? 'ACTIVE'} className={inputClass}>
          <option value="ACTIVE">نشطة</option>
          <option value="MAINTENANCE">صيانة</option>
          <option value="INACTIVE">متوقفة</option>
        </select>
      </label>
      <label className="text-xs font-bold text-white/70">ملاحظات
        <input name="notes" maxLength={1000} defaultValue={vehicle?.notes ?? ''} className={inputClass} />
      </label>
      <div className="flex items-end justify-end">
        <button type="submit" disabled={isPending} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#d4af37] px-4 text-xs font-black text-black disabled:opacity-50"><Save className="size-4" aria-hidden="true" />{isPending ? 'جارٍ الحفظ…' : vehicle ? 'حفظ السيارة' : 'إضافة سيارة'}</button>
      </div>
    </form>
  );
}

function BookingResourceAssignmentForm({ booking, branches, vehicles, onResult }: {
  booking: ResourceBookingDto;
  branches: ResourceBranchDto[];
  vehicles: ResourceVehicleDto[];
  onResult: (notice: Notice) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const team = branches.find((branch) => branch.id === booking.branchId)?.teams.find((item) => item.id === booking.assignedTeamId);
  const eligibleVehicles = vehicles.filter((vehicle) => vehicle.branchId === booking.branchId && vehicle.status === 'ACTIVE' && (!vehicle.teamId || vehicle.teamId === booking.assignedTeamId));
  const [employeeId, setEmployeeId] = useState(booking.assignedEmployeeId ?? '');
  const [vehicleId, setVehicleId] = useState(booking.operationalVehicleId ?? '');
  const [clearEmployee, setClearEmployee] = useState(false);
  const [clearOperationalVehicle, setClearOperationalVehicle] = useState(false);
  const [reason, setReason] = useState('تخصيص تشغيلي للحجز');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employeeId && !vehicleId && !clearEmployee && !clearOperationalVehicle) {
      onResult({ kind: 'error', text: 'اختر موردًا للتخصيص أو حدّد المورد الذي تريد فك تخصيصه.' });
      return;
    }
    const formData = new FormData();
    formData.set('bookingId', booking.id);
    if (employeeId && !clearEmployee) formData.set('employeeId', employeeId);
    if (vehicleId && !clearOperationalVehicle) formData.set('operationalVehicleId', vehicleId);
    if (clearEmployee) formData.set('clearEmployee', 'true');
    if (clearOperationalVehicle) formData.set('clearOperationalVehicle', 'true');
    formData.set('reason', reason);
    startTransition(async () => {
      const result = await assignBookingOperationalResourcesAction(formData);
      onResult(noticeFromResult(result, 'تم تخصيص موارد الحجز.'));
      if (!result.error) router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 border-t border-white/10 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <label className="text-[11px] font-bold text-white/60">فني من الفريق
        <select value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); setClearEmployee(false); }} className={inputClass}>
          <option value="">بدون تغيير / غير مخصص</option>
          {team?.members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}
        </select>
      </label>
      <label className="text-[11px] font-bold text-white/60">سيارة تشغيل متاحة
        <select value={vehicleId} onChange={(event) => { setVehicleId(event.target.value); setClearOperationalVehicle(false); }} className={inputClass}>
          <option value="">بدون تغيير / غير مخصصة</option>
          {eligibleVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.code} · {vehicle.make} {vehicle.model}</option>)}
        </select>
      </label>
      <div className="text-[11px] font-bold text-white/60">
        <label>سبب التخصيص *
        <input value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} maxLength={500} className={inputClass} />
        </label>
        {booking.assignedEmployeeId ? (
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-amber-200/85">
            <input
              type="checkbox"
              checked={clearEmployee}
              onChange={(event) => setClearEmployee(event.target.checked)}
              className="size-4 accent-amber-400"
            />
            فك تعيين الفني الحالي
          </label>
        ) : null}
        {booking.operationalVehicleId ? (
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-amber-200/85">
            <input
              type="checkbox"
              checked={clearOperationalVehicle}
              onChange={(event) => setClearOperationalVehicle(event.target.checked)}
              className="size-4 accent-amber-400"
            />
            فك تعيين سيارة التشغيل الحالية
          </label>
        ) : null}
      </div>
      <button type="submit" disabled={isPending} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d4af37]/40 px-4 text-xs font-bold text-[#f0d36d] disabled:opacity-50"><Users className="size-4" aria-hidden="true" />{isPending ? '…' : 'تخصيص'}</button>
    </form>
  );
}

export default function OperationsResourcesBoard({
  actorRole,
  canManageCatalog,
  branches,
  materials,
  services,
  stocks,
  vehicles,
  bookings,
}: Props) {
  const [tab, setTab] = useState<Tab>(canManageCatalog ? 'catalog' : 'stock');
  const [notice, setNotice] = useState<Notice>(null);
  const [materialId, setMaterialId] = useState<string | null>(materials[0]?.id ?? null);
  const [serviceId, setServiceId] = useState<string | null>(services[0]?.id ?? null);
  const [requirementId, setRequirementId] = useState<string | null>(null);
  const [stockBranchId, setStockBranchId] = useState(branches[0]?.id ?? '');
  const [stockId, setStockId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(vehicles[0]?.id ?? null);

  const selectedMaterial = useMemo(() => materials.find((material) => material.id === materialId), [materialId, materials]);
  const selectedService = useMemo(() => services.find((service) => service.id === serviceId), [serviceId, services]);
  const selectedRequirement = selectedService?.materialRequirements.find((requirement) => requirement.id === requirementId);
  const selectedStock = stocks.find((stock) => stock.id === stockId);
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);
  const branchStocks = stocks.filter((stock) => stock.branchId === stockBranchId);
  const lowStocks = stocks.filter((stock) => stock.active && stock.quantityOnHand - stock.reservedQuantity <= (stock.reorderPoint ?? stock.material.defaultReorderPoint));

  function setFeedback(next: Notice) {
    setNotice(next);
  }

  return (
    <div className="min-h-screen bg-[#080808] text-white" dir="rtl">
      <main className="mx-auto w-full max-w-[1500px] space-y-7 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/operations" className="inline-flex items-center gap-2 text-xs font-bold text-[#d4af37]"><ArrowRight className="size-4" aria-hidden="true" />العودة لمركز التشغيل</Link>
            <p className="mt-5 flex items-center gap-2 text-xs font-bold text-[#d4af37]"><Boxes className="size-4" aria-hidden="true" />التجهيز، المخزون، والأسطول</p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">الموارد التشغيلية</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-white/50">إدارة مواد الخدمة المطلوبة، أرصدة الفروع وحركاتها، وسيارات فرق التنفيذ. كل تعديل مسجل في سجل التدقيق ومقيد بنطاق الفرع.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-white/65">{branches.length} فروع مسموحة</span>
            <span className={`rounded-xl border px-3 py-2 ${lowStocks.length ? 'border-amber-400/35 bg-amber-400/10 text-amber-200' : 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200'}`}>{lowStocks.length ? `${lowStocks.length} أصناف تحتاج طلبًا` : 'الأرصدة مطمئنة'}</span>
            <span className="rounded-xl border border-[#d4af37]/35 bg-[#d4af37]/10 px-3 py-2 text-[#f0d36d]">{actorRole === 'OPERATIONS_MANAGER' ? 'نطاق مدير التشغيل' : 'صلاحيات مالك النظام'}</span>
          </div>
        </header>

        <NoticeBox notice={notice} />

        <nav aria-label="أقسام الموارد" className="flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02] p-2">
          {canManageCatalog ? <TabButton active={tab === 'catalog'} onClick={() => setTab('catalog')} icon={<Package className="size-4" aria-hidden="true" />} label="مواد الخدمات" /> : null}
          <TabButton active={tab === 'stock'} onClick={() => setTab('stock')} icon={<Boxes className="size-4" aria-hidden="true" />} label="مخزون الفروع" />
          <TabButton active={tab === 'fleet'} onClick={() => setTab('fleet')} icon={<CarFront className="size-4" aria-hidden="true" />} label="سيارات التشغيل" />
          <TabButton active={tab === 'assignments'} onClick={() => setTab('assignments')} icon={<ClipboardList className="size-4" aria-hidden="true" />} label="تخصيص موارد الحجوزات" />
        </nav>

        {tab === 'catalog' && canManageCatalog ? (
          <div className="grid gap-7 xl:grid-cols-[310px_minmax(0,1fr)]">
            <aside className="space-y-3 xl:sticky xl:top-5 xl:self-start">
              <div className={panelClass}>
                <div className="flex items-center justify-between gap-3"><h2 className="font-black">أصناف المواد</h2><button type="button" onClick={() => setMaterialId(null)} className="inline-flex size-9 items-center justify-center rounded-xl border border-[#d4af37]/40 text-[#f0d36d]" title="صنف جديد"><Plus className="size-4" aria-hidden="true" /></button></div>
                <div className="mt-4 space-y-2">
                  {materials.map((material) => <button key={material.id} type="button" onClick={() => setMaterialId(material.id)} className={`w-full rounded-xl border p-3 text-right transition ${selectedMaterial?.id === material.id ? 'border-[#d4af37]/50 bg-[#d4af37]/10' : 'border-white/10 bg-black/20 hover:border-white/25'}`}><span className="flex items-center justify-between gap-3"><span className="truncate text-sm font-bold">{material.nameAr}</span><span className={`size-2 rounded-full ${material.active ? 'bg-emerald-300' : 'bg-neutral-500'}`} /></span><span dir="ltr" className="mt-1 block text-[10px] text-white/40">{material.sku} · {material.unit}</span></button>)}
                </div>
              </div>
            </aside>

            <div className="space-y-7">
              <section className={panelClass} aria-labelledby="material-editor-title">
                <div className="mb-5"><p className="text-xs font-bold text-[#d4af37]">كتالوج داخلي</p><h2 id="material-editor-title" className="mt-1 text-xl font-black">{selectedMaterial ? `تعديل ${selectedMaterial.nameAr}` : 'إضافة صنف مادة'}</h2><p className="mt-1 text-xs leading-5 text-white/45">إيقاف الصنف يحافظ على تاريخه ولا يحذف حركات المخزون أو متطلبات الخدمات السابقة.</p></div>
                <MaterialEditor key={selectedMaterial?.id ?? 'new'} material={selectedMaterial} onResult={setFeedback} />
              </section>

              <section className={panelClass} aria-labelledby="requirements-title">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold text-[#d4af37]">إعداد الخدمة</p><h2 id="requirements-title" className="mt-1 text-xl font-black">مواد كل خدمة</h2><p className="mt-1 text-xs leading-5 text-white/45">الكميات هنا هي الاحتياج لكل تنفيذ واحد وتظهر للفني مع جاهزية مخزون الفرع.</p></div><select value={selectedService?.id ?? ''} onChange={(event) => { setServiceId(event.target.value); setRequirementId(null); }} className={`${inputClass} mt-0 max-w-sm`}><option value="" disabled>اختر خدمة</option>{services.map((service) => <option key={service.id} value={service.id}>{service.nameAr}{service.active ? '' : ' · متوقفة'}</option>)}</select></div>
                {selectedService ? <div className="mt-5 space-y-3"><div className="space-y-2">{selectedService.materialRequirements.length ? selectedService.materialRequirements.map((requirement) => <button key={requirement.id} type="button" onClick={() => setRequirementId(requirement.id)} className={`flex w-full items-start justify-between gap-4 rounded-xl border p-4 text-right ${selectedRequirement?.id === requirement.id ? 'border-[#d4af37]/50 bg-[#d4af37]/10' : 'border-white/10 bg-black/20 hover:border-white/25'}`}><span><span className="font-bold">{requirement.material.nameAr}</span><span dir="ltr" className="mr-2 text-xs text-white/40">{requirement.material.sku}</span><span className="mt-1 block text-xs text-white/50">{requirement.notes || 'لا توجد تعليمات إضافية'}</span></span><span className="shrink-0 text-left text-xs"><strong className="block text-[#f0d36d]">{requirement.quantity} {requirement.material.unit}</strong><span className={requirement.required ? 'text-emerald-300' : 'text-white/45'}>{requirement.required ? 'إلزامي' : 'اختياري'}</span></span></button>) : <p className="rounded-xl border border-dashed border-white/15 p-5 text-center text-sm text-white/45">لم تُحدد مواد لهذه الخدمة بعد.</p>}</div><div className="border-t border-white/10 pt-5"><h3 className="mb-3 text-sm font-black">{selectedRequirement ? `تعديل متطلب ${selectedRequirement.material.nameAr}` : 'إضافة متطلب جديد'}</h3><RequirementEditor key={selectedRequirement?.id ?? `new-${selectedService.id}`} service={selectedService} materials={materials} requirement={selectedRequirement} onResult={setFeedback} /></div></div> : null}
              </section>
            </div>
          </div>
        ) : null}

        {tab === 'stock' ? (
          <div className="space-y-7">
            <section className={panelClass}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="flex items-center gap-2 text-xs font-bold text-[#d4af37]"><Boxes className="size-4" aria-hidden="true" />رصيد ومخصصات الفرع</p><h2 className="mt-1 text-xl font-black">إعداد مخزون الفرع</h2><p className="mt-1 text-xs leading-5 text-white/45">الإعداد يحدد الحجز التشغيلي ونقطة إعادة الطلب. تغيير الرصيد الفعلي يتم من حركة مخزون موثقة.</p></div><select value={stockBranchId} onChange={(event) => { setStockBranchId(event.target.value); setStockId(null); }} className={`${inputClass} mt-0 max-w-sm`}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.nameAr}</option>)}</select></div>
              <div className="mt-5"><StockEditor key={selectedStock?.id ?? `new-${stockBranchId}`} stock={selectedStock} branches={branches} materials={materials} defaultBranchId={stockBranchId} onResult={setFeedback} /></div>
            </section>

            <section aria-labelledby="stock-list-title" className={panelClass}>
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="stock-list-title" className="text-xl font-black">أرصدة {branches.find((branch) => branch.id === stockBranchId)?.nameAr}</h2><p className="mt-1 text-xs text-white/45">المتاح = الرصيد الفعلي − الكمية المحجوزة.</p></div><button type="button" onClick={() => setStockId(null)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#d4af37]/40 px-4 text-xs font-bold text-[#f0d36d]"><Plus className="size-4" aria-hidden="true" />إعداد صنف جديد</button></div>
              <div className="mt-5 grid gap-4 xl:grid-cols-2">{branchStocks.length ? branchStocks.map((stock) => { const available = stock.quantityOnHand - stock.reservedQuantity; return <article key={stock.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black">{stock.material.nameAr}</h3><p dir="ltr" className="mt-1 text-[11px] text-white/40">{stock.material.sku} · {stock.material.unit}</p></div><StockBadge stock={stock} /></div><dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-white/40">فعلي</dt><dd className="mt-1 text-base font-black">{stock.quantityOnHand}</dd></div><div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-white/40">محجوز</dt><dd className="mt-1 text-base font-black">{stock.reservedQuantity}</dd></div><div className="rounded-xl bg-[#d4af37]/10 p-3"><dt className="text-[#f0d36d]/65">متاح</dt><dd className="mt-1 text-base font-black text-[#f0d36d]">{available}</dd></div></dl><div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-white/45"><span>إعادة الطلب: {stock.reorderPoint ?? stock.material.defaultReorderPoint}</span><button type="button" onClick={() => setStockId(stock.id)} className="rounded-lg border border-white/15 px-3 py-1.5 font-bold text-white/75">تعديل الإعداد</button></div><details className="mt-4"><summary className="cursor-pointer rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-[#f0d36d]">حركة مخزون جديدة وسجل مختصر</summary><div className="mt-4"><InventoryMovementForm stock={stock} bookings={bookings.filter((booking) => booking.branchId === stock.branchId)} onResult={setFeedback} /><ol className="mt-4 space-y-2">{stock.movements.map((movement) => <li key={movement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.035] px-3 py-2 text-[11px]"><span><strong className={movement.quantityChange > 0 ? 'text-emerald-300' : 'text-red-200'}>{movement.quantityChange > 0 ? '+' : ''}{movement.quantityChange}</strong> · {movement.type} · رصيد {movement.balanceAfter}</span><span className="max-w-full truncate text-white/45">{movement.reason ?? 'بدون ملاحظة'}{movement.bookingNumber ? ` · ${movement.bookingNumber}` : ''} · {movement.createdByName}</span></li>)}</ol></div></details></article>; }) : <div className="xl:col-span-2 rounded-2xl border border-dashed border-white/15 p-10 text-center text-sm text-white/45">لا توجد أصناف مهيأة لهذا الفرع بعد.</div>}</div>
            </section>
          </div>
        ) : null}

        {tab === 'fleet' ? (
          <div className="grid gap-7 xl:grid-cols-[310px_minmax(0,1fr)]">
            <aside className="space-y-3 xl:sticky xl:top-5 xl:self-start"><div className={panelClass}><div className="flex items-center justify-between gap-3"><h2 className="font-black">سيارات التشغيل</h2><button type="button" onClick={() => setVehicleId(null)} className="inline-flex size-9 items-center justify-center rounded-xl border border-[#d4af37]/40 text-[#f0d36d]" title="سيارة جديدة"><Plus className="size-4" aria-hidden="true" /></button></div><div className="mt-4 space-y-2">{vehicles.map((vehicle) => <button key={vehicle.id} type="button" onClick={() => setVehicleId(vehicle.id)} className={`w-full rounded-xl border p-3 text-right transition ${selectedVehicle?.id === vehicle.id ? 'border-[#d4af37]/50 bg-[#d4af37]/10' : 'border-white/10 bg-black/20 hover:border-white/25'}`}><span className="flex items-center justify-between gap-3"><span className="truncate text-sm font-bold">{vehicle.code}</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${vehicle.status === 'ACTIVE' ? 'bg-emerald-400/10 text-emerald-200' : vehicle.status === 'MAINTENANCE' ? 'bg-amber-400/10 text-amber-200' : 'bg-neutral-500/20 text-neutral-300'}`}>{vehicle.status === 'ACTIVE' ? 'نشطة' : vehicle.status === 'MAINTENANCE' ? 'صيانة' : 'متوقفة'}</span></span><span className="mt-1 block truncate text-[10px] text-white/40">{vehicle.make} {vehicle.model} · {vehicle.branchName}</span></button>)}</div></div></aside>
            <div className="space-y-7"><section className={panelClass}><div className="mb-5"><p className="text-xs font-bold text-[#d4af37]">Fleet</p><h2 className="mt-1 text-xl font-black">{selectedVehicle ? `تعديل ${selectedVehicle.code}` : 'إضافة سيارة تشغيل'}</h2><p className="mt-1 text-xs leading-5 text-white/45">تستطيع السيارة أن تكون متاحة للفرع كله أو مخصصة لفريق واحد. السيارات في الصيانة أو المتوقفة لا تظهر لتخصيص الحجوزات.</p></div><VehicleEditor key={selectedVehicle?.id ?? 'new'} vehicle={selectedVehicle} branches={branches} onResult={setFeedback} /></section>{selectedVehicle ? <section className={panelClass}><h2 className="flex items-center gap-2 text-lg font-black"><Truck className="size-5 text-[#d4af37]" aria-hidden="true" />ملخص استخدام السيارة</h2><dl className="mt-4 grid gap-3 sm:grid-cols-3 text-sm"><div className="rounded-xl bg-black/25 p-4"><dt className="text-white/45">الفرع</dt><dd className="mt-1 font-bold">{selectedVehicle.branchName}</dd></div><div className="rounded-xl bg-black/25 p-4"><dt className="text-white/45">الفريق</dt><dd className="mt-1 font-bold">{selectedVehicle.teamName ?? 'متاحة للفرع'}</dd></div><div className="rounded-xl bg-black/25 p-4"><dt className="text-white/45">كل الحجوزات المرتبطة</dt><dd className="mt-1 font-bold">{selectedVehicle.bookingCount}</dd></div></dl></section> : null}</div>
          </div>
        ) : null}

        {tab === 'assignments' ? (
          <section className={panelClass} aria-labelledby="booking-resources-title"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="flex items-center gap-2 text-xs font-bold text-[#d4af37]"><ClipboardList className="size-4" aria-hidden="true" />بعد إسناد الفريق</p><h2 id="booking-resources-title" className="mt-1 text-xl font-black">تخصيص الفني والسيارة للحجز</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-white/45">يحصر النظام الاختيارات في أعضاء فريق الحجز وسيارات الفرع أو الفريق النشطة، ويتحقق من تعارض وقت الحجز قبل الحفظ.</p></div><span className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/65">{bookings.length} حجوزات تشغيلية</span></div><div className="mt-5 space-y-4">{bookings.length ? bookings.map((booking) => <article key={booking.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><h3 dir="ltr" className="font-black text-[#f0d36d]">{booking.bookingNumber}</h3><p className="mt-1 text-sm font-bold">{booking.serviceName}</p><p className="mt-1 text-xs text-white/50">{booking.branchName} · {booking.teamName} · {formatDateTime(booking.startAt)}</p></div><div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3"><span className="rounded-xl bg-white/[0.04] px-3 py-2 text-white/65">الحالة: <strong className="text-white">{booking.bookingStatus}</strong></span><span className="rounded-xl bg-white/[0.04] px-3 py-2 text-white/65">الفني: <strong className="text-white">{booking.employeeName ?? 'غير محدد'}</strong></span><span className="rounded-xl bg-white/[0.04] px-3 py-2 text-white/65">السيارة: <strong className="text-white">{booking.operationalVehicleLabel ?? 'غير محددة'}</strong></span></div></div><BookingResourceAssignmentForm booking={booking} branches={branches} vehicles={vehicles} onResult={setFeedback} /></article>) : <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-sm text-white/45">لا توجد حجوزات نشطة أسند لها فريق ضمن نطاقك حاليًا.</div>}</div></section>
        ) : null}

        {!canManageCatalog ? <div className="flex gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.045] p-4 text-xs leading-6 text-emerald-100/65"><ShieldCheck className="size-5 shrink-0 text-emerald-300" aria-hidden="true" />أنت تدير مخزون وأسطول الفروع المسموح بها فقط. تعريف الأصناف ومتطلبات الخدمات مركزي ويُدار من حساب المالك أو مدير النظام.</div> : null}
        {lowStocks.length ? <div className="flex gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-xs leading-6 text-amber-100/70"><AlertTriangle className="size-5 shrink-0 text-amber-300" aria-hidden="true" />هناك {lowStocks.length} أصناف عند أو أقل من نقطة إعادة الطلب. راجع صفحة «مخزون الفروع» وسجل توريدًا قبل تشغيل حجوزات جديدة.</div> : null}
      </main>
    </div>
  );
}
