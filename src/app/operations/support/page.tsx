import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { getAccessibleBranchIds, publicUserSelect } from '@/lib/auth/authorization';
import { db } from '@/lib/db';
import SupportDeskClient from './SupportDeskClient';

export const dynamic = 'force-dynamic';

export default async function OperationsSupportPage() {
  const actor = await requireRole([UserRole.OPERATIONS_MANAGER, UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const branchIds = await getAccessibleBranchIds(actor);
  const [tickets, assignees] = await Promise.all([
    db.supportTicket.findMany({
      where: branchIds === null ? {} : { branchId: { in: branchIds } },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 150,
      select: {
        id: true, subject: true, category: true, priority: true, status: true, assignedToUserId: true,
        branch: { select: { nameAr: true } },
        booking: { select: { bookingNumber: true } },
        customer: { select: { user: { select: { fullName: true, phone: true } } } },
        messages: { orderBy: { createdAt: 'asc' }, select: { id: true, message: true, isInternal: true, createdAt: true, author: { select: { fullName: true } } } },
      },
    }),
    db.user.findMany({
      where: {
        active: true, deletedAt: null,
        role: { in: [UserRole.OPERATIONS_MANAGER, UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN] },
        ...(branchIds === null ? {} : { branchMemberships: { some: { branchId: { in: branchIds } } } }),
      },
      select: publicUserSelect,
      orderBy: { fullName: 'asc' },
    }),
  ]);
  return <SupportDeskClient assignees={assignees.map((user) => ({ id: user.id, name: user.fullName }))} tickets={tickets.map((ticket) => ({
    id: ticket.id, subject: ticket.subject, category: ticket.category, priority: ticket.priority, status: ticket.status,
    branchName: ticket.branch?.nameAr ?? null, bookingNumber: ticket.booking?.bookingNumber ?? null, assignedToUserId: ticket.assignedToUserId,
    customerName: ticket.customer.user.fullName, customerPhone: ticket.customer.user.phone,
    messages: ticket.messages.map((message) => ({ id: message.id, message: message.message, isInternal: message.isInternal, createdAt: message.createdAt.toISOString(), authorName: message.author.fullName })),
  }))} />;
}
