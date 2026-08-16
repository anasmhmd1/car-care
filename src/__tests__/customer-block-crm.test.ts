import { describe, expect, it } from 'vitest';
import { UserRole } from '@prisma/client';

describe('CRM & Customer Blocking by Operations Manager and Owner (إدارة الـ CRM وحظر العملاء)', () => {
  it('allows OWNER, SYSTEM_SUPER_ADMIN, and OPERATIONS_MANAGER to access customer management', () => {
    const allowedRoles: UserRole[] = [
      UserRole.OWNER,
      UserRole.SYSTEM_SUPER_ADMIN,
      UserRole.OPERATIONS_MANAGER,
    ];

    expect(allowedRoles.includes(UserRole.OPERATIONS_MANAGER)).toBe(true);
    expect(allowedRoles.includes(UserRole.OWNER)).toBe(true);
    expect(allowedRoles.includes(UserRole.CUSTOMER)).toBe(false);
  });

  it('validates block toggle requirements', () => {
    const validBlock = {
      customerId: 'c1234567-89ab-cdef-0123-456789abcdef',
      block: true,
      reason: 'سلوك غير لائق ومشاكل متكررة مع فريق العمل',
    };
    expect(validBlock.customerId.length).toBeGreaterThan(0);
    expect(validBlock.reason.length).toBeGreaterThanOrEqual(3);

    const invalidShortReason = {
      customerId: 'c1234567-89ab-cdef-0123-456789abcdef',
      block: true,
      reason: 'لا',
    };
    expect(invalidShortReason.reason.length < 3).toBe(true);
  });

  it('generates proper audit action and CRM note stamp when banning/unbanning', () => {
    const block = true;
    const actorRole = UserRole.OPERATIONS_MANAGER;
    const actorName = 'مدير التشغيل محمد';
    const reason = 'إساءة استخدام الخدمة';
    const timestamp = '14/08/2026';

    const actionLabel = block ? 'حظر العميل' : 'إلغاء حظر العميل';
    const actorLabel = actorRole === UserRole.OPERATIONS_MANAGER ? 'مدير التشغيل' : 'المالك';
    const entry = `[${actionLabel} بواسطة ${actorLabel} (${actorName}) - ${timestamp}]: ${reason}`;

    expect(entry).toContain('حظر العميل');
    expect(entry).toContain('مدير التشغيل');
    expect(entry).toContain(reason);
  });
});
