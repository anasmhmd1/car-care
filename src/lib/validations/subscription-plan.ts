import { z } from 'zod';
import { databaseIdSchema } from '@/lib/validations/database-id';

export type SubscriptionPlanRules = {
  [key: string]: string | number | boolean | null | SubscriptionPlanRules | SubscriptionPlanRulesValue[];
};

type SubscriptionPlanRulesValue =
  | string
  | number
  | boolean
  | null
  | SubscriptionPlanRules
  | SubscriptionPlanRulesValue[];

const reasonSchema = z
  .string()
  .trim()
  .min(3, 'اكتب سببًا واضحًا للعملية.')
  .max(500, 'سبب العملية طويل جدًا.');

const idListSchema = z
  .array(databaseIdSchema)
  .min(1, 'اختر عنصرًا واحدًا على الأقل.')
  .max(100, 'عدد العناصر المحددة أكبر من الحد المسموح.')
  .transform((values) => [...new Set(values)]);

const serviceQuotaSchema = z.object({
  serviceId: databaseIdSchema,
  visitQuota: z.coerce
    .number()
    .int('رصيد كل خدمة يجب أن يكون رقمًا صحيحًا.')
    .min(1, 'رصيد كل خدمة زيارة واحدة على الأقل.')
    .max(10_000, 'رصيد الخدمة أكبر من الحد المسموح.'),
});

const checkboxSchema = z.preprocess(
  (value) => value === true || value === 'true' || value === 'on',
  z.boolean(),
);

function isRulesObject(value: unknown): value is SubscriptionPlanRules {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const rulesTextSchema = z
  .string()
  .trim()
  .max(20_000, 'قواعد الخطة أكبر من الحد المسموح.')
  .transform((value, context): SubscriptionPlanRules | null => {
    if (!value) return null;

    try {
      const parsed: unknown = JSON.parse(value);
      if (!isRulesObject(parsed)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'قواعد الخطة يجب أن تكون كائن JSON يبدأ بـ { وينتهي بـ }.',
        });
        return z.NEVER;
      }
      return parsed;
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'صيغة JSON في قواعد الخطة غير صحيحة.',
      });
      return z.NEVER;
    }
  });

const planFields = {
  nameAr: z
    .string()
    .trim()
    .min(2, 'اسم الخطة قصير جدًا.')
    .max(120, 'اسم الخطة طويل جدًا.'),
  descriptionAr: z
    .string()
    .trim()
    .min(3, 'اكتب وصفًا واضحًا للخطة.')
    .max(2_000, 'وصف الخطة طويل جدًا.'),
  price: z.coerce
    .number()
    .int('السعر يجب أن يكون رقمًا صحيحًا.')
    .min(1, 'السعر يجب أن يكون أكبر من صفر.')
    .max(10_000_000, 'السعر أكبر من الحد المسموح.'),
  validityDays: z.coerce
    .number()
    .int('مدة الصلاحية يجب أن تكون عدد أيام صحيحًا.')
    .min(1, 'مدة الصلاحية يوم واحد على الأقل.')
    .max(3_650, 'مدة الصلاحية أكبر من الحد المسموح.'),
  visitCount: z.coerce
    .number()
    .int('عدد الزيارات يجب أن يكون رقمًا صحيحًا.')
    .min(1, 'الخطة تحتاج زيارة واحدة على الأقل.')
    .max(10_000, 'عدد الزيارات أكبر من الحد المسموح.'),
  allowedVehicleCount: z.coerce
    .number()
    .int('عدد السيارات يجب أن يكون رقمًا صحيحًا.')
    .min(1, 'يجب السماح بسيارة واحدة على الأقل.')
    .max(50, 'عدد السيارات أكبر من الحد المسموح.'),
  freezeAllowed: checkboxSchema,
  maxFreezeDays: z.coerce
    .number()
    .int('الحد الأقصى للتجميد يجب أن يكون رقمًا صحيحًا.')
    .min(0, 'أيام التجميد لا يمكن أن تكون سالبة.')
    .max(3_650, 'مدة التجميد أكبر من الحد المسموح.'),
  rules: rulesTextSchema,
  serviceIds: idListSchema,
  serviceQuotas: z.array(serviceQuotaSchema).max(100).default([]),
  branchIds: idListSchema,
  active: checkboxSchema,
  reason: z.string().trim().max(500, 'سبب العملية طويل جدًا.').optional().default('إدارة خطط الاشتراكات'),
};

function validateFreezePolicy(
  input: { freezeAllowed: boolean; maxFreezeDays: number; validityDays: number },
  context: z.RefinementCtx,
): void {
  if (input.freezeAllowed && input.maxFreezeDays < 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxFreezeDays'],
      message: 'حدد يوم تجميد واحدًا على الأقل عند السماح بالتجميد.',
    });
  }
  if (input.freezeAllowed && input.maxFreezeDays > input.validityDays) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxFreezeDays'],
      message: 'مدة التجميد لا يمكن أن تتجاوز صلاحية الخطة.',
    });
  }
}

function validateServiceQuotas(
  input: {
    serviceIds: string[];
    serviceQuotas: Array<{ serviceId: string; visitQuota: number }>;
    visitCount: number;
  },
  context: z.RefinementCtx,
): void {
  if (input.serviceQuotas.length === 0) return;

  const quotaIds = input.serviceQuotas.map(({ serviceId }) => serviceId);
  if (new Set(quotaIds).size !== quotaIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceQuotas'],
      message: 'لا تكرر رصيد الخدمة داخل الخطة.',
    });
  }
  if (input.serviceQuotas.some(({ serviceId }) => !input.serviceIds.includes(serviceId))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceQuotas'],
      message: 'يمكن تحديد رصيد للخدمات المختارة داخل الخطة فقط.',
    });
  }
  if (input.serviceQuotas.length !== input.serviceIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['serviceQuotas'],
      message: 'حدّد رصيدًا لكل خدمة مختارة أو اترك جميع الأرصدة فارغة لاستخدام رصيد مشترك.',
    });
    return;
  }
  const quotaTotal = input.serviceQuotas.reduce((total, item) => total + item.visitQuota, 0);
  if (quotaTotal < input.visitCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['visitCount'],
      message: 'مجموع أقصى زيارات للخدمات يجب ألا يقل عن إجمالي زيارات الباقة.',
    });
  }
}

function normalizeServiceQuotas(input: {
  serviceIds: string[];
  serviceQuotas: Array<{ serviceId: string; visitQuota: number }>;
}) {
  return input.serviceIds.map((serviceId) => ({
    serviceId,
    visitQuota: input.serviceQuotas.find((quota) => quota.serviceId === serviceId)?.visitQuota ?? null,
  }));
}

const createOrUpdatePlanSchema = z
  .object(planFields)
  .superRefine((input, context) => {
    validateFreezePolicy(input, context);
    validateServiceQuotas(input, context);
  })
  .transform((input) => ({
    ...input,
    maxFreezeDays: input.freezeAllowed ? input.maxFreezeDays : 0,
    serviceQuotas: normalizeServiceQuotas(input),
  }));

export const createSubscriptionPlanSchema = createOrUpdatePlanSchema;

export const updateSubscriptionPlanSchema = z
  .object({
    planId: databaseIdSchema,
    ...planFields,
  })
  .superRefine((input, context) => {
    validateFreezePolicy(input, context);
    validateServiceQuotas(input, context);
  })
  .transform((input) => ({
    ...input,
    maxFreezeDays: input.freezeAllowed ? input.maxFreezeDays : 0,
    serviceQuotas: normalizeServiceQuotas(input),
  }));

export const retireSubscriptionPlanSchema = z
  .object({
    planId: databaseIdSchema,
    mode: z.enum(['DEACTIVATE', 'DELETE_UNLINKED']),
    reason: reasonSchema,
    confirmation: z.string().trim().max(120).optional().default(''),
  })
  .superRefine((input, context) => {
    if (input.mode === 'DELETE_UNLINKED' && !input.confirmation) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmation'],
        message: 'اكتب اسم الخطة لتأكيد الحذف النهائي.',
      });
    }
  });

export type CreateSubscriptionPlanInput = z.infer<typeof createSubscriptionPlanSchema>;
export type UpdateSubscriptionPlanInput = z.infer<typeof updateSubscriptionPlanSchema>;
export type RetireSubscriptionPlanInput = z.infer<typeof retireSubscriptionPlanSchema>;

export function subscriptionPlanFormValues(formData: FormData) {
  const serviceIds = formData.getAll('serviceIds').filter((value): value is string => typeof value === 'string');
  const serviceQuotas = [...new Set(serviceIds)].flatMap((serviceId) => {
    const visitQuota = String(formData.get(`serviceQuota:${serviceId}`) ?? '').trim();
    return visitQuota ? [{ serviceId, visitQuota }] : [];
  });

  return {
    planId: formData.get('planId'),
    nameAr: formData.get('nameAr'),
    descriptionAr: formData.get('descriptionAr'),
    price: formData.get('price'),
    validityDays: formData.get('validityDays'),
    visitCount: formData.get('visitCount'),
    allowedVehicleCount: formData.get('allowedVehicleCount'),
    freezeAllowed: formData.get('freezeAllowed'),
    maxFreezeDays: formData.get('maxFreezeDays'),
    rules: formData.get('rules') || '{}',
    serviceIds,
    serviceQuotas,
    branchIds: formData.getAll('branchIds'),
    active: formData.get('active'),
    reason: (formData.get('reason') as string)?.trim() || (formData.get('planId') ? 'تحديث خطة الاشتراك' : 'إنشاء خطة اشتراك جديدة'),
  };
}

export function retireSubscriptionPlanFormValues(formData: FormData) {
  return {
    planId: formData.get('planId'),
    mode: formData.get('mode'),
    reason: formData.get('reason'),
    confirmation: formData.get('confirmation') ?? '',
  };
}
