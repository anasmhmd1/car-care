/**
 * Resolves high-resolution realistic photographic assets for services,
 * ensuring consistency between catalog cards and service detail pages.
 */

export function getServiceRealImage(slug: string, coverImage?: string | null): string {
  if (coverImage && !coverImage.endsWith('.svg') && !coverImage.includes('/services/')) {
    return coverImage;
  }
  const s = (slug || '').toLowerCase();
  if (s.includes('exterior') || s.includes('khariji') || s.includes('outside') || s.includes('أساسي') || s.includes('خارجي')) {
    return '/images/bareeq_exterior_care.png';
  }
  if (s.includes('interior') || s.includes('dakhili') || s.includes('inside') || s.includes('مكثفة') || s.includes('داخلي') || s.includes('فرش')) {
    return '/images/bareeq_interior_care.png';
  }
  if (s.includes('engine') || s.includes('motor') || s.includes('موتور') || s.includes('محرك')) {
    return '/images/bareeq_engine_care.png';
  }
  if (s.includes('full') || s.includes('shamil') || s.includes('شامل') || s.includes('vip') || s.includes('ملكية')) {
    return '/images/bareeq_hero_car.png';
  }
  if (s.includes('headliner') || s.includes('roof') || s.includes('سقف')) {
    return '/images/bareeq_interior_care.png';
  }
  return '/images/bareeq_exterior_care.png';
}

export function getServiceGalleryImages(
  slug: string,
  coverImage?: string | null,
  rawGallery?: string[] | null,
): string[] {
  const primaryCover = getServiceRealImage(slug, coverImage);
  const cleanRaw = (rawGallery || [])
    .filter((img): img is string => typeof img === 'string' && img.length > 0 && !img.endsWith('.svg'))
    .map((img) => getServiceRealImage(slug, img));

  const s = (slug || '').toLowerCase();
  let defaultGallery: string[] = [];
  if (s.includes('exterior') || s.includes('خارجي') || s.includes('أساسي')) {
    defaultGallery = ['/images/bareeq_hero_car.png', '/images/bareeq_reference_hero.png'];
  } else if (s.includes('interior') || s.includes('داخلي') || s.includes('سقف') || s.includes('فرش') || s.includes('مكثفة')) {
    defaultGallery = ['/images/bareeq_hero_car.png', '/images/bareeq_dry_product_new.jpg'];
  } else if (s.includes('engine') || s.includes('موتور') || s.includes('محرك')) {
    defaultGallery = ['/images/bareeq_hero_car.png', '/images/bareeq_exterior_care.png'];
  } else {
    defaultGallery = ['/images/bareeq_exterior_care.png', '/images/bareeq_interior_care.png'];
  }

  const combined = [primaryCover, ...cleanRaw, ...defaultGallery];
  return Array.from(new Set(combined));
}
