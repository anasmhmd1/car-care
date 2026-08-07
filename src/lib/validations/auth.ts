import { z } from 'zod';
import { isCanonicalPhone, normalizePhone, optionalPhoneSchema, phoneSchema } from '@/lib/validations/phone';

// --------------------------------------------------------
// Auth Schemas
// --------------------------------------------------------

export const loginIdentifierSchema = z
  .string({ required_error: 'رقم الهاتف أو البريد الإلكتروني مطلوب' })
  .trim()
  .min(1, 'رقم الهاتف أو البريد الإلكتروني مطلوب')
  .refine(
    (val) => {
      if (val.includes('@')) {
        return z.string().email().safeParse(val).success;
      }
      const normalized = normalizePhone(val);
      return isCanonicalPhone(normalized);
    },
    { message: 'يرجى إدخال رقم هاتف صحيح أو بريد إلكتروني صالح' }
  );

export const loginSchema = z.object({
  phone: loginIdentifierSchema,
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

export const registerSchema = z.object({
  fullName: z.string().min(2, 'الاسم الكامل مطلوب (حرفين على الأقل)').max(100),
  phone: phoneSchema,
  whatsapp: optionalPhoneSchema,
  email: z.string().email('البريد الإلكتروني غير صالح').optional().or(z.literal('')),
  password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
  policyAgreement: z.literal('on', { errorMap: () => ({ message: 'يرجى الموافقة على السياسات' }) }),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'كلمة المرور الحالية مطلوبة'),
  newPassword: z.string().min(8, 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل'),
  confirmPassword: z.string().min(1, 'تأكيد كلمة المرور مطلوب'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirmPassword'],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
