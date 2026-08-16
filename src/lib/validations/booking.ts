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
  vehicleMake: z.preprocess(
    (v) => (v === null || v === undefined ? '' : String(v).trim()),
    z.string().max(100).default(''),
  ),
  vehicleModel: z.preprocess(
    (v) => (v === null || v === undefined ? '' : String(v).trim()),
    z.string().max(100).default(''),
  ),
  vehicleYear: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return 2024;
      const num = Number(val);
      return Number.isFinite(num) && num >= 1990 ? num : 2024;
    },
    z.coerce.number().int().min(1990).max(new Date().getFullYear() + 1).default(2024),
  ),
  vehicleColor: z.preprocess(
    (v) => (v === null || v === undefined ? '' : String(v).trim()),
    z.string().max(50).default(''),
  ),
  plateNumber: z.preprocess(
    (v) => (v === null || v === undefined ? '' : String(v).trim()),
    z.string().max(20).default(''),
  ),
  street: z.preprocess(
    (v) => (v === null || v === undefined ? '' : String(v).trim()),
    z.string().max(200).default(''),
  ),
  buildingNumber: z.preprocess(
    (v) => (v === null || v === undefined ? '' : String(v).trim()),
    z.string().max(100).default(''),
  ),
  unitNumber: z.preprocess(
    (v) => (v === null || v === undefined ? '' : String(v).trim()),
    z.string().max(50).default(''),
  ),
  landmark: z.preprocess(
    (v) => (v === null || v === undefined ? '' : String(v).trim()),
    z.string().max(200).default(''),
  ),
  gateInstructions: z.preprocess(
    (v) => (v === null || v === undefined ? '' : String(v).trim()),
    z.string().max(500).default(''),
  ),
  locationUrl: z.preprocess(
    (v) => (v === null || v === undefined ? '' : String(v).trim()),
    z.string().refine(
      isValidLocationUrl,
      'رابط الموقع يجب أن يبدأ بـ http:// أو https://',
    ).default(''),
  ),
  customerNotes: z.preprocess(
    (v) => (v === null || v === undefined ? '' : String(v).trim()),
    z.string().max(1000).default(''),
  ),
  contactName: z.string().trim().min(2, 'الاسم الكامل مطلوب.').max(200),
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
