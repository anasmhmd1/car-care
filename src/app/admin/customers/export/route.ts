import { UserRole } from '@prisma/client';
import type { NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { escapeCsvCell } from '@/lib/reports/csv';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN, UserRole.OPERATIONS_MANAGER]);

  const searchParams = request.nextUrl.searchParams;
  const query = (searchParams.get('q') || searchParams.get('customer_q'))?.trim();

  const whereClause = query
    ? {
        user: {
          role: UserRole.CUSTOMER,
          deletedAt: null,
          OR: [
            { fullName: { contains: query, mode: 'insensitive' as const } },
            { phone: { contains: query, mode: 'insensitive' as const } },
            { whatsapp: { contains: query, mode: 'insensitive' as const } },
            { email: { contains: query, mode: 'insensitive' as const } },
          ],
        },
      }
    : {
        user: {
          role: UserRole.CUSTOMER,
          deletedAt: null,
        },
      };

  const customers = await db.customerProfile.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      notes: true,
      creditBalance: true,
      createdAt: true,
      user: {
        select: {
          fullName: true,
          phone: true,
          whatsapp: true,
          email: true,
          active: true,
        },
      },
      _count: {
        select: {
          bookings: true,
          vehicles: true,
          subscriptions: true,
        },
      },
      vehicles: {
        select: {
          make: true,
          model: true,
          year: true,
          color: true,
          plateNumber: true,
        },
      },
      addresses: {
        select: {
          governorate: true,
          city: true,
          district: true,
          compound: true,
          street: true,
          buildingNumber: true,
        },
      },
      bookings: {
        where: { deletedAt: null },
        orderBy: { startAt: 'desc' },
        select: {
          id: true,
          bookingNumber: true,
          startAt: true,
          bookingStatus: true,
          amountPaid: true,
        },
      },
    },
  });

  const headers = [
    'كود العميل',
    'اسم العميل',
    'رقم الهاتف',
    'رقم الواتساب',
    'البريد الإلكتروني',
    'حالة الحساب',
    'إجمالي الحجوزات',
    'إجمالي المدفوعات (ج.م)',
    'رصيد المحفظة (ج.م)',
    'عدد الاشتراكات',
    'عدد السيارات',
    'بيانات السيارات',
    'العناوين المحفوظة',
    'تاريخ الانضمام',
    'تاريخ آخر حجز',
    'ملاحظات الإدارة (CRM)',
  ];

  const rows: (string | number | null | undefined)[][] = [headers];

  for (const customer of customers) {
    const totalSpent = customer.bookings.reduce((sum, b) => sum + b.amountPaid, 0);
    const vehiclesStr = customer.vehicles
      .map(
        (v) =>
          `${v.make} ${v.model} ${v.year} (${v.color}${v.plateNumber ? ` - ${v.plateNumber}` : ''})`,
      )
      .join(' | ');

    const addressesStr = customer.addresses
      .map((a) => `${a.compound || a.district} (${a.street} - مبنى ${a.buildingNumber})`)
      .join(' | ');

    const joinDate = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(
      new Date(customer.createdAt),
    );
    const lastBooking = customer.bookings[0]
      ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(
          new Date(customer.bookings[0].startAt),
        )
      : 'لا يوجد';

    rows.push([
      customer.id.slice(0, 8),
      customer.user.fullName,
      customer.user.phone,
      customer.user.whatsapp || customer.user.phone,
      customer.user.email || '',
      customer.user.active ? 'نشط' : 'متوقف',
      customer._count.bookings,
      totalSpent,
      customer.creditBalance,
      customer._count.subscriptions,
      customer._count.vehicles,
      vehiclesStr || 'لا توجد سيارات',
      addressesStr || 'لا توجد عناوين',
      joinDate,
      lastBooking,
      customer.notes || '',
    ]);
  }

  const csvContent = `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
  const fileName = `bareeq-crm-customers-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
