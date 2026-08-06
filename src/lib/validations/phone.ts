import { z } from 'zod';

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC_INDIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ASCII_DIGITS = '0123456789';
const ALLOWED_PHONE_CHARACTERS = /^[0-9+\s().-]+$/;
const CANONICAL_PHONE_PATTERN = /^[1-9]\d{9,14}$/;
const EGYPTIAN_LOCAL_MOBILE_PATTERN = /^01[0125]\d{8}$/;

/**
 * Converts a phone number to the single database representation used for
 * account identity and throttling: international digits without a `+` or
 * punctuation. Egyptian local mobile numbers are expanded to country code 20.
 *
 * Invalid characters deliberately result in an empty value so callers using
 * `phoneSchema` receive a validation error instead of silently accepting a
 * partially stripped value such as `abc010...`.
 */
export function normalizePhone(value: string): string {
  const asciiDigits = value
    .trim()
    .replace(/[٠-٩]/g, (digit) => ASCII_DIGITS[ARABIC_INDIC_DIGITS.indexOf(digit)])
    .replace(/[۰-۹]/g, (digit) => ASCII_DIGITS[EASTERN_ARABIC_INDIC_DIGITS.indexOf(digit)]);

  if (!asciiDigits || !ALLOWED_PHONE_CHARACTERS.test(asciiDigits)) return '';

  let compact = asciiDigits.replace(/[\s().-]/g, '');
  const plusCount = (compact.match(/\+/g) ?? []).length;
  if (plusCount > 1 || (plusCount === 1 && !compact.startsWith('+'))) return '';

  if (compact.startsWith('+')) compact = compact.slice(1);
  if (compact.startsWith('00')) compact = compact.slice(2);
  if (EGYPTIAN_LOCAL_MOBILE_PATTERN.test(compact)) {
    compact = `20${compact.slice(1)}`;
  }

  return compact;
}

export function isCanonicalPhone(value: string): boolean {
  return CANONICAL_PHONE_PATTERN.test(value);
}

/**
 * Exact legacy storage forms that can represent one canonical account phone.
 * This is intentionally finite and only used while the data migration catches
 * up; it avoids broad `contains` queries over account identities.
 */
export function phoneLookupCandidates(canonicalPhone: string): string[] {
  if (!isCanonicalPhone(canonicalPhone)) return [];

  const candidates = new Set([
    canonicalPhone,
    `+${canonicalPhone}`,
    `00${canonicalPhone}`,
  ]);
  if (/^20(?:1[0125])\d{8}$/.test(canonicalPhone)) {
    candidates.add(`0${canonicalPhone.slice(2)}`);
  }
  return [...candidates];
}

const PHONE_REQUIRED_MESSAGE = 'رقم الهاتف مطلوب.';
const PHONE_INVALID_MESSAGE = 'رقم الهاتف غير صالح.';

/** Required account/contact phone, normalized to canonical international digits. */
export const phoneSchema = z
  .string({ required_error: PHONE_REQUIRED_MESSAGE })
  .trim()
  .min(1, PHONE_REQUIRED_MESSAGE)
  .transform(normalizePhone)
  .refine(isCanonicalPhone, PHONE_INVALID_MESSAGE);

/** Optional WhatsApp/contact phone. Empty form fields become `undefined`. */
export const optionalPhoneSchema = z
  .union([z.string(), z.undefined(), z.null()])
  .transform((value) => {
    if (value === undefined || value === null || value.trim() === '') return undefined;
    return normalizePhone(value);
  })
  .refine(
    (value) => value === undefined || isCanonicalPhone(value),
    PHONE_INVALID_MESSAGE,
  );
