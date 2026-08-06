import type { Metadata } from 'next';
import Link from 'next/link';
import { BookingStatus, PaymentStatus, UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { getAccessibleBranchIds } from '@/lib/auth/authorization';
import { redirect } from 'next/navigation';
import {
  parseReportFilters,
  reportFiltersToSearchParams,
  type ReportSearchParams,
} from '@/lib/reports/filters';
import { bookingStatusLabels, paymentStatusLabels, responsiblePartyLabels } from '@/lib/reports/labels';
import { buildReports, getReportFilterOptions } from '@/lib/reports/report';
import type {
  BookingReportRow,
  CompletionRateRow,
  CountRow,
  CountValueRow,
  ReportsResult,
  RevenueRow,
} from '@/lib/reports/types';

export const metadata: Metadata = {
  title: 'مركز التقارير | بريق',
  description: 'تقارير بريق التشغيلية والمالية الداخلية.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface ReportsPageProps {
  searchParams: Promise<ReportSearchParams>;
}

const moneyFormatter = new Intl.NumberFormat('ar-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('ar-EG');

function money(value: number): string {
  return moneyFormatter.format(value);
}

function number(value: number): string {
  return numberFormatter.format(value);
}

function rate(value: number): string {
  return `${numberFormatter.format(value)}٪`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

interface MetricCardProps {
  label: string;
  value: string;
  note?: string;
  tone?: 'gold' | 'teal' | 'rose' | 'neutral';
}

const toneClasses = {
  gold: 'border-[#c9a227]/35 before:bg-[#c9a227]',
  teal: 'border-cyan-300/25 before:bg-cyan-300',
  rose: 'border-rose-400/25 before:bg-rose-400',
  neutral: 'border-white/10 before:bg-neutral-500',
} as const;

function MetricCard({ label, value, note, tone = 'neutral' }: MetricCardProps) {
  return (
    <article className={`relative overflow-hidden rounded-2xl border bg-[#10100f] px-5 py-4 before:absolute before:inset-y-0 before:right-0 before:w-1 ${toneClasses[tone]}`}>
      <p className="text-xs font-medium text-neutral-400">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-tight text-white">{value}</p>
      {note ? <p className="mt-2 text-[11px] leading-5 text-neutral-500">{note}</p> : null}
    </article>
  );
}

interface SectionHeadingProps {
  code: string;
  title: string;
  description: string;
}

function SectionHeading({ code, title, description }: SectionHeadingProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="font-mono text-[11px] font-bold tracking-[0.24em] text-[#d7b941]">{code}</p>
        <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">{title}</h2>
      </div>
      <p className="max-w-2xl text-sm leading-7 text-neutral-400">{description}</p>
    </header>
  );
}

interface RateMeterProps {
  label: string;
  value: number;
  detail: string;
}

function RateMeter({ label, value, detail }: RateMeterProps) {
  const visualValue = Math.min(100, Math.max(0, value));
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-bold text-neutral-200">{label}</span>
        <span className="font-mono text-lg font-black text-[#ecd66f]">{rate(value)}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={visualValue}
        className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-800"
      >
        <div className="h-full rounded-full bg-[#c9a227]" style={{ width: `${visualValue}%` }} />
      </div>
      <p className="mt-2 text-[11px] leading-5 text-neutral-500">{detail}</p>
    </div>
  );
}

interface CountRailProps {
  title: string;
  rows: CountRow[];
  labelFor?: (row: CountRow) => string;
  emptyText?: string;
}

function CountRail({ title, rows, labelFor = (row) => row.label, emptyText = 'لا توجد بيانات ضمن النطاق الحالي.' }: CountRailProps) {
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  return (
    <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <h3 className="text-sm font-black text-white">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-neutral-500">{emptyText}</p>
      ) : (
        <ol className="mt-5 space-y-4">
          {rows.map((row) => (
            <li key={row.id}>
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="truncate text-neutral-300">{labelFor(row)}</span>
                <strong className="font-mono text-[#ecd66f]">{number(row.count)}</strong>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
                <div className="h-full rounded-full bg-[#9f8120]" style={{ width: `${Math.max(3, (row.count / maximum) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

interface CountValueTableProps {
  title: string;
  rows: CountValueRow[];
}

function CountValueTable({ title, rows }: CountValueTableProps) {
  return (
    <article className="min-w-0 rounded-2xl border border-white/10 bg-black/20 p-5">
      <h3 className="text-sm font-black text-white">{title}</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-right text-xs">
          <caption className="sr-only">{title}</caption>
          <thead className="text-neutral-500">
            <tr className="border-b border-white/10">
              <th scope="col" className="px-2 py-3 font-medium">البند</th>
              <th scope="col" className="px-2 py-3 font-medium">الحجوزات</th>
              <th scope="col" className="px-2 py-3 font-medium">القيمة</th>
              <th scope="col" className="px-2 py-3 font-medium">المحصّل</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-2 py-8 text-center text-neutral-500">لا توجد بيانات مطابقة.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5 last:border-0">
                <th scope="row" className="px-2 py-3 font-bold text-neutral-200">{row.label}</th>
                <td className="px-2 py-3 font-mono text-neutral-300">{number(row.count)}</td>
                <td className="px-2 py-3 font-mono text-neutral-300">{money(row.bookingValue)}</td>
                <td className="px-2 py-3 font-mono text-[#d7b941]">{money(row.collected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function RatingScoreTable({ title, rows }: CountValueTableProps) {
  return (
    <article className="min-w-0 rounded-2xl border border-[#c9a227]/20 bg-black/20 p-5">
      <h3 className="text-sm font-black text-[#e5c45a]">{title}</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[280px] border-collapse text-right text-xs">
          <caption className="sr-only">{title}</caption>
          <thead className="text-neutral-500">
            <tr className="border-b border-white/10">
              <th scope="col" className="px-2 py-3 font-medium">البند</th>
              <th scope="col" className="px-2 py-3 font-medium">عدد التقييمات</th>
              <th scope="col" className="px-2 py-3 font-medium">متوسط التقييم</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-2 py-8 text-center text-neutral-500">لا توجد تقييمات مطابقة.</td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5 last:border-0">
                <th scope="row" className="px-2 py-3 font-bold text-neutral-200">{row.label}</th>
                <td className="px-2 py-3 font-mono text-neutral-300">{number(row.count)}</td>
                <td className="px-2 py-3 font-mono font-bold text-[#e5c45a]">{row.bookingValue.toFixed(1)} ★</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

interface RevenueTableProps {
  title: string;
  rows: RevenueRow[];
}

function RevenueTable({ title, rows }: RevenueTableProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <h3 className="text-sm font-black text-white">{title}</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[360px] text-right text-xs">
          <caption className="sr-only">{title}</caption>
          <thead><tr className="border-b border-white/10 text-neutral-500"><th scope="col" className="py-3">البند</th><th scope="col" className="py-3">الدفعات</th><th scope="col" className="py-3">المبلغ</th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="py-8 text-center text-neutral-500">لا توجد دفعات مطابقة.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5 last:border-0">
                <th scope="row" className="py-3 font-bold text-neutral-200">{row.label}</th>
                <td className="py-3 font-mono text-neutral-400">{number(row.count)}</td>
                <td className="py-3 font-mono font-bold text-[#ecd66f]">{money(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function CompletionTable({ rows }: { rows: CompletionRateRow[] }) {
  return (
    <article className="min-w-0 rounded-2xl border border-white/10 bg-black/20 p-5">
      <h3 className="text-sm font-black text-white">نِسب إتمام الفرق</h3>
      <p className="mt-1 text-[11px] leading-5 text-neutral-500">الحجوزات المكتملة من كل الحجوزات المسندة غير الملغاة داخل الفترة.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-right text-xs">
          <caption className="sr-only">نِسب إتمام الفرق التشغيلية</caption>
          <thead><tr className="border-b border-white/10 text-neutral-500"><th scope="col" className="py-3">الفريق</th><th scope="col" className="py-3">المسند</th><th scope="col" className="py-3">المكتمل</th><th scope="col" className="py-3">الإتمام</th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="py-8 text-center text-neutral-500">لا توجد حجوزات مسندة ضمن النطاق.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5 last:border-0">
                <th scope="row" className="py-3 font-bold text-neutral-200">{row.label}</th>
                <td className="py-3 font-mono text-neutral-400">{number(row.assigned)}</td>
                <td className="py-3 font-mono text-neutral-300">{number(row.completed)}</td>
                <td className="py-3 font-mono font-bold text-[#ecd66f]">{rate(row.completionRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function BookingsTable({ rows }: { rows: BookingReportRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
      <table className="w-full min-w-[1050px] text-right text-xs">
        <caption className="sr-only">تفاصيل الحجوزات الواقعة مواعيدها داخل الفترة المحددة</caption>
        <thead className="bg-white/[0.03] text-neutral-500">
          <tr>
            {['الحجز', 'الموعد', 'الفرع', 'الخدمة', 'المنطقة', 'الفريق', 'حالة الحجز', 'حالة الدفع', 'القيمة', 'المتبقي'].map((heading) => (
              <th key={heading} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={10} className="px-4 py-12 text-center text-neutral-500">لا توجد حجوزات مواعيدها داخل هذه الفترة والفلاتر.</td></tr>
          ) : rows.map((booking) => (
            <tr key={booking.bookingNumber} className="border-t border-white/5">
              <th scope="row" className="whitespace-nowrap px-4 py-3 font-mono font-bold text-[#ecd66f]">{booking.bookingNumber}</th>
              <td className="whitespace-nowrap px-4 py-3 text-neutral-300">{formatDateTime(booking.startAt)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-neutral-300">{booking.branch}</td>
              <td className="whitespace-nowrap px-4 py-3 text-neutral-300">{booking.service}</td>
              <td className="whitespace-nowrap px-4 py-3 text-neutral-400">{booking.zone} — {booking.area}</td>
              <td className="whitespace-nowrap px-4 py-3 text-neutral-300">{booking.team}</td>
              <td className="whitespace-nowrap px-4 py-3 text-neutral-300">{bookingStatusLabels[booking.bookingStatus]}</td>
              <td className="whitespace-nowrap px-4 py-3 text-neutral-300">{paymentStatusLabels[booking.paymentStatus]}</td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-neutral-300">{money(booking.totalPrice)}</td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-rose-300">{money(booking.amountDue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverviewStrip({ report }: { report: ReportsResult }) {
  return (
    <section aria-label="المؤشرات الرئيسية" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
      <MetricCard label="الحجوزات" value={number(report.bookings.total)} note="موعدها داخل الفترة" tone="gold" />
      <MetricCard label="صافي المحصّل" value={money(report.financial.netCollected)} note="دفعات الحدث ناقص الاسترداد" tone="teal" />
      <MetricCard label="نمو المبيعات" value={report.financial.salesGrowthRate === null ? '—' : rate(report.financial.salesGrowthRate)} note={report.financial.salesGrowthRate === null ? 'لا توجد فترة سابقة محصّلة للمقارنة' : `${money(report.financial.salesChangeAmount)} فرقًا عن الفترة السابقة`} tone={report.financial.salesGrowthRate !== null && report.financial.salesGrowthRate < 0 ? 'rose' : 'teal'} />
      <MetricCard label="معدل الإلغاء" value={rate(report.bookings.cancellationRate)} note={`${number(report.bookings.cancelled)} من ${number(report.bookings.total)} حجز`} tone="rose" />
      <MetricCard label="معدل إعادة الحجز" value={rate(report.bookings.rebookingRate)} note={`${number(report.bookings.rebookedCustomerCount)} من ${number(report.bookings.uniqueCustomerCount)} عميل`} tone="gold" />
      <MetricCard label="استغلال طاقة الفرق" value={rate(report.operations.utilizationRate)} note={`${number(report.operations.utilizedJobs)} وظيفة مسندة`} tone="gold" />
      <MetricCard label="اشتراكات نشطة" value={number(report.subscriptions.active)} note="لقطة الحالة الحالية" tone="teal" />
      <MetricCard label="معدل الشكاوى" value={rate(report.operations.complaintRate)} note={`${number(report.operations.complaintCount)} شكوى مسجلة`} tone="rose" />
    </section>
  );
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const actor = await requireRole([
    UserRole.OPERATIONS_MANAGER,
    UserRole.OWNER,
    UserRole.SYSTEM_SUPER_ADMIN,
  ]);
  const homeHref = actor.role === UserRole.OPERATIONS_MANAGER ? '/operations' : '/admin';
  const accessibleBranchIds = await getAccessibleBranchIds(actor);
  const allowedBranchIds = accessibleBranchIds === null
    ? null
    : (await Promise.all(accessibleBranchIds.map(async (branchId) => ({
        branchId,
        allowed: await hasPermission(actor, 'reports.revenue', { type: 'BRANCH', id: branchId }),
      })))).filter(({ allowed }) => allowed).map(({ branchId }) => branchId);
  if (
    (allowedBranchIds === null && !(await hasPermission(actor, 'reports.revenue'))) ||
    (allowedBranchIds !== null && allowedBranchIds.length === 0)
  ) redirect(homeHref);
  const query = await searchParams;
  const filters = parseReportFilters(query);
  const [report, options] = await Promise.all([
    buildReports(filters, allowedBranchIds),
    getReportFilterOptions(allowedBranchIds),
  ]);
  const exportHref = `/admin/reports/export?${reportFiltersToSearchParams(filters).toString()}`;
  const generatedAt = formatDateTime(report.generatedAt);

  return (
    <main dir="rtl" className="min-h-screen bg-[#080808] px-4 py-6 text-white sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-[1500px] space-y-8">
        <header className="relative overflow-hidden rounded-[2rem] border border-[#c9a227]/30 bg-[#11110f] px-6 py-7 sm:px-9 sm:py-9">
          <div aria-hidden="true" className="absolute inset-y-0 right-0 w-1.5 bg-[#c9a227]" />
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold tracking-wider text-neutral-400">
                <span className="rounded-full border border-[#c9a227]/30 bg-[#c9a227]/10 px-3 py-1 text-[#ecd66f]">داخلي فقط</span>
                <span className="font-mono" dir="ltr">BAREEQ / REPORT LEDGER</span>
              </div>
              <h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-6xl">مركز التقارير</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-400 sm:text-base">
                قراءة واحدة للحجوزات والتحصيل والتشغيل والاشتراكات والإلغاءات، مبنية مباشرة من سجلات النظام وبلا أرقام تجريبية.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-xs text-neutral-400">
                <span className="block">الفترة الحالية</span>
                <strong className="mt-1 block font-mono text-sm text-white" dir="ltr">{filters.from} → {filters.to}</strong>
              </div>
              <Link href={exportHref} className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#c9a227] px-5 py-3 text-sm font-black text-black outline-none transition hover:bg-[#e0bd3a] focus-visible:ring-2 focus-visible:ring-[#f2dc7d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080808]">
                تنزيل التقرير الكامل CSV
              </Link>
              <Link href={homeHref} className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/15 px-5 py-3 text-sm font-bold text-neutral-200 outline-none transition hover:border-white/30 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/60">
                العودة للوحة التشغيل
              </Link>
            </div>
          </div>
        </header>

        <section aria-labelledby="report-filters-title" className="rounded-[1.75rem] border border-white/10 bg-[#11110f] p-5 sm:p-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[10px] tracking-[0.22em] text-[#d7b941]">FILTER BAY</p>
              <h2 id="report-filters-title" className="mt-2 text-xl font-black">نطاق القراءة</h2>
            </div>
            <p id="date-filter-help" className="max-w-3xl text-xs leading-6 text-neutral-500">
              الحجوزات والتشغيل حسب موعد الخدمة؛ الدفعات والاستردادات والإلغاءات والتفعيلات حسب وقت تسجيل الحدث. جميع الأوقات بتوقيت القاهرة.
            </p>
          </div>
          <form method="get" aria-describedby="date-filter-help" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
            <label className="space-y-2 text-xs font-bold text-neutral-300">
              <span>من</span>
              <input name="from" type="date" required defaultValue={filters.from} className="min-h-11 w-full rounded-xl border border-white/10 bg-[#080808] px-3 text-sm text-white outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20" />
            </label>
            <label className="space-y-2 text-xs font-bold text-neutral-300">
              <span>إلى</span>
              <input name="to" type="date" required defaultValue={filters.to} className="min-h-11 w-full rounded-xl border border-white/10 bg-[#080808] px-3 text-sm text-white outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20" />
            </label>
            <label className="space-y-2 text-xs font-bold text-neutral-300">
              <span>الفرع</span>
              <select name="branch" defaultValue={filters.branchId ?? ''} className="min-h-11 w-full rounded-xl border border-white/10 bg-[#080808] px-3 text-sm text-white outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20"><option value="">كل الفروع</option>{options.branches.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
            </label>
            <label className="space-y-2 text-xs font-bold text-neutral-300">
              <span>الفريق</span>
              <select name="team" defaultValue={filters.teamId ?? ''} className="min-h-11 w-full rounded-xl border border-white/10 bg-[#080808] px-3 text-sm text-white outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20"><option value="">كل الفرق</option>{options.teams.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
            </label>
            <label className="space-y-2 text-xs font-bold text-neutral-300">
              <span>الخدمة</span>
              <select name="service" defaultValue={filters.serviceId ?? ''} className="min-h-11 w-full rounded-xl border border-white/10 bg-[#080808] px-3 text-sm text-white outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20"><option value="">كل الخدمات</option>{options.services.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
            </label>
            <label className="space-y-2 text-xs font-bold text-neutral-300">
              <span>المنطقة</span>
              <select name="zone" defaultValue={filters.zoneId ?? ''} className="min-h-11 w-full rounded-xl border border-white/10 bg-[#080808] px-3 text-sm text-white outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20"><option value="">كل المناطق</option>{options.zones.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
            </label>
            <label className="space-y-2 text-xs font-bold text-neutral-300">
              <span>حالة الحجز</span>
              <select name="status" defaultValue={filters.bookingStatus ?? ''} className="min-h-11 w-full rounded-xl border border-white/10 bg-[#080808] px-3 text-sm text-white outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20"><option value="">كل الحالات</option>{Object.values(BookingStatus).map((status) => <option key={status} value={status}>{bookingStatusLabels[status]}</option>)}</select>
            </label>
            <label className="space-y-2 text-xs font-bold text-neutral-300">
              <span>حالة الدفع</span>
              <select name="payment" defaultValue={filters.paymentStatus ?? ''} className="min-h-11 w-full rounded-xl border border-white/10 bg-[#080808] px-3 text-sm text-white outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20"><option value="">كل الحالات</option>{Object.values(PaymentStatus).map((status) => <option key={status} value={status}>{paymentStatusLabels[status]}</option>)}</select>
            </label>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4 xl:col-span-8">
              <button type="submit" className="min-h-11 rounded-xl bg-white px-5 text-sm font-black text-black outline-none hover:bg-neutral-200 focus-visible:ring-2 focus-visible:ring-[#c9a227]">تطبيق الفلاتر</button>
              <Link href="/admin/reports" className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-5 text-sm font-bold text-neutral-300 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/60">إعادة الضبط</Link>
            </div>
          </form>
        </section>

        <OverviewStrip report={report} />

        <section aria-labelledby="bookings-report" className="space-y-6 rounded-[1.75rem] border border-white/10 bg-[#11110f] p-5 [content-visibility:auto] sm:p-7">
          <SectionHeading code="01 / BOOKING FLOW" title="دفتر الحجوزات" description="كل حجز موعده داخل النطاق، مع فصل الحالات النهائية وتجميع القيمة والمحصّل حسب مفاتيح التشغيل الأساسية." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
            <MetricCard label="الإجمالي" value={number(report.bookings.total)} tone="gold" />
            <MetricCard label="المكتملة" value={number(report.bookings.completed)} tone="teal" />
            <MetricCard label="الملغاة" value={number(report.bookings.cancelled)} tone="rose" />
            <MetricCard label="معدل الإلغاء" value={rate(report.bookings.cancellationRate)} note="من كل الحجوزات داخل الفترة" tone="rose" />
            <MetricCard label="المرفوضة" value={number(report.bookings.rejected)} tone="rose" />
            <MetricCard label="إعادة الحجز" value={rate(report.bookings.rebookingRate)} note={`${number(report.bookings.rebookedCustomerCount)} عميل أعاد الحجز`} tone="gold" />
            <MetricCard label="عدم حضور" value={number(report.bookings.noShow)} tone="neutral" />
            <MetricCard label="تعذر الدخول" value={number(report.bookings.accessDenied)} tone="neutral" />
          </div>
          <p className="text-[11px] leading-5 text-neutral-500">يُحسب إعادة الحجز للعميل ذي الحجز الصالح داخل النطاق إذا كان لديه حجز صالح سابق أو أكثر من حجز صالح في النطاق نفسه.</p>
          <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <CountRail title="توزيع الحالات" rows={report.bookings.byStatus} labelFor={(row) => bookingStatusLabels[row.id as BookingStatus] ?? row.label} />
            <CountValueTable title="حسب الخدمة" rows={report.bookings.byService} />
          </div>
          <div className="grid gap-4 xl:grid-cols-3"><CountValueTable title="حسب الفرع" rows={report.bookings.byBranch} /><CountValueTable title="حسب المنطقة" rows={report.bookings.byZone} /><CountValueTable title="حسب الفريق" rows={report.bookings.byTeam} /></div>
        </section>

        <section aria-labelledby="financial-report" className="space-y-6 rounded-[1.75rem] border border-[#c9a227]/20 bg-[#11110f] p-5 [content-visibility:auto] sm:p-7">
          <SectionHeading code="02 / CASH LEDGER" title="الملخص المالي والأداء الأفضل" description="يعرض الدفعات المسجلة فعليًا والاستردادات المكتملة، مع مؤشرات أداء أفضل الخدمة والفرع." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <MetricCard label="الدفعات المسجلة" value={money(report.financial.verifiedPaymentAmount)} note={`${number(report.financial.verifiedPaymentCount)} حركة دفع`} tone="teal" />
            <MetricCard label="أفضل خدمة بالإيراد" value={report.financial.byService[0]?.label ?? '—'} note={report.financial.byService[0] ? `${money(report.financial.byService[0].amount)} (${number(report.financial.byService[0].count)} دفعة)` : 'لا توجد بيانات'} tone="gold" />
            <MetricCard label="أفضل فرع بالإيراد" value={report.financial.byBranch[0]?.label ?? '—'} note={report.financial.byBranch[0] ? `${money(report.financial.byBranch[0].amount)} (${number(report.financial.byBranch[0].count)} دفعة)` : 'لا توجد بيانات'} tone="gold" />
            <MetricCard label="الدفع الجزئي" value={money(report.financial.partialAmountPaid)} note={`${number(report.financial.partialBookingCount)} حجز`} tone="gold" />
            <MetricCard label="المبلغ المستحق" value={money(report.financial.amountDue)} note="على الحجوزات القابلة للتحصيل" tone="rose" />
            <MetricCard label="الاستردادات" value={money(report.financial.refunds)} note={`${number(report.financial.refundCount)} حركة مكتملة`} tone="rose" />
            <MetricCard label="صافي المحصّل" value={money(report.financial.netCollected)} note="المحصّل ناقص المسترد" tone="teal" />
            <MetricCard label="المبيعات السابقة" value={money(report.financial.comparisonNetCollected)} note="فترة مماثلة تسبق النطاق مباشرة" tone="neutral" />
            <MetricCard label="فرق المبيعات" value={money(report.financial.salesChangeAmount)} note={report.financial.salesGrowthRate === null ? 'لا توجد قاعدة مقارنة موجبة' : `${rate(report.financial.salesGrowthRate)} عن الفترة السابقة`} tone={report.financial.salesChangeAmount < 0 ? 'rose' : 'teal'} />
            <MetricCard label="متوسط قيمة الحجز" value={money(report.financial.averageBookingValue)} tone="gold" />
          </div>
          <div className="grid gap-4 xl:grid-cols-3"><RevenueTable title="الإيراد حسب الخدمة" rows={report.financial.byService} /><RevenueTable title="الإيراد حسب الفرع" rows={report.financial.byBranch} /><RevenueTable title="الإيراد حسب الفريق" rows={report.financial.byTeam} /></div>
        </section>

        <section aria-labelledby="operations-report" className="space-y-6 rounded-[1.75rem] border border-cyan-300/15 bg-[#11110f] p-5 [content-visibility:auto] sm:p-7">
          <SectionHeading code="03 / OPERATIONS PULSE" title="نبض التشغيل" description="المعدلات مبنية من انتقالات الحالات، سعة الفرق، نتائج قوائم الفحص، مراجعات الجودة والشكاوى المسجلة داخل النطاق." />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <RateMeter label="استغلال الفرق" value={report.operations.utilizationRate} detail={`${number(report.operations.utilizedJobs)} وظيفة من ${number(report.operations.availableJobSlots)} خانة طاقة`} />
            <RateMeter label="الوصول في الموعد" value={report.operations.onTimeArrivalRate} detail={`${number(report.operations.onTimeArrivalCount)} من ${number(report.operations.arrivalSampleCount)} وصول مسجل`} />
            <RateMeter label="اكتمال قوائم الفحص" value={report.operations.checklistCompletionRate} detail={`${number(report.operations.checkedChecklistItems)} من ${number(report.operations.checklistItemCount)} عنصر`} />
            <RateMeter label="العودة من الجودة" value={report.operations.qualityReturnRate} detail={`${number(report.operations.qualityReturnCount)} من ${number(report.operations.qualityReviewCount)} مراجعة`} />
            <RateMeter label="معدل الشكاوى" value={report.operations.complaintRate} detail={`${number(report.operations.bookingsWithComplaints)} حجز له شكوى؛ ${number(report.operations.complaintCount)} شكوى`} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard label="متوسط مدة الخدمة" value={`${number(report.operations.averageServiceDurationMinutes)} دقيقة`} note={`${number(report.operations.durationSampleCount)} خدمة لها بداية ونهاية مسجلتا الوقت`} tone="teal" />
            <MetricCard label="متوسط التأخير" value={`${number(report.operations.averageDelayMinutes)} دقيقة`} note={`${number(report.operations.delayedArrivalCount)} وصول بعد نافذة السماح`} tone="rose" />
            <MetricCard label="أفضل موظف" value={report.operations.topEmployee?.label ?? '—'} note={report.operations.topEmployee ? `${number(report.operations.topEmployee.count)} خدمة مكتملة` : 'لا توجد خدمات مكتملة منسوبة لموظف'} tone="gold" />
          </div>
          <div className="grid gap-4 xl:grid-cols-3"><CompletionTable rows={report.operations.teamCompletion} /><CountRail title="الوظائف حسب الفريق" rows={report.operations.jobsByTeam} /><CountRail title="الوظائف حسب الموظف" rows={report.operations.jobsByEmployee} emptyText="لا توجد عضويات فرق مرتبطة بوظائف النطاق." /></div>
          <p className="text-[11px] leading-5 text-neutral-500">أفضل موظف يُنسب إلى الموظف المكلّف مباشرة بالحجز، أو إلى من سجل بدء الخدمة عند غياب إسناد فردي. أما توزيع الوظائف فيستند إلى أعضاء الفريق الحاليين لأن الإسناد الأساسي للفريق.</p>
        </section>

        <section aria-labelledby="subscriptions-report" className="space-y-6 rounded-[1.75rem] border border-white/10 bg-[#11110f] p-5 [content-visibility:auto] sm:p-7">
          <SectionHeading code="04 / SUBSCRIPTION BOOK" title="دفتر الاشتراكات" description="لقطة الاشتراكات النشطة، والحركات التي حدثت داخل الفترة، مع قيمة الخطط التي سجّل Audit Log تفعيلها يدويًا." />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard label="نشطة حاليًا" value={number(report.subscriptions.active)} tone="teal" />
            <MetricCard label="جديدة" value={number(report.subscriptions.newSubscriptions)} tone="gold" />
            <MetricCard label="انتهت" value={number(report.subscriptions.expired)} tone="neutral" />
            <MetricCard label="زيارات مستهلكة" value={number(report.subscriptions.visitsConsumed)} tone="gold" />
            <MetricCard label="زيارات متبقية" value={number(report.subscriptions.visitsRemaining)} tone="teal" />
            <MetricCard label="قيمة التفعيل اليدوي" value={money(report.subscriptions.recordedRevenue)} note={`${number(report.subscriptions.activatedCount)} اشتراك مفعل`} tone="teal" />
          </div>
          <p className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-6 text-neutral-500">لا يوجد جدول دفعات مستقل للاشتراك في المخطط الحالي؛ لذلك قيمة الاشتراك تأتي من لقطة السعر في سجل طلب الشراء عند وجودها، وإلا من سعر الخطة المرتبطة، بشرط وجود حدث تفعيل يدوي داخل الفترة.</p>
        </section>

        <section aria-labelledby="cancellations-report" className="space-y-6 rounded-[1.75rem] border border-rose-400/15 bg-[#11110f] p-5 [content-visibility:auto] sm:p-7">
          <SectionHeading code="05 / EXCEPTION LOG" title="الإلغاءات وإعادة الجدولة" description="طلبات الإلغاء بحسب وقت إنشائها، والطرف المسؤول وسبب الطلب، مع الاستردادات المكتملة وإعادات الجدولة المعتمدة." />
          <div className="grid gap-3 sm:grid-cols-3"><MetricCard label="طلبات الإلغاء" value={number(report.cancellations.totalRequests)} tone="rose" /><MetricCard label="إجمالي الاسترداد" value={money(report.cancellations.refundTotal)} tone="rose" /><MetricCard label="أُعيدت جدولتها" value={number(report.cancellations.rescheduledCount)} tone="gold" /></div>
          <div className="grid gap-4 lg:grid-cols-2"><CountRail title="أسباب الإلغاء" rows={report.cancellations.byReason} /><CountRail title="الطرف المسؤول" rows={report.cancellations.byResponsibleParty} labelFor={(row) => responsiblePartyLabels[row.id] ?? row.label} /></div>
        </section>

        <section aria-labelledby="ratings-report" className="space-y-6 rounded-[1.75rem] border border-[#c9a227]/30 bg-[#11110f] p-5 [content-visibility:auto] sm:p-7">
          <SectionHeading code="06 / CUSTOMER REVIEWS" title="تقييمات وصوت العملاء" description="تحليل متوسط التقييمات وتوزيع النجوم والتقييمات حسب الفرع والخدمة." />
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="إجمالي التقييمات" value={number(report.customerRatings.totalCount)} tone="gold" />
            <MetricCard label="متوسط التقييم العام" value={`${report.customerRatings.averageScore} / 5`} note={report.customerRatings.averageScore >= 4.5 ? 'أداء ممتاز' : report.customerRatings.totalCount > 0 ? 'يحتاج متابعة' : 'لا توجد تقييمات'} tone="gold" />
            <MetricCard label="التقييمات المعتمدة للنشر" value={number(report.customerRatings.approvedCount)} tone="teal" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <CountRail title="توزيع النجوم" rows={report.customerRatings.byScore} />
            <RatingScoreTable title="متوسط التقييم حسب الخدمة" rows={report.customerRatings.byService} />
            <RatingScoreTable title="متوسط التقييم حسب الفرع" rows={report.customerRatings.byBranch} />
          </div>
        </section>

        <section aria-labelledby="details-report" className="space-y-5 rounded-[1.75rem] border border-white/10 bg-[#11110f] p-5 [content-visibility:auto] sm:p-7">
          <SectionHeading code="07 / SOURCE ROWS" title="سجل الحجوزات المطابق" description={`يعرض ${number(report.rows.length)} صفًا. ملف CSV يضم هذا السجل وجميع الملخصات والتجميعات أعلاه.`} />
          <BookingsTable rows={report.rows} />
        </section>

        <footer className="flex flex-col gap-2 border-t border-white/10 py-5 text-xs text-neutral-600 sm:flex-row sm:items-center sm:justify-between">
          <span>تقرير داخلي — Owner / System Super Admin فقط</span>
          <span>آخر توليد: {generatedAt}</span>
        </footer>
      </div>
    </main>
  );
}
