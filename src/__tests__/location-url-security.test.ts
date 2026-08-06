import { describe, expect, it } from 'vitest';
import { addressSchema } from '@/lib/validations/admin';
import { createBookingSchema } from '@/lib/validations/booking';
import { isValidLocationUrl, sanitizeLocationUrl } from '@/lib/security/url';

const bookingLocationSchema = createBookingSchema.pick({ locationUrl: true });
const addressLocationSchema = addressSchema.pick({ locationUrl: true });

describe('location URL security', () => {
  it('accepts only http(s) map links', () => {
    expect(isValidLocationUrl('https://maps.google.com/?q=30.1,31.2')).toBe(true);
    expect(isValidLocationUrl('http://maps.example.test/location')).toBe(true);
    expect(sanitizeLocationUrl(' https://maps.example.test/location ')).toBe('https://maps.example.test/location');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://files.example.test/location',
  ])('rejects unsafe protocol %s in every address entry point', (value) => {
    expect(isValidLocationUrl(value)).toBe(false);
    expect(sanitizeLocationUrl(value)).toBeNull();
    expect(bookingLocationSchema.safeParse({ locationUrl: value }).success).toBe(false);
    expect(addressLocationSchema.safeParse({ locationUrl: value }).success).toBe(false);
  });
});
