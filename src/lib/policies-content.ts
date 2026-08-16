import { z } from 'zod';

export const policySectionSchema = z.object({
  title: z.string().trim().min(1, 'عنوان البند مطلوب.'),
  content: z.string().trim().min(1, 'نص البند مطلوب.'),
});

export const policiesContentSchema = z.object({
  termsTitle: z.string().trim().default('شروط وسياسة الاستخدام'),
  termsSections: z.array(policySectionSchema).default([]),
  privacyTitle: z.string().trim().default('سياسة الخصوصية وحماية البيانات'),
  privacySections: z.array(policySectionSchema).default([]),
});

export type PoliciesContent = z.infer<typeof policiesContentSchema>;
export type PolicySection = z.infer<typeof policySectionSchema>;

export const DEFAULT_POLICIES_CONTENT: PoliciesContent = {
  termsTitle: 'شروط وسياسة الاستخدام',
  termsSections: [
    {
      title: '1. تأكيد الموعد والعربون',
      content: 'يصبح الحجز مؤكدًا بعد مراجعة إثبات التحويل عبر وسيلة الدفع المختارة واعتماده من المشرف المختص.',
    },
    {
      title: '2. مهلة حجز الموعد وتجهيز الموقع',
      content: 'يحتفظ النظام بالموعد المختار أثناء إرسال الطلب. يرجى التأكد من توفير تصريح الدخول ومساحة كافية للسيارة وفريق التشغيل.',
    },
    {
      title: '3. سياسة الإلغاء وتعديل المواعيد',
      content: 'يمكن تعديل أو إلغاء الموعد قبل بدء تحرك الفريق وفق السياسة المعتمدة، مع حفظ مستحقات العميل كرصيد محفظة لاستخدامه في حجز قادم.',
    },
  ],
  privacyTitle: 'سياسة الخصوصية وحماية البيانات',
  privacySections: [
    {
      title: '1. استخدام بيانات العميل',
      content: 'تستخدم بيانات الاسم، رقم الهاتف، الموقع، ورقم الواتساب حصرياً لتنفيذ خدمة بريق والتواصل المباشر بشأن الحجوزات وإشعارات المواعيد، ولا يتم مشاركتها مع أي أطراف تسويقية خارجية.',
    },
    {
      title: '2. خصوصية الصور وإثباتات التحويل',
      content: 'تُخزن صور إثبات التحويل وصور التوثيق قبل التنفيذ وبعده في مساحة مشفرة خاصة، وتكون متاحة للعميل وفريق التشغيل المصرح له فقط. ولا تُنشر أي صورة في المعرض العام إلا بعد موافقة العميل الصريحة.',
    },
  ],
};

export function readPoliciesContent(value: unknown): PoliciesContent {
  let target: unknown = value;
  if (value && typeof value === 'object' && !Array.isArray(value) && 'policies' in value) {
    target = (value as Record<string, unknown>).policies;
  }

  if (!target || typeof target !== 'object') {
    return DEFAULT_POLICIES_CONTENT;
  }

  const parsed = policiesContentSchema.safeParse(target);
  if (!parsed.success) {
    return DEFAULT_POLICIES_CONTENT;
  }

  return {
    termsTitle: parsed.data.termsTitle || DEFAULT_POLICIES_CONTENT.termsTitle,
    termsSections: parsed.data.termsSections.length > 0 ? parsed.data.termsSections : DEFAULT_POLICIES_CONTENT.termsSections,
    privacyTitle: parsed.data.privacyTitle || DEFAULT_POLICIES_CONTENT.privacyTitle,
    privacySections: parsed.data.privacySections.length > 0 ? parsed.data.privacySections : DEFAULT_POLICIES_CONTENT.privacySections,
  };
}
