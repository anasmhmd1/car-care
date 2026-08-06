import Link from 'next/link';
import { FileText, ReceiptText, ChevronLeft } from 'lucide-react';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { syncInvoiceForBooking } from '@/lib/engine/invoice';

export const dynamic = 'force-dynamic';

const money = new Intl.NumberFormat('ar-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 0,
});

export default async function CustomerInvoicesPage() {
  const user = await requireRole([UserRole.CUSTOMER]);
  const customer = await db.customerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!customer) return null;

  // Historic records predate the invoice entity. Backfill only the customer's
  // missing invoices, idempotently, so the account stays complete after the migration.
  const withoutInvoice = await db.booking.findMany({
    where: { customerId: customer.id, deletedAt: null, invoice: null },
    select: {
      id: true,
      bookingNumber: true,
      customerId: true,
      branchId: true,
      totalPrice: true,
      amountPaid: true,
      amountDue: true,
    },
  });
  if (withoutInvoice.length) {
    await db.$transaction(async (tx) => {
      for (const booking of withoutInvoice) await syncInvoiceForBooking(tx, booking);
    });
  }

  const invoices = await db.invoice.findMany({
    where: { customerId: customer.id },
    orderBy: { issuedAt: 'desc' },
    select: {
      id: true,
      invoiceNumber: true,
      subtotalAmount: true,
      paidAmount: true,
      dueAmount: true,
      status: true,
      issuedAt: true,
      booking: {
        select: {
          bookingNumber: true,
          service: { select: { nameAr: true } },
          branch: { select: { nameAr: true } },
        },
      },
    },
  });

  return (
    <div dir="rtl" className="space-y-7 pb-12">
      <header className="rounded-3xl border border-[#c9a227]/30 bg-[#14130f] p-6 sm:p-8">
        <p className="inline-flex items-center gap-2 rounded-full border border-[#c9a227]/30 bg-[#c9a227]/10 px-3 py-1 text-xs font-bold text-[#e5c45a]">
          <ReceiptText className="size-3.5" aria-hidden="true" />
          السجل المالي
        </p>
        <h1 className="mt-3 text-3xl font-black text-white">فواتيري</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-neutral-400">كل حجز له فاتورة إلكترونية تفصل القيمة والمدفوع والمتبقي، ويمكنك طباعتها أو حفظها PDF.</p>
      </header>

      {invoices.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-neutral-700 bg-[#121212] p-10 text-center">
          <FileText className="mx-auto size-9 text-neutral-600" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-black text-white">لا توجد فواتير بعد</h2>
          <p className="mt-2 text-sm text-neutral-500">ستظهر فاتورتك هنا فور إنشاء حجز جديد.</p>
        </section>
      ) : (
        <section className="space-y-3" aria-label="قائمة الفواتير">
          {invoices.map((invoice) => (
            <Link key={invoice.id} href={`/account/invoices/${invoice.id}`} className="group flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-[#121212] p-5 transition hover:border-[#c9a227]/45 focus:outline-none focus:ring-2 focus:ring-[#e5c45a] sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-xs font-black text-[#e5c45a]" dir="ltr">{invoice.invoiceNumber}</p>
                <h2 className="mt-2 truncate text-base font-black text-white">{invoice.booking.service.nameAr}</h2>
                <p className="mt-1 text-xs text-neutral-500">{invoice.booking.branch.nameAr} · حجز {invoice.booking.bookingNumber} · {invoice.issuedAt.toLocaleDateString('ar-EG')}</p>
              </div>
              <div className="flex items-center justify-between gap-5 sm:justify-end">
                <div className="text-left">
                  <p className="text-lg font-black text-white">{money.format(invoice.subtotalAmount)}</p>
                  <p className={invoice.dueAmount > 0 ? 'mt-1 text-xs font-bold text-amber-300' : 'mt-1 text-xs font-bold text-emerald-300'}>{invoice.dueAmount > 0 ? `متبقي ${money.format(invoice.dueAmount)}` : 'مسددة'}</p>
                </div>
                <ChevronLeft className="size-5 text-neutral-600 transition group-hover:text-[#e5c45a]" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
