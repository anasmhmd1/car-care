import { describe, expect, it } from 'vitest';
import {
  serviceSchema,
  serviceVariantSchema,
  serviceAddonSchema,
  teamSchema,
  teamMemberSchema,
  employeeSchema,
  branchSettingsSchema,
  workingHoursSchema,
  blackoutDateSchema,
  coverageZoneSchema,
  coverageAreaSchema,
  zoneTravelTimeSchema,
  paymentMethodSchema,
  checklistTemplateSchema,
  checklistItemSchema,
  subscriptionPlanSchema,
  vehicleSchema,
  addressSchema,
  ownerCustomerAccountSchema,
} from '@/lib/validations/admin';
import {
  calculateBookingQuote,
} from '@/lib/engine/pricing';

describe('Owner / Admin (حساب المالك) Complete E2E & Logical Test Suite', () => {

  // =========================================================================
  // 1. Service Catalog, Pricing, Addons & Checklists (الكتالوج والتسعير والتشيك ليست)
  // =========================================================================
  describe('1. Catalog, Service Creation, Variants, Addons & Checklist Templates', () => {
    it('validates new service creation with full pricing and deposit rules', () => {
      const validService = serviceSchema.safeParse({
        nameAr: 'غسيل بريق الملكي الشامل',
        nameEn: 'Bareeq Royal Comprehensive Care',
        slug: 'bareeq-royal-comprehensive',
        shortDescriptionAr: 'تنظيف وتلميع عميق لكافة أجزاء السيارة بأحدث التقنيات',
        fullDescriptionAr: 'تشمل الخدمة غسيل خارجي نانو سيراميك، تنظيف داخلي عميق، تلميع الجنوط، تعقيم فتحات التكييف، وحماية الطلاء.',
        coverImage: '/images/services/royal-care.svg',
        basePrice: 650,
        priceType: 'FIXED',
        durationMinutes: 90,
        slotCount: 2,
        requiredTeamSize: 2,
        requiresDeposit: true,
        depositType: 'PERCENTAGE',
        depositValue: 25,
        requiresFullPrepayment: false,
        active: true,
        bookableOnline: true,
        subscriptionEligible: true,
        minimumBeforePhotos: 3,
        minimumAfterPhotos: 3,
      });
      expect(validService.success).toBe(true);

      const invalidSlug = serviceSchema.safeParse({
        nameAr: 'خدمة تجريبية',
        slug: 'INVALID_SLUG_WITH_CAPS_AND_SPACES',
        shortDescriptionAr: 'وصف مختصر',
        fullDescriptionAr: 'وصف كامل',
        coverImage: '/image.svg',
        basePrice: 100,
      });
      expect(invalidSlug.success).toBe(false);
    });

    it('validates service vehicle variants pricing for SEDAN, SUV, and LARGE_SUV', () => {
      const sedanVariant = serviceVariantSchema.safeParse({
        serviceId: '12345678-1234-1234-1234-123456789abc',
        vehicleSize: 'SEDAN',
        price: 450,
        durationMinutes: 60,
        slotCount: 1,
        depositValue: 100,
      });
      expect(sedanVariant.success).toBe(true);

      const largeSuvVariant = serviceVariantSchema.safeParse({
        serviceId: '12345678-1234-1234-1234-123456789abc',
        vehicleSize: 'LARGE_SUV',
        price: 750,
        durationMinutes: 120,
        slotCount: 2,
        depositValue: 200,
      });
      expect(largeSuvVariant.success).toBe(true);
    });

    it('validates service addons creation (extra protection, ozone sterilization)', () => {
      const validAddon = serviceAddonSchema.safeParse({
        nameAr: 'طبقة واقية نانو سيراميك سريعة',
        nameEn: 'Quick Nano Ceramic Coat',
        price: 150,
        durationMinutes: 20,
        slotCount: 0,
        active: true,
      });
      expect(validAddon.success).toBe(true);
    });

    it('validates 6-stage checklist template and execution item definitions', () => {
      const template = checklistTemplateSchema.safeParse({
        serviceId: '12345678-1234-1234-1234-123456789abc',
        stage: 'SERVICE_EXECUTION',
        name: 'قائمة مهام وتشيك ليست التنفيذ للموظفين',
      });
      expect(template.success).toBe(true);

      const item = checklistItemSchema.safeParse({
        templateId: '12345678-1234-1234-1234-123456789abc',
        labelAr: 'تنظيف فتحات التكييف والكونسول المركزي بجهاز البخار',
        descriptionAr: 'يجب التأكد من تجفيف المفاتيح وأزرار التحكم بدقة',
        required: true,
        requiresPhoto: true,
        requiresNote: false,
        displayOrder: 1,
        active: true,
      });
      expect(item.success).toBe(true);
    });

    it('calculates comprehensive booking quote with variant and multiple addons accurately', () => {
      const quote = calculateBookingQuote({
        base: {
          price: 500,
          durationMinutes: 75,
          slotCount: 1,
        },
        depositRequired: true,
        fullPrepayment: false,
        depositType: 'PERCENTAGE',
        depositValue: 20,
        addons: [
          { price: 100, durationMinutes: 15, slotCount: 0 },
          { price: 150, durationMinutes: 20, slotCount: 0 },
        ],
      });

      // Total price = 500 + 100 + 150 = 750 EGP
      expect(quote.totalPrice).toBe(750);
      // Deposit = 20% of 750 = 150 EGP
      expect(quote.depositAmount).toBe(150);
      // Total duration = 75 + 15 + 20 = 110 minutes
      expect(quote.totalDurationMinutes).toBe(110);
      // Total slots = 1 + 0 + 0 = 1
      expect(quote.slotCount).toBe(1);
    });
  });

  // =========================================================================
  // 2. Branch Settings, Schedules, Buffers & Coverage (إعدادات الفرع والجدولة ونطاقات التغطية)
  // =========================================================================
  describe('2. Branch Settings, Working Hours, Buffers & Coverage Zones', () => {
    it('validates branch operational settings, arrival windows and rest buffers', () => {
      const validBranch = branchSettingsSchema.safeParse({
        nameAr: 'فرع القاهرة الكبرى - التجمع والشيخ زايد',
        nameEn: 'Greater Cairo Branch',
        address: 'شارع التسعين الشمالي، التجمع الخامس، القاهرة الجديدة',
        phone: '01111111111',
        whatsapp: '01111111111',
        slotUnitMinutes: 60,
        arrivalWindowMinutes: 30,
        travelBufferMinutes: 30,
        restBufferMinutes: 15,
        dailyBookingLimit: 25,
        assignmentMode: 'AUTOMATIC',
      });
      expect(validBranch.success).toBe(true);
    });

    it('validates weekly working hours and daily break intervals', () => {
      const regularDay = workingHoursSchema.safeParse({
        branchId: '12345678-1234-1234-1234-123456789abc',
        dayOfWeek: 5, // Friday
        isClosed: false,
        openTime: '10:00',
        closeTime: '22:00',
        breakStartTime: '12:00',
        breakEndTime: '13:30',
      });
      expect(regularDay.success).toBe(true);

      const closedDay = workingHoursSchema.safeParse({
        branchId: '12345678-1234-1234-1234-123456789abc',
        dayOfWeek: 1,
        isClosed: true,
        openTime: '00:00',
        closeTime: '00:00',
      });
      expect(closedDay.success).toBe(true);
    });

    it('validates blackout dates for holidays or emergency maintenance', () => {
      const validBlackout = blackoutDateSchema.safeParse({
        branchId: '12345678-1234-1234-1234-123456789abc',
        date: '2026-10-06',
        reason: 'عطلة رسمية بمناسبة ذكرى نصر أكتوبر',
      });
      expect(validBlackout.success).toBe(true);
    });

    it('validates coverage zones, compounds and travel duration matrix', () => {
      const zone = coverageZoneSchema.safeParse({
        branchId: '12345678-1234-1234-1234-123456789abc',
        name: 'نطاق القاهرة الجديدة والتجمع',
        description: 'يشمل كمبوندات التجمع الخامس، الرحاب، ومدينتي',
      });
      expect(zone.success).toBe(true);

      const area = coverageAreaSchema.safeParse({
        zoneId: '12345678-1234-1234-1234-123456789abc',
        governorate: 'القاهرة',
        city: 'القاهرة الجديدة',
        district: 'التجمع الخامس',
        compound: 'ميفيدا',
        active: true,
        priority: 1,
        travelBufferOverride: 20,
      });
      expect(area.success).toBe(true);

      const travelMatrix = zoneTravelTimeSchema.safeParse({
        fromZoneId: '12345678-1234-1234-1234-123456789abc',
        toZoneId: '87654321-4321-4321-4321-cba987654321',
        durationMinutes: 35,
      });
      expect(travelMatrix.success).toBe(true);
    });

    it('validates manual payment methods (InstaPay, Vodafone Cash, Bank Transfer)', () => {
      const instapay = paymentMethodSchema.safeParse({
        branchId: '12345678-1234-1234-1234-123456789abc',
        name: 'إنستاباي بريق المعتمد',
        type: 'INSTAPAY',
        accountNumber: 'bareeq@instapay',
        accountName: 'شركة بريق للعناية بالسيارات',
        instructions: 'يرجى كتابة رقم الحجز في خانة ملاحظات التحويل ورفع صورة الإيصال فوراً',
        active: true,
        isDefault: true,
      });
      expect(instapay.success).toBe(true);

      const vodafoneCash = paymentMethodSchema.safeParse({
        branchId: '12345678-1234-1234-1234-123456789abc',
        name: 'محفظة فودافون كاش الرسمية',
        type: 'VODAFONE_CASH',
        accountNumber: '01011111111',
        accountName: 'بريق أوتوكير',
        instructions: 'التحويل متاح على مدار الساعة',
        active: true,
        isDefault: false,
      });
      expect(vodafoneCash.success).toBe(true);
    });
  });

  // =========================================================================
  // 3. Subscription Plans (باقات وخطط الاشتراكات الدورية)
  // =========================================================================
  describe('3. Subscription Plans & Monthly Packages Management', () => {
    it('validates subscription plan creation with visit quota and vehicle count limits', () => {
      const plan = subscriptionPlanSchema.safeParse({
        nameAr: 'باقة بريق الذهبية الشهرية (4 زيارات)',
        descriptionAr: 'تشمل 4 زيارات غسيل وتلميع متنقل شهرياً لسيارتين مع خصم 20% على الإضافات',
        price: 1800,
        validityDays: 30,
        visitCount: 4,
        allowedVehicleCount: 2,
        active: true,
      });
      expect(plan.success).toBe(true);

      const invalidPlan = subscriptionPlanSchema.safeParse({
        nameAr: '',
        descriptionAr: 'وصف',
        price: -50, // Invalid negative price
      });
      expect(invalidPlan.success).toBe(false);
    });
  });

  // =========================================================================
  // 4. Customer CRM & Account Administration (إدارة حسابات العملاء وعلاقات CRM)
  // =========================================================================
  describe('4. Customer CRM, Account Management & Security Constraints', () => {
    it('validates owner customer update with temporary password constraint (minimum 12 chars)', () => {
      const validUpdate = ownerCustomerAccountSchema.safeParse({
        customerId: '12345678-1234-1234-1234-123456789abc',
        fullName: 'أحمد محمود عبد العزيز',
        phone: '01511111111',
        whatsapp: '01511111111',
        email: 'ahmed.m@example.com',
        active: 'true',
        notes: 'عميل مميز في كمبوند ميفيدا',
        temporaryPassword: 'TempPassword#2026',
      });
      expect(validUpdate.success).toBe(true);
      if (validUpdate.success) {
        expect(validUpdate.data.active).toBe(true);
      }

      // Rejects temporary passwords under 12 characters
      const shortPassword = ownerCustomerAccountSchema.safeParse({
        customerId: '12345678-1234-1234-1234-123456789abc',
        fullName: 'أحمد محمود',
        phone: '01511111111',
        active: 'true',
        temporaryPassword: 'short', // Too short (min 12)
      });
      expect(shortPassword.success).toBe(false);
    });
  });

  // =========================================================================
  // 5. Vehicles & Customer Addresses (سجل سيارات وعناوين العملاء)
  // =========================================================================
  describe('5. Vehicles & Customer Addresses Validation', () => {
    it('validates customer vehicle schema with vehicle size enum', () => {
      const validCar = vehicleSchema.safeParse({
        make: 'Mercedes-Benz',
        model: 'C200',
        year: 2024,
        color: 'أسود ميتاليك',
        vehicleSize: 'SEDAN',
        plateNumber: 'أ ب ج 1234',
        notes: 'السيارة مغطاة بطبقة نانو سيراميك',
        isDefault: true,
      });
      expect(validCar.success).toBe(true);
    });

    it('validates customer address schema with location URL verification', () => {
      const validAddress = addressSchema.safeParse({
        governorate: 'القاهرة',
        city: 'القاهرة الجديدة',
        district: 'التجمع الخامس',
        compound: 'كمبوند القطامية ديونز',
        street: 'شارع النخيل',
        buildingNumber: 'فيلا 142',
        unitNumber: 'المدخل الشرقي',
        landmark: 'بجوار نادي الجولف',
        gateInstructions: 'بوابة رقم 2 - إبلاغ الأمن بالحضور لفيلا 142',
        locationUrl: 'https://maps.google.com/?q=30.01234,31.45678',
        isDefault: true,
      });
      expect(validAddress.success).toBe(true);

      const invalidUrl = addressSchema.safeParse({
        governorate: 'القاهرة',
        city: 'القاهرة الجديدة',
        district: 'التجمع',
        compound: 'الرحاب',
        street: 'شارع 1',
        buildingNumber: '10',
        locationUrl: 'not-a-valid-url',
      });
      expect(invalidUrl.success).toBe(false);
    });
  });

  // =========================================================================
  // 6. Workforce & Team Management by Owner (إدارة فرق العمل والموظفين)
  // =========================================================================
  describe('6. Workforce, Team Leaders & Operational Capacity', () => {
    it('validates team schema with daily capacity and assignment priority', () => {
      const validTeam = teamSchema.safeParse({
        name: 'فريق النخبة 1 - التجمع',
        branchId: '12345678-1234-1234-1234-123456789abc',
        leaderId: '87654321-4321-4321-4321-cba987654321',
        dailyCapacity: 6,
        active: true,
        assignmentPriority: 1,
      });
      expect(validTeam.success).toBe(true);
    });

    it('validates employee creation with role delegation (EMPLOYEE / OPERATIONS_MANAGER)', () => {
      const validEmp = employeeSchema.safeParse({
        fullName: 'حسام مصطفى',
        phone: '01012345678',
        whatsapp: '01012345678',
        email: 'hossam@bareeq.car',
        password: 'SecurePassword123#',
        branchId: '12345678-1234-1234-1234-123456789abc',
        role: 'OPERATIONS_MANAGER',
      });
      expect(validEmp.success).toBe(true);
    });

    it('validates team member assignment schema', () => {
      const validMember = teamMemberSchema.safeParse({
        teamId: '12345678-1234-1234-1234-123456789abc',
        userId: '87654321-4321-4321-4321-cba987654321',
        isLeader: true,
      });
      expect(validMember.success).toBe(true);
    });
  });
});
