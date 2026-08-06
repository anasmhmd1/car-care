'use client';

import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react';
import { CheckCircle2, KeyRound, LoaderCircle, Mail, Phone, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { updateCustomerAccountAction } from '@/app/actions/owner';

export interface ManagedCustomerDto {
  id: string;
  fullName: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  active: boolean;
  mustChangePwd: boolean;
  createdAt: string;
  bookingCount: number;
  vehicleCount: number;
  subscriptionCount: number;
  lastBookingAt: string | null;
}

interface CustomerManagementPanelProps {
  customers: ManagedCustomerDto[];
  query: string;
}

type Notice = { kind: 'success' | 'error'; text: string } | null;

const inputClass = 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#d4af37]/70 focus:ring-2 focus:ring-[#d4af37]/20';
const secondaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/70 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#d4af37] px-4 text-sm font-bold text-black transition hover:bg-[#e5c45a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/70 disabled:cursor-not-allowed disabled:opacity-50';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(value));
}

function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <div
      role={notice.kind === 'error' ? 'alert' : 'status'}
      className={`mb-5 rounded-xl border px-4 py-3 text-sm ${notice.kind === 'error'
        ? 'border-red-400/30 bg-red-400/10 text-red-100'
        : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'}`}
    >
      {notice.text}
    </div>
  );
}

function CustomerCard({ customer, onManage }: { customer: ManagedCustomerDto; onManage: (customer: ManagedCustomerDto) => void }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-bold text-white">{customer.fullName}</h3>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${customer.active ? 'bg-emerald-400/15 text-emerald-200' : 'bg-red-400/15 text-red-200'}`}>
              {customer.active ? 'حساب نشط' : 'حساب متوقف'}
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-1.5 text-sm text-white/60">
            <a href={`tel:${customer.phone}`} dir="ltr" className="inline-flex w-fit items-center gap-2 text-[#d4af37] hover:underline"><Phone aria-hidden="true" className="size-3.5" />{customer.phone}</a>
            {customer.whatsapp ? <a href={`tel:${customer.whatsapp}`} dir="ltr" className="inline-flex w-fit items-center gap-2 hover:text-white"><Phone aria-hidden="true" className="size-3.5" />{customer.whatsapp}</a> : null}
            {customer.email ? <a href={`mailto:${customer.email}`} dir="ltr" className="inline-flex w-fit items-center gap-2 break-all hover:text-white"><Mail aria-hidden="true" className="size-3.5" />{customer.email}</a> : null}
          </div>
        </div>
        <button type="button" onClick={() => onManage(customer)} className={`${secondaryButtonClass} shrink-0`}>
          <UserRound aria-hidden="true" className="size-4" /> إدارة الحساب
        </button>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-xs text-white/40">الحجوزات</dt><dd className="mt-1 font-bold tabular-nums text-white">{customer.bookingCount.toLocaleString('ar-EG')}</dd></div>
        <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-xs text-white/40">السيارات</dt><dd className="mt-1 font-bold tabular-nums text-white">{customer.vehicleCount.toLocaleString('ar-EG')}</dd></div>
        <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-xs text-white/40">الاشتراكات</dt><dd className="mt-1 font-bold tabular-nums text-white">{customer.subscriptionCount.toLocaleString('ar-EG')}</dd></div>
      </dl>
      <p className="mt-4 text-xs leading-5 text-white/40">
        انضم {formatDate(customer.createdAt)}{customer.lastBookingAt ? ` · آخر حجز ${formatDate(customer.lastBookingAt)}` : ' · لا توجد حجوزات بعد'}
        {customer.mustChangePwd ? <span className="mr-2 inline-flex items-center gap-1 text-amber-200"><KeyRound aria-hidden="true" className="size-3" />بانتظار تغيير كلمة المرور</span> : null}
      </p>
    </article>
  );
}

function CustomerAccountDialog({
  customer,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  customer: ManagedCustomerDto;
  pending: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/80 p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="customer-account-title" tabIndex={-1} className="w-full max-w-2xl rounded-3xl border border-white/15 bg-[#0d0d0d] p-5 shadow-2xl outline-none sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#d4af37]">إدارة حساب العميل</p>
            <h2 id="customer-account-title" className="mt-1 text-xl font-black text-white">{customer.fullName}</h2>
          </div>
          <button type="button" disabled={pending} onClick={onClose} aria-label="إغلاق" className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/70 disabled:opacity-50"><X aria-hidden="true" className="size-5" /></button>
        </div>
        <p className="mt-3 text-sm leading-6 text-white/55">يمكن تعديل بيانات التواصل أو حالة الحساب فقط. لا يمكن تغيير دور العميل أو منحه أي صلاحيات إدارية من هذه الشاشة.</p>
        {error ? <div role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</div> : null}

        <form key={customer.id} onSubmit={onSubmit} className="mt-6 space-y-5">
          <input type="hidden" name="customerId" value={customer.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-white/75">الاسم الكامل *<input name="fullName" required minLength={2} maxLength={100} defaultValue={customer.fullName} autoComplete="name" className={`mt-2 ${inputClass}`} /></label>
            <label className="block text-sm font-medium text-white/75">رقم الهاتف *<input name="phone" type="tel" required minLength={8} maxLength={20} defaultValue={customer.phone} autoComplete="tel" dir="ltr" className={`mt-2 ${inputClass}`} /></label>
            <label className="block text-sm font-medium text-white/75">واتساب<input name="whatsapp" type="tel" maxLength={20} defaultValue={customer.whatsapp ?? ''} autoComplete="tel" dir="ltr" className={`mt-2 ${inputClass}`} /></label>
            <label className="block text-sm font-medium text-white/75">البريد الإلكتروني<input name="email" type="email" maxLength={320} defaultValue={customer.email ?? ''} autoComplete="email" dir="ltr" className={`mt-2 ${inputClass}`} /></label>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <label htmlFor="customer-account-active" className="flex flex-col gap-2 text-sm font-medium text-white/80 sm:flex-row sm:items-center sm:justify-between">
              حالة الحساب
              <select id="customer-account-active" name="active" defaultValue={customer.active ? 'true' : 'false'} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[#d4af37]/70">
                <option value="true">نشط — يمكنه تسجيل الدخول والحجز</option>
                <option value="false">متوقف — يمنع الدخول ويلغي الجلسات</option>
              </select>
            </label>
            <p className="mt-2 text-xs leading-5 text-white/45">تغيير الحالة أو رقم الهاتف يلغي الجلسات السابقة تلقائيًا لحماية الحساب.</p>
          </div>

          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-4">
            <label htmlFor="customer-temporary-password" className="flex items-center gap-2 text-sm font-semibold text-amber-100"><KeyRound aria-hidden="true" className="size-4" />إعادة تعيين كلمة المرور (اختياري)</label>
            <input id="customer-temporary-password" name="temporaryPassword" type="password" minLength={12} maxLength={128} autoComplete="new-password" className={`mt-3 ${inputClass}`} placeholder="اتركه فارغًا إذا لم تحتج لإعادة التعيين" />
            <p className="mt-2 text-xs leading-5 text-white/50">إن أدخلت كلمة مرور مؤقتة، سيُطلب من العميل تغييرها عند أول دخول وستُلغى كل الجلسات الحالية.</p>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={pending} className={secondaryButtonClass}>إلغاء</button>
            <button type="submit" disabled={pending} aria-busy={pending} className={primaryButtonClass}>{pending ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />جارٍ الحفظ…</> : <><ShieldCheck aria-hidden="true" className="size-4" />حفظ آمن للتغييرات</>}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CustomerManagementPanel({ customers, query }: CustomerManagementPanelProps) {
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
        setNotice({ kind: 'success', text: result.message ?? 'تم حفظ بيانات حساب العميل.' });
        router.refresh();
      } catch {
        setActionError('تعذر حفظ التغييرات الآن. راجع الاتصال ثم حاول مرة أخرى.');
      }
    });
  }

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#d4af37]">العملاء</p>
          <h2 className="mt-1 text-2xl font-black text-white">إدارة حسابات العملاء</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">ابحث بالاسم أو الهاتف أو واتساب أو البريد الإلكتروني، ثم راجع بيانات التواصل وحالة الحساب بأثرٍ مسجل.</p>
        </div>
        <span className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/65 sm:self-auto"><CheckCircle2 aria-hidden="true" className="size-4 text-emerald-300" />{customers.length} نتيجة</span>
      </div>

      <form action="/admin" method="get" className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:flex-row">
        <input type="hidden" name="section" value="customers" />
        <label className="sr-only" htmlFor="customer-search">البحث في العملاء</label>
        <div className="relative flex-1"><Search aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-white/35" /><input id="customer-search" name="customer_q" defaultValue={query} maxLength={100} placeholder="الاسم، رقم الهاتف، واتساب أو البريد الإلكتروني" className={`${inputClass} pr-10`} /></div>
        <button type="submit" className={primaryButtonClass}><Search aria-hidden="true" className="size-4" />بحث</button>
        {query ? <a href="/admin?section=customers" className={secondaryButtonClass}>مسح البحث</a> : null}
      </form>

      <div className="mt-6">
        <NoticeBox notice={notice} />
        {customers.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center"><UserRound aria-hidden="true" className="mx-auto size-7 text-white/35" /><h3 className="mt-3 font-bold text-white">لا توجد نتائج مطابقة</h3><p className="mt-2 text-sm text-white/50">جرّب جزءًا من الاسم أو رقم الهاتف أو امسح البحث لعرض أحدث العملاء.</p></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{customers.map((customer) => <CustomerCard key={customer.id} customer={customer} onManage={openCustomer} />)}</div>}
      </div>

      {selectedCustomer ? <CustomerAccountDialog customer={selectedCustomer} pending={isPending} error={actionError} onClose={closeDialog} onSubmit={submitCustomer} /> : null}
    </div>
  );
}
