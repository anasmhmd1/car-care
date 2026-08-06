import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import SupportCenterClient from './SupportCenterClient';

export const dynamic = 'force-dynamic';

export default async function CustomerSupportPage() {
  const user = await requireRole([UserRole.CUSTOMER]);
  const customer = await db.customerProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      supportTickets: {
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          subject: true,
          category: true,
          priority: true,
          status: true,
          updatedAt: true,
          booking: { select: { bookingNumber: true } },
          messages: {
            where: { isInternal: false },
            orderBy: { createdAt: 'asc' },
            select: { id: true, message: true, createdAt: true, author: { select: { id: true, fullName: true } } },
          },
        },
      },
      bookings: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, bookingNumber: true, service: { select: { nameAr: true } } },
      },
    },
  });
  if (!customer) return null;

  return <SupportCenterClient
    bookings={customer.bookings.map((booking) => ({ id: booking.id, label: `${booking.bookingNumber} · ${booking.service.nameAr}` }))}
    tickets={customer.supportTickets.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      bookingNumber: ticket.booking?.bookingNumber ?? null,
      updatedAt: ticket.updatedAt.toISOString(),
      messages: ticket.messages.map((message) => ({
        id: message.id,
        message: message.message,
        createdAt: message.createdAt.toISOString(),
        authorName: message.author.fullName,
        fromCustomer: message.author.id === user.id,
      })),
    }))}
  />;
}
