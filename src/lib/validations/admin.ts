import { z } from 'zod';
import { databaseIdSchema } from '@/lib/validations/database-id';
import { optionalPhoneSchema, phoneSchema } from '@/lib/validations/phone';

// --------------------------------------------------------
// Admin CRUD Schemas
// --------------------------------------------------------

// Service Management
export const serviceSchema = z.object({
  nameAr: z.string().min(1, 'اسم الخدمة بالعربية مطلوب').max(200),
  nameEn: z.string().max(200).optional().default(''),
  slug: z.string().min(1, 'الرابط المختصر مطلوب').regex(/^[a-z0-9\-]+$/, 'الرابط يجب أن يحتوي على حروف إنجليزية صغيرة وأرقام وشرطات فقط'),
  shortDescriptionAr: z.string().min(1, 'الوصف المختصر مطلوب').max(500),
  fullDescriptionAr: z.string().min(1, 'الوصف الكامل مطلوب').max(5000),
  coverImage: z.string().min(1, 'صورة الغلاف مطلوبة'),
  basePrice: z.coerce.number().min(0, 'السعر الأساسي يجب أن يكون صفر أو أكثر'),
  priceType: z.enum(['FIXED', 'STARTS_FROM', 'VARIANT_BASED']).default('FIXED'),
  durationMinutes: z.coerce.number().min(15, 'المدة يجب أن تكون 15 دقيقة على الأقل').default(60),
  slotCount: z.coerce.number().min(1).default(1),
  requiredTeamSize: z.coerce.number().min(1).default(2),
  requiresDeposit: z.coerce.boolean().default(true),
  depositType: z.enum(['FIXED', 'PERCENTAGE']).default('PERCENTAGE'),
  depositValue: z.coerce.number().min(0).default(30),
  requiresFullPrepayment: z.coerce.boolean().default(false),
  active: z.coerce.boolean().default(true),
  bookableOnline: z.coerce.boolean().default(true),
  subscriptionEligible: z.coerce.boolean().default(true),
  minimumBeforePhotos: z.coerce.number().min(0).default(2),
  minimumAfterPhotos: z.coerce.number().min(0).default(2),
});

export const serviceVariantSchema = z.object({
  serviceId: databaseIdSchema,
  vehicleSize: z.enum(['SEDAN', 'CROSSOVER', 'SUV', 'LARGE_SUV']),
  price: z.coerce.number().min(0),
  durationMinutes: z.coerce.number().min(15),
  slotCount: z.coerce.number().min(1).default(1),
  depositValue: z.coerce.number().min(0).optional(),
});

export const serviceAddonSchema = z.object({
  nameAr: z.string().min(1, 'اسم الإضافة مطلوب').max(200),
  nameEn: z.string().max(200).optional().default(''),
  price: z.coerce.number().min(0),
  durationMinutes: z.coerce.number().min(0).default(15),
  slotCount: z.coerce.number().min(0).default(0),
  active: z.coerce.boolean().default(true),
});

// Team Management
export const teamSchema = z.object({
  name: z.string().min(1, 'اسم الفريق مطلوب').max(100),
  branchId: databaseIdSchema,
  leaderId: databaseIdSchema.optional(),
  dailyCapacity: z.coerce.number().min(1, 'السعة اليومية يجب أن تكون 1 على الأقل').default(5),
  active: z.coerce.boolean().default(true),
  assignmentPriority: z.coerce.number().min(1).max(10).default(1),
});

export const teamMemberSchema = z.object({
  teamId: databaseIdSchema,
  userId: databaseIdSchema,
  isLeader: z.coerce.boolean().default(false),
});

// Employee Management
export const employeeSchema = z.object({
  fullName: z.string().min(2, 'الاسم مطلوب').max(100),
  phone: phoneSchema,
  whatsapp: optionalPhoneSchema,
  email: z.string().email().optional().or(z.literal('')),
  password: z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'),
  branchId: databaseIdSchema,
  role: z.enum(['OPERATIONS_MANAGER', 'EMPLOYEE']).default('EMPLOYEE'),
});

// Branch Settings
export const branchSettingsSchema = z.object({
  nameAr: z.string().min(1).max(200),
  nameEn: z.string().max(200).optional().default(''),
  address: z.string().min(1).max(500),
  phone: z.string().min(1).max(20),
  whatsapp: z.string().min(1).max(20),
  slotUnitMinutes: z.coerce.number().min(15).max(240).default(60),
  arrivalWindowMinutes: z.coerce.number().min(0).max(120).default(30),
  travelBufferMinutes: z.coerce.number().min(0).max(120).default(30),
  dailyBookingLimit: z.coerce.number().min(1).max(100).default(20),
  assignmentMode: z.enum(['MANUAL', 'AUTOMATIC']).default('MANUAL'),
});

export const workingHoursSchema = z.object({
  branchId: databaseIdSchema,
  dayOfWeek: z.coerce.number().min(0).max(6),
  isClosed: z.coerce.boolean().default(false),
  openTime: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/).default('16:00'),
  breakStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  breakEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export const blackoutDateSchema = z.object({
  branchId: databaseIdSchema,
  date: z.string().refine((val) => !isNaN(Date.parse(val)), 'التاريخ غير صالح'),
  reason: z.string().max(500).optional().default(''),
});

// Coverage Zone & Area
export const coverageZoneSchema = z.object({
  branchId: databaseIdSchema,
  name: z.string().min(1, 'اسم المنطقة مطلوب').max(200),
  description: z.string().max(500).optional().default(''),
});

export const coverageAreaSchema = z.object({
  zoneId: databaseIdSchema,
  governorate: z.string().min(1).max(200),
  city: z.string().min(1).max(200),
  district: z.string().min(1).max(200),
  compound: z.string().min(1).max(200),
  active: z.coerce.boolean().default(true),
  priority: z.coerce.number().min(1).default(1),
  travelBufferOverride: z.coerce.number().min(0).optional(),
});

export const zoneTravelTimeSchema = z.object({
  fromZoneId: databaseIdSchema,
  toZoneId: databaseIdSchema,
  durationMinutes: z.coerce.number().min(0).max(180).default(30),
});

// Payment Method
export const paymentMethodSchema = z.object({
  branchId: databaseIdSchema,
  name: z.string().min(1, 'اسم وسيلة الدفع مطلوب').max(200),
  type: z.enum(['VODAFONE_CASH', 'INSTAPAY', 'BANK_TRANSFER', 'CASH_DEPOSIT', 'OTHER_MANUAL']),
  accountNumber: z.string().min(1, 'رقم الحساب مطلوب').max(100),
  accountName: z.string().min(1, 'اسم صاحب الحساب مطلوب').max(200),
  instructions: z.string().max(1000).optional().default(''),
  active: z.coerce.boolean().default(true),
  isDefault: z.coerce.boolean().default(false),
});

// Checklist Template
export const checklistTemplateSchema = z.object({
  serviceId: databaseIdSchema,
  stage: z.enum(['BOOKING_REVIEW', 'TEAM_PREPARATION', 'ARRIVAL_INSPECTION', 'SERVICE_EXECUTION', 'CLOSING', 'QUALITY_REVIEW']),
  name: z.string().min(1, 'اسم القائمة مطلوب').max(200),
});

export const checklistItemSchema = z.object({
  templateId: databaseIdSchema,
  labelAr: z.string().min(1, 'التسمية مطلوبة').max(500),
  descriptionAr: z.string().max(1000).optional().default(''),
  required: z.coerce.boolean().default(true),
  requiresPhoto: z.coerce.boolean().default(false),
  requiresNote: z.coerce.boolean().default(false),
  displayOrder: z.coerce.number().min(0).default(0),
  active: z.coerce.boolean().default(true),
});

// Subscription Plan
export const subscriptionPlanSchema = z.object({
  nameAr: z.string().min(1, 'اسم الخطة مطلوب').max(200),
  descriptionAr: z.string().min(1, 'وصف الخطة مطلوب').max(2000),
  price: z.coerce.number().min(0),
  validityDays: z.coerce.number().min(1).default(30),
  visitCount: z.coerce.number().min(1).default(4),
  allowedVehicleCount: z.coerce.number().min(1).default(1),
  active: z.coerce.boolean().default(true),
});

// Customer Vehicle
export const vehicleSchema = z.object({
  make: z.string().min(1, 'ماركة السيارة مطلوبة').max(100),
  model: z.string().min(1, 'موديل السيارة مطلوب').max(100),
  year: z.coerce.number().min(1990).max(2030),
  color: z.string().min(1, 'لون السيارة مطلوب').max(50),
  vehicleSize: z.enum(['SEDAN', 'CROSSOVER', 'SUV', 'LARGE_SUV']).default('SEDAN'),
  plateNumber: z.string().max(20).optional().default(''),
  notes: z.string().max(500).optional().default(''),
  isDefault: z.coerce.boolean().default(false),
});

// Customer Address
export const addressSchema = z.object({
  governorate: z.string().min(1, 'المحافظة مطلوبة').max(200),
  city: z.string().min(1, 'المدينة مطلوبة').max(200),
  district: z.string().min(1, 'المنطقة مطلوبة').max(200),
  compound: z.string().min(1, 'الكمبوند مطلوب').max(200),
  street: z.string().min(1, 'الشارع مطلوب').max(200),
  buildingNumber: z.string().min(1, 'رقم المبنى مطلوب').max(100),
  unitNumber: z.string().max(50).optional().default(''),
  landmark: z.string().max(300).optional().default(''),
  gateInstructions: z.string().max(500).optional().default(''),
  locationUrl: z
    .string()
    .url('رابط الموقع غير صالح.')
    .refine((val) => /^https?:\/\//i.test(val), 'رابط الموقع يجب أن يبدأ بـ http:// أو https://')
    .optional()
    .or(z.literal(''))
    .default(''),
  isDefault: z.coerce.boolean().default(false),
});

// Profile Update
export const profileUpdateSchema = z.object({
  fullName: z.string().min(2).max(100),
  phone: phoneSchema,
  whatsapp: optionalPhoneSchema,
  email: z.string().email().optional().or(z.literal('')),
});

// Owner customer account management. The role is deliberately not part of
// this payload: customer account administration must never be able to turn a
// customer into a workforce or owner account.
export const ownerCustomerAccountSchema = z.object({
  customerId: databaseIdSchema,
  fullName: z.string().min(2).max(100),
  phone: phoneSchema,
  whatsapp: optionalPhoneSchema,
  email: z.string().email().optional().or(z.literal('')).default(''),
  active: z.enum(['true', 'false']).transform((value) => value === 'true'),
  temporaryPassword: z
    .string()
    .max(128)
    .optional()
    .default('')
    .refine((value) => value.length === 0 || value.length >= 12, {
      message: 'كلمة المرور المؤقتة يجب أن تتكون من 12 حرفًا على الأقل',
    }),
});

export type ServiceInput = z.infer<typeof serviceSchema>;
export type TeamInput = z.infer<typeof teamSchema>;
export type EmployeeInput = z.infer<typeof employeeSchema>;
export type VehicleInput = z.infer<typeof vehicleSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type OwnerCustomerAccountInput = z.infer<typeof ownerCustomerAccountSchema>;
