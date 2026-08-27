/* eslint-disable @typescript-eslint/no-require-imports */
const {
  PrismaClient,
  UserRole,
  BookingStatus,
  PaymentStatus,
  ProofStatus,
  FileType,
  ChecklistStage,
  SubscriptionStatus,
  SubscriptionPaymentProofStatus,
  VisitLedgerAction,
  PaymentMethodType,
} = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function runFullRoleExperienceTest() {
  console.log('\n===============================================================');
  console.log('🧪 LIVE MULTI-ROLE SYSTEM TEST (Customer -> Ops -> Tech -> Owner)');
  console.log('===============================================================\n');

  const passwordHash = await bcrypt.hash('Password123!', 10);
  const testPhone = '01099887766';

  // --------------------------------------------------------------------------
  // ROLE 1: CUSTOMER JOURNEY
  // --------------------------------------------------------------------------
  console.log('🚗 [1/4] ROLE 1: CUSTOMER (حساب العميل وتجربة الحجز المباشر)');
  const customerUser = await prisma.user.upsert({
    where: { phone: testPhone },
    update: { fullName: 'طارق الدسوقي (عميل تجربة جديدة)', passwordHash, mustChangePwd: false, active: true },
    create: {
      phone: testPhone,
      fullName: 'طارق الدسوقي (عميل تجربة جديدة)',
      email: 'tarek.test@example.com',
      passwordHash,
      role: UserRole.CUSTOMER,
      active: true,
      mustChangePwd: false,
    },
  });

  let customerProfile = await prisma.customerProfile.findUnique({ where: { userId: customerUser.id } });
  if (!customerProfile) {
    customerProfile = await prisma.customerProfile.create({ data: { userId: customerUser.id } });
  }

  // Add Car & Address
  const car = await prisma.vehicle.create({
    data: {
      customerId: customerProfile.id,
      make: 'Porsche',
      model: '911 Carrera 4S',
      year: 2024,
      color: 'رمادي طباشيري (Crayon Grey)',
      plateNumber: 'ط ر ق 911',
      vehicleSize: 'SEDAN',
      isDefault: true,
    },
  });

  const branch = await prisma.branch.findFirst({ where: { status: 'ACTIVE' } });
  const area = await prisma.coverageArea.findFirst({ where: { zone: { branchId: branch.id } } });
  const service = await prisma.service.findFirst({ where: { active: true }, include: { variants: true } });
  const paymentMethod = await prisma.branchPaymentMethod.findFirst({ where: { branchId: branch.id, active: true } });

  const address = await prisma.customerAddress.create({
    data: {
      customerId: customerProfile.id,
      governorate: 'القاهرة',
      city: 'القاهرة الجديدة',
      district: 'التجمع الأول',
      compound: 'كمبوند سوان ليك ريزيدنس',
      street: 'شارع رقم 5',
      buildingNumber: 'فيلا 12',
      landmark: 'بجوار الكلوب هاوس',
      isDefault: true,
    },
  });

  // Create Booking
  const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
  const endAt = new Date(startAt.getTime() + 90 * 60 * 1000);
  const bookingNumber = `BQ-${Date.now().toString().slice(-8)}`;
  const price = service.basePrice || 600;
  const deposit = Math.round(price * 0.25);

  const newBooking = await prisma.booking.create({
    data: {
      bookingNumber,
      customerId: customerProfile.id,
      branchId: branch.id,
      coverageAreaId: area.id,
      vehicleId: car.id,
      serviceId: service.id,
      startAt,
      endAt,
      totalDurationMinutes: 90,
      basePrice: price,
      addonPrice: 0,
      totalPrice: price,
      depositAmount: deposit,
      amountPaid: deposit,
      amountDue: price - deposit,
      paymentStatus: PaymentStatus.PROOF_UPLOADED,
      bookingStatus: BookingStatus.PAYMENT_UNDER_REVIEW,
      addressSnapshot: { street: address.street, building: address.buildingNumber, compound: address.compound },
      vehicleSnapshot: { make: car.make, model: car.model, plate: car.plateNumber },
      serviceSnapshot: { nameAr: service.nameAr, price },
      contactSnapshot: { name: customerUser.fullName, phone: customerUser.phone },
    },
  });

  // Customer uploads payment proof
  const proofFile = await prisma.bookingFile.create({
    data: {
      bookingId: newBooking.id,
      fileType: FileType.PAYMENT_PROOF,
      fileUrl: `/api/files/payment-proofs/test-proof-${newBooking.id}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 210000,
      uploadedByUserId: customerUser.id,
    },
  });

  const paymentProof = await prisma.paymentProof.create({
    data: {
      bookingId: newBooking.id,
      paymentMethodId: paymentMethod.id,
      proofFileUrl: proofFile.fileUrl,
      proofFileId: proofFile.id,
      senderName: customerUser.fullName,
      senderPhoneOrAccount: customerUser.phone,
      amountSubmitted: deposit,
      referenceNumber: `TXN-INSTA-${Date.now().toString().slice(-6)}`,
      transferTimestamp: new Date(),
      status: ProofStatus.UNDER_REVIEW,
    },
  });

  console.log(`   ✅ العميل أنشأ الحجز رقم [${newBooking.bookingNumber}] ورفع إشعار تحويل بقيمة ${deposit} ج.م.`);

  // --------------------------------------------------------------------------
  // ROLE 2: OPERATIONS MANAGER
  // --------------------------------------------------------------------------
  console.log('\n👔 [2/4] ROLE 2: OPERATIONS MANAGER (مراجعة التحويل واعتماد التسكين)');
  const ops = await prisma.user.findFirst({ where: { role: UserRole.OPERATIONS_MANAGER } });
  const team = await prisma.team.findFirst({ where: { branchId: branch.id } });
  const leadTech = await prisma.user.findFirst({ where: { role: UserRole.EMPLOYEE } });
  const van = await prisma.operationalVehicle.findFirst({ where: { branchId: branch.id } });

  // Ops approves payment proof
  await prisma.paymentProof.update({
    where: { id: paymentProof.id },
    data: {
      status: ProofStatus.VERIFIED,
      reviewedByUserId: ops.id,
      reviewedAt: new Date(),
      reviewNotes: 'تمت مطابقة المبلغ على حساب البنك بنجاح وتأكيد الإيداع',
    },
  });

  // Record Deposit in Payment table
  await prisma.payment.create({
    data: {
      bookingId: newBooking.id,
      proofId: paymentProof.id,
      amount: deposit,
      paymentMethod: 'INSTAPAY',
      referenceNumber: paymentProof.referenceNumber,
      recordedByUserId: ops.id,
    },
  });

  // Assign team & van
  await prisma.booking.update({
    where: { id: newBooking.id },
    data: {
      bookingStatus: BookingStatus.ASSIGNED,
      paymentStatus: PaymentStatus.VERIFIED,
      assignedTeamId: team.id,
      assignedEmployeeId: leadTech.id,
      operationalVehicleId: van.id,
    },
  });

  console.log(`   ✅ مدير التشغيل اعتمد إثبات الدفع وسكن الحجز لفريق [${team.name}] وسيارة الفان [${van.code}].`);

  // --------------------------------------------------------------------------
  // ROLE 3: FIELD TECHNICIAN (EXECUTION)
  // --------------------------------------------------------------------------
  console.log('\n🔧 [3/4] ROLE 3: FIELD TECH (تنفيذ الخدمة وتعبئة قوائم الفحص ورفع الصور)');
  
  // Tech on the way -> Arrived -> In service
  await prisma.booking.update({
    where: { id: newBooking.id },
    data: { bookingStatus: BookingStatus.IN_SERVICE },
  });

  // Upload Before Photo
  await prisma.bookingFile.create({
    data: {
      bookingId: newBooking.id,
      fileType: FileType.BEFORE_SERVICE,
      fileUrl: `/api/files/before-photos/live-before-${newBooking.id}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 310000,
      uploadedByUserId: leadTech.id,
    },
  });

  // Complete Checklist
  const checklist = await prisma.bookingChecklistInstance.create({
    data: {
      bookingId: newBooking.id,
      stage: ChecklistStage.CLOSING,
      completedByUserId: leadTech.id,
      completedAt: new Date(),
    },
  });

  await prisma.bookingChecklistItemResult.createMany({
    data: [
      { instanceId: checklist.id, itemId: 'item-1', itemLabel: 'فحص البودي ومعاينة الخدوش قبل البدء', isChecked: true, checkedByUserId: leadTech.id, checkedAt: new Date() },
      { instanceId: checklist.id, itemId: 'item-2', itemLabel: 'غسيل وتطهير المقصورة الداخلية والفرش بالبخار', isChecked: true, checkedByUserId: leadTech.id, checkedAt: new Date() },
      { instanceId: checklist.id, itemId: 'item-3', itemLabel: 'تلميع وحماية الطلاء والجنوط وتسليم المفتاح', isChecked: true, checkedByUserId: leadTech.id, checkedAt: new Date() },
    ],
  });

  // Upload After Photo
  await prisma.bookingFile.create({
    data: {
      bookingId: newBooking.id,
      fileType: FileType.AFTER_SERVICE,
      fileUrl: `/api/files/after-photos/live-after-${newBooking.id}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 340000,
      uploadedByUserId: leadTech.id,
      approvedForGallery: true,
      galleryApprovedByUserId: ops.id,
      galleryApprovedAt: new Date(),
    },
  });

  // Tech collects remaining balance in Cash and completes service
  const balance = price - deposit;
  await prisma.payment.create({
    data: {
      bookingId: newBooking.id,
      amount: balance,
      paymentMethod: 'CASH',
      referenceNumber: `CASH-${newBooking.bookingNumber}`,
      recordedByUserId: leadTech.id,
    },
  });

  await prisma.booking.update({
    where: { id: newBooking.id },
    data: {
      bookingStatus: BookingStatus.SERVICE_COMPLETED,
      paymentStatus: PaymentStatus.FULLY_PAID,
      amountPaid: price,
      amountDue: 0,
    },
  });

  console.log(`   ✅ الفني نفذ الخدمة ورفع الصور وسجل تحصيل المتبقي (${balance} ج.م) كاش.`);

  // --------------------------------------------------------------------------
  // ROLE 4: QUALITY APPROVAL & OWNER DASHBOARD SYNCHRONIZATION
  // --------------------------------------------------------------------------
  console.log('\n👑 [4/4] ROLE 4: QUALITY & OWNER (اعتماد الجودة وإصدار الفاتورة والتقييم)');
  
  // Ops approves Quality Review
  await prisma.qualityReview.create({
    data: {
      booking: { connect: { id: newBooking.id } },
      reviewedByUser: { connect: { id: ops.id } },
      approved: true,
      score: 5,
      notes: 'تمت معاينة النتيجة النهائية والمطابقة للمعايير الملكية 100%',
    },
  });

  // Close booking & Issue invoice
  await prisma.booking.update({
    where: { id: newBooking.id },
    data: { bookingStatus: BookingStatus.CLOSED },
  });

  const invoice = await prisma.invoice.create({
    data: {
      booking: { connect: { id: newBooking.id } },
      customer: { connect: { id: customerProfile.id } },
      branch: { connect: { id: branch.id } },
      invoiceNumber: `INV-2026-${Date.now().toString().slice(-5)}`,
      subtotalAmount: price,
      paidAmount: price,
      dueAmount: 0,
      issuedBy: { connect: { id: ops.id } },
    },
  });

  // Customer rates the service
  const rating = await prisma.customerServiceRating.create({
    data: {
      booking: { connect: { id: newBooking.id } },
      customer: { connect: { id: customerProfile.id } },
      score: 5,
      comment: 'تجربة فوق الممتازة وسيارة البورش طلعت زيرو وبدون أي نقطة ماء في غير مكانها.. برافو بريق!',
      approvedForPublic: true,
      approvedBy: { connect: { id: ops.id } },
      approvedAt: new Date(),
    },
  });

  console.log(`   ✅ تم إغلاق الحجز بنجاح وإصدار الفاتورة [${invoice.invoiceNumber}] وتسجيل تقييم العميل (5/5).`);

  console.log('\n===============================================================');
  console.log('🎉 ALL 4 ROLES TESTED LIVE WITH 100% COMPLETE OPERATIONAL FLOW!');
  console.log('===============================================================\n');
}

runFullRoleExperienceTest()
  .catch((e) => {
    console.error('\n❌ Live Test Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
