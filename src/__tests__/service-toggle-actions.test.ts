import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('@/lib/auth/session', () => ({
  requireRole: mocks.requireRole,
}));

vi.mock('@/lib/db', () => ({
  db: {
    $transaction: mocks.transaction,
  },
}));

import {
  toggleServiceBookableOnlineAction,
  toggleServiceStatusAction,
} from '@/app/actions/catalog';

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';

describe('service quick toggle actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: 'owner-1', role: UserRole.OWNER });
  });

  it('toggles service active status and creates audit log', async () => {
    const existing = { id: SERVICE_ID, nameAr: 'غسيل بريق', active: true };
    const updated = { id: SERVICE_ID, nameAr: 'غسيل بريق', active: false };

    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const tx = {
        service: {
          findUnique: vi.fn().mockResolvedValue(existing),
          update: vi.fn().mockResolvedValue(updated),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
        },
      };
      return callback(tx);
    });

    const formData = new FormData();
    formData.set('serviceId', SERVICE_ID);
    const result = await toggleServiceStatusAction(formData);

    expect(result.success).toBe(true);
    expect(result.active).toBe(false);
    expect(result.message).toContain('إيقاف الخدمة');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin');
  });

  it('toggles service bookable online status and creates audit log', async () => {
    const existing = { id: SERVICE_ID, nameAr: 'غسيل بريق', bookableOnline: false };
    const updated = { id: SERVICE_ID, nameAr: 'غسيل بريق', bookableOnline: true };

    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const tx = {
        service: {
          findUnique: vi.fn().mockResolvedValue(existing),
          update: vi.fn().mockResolvedValue(updated),
        },
        auditLog: {
          create: vi.fn().mockResolvedValue({ id: 'audit-2' }),
        },
      };
      return callback(tx);
    });

    const formData = new FormData();
    formData.set('serviceId', SERVICE_ID);
    const result = await toggleServiceBookableOnlineAction(formData);

    expect(result.success).toBe(true);
    expect(result.bookableOnline).toBe(true);
    expect(result.message).toContain('فتح الحجز الإلكتروني');
  });

  it('handles missing service error gracefully', async () => {
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      const tx = {
        service: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };
      return callback(tx);
    });

    const formData = new FormData();
    formData.set('serviceId', 'non-existent');
    const result = await toggleServiceStatusAction(formData);

    expect(result.error).toBe('الخدمة غير موجودة.');
  });
});
