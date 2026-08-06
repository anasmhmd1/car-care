import { z } from 'zod';
import { optionalPhoneSchema, phoneSchema } from '@/lib/validations/phone';

// --------------------------------------------------------
// Auth Schemas
// --------------------------------------------------------

export const loginSchema = z.object({
  phone: phoneSchema,
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
