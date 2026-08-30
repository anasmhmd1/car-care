'use client';

import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import {
  Ban,
  Car,
  CheckCircle2,
  FileSpreadsheet,
  KeyRound,
  LoaderCircle,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  StickyNote,
  UserRound,
  X,
  CalendarCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toggleCustomerBlockAction, updateCustomerAccountAction } from '@/app/actions/owner';

export interface CustomerVehicleDto {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  plateNumber: string | null;
  vehicleSize: string;
  isDefault: boolean;
}

export interface CustomerAddressDto {
  id: string;
  compound: string;
  district: string;
  street: string;
  buildingNumber: string;
  isDefault: boolean;
}

export interface CustomerBookingSummaryDto {
  id: string;
  bookingNumber: string;
  startAt: string;
  status: string;
  totalPrice: number;
  amountPaid: number;
  serviceName: string;
}

export interface CustomerDto {
  id: string;
  fullName: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  active: boolean;
  mustChangePwd: boolean;
  notes: string | null;
  creditBalance: number;
  totalSpent: number;
  createdAt: string;
  bookingCount: number;
  vehicleCount: number;
  subscriptionCount: number;
  lastBookingAt: string | null;
  vehicles: CustomerVehicleDto[];
  addresses: CustomerAddressDto[];
  recentBookings: CustomerBookingSummaryDto[];
}

export type ManagedCustomerDto = CustomerDto;

interface CustomerManagementPanelProps {
  customers: ManagedCustomerDto[];
  query: string;
}

type Notice = { kind: 'success' | 'error'; text: string } | null;

const inputClass =
  'w-full rounded-xl border border-neutral-800 bg-neutral-950/80 px-3.5 py-2.5 text-xs sm:text-sm text-white outline-none transition placeholder:text-neutral-500 focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/20';
const secondaryButtonClass =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/80 px-4 py-2 text-xs sm:text-sm font-semibold text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/70 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#e5c45a] to-[#d4af37] px-4 py-2 text-xs sm:text-sm font-bold text-neutral-950 shadow-md shadow-[#d4af37]/20 transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/70 disabled:cursor-not-allowed disabled:opacity-50';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(value));
}

function formatCurrency(amount: number) {
  return `${amount.toLocaleString('ar-EG')} ج.م`;
}

function getBookingStatusBadge(status: string) {
  switch (status) {
    case 'COMPLETED':
      return <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">مكتمل</span>;
    case 'IN_PROGRESS':
    case 'ON_THE_WAY':
    case 'ARRIVED':
      return <span className="rounded-full bg-blue-500/15 border border-blue-500/30 px-2.5 py-0.5 text-[11px] font-bold text-blue-300">قيد التنفيذ</span>;
    case 'CANCELLED':
      return <span className="rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-[11px] font-bold text-rose-300">ملغي</span>;
    default:
      return <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">مجدول</span>;
  }
}

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <div
      role={notice.kind === 'error' ? 'alert' : 'status'}
      className={`mb-5 rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium ${
        notice.kind === 'error'
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      }`}
    >
      {notice.text}
    </div>
  );
}

function CustomerCard({
  customer,
  onManage,
}: {
  customer: ManagedCustomerDto;
  onManage: (customer: ManagedCustomerDto) => void;
}) {
  const whatsappNumber = (customer.whatsapp || customer.phone).replace(/[^0-9]/g, '');

  return (
    <article className="rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-5 flex flex-col justify-between space-y-4 shadow-lg hover:border-neutral-700 transition">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-bold text-white">{customer.fullName}</h3>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  customer.active
                    ? 'bg-emerald-400/15 border border-emerald-400/30 text-emerald-300'
                    : 'bg-red-500/20 border border-red-500/40 text-red-300'
                }`}
              >
                {customer.active ? 'حساب نشط' : 'محظور من النظام'}
              </span>
            </div>
            <p className="text-xs text-white/40 mt-0.5">انضم {formatDate(customer.createdAt)}</p>
          </div>
          <button
            type="button"
            onClick={() => onManage(customer)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.06] hover:bg-[#d4af37]/20 border border-white/15 hover:border-[#d4af37]/50 px-3 py-1.5 text-xs font-bold text-white hover:text-[#d4af37] transition-colors"
          >
            <UserRound aria-hidden="true" className="size-3.5" />
            <span>ملف العميل</span>
          </button>
        </div>

        {/* Contact Links */}
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <a
            href={`tel:${customer.phone}`}
            dir="ltr"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.03] border border-white/10 px-2.5 py-1 text-neutral-300 hover:text-[#d4af37] hover:border-[#d4af37]/40"
          >
            <Phone aria-hidden="true" className="size-3 text-[#d4af37]" />
            <span>{customer.phone}</span>
          </a>
          {whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noreferrer"
              dir="ltr"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-emerald-300 hover:bg-emerald-500/20"
            >
              <MessageCircle aria-hidden="true" className="size-3" />
              <span>واتساب</span>
            </a>
          )}
          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              dir="ltr"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.03] border border-white/10 px-2.5 py-1 text-neutral-300 hover:text-white"
            >
              <Mail aria-hidden="true" className="size-3 text-neutral-400" />
              <span className="truncate max-w-[140px]">{customer.email}</span>
            </a>
          )}
        </div>

        {/* Stats Grid */}
        <dl className="grid grid-cols-4 gap-1.5 text-center text-xs pt-1">
          <div className="rounded-xl bg-white/[0.04] p-2">
            <dt className="text-[10px] text-white/40">المنصرف</dt>
            <dd className="mt-0.5 font-black text-[#edce8b] text-[11px] truncate">
              {formatCurrency(customer.totalSpent)}
            </dd>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-2">
            <dt className="text-[10px] text-white/40">الحجوزات</dt>
            <dd className="mt-0.5 font-bold tabular-nums text-white">{customer.bookingCount}</dd>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-2">
            <dt className="text-[10px] text-white/40">السيارات</dt>
            <dd className="mt-0.5 font-bold tabular-nums text-white">{customer.vehicleCount}</dd>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-2">
            <dt className="text-[10px] text-white/40">الاشتراكات</dt>
            <dd className="mt-0.5 font-bold tabular-nums text-white">{customer.subscriptionCount}</dd>
          </div>
        </dl>

        {/* Vehicles & Addresses Summary */}
        <div className="space-y-1.5 pt-1 text-xs">
          {customer.vehicles.length > 0 && (
            <div className="flex items-center gap-1.5 text-neutral-300 truncate">
              <Car aria-hidden="true" className="size-3.5 text-[#d4af37] shrink-0" />
              <span className="truncate">
                {customer.vehicles
                  .map((v) => `${v.make} ${v.model} ${v.year}`)
                  .slice(0, 2)
                  .join(' · ')}
                {customer.vehicles.length > 2 ? ` (+${customer.vehicles.length - 2})` : ''}
              </span>
            </div>
          )}
          {customer.addresses.length > 0 && (
            <div className="flex items-center gap-1.5 text-neutral-300 truncate">
              <MapPin aria-hidden="true" className="size-3.5 text-neutral-400 shrink-0" />
              <span className="truncate">
                {customer.addresses
                  .map((a) => a.compound || a.district)
                  .slice(0, 2)
                  .join(' · ')}
              </span>
            </div>
          )}
          {customer.notes && (
            <div className="flex items-start gap-1.5 text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-[11px] leading-relaxed">
              <StickyNote aria-hidden="true" className="size-3.5 shrink-0 mt-0.5 text-amber-400" />
              <span className="line-clamp-2">{customer.notes}</span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/10 pt-3 text-[11px] text-white/40 flex items-center justify-between">
        <span>آخر حجز: {customer.lastBookingAt ? formatDate(customer.lastBookingAt) : 'لا يوجد'}</span>
        {customer.mustChangePwd && (
          <span className="inline-flex items-center gap-1 text-amber-300">
            <KeyRound aria-hidden="true" className="size-3" />
            تغيير كلمة المرور
          </span>
        )}
      </div>
    </article>
  );
}

function CustomerAccountDialog({
  customer,
  pending,
  error,
  onClose,
  onSubmit,
  onToggleBlock,
}: {
  customer: ManagedCustomerDto;
  pending: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleBlock: (customerId: string, block: boolean, reason: string) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'vehicles' | 'addresses' | 'history'>('profile');
  const [showBanPrompt, setShowBanPrompt] = useState(false);
  const [banReason, setBanReason] = useState('');

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, pending]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/85 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-account-title"
        tabIndex={-1}
        className="w-full max-w-3xl rounded-3xl border border-white/15 bg-[#0d0d0d] p-5 sm:p-7 shadow-2xl outline-none max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-[#d4af37] bg-[#d4af37]/10 border border-[#d4af37]/30 px-2.5 py-0.5 rounded-full">
                ملف العميل الشامل (CRM)
              </span>
              <span className="text-xs text-white/50">كود: {customer.id.slice(0, 8)}</span>
            </div>
            <h2 id="customer-account-title" className="mt-1.5 text-2xl font-black text-white">
              {customer.fullName}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-white/60 mt-1">
              <span>إجمالي المنصرف: <strong className="text-[#edce8b]">{formatCurrency(customer.totalSpent)}</strong></span>
              <span>•</span>
              <span>رصيد المحفظة: <strong className="text-white">{formatCurrency(customer.creditBalance)}</strong></span>
              <span>•</span>
              <span>الحجوزات: <strong className="text-white">{customer.bookingCount}</strong></span>
            </div>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/70 disabled:opacity-50"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-white/10 py-3 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeTab === 'profile'
                ? 'bg-[#d4af37] text-black shadow-md'
                : 'bg-white/[0.04] text-white/70 hover:text-white'
            }`}
          >
            البيانات والملاحظات (CRM)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('vehicles')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeTab === 'vehicles'
                ? 'bg-[#d4af37] text-black shadow-md'
                : 'bg-white/[0.04] text-white/70 hover:text-white'
            }`}
          >
            <Car className="size-3.5" />
            <span>السيارات ({customer.vehicles.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('addresses')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeTab === 'addresses'
                ? 'bg-[#d4af37] text-black shadow-md'
                : 'bg-white/[0.04] text-white/70 hover:text-white'
            }`}
          >
            <MapPin className="size-3.5" />
            <span>العناوين ({customer.addresses.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-[#d4af37] text-black shadow-md'
                : 'bg-white/[0.04] text-white/70 hover:text-white'
            }`}
          >
            <CalendarCheck className="size-3.5" />
            <span>سجل الحجوزات ({customer.bookingCount})</span>
          </button>
        </div>

        {error ? (
          <div role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="overflow-y-auto flex-1 py-4 space-y-5">
          {/* TAB 1: Profile & CRM Notes Form */}
          {activeTab === 'profile' && (
            <form id="customer-crm-form" onSubmit={onSubmit} className="space-y-5">
              <input type="hidden" name="customerId" value={customer.id} />

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-white/75">
                  الاسم الكامل
                  <input
                    name="fullName"
                    required
                    minLength={2}
                    maxLength={100}
                    defaultValue={customer.fullName}
                    autoComplete="name"
                    className={`mt-2 ${inputClass}`}
                  />
                </label>
                <label className="block text-sm font-medium text-white/75">
                  رقم الهاتف
                  <input
                    name="phone"
                    type="tel"
                    required
                    minLength={8}
                    maxLength={20}
                    defaultValue={customer.phone}
                    autoComplete="tel"
                    dir="ltr"
                    className={`mt-2 ${inputClass}`}
                  />
                </label>
                <label className="block text-sm font-medium text-white/75">
                  واتساب
                  <input
                    name="whatsapp"
                    type="tel"
                    maxLength={20}
                    defaultValue={customer.whatsapp ?? ''}
                    autoComplete="tel"
                    dir="ltr"
                    className={`mt-2 ${inputClass}`}
                  />
                </label>
                <label className="block text-sm font-medium text-white/75">
                  البريد الإلكتروني
                  <input
                    name="email"
                    type="email"
                    maxLength={320}
                    defaultValue={customer.email ?? ''}
                    autoComplete="email"
                    dir="ltr"
                    className={`mt-2 ${inputClass}`}
                  />
                </label>
              </div>

              {/* CRM Notes */}
              <div className="rounded-2xl border border-[#d4af37]/30 bg-[#d4af37]/[0.04] p-4 space-y-2">
                <label htmlFor="customer-notes" className="flex items-center gap-2 text-sm font-bold text-[#edce8b]">
                  <StickyNote className="size-4" />
                  <span>ملاحظات الإدارة والمتابعة (CRM Notes)</span>
                </label>
                <textarea
                  id="customer-notes"
                  name="notes"
                  rows={3}
                  maxLength={1000}
                  defaultValue={customer.notes ?? ''}
                  placeholder="سجل أي ملاحظات خاصة بالعميل: تفضيلاته، نوع العناية، تقييمه الداخلي، أو تعليمات الدخول..."
                  className={inputClass}
                />
                <p className="text-xs text-white/40">هذه الملاحظات خاصة بالإدارة والمالك فقط ولا تظهر للعميل.</p>
              </div>

              {/* Ban / Blacklist Customer Management */}
              <div className={`rounded-2xl border p-4 ${customer.active ? 'border-red-500/30 bg-red-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-bold text-white">
                      <Ban className="size-4 text-red-400" />
                      {customer.active ? 'حظر العميل من النظام والحجز (Blacklist)' : 'إلغاء حظر العميل واستئناف حسابه'}
                    </h4>
                    <p className="mt-1 text-xs text-neutral-300">
                      {customer.active
                        ? 'عند حظر العميل، لن يتمكن من تسجيل الدخول أو إتمام أي حجوزات جديدة من الموقع.'
                        : 'الحساب محظور حالياً. يمكنك إلغاء الحظر لإعادة تمكين العميل من الحجز واستخدام حسابه.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (customer.active) {
                        setShowBanPrompt(true);
                      } else {
                        onToggleBlock(customer.id, false, 'استئناف الحساب بقرار إداري');
                      }
                    }}
                    className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition ${
                      customer.active
                        ? 'bg-red-600 text-white hover:bg-red-500'
                        : 'bg-emerald-500 text-black hover:bg-emerald-400'
                    }`}
                  >
                    {customer.active ? 'حظر هذا العميل' : 'إلغاء الحظر واستئناف الحساب'}
                  </button>
                </div>

                {showBanPrompt && customer.active && (
                  <div className="mt-4 space-y-3 border-t border-red-500/20 pt-3">
                    <label htmlFor="ban-reason-input" className="block text-xs font-bold text-red-200">
                      سبب الحظر الإداري (سيسجل في ملاحظات CRM وسجل التدقيق)
                    </label>
                    <textarea
                      id="ban-reason-input"
                      rows={2}
                      required
                      minLength={3}
                      value={banReason}
                      onChange={(e) => setBanReason(e.target.value)}
                      placeholder="اكتب سبب حظر العميل (مثلاً: مشاكل متكررة مع الفرق، إساءة استخدام الخدمة...)"
                      className={inputClass}
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setShowBanPrompt(false)}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300"
                      >
                        تراجع
                      </button>
                      <button
                        type="button"
                        disabled={banReason.trim().length < 3 || pending}
                        onClick={() => onToggleBlock(customer.id, true, banReason)}
                        className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50"
                      >
                        تأكيد حظر العميل
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Password Reset */}
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-4">
                <label htmlFor="customer-temporary-password" className="flex items-center gap-2 text-sm font-semibold text-amber-100">
                  <KeyRound aria-hidden="true" className="size-4" />
                  إعادة تعيين كلمة المرور (اختياري)
                </label>
                <input
                  id="customer-temporary-password"
                  name="temporaryPassword"
                  type="password"
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  className={`mt-3 ${inputClass}`}
                  placeholder="اتركه فارغًا إذا لم تحتج لإعادة التعيين"
                />
                <p className="mt-2 text-xs leading-5 text-white/50">
                  إن أدخلت كلمة مرور مؤقتة، سيُطلب من العميل تغييرها عند أول دخول وستُلغى كل الجلسات الحالية.
                </p>
              </div>
            </form>
          )}

          {/* TAB 2: Vehicles */}
          {activeTab === 'vehicles' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white">السيارات المسجلة بحساب العميل</h3>
              {customer.vehicles.length === 0 ? (
                <p className="text-xs text-white/50 bg-white/[0.02] p-6 rounded-2xl border border-white/10 text-center">
                  لم يسجل العميل أي سيارات بعد.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {customer.vehicles.map((v) => (
                    <div key={v.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-sm">{v.make} {v.model}</span>
                        {v.isDefault && (
                          <span className="rounded-full bg-[#d4af37]/20 border border-[#d4af37]/40 px-2 py-0.5 text-[10px] font-bold text-[#edce8b]">
                            الافتراضية
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/60">موديل {v.year} · اللون {v.color} · {v.vehicleSize}</p>
                      {v.plateNumber && <p className="text-xs font-mono text-white/80">لوحة: {v.plateNumber}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Addresses */}
          {activeTab === 'addresses' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white">العناوين المحفوظة بحساب العميل</h3>
              {customer.addresses.length === 0 ? (
                <p className="text-xs text-white/50 bg-white/[0.02] p-6 rounded-2xl border border-white/10 text-center">
                  لم يسجل العميل أي عناوين بعد.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {customer.addresses.map((a) => (
                    <div key={a.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-sm">{a.compound || a.district}</span>
                        {a.isDefault && (
                          <span className="rounded-full bg-[#d4af37]/20 border border-[#d4af37]/40 px-2 py-0.5 text-[10px] font-bold text-[#edce8b]">
                            الافتراضي
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/60">{a.district} · {a.street} · مبنى {a.buildingNumber}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Recent Bookings */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white">سجل آخر الحجوزات</h3>
              {customer.recentBookings.length === 0 ? (
                <p className="text-xs text-white/50 bg-white/[0.02] p-6 rounded-2xl border border-white/10 text-center">
                  لا توجد حجوزات مسجلة لهذا العميل حتى الآن.
                </p>
              ) : (
                <div className="space-y-2">
                  {customer.recentBookings.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white">{b.bookingNumber}</span>
                          <span className="text-white/40">·</span>
                          <span className="font-bold text-[#edce8b]">{b.serviceName}</span>
                        </div>
                        <p className="text-white/50">{formatDate(b.startAt)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-white">{formatCurrency(b.totalPrice)}</span>
                        {getBookingStatusBadge(b.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButtonClass}>
            إلغاء
          </button>
          <button
            type="submit"
            form="customer-crm-form"
            disabled={pending}
            aria-busy={pending}
            className={primaryButtonClass}
          >
            {pending ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                جارٍ الحفظ…
              </>
            ) : (
              <>
                <ShieldCheck aria-hidden="true" className="size-4" />
                حفظ بيانات وملاحظات العميل
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CustomerManagementPanel({
  customers,
  query,
}: CustomerManagementPanelProps) {
  const router = useRouter();
  const [selectedCustomer, setSelectedCustomer] = useState<ManagedCustomerDto | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [actionError, setActionError] = useState('');
  const [isPending, startTransition] = useTransition();

  function closeDialog() {
    if (isPending) return;
    setSelectedCustomer(null);
    setActionError('');
  }

  function openCustomer(customer: ManagedCustomerDto) {
    setActionError('');
    setSelectedCustomer(customer);
  }

  function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setActionError('');
    startTransition(async () => {
      try {
        const result = await updateCustomerAccountAction(formData);
        if ('error' in result && result.error) {
          setActionError(result.error);
          return;
        }
        setSelectedCustomer(null);
        setNotice({ kind: 'success', text: result.message ?? 'تم حفظ بيانات وملاحظات حساب العميل.' });
        router.refresh();
      } catch {
        setActionError('تعذر حفظ التغييرات الآن. راجع الاتصال ثم حاول مرة أخرى.');
      }
    });
  }

  function toggleBlock(customerId: string, block: boolean, reason: string) {
    setActionError('');
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set('customerId', customerId);
        formData.set('block', String(block));
        formData.set('reason', reason);
        const result = await toggleCustomerBlockAction(formData);
        if ('error' in result && result.error) {
          setActionError(result.error);
          return;
        }
        setSelectedCustomer(null);
        setNotice({
          kind: 'success',
          text: result.message ?? (block ? 'تم حظر العميل بنجاح.' : 'تم إلغاء حظر العميل بنجاح.'),
        });
        router.refresh();
      } catch {
        setActionError('تعذر تنفيذ الإجراء الآن. راجع الاتصال ثم حاول مرة أخرى.');
      }
    });
  }

  const exportUrl = `/admin/customers/export${query ? `?q=${encodeURIComponent(query)}` : ''}`;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 border-b border-neutral-800/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#d4af37]/15 border border-[#d4af37]/40 px-3 py-0.5 text-xs font-black uppercase tracking-wider text-[#f3e4a8]">
              CRM & CUSTOMERS
            </span>
          </div>
          <h2 className="mt-1.5 text-xl sm:text-2xl font-black text-white">إدارة ومتابعة العملاء (CRM)</h2>
          <p className="mt-1.5 max-w-2xl text-xs sm:text-sm leading-6 text-neutral-400">
            متابعة شاملة لملفات العملاء وسياراتهم وعناوينهم، تدوين الملاحظات الإدارية، وإمكانية حظر أو إلغاء حظر العملاء، مع التصدير الفوري لشيت إكسيل.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/80 px-3.5 py-2 text-xs sm:text-sm font-semibold text-neutral-300">
            <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-400" />
            {customers.length} عميل مسجل
          </span>

          {/* Export to Excel Button */}
          <a
            href={exportUrl}
            download
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 px-4 py-2 text-xs sm:text-sm font-bold text-emerald-300 transition-all shadow-md active:scale-98"
            title="تحميل شيت إكسيل ببيانات العملاء"
          >
            <FileSpreadsheet aria-hidden="true" className="size-4 text-emerald-400" />
            <span>تصدير إكسيل (Excel)</span>
          </a>
        </div>
      </div>

      {/* Search Bar */}
      <form
        action="/admin"
        method="get"
        className="flex flex-col gap-3 rounded-2xl border border-neutral-800/80 bg-[#111114]/90 backdrop-blur-md p-4 sm:flex-row shadow-md"
      >
        <input type="hidden" name="section" value="customers" />
        <label className="sr-only" htmlFor="customer-search">
          البحث في العملاء
        </label>
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500"
          />
          <input
            id="customer-search"
            name="customer_q"
            defaultValue={query}
            maxLength={100}
            placeholder="الاسم، رقم الهاتف، واتساب أو البريد الإلكتروني…"
            className={`${inputClass} pr-10`}
          />
        </div>
        <button type="submit" className={primaryButtonClass}>
          <Search aria-hidden="true" className="size-4" />
          <span>بحث</span>
        </button>
        {query ? (
          <a href="/admin?section=customers" className={secondaryButtonClass}>
            مسح البحث
          </a>
        ) : null}
      </form>

      {/* Main Grid / Empty State */}
      <div>
        <NoticeBox notice={notice} />
        {customers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-800 bg-[#111114]/40 p-8 text-center">
            <UserRound aria-hidden="true" className="mx-auto size-8 text-neutral-600" />
            <h3 className="mt-3 font-bold text-white text-base">لا توجد نتائج مطابقة</h3>
            <p className="mt-1.5 text-xs sm:text-sm text-neutral-400">
              جرّب جزءًا من الاسم أو رقم الهاتف أو امسح البحث لعرض أحدث العملاء.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {customers.map((customer) => (
              <CustomerCard key={customer.id} customer={customer} onManage={openCustomer} />
            ))}
          </div>
        )}
      </div>

      {selectedCustomer ? (
        <CustomerAccountDialog
          customer={selectedCustomer}
          pending={isPending}
          error={actionError}
          onClose={closeDialog}
          onSubmit={submitCustomer}
          onToggleBlock={toggleBlock}
        />
      ) : null}
    </div>
  );
}
