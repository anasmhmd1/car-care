/**
 * Resolves images for services:
 * 1. If the Owner uploaded a photo or gallery, return ONLY the uploaded photos.
 * 2. If no photo is uploaded (or placeholder SVG), return the official Bareeq Brand Logo.
 * 3. Never inject random/unrelated car photos.
 */

export const BRAND_LOGO = '/images/bareeq_official_logo.png';

export function isCustomUploadedPhoto(image?: string | null): boolean {
  if (!image || typeof image !== 'string') return false;
  const trimmed = image.trim();
  if (!trimmed) return false;
  // Ignore legacy SVG placeholders
  if (trimmed.endsWith('.svg') || trimmed.includes('/services/')) return false;
  return true;
}

export function getServiceRealImage(slug: string, coverImage?: string | null): string {
  if (isCustomUploadedPhoto(coverImage)) {
    return coverImage!.trim();
  }
  // Default to official Brand Logo when no custom image is uploaded
  return BRAND_LOGO;
}

export function getServiceGalleryImages(
  slug: string,
  coverImage?: string | null,
  rawGallery?: string[] | null,
): string[] {
  const images: string[] = [];

  // 1. Add custom uploaded cover if present
  if (isCustomUploadedPhoto(coverImage)) {
    images.push(coverImage!.trim());
  }

  // 2. Add custom uploaded gallery images if present
  if (Array.isArray(rawGallery)) {
    for (const img of rawGallery) {
      if (isCustomUploadedPhoto(img)) {
        images.push(img.trim());
      }
    }
  }

  const unique = Array.from(new Set(images));

  // 3. If the user uploaded images, return ONLY what was uploaded!
  if (unique.length > 0) {
    return unique;
  }

  // 4. If no photos were uploaded at all, return the official Brand Logo
  return [BRAND_LOGO];
}
