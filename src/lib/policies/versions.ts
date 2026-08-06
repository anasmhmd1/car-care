export const PRIVACY_POLICY_VERSION = '2026-08-01' as const;
export const BOOKING_TERMS_VERSION = '2026-08-01' as const;

export const REGISTRATION_CONSENTS = [
  {
    consentType: 'PRIVACY_POLICY',
    version: PRIVACY_POLICY_VERSION,
  },
  {
    consentType: 'BOOKING_TERMS',
    version: BOOKING_TERMS_VERSION,
  },
] as const;
