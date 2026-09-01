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
  FileType,
  ProofStatus,
  ChecklistStage,
  SubscriptionStatus,
  VisitLedgerAction,
} = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { loadEnvConfig } = require('@next/env');

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Password123!';
const NOW = new Date();

function daysAgo(days, hours = 10, minutes = 0) {
  const d = new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function generateBookingNumber(date, index) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hex = (index + 100).toString(16).toUpperCase().padStart(4, '0');
  return `BQ-${y}${m}${d}-${hex}`;
}

async function main() {
  console.log('\n===============================================================');
  console.log('🚀 BAREEQ — 50 OPERATIONAL BOOKINGS & 30-DAY SIMULATION SEEDER');
  console.log('===============================================================\n');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // --------------------------------------------------------------------------
  // STEP 1: VERIFY / SETUP PLATFORM STAFF ACCOUNTS
  // --------------------------------------------------------------------------
  console.log('👤 [1/5] Setting up platform staff accounts...');

  const systemAdmin = await prisma.user.upsert({
    where: { phone: '01000000000' },
    update: { passwordHash, mustChangePwd: false, active: true },
    create: {
      phone: '01000000000',
      fullName: 'مدير النظام الرئيسي (System Super Admin)',
      email: 'admin@bareeq.com',
      passwordHash,
      role: UserRole.SYSTEM_SUPER_ADMIN,
      active: true,
      mustChangePwd: false,
    },
  });

  const owner = await prisma.user.upsert({
    where: { phone: '01000000001' },
    update: { passwordHash, mustChangePwd: false, active: true },
    create: {
      phone: '01000000001',
      fullName: 'كريم المنشاوي (المالك - Owner)',
      email: 'owner@bareeq.com',
      passwordHash,
      role: UserRole.OWNER,
      active: true,
      mustChangePwd: false,
    },
  });

  const opsManager1 = await prisma.user.upsert({
    where: { phone: '01000000002' },
    update: { passwordHash, mustChangePwd: false, active: true },
    create: {
      phone: '01000000002',
      fullName: 'م. طارق الزيات (مدير تشغيل القاهرة الجديدة)',
      email: 'tareq.ops@bareeq.com',
      passwordHash,
      role: UserRole.OPERATIONS_MANAGER,
      active: true,
      mustChangePwd: false,
    },
  });

  const opsManager2 = await prisma.user.upsert({
    where: { phone: '01152170339' },
    update: { passwordHash, mustChangePwd: false, active: true },
    create: {
      phone: '01152170339',
      fullName: 'يوسف أشرف (مدير تشغيل الشيخ زايد)',
      email: 'youssef.ops@bareeq.com',
      passwordHash,
      role: UserRole.OPERATIONS_MANAGER,
      active: true,
      mustChangePwd: false,
    },
  });

  const leadTech1 = await prisma.user.upsert({
    where: { phone: '01000000003' },
    update: { passwordHash, mustChangePwd: false, active: true },
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

  const leadTech2 = await prisma.user.upsert({
    where: { phone: '01124156626' },
    update: { passwordHash, mustChangePwd: false, active: true },
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

  const techMember1 = await prisma.user.upsert({
    where: { phone: '01234567891' },
    update: { passwordHash, mustChangePwd: false, active: true },
    create: {
      phone: '01234567891',
      fullName: 'نور الدين علي (فني تلميع متقدم)',
      email: 'nour.tech@bareeq.com',
      passwordHash,
      role: UserRole.EMPLOYEE,
      active: true,
      mustChangePwd: false,
    },
  });

  const techMember2 = await prisma.user.upsert({
    where: { phone: '01000000015' },
    update: { passwordHash, mustChangePwd: false, active: true },
    create: {
      phone: '01000000015',
      fullName: 'محمود السعيد (فني غسيل ومعالجة نانو)',
      email: 'mahmoud.tech@bareeq.com',
      passwordHash,
      role: UserRole.EMPLOYEE,
      active: true,
      mustChangePwd: false,
    },
  });

  // --------------------------------------------------------------------------
  // STEP 2: VERIFY / SETUP BRANCHES, TEAMS, VANS, SERVICES, PAYMENT METHODS
  // --------------------------------------------------------------------------
  console.log('🏢 [2/5] Verifying branches and operational resources...');

  const branches = await prisma.branch.findMany({ where: { status: BranchStatus.ACTIVE } });
  if (branches.length === 0) {
    throw new Error('No active branches found.');
  }

  const branchCairo = branches.find(b => b.code.includes('NC') || b.nameAr.includes('القاهرة')) || branches[0];
  const branchZayed = branches.find(b => b.code.includes('ZAYED') || b.nameAr.includes('زايد')) || branches[0];

  // Link Ops Managers & Owner to Branches
  await prisma.branchMembership.upsert({
    where: { branchId_userId: { branchId: branchCairo.id, userId: opsManager1.id } },
    update: {},
    create: { branchId: branchCairo.id, userId: opsManager1.id },
  });

  await prisma.branchMembership.upsert({
    where: { branchId_userId: { branchId: branchZayed.id, userId: opsManager2.id } },
    update: {},
    create: { branchId: branchZayed.id, userId: opsManager2.id },
  });

  await prisma.branchMembership.upsert({
    where: { branchId_userId: { branchId: branchCairo.id, userId: owner.id } },
    update: {},
    create: { branchId: branchCairo.id, userId: owner.id },
  });

  // Teams
  let teamAlpha = await prisma.team.findFirst({ where: { branchId: branchCairo.id } });
  if (!teamAlpha) {
    teamAlpha = await prisma.team.create({
      data: {
        branchId: branchCairo.id,
        name: 'فريق الصقور - القاهرة الجديدة',
        active: true,
        dailyCapacity: 8,
      },
    });
  }

  let teamBeta = await prisma.team.findFirst({ where: { branchId: branchZayed.id } });
  if (!teamBeta) {
    teamBeta = await prisma.team.create({
      data: {
        branchId: branchZayed.id,
        name: 'فريق النجوم - الشيخ زايد',
        active: true,
        dailyCapacity: 8,
      },
    });
  }

  // Link Team Members
  await prisma.teamMember.deleteMany({ where: { teamId: { in: [teamAlpha.id, teamBeta.id] } } });
  await prisma.teamMember.createMany({
    data: [
      { teamId: teamAlpha.id, userId: leadTech1.id, isLeader: true },
      { teamId: teamAlpha.id, userId: techMember1.id, isLeader: false },
      { teamId: teamBeta.id, userId: leadTech2.id, isLeader: true },
      { teamId: teamBeta.id, userId: techMember2.id, isLeader: false },
    ],
  });

  // Operational Vehicles
  let van1 = await prisma.operationalVehicle.findFirst({ where: { branchId: branchCairo.id } });
  if (!van1) {
    van1 = await prisma.operationalVehicle.create({
      data: {
        branchId: branchCairo.id,
        teamId: teamAlpha.id,
        code: 'VAN-NC-01',
        make: 'Mercedes-Benz',
        model: 'Sprinter Detailer Pro',
        year: 2024,
        plateNumber: 'ق هـ ر 1234',
        status: OperationalVehicleStatus.ACTIVE,
      },
    });
  }

  let van2 = await prisma.operationalVehicle.findFirst({ where: { branchId: branchZayed.id } });
  if (!van2) {
    van2 = await prisma.operationalVehicle.create({
      data: {
        branchId: branchZayed.id,
        teamId: teamBeta.id,
        code: 'VAN-ZY-02',
        make: 'Toyota',
        model: 'HiAce Mobile Detailing Unit',
        year: 2024,
        plateNumber: 'ج ي ز 5678',
        status: OperationalVehicleStatus.ACTIVE,
      },
    });
  }

  // Coverage Areas
  const areasCairo = await prisma.coverageArea.findMany({
    where: { zone: { branchId: branchCairo.id } },
  });
  const areasZayed = await prisma.coverageArea.findMany({
    where: { zone: { branchId: branchZayed.id } },
  });
  const allAreas = [...areasCairo, ...areasZayed];

  // Payment Methods
  const paymentMethods = await prisma.branchPaymentMethod.findMany({
    where: { active: true },
  });

  // Services
  const services = await prisma.service.findMany({
    where: { active: true },
    include: {
      variants: true,
      cancellationPolicy: true,
      checklistTemplates: { include: { items: true } },
    },
  });

  const defaultPolicy = await prisma.cancellationPolicy.findFirst({
    where: { isDefault: true, active: true },
  }) || await prisma.cancellationPolicy.findFirst();

  // --------------------------------------------------------------------------
  // STEP 3: CREATE REALISTIC CUSTOMERS, VEHICLES & ADDRESSES
  // --------------------------------------------------------------------------
  console.log('🚗 [3/5] Seeding 15 active customers with garage & locations...');

  const customerProfilesData = [
    {
      name: 'أحمد المنصوري',
      phone: '01000000004',
      email: 'ahmed.mansoury@gmail.com',
      vehicles: [
        { make: 'BMW', model: 'X6 M-Competition', year: 2024, color: 'كحلي ميتاليك (Carbon Black)', plate: 'أ ب ج 1111', size: VehicleSize.SUV },
        { make: 'Porsche', model: 'Panamera GTS', year: 2023, color: 'رمادي بركاني (Volcano Grey)', plate: 'أ ب ج 2222', size: VehicleSize.SEDAN },
      ],
      address: { street: 'شارع التسعين الجنوبي', building: 'فيلا 14', compound: 'كمبوند سوديك فيليت (Sodic Villette)', district: 'التجمع الخامس', city: 'القاهرة الجديدة' },
    },
    {
      name: 'أنس محمد عبد العزيز',
      phone: '01146325762',
      email: 'anas.mohamed@outlook.com',
      vehicles: [
        { make: 'Mercedes-Benz', model: 'G-Class G63 AMG', year: 2024, color: 'أسود مط (Night Black Magno)', plate: 'م ن س 7777', size: VehicleSize.LARGE_SUV },
        { make: 'Audi', model: 'RS6 Avant', year: 2023, color: 'فضي ناردو (Nardo Grey)', plate: 'م ن س 8888', size: VehicleSize.CROSSOVER },
      ],
      address: { street: 'شارع العروبة', building: 'عمارة 85، شقة 4', compound: 'كمبوند ميفيدا (Mivida Emaar)', district: 'التجمع الخامس', city: 'القاهرة الجديدة' },
    },
    {
      name: 'د. مصطفى الشناوي',
      phone: '01012345671',
      email: 'dr.shennawy@medcare.eg',
      vehicles: [
        { make: 'Range Rover', model: 'Vogue Autobiography', year: 2024, color: 'أبيض لؤلؤي (Fuji White)', plate: 'د ك ت 1010', size: VehicleSize.LARGE_SUV },
      ],
      address: { street: 'محور 26 يوليو', building: 'فيلا 52', compound: 'كمبوند بيفرلي هيلز (Beverly Hills)', district: 'الشيخ زايد', city: 'الجيزة' },
    },
    {
      name: 'م. سارة عبد الرحمن',
      phone: '01223456781',
      email: 'sara.abdelrahman@designstudio.com',
      vehicles: [
        { make: 'Mercedes-Benz', model: 'C200 AMG Line', year: 2023, color: 'أبيض قطبي (Polar White)', plate: 'س ر هـ 5555', size: VehicleSize.SEDAN },
      ],
      address: { street: 'شارع الجزيرة', building: 'فيلا 33', compound: 'كمبوند بالم هيلز (Palm Hills)', district: 'أكتوبر / زايد', city: 'الجيزة' },
    },
    {
      name: 'عمر الدسوقي',
      phone: '01551234561',
      email: 'omar.desouky@techvalley.io',
      vehicles: [
        { make: 'Tesla', model: 'Model Y Performance', year: 2023, color: 'أحمر ميتاليك (Midnight Red)', plate: 'ع م ر 9999', size: VehicleSize.CROSSOVER },
      ],
      address: { street: 'شارع النرجس', building: 'عمارة 120', compound: 'النرجس عمارات', district: 'التجمع الخامس', city: 'القاهرة الجديدة' },
    },
    {
      name: 'نورهان الشريف',
      phone: '01112233441',
      email: 'nourhan.sherif@fashion.eg',
      vehicles: [
        { make: 'Porsche', model: 'Macan GTS', year: 2024, color: 'أزرق ميامي (Miami Blue)', plate: 'ن و ر 4444', size: VehicleSize.CROSSOVER },
      ],
      address: { street: 'شارع الجامعة الأمريكية', building: 'فيلا 210', compound: 'كمبوند هايد بارك (Hyde Park)', district: 'التجمع الخامس', city: 'القاهرة الجديدة' },
    },
    {
      name: 'المستشار خالد القاضي',
      phone: '01098765431',
      email: 'khaled.elqady@legalchambers.com',
      vehicles: [
        { make: 'Mercedes-Benz', model: 'S-Class S500', year: 2024, color: 'أسود أوبسيديان (Obsidian Black)', plate: 'ق ض ى 1000', size: VehicleSize.SEDAN },
      ],
      address: { street: 'شارع التسعين الشمالي', building: 'فيلا 9', compound: 'كمبوند سوان ليك (Swan Lake)', district: 'التجمع الأول', city: 'القاهرة الجديدة' },
    },
    {
      name: 'ريم المهدي',
      phone: '01287654321',
      email: 'reem.elmahdy@consulting.com',
      vehicles: [
        { make: 'Audi', model: 'Q8 S-Line', year: 2023, color: 'رمادي دايتونا (Daytona Grey)', plate: 'ر ي م 3030', size: VehicleSize.SUV },
      ],
      address: { street: 'طريق وصلة دهشور', building: 'فيلا 18', compound: 'كمبوند ألجريا (Allegria Golf)', district: 'الشيخ زايد', city: 'الجيزة' },
    },
    {
      name: 'ياسمين فوزي',
      phone: '01065432191',
      email: 'yasmine.fawzy@media.com',
      vehicles: [
        { make: 'BMW', model: '420i Gran Coupe', year: 2023, color: 'أزرق بورتيماو (Portimao Blue)', plate: 'ي س م 6789', size: VehicleSize.SEDAN },
      ],
      address: { street: 'شارع الشباب', building: 'عمارة 14، شقة 2', compound: 'مدينة الرحاب - المرحلة الرابعة', district: 'القاهرة الجديدة', city: 'القاهرة الجديدة' },
    },
    {
      name: 'كابتن حسام غالي',
      phone: '01198761231',
      email: 'hossam.ghaly@sportsclub.eg',
      vehicles: [
        { make: 'Land Rover', model: 'Defender 110 X-Dynamic', year: 2024, color: 'أخضر بانجيا (Pangea Green)', plate: 'غ ل ى 1414', size: VehicleSize.LARGE_SUV },
      ],
      address: { street: 'شارع نادي الجزيرة', building: 'فيلا 44', compound: 'كمبوند ويست تاون (Westown Sodic)', district: 'الشيخ زايد', city: 'الجيزة' },
    },
    {
      name: 'تامر عاشور',
      phone: '01512398741',
      email: 'tamer.ashour@musicart.com',
      vehicles: [
        { make: 'Mercedes-Benz', model: 'GLE 53 Coupe AMG', year: 2024, color: 'فضي ألماسي (Diamond Silver)', plate: 'ت م ر 1212', size: VehicleSize.SUV },
      ],
      address: { street: 'الشارع الرئيسي', building: 'مجموعة 112، عمارة 8', compound: 'مدينتي - B10', district: 'القاهرة الجديدة', city: 'القاهرة الجديدة' },
    },
    {
      name: 'مي فاروق',
      phone: '01234598761',
      email: 'mai.farouk@production.eg',
      vehicles: [
        { make: 'Volvo', model: 'XC90 Recharge Inscription', year: 2023, color: 'أزرق كحلي (Denim Blue)', plate: 'م ى 9090', size: VehicleSize.LARGE_SUV },
      ],
      address: { street: 'شارع الخمسين', building: 'عمارة 19', compound: 'زهراء المعادي - الشطر السابع', district: 'المعادي', city: 'القاهرة' },
    },
    {
      name: 'شريف منير الديب',
      phone: '01045612371',
      email: 'sherif.eldeeb@capital.eg',
      vehicles: [
        { make: 'BMW', model: '735i M-Sport', year: 2024, color: 'أسود ياقوتي (Black Sapphire)', plate: 'ش ر ف 7000', size: VehicleSize.SEDAN },
      ],
      address: { street: 'محور الثورة', building: 'فيلا 3', compound: 'كمبوند كايرو فيستيفال سيتي (CFC)', district: 'التجمع الخامس', city: 'القاهرة الجديدة' },
    },
    {
      name: 'ليلى مراد الشاذلي',
      phone: '01178945611',
      email: 'laila.elshazly@luxeliving.eg',
      vehicles: [
        { make: 'Jeep', model: 'Grand Cherokee L', year: 2023, color: 'رمادي غامق (Baltic Grey)', plate: 'ل ى ل 2468', size: VehicleSize.LARGE_SUV },
      ],
      address: { street: 'طريق النزهة', building: 'فيلا 77', compound: 'كمبوند ريفر ووك (Riverwalk)', district: 'التجمع الأول', city: 'القاهرة الجديدة' },
    },
    {
      name: 'زياد طارق الهاشمي',
      phone: '01032165491',
      email: 'ziad.hashemy@techhub.eg',
      vehicles: [
        { make: 'Hyundai', model: 'Tucson N-Line', year: 2024, color: 'رمادي شادو (Shadow Grey)', plate: 'ز ي د 1357', size: VehicleSize.CROSSOVER },
      ],
      address: { street: 'محور طه حسين', building: 'عمارة 40', compound: 'النرجس فيلات', district: 'التجمع الخامس', city: 'القاهرة الجديدة' },
    },
  ];

  const seededCustomers = [];

  for (const cData of customerProfilesData) {
    const user = await prisma.user.upsert({
      where: { phone: cData.phone },
      update: { fullName: cData.name, passwordHash, mustChangePwd: false, active: true },
      create: {
        phone: cData.phone,
        fullName: cData.name,
        email: cData.email,
        passwordHash,
        role: UserRole.CUSTOMER,
        active: true,
        mustChangePwd: false,
      },
    });

    let profile = await prisma.customerProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      profile = await prisma.customerProfile.create({
        data: {
          userId: user.id,
        },
      });
    }

    const area = allAreas.find(a => cData.address.district.includes(a.district) || cData.address.city.includes(a.city)) || allAreas[0];
    let address = await prisma.customerAddress.findFirst({ where: { customerId: profile.id } });
    if (!address) {
      address = await prisma.customerAddress.create({
        data: {
          customerId: profile.id,
          governorate: 'القاهرة',
          city: cData.address.city,
          district: cData.address.district,
          compound: cData.address.compound,
          street: cData.address.street,
          buildingNumber: cData.address.building,
          unitNumber: '1',
          landmark: cData.address.compound,
          gateInstructions: 'يرجى إبلاغ أمن البوابة برقم الفيلا والتصريح لفريق بريق بالدخول',
          isDefault: true,
        },
      });
    }

    const customerVehicles = [];
    for (const vData of cData.vehicles) {
      let vehicle = await prisma.vehicle.findFirst({
        where: { customerId: profile.id, make: vData.make, model: vData.model },
      });
      if (!vehicle) {
        vehicle = await prisma.vehicle.create({
          data: {
            customerId: profile.id,
            vehicleSize: vData.size,
            make: vData.make,
            model: vData.model,
            year: vData.year,
            color: vData.color,
            plateNumber: vData.plate,
            isDefault: customerVehicles.length === 0,
          },
        });
      }
      customerVehicles.push(vehicle);
    }

    seededCustomers.push({ user, profile, address, area, vehicles: customerVehicles });
  }

  console.log(`   ✅ Created ${seededCustomers.length} active customer profiles with vehicles & addresses.`);

  // --------------------------------------------------------------------------
  // STEP 4: GENERATE 50 DIVERSE BOOKINGS OVER THE LAST 30 DAYS
  // --------------------------------------------------------------------------
  console.log('📅 [4/5] Generating 50 diverse bookings across 30 days lifecycle...');

  const REVIEWS = [
    { score: 5, comment: 'ما شاء الله الشغل احترافي جداً والشباب أمانة ودقة في الميعاد. العربية رجعت زيرو كأنها لسه طالعة من المعرض!' },
    { score: 5, comment: 'أول مرة أجرب غسيل متنقل بالمستوى ده.. اهتمام بأدق التفاصيل والفرش رجع ناصع بدون أي روائح كريهة.' },
    { score: 5, comment: 'فريق محترم ومنظم جداً، وصلوا في الميعاد بالدقيقة والمعدات اللي معاهم ممتازة جداً. شكراً كابتن حسام!' },
    { score: 5, comment: 'خدمة بريق الملكية تستاهل كل قرش.. لمعة الطلاء والاهتمام بالجلد الداخلي فاق التوقعات.' },
    { score: 5, comment: 'ممتازين جداً ومريحين، مش محتاج أنزل ولا أروح مغسلة وأضيع نص يومي. بريق حلت المشكلة باحترافية.' },
    { score: 4, comment: 'شغل ممتاز جداً وسرعة في الإنجاز، فقط تأخر الفريق 10 دقائق بسبب بوابة الكومبوند لكن التجربة ممتازة.' },
    { score: 5, comment: 'تنظيف حوض المحرك كان قمة في النظافة وبطريقة آمنة تماماً على الحساسات والكهرباء. برافو!' },
    { score: 5, comment: 'الخدمة الشاملة ممتازة، شالوا كل البقع القديمة اللي على سقف وجلد العربية.' },
  ];

  const bookingConfigs = [];

  // 26 COMPLETED & CLOSED bookings (Days 30 to 1 ago)
  for (let i = 26; i >= 1; i--) {
    bookingConfigs.push({
      status: BookingStatus.CLOSED,
      paymentStatus: PaymentStatus.FULLY_PAID,
      daysAgo: i,
      hour: 9 + (i % 8) * 1.5,
      hasQualityReview: true,
      hasRating: true,
      hasBeforeAfterPhotos: true,
      hasInvoice: true,
      category: 'completed',
    });
  }

  // 6 CONFIRMED / IN_SERVICE / ON THE WAY bookings (Today)
  bookingConfigs.push(
    { status: BookingStatus.IN_SERVICE, paymentStatus: PaymentStatus.FULLY_PAID, daysAgo: 0, hour: 10, hasBeforeAfterPhotos: true, category: 'today-active' },
    { status: BookingStatus.SERVICE_COMPLETED, paymentStatus: PaymentStatus.FULLY_PAID, daysAgo: 0, hour: 11, hasBeforeAfterPhotos: true, category: 'today-active' },
    { status: BookingStatus.ACCEPTED, paymentStatus: PaymentStatus.FULLY_PAID, daysAgo: 0, hour: 14, category: 'today-upcoming' },
    { status: BookingStatus.ACCEPTED, paymentStatus: PaymentStatus.FULLY_PAID, daysAgo: 0, hour: 16, category: 'today-upcoming' },
    { status: BookingStatus.ASSIGNED, paymentStatus: PaymentStatus.FULLY_PAID, daysAgo: 0, hour: 18, category: 'today-upcoming' },
    { status: BookingStatus.ON_THE_WAY, paymentStatus: PaymentStatus.FULLY_PAID, daysAgo: 0, hour: 12, hasBeforeAfterPhotos: true, category: 'today-active' }
  );

  // 6 AWAITING OPERATIONS REVIEW / UPCOMING SLOTS (Next 1-3 days)
  bookingConfigs.push(
    { status: BookingStatus.AWAITING_OPERATIONS_REVIEW, paymentStatus: PaymentStatus.AWAITING_PROOF, daysAgo: -1, hour: 10, category: 'ops-review' },
    { status: BookingStatus.AWAITING_OPERATIONS_REVIEW, paymentStatus: PaymentStatus.PROOF_UPLOADED, daysAgo: -1, hour: 13, category: 'ops-review' },
    { status: BookingStatus.ACCEPTED, paymentStatus: PaymentStatus.FULLY_PAID, daysAgo: -2, hour: 11, category: 'future-confirmed' },
    { status: BookingStatus.ACCEPTED, paymentStatus: PaymentStatus.FULLY_PAID, daysAgo: -2, hour: 15, category: 'future-confirmed' },
    { status: BookingStatus.AWAITING_OPERATIONS_REVIEW, paymentStatus: PaymentStatus.AWAITING_PROOF, daysAgo: -3, hour: 10, category: 'ops-review' },
    { status: BookingStatus.REQUEST_SUBMITTED, paymentStatus: PaymentStatus.AWAITING_PROOF, daysAgo: -3, hour: 14, category: 'new-request' }
  );

  // 4 AWAITING PAYMENT PROOF / UNDER REVIEW
  bookingConfigs.push(
    { status: BookingStatus.AWAITING_PAYMENT_PROOF, paymentStatus: PaymentStatus.AWAITING_PROOF, daysAgo: 0, hour: 15, category: 'awaiting-proof' },
    { status: BookingStatus.PAYMENT_UNDER_REVIEW, paymentStatus: PaymentStatus.PROOF_UPLOADED, daysAgo: 0, hour: 17, category: 'proof-under-review' },
    { status: BookingStatus.PAYMENT_UNDER_REVIEW, paymentStatus: PaymentStatus.PROOF_UPLOADED, daysAgo: 1, hour: 19, category: 'proof-under-review' },
    { status: BookingStatus.AWAITING_PAYMENT_PROOF, paymentStatus: PaymentStatus.AWAITING_PROOF, daysAgo: -1, hour: 16, category: 'awaiting-proof' }
  );

  // 4 CANCELLED & RESCHEDULED WITH REFUNDS/SETTLEMENTS
  bookingConfigs.push(
    { status: BookingStatus.CANCELLED, paymentStatus: PaymentStatus.REFUNDED, daysAgo: 12, hour: 11, cancellationType: 'EARLY', category: 'cancelled' },
    { status: BookingStatus.CANCELLED, paymentStatus: PaymentStatus.PARTIALLY_REFUNDED, daysAgo: 8, hour: 14, cancellationType: 'LATE', category: 'cancelled' },
    { status: BookingStatus.CANCELLED, paymentStatus: PaymentStatus.REFUNDED, daysAgo: 4, hour: 16, cancellationType: 'EARLY', category: 'cancelled' },
    { status: BookingStatus.RESCHEDULE_REQUESTED, paymentStatus: PaymentStatus.FULLY_PAID, daysAgo: 1, hour: 13, category: 'reschedule' }
  );

  // 4 REJECTED / EXPIRED
  bookingConfigs.push(
    { status: BookingStatus.REJECTED, paymentStatus: PaymentStatus.REJECTED, daysAgo: 15, hour: 10, category: 'rejected' },
    { status: BookingStatus.EXPIRED, paymentStatus: PaymentStatus.REJECTED, daysAgo: 20, hour: 12, category: 'expired' },
    { status: BookingStatus.REJECTED, paymentStatus: PaymentStatus.REJECTED, daysAgo: 5, hour: 14, category: 'rejected' },
    { status: BookingStatus.EXPIRED, paymentStatus: PaymentStatus.REJECTED, daysAgo: 2, hour: 11, category: 'expired' }
  );

  console.log(`   📋 Prepared ${bookingConfigs.length} diverse booking scenarios.`);

  let createdCount = 0;
  let totalRevenueGenerated = 0;

  for (let i = 0; i < bookingConfigs.length; i++) {
    const cfg = bookingConfigs[i];
    const custIdx = i % seededCustomers.length;
    const cust = seededCustomers[custIdx];
    const vehicle = cust.vehicles[i % cust.vehicles.length];
    const service = services[i % services.length];
    const branch = (i % 2 === 0) ? branchCairo : branchZayed;
    const team = (branch.id === branchCairo.id) ? teamAlpha : teamBeta;
    const leadTech = (branch.id === branchCairo.id) ? leadTech1 : leadTech2;
    const van = (branch.id === branchCairo.id) ? van1 : van2;
    const paymentMethod = paymentMethods.find(p => p.branchId === branch.id) || paymentMethods[0];

    const variant = service.variants.find(v => v.vehicleSize === vehicle.vehicleSize) || service.variants[0] || { price: service.basePrice, durationMinutes: 90 };
    const price = variant.price || service.basePrice;
    const duration = variant.durationMinutes || 90;
    const depositAmount = service.requiresDeposit ? Math.round(price * 0.25) : 0;

    const startAt = daysAgo(cfg.daysAgo, Math.floor(cfg.hour), Math.round((cfg.hour % 1) * 60));
    const endAt = new Date(startAt.getTime() + duration * 60 * 1000);
    const bookingNumber = generateBookingNumber(startAt, i);

    let amountPaid = 0;
    let amountDue = price;
    if (cfg.paymentStatus === PaymentStatus.FULLY_PAID) {
      amountPaid = price;
      amountDue = 0;
    } else if (cfg.paymentStatus === PaymentStatus.PROOF_UPLOADED) {
      amountPaid = 0;
      amountDue = price;
    } else if (cfg.paymentStatus === PaymentStatus.VERIFIED) {
      amountPaid = depositAmount;
      amountDue = price - depositAmount;
    } else if (cfg.paymentStatus === PaymentStatus.REFUNDED) {
      amountPaid = 0;
      amountDue = 0;
    } else if (cfg.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED) {
      amountPaid = Math.round(depositAmount * 0.5);
      amountDue = 0;
    }

    const isOperationalActive = [
      BookingStatus.ASSIGNED,
      BookingStatus.TEAM_ACKNOWLEDGED,
      BookingStatus.ON_THE_WAY,
      BookingStatus.ARRIVED,
      BookingStatus.IN_SERVICE,
      BookingStatus.QUALITY_REVIEW,
      BookingStatus.SERVICE_COMPLETED,
      BookingStatus.DELIVERED,
      BookingStatus.CLOSED,
    ].includes(cfg.status);

    const booking = await prisma.booking.upsert({
      where: { bookingNumber },
      update: {},
      create: {
        bookingNumber,
        customerId: cust.profile.id,
        branchId: branch.id,
        coverageAreaId: cust.area.id,
        vehicleId: vehicle.id,
        serviceId: service.id,
        serviceVariantId: variant.id || null,
        startAt,
        endAt,
        totalDurationMinutes: duration,
        basePrice: price,
        addonPrice: 0,
        totalPrice: price,
        depositAmount,
        amountPaid,
        amountDue,
        paymentStatus: cfg.paymentStatus,
        bookingStatus: cfg.status,
        assignmentMode: AssignmentMode.MANUAL,
        assignedTeamId: isOperationalActive ? team.id : null,
        assignedEmployeeId: isOperationalActive ? leadTech.id : null,
        operationalVehicleId: isOperationalActive ? van.id : null,
        addressSnapshot: {
          label: 'المنزل الرئيسي',
          street: cust.address.street,
          buildingNumber: cust.address.buildingNumber,
          unitNumber: cust.address.unitNumber,
          landmark: cust.address.landmark,
          district: cust.area.district,
          city: cust.area.city,
        },
        vehicleSnapshot: {
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          color: vehicle.color,
          plateNumber: vehicle.plateNumber,
          size: vehicle.vehicleSize,
        },
        serviceSnapshot: {
          id: service.id,
          nameAr: service.nameAr,
          basePrice: service.basePrice,
          price,
          durationMinutes: duration,
        },
        contactSnapshot: {
          name: cust.user.fullName,
          phone: cust.user.phone,
          whatsapp: cust.user.phone,
        },
        cancellationPolicyId: service.cancellationPolicyId || defaultPolicy?.id || null,
        cancellationPolicySnapshot: {
          code: service.cancellationPolicy?.code || 'STANDARD',
          nameAr: service.cancellationPolicy?.nameAr || 'سياسة الإلغاء القياسية',
          noticeHours: service.cancellationPolicy?.noticeHours || 6,
        },
        createdAt: new Date(startAt.getTime() - 24 * 60 * 60 * 1000),
      },
    });

    // ------------------------------------------------------------------------
    // Status History
    // ------------------------------------------------------------------------
    const statusesSequence = [BookingStatus.REQUEST_SUBMITTED];
    if (depositAmount > 0) statusesSequence.push(BookingStatus.AWAITING_PAYMENT_PROOF);
    if (![BookingStatus.REQUEST_SUBMITTED, BookingStatus.AWAITING_PAYMENT_PROOF].includes(cfg.status)) {
      statusesSequence.push(BookingStatus.ACCEPTED);
      if (![BookingStatus.ACCEPTED, BookingStatus.CANCELLED, BookingStatus.REJECTED, BookingStatus.EXPIRED].includes(cfg.status)) {
        statusesSequence.push(BookingStatus.ASSIGNED);
        statusesSequence.push(BookingStatus.IN_SERVICE);
        if ([BookingStatus.SERVICE_COMPLETED, BookingStatus.QUALITY_REVIEW, BookingStatus.CLOSED].includes(cfg.status)) {
          statusesSequence.push(BookingStatus.SERVICE_COMPLETED);
          statusesSequence.push(BookingStatus.QUALITY_REVIEW);
          if (cfg.status === BookingStatus.CLOSED) {
            statusesSequence.push(BookingStatus.CLOSED);
          }
        }
      } else if (cfg.status === BookingStatus.CANCELLED) {
        statusesSequence.push(BookingStatus.CANCELLED);
      } else if (cfg.status === BookingStatus.REJECTED) {
        statusesSequence.push(BookingStatus.REJECTED);
      } else if (cfg.status === BookingStatus.EXPIRED) {
        statusesSequence.push(BookingStatus.EXPIRED);
      }
    }

    let statusTime = new Date(booking.createdAt.getTime());
    for (let s = 0; s < statusesSequence.length; s++) {
      const st = statusesSequence[s];
      statusTime = new Date(statusTime.getTime() + 15 * 60 * 1000);
      await prisma.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: s === 0 ? BookingStatus.REQUEST_SUBMITTED : statusesSequence[s - 1],
          toStatus: st,
          changedByUserId: s <= 1 ? cust.user.id : (s === 2 ? opsManager1.id : leadTech.id),
          actorRole: s <= 1 ? UserRole.CUSTOMER : (s === 2 ? UserRole.OPERATIONS_MANAGER : UserRole.EMPLOYEE),
          reason: `تغيير الحالة الإجرائية إلى ${st}`,
          createdAt: statusTime,
        },
      });
    }

    // ------------------------------------------------------------------------
    // Payment Proofs & Payments Ledger
    // ------------------------------------------------------------------------
    if (depositAmount > 0 && cfg.paymentStatus !== PaymentStatus.NOT_REQUIRED) {
      const proofFileUrl = `/api/files/payment-proofs/demo-proof-${booking.id}.jpg`;
      const bookingFile = await prisma.bookingFile.upsert({
        where: { fileUrl: proofFileUrl },
        update: {},
        create: {
          bookingId: booking.id,
          fileType: FileType.PAYMENT_PROOF,
          fileUrl: proofFileUrl,
          mimeType: 'image/jpeg',
          sizeBytes: 154200,
          uploadedByUserId: cust.user.id,
          createdAt: new Date(booking.createdAt.getTime() + 5 * 60 * 1000),
        },
      });

      const paymentProof = await prisma.paymentProof.create({
        data: {
          bookingId: booking.id,
          paymentMethodId: paymentMethod.id,
          proofFileUrl,
          proofFileId: bookingFile.id,
          senderName: cust.user.fullName,
          senderPhoneOrAccount: cust.user.phone,
          amountSubmitted: depositAmount,
          referenceNumber: `REF-${100000 + i}`,
          transferTimestamp: new Date(booking.createdAt.getTime() + 5 * 60 * 1000),
          status: cfg.status === BookingStatus.REJECTED ? ProofStatus.REJECTED : (cfg.category === 'proof-under-review' ? ProofStatus.UNDER_REVIEW : ProofStatus.VERIFIED),
          reviewedByUserId: cfg.category === 'proof-under-review' ? null : opsManager1.id,
          reviewedAt: cfg.category === 'proof-under-review' ? null : new Date(booking.createdAt.getTime() + 15 * 60 * 1000),
          reviewNotes: cfg.status === BookingStatus.REJECTED ? 'إشعار التحويل غير واضح، يرجى إعادة إرفاق صورة واضحة' : 'تم التحقق ومطابقة المبلغ المستلم بنجاح',
          createdAt: new Date(booking.createdAt.getTime() + 5 * 60 * 1000),
        },
      });

      // If verified, create Payment records
      if (paymentProof.status === ProofStatus.VERIFIED) {
        // Deposit Payment
        await prisma.payment.create({
          data: {
            bookingId: booking.id,
            proofId: paymentProof.id,
            amount: depositAmount,
            paymentMethod: paymentMethod.type === PaymentMethodType.INSTAPAY ? 'INSTAPAY' : 'VODAFONE_CASH',
            recordedByUserId: opsManager1.id,
            referenceNumber: paymentProof.referenceNumber,
            createdAt: new Date(booking.createdAt.getTime() + 15 * 60 * 1000),
          },
        });
        totalRevenueGenerated += depositAmount;

        // Final balance payment upon execution/completion
        if (cfg.paymentStatus === PaymentStatus.FULLY_PAID && price > depositAmount) {
          const balanceAmount = price - depositAmount;
          await prisma.payment.create({
            data: {
              bookingId: booking.id,
              amount: balanceAmount,
              paymentMethod: 'CASH',
              recordedByUserId: leadTech.id,
              referenceNumber: `CASH-${booking.bookingNumber}`,
              createdAt: endAt,
            },
          });
          totalRevenueGenerated += balanceAmount;
        }
      }
    } else if (cfg.paymentStatus === PaymentStatus.FULLY_PAID && depositAmount === 0) {
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          amount: price,
          paymentMethod: 'CASH',
          recordedByUserId: leadTech.id,
          referenceNumber: `CASH-${booking.bookingNumber}`,
          createdAt: endAt,
        },
      });
      totalRevenueGenerated += price;
    }

    // ------------------------------------------------------------------------
    // Before & After Photos for Completed / In-Progress bookings
    // ------------------------------------------------------------------------
    if (cfg.hasBeforeAfterPhotos) {
      // Before Photo
      await prisma.bookingFile.create({
        data: {
          bookingId: booking.id,
          fileType: FileType.BEFORE_SERVICE,
          fileUrl: `/api/files/before-photos/before-${booking.id}.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: 245000,
          uploadedByUserId: leadTech.id,
          createdAt: startAt,
        },
      });

      // After Photo (if finished)
      if (cfg.status === BookingStatus.SERVICE_COMPLETED || cfg.status === BookingStatus.CLOSED) {
        await prisma.bookingFile.create({
          data: {
            bookingId: booking.id,
            fileType: FileType.AFTER_SERVICE,
            fileUrl: `/api/files/after-photos/after-${booking.id}.jpg`,
            mimeType: 'image/jpeg',
            sizeBytes: 289000,
            uploadedByUserId: leadTech.id,
            approvedForGallery: true,
            customerGalleryConsentAt: endAt,
            galleryApprovedByUserId: opsManager1.id,
            galleryApprovedAt: endAt,
            createdAt: endAt,
          },
        });
      }
    }

    // ------------------------------------------------------------------------
    // Quality Review & Checklist Instances
    // ------------------------------------------------------------------------
    if (cfg.hasQualityReview) {
      await prisma.qualityReview.create({
        data: {
          bookingId: booking.id,
          reviewedByUserId: opsManager1.id,
          approved: true,
          score: 5,
          notes: 'تم فحص جودة التلميع والنظافة الداخلية ومطابقتها للمعيار الملكي بنجاح 100%.',
          createdAt: new Date(endAt.getTime() + 15 * 60 * 1000),
        },
      });

      const checklistInstance = await prisma.bookingChecklistInstance.create({
        data: {
          bookingId: booking.id,
          stage: ChecklistStage.CLOSING,
          completedAt: endAt,
          completedByUserId: leadTech.id,
        },
      });

      await prisma.bookingChecklistItemResult.createMany({
        data: [
          { instanceId: checklistInstance.id, itemId: 'chk-1', itemLabel: 'تنظيف وتلميع الهيكل الخارجي والجنوط', isChecked: true, checkedByUserId: leadTech.id, checkedAt: endAt },
          { instanceId: checklistInstance.id, itemId: 'chk-2', itemLabel: 'تعقيم وتنظيف المقصورة والفرش بالبخار', isChecked: true, checkedByUserId: leadTech.id, checkedAt: endAt },
          { instanceId: checklistInstance.id, itemId: 'chk-3', itemLabel: 'تسليم المفتاح والتحقق من رضا العميل التام', isChecked: true, checkedByUserId: leadTech.id, checkedAt: endAt },
        ],
      });
    }

    // ------------------------------------------------------------------------
    // Customer Rating & Feedback
    // ------------------------------------------------------------------------
    if (cfg.hasRating) {
      const rev = REVIEWS[i % REVIEWS.length];
      await prisma.customerServiceRating.create({
        data: {
          bookingId: booking.id,
          customerId: cust.profile.id,
          score: rev.score,
          comment: rev.comment,
          approvedForPublic: true,
          approvedByUserId: opsManager1.id,
          approvedAt: new Date(endAt.getTime() + 60 * 60 * 1000),
          createdAt: new Date(endAt.getTime() + 45 * 60 * 1000),
        },
      });
    }

    // ------------------------------------------------------------------------
    // Invoice for Closed Bookings
    // ------------------------------------------------------------------------
    if (cfg.hasInvoice) {
      await prisma.invoice.create({
        data: {
          bookingId: booking.id,
          customerId: cust.profile.id,
          branchId: branch.id,
          invoiceNumber: `INV-2026-${1000 + i}`,
          subtotalAmount: price,
          paidAmount: price,
          dueAmount: 0,
          issuedByUserId: opsManager1.id,
          issuedAt: endAt,
        },
      });
    }

    // ------------------------------------------------------------------------
    // Cancellation details if cancelled
    // ------------------------------------------------------------------------
    if (cfg.status === BookingStatus.CANCELLED) {
      await prisma.cancellationRequest.create({
        data: {
          bookingId: booking.id,
          customerId: cust.profile.id,
          reason: 'ظرف طارئ واضطرار للسفر خارج القاهرة',
          preferredAction: 'REFUND',
          status: 'APPROVED',
          previousBookingStatus: BookingStatus.ACCEPTED,
          resolvedByUserId: opsManager1.id,
          resolutionNotes: 'تمت الموافقة على طلب الإلغاء وتنفيذ التسوية المالية المستحقة حسب السياسة',
          resolvedAt: new Date(startAt.getTime() - 8 * 60 * 60 * 1000),
          refundRequired: true,
          approvedRefundAmount: cfg.cancellationType === 'LATE' ? Math.round(depositAmount * 0.5) : depositAmount,
          retainedAmount: cfg.cancellationType === 'LATE' ? Math.round(depositAmount * 0.5) : 0,
          creditAmount: 0,
          createdAt: new Date(startAt.getTime() - 9 * 60 * 60 * 1000),
          requestedAt: new Date(startAt.getTime() - 9 * 60 * 60 * 1000),
        },
      });
    }

    createdCount++;
  }

  // --------------------------------------------------------------------------
  // STEP 5: SEED SAMPLE ACTIVE SUBSCRIPTIONS
  // --------------------------------------------------------------------------
  console.log('💳 [5/5] Seeding active customer subscription packages...');

  const plans = await prisma.subscriptionPlan.findMany({ where: { active: true } });
  if (plans.length > 0) {
    const plan = plans[0];
    const subCustomer = seededCustomers[0];
    const subVehicle = subCustomer.vehicles[0];

    const activeSubscription = await prisma.customerSubscription.create({
      data: {
        customerId: subCustomer.profile.id,
        planId: plan.id,
        branchId: branchCairo.id,
        purchasePrice: plan.price,
        startDate: daysAgo(25),
        endDate: daysAgo(-35),
        totalVisits: plan.visitCount,
        usedVisits: 2,
        remainingVisits: plan.visitCount - 2,
        status: SubscriptionStatus.ACTIVE,
        createdAt: daysAgo(25),
      },
    });

    await prisma.subscriptionVehicle.create({
      data: {
        subscriptionId: activeSubscription.id,
        vehicleId: subVehicle.id,
      },
    });

    await prisma.subscriptionVisitLedger.createMany({
      data: [
        {
          subscriptionId: activeSubscription.id,
          action: VisitLedgerAction.PURCHASE,
          visitChange: plan.visitCount,
          balanceBefore: 0,
          remainingAfter: plan.visitCount,
          reason: 'بدء دورة الاشتراك الشهري للباقة الملكية',
          adjustedByUserId: opsManager1.id,
          createdAt: daysAgo(25),
        },
        {
          subscriptionId: activeSubscription.id,
          action: VisitLedgerAction.BOOKING_COMPLETED,
          visitChange: -1,
          balanceBefore: plan.visitCount,
          remainingAfter: plan.visitCount - 1,
          reason: 'استهلاك الزيارة الأولى لغسيل بريق الملكي',
          adjustedByUserId: leadTech1.id,
          createdAt: daysAgo(18),
        },
        {
          subscriptionId: activeSubscription.id,
          action: VisitLedgerAction.MANUAL_ADJUSTMENT,
          visitChange: -1,
          balanceBefore: plan.visitCount - 1,
          remainingAfter: plan.visitCount - 2,
          reason: 'استهلاك الزيارة الثانية للتلميع الشامل',
          adjustedByUserId: leadTech1.id,
          createdAt: daysAgo(7),
        },
      ],
    });
  }

  // --------------------------------------------------------------------------
  // SUMMARY REPORT
  // --------------------------------------------------------------------------
  const totalBookingsNow = await prisma.booking.count();
  const totalUsersNow = await prisma.user.count();
  const totalPayments = await prisma.payment.aggregate({ _sum: { amount: true }, _count: true });

  console.log('\n===============================================================');
  console.log('🎉 30-DAY OPERATIONAL SIMULATION COMPLETED SUCCESSFULLY!');
  console.log('===============================================================');
  console.log(`⭐ Total Bookings in Database: ${totalBookingsNow} bookings (Added ${createdCount} new)`);
  console.log(`⭐ Total Platform Users: ${totalUsersNow} users across all roles`);
  console.log(`⭐ Total Platform Revenue Recorded: ${totalPayments._sum.amount?.toLocaleString()} EGP across ${totalPayments._count} payments`);
  console.log('===============================================================\n');

  console.log('🔑 TEST LOGIN CREDENTIALS (ALL ROLES) — Password: Password123!');
  console.log('---------------------------------------------------------------');
  console.log('1. System Super Admin: 01000000000  (All permissions & System control)');
  console.log('2. Owner (المالك):       01000000001  (Financials, Analytics & Catalog)');
  console.log('3. Ops Manager (القاهرة): 01000000002  (Dispatch, Scheduling, Review)');
  console.log('4. Ops Manager (زايد):   01152170339  (Dispatch, Scheduling, Review)');
  console.log('5. Lead Tech (القاهرة):  01000000003  (Mobile Tasks, Checklists, Photos)');
  console.log('6. Lead Tech (زايد):     01124156626  (Mobile Tasks, Checklists, Photos)');
  console.log('7. VIP Customer 1:     01000000004  (Active history & BMW X6)');
  console.log('8. VIP Customer 2:     01146325762  (Active history & G-Class AMG)');
  console.log('---------------------------------------------------------------\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Seeder Failed with Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
