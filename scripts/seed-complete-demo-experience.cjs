/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

const {
  PrismaClient,
  UserRole,
  BranchStatus,
  VehicleSize,
  BookingStatus,
  PaymentStatus,
  PaymentMethodType,
  SubscriptionStatus,
  VisitLedgerAction,
  ProofStatus,
  FileType,
} = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

const DEMO_PASS = '12345678';
const OWNER_PASS = '0000000000';

async function main() {
  console.log('\n===============================================================');
  console.log('🌟 BAREEQ / CAR CARE — COMPREHENSIVE MULTI-ROLE DEMO SEEDER');
  console.log('===============================================================\n');

  const demoPassHash = await bcrypt.hash(DEMO_PASS, 10);
  const ownerPassHash = await bcrypt.hash(OWNER_PASS, 10);

  // --------------------------------------------------------------------------
  // 1. ENSURE MAIN BRANCHES EXIST
  // --------------------------------------------------------------------------
  console.log('🏢 [1/5] Verifying Branches & Infrastructure...');

  const branchZayed = await prisma.branch.upsert({
    where: { code: 'ZAYED-01' },
    update: {
      nameAr: 'فرع الشيخ زايد الرئيسي',
      nameEn: 'Sheikh Zayed Main Branch',
      status: BranchStatus.ACTIVE,
      phone: '01099998888',
      whatsapp: '201099998888',
      address: 'الشيخ زايد - الحي المتميز - محور 26 يوليو',
    },
    create: {
      code: 'ZAYED-01',
      nameAr: 'فرع الشيخ زايد الرئيسي',
      nameEn: 'Sheikh Zayed Main Branch',
      address: 'الشيخ زايد - الحي المتميز - محور 26 يوليو',
      phone: '01099998888',
      whatsapp: '201099998888',
      status: BranchStatus.ACTIVE,
      timezone: 'Africa/Cairo',
      slotUnitMinutes: 60,
      arrivalWindowMinutes: 30,
      travelBufferMinutes: 30,
      restBufferMinutes: 15,
      dailyBookingLimit: 30,
      assignmentMode: 'MANUAL',
    },
  });

  const branchCairo = await prisma.branch.upsert({
    where: { code: 'CAI-NC-01' },
    update: {
      nameAr: 'فرع القاهرة الجديدة - التجمع',
      nameEn: 'New Cairo Branch',
      status: BranchStatus.ACTIVE,
      phone: '01000000100',
      whatsapp: '20100000100',
      address: 'شارع التسعين الشمالي - التجمع الخامس',
    },
    create: {
      code: 'CAI-NC-01',
      nameAr: 'فرع القاهرة الجديدة - التجمع',
      nameEn: 'New Cairo Branch',
      address: 'شارع التسعين الشمالي - التجمع الخامس',
      phone: '01000000100',
      whatsapp: '20100000100',
      status: BranchStatus.ACTIVE,
      timezone: 'Africa/Cairo',
      slotUnitMinutes: 60,
      arrivalWindowMinutes: 30,
      travelBufferMinutes: 30,
      restBufferMinutes: 15,
      dailyBookingLimit: 30,
      assignmentMode: 'MANUAL',
    },
  });

  console.log(`✓ Zayed Branch: ${branchZayed.nameAr} [${branchZayed.id}]`);
  console.log(`✓ Cairo Branch: ${branchCairo.nameAr} [${branchCairo.id}]`);

  // --------------------------------------------------------------------------
  // 2. CREATE TEAMS & VEHICLES
  // --------------------------------------------------------------------------
  console.log('\n🚐 [2/5] Configuring Mobile Detailing Vans & Teams...');

  let teamAlpha = await prisma.team.findFirst({
    where: { branchId: branchZayed.id, name: { contains: 'الصقور' } },
  });
  if (!teamAlpha) {
    teamAlpha = await prisma.team.create({
      data: {
        branchId: branchZayed.id,
        name: 'فريق الصقور (Team Alpha)',
        dailyCapacity: 8,
        active: true,
      },
    });
  }

  let teamBeta = await prisma.team.findFirst({
    where: { branchId: branchCairo.id, name: { contains: 'النجوم' } },
  });
  if (!teamBeta) {
    teamBeta = await prisma.team.create({
      data: {
        branchId: branchCairo.id,
        name: 'فريق النجوم (Team Beta)',
        dailyCapacity: 8,
        active: true,
      },
    });
  }

  // --------------------------------------------------------------------------
  // 3. SEED ALL DEMO USERS ACROSS ROLES
  // --------------------------------------------------------------------------
  console.log('\n👥 [3/5] Seeding Rich Multi-Role Demo Accounts...');

  const demoAccounts = [
    // 1. OWNER
    {
      id: 'seed-user-owner',
      phone: '0000000000',
      fullName: 'كريم المنشاوي (المالك العام - Owner)',
      email: 'owner@carcare.com',
      role: UserRole.OWNER,
      passwordHash: ownerPassHash,
      branchId: branchZayed.id,
    },
    {
      id: 'demo-user-owner-alt',
      phone: '01000000001',
      fullName: 'كريم المنشاوي (المالك - هاتف بديل)',
      email: 'owner.mobile@carcare.com',
      role: UserRole.OWNER,
      passwordHash: demoPassHash,
      branchId: branchZayed.id,
    },

    // 2. SYSTEM SUPER ADMIN
    {
      id: 'seed-user-superadmin',
      phone: '01000000000',
      fullName: 'م. عادل الشريف (مدير النظام العام - Super Admin)',
      email: 'admin@carcare.com',
      role: UserRole.SYSTEM_SUPER_ADMIN,
      passwordHash: demoPassHash,
    },

    // 3. OPERATIONS MANAGERS
    {
      id: 'demo-user-ops-zayed',
      phone: '01000000002',
      fullName: 'م. حسام الدين (مدير تشغيل فرع الشيخ زايد)',
      email: 'ops.zayed@carcare.com',
      role: UserRole.OPERATIONS_MANAGER,
      passwordHash: demoPassHash,
      branchId: branchZayed.id,
    },
    {
      id: 'demo-user-ops-cairo',
      phone: '01152170339',
      fullName: 'م. يوسف أشرف (مدير تشغيل فرع التجمع)',
      email: 'ops.cairo@carcare.com',
      role: UserRole.OPERATIONS_MANAGER,
      passwordHash: demoPassHash,
      branchId: branchCairo.id,
    },

    // 4. FIELD TECHNICIANS & CREW LEADERS
    {
      id: 'demo-user-tech-alpha',
      phone: '01000000003',
      fullName: 'كابتن حسام إبراهيم (قائد فريق الصقور - زايد)',
      email: 'tech.hossam@carcare.com',
      role: UserRole.EMPLOYEE,
      passwordHash: demoPassHash,
      branchId: branchZayed.id,
      teamId: teamAlpha.id,
      isLeader: true,
    },
    {
      id: 'demo-user-tech-beta',
      phone: '01124156626',
      fullName: 'كابتن كريم ممدوح (قائد فريق النجوم - التجمع)',
      email: 'tech.karim@carcare.com',
      role: UserRole.EMPLOYEE,
      passwordHash: demoPassHash,
      branchId: branchCairo.id,
      teamId: teamBeta.id,
      isLeader: true,
    },
    {
      id: 'demo-user-tech-specialist',
      phone: '01234567891',
      fullName: 'نور الدين علي (أخصائي نانو سيراميك وتلميع)',
      email: 'tech.nour@carcare.com',
      role: UserRole.EMPLOYEE,
      passwordHash: demoPassHash,
      branchId: branchZayed.id,
      teamId: teamAlpha.id,
      isLeader: false,
    },

    // 5. CUSTOMERS (DIFFERENT PERSONAS)
    // Customer 1: VIP Subscriber (Porsche 911 Carrera, Active VIP Plan, Wallet Credit)
    {
      id: 'demo-user-customer-vip',
      phone: '01000000004',
      fullName: 'أحمد المنصوري (عميل VIP - باقة بريق الملكية)',
      email: 'ahmed.vip@example.com',
      role: UserRole.CUSTOMER,
      passwordHash: demoPassHash,
      car: {
        make: 'Porsche',
        model: '911 Carrera 4S',
        year: 2024,
        color: 'Crayon Grey (رمادي طباشيري)',
        size: VehicleSize.SEDAN,
        plateNumber: 'ط ر ق 911',
      },
      address: {
        city: 'الشيخ زايد',
        compound: 'كمبوند الربوة (Al Rabwa)',
        district: 'الحي المتميز',
        street: 'شارع رقم 7',
        buildingNumber: 'فيلا 15',
      },
      walletCredit: 350,
    },

    // Customer 2: Active Booking In Progress (Mercedes S-Class 500)
    {
      id: 'demo-user-customer-active',
      phone: '01099887766',
      fullName: 'طارق الدسوقي (عميل لديه حجز جاري تنفيذه)',
      email: 'tarek.active@example.com',
      role: UserRole.CUSTOMER,
      passwordHash: demoPassHash,
      car: {
        make: 'Mercedes-Benz',
        model: 'S-Class 500 AMG',
        year: 2025,
        color: 'Obsidian Black Metallic (أسود ملكي)',
        size: VehicleSize.LARGE_SUV,
        plateNumber: 'م ر س 500',
      },
      address: {
        city: 'القاهرة الجديدة',
        compound: 'كمبوند سوان ليك (Swan Lake)',
        district: 'التجمع الأول',
        street: 'شارع الجزيرة',
        buildingNumber: 'فيلا 88',
      },
      walletCredit: 100,
    },

    // Customer 3: Completed Bookings & Reviews (BMW 7-Series)
    {
      id: 'demo-user-customer-history',
      phone: '01511111111',
      fullName: 'د. محمود فهمي (عميل دائم - سجل مكتمل)',
      email: 'mahmoud.history@example.com',
      role: UserRole.CUSTOMER,
      passwordHash: demoPassHash,
      car: {
        make: 'BMW',
        model: '7-Series 740i M-Sport',
        year: 2024,
        color: 'Mineral White Metallic (أبيض لؤلؤي)',
        size: VehicleSize.SEDAN,
        plateNumber: 'ب م و 740',
      },
      address: {
        city: 'الشيخ زايد',
        compound: 'بالم هيلز (Palm Hills)',
        district: 'بالم فالي',
        street: 'شارع النخيل',
        buildingNumber: 'فيلا 21',
      },
      walletCredit: 50,
    },

    // Customer 4: Fresh Customer Ready to Book (Range Rover Sport)
    {
      id: 'demo-user-customer-new',
      phone: '01522222222',
      fullName: 'سارة يوسف (عميلة جديدة جاهزة للحجز)',
      email: 'sara.new@example.com',
      role: UserRole.CUSTOMER,
      passwordHash: demoPassHash,
      car: {
        make: 'Land Rover',
        model: 'Range Rover Sport Autobiography',
        year: 2024,
        color: 'Santorini Black',
        size: VehicleSize.SUV,
        plateNumber: 'س ر 2024',
      },
      address: {
        city: 'القاهرة الجديدة',
        compound: 'ميفيدا (Mivida)',
        district: 'التجمع الخامس',
        street: 'بوليفارد ميفيدا',
        buildingNumber: 'عمارة 14 شقة 3',
      },
      walletCredit: 0,
    },
  ];

  for (const account of demoAccounts) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { id: account.id },
          { phone: account.phone },
          { phone: '20' + account.phone.slice(1) },
          { email: account.email },
        ],
      },
    });

    const targetId = existing?.id || account.id;

    const user = await prisma.user.upsert({
      where: { id: targetId },
      update: {
        phone: account.phone,
        fullName: account.fullName,
        email: account.email,
        role: account.role,
        passwordHash: account.passwordHash,
        active: true,
        mustChangePwd: false,
      },
      create: {
        id: targetId,
        phone: account.phone,
        fullName: account.fullName,
        email: account.email,
        role: account.role,
        passwordHash: account.passwordHash,
        active: true,
        mustChangePwd: false,
      },
    });

    // Handle Branch Memberships
    if (account.branchId) {
      await prisma.branchMembership.upsert({
        where: {
          branchId_userId: {
            branchId: account.branchId,
            userId: user.id,
          },
        },
        update: {},
        create: {
          branchId: account.branchId,
          userId: user.id,
        },
      });
    }

    // Handle Team Memberships
    if (account.teamId) {
      await prisma.teamMember.upsert({
        where: { userId: user.id },
        update: {
          teamId: account.teamId,
          isLeader: account.isLeader || false,
        },
        create: {
          teamId: account.teamId,
          userId: user.id,
          isLeader: account.isLeader || false,
        },
      });

      if (account.isLeader) {
        await prisma.team.update({
          where: { id: account.teamId },
          data: { leaderId: user.id },
        });
      }
    }

    // Handle Customer Profiles, Cars, and Addresses
    if (account.car) {
      const profile = await prisma.customerProfile.upsert({
        where: { userId: user.id },
        update: { creditBalance: account.walletCredit || 0 },
        create: {
          userId: user.id,
          creditBalance: account.walletCredit || 0,
        },
      });

      // Upsert Vehicle
      let vehicle = await prisma.vehicle.findFirst({
        where: { customerId: profile.id, plateNumber: account.car.plateNumber },
      });
      if (!vehicle) {
        vehicle = await prisma.vehicle.create({
          data: {
            customerId: profile.id,
            make: account.car.make,
            model: account.car.model,
            year: account.car.year,
            color: account.car.color,
            vehicleSize: account.car.size,
            plateNumber: account.car.plateNumber,
            isDefault: true,
          },
        });
      }

      // Upsert Address
      let addr = await prisma.customerAddress.findFirst({
        where: { customerId: profile.id, compound: account.address.compound },
      });
      if (!addr) {
        addr = await prisma.customerAddress.create({
          data: {
            customerId: profile.id,
            city: account.address.city,
            compound: account.address.compound,
            district: account.address.district,
            street: account.address.street,
            buildingNumber: account.address.buildingNumber,
            governorate: 'الجيزة',
            isDefault: true,
          },
        });
      }
    }

    console.log(`   ✓ [${account.role}] ${account.fullName} -> Phone: ${account.phone}`);
  }

  // --------------------------------------------------------------------------
  // 4. ATTACH ACTIVE VIP SUBSCRIPTION TO CUSTOMER 1 (01000000004)
  // --------------------------------------------------------------------------
  console.log('\n👑 [4/5] Activating VIP Luxury Subscription for Customer 1...');

  const vipCustomerUser = await prisma.user.findUnique({ where: { phone: '01000000004' } });
  const vipCustomerProfile = await prisma.customerProfile.findUnique({ where: { userId: vipCustomerUser.id } });
  const vipPlan = await prisma.subscriptionPlan.findFirst({ where: { active: true } });

  if (vipCustomerProfile && vipPlan) {
    const existingSub = await prisma.customerSubscription.findFirst({
      where: { customerId: vipCustomerProfile.id, planId: vipPlan.id },
    });

    if (!existingSub) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const newSub = await prisma.customerSubscription.create({
        data: {
          customerId: vipCustomerProfile.id,
          planId: vipPlan.id,
          branchId: branchZayed.id,
          status: SubscriptionStatus.ACTIVE,
          purchasePrice: vipPlan.price,
          startDate: now,
          endDate: expiresAt,
          totalVisits: vipPlan.visitCount,
          usedVisits: 1,
          remainingVisits: vipPlan.visitCount - 1, // 3 visits remaining
        },
      });

      await prisma.subscriptionVisitLedger.create({
        data: {
          subscriptionId: newSub.id,
          action: VisitLedgerAction.PURCHASE,
          visitChange: vipPlan.visitCount,
          balanceBefore: 0,
          remainingAfter: vipPlan.visitCount,
          reason: 'شراء وتفعيل باقة بريق الملكية VIP للعناية الدورية',
        },
      });

      console.log(`   ✓ VIP Subscription Active: ${vipPlan.nameAr} (3 زيارات متبقية)`);
    }
  }

  // --------------------------------------------------------------------------
  // 5. CLEAR ALL SECURITY LOCKOUTS & THROTTLES
  // --------------------------------------------------------------------------
  console.log('\n🛡️  [5/5] Clearing Security Throttles & Lockouts...');
  const cleared = await prisma.securityThrottle.deleteMany();
  console.log(`   ✓ Cleared ${cleared.count} throttles. All accounts can log in instantly.`);

  console.log('\n===============================================================');
  console.log('✅ DEMO SUITE READY FOR CLIENT PRESENTATION & TESTING!');
  console.log('===============================================================\n');
}

main()
  .catch((err) => {
    console.error('Seed demo failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
