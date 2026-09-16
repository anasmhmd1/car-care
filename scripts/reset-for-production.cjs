/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

const { PrismaClient, UserRole } = require('@prisma/client');
const { loadEnvConfig } = require('@next/env');
const fs = require('node:fs');
const path = require('node:path');

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  console.log('===============================================================');
  console.log('🚀 BAREEQ — PRODUCTION DATABASE RESET & SANITIZATION');
  console.log('===============================================================\n');

  // STEP 1: Verify and backup the real Owner credentials
  console.log('👤 [1/7] Verifying Owner account...');
  const existingOwner = await prisma.user.findFirst({
    where: {
      OR: [
        { id: 'seed-user-owner' },
        { email: 'bbareeq1@gmail.com' },
      ],
    },
  });

  if (!existingOwner) {
    throw new Error('Owner account (seed-user-owner / bbareeq1@gmail.com) not found in database!');
  }

  const ownerPayload = {
    id: 'seed-user-owner',
    fullName: existingOwner.fullName || 'كريم',
    phone: existingOwner.phone || '201111111111',
    email: 'bbareeq1@gmail.com',
    passwordHash: existingOwner.passwordHash,
    role: UserRole.OWNER,
    active: true,
    mustChangePwd: false,
  };

  console.log(`✓ Owner account preserved: ${ownerPayload.fullName} (${ownerPayload.email} / ${ownerPayload.phone})`);

  // STEP 2: Truncate all operational and test transaction tables
  console.log('\n🗑️  [2/7] Truncating operational, financial, and test activity tables...');

  const tablesToTruncate = [
    'BookingChecklistItemResult',
    'BookingChecklistInstance',
    'BookingFile',
    'BookingNote',
    'BookingTimeChange',
    'BookingStatusHistory',
    'BookingAssignmentHistory',
    'BookingAssignment',
    'BookingHold',
    'BookingAddon',
    'BookingItem',
    'CancellationRequest',
    'ComplaintEvidence',
    'Complaint',
    'CustomerServiceRating',
    'QualityReview',
    'PaymentReview',
    'Payment',
    'PaymentProof',
    'Refund',
    'Invoice',
    'Booking',
    'CustomerCreditTransaction',
    'SubscriptionVisitLedger',
    'SubscriptionVehicle',
    'SubscriptionPaymentProof',
    'CustomerSubscription',
    'SubscriptionPlanBranch',
    'SubscriptionPlanService',
    'SubscriptionPlan',
    'Vehicle',
    'CustomerAddress',
    'CustomerProfile',
    'CustomerConsent',
    'Session',
    'PasswordResetRequest',
    'SecurityThrottle',
    'SecurityEvent',
    'AuditLog',
    'EmployeeMaterialStock',
    'EmployeeTimeOff',
    'TeamTimeOff',
    'TeamMember',
    'BranchRequest',
  ];

  for (const table of tablesToTruncate) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
      console.log(`  - Truncated "${table}"`);
    } catch (err) {
      console.warn(`  ! Note on "${table}": ${err.message}`);
    }
  }

  // STEP 3: Remove all non-owner users
  console.log('\n👥 [3/7] Purging test users and ensuring Owner account is clean...');
  await prisma.userPermission.deleteMany({
    where: { userId: { not: ownerPayload.id } },
  });

  // Detach any team leaders before deleting test users
  await prisma.team.updateMany({
    data: { leaderId: null },
  });

  const deletedUsers = await prisma.user.deleteMany({
    where: { id: { not: ownerPayload.id } },
  });
  console.log(`✓ Deleted ${deletedUsers.count} test / E2E / dummy users.`);

  // Ensure owner record exists with exact credentials
  await prisma.user.upsert({
    where: { id: ownerPayload.id },
    update: {
      fullName: ownerPayload.fullName,
      email: ownerPayload.email,
      phone: ownerPayload.phone,
      passwordHash: ownerPayload.passwordHash,
      role: UserRole.OWNER,
      active: true,
      mustChangePwd: false,
    },
    create: ownerPayload,
  });
  console.log('✓ Owner account confirmed.');

  // STEP 4: Clean up branches and keep Sheikh Zayed as official branch
  console.log('\n🏢 [4/7] Cleaning branches and coverage zones...');
  
  // Delete test branches (BRQ-OPS-033, CAI-NC-DEMO)
  const deletedBranches = await prisma.branch.deleteMany({
    where: { id: { not: 'seed-branch-zayed' } },
  });
  console.log(`✓ Deleted ${deletedBranches.count} test branch(es).`);

  // Verify / Upsert Zayed branch
  const zayedBranch = await prisma.branch.upsert({
    where: { id: 'seed-branch-zayed' },
    update: {
      nameAr: 'فرع الشيخ زايد الرئيسي',
      nameEn: 'Bareeq Sheikh Zayed Branch',
      code: 'ZAYED-01',
      address: 'الشيخ زايد - الحي المتميز - محور 26 يوليو',
      phone: '01099998888',
      whatsapp: '201099998888',
      status: 'ACTIVE',
      timezone: 'Africa/Cairo',
      slotUnitMinutes: 60,
      arrivalWindowMinutes: 30,
      travelBufferMinutes: 30,
      restBufferMinutes: 0,
      dailyBookingLimit: 25,
      assignmentMode: 'MANUAL',
    },
    create: {
      id: 'seed-branch-zayed',
      nameAr: 'فرع الشيخ زايد الرئيسي',
      nameEn: 'Bareeq Sheikh Zayed Branch',
      code: 'ZAYED-01',
      address: 'الشيخ زايد - الحي المتميز - محور 26 يوليو',
      phone: '01099998888',
      whatsapp: '201099998888',
      status: 'ACTIVE',
      timezone: 'Africa/Cairo',
      slotUnitMinutes: 60,
      arrivalWindowMinutes: 30,
      travelBufferMinutes: 30,
      restBufferMinutes: 0,
      dailyBookingLimit: 25,
      assignmentMode: 'MANUAL',
    },
  });

  // Clean test coverage zones (keep only standard zones)
  const deletedTestZones = await prisma.coverageZone.deleteMany({
    where: {
      branchId: zayedBranch.id,
      id: { notIn: ['seed-coverage-zone-1', 'seed-coverage-zone-2', 'seed-coverage-zone-3'] },
    },
  });
  if (deletedTestZones.count > 0) {
    console.log(`✓ Removed ${deletedTestZones.count} test coverage zones.`);
  }

  // Remove test teams, keep 2 clean production teams ready
  await prisma.team.deleteMany({
    where: { branchId: zayedBranch.id, id: { notIn: ['seed-team-alpha', 'seed-team-beta'] } },
  });

  await prisma.team.upsert({
    where: { id: 'seed-team-alpha' },
    update: { name: 'فريق بريق 1 (Alpha)', branchId: zayedBranch.id, active: true, leaderId: null },
    create: { id: 'seed-team-alpha', name: 'فريق بريق 1 (Alpha)', branchId: zayedBranch.id, active: true },
  });

  await prisma.team.upsert({
    where: { id: 'seed-team-beta' },
    update: { name: 'فريق بريق 2 (Beta)', branchId: zayedBranch.id, active: true, leaderId: null },
    create: { id: 'seed-team-beta', name: 'فريق بريق 2 (Beta)', branchId: zayedBranch.id, active: true },
  });

  // Ensure Owner branch membership
  await prisma.branchMembership.deleteMany({
    where: { userId: ownerPayload.id },
  });
  await prisma.branchMembership.create({
    data: {
      branchId: zayedBranch.id,
      userId: ownerPayload.id,
    },
  });
  console.log('✓ Main branch and clean coverage zones ready.');

  // STEP 5: Clean catalog (remove junk test service)
  console.log('\n🧼 [5/7] Cleaning catalog services...');
  const deletedJunkServices = await prisma.service.deleteMany({
    where: { slug: 'bareeq-essential-ex' },
  });
  if (deletedJunkServices.count > 0) {
    console.log(`✓ Removed ${deletedJunkServices.count} junk test service(s).`);
  }

  // Activate standard branch services for Zayed branch
  const officialServices = await prisma.service.findMany({
    where: { active: true },
    select: { id: true, slug: true, nameAr: true, basePrice: true, durationMinutes: true },
  });

  for (const svc of officialServices) {
    await prisma.branchService.upsert({
      where: {
        branchId_serviceId: {
          branchId: zayedBranch.id,
          serviceId: svc.id,
        },
      },
      update: { active: true, bookableOnline: true },
      create: {
        branchId: zayedBranch.id,
        serviceId: svc.id,
        active: true,
        bookableOnline: true,
        priceOverride: svc.basePrice,
        durationOverrideMinutes: svc.durationMinutes,
      },
    });
  }
  console.log(`✓ ${officialServices.length} official services confirmed & linked to main branch.`);

  // STEP 6: Verify BrandSettings and CancellationPolicy
  console.log('\n⚙️  [6/7] Ensuring BrandSettings & Default CancellationPolicy...');
  await prisma.brandSettings.upsert({
    where: { singletonKey: 'BAREEQ' },
    update: { brandNameAr: 'بريق', brandNameEn: 'Bareeq', maxBranches: 1 },
    create: {
      id: 'seed-brand-bareeq',
      singletonKey: 'BAREEQ',
      brandNameAr: 'بريق',
      brandNameEn: 'Bareeq',
      maxBranches: 1,
    },
  });

  await prisma.cancellationPolicy.upsert({
    where: { code: 'standard-cancellation' },
    update: { active: true, isDefault: true },
    create: {
      id: 'seed-cancellation-policy-standard',
      code: 'standard-cancellation',
      nameAr: 'سياسة الإلغاء القياسية',
      version: '2026-08-01',
      noticeHours: 6,
      allowsCancellation: true,
      allowsRescheduling: true,
      allowsLateRequests: true,
      policyTextAr: 'يمكن للعميل تقديم طلب الإلغاء حتى قبل بدء موعد الخدمة...',
      active: true,
      isDefault: true,
    },
  });
  console.log('✓ Brand settings and cancellation policy verified.');

  // STEP 7: Clean temporary uploads on disk
  console.log('\n📁 [7/7] Cleaning temporary test uploads from disk...');
  const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
  const tempFolders = [
    'after-photos',
    'before-photos',
    'payment-proofs',
    'seed-after',
    'seed-before',
    'seed-checklists',
    'seed-payment-proofs',
  ];

  for (const folder of tempFolders) {
    const folderPath = path.join(uploadsDir, folder);
    if (fs.existsSync(folderPath)) {
      try {
        const files = fs.readdirSync(folderPath);
        for (const file of files) {
          if (file !== '.gitkeep') {
            fs.unlinkSync(path.join(folderPath, file));
          }
        }
        console.log(`  - Emptied "${folder}"`);
      } catch (err) {
        console.warn(`  ! Could not empty "${folder}": ${err.message}`);
      }
    }
  }
  console.log('✓ Disk temporary uploads cleaned. Catalog media preserved.');

  console.log('\n===============================================================');
  console.log('✅ DATABASE RESET COMPLETED SUCCESSFULLY FOR PRODUCTION!');
  console.log('===============================================================');
}

main()
  .catch((err) => {
    console.error('\n❌ Reset failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
