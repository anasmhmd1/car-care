import { VehicleSize } from '@prisma/client';
import { z } from 'zod';
import { phoneSchema } from '@/lib/validations/phone';
import { BOOKING_TERMS_VERSION } from '@/lib/policies/versions';
import { isValidLocationUrl } from '@/lib/security/url';
import { databaseIdSchema } from '@/lib/validations/database-id';

const optionalDatabaseId = z.preprocess(
  (value) => value === '' || value === null ? undefined : value,
  databaseIdSchema.optional(),
);

const addonIdsSchema = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}, z.array(databaseIdSchema).max(12).refine(
  (ids) => new Set(ids).size === ids.length,
  'لا يمكن تكرار الإضافة نفسها.',
));

export const createBookingSchema = z.object({
  serviceId: databaseIdSchema,
  coverageAreaId: databaseIdSchema,
  vehicleSize: z.nativeEnum(VehicleSize).default(VehicleSize.SEDAN),
  startAt: z.coerce.date().refine((date) => Number.isFinite(date.getTime()), 'موعد الحجز غير صالح.'),
  addonIds: addonIdsSchema,
  vehicleMake: z.string().trim().min(1, 'ماركة السيارة مطلوبة.').max(100),
  vehicleModel: z.string().trim().min(1, 'موديل السيارة مطلوب.').max(100),
  vehicleYear: z.coerce.number().int().min(1990).max(new Date().getFullYear() + 1),
  vehicleColor: z.string().trim().min(1, 'لون السيارة مطلوب.').max(50),
  plateNumber: z.string().trim().max(20).optional().default(''),
  street: z.string().trim().min(1, 'اسم الشارع مطلوب.').max(200),
  buildingNumber: z.string().trim().min(1, 'رقم المبنى أو الفيلا مطلوب.').max(100),
  unitNumber: z.string().trim().max(50).optional().default(''),
  landmark: z.string().trim().max(200).optional().default(''),
  gateInstructions: z.string().trim().max(500).optional().default(''),
  locationUrl: z.string().trim().refine(
    isValidLocationUrl,
    'رابط الموقع يجب أن يبدأ بـ http:// أو https://',
  ).default(''),
  customerNotes: z.string().trim().max(1000).optional().default(''),
  contactName: z.string().trim().min(2).max(200),
  contactPhone: phoneSchema,
  contactWhatsapp: phoneSchema,
  policyAccepted: z.literal('true', { errorMap: () => ({ message: 'يجب الموافقة على سياسة الحجز والإلغاء.' }) }),
  policyVersion: z.literal(BOOKING_TERMS_VERSION).default(BOOKING_TERMS_VERSION),
  acceptedCancellationPolicyId: optionalDatabaseId,
  acceptedCancellationPolicyRevision: z.string().trim().min(1).max(300),
  subscriptionId: optionalDatabaseId,
  useCredit: z.preprocess(
    (value) => value === true || value === 'true' || value === 'on',
    z.boolean(),
  ).default(false),
  vehicleId: optionalDatabaseId,
  addressId: optionalDatabaseId,
});

export const uploadPaymentProofSchema = z.object({
  bookingId: databaseIdSchema,
  paymentMethodId: databaseIdSchema,
  bookingFileId: databaseIdSchema,
  senderName: z.string().trim().min(2, 'اسم المرسل مطلوب.').max(200),
  senderPhoneOrAccount: z.string().trim().min(3, 'رقم الهاتف أو الحساب مطلوب.').max(100),
  referenceNumber: z.string().trim().max(100).optional().default(''),
  amountSubmitted: z.coerce.number().int().positive('المبلغ يجب أن يكون أكبر من صفر.'),
  transferTimestamp: z.coerce.date().refine((date) => Number.isFinite(date.getTime()), 'وقت التحويل غير صالح.'),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UploadPaymentProofInput = z.infer<typeof uploadPaymentProofSchema>;
