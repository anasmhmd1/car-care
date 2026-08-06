import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ownerCustomerAccountSchema } from '@/lib/validations/admin';

const validCustomerAccount = {
  customerId: 'customer-1',
  fullName: 'عميل تجريبي',
  phone: '010 1234 5678',
  whatsapp: '+20 (10) 1234-5678',
  email: 'customer@example.com',
  active: 'true',
  temporaryPassword: '',
};

describe('owner customer account validation', () => {
  it('canonicalizes customer contact data and exposes no role field', () => {
    const result = ownerCustomerAccountSchema.parse({
      ...validCustomerAccount,
      role: 'OWNER',
    });

    expect(result).toMatchObject({
      customerId: 'customer-1',
      phone: '201012345678',
      whatsapp: '201012345678',
      active: true,
    });
    expect(result).not.toHaveProperty('role');
  });

  it('rejects an invalid account-state value and a weak reset password', () => {
    expect(ownerCustomerAccountSchema.safeParse({
      ...validCustomerAccount,
      active: 'on',
    }).success).toBe(false);

    expect(ownerCustomerAccountSchema.safeParse({
      ...validCustomerAccount,
      temporaryPassword: 'short',
    }).success).toBe(false);
  });

  it('allows an empty optional WhatsApp value without weakening the required login phone', () => {
    const result = ownerCustomerAccountSchema.parse({
      ...validCustomerAccount,
      whatsapp: '',
    });

    expect(result.phone).toBe('201012345678');
    expect(result.whatsapp).toBeUndefined();
  });

  it('checks all owner-managed phone identities against canonical and legacy candidates', () => {
    const ownerActions = readFileSync(
      resolve(process.cwd(), 'src/app/actions/owner.ts'),
      'utf8',
    );

    expect(ownerActions).toContain("import { phoneLookupCandidates, phoneSchema }");
    expect(ownerActions).toContain('phone: { in: phoneLookupCandidates(phone) }');
    expect(ownerActions).toContain('phone: { in: phoneLookupCandidates(data.phone) }');
  });
});
