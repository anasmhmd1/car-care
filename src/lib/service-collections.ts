import { z } from 'zod';

export const serviceCollectionSchema = z.object({
  id: z.string().min(1),
  titleAr: z.string().trim().min(2, 'عنوان الكوليكشن مطلوب.').max(120, 'العنوان طويل جداً.'),
  badge: z.string().trim().default(''),
  descriptionAr: z.string().trim().min(5, 'الوصف مطلوب.').max(500, 'الوصف طويل جداً.'),
  image: z.string().trim().min(1, 'صورة الكوليكشن مطلوبة.'),
  serviceIds: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  priority: z.number().int().default(1),
});

export const serviceCollectionsListSchema = z.array(serviceCollectionSchema);

export type ServiceCollection = z.infer<typeof serviceCollectionSchema>;

export const DEFAULT_SERVICE_COLLECTIONS: ServiceCollection[] = [
  {
    id: 'col_exterior',
    titleAr: 'العناية الخارجية بالدهان',
    badge: '',
    descriptionAr: 'غسيل جاف ممتاز من بريق يعيد للمعان الدهان بريقه مع طبقة واكس واقية تمنع خدوش الغسيل التقليدي.',
    image: '/images/bareeq_exterior_care.png',
    serviceIds: ['seed-service-essential', 'seed-service-complete', 'seed-service-vip'],
    active: true,
    priority: 1,
  },
  {
    id: 'col_interior',
    titleAr: 'العناية الداخلية وتنظيف الجلد',
    badge: '',
    descriptionAr: 'منتجات ترطيب وتنظيف متخصصة تمنع جفاف وتشققات الجلد والتابلوه بدون روائح حادة.',
    image: '/images/bareeq_interior_care.png',
    serviceIds: ['seed-service-interior', 'seed-service-upholstery', 'seed-service-roof', 'seed-service-complete'],
    active: true,
    priority: 2,
  },
  {
    id: 'col_engine',
    titleAr: 'تنظيف حجرة الموتور بعناية',
    badge: '',
    descriptionAr: 'تنظيف آمن ومدروس من بريق يمنع تعريض المكونات والدوائر الكهربائية للمياه أو المواد الضارة.',
    image: '/images/bareeq_engine_care.png',
    serviceIds: ['seed-service-engine', 'seed-service-vip'],
    active: true,
    priority: 3,
  },
];

export const PRESET_COLLECTION_IMAGES = [
  { label: 'عناية خارجية فاخرة', url: '/images/bareeq_exterior_care.png' },
  { label: 'عناية داخلية وجلد', url: '/images/bareeq_interior_care.png' },
  { label: 'حجرة الموتور والمحرك', url: '/images/bareeq_engine_care.png' },
  { label: 'السيارة الشاملة (Hero)', url: '/images/bareeq_hero_car.png' },
  { label: 'سيارة التشغيل المتنقلة', url: '/images/bareeq_banner_van.png' },
  { label: 'منتجات بريق الـ 9', url: '/images/bareeq_dry_products_hq.jpg' },
];

/** Read and validate collections stored in BrandSettings or homepageContent */
export function readServiceCollections(value: unknown): ServiceCollection[] {
  let targetArray: unknown = value;

  if (value && typeof value === 'object' && !Array.isArray(value) && 'serviceCollections' in value) {
    targetArray = (value as Record<string, unknown>).serviceCollections;
  }

  if (!targetArray || !Array.isArray(targetArray)) {
    return DEFAULT_SERVICE_COLLECTIONS;
  }

  const parsed = serviceCollectionsListSchema.safeParse(targetArray);
  if (!parsed.success || parsed.data.length === 0) {
    return DEFAULT_SERVICE_COLLECTIONS;
  }

  return parsed.data.sort((a, b) => a.priority - b.priority);
}
