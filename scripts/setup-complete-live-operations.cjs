/* eslint-disable @typescript-eslint/no-require-imports */
const {
  PrismaClient,
  UserRole,
  BranchStatus,
  AssignmentMode,
  OperationalVehicleStatus,
  BookingStatus,
  PaymentStatus,
  ChecklistStage,
} = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

async function main() {
  console.log('\n===============================================================');
  console.log('🚀 SETTING UP COMPLETE LIVE OPERATIONS FOR ALL EMPLOYEES & TEAMS');
  console.log('===============================================================\n');

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // --------------------------------------------------------------------------
  // STEP 1: VERIFY / UPDATE EMPLOYEES
  // --------------------------------------------------------------------------
  console.log('👥 [1/4] Configuring 4 field technicians & employees...');

  const techHossam = await prisma.user.upsert({
    where: { phone: '01000000003' },
    update: { fullName: 'كابتن حسام إبراهيم (قائد فريق الصقور)', passwordHash, mustChangePwd: false, active: true, role: UserRole.EMPLOYEE },
    create: {
      phone: '01000000003',
      fullName: 'كابتن حسام إبراهيم (قائد فريق الصقور)',
      email: 'hossam.tech@bareeq.com',
      passwordHash,
      role: UserRole.EMPLOYEE,
      active: true,
      mustChangePwd: false,
    },
  });

  const techNour = await prisma.user.upsert({
    where: { phone: '01234567891' },
    update: { fullName: 'نور الدين علي (فني تلميع متقدم - فريق الصقور)', passwordHash, mustChangePwd: false, active: true, role: UserRole.EMPLOYEE },
    create: {
      phone: '01234567891',
      fullName: 'نور الدين علي (فني تلميع متقدم - فريق الصقور)',
      email: 'nour.tech@bareeq.com',
      passwordHash,
      role: UserRole.EMPLOYEE,
      active: true,
      mustChangePwd: false,
    },
  });

  const techKarim = await prisma.user.upsert({
    where: { phone: '01124156626' },
    update: { fullName: 'كابتن كريم ممدوح (قائد فريق النجوم)', passwordHash, mustChangePwd: false, active: true, role: UserRole.EMPLOYEE },
    create: {
      phone: '01124156626',
      fullName: 'كابتن كريم ممدوح (قائد فريق النجوم)',
      email: 'karim.tech@bareeq.com',
      passwordHash,
      role: UserRole.EMPLOYEE,
      active: true,
      mustChangePwd: false,
    },
  });

  const techMahmoud = await prisma.user.upsert({
    where: { phone: '01000000015' },
    update: { fullName: 'محمود السعيد (فني نانو سيراميك - فريق النجوم)', passwordHash, mustChangePwd: false, active: true, role: UserRole.EMPLOYEE },
    create: {
      phone: '01000000015',
      fullName: 'محمود السعيد (فني نانو سيراميك - فريق النجوم)',
      email: 'mahmoud.tech@bareeq.com',
      passwordHash,
      role: UserRole.EMPLOYEE,
      active: true,
      mustChangePwd: false,
    },
  });

  // --------------------------------------------------------------------------
  // STEP 2: VERIFY BRANCHES, TEAMS, AND VEHICLES
  // --------------------------------------------------------------------------
  console.log('🏢 [2/4] Setting up branches, operational teams and mobile vans...');

  const branches = await prisma.branch.findMany({ where: { status: BranchStatus.ACTIVE } });
  const branchCairo = branches.find(b => b.nameAr.includes('القاهرة')) || branches[0];
  const branchZayed = branches.find(b => b.nameAr.includes('زايد')) || branches[0];

  // Team Alpha (القاهرة الجديدة)
  let teamAlpha = await prisma.team.findFirst({
    where: { branchId: branchCairo.id, name: { contains: 'الصقور' } },
  });
  if (!teamAlpha) {
    teamAlpha = await prisma.team.create({
      data: {
        branchId: branchCairo.id,
        name: 'فريق الصقور (Team Alpha)',
        leaderId: techHossam.id,
        dailyCapacity: 8,
        active: true,
      },
    });
  } else {
    await prisma.team.update({
      where: { id: teamAlpha.id },
      data: { name: 'فريق الصقور (Team Alpha)', leaderId: techHossam.id, active: true },
    });
  }

  // Team Beta (الشيخ زايد)
  let teamBeta = await prisma.team.findFirst({
    where: { branchId: branchZayed.id, name: { contains: 'النجوم' } },
  });
  if (!teamBeta) {
    teamBeta = await prisma.team.create({
      data: {
        branchId: branchZayed.id,
        name: 'فريق النجوم (Team Beta)',
        leaderId: techKarim.id,
        dailyCapacity: 8,
        active: true,
      },
    });
  } else {
    await prisma.team.update({
      where: { id: teamBeta.id },
      data: { name: 'فريق النجوم (Team Beta)', leaderId: techKarim.id, active: true },
    });
  }

  // Assign Vans
  let vanAlpha = await prisma.operationalVehicle.findFirst({ where: { teamId: teamAlpha.id } });
  if (!vanAlpha) {
    vanAlpha = await prisma.operationalVehicle.create({
      data: {
        branchId: branchCairo.id,
        teamId: teamAlpha.id,
        code: 'VAN-NC-101',
        make: 'Mercedes-Benz',
        model: 'Sprinter Detailer Pro',
        year: 2024,
        plateNumber: 'ق هـ ر 1010',
        status: OperationalVehicleStatus.ACTIVE,
      },
    });
  }

  let vanBeta = await prisma.operationalVehicle.findFirst({ where: { teamId: teamBeta.id } });
  if (!vanBeta) {
    vanBeta = await prisma.operationalVehicle.create({
      data: {
        branchId: branchZayed.id,
        teamId: teamBeta.id,
        code: 'VAN-ZY-202',
        make: 'Toyota',
        model: 'HiAce Mobile Detailing Unit',
        year: 2024,
        plateNumber: 'ج ي ز 2020',
        status: OperationalVehicleStatus.ACTIVE,
      },
    });
  }

  // Link Team Memberships (Hossam & Nour in Alpha, Karim & Mahmoud in Beta)
  await prisma.teamMember.deleteMany({
    where: { userId: { in: [techHossam.id, techNour.id, techKarim.id, techMahmoud.id] } },
  });

  await prisma.teamMember.createMany({
    data: [
      { teamId: teamAlpha.id, userId: techHossam.id, isLeader: true },
      { teamId: teamAlpha.id, userId: techNour.id, isLeader: false },
      { teamId: teamBeta.id, userId: techKarim.id, isLeader: true },
      { teamId: teamBeta.id, userId: techMahmoud.id, isLeader: false },
    ],
  });

  console.log('   ✅ Assigned [حسام إبراهيم + نور الدين علي] to [فريق الصقور - القاهرة الجديدة].');
  console.log('   ✅ Assigned [كريم ممدوح + محمود السعيد] to [فريق النجوم - الشيخ زايد].');

  // --------------------------------------------------------------------------
  // STEP 3: ENSURE CHECKLIST TEMPLATES FOR SERVICES
  // --------------------------------------------------------------------------
  console.log('📋 [3/4] Ensuring checklist templates with items are linked to services...');

  const services = await prisma.service.findMany({
    where: { active: true },
    include: { checklistTemplates: { include: { items: true } } },
  });

  for (const s of services) {
    if (s.checklistTemplates.length === 0) {
      const template = await prisma.checklistTemplate.create({
        data: {
          serviceId: s.id,
          name: `قائمة فحص ${s.nameAr}`,
          stage: ChecklistStage.CLOSING,
        },
      });

      await prisma.checklistItemTemplate.createMany({
        data: [
          { templateId: template.id, labelAr: 'معاينة البودي والخدوش قبل بدء الخدمة', required: true, requiresPhoto: true, displayOrder: 1 },
          { templateId: template.id, labelAr: 'تنظيف وتطهير المقصورة الداخلية والفرش بالبخار', required: true, requiresPhoto: false, displayOrder: 2 },
          { templateId: template.id, labelAr: 'غسيل وتلميع الجنوط وإطارات السيارة بمادة النانو', required: true, requiresPhoto: false, displayOrder: 3 },
          { templateId: template.id, labelAr: 'تلميع الهيكل الخارجي وحماية الطلاء والتجفيف المايكروفايبر', required: true, requiresPhoto: true, displayOrder: 4 },
          { templateId: template.id, labelAr: 'تسليم المفتاح للعميل والتأكد من الرضا التام والتحصيل', required: true, requiresPhoto: false, displayOrder: 5 },
        ],
      });
    }
  }

  // --------------------------------------------------------------------------
  // STEP 4: CREATE ACTIVE TASKS FOR TODAY & TOMORROW
  // --------------------------------------------------------------------------
  console.log('⚡ [4/4] Creating active live tasks for teams for TODAY...');

  const customers = await prisma.customerProfile.findMany({
    take: 6,
    include: { user: true, vehicles: true, addresses: true },
  });

  const now = new Date();
  const todayAt = (h, m = 0) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  };

  const tasksToCreate = [
    // Team Alpha Tasks (New Cairo - Hossam & Nour)
    {
      team: teamAlpha,
      tech: techNour,
      van: vanAlpha,
      branch: branchCairo,
      cust: customers[0],
      service: services[0],
      status: BookingStatus.IN_SERVICE,
      startAt: todayAt(10, 0),
      duration: 90,
      price: 850,
      number: `BQ-TODAY-NC01`,
      gate: 'يرجى إبلاغ أمن بوابة 2 بالسماح لسيارة بريق بالدخول إلى فيلا 14',
    },
    {
      team: teamAlpha,
      tech: techHossam,
      van: vanAlpha,
      branch: branchCairo,
      cust: customers[1] || customers[0],
      service: services[1] || services[0],
      status: BookingStatus.ON_THE_WAY,
      startAt: todayAt(13, 0),
      duration: 120,
      price: 1200,
      number: `BQ-TODAY-NC02`,
      gate: 'كمبوند ميفيدا عمارة 85 شقة 4 - ركنة خاصة أمام المدخل',
    },
    {
      team: teamAlpha,
      tech: techHossam,
      van: vanAlpha,
      branch: branchCairo,
      cust: customers[2] || customers[0],
      service: services[2] || services[0],
      status: BookingStatus.ASSIGNED,
      startAt: todayAt(16, 0),
      duration: 60,
      price: 500,
      number: `BQ-TODAY-NC03`,
      gate: 'هايد بارك فيلا 210',
    },

    // Team Beta Tasks (Sheikh Zayed - Karim & Mahmoud)
    {
      team: teamBeta,
      tech: techKarim,
      van: vanBeta,
      branch: branchZayed,
      cust: customers[3] || customers[0],
      service: services[0],
      status: BookingStatus.IN_SERVICE,
      startAt: todayAt(11, 0),
      duration: 90,
      price: 950,
      number: `BQ-TODAY-ZY01`,
      gate: 'بيفرلي هيلز فيلا 52 - بوابة النادي',
    },
    {
      team: teamBeta,
      tech: techMahmoud,
      van: vanBeta,
      branch: branchZayed,
      cust: customers[4] || customers[0],
      service: services[1] || services[0],
      status: BookingStatus.ON_THE_WAY,
      startAt: todayAt(14, 0),
      duration: 90,
      price: 650,
      number: `BQ-TODAY-ZY02`,
      gate: 'بالم هيلز فيلا 33',
    },
    {
      team: teamBeta,
      tech: techKarim,
      van: vanBeta,
      branch: branchZayed,
      cust: customers[5] || customers[0],
      service: services[2] || services[0],
      status: BookingStatus.ASSIGNED,
      startAt: todayAt(17, 30),
      duration: 120,
      price: 1500,
      number: `BQ-TODAY-ZY03`,
      gate: 'ويست تاون فيلا 44',
    },
  ];

  const areasCairo = await prisma.coverageArea.findMany({ where: { zone: { branchId: branchCairo.id } } });
  const areasZayed = await prisma.coverageArea.findMany({ where: { zone: { branchId: branchZayed.id } } });
  const defaultPolicy = await prisma.cancellationPolicy.findFirst();

  for (const t of tasksToCreate) {
    const v = t.cust.vehicles[0] || { make: 'Mercedes-Benz', model: 'C200', year: 2024, color: 'أبيض', plateNumber: 'ق هـ 1234', vehicleSize: 'SEDAN' };
    const a = t.cust.addresses[0] || { street: 'شارع التسعين', buildingNumber: '14', compound: 'كمبوند سوديك', district: 'التجمع', city: 'القاهرة الجديدة' };
    const area = (t.branch.id === branchCairo.id ? areasCairo[0] : areasZayed[0]) || (await prisma.coverageArea.findFirst());

    const endAt = new Date(t.startAt.getTime() + t.duration * 60 * 1000);
    const deposit = Math.round(t.price * 0.25);

    const booking = await prisma.booking.upsert({
      where: { bookingNumber: t.number },
      update: {
        bookingStatus: t.status,
        assignedTeamId: t.team.id,
        assignedEmployeeId: t.tech.id,
        operationalVehicleId: t.van.id,
        startAt: t.startAt,
        endAt,
      },
      create: {
        bookingNumber: t.number,
        customerId: t.cust.id,
        branchId: t.branch.id,
        coverageAreaId: area?.id || null,
        cancellationPolicyId: defaultPolicy?.id || null,
        vehicleId: v.id || null,
        serviceId: t.service.id,
        startAt: t.startAt,
        endAt,
        totalDurationMinutes: t.duration,
        basePrice: t.price,
        addonPrice: 0,
        totalPrice: t.price,
        depositAmount: deposit,
        amountPaid: deposit,
        amountDue: t.price - deposit,
        paymentStatus: PaymentStatus.VERIFIED,
        bookingStatus: t.status,
        assignmentMode: AssignmentMode.MANUAL,
        assignedTeamId: t.team.id,
        assignedEmployeeId: t.tech.id,
        operationalVehicleId: t.van.id,
        gateInstructions: t.gate,
        locationUrl: 'https://maps.google.com/?q=30.0131,31.4321',
        addressSnapshot: { street: a.street, building: a.buildingNumber, compound: a.compound, district: a.district, city: a.city },
        vehicleSnapshot: { make: v.make, model: v.model, color: v.color, plate: v.plateNumber },
        serviceSnapshot: { nameAr: t.service.nameAr, price: t.price },
        contactSnapshot: { name: t.cust.user.fullName, phone: t.cust.user.phone },
      },
    });

    // Create Checklist Instance
    const existingChecklist = await prisma.bookingChecklistInstance.findFirst({
      where: { bookingId: booking.id, stage: ChecklistStage.CLOSING },
    });
    if (!existingChecklist) {
      const checklistInst = await prisma.bookingChecklistInstance.create({
        data: {
          bookingId: booking.id,
          stage: ChecklistStage.CLOSING,
        },
      });

      await prisma.bookingChecklistItemResult.createMany({
        data: [
          { instanceId: checklistInst.id, itemId: 'chk-item-1', itemLabel: 'معاينة البودي والخدوش قبل بدء الخدمة', isChecked: t.status === BookingStatus.IN_SERVICE, checkedByUserId: t.tech.id, checkedAt: t.startAt },
          { instanceId: checklistInst.id, itemId: 'chk-item-2', itemLabel: 'تنظيف وتطهير المقصورة الداخلية والفرش بالبخار', isChecked: false },
          { instanceId: checklistInst.id, itemId: 'chk-item-3', itemLabel: 'غسيل وتلميع الجنوط وإطارات السيارة بمادة النانو', isChecked: false },
          { instanceId: checklistInst.id, itemId: 'chk-item-4', itemLabel: 'تلميع الهيكل الخارجي وحماية الطلاء والتجفيف المايكروفايبر', isChecked: false },
          { instanceId: checklistInst.id, itemId: 'chk-item-5', itemLabel: 'تسليم المفتاح للعميل والتأكد من الرضا التام والتحصيل', isChecked: false },
        ],
      });
    }

    // Attach Before Photo for IN_SERVICE
    if (t.status === BookingStatus.IN_SERVICE) {
      const beforeUrl = `/api/files/before-photos/live-task-${booking.id}.jpg`;
      await prisma.bookingFile.upsert({
        where: { fileUrl: beforeUrl },
        update: {},
        create: {
          bookingId: booking.id,
          fileType: 'BEFORE_SERVICE',
          fileUrl: beforeUrl,
          mimeType: 'image/jpeg',
          sizeBytes: 250000,
          uploadedByUserId: t.tech.id,
        },
      });
    }
  }

  console.log('\n===============================================================');
  console.log('🎉 COMPLETE OPERATIONS SETUP COMPLETED SUCCESSFULLY!');
  console.log('===============================================================');
  console.log('⭐ [نور] and [حسام] now have 3 active live tasks on /staff in New Cairo:');
  console.log('   - 1 Task: [IN_SERVICE] with checklist & before photo (Porsche Panamera)');
  console.log('   - 1 Task: [ON_THE_WAY] with live WhatsApp & Phone links (Mercedes G63)');
  console.log('   - 1 Task: [ASSIGNED] scheduled for 16:00 (Porsche Macan)');
  console.log('⭐ [كريم] and [محمود] now have 3 active live tasks on /staff in Sheikh Zayed:');
  console.log('   - 1 Task: [IN_SERVICE] (Range Rover Vogue)');
  console.log('   - 1 Task: [ON_THE_WAY] (Mercedes C200)');
  console.log('   - 1 Task: [ASSIGNED] scheduled for 17:30 (Land Rover Defender)');
  console.log('===============================================================\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Setup Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
