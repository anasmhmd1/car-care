import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOCIAL_LINKS,
  readSocialLinks,
  socialLinksSchema,
} from '@/lib/social-links';

describe('social links contract and helpers', () => {
  it('returns default fallback links when input is null, undefined, or invalid', () => {
    expect(readSocialLinks(null)).toEqual(DEFAULT_SOCIAL_LINKS);
    expect(readSocialLinks(undefined)).toEqual(DEFAULT_SOCIAL_LINKS);
    expect(readSocialLinks('invalid')).toEqual(DEFAULT_SOCIAL_LINKS);
    expect(readSocialLinks([])).toEqual(DEFAULT_SOCIAL_LINKS);
  });

  it('reads nested socialLinks object from homepageContent correctly', () => {
    const raw = {
      heroTitle: 'عناية فاخرة',
      socialLinks: {
        facebook: 'https://facebook.com/bareeq.official',
        tiktok: 'https://tiktok.com/@bareeq.care',
        instagram: 'https://instagram.com/bareeq.detailing',
      },
    };

    const parsed = readSocialLinks(raw);
    expect(parsed).toEqual({
      facebook: 'https://facebook.com/bareeq.official',
      tiktok: 'https://tiktok.com/@bareeq.care',
      instagram: 'https://instagram.com/bareeq.detailing',
    });
  });

  it('fills missing fields with defaults when partial links provided', () => {
    const raw = {
      socialLinks: {
        facebook: 'https://facebook.com/bareeq.custom',
      },
    };

    const parsed = readSocialLinks(raw);
    expect(parsed.facebook).toBe('https://facebook.com/bareeq.custom');
    expect(parsed.tiktok).toBe(DEFAULT_SOCIAL_LINKS.tiktok);
    expect(parsed.instagram).toBe(DEFAULT_SOCIAL_LINKS.instagram);
  });

  it('validates schema and trims whitespace', () => {
    const result = socialLinksSchema.safeParse({
      facebook: '  https://facebook.com/test  ',
      tiktok: '  https://tiktok.com/@test  ',
      instagram: '  https://instagram.com/test  ',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.facebook).toBe('https://facebook.com/test');
      expect(result.data.tiktok).toBe('https://tiktok.com/@test');
      expect(result.data.instagram).toBe('https://instagram.com/test');
    }
  });
});
