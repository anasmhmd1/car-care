import { describe, expect, it } from 'vitest';
import { registerSchema } from '@/lib/validations/auth';
import {
  isCanonicalPhone,
  normalizePhone,
  optionalPhoneSchema,
  phoneLookupCandidates,
  phoneSchema,
} from '@/lib/validations/phone';

describe('phone normalization', () => {
  it.each([
    ['01012345678', '201012345678'],
    ['+20 10 1234 5678', '201012345678'],
    ['00201012345678', '201012345678'],
    ['٠١٠١٢٣٤٥٦٧٨', '201012345678'],
  ])('normalizes %s to the canonical identity %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
    expect(phoneSchema.parse(input)).toBe(expected);
  });

  it('rejects malformed values instead of stripping arbitrary characters', () => {
    expect(phoneSchema.safeParse('call 01012345678').success).toBe(false);
    expect(phoneSchema.safeParse('+20++1012345678').success).toBe(false);
    expect(phoneSchema.safeParse('010123').success).toBe(false);
    expect(isCanonicalPhone('01012345678')).toBe(false);
  });

  it('keeps optional contacts empty and canonicalizes supplied WhatsApp values', () => {
    expect(optionalPhoneSchema.parse('')).toBeUndefined();
    expect(optionalPhoneSchema.parse('(+20) 10-1234-5678')).toBe('201012345678');
  });

  it('uses a finite fallback set for legacy account lookups', () => {
    expect(phoneLookupCandidates('201012345678')).toEqual([
      '201012345678',
      '+201012345678',
      '00201012345678',
      '01012345678',
    ]);
  });

  it('normalizes registration identity and WhatsApp before persistence', () => {
    const parsed = registerSchema.parse({
      fullName: 'Ahmed Customer',
      phone: '01012345678',
      whatsapp: '+20 11 1234 5678',
      email: 'customer@example.com',
      password: 'very-secure-password',
      policyAgreement: 'on',
    });

    expect(parsed.phone).toBe('201012345678');
    expect(parsed.whatsapp).toBe('201112345678');
  });
});
