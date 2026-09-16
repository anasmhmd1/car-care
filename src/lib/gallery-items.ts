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
    titleAr: 'لمعان دهان بتركيبة الواكس من كار كير',
    image: '/images/car_care_paint_gloss.jpg',
    altAr: 'لمعان دهان السيارة الخارجي من كار كير',
    active: true,
    priority: 1,
  },
  {
    id: 'gal_2',
    titleAr: 'ترطيب وتطهير المقاعد الجلدية',
    image: '/images/car_care_interior.jpg',
    altAr: 'تنظيف وترطيب جلد السيارة من كار كير',
    active: true,
    priority: 2,
  },
  {
    id: 'gal_3',
    titleAr: 'تنظيف آمن لحجرة الموتور',
    image: '/images/car_care_engine.jpg',
    altAr: 'تنظيف حجرة المحرك من كار كير',
    active: true,
    priority: 3,
  },
  {
    id: 'gal_4',
    titleAr: 'منتجات كار كير المتخصصة',
    image: '/images/car_care_products_banner.jpg',
    altAr: 'منتجات كار كير الرسمية',
    active: true,
    priority: 4,
  },
  {
    id: 'gal_5',
    titleAr: 'تلميع وحماية الجنوط والفرامل',
    image: '/images/car_care_wheel.jpg',
    altAr: 'تلميع الجنوط والإطارات وحماية الفرامل',
    active: true,
    priority: 5,
  },
  {
    id: 'gal_6',
    titleAr: 'وحدات التجهيز الذاتي بالكمبوند',
    image: '/images/car_care_van_banner.jpg',
    altAr: 'سيارة تشغيل كار كير المتنقلة',
    active: true,
    priority: 6,
  },
];

export const PRESET_GALLERY_IMAGES = [
  { label: 'اللمعان الفائق للدهان', url: '/images/car_care_paint_gloss.jpg' },
  { label: 'عناية داخلية وجلد فاخر', url: '/images/car_care_interior.jpg' },
  { label: 'حجرة المحرك والموتور', url: '/images/car_care_engine.jpg' },
  { label: 'تلميع وحماية الجنوط', url: '/images/car_care_wheel.jpg' },
  { label: 'عناية خارجية فائقة', url: '/images/car_care_exterior.jpg' },
  { label: 'مجموعة منتجات كار كير', url: '/images/car_care_products_banner.jpg' },
  { label: 'سيارة التشغيل المتنقلة', url: '/images/car_care_van_banner.jpg' },
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
