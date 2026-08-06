import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import InvoicePrintButton from '../InvoicePrintButton';

export const dynamic = 'force-dynamic';

const money = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 });

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole([UserRole.CUSTOMER]);
  const { id } = await params;
  const invoice = await db.invoice.findFirst({
    where: { id, customer: { userId: user.id } },
    select: {
      invoiceNumber: true,
      subtotalAmount: true,
      paidAmount: true,
      dueAmount: true,
      status: true,
      issuedAt: true,
      notes: true,
      customer: { select: { user: { select: { fullName: true, phone: true, email: true } } } },
      branch: { select: { nameAr: true, address: true, phone: true } },
      booking: {
        select: {
          bookingNumber: true,
          startAt: true,
          service: { select: { nameAr: true } },
          vehicle: { select: { make: true, model: true, year: true, plateNumber: true } },
          items: { select: { id: true, nameSnapshot: true, quantity: true, unitPrice: true } },
        },
      },
    },
  });
  if (!invoice) notFound();

  return (
    <article dir="rtl" className="mx-auto max-w-4xl space-y-6 pb-12 print:max-w-none">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Link href="/account/invoices" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-neutral-700 px-4 text-xs font-bold text-neutral-300 hover:border-[#c9a227]/50 hover:text-white"><ArrowRight className="size-4" aria-hidden="true" />العودة للفواتير</Link>
        <InvoicePrintButton />
      </div>
      <section className="overflow-hidden rounded-3xl border border-[#c9a227]/35 bg-white p-6 text-[#151515] shadow-2xl sm:p-10 print:border-0 print:shadow-none">
        <header className="flex flex-col gap-6 border-b border-black/10 pb-7 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.18em] text-[#9a7412]">BAREEQ · MOBILE CAR CARE</p>
            <h1 className="mt-2 text-3xl font-black">فاتورة إلكترونية</h1>
            <p className="mt-2 font-mono text-sm font-bold text-[#80651e]" dir="ltr">{invoice.invoiceNumber}</p>
          </div>
          <div className="rounded-2xl bg-[#f5eedb] px-4 py-3 text-right text-xs leading-6">
            <p className="font-black">{invoice.branch.nameAr}</p>
            <p>{invoice.branch.address}</p><p dir="ltr">{invoice.branch.phone}</p>
          </div>
        </header>

        <div className="grid gap-6 py-7 sm:grid-cols-2">
          <section><h2 className="text-xs font-black text-neutral-500">بيانات العميل</h2><p className="mt-2 text-base font-black">{invoice.customer.user.fullName}</p><p className="mt-1 text-sm text-neutral-600" dir="ltr">{invoice.customer.user.phone}</p>{invoice.customer.user.email ? <p className="mt-1 text-sm text-neutral-600">{invoice.customer.user.email}</p> : null}</section>
          <section><h2 className="text-xs font-black text-neutral-500">تفاصيل الحجز</h2><p className="mt-2 text-base font-black">{invoice.booking.service.nameAr}</p><p className="mt-1 text-sm text-neutral-600">{invoice.booking.vehicle.make} {invoice.booking.vehicle.model} {invoice.booking.vehicle.year} · {invoice.booking.vehicle.plateNumber || 'بدون لوحة'}</p><p className="mt-1 text-sm text-neutral-600">#{invoice.booking.bookingNumber} · {invoice.booking.startAt.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</p></section>
        </div>

        <table className="w-full border-collapse text-right text-sm"><thead className="border-y border-black/10 text-xs text-neutral-500"><tr><th className="py-3 font-bold">البند</th><th className="py-3 text-center font-bold">الكمية</th><th className="py-3 text-left font-bold">القيمة</th></tr></thead><tbody>{invoice.booking.items.map((item) => <tr key={item.id} className="border-b border-black/5"><td className="py-4 font-bold">{item.nameSnapshot}</td><td className="py-4 text-center">{item.quantity}</td><td className="py-4 text-left font-mono">{money.format(item.unitPrice * item.quantity)}</td></tr>)}</tbody></table>

        <section className="ml-auto mt-7 max-w-sm space-y-3 border-t border-black/10 pt-4 text-sm"><div className="flex justify-between gap-4"><span>إجمالي الفاتورة</span><strong>{money.format(invoice.subtotalAmount)}</strong></div><div className="flex justify-between gap-4"><span>المدفوع</span><strong className="text-emerald-700">{money.format(invoice.paidAmount)}</strong></div><div className="flex justify-between gap-4 border-t border-black/10 pt-3 text-lg font-black"><span>المتبقي</span><span className={invoice.dueAmount > 0 ? 'text-amber-700' : 'text-emerald-700'}>{money.format(invoice.dueAmount)}</span></div></section>
        <footer className="mt-10 flex items-center gap-2 border-t border-black/10 pt-5 text-xs text-neutral-500"><CheckCircle2 className="size-4 text-[#9a7412]" aria-hidden="true" />هذه فاتورة إلكترونية صادرة بتاريخ {invoice.issuedAt.toLocaleDateString('ar-EG')}.</footer>
      </section>
    </article>
  );
}
