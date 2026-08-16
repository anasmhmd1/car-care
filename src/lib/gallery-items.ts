import { z } from 'zod';

export const galleryItemSchema = z.object({
  id: z.string().min(1),
  titleAr: z.string().trim().min(2, 'عنوان أو اسم الصورة مطلوب.').max(120, 'العنوان طويل جداً.'),
  image: z.string().trim().min(1, 'رابط الصورة مطلوب.'),
  altAr: z.string().trim().default(''),
  active: z.boolean().default(true),
  priority: z.number().int().default(1),
});

export const galleryItemsListSchema = z.array(galleryItemSchema);

export type GalleryItem = z.infer<typeof galleryItemSchema>;

export const DEFAULT_GALLERY_ITEMS: GalleryItem[] = [
  {
    id: 'gal_1',
    titleAr: 'لمعان دهان بتركيبة الواكس من بريق',
    image: '/images/bareeq_hero_car.png',
    altAr: 'لمعان دهان السيارة الخارجي من بريق',
    active: true,
    priority: 1,
  },
  {
    id: 'gal_2',
    titleAr: 'ترطيب وتطهير المقاعد الجلدية',
    image: '/images/bareeq_interior_care.png',
    altAr: 'تنظيف وترطيب جلد السيارة من بريق',
    active: true,
    priority: 2,
  },
  {
    id: 'gal_3',
    titleAr: 'تنظيف آمن لحجرة الموتور',
    image: '/images/bareeq_engine_care.png',
    altAr: 'تنظيف حجرة المحرك',
    active: true,
    priority: 3,
  },
  {
    id: 'gal_4',
    titleAr: 'منتجات بريق الـ 9 المتخصصة',
    image: '/images/bareeq_dry_products_hq.jpg',
    altAr: 'منتجات بريق التسعة',
    active: true,
    priority: 4,
  },
  {
    id: 'gal_5',
    titleAr: 'تلميع وحماية الجنوط والفرامل',
    image: '/images/bareeq_exterior_care.png',
    altAr: 'تلميع الجنوط والإطارات',
    active: true,
    priority: 5,
  },
  {
    id: 'gal_6',
    titleAr: 'وحدات التجهيز الذاتي بالكمبوند',
    image: '/images/bareeq_banner_van.png',
    altAr: 'سيارة تشغيل بريق المتنقلة',
    active: true,
    priority: 6,
  },
];

export const PRESET_GALLERY_IMAGES = [
  { label: 'سيارة بريق الفاخرة (Hero Car)', url: '/images/bareeq_hero_car.png' },
  { label: 'عناية داخلية وجلد فاخر', url: '/images/bareeq_interior_care.png' },
  { label: 'حجرة المحرك والموتور', url: '/images/bareeq_engine_care.png' },
  { label: 'عناية خارجية ودهان وجنوط', url: '/images/bareeq_exterior_care.png' },
  { label: 'مجموعة منتجات بريق الـ 9', url: '/images/bareeq_dry_products_hq.jpg' },
  { label: 'سيارة التشغيل المتنقلة', url: '/images/bareeq_banner_van.png' },
  { label: 'حقيبة ومعدات بريق الكاملة', url: '/images/bareeq_hero_van_new.jpg' },
];

/** Read and validate gallery items stored in BrandSettings homepageContent */
export function readGalleryItems(value: unknown): GalleryItem[] {
  let targetArray: unknown = value;

  if (value && typeof value === 'object' && !Array.isArray(value) && 'gallery' in value) {
    targetArray = (value as Record<string, unknown>).gallery;
  }

  if (!targetArray || !Array.isArray(targetArray)) {
    return DEFAULT_GALLERY_ITEMS;
  }

  const parsed = galleryItemsListSchema.safeParse(targetArray);
  if (!parsed.success || parsed.data.length === 0) {
    return DEFAULT_GALLERY_ITEMS;
  }

  return parsed.data.sort((a, b) => a.priority - b.priority);
}
