/* eslint-disable @typescript-eslint/no-require-imports */
const {
  PrismaClient,
  UserRole,
  BranchStatus,
  AssignmentMode,
  PaymentMethodType,
  OperationalVehicleStatus,
  VehicleSize,
  BookingStatus,
  PaymentStatus,
  BookingHoldStatus,
  FileType,
  ProofStatus,
  ChecklistStage,
} = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  console.log('\n===============================================================');
  console.log('🚀 BAREEQ — FULL OPERATIONAL LIFECYCLE SIMULATION & DEMO SEED');
  console.log('===============================================================\n');

  // --------------------------------------------------------------------------
  // STEP 1: ESTABLISH DEMO BRANCH & OPERATIONAL INFRASTRUCTURE
  // --------------------------------------------------------------------------
  console.log('📍 [1/6] Establishing Demo Branch & Operational Infrastructure...');

  const branchCode = 'CAI-NC-DEMO';
  const branch = await prisma.branch.upsert({
    where: { code: branchCode },
    update: {
      nameAr: 'فرع القاهرة الجديدة - التجمع الخامس (تجريبي)',
      nameEn: 'New Cairo - 5th Settlement (Demo Branch)',
      address: 'شارع التسعين الشمالي، التجمع الخامس، القاهرة الجديدة',
      phone: '01000000100',
      whatsapp: '01000000100',
      status: BranchStatus.ACTIVE,
      timezone: 'Africa/Cairo',
      slotUnitMinutes: 60,
      arrivalWindowMinutes: 30,
      travelBufferMinutes: 30,
      restBufferMinutes: 15,
      dailyBookingLimit: 30,
      assignmentMode: AssignmentMode.MANUAL,
    },
    create: {
      code: branchCode,
      nameAr: 'فرع القاهرة الجديدة - التجمع الخامس (تجريبي)',
      nameEn: 'New Cairo - 5th Settlement (Demo Branch)',
      address: 'شارع التسعين الشمالي، التجمع الخامس، القاهرة الجديدة',
      phone: '01000000100',
      whatsapp: '01000000100',
      status: BranchStatus.ACTIVE,
      timezone: 'Africa/Cairo',
      slotUnitMinutes: 60,
      arrivalWindowMinutes: 30,
      travelBufferMinutes: 30,
      restBufferMinutes: 15,
      dailyBookingLimit: 30,
      assignmentMode: AssignmentMode.MANUAL,
    },
  });

  // Working Hours (7 days)
  for (let day = 0; day < 7; day++) {
    await prisma.branchWorkingHours.upsert({
      where: {
        branchId_dayOfWeek: {
          branchId: branch.id,
          dayOfWeek: day,
        },
      },
      update: {
        openTime: '09:00',
        closeTime: '22:00',
        breakStartTime: '14:00',
        breakEndTime: '15:00',
        isClosed: false,
      },
      create: {
        branchId: branch.id,
        dayOfWeek: day,
        openTime: '09:00',
        closeTime: '22:00',
        breakStartTime: '14:00',
        breakEndTime: '15:00',
        isClosed: false,
      },
    });
  }

  // Coverage Zone & Area
  let zone = await prisma.coverageZone.findFirst({
    where: { branchId: branch.id, name: 'التجمع الخامس والنرجس' },
  });
  if (!zone) {
    zone = await prisma.coverageZone.create({
      data: {
        branchId: branch.id,
        name: 'التجمع الخامس والنرجس',
        description: 'منطقة التجمع الخامس والنرجس والمستثمرين',
      },
    });
  }

  let coverageArea = await prisma.coverageArea.findFirst({
    where: { zoneId: zone.id, compound: 'حي النرجس والمستثمرين الجنوبية' },
  });
  if (!coverageArea) {
    coverageArea = await prisma.coverageArea.create({
      data: {
        zoneId: zone.id,
        governorate: 'القاهرة',
        city: 'القاهرة الجديدة',
        district: 'التجمع الخامس',
        compound: 'حي النرجس والمستثمرين الجنوبية',
        active: true,
        priority: 1,
      },
    });
  }

  // Payment Methods
  let instapayMethod = await prisma.branchPaymentMethod.findFirst({
    where: { branchId: branch.id, type: PaymentMethodType.INSTAPAY },
  });
  if (!instapayMethod) {
    instapayMethod = await prisma.branchPaymentMethod.create({
      data: {
        branchId: branch.id,
        name: 'إنستاباي (InstaPay)',
        type: PaymentMethodType.INSTAPAY,
        accountNumber: '01000000000@instapay',
        accountName: 'بريق للعناية الفاخرة',
        instructions: 'يرجى إرفاق إيصال التحويل بعد إتمام المعاملة',
        active: true,
        isDefault: true,
      },
    });
  }

  let vodafoneMethod = await prisma.branchPaymentMethod.findFirst({
    where: { branchId: branch.id, type: PaymentMethodType.VODAFONE_CASH },
  });
  if (!vodafoneMethod) {
    vodafoneMethod = await prisma.branchPaymentMethod.create({
      data: {
        branchId: branch.id,
        name: 'فودافون كاش (Vodafone Cash)',
        type: PaymentMethodType.VODAFONE_CASH,
        accountNumber: '01012345678',
        accountName: 'كاشير فرع التجمع',
        instructions: 'يرجى إرفاق إيصال التحويل بعد إتمام المعاملة',
        active: true,
        isDefault: false,
      },
    });
  }

  // Operational Fleet Vehicle
  const opVehicle = await prisma.operationalVehicle.upsert({
    where: { code: 'OP-VAN-101' },
    update: {
      branchId: branch.id,
      plateNumber: 'س ج د 2026',
      make: 'Mercedes-Benz',
      model: 'Sprinter Detailer Pro',
      year: 2025,
      status: OperationalVehicleStatus.ACTIVE,
      notes: 'وحدة غسيل متنقلة مجهزة بوحدة بخار وتوليد كهرباء وخزان مياه منقى',
    },
    create: {
      branchId: branch.id,
      code: 'OP-VAN-101',
      plateNumber: 'س ج د 2026',
      make: 'Mercedes-Benz',
      model: 'Sprinter Detailer Pro',
      year: 2025,
      status: OperationalVehicleStatus.ACTIVE,
      notes: 'وحدة غسيل متنقلة مجهزة بوحدة بخار وتوليد كهرباء وخزان مياه منقى',
    },
  });

  // Team
  let team = await prisma.team.findFirst({
    where: { branchId: branch.id, name: 'فريق الصقور (Team Alpha)' },
  });
  if (!team) {
    team = await prisma.team.create({
      data: {
        branchId: branch.id,
        name: 'فريق الصقور (Team Alpha)',
        active: true,
        dailyCapacity: 6,
        baseZoneId: zone.id,
      },
    });
  }

  console.log(`   ✓ Branch Created: ${branch.nameAr} [${branch.code}]`);
  console.log(`   ✓ Zone & Area: ${zone.name} ➜ ${coverageArea.compound}`);
  console.log(`   ✓ Payment Method: InstaPay (${instapayMethod.accountNumber} - ${instapayMethod.accountName})`);
  console.log(`   ✓ Team & Vehicle: ${team.name} with ${opVehicle.make} ${opVehicle.model} [${opVehicle.plateNumber}]`);

  // --------------------------------------------------------------------------
  // STEP 2: CREATE DEMO PERSONAS & ACCOUNTS
  // --------------------------------------------------------------------------
  console.log('\n👥 [2/6] Creating / Synchronizing 4 Real Demo User Accounts...');

  const passwordHash = await bcrypt.hash('Bareeq#2026', 10);

  // 1. Owner
  const ownerUser = await prisma.user.upsert({
    where: { phone: '01000000001' },
    update: {
      fullName: 'كريم المنشاوي (المالك - Owner)',
      email: 'owner@bareeq.demo',
      role: UserRole.OWNER,
      active: true,
      mustChangePwd: false,
      passwordHash,
    },
    create: {
      fullName: 'كريم المنشاوي (المالك - Owner)',
      phone: '01000000001',
      email: 'owner@bareeq.demo',
      role: UserRole.OWNER,
      active: true,
      mustChangePwd: false,
      passwordHash,
    },
  });

  // 2. Operations Manager
  const managerUser = await prisma.user.upsert({
    where: { phone: '01000000002' },
    update: {
      fullName: 'مهندس طارق الزيات (مدير التشغيل - Ops Manager)',
      email: 'manager@bareeq.demo',
      role: UserRole.OPERATIONS_MANAGER,
      active: true,
      mustChangePwd: false,
      passwordHash,
    },
    create: {
      fullName: 'مهندس طارق الزيات (مدير التشغيل - Ops Manager)',
      phone: '01000000002',
      email: 'manager@bareeq.demo',
      role: UserRole.OPERATIONS_MANAGER,
      active: true,
      mustChangePwd: false,
      passwordHash,
    },
  });

  await prisma.branchMembership.upsert({
    where: {
      branchId_userId: {
        branchId: branch.id,
        userId: managerUser.id,
      },
    },
    update: {},
    create: {
      branchId: branch.id,
      userId: managerUser.id,
    },
  });

  // 3. Technician / Employee
  const techUser = await prisma.user.upsert({
    where: { phone: '01000000003' },
    update: {
      fullName: 'كابتن حسام إبراهيم (قائد الفريق الميداني - Lead Tech)',
      email: 'tech@bareeq.demo',
      role: UserRole.EMPLOYEE,
      active: true,
      mustChangePwd: false,
      passwordHash,
    },
    create: {
      fullName: 'كابتن حسام إبراهيم (قائد الفريق الميداني - Lead Tech)',
      phone: '01000000003',
      email: 'tech@bareeq.demo',
      role: UserRole.EMPLOYEE,
      active: true,
      mustChangePwd: false,
      passwordHash,
    },
  });

  await prisma.branchMembership.upsert({
    where: {
      branchId_userId: {
        branchId: branch.id,
        userId: techUser.id,
      },
    },
    update: {},
    create: {
      branchId: branch.id,
      userId: techUser.id,
    },
  });

  await prisma.teamMember.upsert({
    where: {
      userId: techUser.id,
    },
    update: {
      teamId: team.id,
      isLeader: true,
    },
    create: {
      teamId: team.id,
      userId: techUser.id,
      isLeader: true,
    },
  });

  // Update team leader
  await prisma.team.update({
    where: { id: team.id },
    data: { leaderId: techUser.id },
  });

  // 4. Customer
  const customerUser = await prisma.user.upsert({
    where: { phone: '01000000004' },
    update: {
      fullName: 'أحمد المنصوري (العميل - Customer)',
      email: 'customer@bareeq.demo',
      role: UserRole.CUSTOMER,
      active: true,
      mustChangePwd: false,
      passwordHash,
    },
    create: {
      fullName: 'أحمد المنصوري (العميل - Customer)',
      phone: '01000000004',
      email: 'customer@bareeq.demo',
      role: UserRole.CUSTOMER,
      active: true,
      mustChangePwd: false,
      passwordHash,
    },
  });

  const customerProfile = await prisma.customerProfile.upsert({
    where: { userId: customerUser.id },
    update: {
      creditBalance: 150, // 150 EGP demo credit in wallet
    },
    create: {
      userId: customerUser.id,
      creditBalance: 150,
    },
  });

  // Customer Vehicle
  let vehicle = await prisma.vehicle.findFirst({
    where: { customerId: customerProfile.id, plateNumber: 'أ ب ج 1234' },
  });
  if (!vehicle) {
    vehicle = await prisma.vehicle.create({
      data: {
        customerId: customerProfile.id,
        make: 'Mercedes-Benz',
        model: 'E-Class 200 AMG',
        year: 2024,
        color: 'Obsidian Black Metallic',
        vehicleSize: VehicleSize.SEDAN,
        plateNumber: 'أ ب ج 1234',
        isDefault: true,
      },
    });
  }

  // Customer Address
  let address = await prisma.customerAddress.findFirst({
    where: { customerId: customerProfile.id, street: 'شارع التسعين الجنوبي' },
  });
  if (!address) {
    address = await prisma.customerAddress.create({
      data: {
        customerId: customerProfile.id,
        governorate: 'القاهرة',
        city: 'القاهرة الجديدة',
        district: 'التجمع الخامس',
        compound: 'حي النرجس',
        street: 'شارع التسعين الجنوبي',
        buildingNumber: '12',
        unitNumber: '1',
        landmark: 'بجوار مجمع الدبلوماسيين',
        isDefault: true,
      },
    });
  }

  console.log(`   ✓ Owner: ${ownerUser.fullName} (01000000001 / Bareeq#2026)`);
  console.log(`   ✓ Ops Manager: ${managerUser.fullName} (01000000002 / Bareeq#2026)`);
  console.log(`   ✓ Technician: ${techUser.fullName} (01000000003 / Bareeq#2026)`);
  console.log(`   ✓ Customer: ${customerUser.fullName} (01000000004 / Bareeq#2026)`);
  console.log(`     - Vehicle: ${vehicle.make} ${vehicle.model} [${vehicle.plateNumber}]`);
  console.log(`     - Address: ${address.street}, ${address.district}`);
  console.log(`     - Wallet Credit: ${customerProfile.creditBalance} EGP`);

  // --------------------------------------------------------------------------
  // STEP 3: CUSTOMER BOOKING CREATION & CAPACITY HOLD
  // --------------------------------------------------------------------------
  console.log('\n📅 [3/6] Customer Journey: Creating Luxury Booking & Reserving Capacity...');

  // Get active bookable service
  const service = await prisma.service.findFirstOrThrow({
    where: { active: true, bookableOnline: true },
    include: {
      variants: true,
      cancellationPolicy: true,
      checklistTemplates: {
        include: { items: true },
      },
    },
  });

  // Ensure branch offers this service
  await prisma.branchService.upsert({
    where: {
      branchId_serviceId: {
        branchId: branch.id,
        serviceId: service.id,
      },
    },
    update: { active: true, bookableOnline: true },
    create: {
      branchId: branch.id,
      serviceId: service.id,
      active: true,
      bookableOnline: true,
    },
  });

  const variant = service.variants.find((v) => v.vehicleSize === VehicleSize.SEDAN) || service.variants[0];
  const totalPrice = variant ? variant.price : service.basePrice;
  const depositRequired = variant?.depositValue || service.depositValue || 200;
  const durationMinutes = variant?.durationMinutes || service.durationMinutes || 60;

  const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
  startAt.setUTCHours(10, 0, 0, 0);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);

  const bookingNonce = randomUUID().slice(0, 6).toUpperCase();
  const bookingNumber = `BQ-DEMO-${bookingNonce}`;

  const booking = await prisma.booking.create({
    data: {
      bookingNumber,
      customerId: customerProfile.id,
      branchId: branch.id,
      coverageAreaId: coverageArea.id,
      vehicleId: vehicle.id,
      serviceId: service.id,
      serviceVariantId: variant?.id,
      cancellationPolicyId: service.cancellationPolicyId,
      bookingStatus: BookingStatus.REQUEST_SUBMITTED,
      paymentStatus: PaymentStatus.AWAITING_PROOF,
      startAt,
      endAt,
      totalDurationMinutes: durationMinutes,
      basePrice: totalPrice,
      addonPrice: 0,
      totalPrice,
      depositAmount: depositRequired,
      amountPaid: 0,
      amountDue: totalPrice,
      creditAppliedAmount: 0,
      customerNotes: 'الرجاء الحضور في الموعد المحدد، السيارة متواجدة داخل الجراج الخاص بالفيلا.',
      contactSnapshot: {
        fullName: customerUser.fullName,
        phone: customerUser.phone,
        email: customerUser.email,
      },
      vehicleSnapshot: {
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        plateNumber: vehicle.plateNumber,
        vehicleSize: vehicle.vehicleSize,
      },
      addressSnapshot: {
        governorate: address.governorate,
        city: address.city,
        district: address.district,
        compound: address.compound,
        street: address.street,
        buildingNumber: address.buildingNumber,
        unitNumber: address.unitNumber,
        landmark: address.landmark,
      },
      serviceSnapshot: {
        id: service.id,
        nameAr: service.nameAr,
        basePrice: service.basePrice,
        durationMinutes: service.durationMinutes,
      },
      cancellationPolicySnapshot: {
        noticeHours: service.cancellationPolicy?.noticeHours || 6,
        allowsCancellation: service.cancellationPolicy?.allowsCancellation ?? true,
        allowsRescheduling: service.cancellationPolicy?.allowsRescheduling ?? true,
      },
    },
  });

  // Create active booking hold (30 mins hold)
  const hold = await prisma.bookingHold.create({
    data: {
      bookingId: booking.id,
      teamId: team.id,
      slotStartTime: startAt,
      slotEndTime: endAt,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      status: BookingHoldStatus.ACTIVE,
    },
  });

  // Helper for status transition logging
  async function transition(fromStatus, toStatus, actorUser, reason) {
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: { bookingStatus: toStatus },
      });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus,
          toStatus,
          changedByUserId: actorUser.id,
          actorRole: actorUser.role,
          reason,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actorUser.id,
          actorRole: actorUser.role,
          action: 'BOOKING_STATUS_TRANSITION',
          entityType: 'Booking',
          entityId: booking.id,
          branchId: branch.id,
          reason,
          beforeJson: { bookingStatus: fromStatus },
          afterJson: { bookingStatus: toStatus },
        },
      });
    });
  }

  console.log(`   ✓ Booking Created: #${booking.bookingNumber} (${service.nameAr})`);
  console.log(`   ✓ Scheduled: ${startAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  console.log(`   ✓ Financials: Total = ${totalPrice} EGP | Upfront Deposit = ${depositRequired} EGP`);
  console.log(`   ✓ Active Capacity Hold: ${hold.id} on Team [${team.name}]`);

  // Move status to AWAITING_PAYMENT_PROOF
  await transition(
    BookingStatus.REQUEST_SUBMITTED,
    BookingStatus.AWAITING_PAYMENT_PROOF,
    customerUser,
    'معالج الحجز: تم إنشاء الحجز وحجز الموعد بنجاح، بانتظار رفع إثبات التحويل.'
  );

  // --------------------------------------------------------------------------
  // STEP 4: CUSTOMER UPLOADS PAYMENT PROOF
  // --------------------------------------------------------------------------
  console.log('\n💳 [4/6] Customer Journey: Uploading InstaPay Transfer Receipt...');

  const proofFile = await prisma.bookingFile.create({
    data: {
      bookingId: booking.id,
      fileType: FileType.PAYMENT_PROOF,
      fileUrl: `/uploads/demo/instapay_receipt_${booking.id}.png`,
      mimeType: 'image/png',
      sizeBytes: 145200,
      uploadedByUserId: customerUser.id,
      customerGalleryConsentAt: new Date(),
    },
  });

  const proof = await prisma.paymentProof.create({
    data: {
      bookingId: booking.id,
      paymentMethodId: instapayMethod.id,
      senderName: customerUser.fullName,
      senderPhoneOrAccount: '01000000004@instapay',
      referenceNumber: `INSTA-REF-${randomUUID().slice(0, 8).toUpperCase()}`,
      amountSubmitted: depositRequired,
      transferTimestamp: new Date(),
      proofFileUrl: proofFile.fileUrl,
      proofFileId: proofFile.id,
      status: ProofStatus.UNDER_REVIEW,
      idempotencyKey: `proof-${booking.id}-${Date.now()}`,
    },
  });

  await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentStatus: PaymentStatus.UNDER_REVIEW },
  });

  await transition(
    BookingStatus.AWAITING_PAYMENT_PROOF,
    BookingStatus.PAYMENT_UNDER_REVIEW,
    customerUser,
    'العميل: تم رفع إيصال تحويل إنستاباي بمبلغ العربون.'
  );

  console.log(`   ✓ Proof Uploaded: ${proof.senderName} ➜ Reference: ${proof.referenceNumber}`);
  console.log(`   ✓ Status Transition: AWAITING_PAYMENT_PROOF ➜ PAYMENT_UNDER_REVIEW`);

  // --------------------------------------------------------------------------
  // STEP 5: OPERATIONS MANAGER REVIEWS PAYMENT, ACCEPTS & ASSIGNS TEAM
  // --------------------------------------------------------------------------
  console.log('\n👔 [5/6] Operations Manager Workflow: Reviewing Proof, Accepting & Dispatching...');

  // 5.1 Verify Proof & Record Payment Ledger
  await prisma.$transaction(async (tx) => {
    await tx.paymentProof.update({
      where: { id: proof.id },
      data: {
        status: ProofStatus.VERIFIED,
        reviewedByUserId: managerUser.id,
        reviewNotes: 'تم التحقق من استلام مبلغ العربون بحساب إنستاباي بنجاح.',
        reviewedAt: new Date(),
      },
    });

    await tx.payment.create({
      data: {
        bookingId: booking.id,
        proofId: proof.id,
        paymentMethod: 'INSTAPAY',
        amount: depositRequired,
        referenceNumber: proof.referenceNumber,
        recordedByUserId: managerUser.id,
        notes: 'دفعة عربون مؤكدة عبر إنستاباي',
      },
    });

    const newAmountPaid = depositRequired;
    const newAmountDue = totalPrice - newAmountPaid;
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        amountPaid: newAmountPaid,
        amountDue: newAmountDue,
        paymentStatus: newAmountDue > 0 ? PaymentStatus.PARTIALLY_PAID : PaymentStatus.FULLY_PAID,
      },
    });
  });

  await transition(
    BookingStatus.PAYMENT_UNDER_REVIEW,
    BookingStatus.PAYMENT_VERIFIED,
    managerUser,
    'مدير التشغيل: تم اعتماد إثبات الدفع وتسجيل قيد الدفع.'
  );

  await transition(
    BookingStatus.PAYMENT_VERIFIED,
    BookingStatus.AWAITING_OPERATIONS_REVIEW,
    managerUser,
    'النظام: جاهز للمراجعة التشغيلية والإسناد.'
  );

  // 5.2 Operational Acceptance
  await transition(
    BookingStatus.AWAITING_OPERATIONS_REVIEW,
    BookingStatus.ACCEPTED,
    managerUser,
    'مدير التشغيل: تم قبول الحجز تشغيلياً وجاري إسناد الفريق.'
  );

  // 5.3 Team Assignment
  await prisma.bookingAssignment.create({
    data: {
      bookingId: booking.id,
      teamId: team.id,
      assignedByUserId: managerUser.id,
      reason: 'إسناد يدوي لفريق الصقور المجهز للخدمات الشاملة',
      status: 'ACTIVE',
    },
  });

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      assignedTeamId: team.id,
      assignedEmployeeId: techUser.id,
      operationalVehicleId: opVehicle.id,
    },
  });

  await transition(
    BookingStatus.ACCEPTED,
    BookingStatus.ASSIGNED,
    managerUser,
    `مدير التشغيل: تم إسناد الحجز إلى ${team.name} بقيادة ${techUser.fullName}.`
  );

  console.log(`   ✓ Payment Verified: ${depositRequired} EGP recorded in ledger`);
  console.log(`   ✓ Remaining Due: ${totalPrice - depositRequired} EGP`);
  console.log(`   ✓ Status Transition: PAYMENT_UNDER_REVIEW ➜ PAYMENT_VERIFIED ➜ ACCEPTED ➜ ASSIGNED`);
  console.log(`   ✓ Assigned to: ${team.name} (Lead Tech: ${techUser.fullName})`);

  // --------------------------------------------------------------------------
  // STEP 6: FIELD EXECUTION & QUALITY REVIEW & CLOSING
  // --------------------------------------------------------------------------
  console.log('\n🛠️ [6/6] Technician Execution, Quality Approval & Final Closure...');

  // 6.1 Team Acknowledgment
  await transition(
    BookingStatus.ASSIGNED,
    BookingStatus.TEAM_ACKNOWLEDGED,
    techUser,
    'الفني: تم استلام أمر العمل والتحضير للانطلاق.'
  );
  console.log('   ✓ Tech Action: ASSIGNED ➜ TEAM_ACKNOWLEDGED');

  // 6.2 On the way
  await transition(
    BookingStatus.TEAM_ACKNOWLEDGED,
    BookingStatus.ON_THE_WAY,
    techUser,
    'الفني: الفريق في الطريق إلى موقع العميل.'
  );
  console.log('   ✓ Tech Action: TEAM_ACKNOWLEDGED ➜ ON_THE_WAY');

  // 6.3 Arrived & Stage 1 Checklists
  const prepInstance = await prisma.bookingChecklistInstance.create({
    data: {
      bookingId: booking.id,
      stage: ChecklistStage.TEAM_PREPARATION,
      completedAt: new Date(),
      completedByUserId: techUser.id,
    },
  });
  await prisma.bookingChecklistItemResult.create({
    data: {
      instanceId: prepInstance.id,
      itemId: 'item-prep-demo',
      itemLabel: 'فحص جاهزية المعدات ومستوى الماء ومواد التلميع',
      isChecked: true,
      checkedByUserId: techUser.id,
      checkedAt: new Date(),
    },
  });

  const arrivalInstance = await prisma.bookingChecklistInstance.create({
    data: {
      bookingId: booking.id,
      stage: ChecklistStage.ARRIVAL_INSPECTION,
      completedAt: new Date(),
      completedByUserId: techUser.id,
    },
  });
  await prisma.bookingChecklistItemResult.create({
    data: {
      instanceId: arrivalInstance.id,
      itemId: 'item-arrival-demo',
      itemLabel: 'فحص الخدوش وحالة الطلاء الأولي قبل البدء',
      isChecked: true,
      checkedByUserId: techUser.id,
      checkedAt: new Date(),
    },
  });

  await prisma.bookingFile.create({
    data: {
      bookingId: booking.id,
      fileType: FileType.BEFORE_SERVICE,
      fileUrl: `/uploads/demo/before_front_${booking.id}.png`,
      mimeType: 'image/png',
      sizeBytes: 250000,
      uploadedByUserId: techUser.id,
    },
  });
  await prisma.bookingFile.create({
    data: {
      bookingId: booking.id,
      fileType: FileType.BEFORE_SERVICE,
      fileUrl: `/uploads/demo/before_interior_${booking.id}.png`,
      mimeType: 'image/png',
      sizeBytes: 240000,
      uploadedByUserId: techUser.id,
    },
  });

  await transition(
    BookingStatus.ON_THE_WAY,
    BookingStatus.ARRIVED,
    techUser,
    'الفني: تم الوصول لموقع العميل وبدء إجراءات الفحص.'
  );

  await transition(
    BookingStatus.ARRIVED,
    BookingStatus.IN_SERVICE,
    techUser,
    'الفني: تم إنهاء الفحص الأولي ورفع الصور والبدء في تنفيذ الخدمة.'
  );
  console.log('   ✓ Tech Action: ARRIVED ➜ Checklists & Before Photos ➜ IN_SERVICE');

  // 6.4 Service Execution, Closing Checklist, After Photos, and Balance Collection
  const execInstance = await prisma.bookingChecklistInstance.create({
    data: {
      bookingId: booking.id,
      stage: ChecklistStage.SERVICE_EXECUTION,
      completedAt: new Date(),
      completedByUserId: techUser.id,
    },
  });
  await prisma.bookingChecklistItemResult.create({
    data: {
      instanceId: execInstance.id,
      itemId: 'item-exec-demo',
      itemLabel: 'تنفيذ مراحل الغسيل البخاري، العناية بالفرش، وتلميع الهيكل',
      isChecked: true,
      checkedByUserId: techUser.id,
      checkedAt: new Date(),
    },
  });

  const closeInstance = await prisma.bookingChecklistInstance.create({
    data: {
      bookingId: booking.id,
      stage: ChecklistStage.CLOSING,
      completedAt: new Date(),
      completedByUserId: techUser.id,
    },
  });
  await prisma.bookingChecklistItemResult.create({
    data: {
      instanceId: closeInstance.id,
      itemId: 'item-close-demo',
      itemLabel: 'مسح الزجاج النهائي والتعطير وإعادة ترتيب المتعلقات',
      isChecked: true,
      checkedByUserId: techUser.id,
      checkedAt: new Date(),
    },
  });

  await prisma.bookingFile.create({
    data: {
      bookingId: booking.id,
      fileType: FileType.AFTER_SERVICE,
      fileUrl: `/uploads/demo/after_front_${booking.id}.png`,
      mimeType: 'image/png',
      sizeBytes: 280000,
      uploadedByUserId: techUser.id,
      approvedForGallery: true,
    },
  });
  await prisma.bookingFile.create({
    data: {
      bookingId: booking.id,
      fileType: FileType.AFTER_SERVICE,
      fileUrl: `/uploads/demo/after_interior_${booking.id}.png`,
      mimeType: 'image/png',
      sizeBytes: 290000,
      uploadedByUserId: techUser.id,
      approvedForGallery: true,
    },
  });

  // Collect Remaining Cash Balance
  const remainingAmount = totalPrice - depositRequired;
  await prisma.payment.create({
    data: {
      bookingId: booking.id,
      paymentMethod: 'CASH',
      amount: remainingAmount,
      referenceNumber: `CASH-${randomUUID().slice(0, 6).toUpperCase()}`,
      recordedByUserId: techUser.id,
      notes: 'تحصيل نقدي ميداني للرصيد المتبقي عند اكتمال العمل',
    },
  });

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      amountPaid: totalPrice,
      amountDue: 0,
      paymentStatus: PaymentStatus.FULLY_PAID,
    },
  });

  await transition(
    BookingStatus.IN_SERVICE,
    BookingStatus.QUALITY_REVIEW,
    techUser,
    'الفني: تم استكمال كافة بنود العمل ورفع صور النتيجة وتحصيل المتبقي نقداً.'
  );

  console.log('   ✓ Tech Action: Execution & Closing Checklists + After Photos');
  console.log(`   ✓ Balance Collected: Remaining ${remainingAmount} EGP paid in Cash (Total Paid = ${totalPrice} EGP, Due = 0 EGP)`);
  console.log('   ✓ Status Transition: IN_SERVICE ➜ QUALITY_REVIEW');

  // 6.5 Ops Manager Quality Approval, Delivery and Closure
  await prisma.qualityReview.create({
    data: {
      bookingId: booking.id,
      reviewedByUserId: managerUser.id,
      approved: true,
      score: 5,
      notes: 'تم فحص جودة التلميع والفرش ومطابقة الصور قبل وبعد، العمل ممتاز وخالي من الملاحظات.',
      returnedToTeam: false,
    },
  });

  await transition(
    BookingStatus.QUALITY_REVIEW,
    BookingStatus.SERVICE_COMPLETED,
    managerUser,
    'مدير التشغيل: تم اعتماد مراجعة الجودة بدرجة 5/5.'
  );

  await transition(
    BookingStatus.SERVICE_COMPLETED,
    BookingStatus.DELIVERED,
    managerUser,
    'تم تسليم السيارة للعميل بنجاح واستلام المفتاح.'
  );

  await transition(
    BookingStatus.DELIVERED,
    BookingStatus.CLOSED,
    managerUser,
    'تم إغلاق الحجز وتصفير المستحقات المالية بالكامل.'
  );

  console.log('   ✓ Ops Manager Action: Approved Quality Review (Score 5/5)');
  console.log('   ✓ Status Transition: QUALITY_REVIEW ➜ SERVICE_COMPLETED ➜ DELIVERED ➜ CLOSED');

  // --------------------------------------------------------------------------
  // FINAL STEP: VERIFY OWNER ANALYTICS & AUDIT TRAIL
  // --------------------------------------------------------------------------
  console.log('\n📊 [VERIFICATION] Owner Command Center & Financial Audit Verification:');

  const finalBooking = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    include: {
      payments: true,
      statusHistory: { orderBy: { createdAt: 'asc' } },
      qualityReview: true,
      files: true,
    },
  });

  const branchTotalRevenue = await prisma.payment.aggregate({
    where: {
      booking: { branchId: branch.id },
    },
    _sum: { amount: true },
    _count: true,
  });

  const closedCount = await prisma.booking.count({
    where: { branchId: branch.id, bookingStatus: BookingStatus.CLOSED },
  });

  const auditCount = await prisma.auditLog.count({
    where: { entityType: 'Booking', entityId: booking.id },
  });

  console.log(`   ⭐ Final Booking Status: ${finalBooking.bookingStatus}`);
  console.log(`   ⭐ Final Payment Status: ${finalBooking.paymentStatus}`);
  console.log(`   ⭐ Total Paid: ${finalBooking.amountPaid} EGP | Amount Due: ${finalBooking.amountDue} EGP`);
  console.log(`   ⭐ Payments Recorded: ${finalBooking.payments.length} ledger entries (${finalBooking.payments.map((p) => `${p.amount} EGP via ${p.paymentMethod}`).join(' + ')})`);
  console.log(`   ⭐ Status Transitions Traversed: ${finalBooking.statusHistory.length} states in sequence`);
  console.log(`   ⭐ Evidence Files Stored: ${finalBooking.files.length} files (Proof + Before + After)`);
  console.log(`   ⭐ Quality Review: Approved = ${finalBooking.qualityReview?.approved} | Score = ${finalBooking.qualityReview?.score}/5`);
  console.log(`   ⭐ Branch Total Revenue Recorded: ${branchTotalRevenue._sum.amount} EGP across ${branchTotalRevenue._count} transactions`);
  console.log(`   ⭐ Closed Bookings Count: ${closedCount}`);
  console.log(`   ⭐ Audit Logs Written: ${auditCount} audit entries`);

  console.log('\n===============================================================');
  console.log('🎉 LIFECYCLE SIMULATION COMPLETED WITH 100% SUCCESS & ZERO ERRORS');
  console.log('===============================================================\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Simulation Failed with Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
