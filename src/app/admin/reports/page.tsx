import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BookingStatus,
  PaymentStatus,
  RefundStatus,
  SubscriptionPaymentProofStatus,
  UserRole,
} from '@prisma/client';
import {
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  DollarSign,
  Download,
  FileSpreadsheet,
  PackageCheck,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { requireRole } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import { getAccessibleBranchIds } from '@/lib/auth/authorization';
import { db } from '@/lib/db';
import { localDateBoundsUtc } from '@/lib/engine/time';
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
  title: 'مركز التقارير والإيرادات | بريق',
  description: 'تقارير بريق التشغيلية والمالية الشاملة ودفتر الإيرادات الشهرية.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const CAIRO_TIME_ZONE = 'Africa/Cairo';

interface ReportsPageProps {
  searchParams: Promise<ReportSearchParams & {
    tab?: 'overview' | 'revenue';
    month?: string;
    q?: string;
    type?: 'all' | 'booking' | 'subscription' | 'refund';
  }>;
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

function formatDateTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: CAIRO_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function formatMonthLabel(monthKey: string) {
  const [yearStr, monthStr] = monthKey.split('-');
  const monthIdx = parseInt(monthStr, 10) - 1;
  return `${MONTH_NAMES_AR[monthIdx] || monthStr} ${yearStr}`;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'نقدي (كاش)',
  BANK_TRANSFER: 'تحويل بنكي',
  MOBILE_WALLET: 'محفظة إلكترونية',
  POS: 'بطاقة دفع / POS',
  CREDIT_BALANCE: 'رصيد تعويضات',
};

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

interface CompletionTableProps {
  rows: CompletionRateRow[];
}

function CompletionTable({ rows }: CompletionTableProps) {
  return (
    <article className="min-w-0 rounded-2xl border border-white/10 bg-black/20 p-5">
      <h3 className="text-sm font-black text-white">نسبة إكمال الفرق</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-right text-xs">
          <caption className="sr-only">نسبة إكمال الفرق</caption>
          <thead className="text-neutral-500">
            <tr className="border-b border-white/10">
              <th scope="col" className="px-2 py-3 font-medium">الفريق</th>
              <th scope="col" className="px-2 py-3 font-medium">الوظائف</th>
              <th scope="col" className="px-2 py-3 font-medium">المكتملة</th>
              <th scope="col" className="px-2 py-3 font-medium">النسبة</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-2 py-8 text-center text-neutral-500">لا توجد وظائف مسندة ضمن النطاق.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5 last:border-0">
                <th scope="row" className="px-2 py-3 font-bold text-neutral-200">{row.label}</th>
                <td className="px-2 py-3 font-mono text-neutral-300">{number(row.assigned)}</td>
                <td className="px-2 py-3 font-mono text-neutral-300">{number(row.completed)}</td>
                <td className="px-2 py-3 font-mono text-cyan-300">{rate(row.completionRate)}</td>
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
    <article className="min-w-0 rounded-2xl border border-white/10 bg-black/20 p-5">
      <h3 className="text-sm font-black text-white">{title}</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[360px] border-collapse text-right text-xs">
          <caption className="sr-only">{title}</caption>
          <thead className="text-neutral-500">
            <tr className="border-b border-white/10">
              <th scope="col" className="px-2 py-3 font-medium">البند</th>
              <th scope="col" className="px-2 py-3 font-medium">الحركات</th>
              <th scope="col" className="px-2 py-3 font-medium">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="px-2 py-8 text-center text-neutral-500">لا توجد بيانات مطابقة.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5 last:border-0">
                <th scope="row" className="px-2 py-3 font-bold text-neutral-200">{row.label}</th>
                <td className="px-2 py-3 font-mono text-neutral-300">{number(row.count)}</td>
                <td className="px-2 py-3 font-mono text-[#d7b941]">{money(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

interface BookingsTableProps {
  rows: BookingReportRow[];
}

function BookingsTable({ rows }: BookingsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-right text-xs">
        <caption className="sr-only">سجل الحجوزات المطابق</caption>
        <thead className="border-b border-white/10 text-neutral-500">
          <tr>
            <th scope="col" className="px-3 py-3 font-medium">رقم الحجز</th>
            <th scope="col" className="px-3 py-3 font-medium">الموعد</th>
            <th scope="col" className="px-3 py-3 font-medium">الفرع</th>
            <th scope="col" className="px-3 py-3 font-medium">المنطقة</th>
            <th scope="col" className="px-3 py-3 font-medium">الفريق</th>
            <th scope="col" className="px-3 py-3 font-medium">الخدمة</th>
            <th scope="col" className="px-3 py-3 font-medium">الحالة</th>
            <th scope="col" className="px-3 py-3 font-medium">الدفع</th>
            <th scope="col" className="px-3 py-3 font-medium">القيمة</th>
            <th scope="col" className="px-3 py-3 font-medium">المحصّل</th>
            <th scope="col" className="px-3 py-3 font-medium">المتبقي</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={11} className="px-3 py-10 text-center text-neutral-500">لا توجد حجوزات مطابقة للفلاتر المحددة.</td></tr>
          ) : rows.map((row) => (
            <tr key={row.bookingNumber} className="border-b border-white/5 hover:bg-white/[0.02]">
              <th scope="row" className="px-3 py-3 font-mono text-[#ecd66f]" dir="ltr">{row.bookingNumber}</th>
              <td className="px-3 py-3 font-mono text-neutral-300" dir="ltr">{row.startAt}</td>
              <td className="px-3 py-3 text-neutral-300">{row.branch}</td>
              <td className="px-3 py-3 text-neutral-300">{row.zone} ({row.area})</td>
              <td className="px-3 py-3 text-neutral-300">{row.team || '—'}</td>
              <td className="px-3 py-3 text-neutral-200">{row.service}</td>
              <td className="px-3 py-3"><span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-neutral-200">{bookingStatusLabels[row.bookingStatus]}</span></td>
              <td className="px-3 py-3"><span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-neutral-300">{paymentStatusLabels[row.paymentStatus]}</span></td>
              <td className="px-3 py-3 font-mono text-neutral-300">{money(row.totalPrice)}</td>
              <td className="px-3 py-3 font-mono text-emerald-400">{money(row.amountPaid)}</td>
              <td className="px-3 py-3 font-mono text-rose-400">{money(row.amountDue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverviewStrip({ report }: { report: ReportsResult }) {
  return (
    <section aria-label="نظرة سريعة على مؤشرات الفترة" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <MetricCard label="إجمالي الحجوزات" value={number(report.bookings.total)} note={`${number(report.bookings.completed)} مكتملة داخل النطاق`} tone="gold" />
      <MetricCard label="إجمالي المبيعات" value={money(report.financial.totalGrossSales)} note="قيمة الحجوزات والاشتراكات" tone="gold" />
      <MetricCard label="المحصل الفعلي (الإيراد)" value={money(report.financial.verifiedPaymentAmount)} note="العربون + المسدد عند الإكمال" tone="teal" />
      <MetricCard label="صافي الإيراد والأرباح" value={money(report.financial.netCollected)} note={`المحصل ناقص المسترد: ${money(report.financial.refunds)}`} tone="teal" />
      <MetricCard label="الوصول في الموعد" value={rate(report.operations.onTimeArrivalRate)} note={`${number(report.operations.arrivalSampleCount)} وصول مسجل`} tone="teal" />
      <MetricCard label="اشتراكات نشطة" value={number(report.subscriptions.active)} note="لقطة الحالة الحالية" tone="teal" />
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
  const activeTab = query.tab === 'revenue' ? 'revenue' : 'overview';

  // 1. Operational Reports Data
  const filters = parseReportFilters(query);
  const [report, options] = await Promise.all([
    buildReports(filters, allowedBranchIds),
    getReportFilterOptions(allowedBranchIds),
  ]);
  const exportHref = `/admin/reports/export?${reportFiltersToSearchParams(filters).toString()}`;
  const generatedAt = formatDateTime(report.generatedAt);

  // 2. Monthly Revenue Ledger Data
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const selectedMonth = query.month && /^\d{4}-\d{2}$/.test(query.month) ? query.month : currentMonthKey;
  const searchQuery = (query.q || '').trim();
  const filterType = query.type || 'all';

  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const lastDay = new Date(year, monthNum, 0).getDate();

  const startDateStr = `${selectedMonth}-01`;
  const endDateStr = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

  const monthStart = localDateBoundsUtc(startDateStr, CAIRO_TIME_ZONE).start;
  const monthEnd = localDateBoundsUtc(endDateStr, CAIRO_TIME_ZONE).end;

  const pastMonths: { key: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    pastMonths.push({ key, label: formatMonthLabel(key) });
  }

  const [bookingPayments, subscriptionProofs, refunds] = await Promise.all([
    db.payment.findMany({
      where: {
        createdAt: { gte: monthStart, lt: monthEnd },
        ...(allowedBranchIds !== null ? { booking: { branchId: { in: allowedBranchIds } } } : {}),
      },
      include: {
        booking: {
          include: {
            customer: { include: { user: true } },
            service: true,
            branch: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.subscriptionPaymentProof.findMany({
      where: {
        status: SubscriptionPaymentProofStatus.APPROVED,
        reviewedAt: { gte: monthStart, lt: monthEnd },
        ...(allowedBranchIds !== null ? { subscription: { branchId: { in: allowedBranchIds } } } : {}),
      },
      include: {
        subscription: {
          include: {
            customer: { include: { user: true } },
            plan: true,
            branch: true,
          },
        },
        paymentMethod: true,
      },
      orderBy: { reviewedAt: 'desc' },
    }),
    db.refund.findMany({
      where: {
        status: { in: [RefundStatus.REFUNDED, RefundStatus.PARTIALLY_REFUNDED] },
        createdAt: { gte: monthStart, lt: monthEnd },
        ...(allowedBranchIds !== null ? { booking: { branchId: { in: allowedBranchIds } } } : {}),
      },
      include: {
        booking: {
          include: {
            customer: { include: { user: true } },
            service: true,
            branch: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const totalBookingRevenue = bookingPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalSubscriptionRevenue = subscriptionProofs.reduce((sum, p) => sum + p.amountSubmitted, 0);
  const totalGrossRevenue = totalBookingRevenue + totalSubscriptionRevenue;
  const totalRefunds = refunds.reduce((sum, r) => sum + r.amount, 0);
  const netRevenue = totalGrossRevenue - totalRefunds;

  const paymentMethodMap: Record<string, { label: string; amount: number; count: number }> = {};
  for (const p of bookingPayments) {
    const methodKey = p.paymentMethod || 'OTHER';
    const label = PAYMENT_METHOD_LABELS[methodKey] || methodKey;
    if (!paymentMethodMap[methodKey]) paymentMethodMap[methodKey] = { label, amount: 0, count: 0 };
    paymentMethodMap[methodKey].amount += p.amount;
    paymentMethodMap[methodKey].count += 1;
  }
  for (const sp of subscriptionProofs) {
    const methodKey = sp.paymentMethod.name || 'OTHER';
    if (!paymentMethodMap[methodKey]) paymentMethodMap[methodKey] = { label: methodKey, amount: 0, count: 0 };
    paymentMethodMap[methodKey].amount += sp.amountSubmitted;
    paymentMethodMap[methodKey].count += 1;
  }

  const allBranchesList = await db.branch.findMany({
    where: allowedBranchIds !== null ? { id: { in: allowedBranchIds } } : {},
    select: { id: true, nameAr: true },
    orderBy: { nameAr: 'asc' },
  });
  const branchMap: Record<string, { name: string; amount: number; count: number }> = {};
  for (const b of allBranchesList) {
    branchMap[b.nameAr] = { name: b.nameAr, amount: 0, count: 0 };
  }
  for (const p of bookingPayments) {
    const branchName = p.booking.branch.nameAr;
    if (!branchMap[branchName]) branchMap[branchName] = { name: branchName, amount: 0, count: 0 };
    branchMap[branchName].amount += p.amount;
    branchMap[branchName].count += 1;
  }
  for (const sp of subscriptionProofs) {
    const branchName = sp.subscription.branch.nameAr;
    if (!branchMap[branchName]) branchMap[branchName] = { name: branchName, amount: 0, count: 0 };
    branchMap[branchName].amount += sp.amountSubmitted;
    branchMap[branchName].count += 1;
  }

  type TransactionRow = {
    id: string;
    date: Date;
    type: 'BOOKING' | 'SUBSCRIPTION' | 'REFUND';
    customerName: string;
    customerPhone: string;
    title: string;
    branchName: string;
    paymentMethod: string;
    amount: number;
    reference: string;
  };

  const allTransactions: TransactionRow[] = [
    ...bookingPayments.map((p) => ({
      id: p.id,
      date: p.createdAt,
      type: 'BOOKING' as const,
      customerName: p.booking.customer.user.fullName,
      customerPhone: p.booking.customer.user.phone,
      title: `حجز: ${p.booking.service.nameAr}`,
      branchName: p.booking.branch.nameAr,
      paymentMethod: PAYMENT_METHOD_LABELS[p.paymentMethod] || p.paymentMethod,
      amount: p.amount,
      reference: p.booking.bookingNumber,
    })),
    ...subscriptionProofs.map((sp) => ({
      id: sp.id,
      date: sp.reviewedAt ?? sp.createdAt,
      type: 'SUBSCRIPTION' as const,
      customerName: sp.subscription.customer.user.fullName,
      customerPhone: sp.subscription.customer.user.phone,
      title: `اشتراك: ${sp.subscription.plan.nameAr}`,
      branchName: sp.subscription.branch.nameAr,
      paymentMethod: sp.paymentMethod.name,
      amount: sp.amountSubmitted,
      reference: `SUB-${sp.subscriptionId.slice(0, 8).toUpperCase()}`,
    })),
    ...refunds.map((r) => ({
      id: r.id,
      date: r.createdAt,
      type: 'REFUND' as const,
      customerName: r.booking.customer.user.fullName,
      customerPhone: r.booking.customer.user.phone,
      title: `استرداد: ${r.booking.service.nameAr}`,
      branchName: r.booking.branch.nameAr,
      paymentMethod: 'استرداد معتمد',
      amount: -r.amount,
      reference: r.booking.bookingNumber,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const filteredTransactions = allTransactions.filter((tx) => {
    if (filterType === 'booking' && tx.type !== 'BOOKING') return false;
    if (filterType === 'subscription' && tx.type !== 'SUBSCRIPTION') return false;
    if (filterType === 'refund' && tx.type !== 'REFUND') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = tx.customerName.toLowerCase().includes(q);
      const matchPhone = tx.customerPhone.includes(q);
      const matchRef = tx.reference.toLowerCase().includes(q);
      const matchTitle = tx.title.toLowerCase().includes(q);
      const matchBranch = tx.branchName.toLowerCase().includes(q);
      return matchName || matchPhone || matchRef || matchTitle || matchBranch;
    }
    return true;
  });

  const revenueExportUrl = `/admin/revenue/export?month=${selectedMonth}`;

  return (
    <main dir="rtl" className="min-h-screen bg-[#080808] px-4 py-6 text-white sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-[1500px] space-y-8">
        {/* Header with Navigation and Quick Actions */}
        <header className="relative overflow-hidden rounded-[2rem] border border-[#c9a227]/30 bg-[#11110f] px-6 py-7 sm:px-9 sm:py-9">
          <div aria-hidden="true" className="absolute inset-y-0 right-0 w-1.5 bg-[#c9a227]" />
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold tracking-wider text-neutral-400">
                <span className="rounded-full border border-[#c9a227]/30 bg-[#c9a227]/10 px-3 py-1 text-[#ecd66f]">داخلي وإداري</span>
                <span className="font-mono" dir="ltr">BAREEQ / REPORT & REVENUE CENTER</span>
              </div>
              <h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-5xl">مركز التقارير والإيرادات</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-400 sm:text-base">
                منظومة موحدة لمتابعة أداء العمليات والتحصيل الكامل وفحص الجودة ودفتر الإيرادات وصافي الأرباح الشهرية.
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Link href={exportHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#c9a227]/40 bg-[#c9a227]/10 px-5 py-3 text-sm font-bold text-[#ecd66f] outline-none transition hover:bg-[#c9a227]/20">
                <FileSpreadsheet className="size-4" aria-hidden="true" />
                تصدير التقرير التشغيلي CSV
              </Link>
              <Link href={revenueExportUrl} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-3 text-sm font-bold text-emerald-300 outline-none transition hover:bg-emerald-500/20">
                <Download className="size-4" aria-hidden="true" />
                تصدير كشف الإيرادات CSV
              </Link>
              <Link href={homeHref} className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/15 px-5 py-3 text-sm font-bold text-neutral-200 outline-none transition hover:border-white/30 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/60">
                العودة للوحة التشغيل
              </Link>
            </div>
          </div>

          {/* Unified Tab Switcher */}
          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
            <Link
              href={`/admin/reports?tab=overview&from=${filters.from}&to=${filters.to}`}
              className={`inline-flex items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-black transition-all ${activeTab === 'overview' ? 'bg-[#c9a227] text-black shadow-lg shadow-[#c9a227]/20' : 'border border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'}`}
            >
              <BarChart3 className="size-4" aria-hidden="true" />
              <span>التقارير التشغيلية والمالية الشاملة</span>
            </Link>
            <Link
              href={`/admin/reports?tab=revenue&month=${selectedMonth}`}
              className={`inline-flex items-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-black transition-all ${activeTab === 'revenue' ? 'bg-[#c9a227] text-black shadow-lg shadow-[#c9a227]/20' : 'border border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10'}`}
            >
              <DollarSign className="size-4" aria-hidden="true" />
              <span>دفتر الإيرادات والأرباح الشهرية ({formatMonthLabel(selectedMonth)})</span>
            </Link>
          </div>
        </header>

        {activeTab === 'overview' ? (
          <>
            {/* Operational Filters */}
            <section aria-labelledby="report-filters-title" className="rounded-[1.75rem] border border-white/10 bg-[#11110f] p-5 sm:p-7">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.22em] text-[#d7b941]">FILTER BAY</p>
                  <h2 id="report-filters-title" className="mt-2 text-xl font-black">نطاق القراءة</h2>
                </div>
                <p id="date-filter-help" className="max-w-3xl text-xs leading-6 text-neutral-500">
                  الحجوزات والتشغيل حسب موعد الخدمة؛ الدفعات والاستردادات والإلغاءات والتفعيلات حسب وقت تسجيل الحدث. جميع المبالغ محصلة بالكامل عند إكمال الخدمة بتوقيت القاهرة.
                </p>
              </div>
              <form method="get" aria-describedby="date-filter-help" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                <input type="hidden" name="tab" value="overview" />
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
                  <Link href="/admin/reports?tab=overview" className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-5 text-sm font-bold text-neutral-300 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/60">إعادة الضبط</Link>
                </div>
              </form>
            </section>

            <OverviewStrip report={report} />

            {/* Bookings Flow */}
            <section aria-labelledby="bookings-report" className="space-y-6 rounded-[1.75rem] border border-white/10 bg-[#11110f] p-5 [content-visibility:auto] sm:p-7">
              <SectionHeading code="01 / BOOKING FLOW" title="دفتر الحجوزات" description="كل حجز موعده داخل النطاق، مع تجميع القيمة والمحصّل بالكامل بعد تسليم الخدمة." />
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
              <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
                <CountRail title="توزيع الحالات" rows={report.bookings.byStatus} labelFor={(row) => bookingStatusLabels[row.id as BookingStatus] ?? row.label} />
                <CountValueTable title="حسب الخدمة" rows={report.bookings.byService} />
              </div>
              <div className="grid gap-4 xl:grid-cols-3"><CountValueTable title="حسب الفرع" rows={report.bookings.byBranch} /><CountValueTable title="حسب المنطقة" rows={report.bookings.byZone} /><CountValueTable title="حسب الفريق" rows={report.bookings.byTeam} /></div>
            </section>

            {/* Financial Ledger */}
            <section aria-labelledby="financial-report" className="space-y-6 rounded-[1.75rem] border border-[#c9a227]/20 bg-[#11110f] p-5 [content-visibility:auto] sm:p-7">
              <SectionHeading code="02 / CASH LEDGER" title="الملخص المالي والتحصيل الفعلي" description="المبيعات الإجمالية مقابل المقبوضات المحصلة فعلياً (العربون + التحصيل عند الإكمال) والاستردادات." />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <MetricCard label="إجمالي المبيعات" value={money(report.financial.totalGrossSales)} note="حجوزات + اشتراكات" tone="gold" />
                <MetricCard label="المحصل الفعلي (الإيراد)" value={money(report.financial.verifiedPaymentAmount)} note={`${number(report.financial.verifiedPaymentCount)} دفعة محصلة`} tone="teal" />
                <MetricCard label="صافي الأرباح" value={money(report.financial.netCollected)} note="المحصل ناقص المسترد" tone="teal" />
                <MetricCard label="الاستردادات" value={money(report.financial.refunds)} note={`${number(report.financial.refundCount)} حركة مكتملة`} tone="rose" />
                <MetricCard label="المتبقي قيد التحصيل" value={money(report.financial.amountDue)} note="متبقي على حجوزات جارية" tone="gold" />
                <MetricCard label="متوسط قيمة الحجز" value={money(report.financial.averageBookingValue)} tone="gold" />
              </div>
              <div className="grid gap-4 xl:grid-cols-3"><RevenueTable title="الإيراد حسب الخدمة" rows={report.financial.byService} /><RevenueTable title="الإيراد حسب الفرع" rows={report.financial.byBranch} /><RevenueTable title="الإيراد حسب الفريق" rows={report.financial.byTeam} /></div>
            </section>

            {/* Operations Pulse */}
            <section aria-labelledby="operations-report" className="space-y-6 rounded-[1.75rem] border border-cyan-300/15 bg-[#11110f] p-5 [content-visibility:auto] sm:p-7">
              <SectionHeading code="03 / OPERATIONS PULSE" title="نبض التشغيل والجودة" description="معدلات استغلال الفرق، والوصول في الموعد، وقوائم الفحص، ومراجعات الجودة." />
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
            </section>

            {/* Subscriptions */}
            <section aria-labelledby="subscriptions-report" className="space-y-6 rounded-[1.75rem] border border-white/10 bg-[#11110f] p-5 [content-visibility:auto] sm:p-7">
              <SectionHeading code="04 / SUBSCRIPTION BOOK" title="دفتر الاشتراكات" description="حركات الاشتراكات النشطة والمستهلكة والتفعيلات المسجلة." />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <MetricCard label="نشطة حاليًا" value={number(report.subscriptions.active)} tone="teal" />
                <MetricCard label="جديدة" value={number(report.subscriptions.newSubscriptions)} tone="gold" />
                <MetricCard label="انتهت" value={number(report.subscriptions.expired)} tone="neutral" />
                <MetricCard label="زيارات مستهلكة" value={number(report.subscriptions.visitsConsumed)} tone="gold" />
                <MetricCard label="زيارات متبقية" value={number(report.subscriptions.visitsRemaining)} tone="teal" />
                <MetricCard label="قيمة التفعيل" value={money(report.subscriptions.recordedRevenue)} note={`${number(report.subscriptions.activatedCount)} اشتراك مفعل`} tone="teal" />
              </div>
            </section>

            {/* Exceptions */}
            <section aria-labelledby="cancellations-report" className="space-y-6 rounded-[1.75rem] border border-rose-400/20 bg-[#11110f] p-5 [content-visibility:auto] sm:p-7">
              <SectionHeading
                code="05 / CANCELLATION & REFUND LOG"
                title="سجل الإلغاء والاستردادات المالية"
                description="إحصائيات دقيقة لعدد الحجوزات الملغاة، نسبة الإلغاء، المبالغ المستردة للعملاء، وتوزيع الأسباب والأطراف المسؤولة."
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <MetricCard label="الحجوزات الملغاة" value={number(report.bookings.cancelled)} note={`معدل الإلغاء: ${rate(report.bookings.cancellationRate)}`} tone="rose" />
                <MetricCard label="طلبات الإلغاء" value={number(report.cancellations.totalRequests)} note="الطلبات المسجلة بالفترة" tone="rose" />
                <MetricCard label="إجمالي المبالغ المستردة" value={money(report.financial.refunds || report.cancellations.refundTotal)} note={`${number(report.financial.refundCount)} عملية استرداد مكتملة`} tone="rose" />
                <MetricCard label="أُعيدت جدولتها" value={number(report.cancellations.rescheduledCount)} note="حجوزات تم تعديل موعدها" tone="gold" />
                <MetricCard label="الحجوزات المرفوضة" value={number(report.bookings.rejected)} note="رفض تشغيلي" tone="rose" />
                <MetricCard label="حالات عدم الحضور" value={number(report.bookings.noShow + report.bookings.accessDenied)} note="عدم حضور أو تعذر الدخول" tone="neutral" />
              </div>
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs leading-6 text-neutral-300">
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="size-5 text-rose-400 shrink-0" />
                  <span>يتم خصم مبالغ الاستردادات الفعلية (<strong>{money(report.financial.refunds || report.cancellations.refundTotal)}</strong>) مباشرة من إجمالي المقبوضات لاحتساب صافي الأرباح.</span>
                </div>
                <span className="font-mono font-bold text-rose-300 shrink-0">صافي الأرباح: {money(report.financial.netCollected)}</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <CountRail title="أسباب الإلغاء وتكرارها" rows={report.cancellations.byReason} emptyText="لا توجد أسباب إلغاء مسجلة بالفترة." />
                <CountRail title="الطرف المسؤول عن الإلغاء" rows={report.cancellations.byResponsibleParty} labelFor={(row) => responsiblePartyLabels[row.id] ?? row.label} emptyText="لا توجد أطراف مسؤولة مسجلة." />
              </div>
            </section>

            {/* Ratings */}
            <section aria-labelledby="ratings-report" className="space-y-6 rounded-[1.75rem] border border-[#c9a227]/30 bg-[#11110f] p-5 [content-visibility:auto] sm:p-7">
              <SectionHeading code="06 / CUSTOMER REVIEWS" title="تقييمات وصوت العملاء" description="تحليل متوسط التقييمات وتوزيع النجوم والتقييمات حسب الفرع والخدمة." />
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard label="إجمالي التقييمات" value={number(report.customerRatings.totalCount)} tone="gold" />
                <MetricCard label="متوسط التقييم العام" value={`${report.customerRatings.averageScore} / 5`} note={report.customerRatings.averageScore >= 4.5 ? 'أداء ممتاز' : report.customerRatings.totalCount > 0 ? 'يحتاج متابعة' : 'لا توجد تقييمات'} tone="gold" />
                <MetricCard label="التقييمات المعتمدة للنشر" value={number(report.customerRatings.approvedCount)} tone="teal" />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <CountRail title="توزيع النجوم" rows={report.customerRatings.byScore} />
                <CountValueTable title="التقييمات حسب الخدمة" rows={report.customerRatings.byService} />
                <CountValueTable title="التقييمات حسب الفرع" rows={report.customerRatings.byBranch} />
              </div>
            </section>

            {/* Source Rows */}
            <section aria-labelledby="details-report" className="space-y-5 rounded-[1.75rem] border border-white/10 bg-[#11110f] p-5 [content-visibility:auto] sm:p-7">
              <SectionHeading code="07 / SOURCE ROWS" title="سجل الحجوزات المطابق" description={`يعرض ${number(report.rows.length)} صفًا. ملف CSV يضم هذا السجل وجميع الملخصات والتجميعات أعلاه.`} />
              <BookingsTable rows={report.rows} />
            </section>
          </>
        ) : (
          /* ======================================================== */
          /* Monthly Revenue Ledger & Financial Transactions Integrated */
          /* ======================================================== */
          <div className="space-y-8">
            {/* Month Switcher Carousel / Pills */}
            <section aria-labelledby="revenue-month-select" className="rounded-3xl border border-white/10 bg-[#111] p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 id="revenue-month-select" className="text-lg font-black text-white flex items-center gap-2">
                    <Calendar className="size-5 text-[#d4af37]" />
                    <span>دفتر الإيرادات الشهرية</span>
                  </h2>
                  <p className="text-xs text-neutral-400 mt-1">اختر الشهر لمتابعة الإيرادات وصافي الأرباح وحركات الحجوزات والاشتراكات.</p>
                </div>
                <div className="text-xs font-bold text-[#d4af37] bg-[#d4af37]/10 px-3.5 py-1.5 rounded-full border border-[#d4af37]/20 self-start sm:self-auto">
                  الشهر المحدد: {formatMonthLabel(selectedMonth)}
                </div>
              </div>
              <div className="mt-5 flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {pastMonths.map((m) => {
                  const isActive = m.key === selectedMonth;
                  return (
                    <Link
                      key={m.key}
                      href={`/admin/reports?tab=revenue&month=${m.key}`}
                      className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition-all ${isActive ? 'bg-[#d4af37] text-black shadow-lg shadow-[#d4af37]/20 scale-105' : 'bg-neutral-900/90 text-neutral-400 hover:bg-neutral-800 hover:text-white border border-neutral-800'}`}
                    >
                      {m.label}
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* Revenue Summary KPI Cards */}
            <section aria-label="ملخص إيرادات الشهر" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl border border-[#d4af37]/40 bg-gradient-to-br from-[#d4af37]/15 to-transparent p-5 shadow-xl">
                <div className="flex items-center justify-between text-xs font-bold text-[#f3e4a8]">
                  <span>صافي الإيراد والأرباح</span>
                  <Sparkles className="size-4 text-[#d4af37]" />
                </div>
                <p className="mt-3 text-2xl sm:text-3xl font-black text-white">{money(netRevenue)}</p>
                <p className="mt-1 text-[11px] text-neutral-400">إجمالي المقبوضات ناقص الاستردادات</p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-[#111] p-5">
                <div className="flex items-center justify-between text-xs font-bold text-neutral-400">
                  <span>إجمالي المقبوضات</span>
                  <DollarSign className="size-4 text-neutral-400" />
                </div>
                <p className="mt-3 text-2xl sm:text-3xl font-black text-white">{money(totalGrossRevenue)}</p>
                <p className="mt-1 text-[11px] text-neutral-400">الحجوزات + الاشتراكات</p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-[#111] p-5">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                  <span>إيراد الحجوزات</span>
                  <CheckCircle2 className="size-4 text-emerald-400" />
                </div>
                <p className="mt-3 text-2xl font-black text-white">{money(totalBookingRevenue)}</p>
                <p className="mt-1 text-[11px] text-neutral-400">{bookingPayments.length} حركة دفع حجز</p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-[#111] p-5">
                <div className="flex items-center justify-between text-xs font-bold text-sky-400">
                  <span>إيراد الاشتراكات</span>
                  <PackageCheck className="size-4 text-sky-400" />
                </div>
                <p className="mt-3 text-2xl font-black text-white">{money(totalSubscriptionRevenue)}</p>
                <p className="mt-1 text-[11px] text-neutral-400">{subscriptionProofs.length} اشتراك مفعل</p>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-[#111] p-5">
                <div className="flex items-center justify-between text-xs font-bold text-rose-400">
                  <span>الاستردادات المعتمدة</span>
                  <ShieldAlert className="size-4 text-rose-400" />
                </div>
                <p className="mt-3 text-2xl font-black text-rose-400">-{money(totalRefunds)}</p>
                <p className="mt-1 text-[11px] text-neutral-400">{refunds.length} حركة استرداد</p>
              </div>
            </section>

            {/* Breakdowns: Payment Method & Branches */}
            <div className="grid gap-6 lg:grid-cols-2">
              <section aria-labelledby="method-breakdown" className="rounded-3xl border border-neutral-800 bg-[#111] p-5 sm:p-6">
                <h3 id="method-breakdown" className="text-base font-bold text-white flex items-center gap-2">
                  <WalletCards className="size-5 text-[#d4af37]" />
                  <span>توزيع الإيراد حسب وسيلة الدفع</span>
                </h3>
                <div className="mt-4 space-y-3">
                  {Object.keys(paymentMethodMap).length === 0 ? (
                    <p className="text-xs text-neutral-500 py-4 text-center">لا توجد عمليات مسجلة في هذا الشهر.</p>
                  ) : (
                    Object.entries(paymentMethodMap).map(([key, data]) => {
                      const percentage = totalGrossRevenue > 0 ? Math.round((data.amount / totalGrossRevenue) * 100) : 0;
                      return (
                        <div key={key} className="rounded-xl border border-neutral-800/80 bg-neutral-900/50 p-3.5">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-neutral-200">{data.label}</span>
                            <span className="font-mono text-[#f3e4a8]">{money(data.amount)} ({data.count} عملية)</span>
                          </div>
                          <div className="mt-2 flex items-center gap-3">
                            <div className="h-2 flex-1 rounded-full bg-neutral-800 overflow-hidden">
                              <div className="h-full rounded-full bg-[#d4af37]" style={{ width: `${percentage}%` }} />
                            </div>
                            <span className="text-[11px] font-bold text-neutral-400">{percentage}%</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              <section aria-labelledby="branch-revenue-breakdown" className="rounded-3xl border border-neutral-800 bg-[#111] p-5 sm:p-6">
                <h3 id="branch-revenue-breakdown" className="text-base font-bold text-white flex items-center gap-2">
                  <Building2 className="size-5 text-[#d4af37]" />
                  <span>توزيع الإيراد حسب الفرع</span>
                </h3>
                <div className="mt-4 space-y-3">
                  {Object.keys(branchMap).length === 0 ? (
                    <p className="text-xs text-neutral-500 py-4 text-center">لا توجد عمليات مسجلة في هذا الشهر.</p>
                  ) : (
                    Object.entries(branchMap).map(([branchName, data]) => {
                      const percentage = totalGrossRevenue > 0 ? Math.round((data.amount / totalGrossRevenue) * 100) : 0;
                      return (
                        <div key={branchName} className="rounded-xl border border-neutral-800/80 bg-neutral-900/50 p-3.5">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-neutral-200">{branchName}</span>
                            <span className="font-mono text-emerald-400">{money(data.amount)} ({data.count} عملية)</span>
                          </div>
                          <div className="mt-2 flex items-center gap-3">
                            <div className="h-2 flex-1 rounded-full bg-neutral-800 overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${percentage}%` }} />
                            </div>
                            <span className="text-[11px] font-bold text-neutral-400">{percentage}%</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </div>

            {/* Financial Transactions Ledger Table */}
            <section aria-labelledby="transactions-ledger" className="rounded-3xl border border-neutral-800 bg-[#111] p-5 sm:p-6 space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 id="transactions-ledger" className="text-base font-black text-white flex items-center gap-2">
                    <TrendingUp className="size-5 text-[#d4af37]" />
                    <span>سجل الحركات المالية الموثقة ({filteredTransactions.length} حركة)</span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">كشف تفصيلي بالاسم ورقم الهاتف والفرع وطريقة الدفع لكل حجز واشتراك واسترداد.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { type: 'all', label: 'الكل' },
                      { type: 'booking', label: 'الحجوزات' },
                      { type: 'subscription', label: 'الاشتراكات' },
                      { type: 'refund', label: 'الاستردادات' },
                    ] as const
                  ).map((tab) => {
                    const isActive = filterType === tab.type;
                    return (
                      <Link
                        key={tab.type}
                        href={`/admin/reports?tab=revenue&month=${selectedMonth}&type=${tab.type}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ''}`}
                        className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${isActive ? 'bg-[#d4af37] text-black shadow-md' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 hover:text-white border border-neutral-800'}`}
                      >
                        {tab.label}
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Search Bar */}
              <form method="get" className="flex items-center gap-2">
                <input type="hidden" name="tab" value="revenue" />
                <input type="hidden" name="month" value={selectedMonth} />
                <input type="hidden" name="type" value={filterType} />
                <div className="relative flex-1">
                  <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
                  <input
                    name="q"
                    defaultValue={searchQuery}
                    placeholder="ابحث باسم العميل، رقم الهاتف، رقم الحجز، أو الفرع…"
                    className="w-full rounded-xl border border-neutral-800 bg-[#080808] py-2.5 pr-10 pl-4 text-xs text-white placeholder:text-neutral-500 focus:border-[#d4af37] focus:outline-none"
                  />
                </div>
                <button type="submit" className="rounded-xl bg-[#d4af37] px-4 py-2.5 text-xs font-bold text-black hover:bg-[#e0bd3a]">بحث</button>
                {searchQuery ? (
                  <Link
                    href={`/admin/reports?tab=revenue&month=${selectedMonth}&type=${filterType}`}
                    className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-xs font-bold text-neutral-300 hover:bg-neutral-800"
                  >
                    مسح
                  </Link>
                ) : null}
              </form>

              {/* Transactions Table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] border-collapse text-right text-xs">
                  <caption className="sr-only">سجل الحركات المالية الموثقة</caption>
                  <thead className="border-b border-neutral-800 text-neutral-400">
                    <tr>
                      <th scope="col" className="px-3 py-3 font-medium">التاريخ والوقت</th>
                      <th scope="col" className="px-3 py-3 font-medium">النوع والبيان</th>
                      <th scope="col" className="px-3 py-3 font-medium">العميل</th>
                      <th scope="col" className="px-3 py-3 font-medium">الفرع</th>
                      <th scope="col" className="px-3 py-3 font-medium">وسيلة الدفع</th>
                      <th scope="col" className="px-3 py-3 font-medium">المرجع</th>
                      <th scope="col" className="px-3 py-3 font-medium text-left">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-neutral-500">
                          لا توجد حركات مالية مطابقة للبحث في هذا الشهر.
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((tx) => {
                        const isPositive = tx.amount > 0;
                        return (
                          <tr key={tx.id} className="border-b border-neutral-900 hover:bg-white/[0.02]">
                            <td className="px-3 py-3 font-mono text-neutral-400 text-[11px]" dir="ltr">
                              {formatDateTime(tx.date)}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold ${tx.type === 'BOOKING' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : tx.type === 'SUBSCRIPTION' ? 'bg-sky-500/10 text-sky-300 border border-sky-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'}`}>
                                {tx.type === 'BOOKING' ? 'حجز' : tx.type === 'SUBSCRIPTION' ? 'اشتراك' : 'استرداد'}
                              </span>
                              <span className="mr-2 text-white font-medium">{tx.title}</span>
                            </td>
                            <td className="px-3 py-3">
                              <p className="font-bold text-neutral-200">{tx.customerName}</p>
                              <p className="font-mono text-[10px] text-neutral-500" dir="ltr">{tx.customerPhone}</p>
                            </td>
                            <td className="px-3 py-3 text-neutral-300">{tx.branchName}</td>
                            <td className="px-3 py-3 text-neutral-300">{tx.paymentMethod}</td>
                            <td className="px-3 py-3 font-mono text-neutral-400 text-[11px]" dir="ltr">{tx.reference}</td>
                            <td className="px-3 py-3 text-left font-mono font-bold">
                              <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                                {isPositive ? '+' : ''}{money(tx.amount)}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        <footer className="flex flex-col gap-2 border-t border-white/10 py-5 text-xs text-neutral-600 sm:flex-row sm:items-center sm:justify-between">
          <span>تقرير وإيرادات داخلية موحدة — Owner / System Super Admin / Operations Manager</span>
          <span>آخر توليد: {generatedAt}</span>
        </footer>
      </div>
    </main>
  );
}
