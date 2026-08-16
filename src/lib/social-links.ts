import { z } from 'zod';
import { db } from '@/lib/db';

export const socialLinksSchema = z.object({
  facebook: z.string().trim().max(500).optional().default(''),
  tiktok: z.string().trim().max(500).optional().default(''),
  instagram: z.string().trim().max(500).optional().default(''),
});

export type SocialLinks = z.infer<typeof socialLinksSchema>;

export const DEFAULT_SOCIAL_LINKS: SocialLinks = {
  facebook: 'https://facebook.com',
  tiktok: 'https://tiktok.com',
  instagram: 'https://instagram.com',
};

/**
 * Safely parses social links stored in BrandSettings JSON without crashing
 * on legacy or null values.
 */
export function readSocialLinks(value: unknown): SocialLinks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_SOCIAL_LINKS;
  }

  const raw = value as Record<string, unknown>;
  const candidate = (raw.socialLinks && typeof raw.socialLinks === 'object' && !Array.isArray(raw.socialLinks))
    ? raw.socialLinks
    : raw;

  const parsed = socialLinksSchema.safeParse(candidate);
  if (!parsed.success) {
    return DEFAULT_SOCIAL_LINKS;
  }

  return {
    facebook: parsed.data.facebook || DEFAULT_SOCIAL_LINKS.facebook,
    tiktok: parsed.data.tiktok || DEFAULT_SOCIAL_LINKS.tiktok,
    instagram: parsed.data.instagram || DEFAULT_SOCIAL_LINKS.instagram,
  };
}

/**
 * Fetches public social media links directly from the database for server-rendered components.
 */
export async function getPublicSocialLinks(): Promise<SocialLinks> {
  try {
    const brand = await db.brandSettings.findFirst({
      select: { homepageContent: true },
    });
    return readSocialLinks(brand?.homepageContent);
  } catch (error) {
    console.error('Failed to get public social links:', error);
    return DEFAULT_SOCIAL_LINKS;
  }
}
