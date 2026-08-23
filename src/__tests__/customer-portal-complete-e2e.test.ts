import { describe, expect, it } from 'vitest';
import {
  BookingStatus,
  VehicleSize,
} from '@prisma/client';
import {
  getCustomerFacingStatusLabel,
} from '@/lib/engine/state-machine';
import {
  createBookingSchema,
} from '@/lib/validations/booking';
import {
  vehicleSchema,
  addressSchema,
  profileUpdateSchema,
} from '@/lib/validations/admin';
import {
  requestCancellationSchema,
  requestRescheduleSchema,
  createComplaintSchema,
} from '@/lib/validations/operations';
import {
  calculateBookingQuote,
} from '@/lib/engine/pricing';
import { BOOKING_TERMS_VERSION } from '@/lib/policies/versions';
import { isValidLocationUrl } from '@/lib/security/url';

describe('Customer Portal (بوابة وحساب العميل) Complete E2E & Logical Test Suite', () => {

  // =========================================================================
  // 1. Booking Creation & Validation (إنشاء الحجز والتحقق من المدخلات)
  // =========================================================================
  describe('1. Booking Creation, Policy Consent & Addons Selection', () => {
    it('validates comprehensive booking creation with vehicle details, address, and policy acceptance', () => {
      const validBooking = createBookingSchema.safeParse({
        serviceId: '12345678-1234-1234-1234-123456789abc',
        coverageAreaId: '87654321-4321-4321-4321-cba987654321',
        vehicleSize: VehicleSize.SEDAN,
        startAt: '2026-08-25T14:00:00Z',
        addonIds: ['addon-1234-5678-90ab'],
        vehicleMake: 'BMW',
        vehicleModel: '320i',
        vehicleYear: 2023,
        vehicleColor: 'أبيض لؤلؤي',
        plateNumber: 'س ص ع 5678',
        street: 'شارع التسعين الجنوبي',
        buildingNumber: 'عمارة 45',
        unitNumber: 'شقة 4',
        landmark: 'أمام كمبوند ميفيدا',
        gateInstructions: 'الدخول من بوابة 1 والتواصل مع العميل',
        locationUrl: 'https://maps.google.com/?q=30.0123,31.4567',
        customerNotes: 'يرجى التركيز على تنظيف فتحات التكييف والكونسول',
        contactName: 'كريم محمود',
        contactPhone: '01011111111',
        contactWhatsapp: '01011111111',
        policyAccepted: 'true',
        policyVersion: BOOKING_TERMS_VERSION,
        acceptedCancellationPolicyRevision: 'standard-cancellation-v1',
      });
      expect(validBooking.success).toBe(true);
    });

    it('rejects booking creation if terms and cancellation policy are not accepted', () => {
      const unacceptedPolicy = createBookingSchema.safeParse({
        serviceId: '12345678-1234-1234-1234-123456789abc',
        coverageAreaId: '87654321-4321-4321-4321-cba987654321',
        startAt: '2026-08-25T14:00:00Z',
        contactName: 'كريم محمود',
        contactPhone: '01011111111',
        contactWhatsapp: '01011111111',
        policyAccepted: 'false', // Refused policy
        acceptedCancellationPolicyRevision: 'v1',
      });
      expect(unacceptedPolicy.success).toBe(false);
    });

    it('rejects duplicate addon IDs in booking payload', () => {
      const duplicateAddons = createBookingSchema.safeParse({
        serviceId: '12345678-1234-1234-1234-123456789abc',
        coverageAreaId: '87654321-4321-4321-4321-cba987654321',
        startAt: '2026-08-25T14:00:00Z',
        addonIds: ['12345678-1234-1234-1234-123456789abc', '12345678-1234-1234-1234-123456789abc'], // Duplicate
        contactName: 'كريم محمود',
        contactPhone: '01011111111',
        contactWhatsapp: '01011111111',
        policyAccepted: 'true',
        acceptedCancellationPolicyRevision: 'v1',
      });
      expect(duplicateAddons.success).toBe(false);
    });
  });

  // =========================================================================
  // 2. Customer Facing Lifecycle Labels (المسميات العربية لتتبع حالة الحجز)
  // =========================================================================
  describe('2. Customer Status Tracking & Arabic Friendly Labels', () => {
    it('provides clear and comforting Arabic status descriptions for customers', () => {
      expect(getCustomerFacingStatusLabel(BookingStatus.REQUEST_SUBMITTED)).toBe('تم استلام طلب الحجز');
      expect(getCustomerFacingStatusLabel(BookingStatus.AWAITING_PAYMENT_PROOF)).toBe('بانتظار إثبات التحويل');
      expect(getCustomerFacingStatusLabel(BookingStatus.PAYMENT_UNDER_REVIEW)).toBe('إثبات التحويل قيد المراجعة');
      expect(getCustomerFacingStatusLabel(BookingStatus.ACCEPTED)).toBe('تم قبول الحجز');
      expect(getCustomerFacingStatusLabel(BookingStatus.ON_THE_WAY)).toBe('الفريق في الطريق إليك');
      expect(getCustomerFacingStatusLabel(BookingStatus.ARRIVED)).toBe('وصل الفريق إلى موقع الخدمة');
      expect(getCustomerFacingStatusLabel(BookingStatus.IN_SERVICE)).toBe('الخدمة قيد التنفيذ');
      expect(getCustomerFacingStatusLabel(BookingStatus.QUALITY_REVIEW)).toBe('الخدمة قيد مراجعة الجودة');
      expect(getCustomerFacingStatusLabel(BookingStatus.SERVICE_COMPLETED)).toBe('اكتملت الخدمة بنجاح');
      expect(getCustomerFacingStatusLabel(BookingStatus.DELIVERED)).toBe('تم تسليم الخدمة');
      expect(getCustomerFacingStatusLabel(BookingStatus.CLOSED)).toBe('تم إغلاق الحجز');
      expect(getCustomerFacingStatusLabel(BookingStatus.CANCELLED)).toBe('تم إلغاء الحجز');
    });
  });

  // =========================================================================
  // 3. Customer Requests: Cancellations, Reschedules & Complaints (الطلبات والشكاوى)
  // =========================================================================
  describe('3. Customer Cancellation, Reschedule Requests & Complaint Tickets', () => {
    it('validates customer cancellation request with preferred action (REFUND / CREDIT / RESCHEDULE)', () => {
      const refundRequest = requestCancellationSchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        reason: 'اضطررت للسفر خارج القاهرة غداً لظرف طارئ',
        preferredAction: 'REFUND',
        notes: 'يرجى تحويل المبلغ على نفس رقم فودافون كاش',
      });
      expect(refundRequest.success).toBe(true);

      const creditRequest = requestCancellationSchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        reason: 'تغيير الخطة وإضافة رصيد للمحفظة لاستخدامه لاحقاً',
        preferredAction: 'CREDIT',
      });
      expect(creditRequest.success).toBe(true);
    });

    it('validates customer reschedule request with requested new date and alternative dates', () => {
      const reschedule = requestRescheduleSchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        reason: 'تأخير موعد الرجوع من العمل ساعتين',
        requestedStartAt: new Date('2026-08-26T17:00:00Z'),
        proposedDates: 'أو في نفس التوقيت يوم الخميس القادم',
        notes: 'برجاء تأكيد الموعد المناسب للفريق',
      });
      expect(reschedule.success).toBe(true);
    });

    it('validates complaint ticket submission with issue type and description', () => {
      const complaint = createComplaintSchema.safeParse({
        bookingId: '12345678-1234-1234-1234-123456789abc',
        type: 'QUALITY_CONCERN',
        description: 'ملاحظة عدم تنظيف الجزء السفلي من الزجاج الخلفي بدقة',
      });
      expect(complaint.success).toBe(true);
    });
  });

  // =========================================================================
  // 4. Customer Vehicles & Addresses CRUD (إدارة سجل السيارات والعناوين)
  // =========================================================================
  describe('4. Customer Vehicles & Addresses Management', () => {
    it('validates vehicle creation with vehicleSize enum and default flag', () => {
      const vehicle = vehicleSchema.safeParse({
        make: 'Audi',
        model: 'Q7',
        year: 2023,
        color: 'رمادي غامق',
        vehicleSize: 'SUV',
        plateNumber: 'م ن ه 9876',
        notes: 'يوجد فرش جلد طبيعي حساس',
        isDefault: true,
      });
      expect(vehicle.success).toBe(true);
    });

    it('validates address creation and validates Google Maps URLs', () => {
      const validAddress = addressSchema.safeParse({
        governorate: 'القاهرة',
        city: 'القاهرة الجديدة',
        district: 'التجمع الأول',
        compound: 'كمبوند سوان ليك',
        street: 'شارع الياسمين',
        buildingNumber: 'فيلا 88',
        unitNumber: 'الدور الأرضي',
        landmark: 'أمام الكلوب هاوس',
        gateInstructions: 'بوابة 3',
        locationUrl: 'https://maps.app.goo.gl/exampleLocation123',
        isDefault: true,
      });
      expect(validAddress.success).toBe(true);

      // Verifies location URL validator utility
      expect(isValidLocationUrl('https://maps.google.com/?q=30.12,31.45')).toBe(true);
      expect(isValidLocationUrl('http://maps.apple.com/?ll=30.12,31.45')).toBe(true);
      expect(isValidLocationUrl('javascript:alert(1)')).toBe(false);
      expect(isValidLocationUrl('ftp://invalid-url')).toBe(false);
    });
  });

  // =========================================================================
  // 5. Subscription Plan Consumption (استخدام زيارات الاشتراك)
  // =========================================================================
  describe('5. Subscription Plan Pricing & Visit Redemption', () => {
    it('calculates quote correctly when subscription covers base service (basePrice = 0)', () => {
      const quote = calculateBookingQuote({
        base: {
          price: 500, // Regular base price
          durationMinutes: 60,
          slotCount: 1,
        },
        subscriptionCoversBase: true, // Used a subscription visit
        depositRequired: false,
        fullPrepayment: false,
        depositType: 'PERCENTAGE',
        depositValue: 0,
        addons: [
          { price: 120, durationMinutes: 15, slotCount: 0 },
        ],
      });

      // Base price is completely covered by subscription visit (0 EGP)
      expect(quote.basePrice).toBe(0);
      // Only extra requested addon is charged
      expect(quote.addonPrice).toBe(120);
      expect(quote.totalPrice).toBe(120);
      // No deposit required for subscription bookings
      expect(quote.depositAmount).toBe(0);
    });
  });

  // =========================================================================
  // 6. Customer Profile & Security (الملف الشخصي والأمان)
  // =========================================================================
  describe('6. Customer Profile & Phone Normalization', () => {
    it('validates customer profile update payload', () => {
      const validProfile = profileUpdateSchema.safeParse({
        fullName: 'عمر شريف علي',
        phone: '01123456789',
        whatsapp: '01123456789',
        email: 'omar.sherif@example.com',
      });
      expect(validProfile.success).toBe(true);
    });
  });
});
