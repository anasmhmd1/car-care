import { z } from 'zod';

const copyLine = z.string().trim().min(1).max(240);
const copyParagraph = z.string().trim().min(1).max(1_200);

/**
 * FAQ data is kept as JSON in BrandSettings. Keep its runtime contract next to
 * the other owner-managed public content so every write is validated before it
 * can reach either public FAQ surface.
 */
export const faqItemSchema = z.object({
  q: z.string().trim().min(1, 'السؤال مطلوب.').max(240, 'السؤال طويل جدًا.'),
  a: z.string().trim().min(1, 'الإجابة مطلوبة.').max(1_200, 'الإجابة طويلة جدًا.'),
});

export const faqListSchema = z.array(faqItemSchema)
  .min(1, 'أضف سؤالًا واحدًا على الأقل.')
  .max(30, 'يمكن نشر 30 سؤالًا كحد أقصى.');

export type FaqItem = z.infer<typeof faqItemSchema>;

/**
 * The editorial fields that may be changed by an owner without allowing the
 * public page to become an arbitrary HTML surface. The landing page renders
 * these values as text, never with `dangerouslySetInnerHTML`.
 */
export const homepageContentSchema = z.object({
  heroEyebrow: copyLine,
  heroTitle: copyLine,
  heroAccent: copyLine,
  heroDescription: copyParagraph,
  heroPrimaryCta: copyLine,
  heroSecondaryCta: copyLine,
  valueTitle: copyLine,
  whyEyebrow: copyLine,
  whyTitle: copyLine,
  whyDescription: copyParagraph,
  stepsEyebrow: copyLine,
  stepsTitle: copyLine,
  servicesEyebrow: copyLine,
  servicesTitle: copyLine,
  plansEyebrow: copyLine,
  plansTitle: copyLine,
  testimonialsEyebrow: copyLine,
  testimonialsTitle: copyLine,
  coverageEyebrow: copyLine,
  coverageTitle: copyLine,
  contactEyebrow: copyLine,
  contactTitle: copyLine,
  contactDescription: copyParagraph,
  closingTitle: copyLine,
  closingDescription: copyParagraph,
});

export type HomepageContent = z.infer<typeof homepageContentSchema>;

export const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
  heroEyebrow: 'العناية المتنقلة الفاخرة الأولى لسيارتك أينما كنت',
  heroTitle: 'عناية متنقلة فاخرة بسيارتك في',
  heroAccent: 'المكان والموعد المناسبين لك',
  heroDescription: 'بريق تقدم خدمة عناية احترافية متنقلة باستخدام مواد مخصصة لكل جزء من السيارة، مع حجز منظم وفريق تشغيل محترف وصور قبل وبعد الخدمة.',
  heroPrimaryCta: 'احجز خدمتك الآن',
  heroSecondaryCta: 'استعرض باقات الاشتراكات',
  valueTitle: 'مزايا خدمة بريق المتنقلة',
  whyEyebrow: 'لماذا بريق',
  whyTitle: 'تفاصيل صغيرة تصنع فرقًا واضحًا',
  whyDescription: 'من الحجز إلى تسليم السيارة، كل خطوة مصممة لتكون واضحة وموثقة ومريحة.',
  stepsEyebrow: 'كيف يتم الحجز',
  stepsTitle: 'احجز في دقائق واترك التنفيذ علينا',
  servicesEyebrow: 'خدماتنا',
  servicesTitle: 'اختر العناية المناسبة لسيارتك',
  plansEyebrow: 'الزيارات الدورية',
  plansTitle: 'باقات الاشتراكات والزيارات المتبقية',
  testimonialsEyebrow: 'تجارب حقيقية',
  testimonialsTitle: 'ماذا يقول عملاء بريق',
  coverageEyebrow: 'مناطق الخدمة الحالية',
  coverageTitle: 'مناطق التغطية المتاحة الآن',
  contactEyebrow: 'تواصل مباشر',
  contactTitle: 'هل تحتاج مساعدة قبل الحجز؟',
  contactDescription: 'تواصل مع الفرع النشط للاستفسار عن الخدمة المناسبة والمناطق أو حالة حجزك.',
  closingTitle: 'اختر الخدمة المناسبة واترك نظام بريق ينظم باقي التجربة',
  closingDescription: 'احجز الآن في دقائق معدودة وتابع حالة فريقك وصور قبل وبعد الخدمة مباشرة من حسابك.',
};

/** Returns safe defaults when legacy or malformed JSON is present in storage. */
export function readHomepageContent(value: unknown): HomepageContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_HOMEPAGE_CONTENT;
  }

  const partial = homepageContentSchema.partial().safeParse(value);
  if (!partial.success) return DEFAULT_HOMEPAGE_CONTENT;

  return {
    ...DEFAULT_HOMEPAGE_CONTENT,
    ...partial.data,
  };
}
