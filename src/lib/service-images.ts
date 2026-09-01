/**
 * Resolves images for services:
 * 1. Show whatever image is stored for the service (SVG, uploaded photo, etc.) — same on admin AND client.
 * 2. If NO image exists at all (null / empty), show the official Bareeq Brand Logo.
 * 3. NEVER inject random/unrelated car photos that were not part of the service record.
 */

export const BRAND_LOGO = '/images/bareeq_official_logo.png';

/** Images that the old code used to INJECT into galleries — these must never be auto-appended */
const INJECTED_FALLBACKS = new Set([
  '/images/bareeq_hero_car.png',
  '/images/bareeq_reference_hero.png',
  '/images/bareeq_exterior_care.png',
  '/images/bareeq_interior_care.png',
  '/images/bareeq_engine_care.png',
]);

function isValidImage(image?: string | null): boolean {
  if (!image || typeof image !== 'string') return false;
  const trimmed = image.trim();
  if (!trimmed) return false;
  return true;
}

export function getServiceRealImage(slug: string, coverImage?: string | null): string {
  if (isValidImage(coverImage)) {
    return coverImage!.trim();
  }
  return BRAND_LOGO;
}

export function getServiceGalleryImages(
  slug: string,
  coverImage?: string | null,
  rawGallery?: string[] | null,
): string[] {
  const images: string[] = [];

  // 1. Add cover image if it exists
  if (isValidImage(coverImage)) {
    images.push(coverImage!.trim());
  }

  // 2. Add gallery images — but NEVER auto-injected fallbacks
  if (Array.isArray(rawGallery)) {
    for (const img of rawGallery) {
      if (isValidImage(img) && !INJECTED_FALLBACKS.has(img.trim())) {
        images.push(img.trim());
      }
    }
  }

  const unique = Array.from(new Set(images));

  if (unique.length > 0) {
    return unique;
  }

  // 3. If truly no images exist, show brand logo
  return [BRAND_LOGO];
}
