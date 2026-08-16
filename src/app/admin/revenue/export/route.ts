import { RefundStatus, SubscriptionPaymentProofStatus, UserRole } from '@prisma/client';
import type { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { localDateBoundsUtc } from '@/lib/engine/time';
import { escapeCsvCell } from '@/lib/reports/csv';

export const dynamic = 'force-dynamic';

const CAIRO_TIME_ZONE = 'Africa/Cairo';

export async function GET(request: NextRequest): Promise<Response> {
  await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);

  const searchParams = request.nextUrl.searchParams;
  const monthParam = searchParams.get('month')?.trim(); // YYYY-MM

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const selectedMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonth;

  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const lastDay = new Date(year, month, 0).getDate();

  const startDateStr = `${selectedMonth}-01`;
  const endDateStr = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

  const monthStart = localDateBoundsUtc(startDateStr, CAIRO_TIME_ZONE).start;
  const monthEnd = localDateBoundsUtc(endDateStr, CAIRO_TIME_ZONE).end;

  const [bookingPayments, subscriptionProofs, refunds] = await Promise.all([
    db.payment.findMany({
      where: { createdAt: { gte: monthStart, lt: monthEnd } },
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
      },
      include: {
        booking: {
          include: {
            customer: { include: { user: true } },
            service: true,
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

  const rows: string[][] = [
    ['تقرير إيرادات بريق الشهرية الشامل'],
    [`الشهر المحدد: ${selectedMonth}`],
    [`الفترة: من ${startDateStr} إلى ${endDateStr}`],
    [`إجمالي إيراد الحجوزات: ${totalBookingRevenue} ج.م`],
    [`إجمالي إيراد الاشتراكات: ${totalSubscriptionRevenue} ج.م`],
    [`إجمالي المقبوضات: ${totalGrossRevenue} ج.م`],
    [`إجمالي الاستردادات: ${totalRefunds} ج.م`],
    [`صافي الإيراد والأرباح: ${netRevenue} ج.م`],
    [],
    [
      'التاريخ والوقت',
      'نوع المعاملة',
      'اسم العميل',
      'رقم هاتف العميل',
      'البيان / الخدمة / الباقة',
      'الفرع',
      'وسيلة الدفع',
      'المبلغ (ج.م)',
      'رقم المرجع / الحجز',
    ],
  ];

  for (const payment of bookingPayments) {
    rows.push([
      payment.createdAt.toISOString().replace('T', ' ').slice(0, 19),
      'حجز خدمة',
      payment.booking.customer.user.fullName,
      `'${payment.booking.customer.user.phone}`,
      payment.booking.service.nameAr,
      payment.booking.branch.nameAr,
      payment.paymentMethod,
      String(payment.amount),
      payment.booking.bookingNumber,
    ]);
  }

  for (const proof of subscriptionProofs) {
    rows.push([
      (proof.reviewedAt ?? proof.createdAt).toISOString().replace('T', ' ').slice(0, 19),
      'اشتراك باقة',
      proof.subscription.customer.user.fullName,
      `'${proof.subscription.customer.user.phone}`,
      proof.subscription.plan.nameAr,
      proof.subscription.branch.nameAr,
      proof.paymentMethod.name,
      String(proof.amountSubmitted),
      `SUB-${proof.subscription.id.slice(0, 8)}`,
    ]);
  }

  for (const refund of refunds) {
    rows.push([
      refund.createdAt.toISOString().replace('T', ' ').slice(0, 19),
      'استرداد مالي',
      refund.booking.customer.user.fullName,
      `'${refund.booking.customer.user.phone}`,
      `استرداد: ${refund.booking.service.nameAr}`,
      '—',
      refund.refundMethod,
      String(-refund.amount),
      refund.booking.bookingNumber,
    ]);
  }

  const csvContent = '\uFEFF' + rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
  const fileName = `bareeq-monthly-revenue-${selectedMonth}.csv`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
