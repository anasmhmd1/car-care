import {
  AssignmentMode,
  BookingStatus,
  BranchStatus,
  ChecklistStage,
  FileType,
  OperationalVehicleStatus,
  PaymentMethodType,
  PaymentStatus,
  PrismaClient,
  ProofStatus,
  SubscriptionStatus,
  UserRole,
  VehicleSize,
  VisitLedgerAction,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const prisma = new PrismaClient();
const POLICY_VERSION = '2026-08-01';
const CANCELLATION_POLICY_TEXT_AR =
  'يمكن للعميل تقديم طلب الإلغاء حتى قبل بدء موعد الخدمة. يُعد الطلب مبكرًا إذا قُدم قبل الموعد بـ 6 ساعات على الأقل. الطلبات داخل هذه المهلة تُوسم كطلبات متأخرة وتخضع لمراجعة التشغيل والتسوية المالية، ولا يعني إرسال الطلب استردادًا تلقائيًا. بعد بدء الخدمة يجب التواصل مع الدعم.';
const LOCAL_IMAGE = '/logo.svg';
const SERVICE_MEDIA: Record<string, { coverImage: string; galleryImages: string[] }> = {
  essential: {
    coverImage: '/images/services/exterior-care.svg',
    galleryImages: ['/images/services/complete-care.svg'],
  },
  interior: {
    coverImage: '/images/services/interior-care.svg',
    galleryImages: ['/images/services/upholstery-care.svg'],
  },
  complete: {
    coverImage: '/images/services/complete-care.svg',
    galleryImages: [
      '/images/services/exterior-care.svg',
      '/images/services/interior-care.svg',
    ],
  },
  vip: {
    coverImage: '/images/services/vip-care.svg',
    galleryImages: [
      '/images/services/complete-care.svg',
      '/images/services/engine-care.svg',
    ],
  },
  upholstery: {
    coverImage: '/images/services/upholstery-care.svg',
    galleryImages: ['/images/services/interior-care.svg'],
  },
  roof: {
    coverImage: '/images/services/roof-care.svg',
    galleryImages: ['/images/services/interior-care.svg'],
  },
  engine: {
    coverImage: '/images/services/engine-care.svg',
    galleryImages: ['/images/services/vip-care.svg'],
  },
};
const DEFAULT_BRAND_FAQS = [
  {
    q: 'هل تحتاج الخدمة إلى مصدر مياه أو كهرباء من موقع العميل؟',
    a: 'فريق بريق مجهز كوحدة تشغيل متنقلة. تأكد فقط من وجود مساحة آمنة تسمح بتنفيذ الخدمة حسب تعليمات الحجز.',
  },
  {
    q: 'كيف يتأكد النظام من عدم تعارض المواعيد؟',
    a: 'يتحقق النظام من ساعات عمل الفرع والفريق، وسعة اليوم، ووقت الانتقال، والحجوزات القائمة قبل إتاحة الموعد.',
  },
  {
    q: 'كيف يتم تأكيد التحويل اليدوي؟',
    a: 'بعد رفع إثبات التحويل، يراجعه فريق التشغيل داخل النظام ثم يرسل حالة المراجعة إلى حسابك.',
  },
  {
    q: 'هل يمكنني تعديل الموعد أو إلغاؤه؟',
    a: 'نعم، يمكن تقديم طلب تعديل أو إلغاء من حسابك وفق السياسة والمهلة الموضحتين في تفاصيل الحجز.',
  },
  {
    q: 'هل يمكن استخدام الاشتراك لأكثر من سيارة؟',
    a: 'يعتمد ذلك على الباقة؛ تظهر عدد السيارات والزيارات المسموح بها بوضوح قبل الاشتراك.',
  },
  {
    q: 'كيف أتواصل مع الدعم؟',
    a: 'يمكنك فتح طلب دعم من حسابك أو استخدام وسائل التواصل المنشورة في صفحة اتصل بنا.',
  },
];
const SEEDED_AT = new Date('2026-08-01T00:00:00.000Z');
const SEED_UPLOAD_ROOT = path.resolve(
  process.env.UPLOAD_DIR?.trim() || path.join(process.cwd(), 'data', 'uploads'),
);

interface SeedPrivateFile {
  fileUrl: string;
  sizeBytes: number;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function ensureSeedPrivateSvg(
  category: string,
  safeName: string,
  label: string,
): Promise<SeedPrivateFile> {
  if (!/^[a-z0-9-]+$/.test(category) || !/^[a-z0-9_-]+\.svg$/.test(safeName)) {
    throw new Error('Unsafe deterministic seed file path.');
  }

  const directory = path.join(SEED_UPLOAD_ROOT, category);
  const filePath = path.join(directory, safeName);
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">',
    '<rect width="1200" height="800" fill="#090909"/>',
    '<rect x="48" y="48" width="1104" height="704" rx="40" fill="#151515" stroke="#d4af37" stroke-width="4"/>',
    '<text x="600" y="350" text-anchor="middle" fill="#d4af37" font-family="Arial, sans-serif" font-size="64" font-weight="700">BAREEQ</text>',
    `<text x="600" y="440" text-anchor="middle" fill="#f4ead0" font-family="Arial, sans-serif" font-size="34">${escapeXml(label)}</text>`,
    '<text x="600" y="510" text-anchor="middle" fill="#9f9276" font-family="Arial, sans-serif" font-size="24">Private seeded evidence · development only</text>',
    '</svg>',
  ].join('');

  await mkdir(directory, { recursive: true });
  await writeFile(filePath, svg, 'utf8');

  return {
    fileUrl: `/api/files/${category}/${safeName}`,
    sizeBytes: Buffer.byteLength(svg, 'utf8'),
  };
}

async function stableUpsert<T>(
  fixedId: string,
  findExisting: () => Promise<{ id: string } | null>,
  upsert: (id: string) => Promise<T>,
): Promise<T> {
  const existing = await findExisting();
  return upsert(existing?.id ?? fixedId);
}

function requireSeedSecret(name: 'SEED_PASSWORD' | 'SEED_ADMIN_PASSWORD', minimumLength: number): string {
  const value = process.env[name]?.trim();
  if (!value || value.length < minimumLength) {
    throw new Error(name + ' is required and must contain at least ' + minimumLength + ' characters.');
  }
  if (/^(change-?me|replace-?me|password|admin)/i.test(value)) {
    throw new Error(name + ' must not use a placeholder or predictable value.');
  }
  return value;
}

function mapValue<T>(values: Map<string, T>, key: string): T {
  const value = values.get(key);
  if (!value) throw new Error('Missing seeded value: ' + key);
  return value;
}

function checklistKey(serviceId: string, stage: ChecklistStage): string {
  return serviceId + ':' + stage;
}

async function main() {
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production') {
    throw new Error('The Bareeq demo seed is disabled when NODE_ENV=production.');
  }

  const sharedPassword = requireSeedSecret('SEED_PASSWORD', 12);
  const adminPassword = requireSeedSecret('SEED_ADMIN_PASSWORD', 16);
  const [sharedPasswordHash, adminPasswordHash] = await Promise.all([
    bcrypt.hash(sharedPassword, 12),
    bcrypt.hash(adminPassword, 12),
  ]);

  console.log('Starting deterministic Bareeq development seed...');

  const brandSettings = await prisma.brandSettings.upsert({
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
  // Populate a helpful first-run FAQ without overwriting editorial content
  // supplied later by the owner.
  if (!Array.isArray(brandSettings.faqs) || brandSettings.faqs.length === 0) {
    await prisma.brandSettings.update({
      where: { id: brandSettings.id },
      data: { faqs: DEFAULT_BRAND_FAQS },
    });
  }

  await prisma.cancellationPolicy.updateMany({
    where: { code: { not: 'standard-cancellation' }, isDefault: true },
    data: { isDefault: false },
  });
  const cancellationPolicy = await prisma.cancellationPolicy.upsert({
    where: { code: 'standard-cancellation' },
    update: {
      nameAr: 'سياسة الإلغاء القياسية',
      version: POLICY_VERSION,
      noticeHours: 6,
      allowsCancellation: true,
      allowsRescheduling: true,
      allowsLateRequests: true,
      policyTextAr: CANCELLATION_POLICY_TEXT_AR,
      active: true,
      isDefault: true,
    },
    create: {
      id: 'seed-cancellation-policy-standard',
      code: 'standard-cancellation',
      nameAr: 'سياسة الإلغاء القياسية',
      version: POLICY_VERSION,
      noticeHours: 6,
      allowsCancellation: true,
      allowsRescheduling: true,
      allowsLateRequests: true,
      policyTextAr: CANCELLATION_POLICY_TEXT_AR,
      active: true,
      isDefault: true,
    },
  });
  const cancellationPolicySnapshot = {
    policyId: cancellationPolicy.id,
    code: cancellationPolicy.code,
    nameAr: cancellationPolicy.nameAr,
    version: cancellationPolicy.version,
    noticeHours: cancellationPolicy.noticeHours,
    allowsCancellation: cancellationPolicy.allowsCancellation,
    allowsRescheduling: cancellationPolicy.allowsRescheduling,
    allowsLateRequests: cancellationPolicy.allowsLateRequests,
    policyTextAr: cancellationPolicy.policyTextAr,
  };

  const permissions = [
    ['booking.accept', 'قبول الحجوزات'],
    ['booking.assign', 'إسناد الحجوزات'],
    ['booking.view_unassigned', 'رؤية الحجوزات غير المسندة'],
    ['booking.close', 'الإغلاق النهائي للحجز'],
    ['booking.override_close', 'إغلاق الحجز باستثناء إداري موثق'],
    ['booking.reschedule', 'إعادة جدولة الحجوزات'],
    ['booking.release_hold', 'تحرير حجز الموعد المؤقت'],
    ['payment.review', 'مراجعة إثباتات الدفع'],
    ['payment.record_balance', 'تسجيل تحصيل الرصيد'],
    ['refund.record_proof', 'تسجيل إثبات الاسترداد'],
    ['refund.approve', 'اعتماد الاسترداد'],
    ['cancellation.review', 'مراجعة الإلغاء'],
    ['quality.review', 'مراجعة الجودة'],
    ['complaint.manage', 'إدارة الشكاوى'],
    ['subscription.manage', 'إدارة الاشتراكات'],
    ['reports.revenue', 'عرض تقارير الإيرادات'],
    ['audit.view', 'عرض سجل التدقيق حسب نطاق الفرع'],
    ['workforce.manage', 'إدارة فرق العمل'],
    ['employee.manage', 'إنشاء وإدارة حسابات Employee بتفويض صريح'],
    ['task.execute', 'تنفيذ مهام الخدمة'],
    ['catalog.price.manage', 'إدارة أسعار الخدمات بتفويض صريح'],
  ] as const;

  for (const [code, nameAr] of permissions) {
    await prisma.permission.upsert({
      where: { code },
      update: { nameAr },
      create: {
        id: 'seed-permission-' + code.replaceAll('.', '-'),
        code,
        nameAr,
        description: 'Bareeq runtime permission: ' + code,
      },
    });
  }

  const operationsPermissions = [
    'booking.accept',
    'booking.assign',
    'booking.view_unassigned',
    'booking.close',
    'booking.override_close',
    'booking.reschedule',
    'booking.release_hold',
    'payment.review',
    'payment.record_balance',
    'refund.record_proof',
    'refund.approve',
    'cancellation.review',
    'quality.review',
    'complaint.manage',
    'subscription.manage',
    'reports.revenue',
    'audit.view',
    'workforce.manage',
    'task.execute',
  ];
  const roleDefinitions = [
    {
      code: UserRole.SYSTEM_SUPER_ADMIN,
      nameAr: 'مدير النظام العام',
      description: 'إدارة النظام والفروع والصلاحيات.',
      permissions: ['*'],
    },
    {
      code: UserRole.OWNER,
      nameAr: 'المالك',
      description: 'مالك بريق بصلاحيات إدارية كاملة.',
      permissions: ['*'],
    },
    {
      code: UserRole.OPERATIONS_MANAGER,
      nameAr: 'مدير التشغيل',
      description: 'إدارة التشغيل والتحصيل والاسترداد داخل الفروع المصرح بها.',
      permissions: operationsPermissions,
    },
    {
      code: UserRole.EMPLOYEE,
      nameAr: 'موظف تنفيذ',
      description: 'تنفيذ مهام الفريق فقط، دون أي صلاحية مالية.',
      permissions: ['task.execute'],
    },
    {
      code: UserRole.CUSTOMER,
      nameAr: 'عميل',
      description: 'حساب عميل بريق.',
      permissions: [],
    },
  ];

  for (const definition of roleDefinitions) {
    await prisma.role.upsert({
      where: { code: definition.code },
      update: {
        nameAr: definition.nameAr,
        description: definition.description,
        permissions: definition.permissions,
      },
      create: {
        id: 'seed-role-' + definition.code.toLowerCase(),
        code: definition.code,
        nameAr: definition.nameAr,
        description: definition.description,
        permissions: definition.permissions,
      },
    });
  }

  const userDefinitions = [
    {
      key: 'owner',
      fullName: 'كريم',
      phone: '201111111111',
      email: 'bbareeq1@gmail.com',
      whatsapp: '201111111111',
      role: UserRole.OWNER,
      passwordHash: sharedPasswordHash,
    },
    {
      key: 'ops',
      fullName: 'حسام الدين مدير التشغيل',
      phone: '201222222222',
      email: 'ops@bareeq.car',
      whatsapp: '201222222222',
      role: UserRole.OPERATIONS_MANAGER,
      passwordHash: sharedPasswordHash,
    },
    {
      key: 'employee-1',
      fullName: 'كريم محمود',
      phone: '201011111111',
      email: null,
      whatsapp: null,
      role: UserRole.EMPLOYEE,
      passwordHash: sharedPasswordHash,
    },
    {
      key: 'employee-2',
      fullName: 'مصطفى حسن',
      phone: '201022222222',
      email: null,
      whatsapp: null,
      role: UserRole.EMPLOYEE,
      passwordHash: sharedPasswordHash,
    },
    {
      key: 'employee-3',
      fullName: 'سامح عبد الله',
      phone: '201033333333',
      email: null,
      whatsapp: null,
      role: UserRole.EMPLOYEE,
      passwordHash: sharedPasswordHash,
    },
    {
      key: 'employee-4',
      fullName: 'عمر فاروق',
      phone: '201044444444',
      email: null,
      whatsapp: null,
      role: UserRole.EMPLOYEE,
      passwordHash: sharedPasswordHash,
    },
    {
      key: 'customer-1',
      fullName: 'أحمد محمود',
      phone: '201511111111',
      email: 'ahmed@gmail.com',
      whatsapp: '201511111111',
      role: UserRole.CUSTOMER,
      passwordHash: sharedPasswordHash,
    },
    {
      key: 'customer-2',
      fullName: 'سارة يوسف',
      phone: '201522222222',
      email: 'sara@gmail.com',
      whatsapp: '201522222222',
      role: UserRole.CUSTOMER,
      passwordHash: sharedPasswordHash,
    },
    {
      key: 'customer-3',
      fullName: 'محمد علي',
      phone: '201533333333',
      email: 'mohamed@gmail.com',
      whatsapp: '201533333333',
      role: UserRole.CUSTOMER,
      passwordHash: sharedPasswordHash,
    },
  ];

  const users = new Map<string, { id: string; phone: string; fullName: string; role: UserRole }>();
  for (const definition of userDefinitions) {
    const user = await prisma.user.upsert({
      where: { phone: definition.phone },
      update: {
        fullName: definition.fullName,
        email: definition.email,
        whatsapp: definition.whatsapp,
        passwordHash: definition.passwordHash,
        role: definition.role,
        active: true,
        mustChangePwd: true,
        deletedAt: null,
        deletedByUserId: null,
        deleteReason: null,
      },
      create: {
        id: 'seed-user-' + definition.key,
        fullName: definition.fullName,
        phone: definition.phone,
        email: definition.email,
        whatsapp: definition.whatsapp,
        passwordHash: definition.passwordHash,
        role: definition.role,
        active: true,
        mustChangePwd: true,
      },
    });
    users.set(definition.key, user);
  }

  const owner = mapValue(users, 'owner');
  const opsManager = mapValue(users, 'ops');
  const employee1 = mapValue(users, 'employee-1');
  const employee2 = mapValue(users, 'employee-2');
  const employee3 = mapValue(users, 'employee-3');
  const employee4 = mapValue(users, 'employee-4');

  const branch = await prisma.branch.upsert({
    where: { code: 'ZAYED-01' },
    update: {
      nameAr: 'فرع الشيخ زايد الرئيسي',
      nameEn: 'Bareeq Sheikh Zayed Branch',
      address: 'الشيخ زايد - الحي المتميز - محور 26 يوليو',
      phone: '01099998888',
      whatsapp: '201099998888',
      status: BranchStatus.ACTIVE,
      timezone: 'Africa/Cairo',
      slotUnitMinutes: 60,
      arrivalWindowMinutes: 30,
      travelBufferMinutes: 30,
      dailyBookingLimit: 25,
      assignmentMode: AssignmentMode.AUTOMATIC,
    },
    create: {
      id: 'seed-branch-zayed',
      nameAr: 'فرع الشيخ زايد الرئيسي',
      nameEn: 'Bareeq Sheikh Zayed Branch',
      code: 'ZAYED-01',
      address: 'الشيخ زايد - الحي المتميز - محور 26 يوليو',
      phone: '01099998888',
      whatsapp: '201099998888',
      status: BranchStatus.ACTIVE,
      timezone: 'Africa/Cairo',
      slotUnitMinutes: 60,
      arrivalWindowMinutes: 30,
      travelBufferMinutes: 30,
      dailyBookingLimit: 25,
      assignmentMode: AssignmentMode.AUTOMATIC,
    },
  });

  for (const user of [owner, opsManager, employee1, employee2, employee3, employee4]) {
    await prisma.branchMembership.upsert({
      where: { branchId_userId: { branchId: branch.id, userId: user.id } },
      update: {},
      create: {
        id: 'seed-membership-' + user.id,
        branchId: branch.id,
        userId: user.id,
      },
    });
  }

  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
    const isClosed = dayOfWeek === 5;
    await prisma.branchWorkingHours.upsert({
      where: { branchId_dayOfWeek: { branchId: branch.id, dayOfWeek } },
      update: {
        isClosed,
        openTime: '09:00',
        closeTime: '16:00',
        breakStartTime: '12:00',
        breakEndTime: '13:00',
      },
      create: {
        id: 'seed-branch-hours-' + dayOfWeek,
        branchId: branch.id,
        dayOfWeek,
        isClosed,
        openTime: '09:00',
        closeTime: '16:00',
        breakStartTime: '12:00',
        breakEndTime: '13:00',
      },
    });
  }

  const paymentMethodDefinitions = [
    {
      key: 'vodafone',
      name: 'فودافون كاش - Vodafone Cash',
      type: PaymentMethodType.VODAFONE_CASH,
      accountNumber: '01012345678',
      accountName: 'بريق للعناية بالسيارات',
      instructions: 'حوّل المبلغ ثم ارفع صورة إثبات التحويل.',
      isDefault: true,
    },
    {
      key: 'instapay',
      name: 'إنستاباي - InstaPay',
      type: PaymentMethodType.INSTAPAY,
      accountNumber: 'bareeq@instapay',
      accountName: 'Bareeq Car Care',
      instructions: 'حوّل إلى معرّف InstaPay ثم ارفع صورة التحويل.',
      isDefault: false,
    },
    {
      key: 'bank',
      name: 'تحويل بنكي - CIB',
      type: PaymentMethodType.BANK_TRANSFER,
      accountNumber: 'EG12345678901234567890',
      accountName: 'شركة بريق لخدمات السيارات المتنقلة',
      instructions: 'ارفع إيصال التحويل البنكي مع رقم الحجز.',
      isDefault: false,
    },
  ];
  const paymentMethods = new Map<string, { id: string; name: string }>();
  for (const definition of paymentMethodDefinitions) {
    const paymentMethod = await stableUpsert(
      'seed-payment-method-' + definition.key,
      () => prisma.branchPaymentMethod.findFirst({
        where: {
          branchId: branch.id,
          type: definition.type,
          accountNumber: definition.accountNumber,
        },
        select: { id: true },
      }),
      (id) => prisma.branchPaymentMethod.upsert({
        where: { id },
        update: {
          name: definition.name,
          type: definition.type,
          accountNumber: definition.accountNumber,
          accountName: definition.accountName,
          instructions: definition.instructions,
          active: true,
          isDefault: definition.isDefault,
        },
        create: {
          id,
          branchId: branch.id,
          name: definition.name,
          type: definition.type,
          accountNumber: definition.accountNumber,
          accountName: definition.accountName,
          instructions: definition.instructions,
          active: true,
          isDefault: definition.isDefault,
        },
      }),
    );
    paymentMethods.set(definition.key, paymentMethod);
  }

  const zoneDefinitions = [
    {
      key: 'zone-1',
      name: 'Zone 1 — Residential Districts',
      description: 'الأحياء السكنية المركزية بالشيخ زايد',
      areas: [
        { compound: 'الحي الثامن', district: 'الحي 8' },
        { compound: 'الحي التاسع', district: 'الحي 9' },
        { compound: 'الحي العاشر', district: 'الحي 10' },
        { compound: 'الحي الحادي عشر', district: 'الحي 11' },
      ],
    },
    {
      key: 'zone-2',
      name: 'Zone 2 — Beverly / SODIC',
      description: 'مجمع كمبوندات بيفرلي هيلز وسوديك',
      areas: [
        { compound: 'Beverly Hills', district: 'الثورة الخضراء' },
        { compound: 'SODIC West', district: 'سوديك' },
        { compound: 'Allegria', district: 'سوديك' },
        { compound: 'Westown', district: 'سوديك' },
        { compound: 'Karma 4', district: 'الكرامة' },
      ],
    },
    {
      key: 'zone-3',
      name: 'Zone 3 — Karma / Rabwa',
      description: 'كمبوندات الكرمة والربوة والياسمين',
      areas: [
        { compound: 'Karma 1', district: 'الكرامة' },
        { compound: 'Karma 2', district: 'الكرامة' },
        { compound: 'Karma 3', district: 'الكرامة' },
        { compound: 'Al Rabwa', district: 'الربوة' },
        { compound: 'Al Yasmeen', district: 'الياسمين' },
      ],
    },
  ];
  const zones = new Map<string, { id: string; name: string }>();
  const coverageAreas = new Map<string, { id: string; compound: string }>();
  for (const zoneDefinition of zoneDefinitions) {
    const zone = await stableUpsert(
      'seed-coverage-' + zoneDefinition.key,
      () => prisma.coverageZone.findFirst({
        where: { branchId: branch.id, name: zoneDefinition.name },
        select: { id: true },
      }),
      (id) => prisma.coverageZone.upsert({
        where: { id },
        update: { name: zoneDefinition.name, description: zoneDefinition.description },
        create: {
          id,
          branchId: branch.id,
          name: zoneDefinition.name,
          description: zoneDefinition.description,
        },
      }),
    );
    zones.set(zoneDefinition.key, zone);
    for (const [index, areaDefinition] of zoneDefinition.areas.entries()) {
      const area = await stableUpsert(
        'seed-area-' + zoneDefinition.key + '-' + (index + 1),
        () => prisma.coverageArea.findFirst({
          where: { zoneId: zone.id, compound: areaDefinition.compound },
          select: { id: true },
        }),
        (id) => prisma.coverageArea.upsert({
          where: { id },
          update: {
            governorate: 'الجيزة',
            city: 'الشيخ زايد',
            district: areaDefinition.district,
            compound: areaDefinition.compound,
            active: true,
            priority: index + 1,
          },
          create: {
            id,
            zoneId: zone.id,
            governorate: 'الجيزة',
            city: 'الشيخ زايد',
            district: areaDefinition.district,
            compound: areaDefinition.compound,
            active: true,
            priority: index + 1,
          },
        }),
      );
      coverageAreas.set(areaDefinition.compound, area);
    }
  }

  const zone1 = mapValue(zones, 'zone-1');
  const zone2 = mapValue(zones, 'zone-2');
  const zone3 = mapValue(zones, 'zone-3');
  const travelDefinitions = [
    [zone1.id, zone1.id, 15],
    [zone1.id, zone2.id, 30],
    [zone1.id, zone3.id, 30],
    [zone2.id, zone1.id, 30],
    [zone2.id, zone2.id, 15],
    [zone2.id, zone3.id, 20],
    [zone3.id, zone1.id, 30],
    [zone3.id, zone2.id, 20],
    [zone3.id, zone3.id, 15],
  ] as const;
  for (const [fromZoneId, toZoneId, durationMinutes] of travelDefinitions) {
    await prisma.zoneTravelTime.upsert({
      where: { fromZoneId_toZoneId: { fromZoneId, toZoneId } },
      update: { durationMinutes },
      create: {
        id: 'seed-travel-' + fromZoneId + '-' + toZoneId,
        fromZoneId,
        toZoneId,
        durationMinutes,
      },
    });
  }

  const teamDefinitions = [
    {
      key: 'alpha',
      name: 'فريق بريق ألفا (Alpha Team)',
      leader: employee1,
      members: [employee1, employee2],
      priority: 1,
      baseZoneId: zone1.id,
    },
    {
      key: 'beta',
      name: 'فريق بريق بيتا (Beta Team)',
      leader: employee3,
      members: [employee3, employee4],
      priority: 2,
      baseZoneId: zone2.id,
    },
  ];
  const teams = new Map<string, { id: string; name: string; leaderId: string | null }>();
  for (const definition of teamDefinitions) {
    const team = await stableUpsert(
      'seed-team-' + definition.key,
      () => prisma.team.findFirst({
        where: { branchId: branch.id, name: definition.name },
        select: { id: true },
      }),
      (id) => prisma.team.upsert({
        where: { id },
        update: {
          name: definition.name,
          leaderId: definition.leader.id,
          baseZoneId: definition.baseZoneId,
          dailyCapacity: 5,
          active: true,
          assignmentPriority: definition.priority,
        },
        create: {
          id,
          branchId: branch.id,
          name: definition.name,
          leaderId: definition.leader.id,
          baseZoneId: definition.baseZoneId,
          dailyCapacity: 5,
          active: true,
          assignmentPriority: definition.priority,
        },
      }),
    );
    teams.set(definition.key, team);
    for (const member of definition.members) {
      await prisma.teamMember.upsert({
        where: { userId: member.id },
        update: { teamId: team.id, isLeader: member.id === definition.leader.id },
        create: {
          id: 'seed-team-member-' + member.id,
          teamId: team.id,
          userId: member.id,
          isLeader: member.id === definition.leader.id,
        },
      });
    }
    for (const zone of zones.values()) {
      await prisma.teamZone.upsert({
        where: { teamId_zoneId: { teamId: team.id, zoneId: zone.id } },
        update: {},
        create: {
          id: 'seed-team-zone-' + definition.key + '-' + zone.id,
          teamId: team.id,
          zoneId: zone.id,
        },
      });
    }
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
      const isOff = dayOfWeek === 5;
      await prisma.teamWorkingHours.upsert({
        where: { teamId_dayOfWeek: { teamId: team.id, dayOfWeek } },
        update: {
          isOff,
          openTime: '09:00',
          closeTime: '16:00',
          breakStartTime: '12:00',
          breakEndTime: '13:00',
        },
        create: {
          id: 'seed-team-hours-' + definition.key + '-' + dayOfWeek,
          teamId: team.id,
          dayOfWeek,
          isOff,
          openTime: '09:00',
          closeTime: '16:00',
          breakStartTime: '12:00',
          breakEndTime: '13:00',
        },
      });
    }
  }

  // These are clearly-labelled development operating units, not real-world
  // plate data. They keep the resource-assignment workflow usable from the
  // first local run; operations can replace them with the actual fleet.
  const operationalVehicleDefinitions = [
    {
      key: 'alpha',
      code: 'BRQ-OPS-01',
      make: 'Bareeq',
      model: 'Mobile Care Unit 01',
      year: 2025,
      notes: 'وحدة تشغيل تجريبية للفريق ألفا — استبدلها ببيانات المركبة الفعلية قبل الإطلاق.',
    },
    {
      key: 'beta',
      code: 'BRQ-OPS-02',
      make: 'Bareeq',
      model: 'Mobile Care Unit 02',
      year: 2025,
      notes: 'وحدة تشغيل تجريبية للفريق بيتا — استبدلها ببيانات المركبة الفعلية قبل الإطلاق.',
    },
  ];
  for (const definition of operationalVehicleDefinitions) {
    const team = mapValue(teams, definition.key);
    await prisma.operationalVehicle.upsert({
      where: { code: definition.code },
      update: {
        branchId: branch.id,
        teamId: team.id,
        make: definition.make,
        model: definition.model,
        year: definition.year,
        status: OperationalVehicleStatus.ACTIVE,
        notes: definition.notes,
      },
      create: {
        id: 'seed-operational-vehicle-' + definition.key,
        branchId: branch.id,
        teamId: team.id,
        code: definition.code,
        make: definition.make,
        model: definition.model,
        year: definition.year,
        status: OperationalVehicleStatus.ACTIVE,
        notes: definition.notes,
      },
    });
  }

  const serviceDefinitions = [
    {
      key: 'essential',
      slug: 'bareeq-essential-exterior',
      nameAr: 'غسيل بريق الخارجي الأساسي',
      nameEn: 'Bareeq Essential Exterior',
      summary: 'غسيل وتلميع خارجي احترافي مع طبقة حماية سريعة.',
      description: 'تنظيف الهيكل الخارجي والجنوط والإطارات والزجاج مع شمع حماية سريع للطلاء.',
      basePrice: 350,
      durationMinutes: 60,
      slotCount: 1,
      depositValue: 30,
      minimumPhotos: 2,
      variantPrices: [350, 400, 450, 500],
      variantDurations: [60, 60, 75, 90],
    },
    {
      key: 'interior',
      slug: 'bareeq-interior-care',
      nameAr: 'عناية بريق الداخلية المكثفة',
      nameEn: 'Bareeq Interior Care',
      summary: 'تنظيف وتعقيم المقصورة بالكامل مع ترطيب الأسطح.',
      description: 'شفط عميق وتعقيم بالبخار وتنظيف التابلوه والأبواب والمقاعد وفتحات التكييف.',
      basePrice: 450,
      durationMinutes: 60,
      slotCount: 1,
      depositValue: 30,
      minimumPhotos: 2,
      variantPrices: [450, 500, 600, 700],
      variantDurations: [60, 60, 75, 90],
    },
    {
      key: 'complete',
      slug: 'bareeq-complete-care',
      nameAr: 'عناية بريق الشاملة',
      nameEn: 'Bareeq Complete Care',
      summary: 'عناية داخلية وخارجية متكاملة في زيارة واحدة.',
      description: 'باقة تجمع الغسيل الخارجي والتنظيف الداخلي بالبخار والعناية بالجنوط وحماية الطلاء.',
      basePrice: 700,
      durationMinutes: 90,
      slotCount: 2,
      depositValue: 30,
      minimumPhotos: 3,
      variantPrices: [700, 800, 950, 1100],
      variantDurations: [90, 90, 120, 120],
    },
    {
      key: 'vip',
      slug: 'bareeq-vip-deep-care',
      nameAr: 'عناية بريق الملكية العميقة',
      nameEn: 'Bareeq VIP Deep Care',
      summary: 'تفصيل عميق فاخر للداخل والخارج والمحرك.',
      description: 'عناية تفصيلية شاملة مع معالجة البقع وتنظيف المحرك وحماية متقدمة للطلاء.',
      basePrice: 1200,
      durationMinutes: 150,
      slotCount: 3,
      depositValue: 40,
      minimumPhotos: 4,
      variantPrices: [1200, 1400, 1650, 1900],
      variantDurations: [150, 150, 180, 180],
    },
    {
      key: 'upholstery',
      slug: 'bareeq-deep-upholstery-care',
      nameAr: 'تنظيف الفرش العميق',
      nameEn: 'Bareeq Deep Upholstery Care',
      summary: 'استخراج عميق للبقع والأتربة من المقاعد والأرضيات.',
      description: 'تنظيف عميق للفرش والسجاد مع معالجة البقع وتجفيف احترافي.',
      basePrice: 650,
      durationMinutes: 120,
      slotCount: 2,
      depositValue: 30,
      minimumPhotos: 3,
      variantPrices: [650, 750, 850, 950],
      variantDurations: [120, 120, 150, 150],
    },
    {
      key: 'roof',
      slug: 'bareeq-roof-deep-care',
      nameAr: 'عناية السقف العميقة',
      nameEn: 'Bareeq Roof Deep Care',
      summary: 'تنظيف آمن وعميق لبطانة سقف السيارة.',
      description: 'معالجة منخفضة الرطوبة تحافظ على بطانة السقف وتزيل البقع والروائح.',
      basePrice: 400,
      durationMinutes: 60,
      slotCount: 1,
      depositValue: 30,
      minimumPhotos: 2,
      variantPrices: [400, 450, 500, 550],
      variantDurations: [60, 60, 75, 75],
    },
    {
      key: 'engine',
      slug: 'bareeq-engine-bay-care',
      nameAr: 'عناية حوض المحرك',
      nameEn: 'Bareeq Engine Bay Care',
      summary: 'تنظيف آمن ومفصل لحوض المحرك ومكوناته الظاهرة.',
      description: 'عزل المكونات الحساسة وتنظيف حوض المحرك بمواد آمنة ثم تجفيفه وتلميعه.',
      basePrice: 500,
      durationMinutes: 75,
      slotCount: 2,
      depositValue: 30,
      minimumPhotos: 3,
      variantPrices: [500, 550, 600, 650],
      variantDurations: [75, 75, 90, 90],
    },
  ];
  const vehicleSizes = [
    VehicleSize.SEDAN,
    VehicleSize.CROSSOVER,
    VehicleSize.SUV,
    VehicleSize.LARGE_SUV,
  ];
  const services = new Map<string, {
    id: string;
    slug: string;
    nameAr: string;
    basePrice: number;
    depositValue: number;
    minimumBeforePhotos: number;
    minimumAfterPhotos: number;
  }>();

  for (const definition of serviceDefinitions) {
    const media = SERVICE_MEDIA[definition.key] ?? {
      coverImage: LOCAL_IMAGE,
      galleryImages: [],
    };
    const commonServiceData = {
      cancellationPolicyId: cancellationPolicy.id,
      nameAr: definition.nameAr,
      nameEn: definition.nameEn,
      shortDescriptionAr: definition.summary,
      fullDescriptionAr: definition.description,
      coverImage: media.coverImage,
      galleryImages: media.galleryImages,
      includedItems: ['تنفيذ احترافي', 'مواد آمنة', 'فحص قبل وبعد الخدمة'],
      excludedItems: ['الإصلاحات الميكانيكية', 'قطع الغيار'],
      benefits: ['عناية متنقلة', 'نتيجة موثقة', 'مواد متخصصة'],
      preparationInstructions: 'توفير مساحة آمنة للعمل ومصدر كهرباء ومياه عند الطلب.',
      basePrice: definition.basePrice,
      priceType: 'VARIANT_BASED',
      durationMinutes: definition.durationMinutes,
      slotCount: definition.slotCount,
      requiredTeamSize: 2,
      requiresDeposit: true,
      depositType: 'PERCENTAGE',
      depositValue: definition.depositValue,
      requiresFullPrepayment: false,
      active: true,
      bookableOnline: true,
      subscriptionEligible: true,
      minimumBeforePhotos: definition.minimumPhotos,
      minimumAfterPhotos: definition.minimumPhotos,
    };
    const service = await prisma.service.upsert({
      where: { slug: definition.slug },
      update: commonServiceData,
      create: {
        id: 'seed-service-' + definition.key,
        slug: definition.slug,
        ...commonServiceData,
      },
    });
    services.set(definition.key, service);

    await prisma.branchService.upsert({
      where: { branchId_serviceId: { branchId: branch.id, serviceId: service.id } },
      update: {
        active: true,
        bookableOnline: true,
        priceOverride: null,
        durationOverrideMinutes: null,
      },
      create: {
        id: 'seed-branch-service-' + definition.key,
        branchId: branch.id,
        serviceId: service.id,
        active: true,
        bookableOnline: true,
      },
    });

    for (const [index, vehicleSize] of vehicleSizes.entries()) {
      const durationMinutes = definition.variantDurations[index];
      await prisma.serviceVariant.upsert({
        where: { serviceId_vehicleSize: { serviceId: service.id, vehicleSize } },
        update: {
          price: definition.variantPrices[index],
          durationMinutes,
          slotCount: Math.ceil(durationMinutes / 60),
          depositValue: definition.depositValue,
        },
        create: {
          id: 'seed-variant-' + definition.key + '-' + vehicleSize.toLowerCase(),
          serviceId: service.id,
          vehicleSize,
          price: definition.variantPrices[index],
          durationMinutes,
          slotCount: Math.ceil(durationMinutes / 60),
          depositValue: definition.depositValue,
        },
      });
    }

    for (const [teamKey, team] of teams) {
      await prisma.teamCapability.upsert({
        where: { teamId_serviceId: { teamId: team.id, serviceId: service.id } },
        update: {},
        create: {
          id: 'seed-capability-' + teamKey + '-' + definition.key,
          teamId: team.id,
          serviceId: service.id,
        },
      });
    }
  }

  // Starter inventory is intentionally generic and is seeded only in local
  // development. It connects the owner-selected material requirements to the
  // staff checklist and the operations resources board on a fresh install.
  const materialDefinitions = [
    { key: 'shampoo', sku: 'BRQ-SHAMPOO-PH', nameAr: 'شامبو سيارات متعادل', nameEn: 'pH-neutral car shampoo', unit: 'لتر', reorderPoint: 8, initialStock: 40 },
    { key: 'wheel-cleaner', sku: 'BRQ-WHEEL-CLEAN', nameAr: 'منظف جنوط آمن', nameEn: 'safe wheel cleaner', unit: 'لتر', reorderPoint: 5, initialStock: 25 },
    { key: 'microfiber', sku: 'BRQ-MICROFIBER', nameAr: 'فوط مايكروفايبر احترافية', nameEn: 'professional microfiber towels', unit: 'قطعة', reorderPoint: 20, initialStock: 60 },
    { key: 'interior-apc', sku: 'BRQ-INTERIOR-APC', nameAr: 'منظف داخلي متعادل', nameEn: 'neutral interior cleaner', unit: 'لتر', reorderPoint: 5, initialStock: 25 },
    { key: 'upholstery', sku: 'BRQ-UPHOLSTERY', nameAr: 'محلول تنظيف الفرش', nameEn: 'upholstery extraction solution', unit: 'لتر', reorderPoint: 5, initialStock: 20 },
    { key: 'odor-neutral', sku: 'BRQ-ODOR-NEUTRAL', nameAr: 'معادل روائح داخلي', nameEn: 'interior odor neutralizer', unit: 'لتر', reorderPoint: 3, initialStock: 15 },
    { key: 'engine-degreaser', sku: 'BRQ-ENGINE-DEGREASER', nameAr: 'مزيل دهون آمن للمحرك', nameEn: 'safe engine degreaser', unit: 'لتر', reorderPoint: 4, initialStock: 18 },
    { key: 'plastic-dress', sku: 'BRQ-PLASTIC-DRESS', nameAr: 'حماية بلاستيك ومطاط', nameEn: 'plastic and rubber dressing', unit: 'لتر', reorderPoint: 3, initialStock: 15 },
    { key: 'paint-protect', sku: 'BRQ-PAINT-PROTECT', nameAr: 'طبقة حماية للطلاء', nameEn: 'paint protection finish', unit: 'لتر', reorderPoint: 4, initialStock: 18 },
  ];
  const materials = new Map<string, { id: string; unit: string }>();
  for (const definition of materialDefinitions) {
    const material = await prisma.material.upsert({
      where: { sku: definition.sku },
      update: {
        nameAr: definition.nameAr,
        nameEn: definition.nameEn,
        unit: definition.unit,
        defaultReorderPoint: definition.reorderPoint,
        active: true,
      },
      create: {
        id: 'seed-material-' + definition.key,
        sku: definition.sku,
        nameAr: definition.nameAr,
        nameEn: definition.nameEn,
        unit: definition.unit,
        defaultReorderPoint: definition.reorderPoint,
        active: true,
      },
    });
    materials.set(definition.key, material);

    await prisma.branchMaterialStock.upsert({
      where: { branchId_materialId: { branchId: branch.id, materialId: material.id } },
      update: {
        // Preserve live stock counts if a developer has already adjusted them.
        reorderPoint: definition.reorderPoint,
        active: true,
      },
      create: {
        id: 'seed-branch-stock-' + definition.key,
        branchId: branch.id,
        materialId: material.id,
        quantityOnHand: definition.initialStock,
        reservedQuantity: 0,
        reorderPoint: definition.reorderPoint,
        active: true,
      },
    });
  }

  const materialRequirements = [
    ['essential', 'shampoo', 1, 'غسيل الهيكل الخارجي'],
    ['essential', 'wheel-cleaner', 1, 'تنظيف الجنوط'],
    ['essential', 'microfiber', 3, 'تجفيف وتلميع نهائي'],
    ['essential', 'paint-protect', 1, 'طبقة حماية سريعة'],
    ['interior', 'interior-apc', 1, 'تنظيف الأسطح الداخلية'],
    ['interior', 'microfiber', 4, 'مسح وتجفيف المقصورة'],
    ['interior', 'odor-neutral', 1, 'إنعاش المقصورة'],
    ['complete', 'shampoo', 1, 'غسيل خارجي'],
    ['complete', 'wheel-cleaner', 1, 'تنظيف الجنوط'],
    ['complete', 'interior-apc', 1, 'تنظيف داخلي'],
    ['complete', 'microfiber', 5, 'تجفيف وتلميع'],
    ['complete', 'odor-neutral', 1, 'معالجة الروائح'],
    ['complete', 'paint-protect', 1, 'حماية الطلاء'],
    ['vip', 'shampoo', 1, 'عناية خارجية عميقة'],
    ['vip', 'wheel-cleaner', 1, 'عناية الجنوط'],
    ['vip', 'interior-apc', 1, 'عناية المقصورة'],
    ['vip', 'upholstery', 1, 'معالجة الفرش'],
    ['vip', 'engine-degreaser', 1, 'تنظيف حوض المحرك'],
    ['vip', 'plastic-dress', 1, 'حماية الأسطح البلاستيكية'],
    ['vip', 'microfiber', 7, 'تشطيب دقيق'],
    ['vip', 'paint-protect', 1, 'حماية متقدمة للطلاء'],
    ['upholstery', 'upholstery', 1, 'استخراج عميق للبقع'],
    ['upholstery', 'microfiber', 4, 'تجفيف وتشطيب'],
    ['upholstery', 'odor-neutral', 1, 'تعادل روائح بعد التنظيف'],
    ['roof', 'interior-apc', 1, 'تنظيف منخفض الرطوبة'],
    ['roof', 'microfiber', 3, 'تجفيف آمن لبطانة السقف'],
    ['roof', 'odor-neutral', 1, 'معالجة الروائح'],
    ['engine', 'engine-degreaser', 1, 'تنظيف حوض المحرك'],
    ['engine', 'microfiber', 3, 'تجفيف المكونات الظاهرة'],
    ['engine', 'plastic-dress', 1, 'حماية التشطيبات البلاستيكية'],
  ] as const;
  for (const [serviceKey, materialKey, quantity, notes] of materialRequirements) {
    const service = mapValue(services, serviceKey);
    const material = mapValue(materials, materialKey);
    await prisma.serviceMaterialRequirement.upsert({
      where: { serviceId_materialId: { serviceId: service.id, materialId: material.id } },
      update: { quantity, required: true, notes },
      create: {
        id: 'seed-service-material-' + serviceKey + '-' + materialKey,
        serviceId: service.id,
        materialId: material.id,
        quantity,
        required: true,
        notes,
      },
    });
  }

  const addonDefinitions = [
    {
      key: 'glass',
      nameAr: 'طبقة هيدروفوبيك للزجاج',
      nameEn: 'Glass Hydrophobic Coating',
      price: 150,
      durationMinutes: 15,
    },
    {
      key: 'ozone',
      nameAr: 'تعقيم أوزون للتكييف',
      nameEn: 'Ozone AC Sterilization',
      price: 200,
      durationMinutes: 15,
    },
    {
      key: 'leather',
      nameAr: 'تغذية وحماية الجلد',
      nameEn: 'Leather Conditioner',
      price: 250,
      durationMinutes: 20,
    },
  ];
  const addons = new Map<string, { id: string }>();
  for (const definition of addonDefinitions) {
    const addon = await stableUpsert(
      'seed-addon-' + definition.key,
      () => prisma.serviceAddon.findFirst({
        where: { nameEn: definition.nameEn },
        select: { id: true },
      }),
      (id) => prisma.serviceAddon.upsert({
        where: { id },
        update: {
          nameAr: definition.nameAr,
          nameEn: definition.nameEn,
          price: definition.price,
          durationMinutes: definition.durationMinutes,
          slotCount: 0,
          active: true,
        },
        create: {
          id,
          nameAr: definition.nameAr,
          nameEn: definition.nameEn,
          price: definition.price,
          durationMinutes: definition.durationMinutes,
          slotCount: 0,
          active: true,
        },
      }),
    );
    addons.set(definition.key, addon);
  }

  for (const [serviceKey, service] of services) {
    for (const [addonKey, addon] of addons) {
      await prisma.serviceAddonLink.upsert({
        where: { serviceId_addonId: { serviceId: service.id, addonId: addon.id } },
        update: {},
        create: {
          id: 'seed-addon-link-' + serviceKey + '-' + addonKey,
          serviceId: service.id,
          addonId: addon.id,
        },
      });
    }
  }

  const checklistDefinitions = [
    {
      stage: ChecklistStage.TEAM_PREPARATION,
      name: 'قائمة تحضير الفريق',
      items: [
        { labelAr: 'مراجعة تفاصيل الحجز والخدمة المطلوبة', requiresPhoto: false },
        { labelAr: 'التأكد من اكتمال المواد والأدوات', requiresPhoto: false },
      ],
    },
    {
      stage: ChecklistStage.ARRIVAL_INSPECTION,
      name: 'قائمة فحص الوصول واستلام السيارة',
      items: [
        { labelAr: 'مطابقة العميل والسيارة ورقم اللوحة', requiresPhoto: false },
        { labelAr: 'فحص وتوثيق الأضرار والخدوش السابقة', requiresPhoto: true },
        { labelAr: 'التأكد من غلق النوافذ وفتحة السقف', requiresPhoto: false },
      ],
    },
    {
      stage: ChecklistStage.SERVICE_EXECUTION,
      name: 'قائمة خطوات تنفيذ الخدمة',
      items: [
        { labelAr: 'تطبيق المواد المخصصة للأسطح بأمان', requiresPhoto: false },
        { labelAr: 'تنظيف الزوايا وحواف الأبواب والجنوط', requiresPhoto: false },
        { labelAr: 'مراجعة خلو الموقع من آثار المواد', requiresPhoto: false },
      ],
    },
    {
      stage: ChecklistStage.CLOSING,
      name: 'قائمة الإغلاق وتسليم السيارة',
      items: [
        { labelAr: 'التقاط صور ما بعد الخدمة', requiresPhoto: true },
        { labelAr: 'التأكد من عدم ترك أدوات أو متعلقات', requiresPhoto: false },
        { labelAr: 'تأكيد رضا العميل عن التسليم', requiresPhoto: false },
      ],
    },
  ];
  const checklistTemplates = new Map<string, { id: string }>();
  const checklistItems = new Map<string, Array<{
    id: string;
    labelAr: string;
    requiresPhoto: boolean;
  }>>();

  for (const [serviceKey, service] of services) {
    for (const definition of checklistDefinitions) {
      const template = await stableUpsert(
        'seed-checklist-' + serviceKey + '-' + definition.stage.toLowerCase(),
        () => prisma.checklistTemplate.findFirst({
          where: {
            serviceId: service.id,
            stage: definition.stage,
            name: definition.name,
          },
          select: { id: true },
        }),
        (id) => prisma.checklistTemplate.upsert({
          where: { id },
          update: { stage: definition.stage, name: definition.name },
          create: {
            id,
            serviceId: service.id,
            stage: definition.stage,
            name: definition.name,
          },
        }),
      );
      const key = checklistKey(service.id, definition.stage);
      checklistTemplates.set(key, template);
      const seededItems: Array<{ id: string; labelAr: string; requiresPhoto: boolean }> = [];
      for (const [index, itemDefinition] of definition.items.entries()) {
        const item = await stableUpsert(
          'seed-checklist-item-' + serviceKey + '-' + definition.stage.toLowerCase() + '-' + (index + 1),
          () => prisma.checklistTemplateItem.findFirst({
            where: { templateId: template.id, labelAr: itemDefinition.labelAr },
            select: { id: true },
          }),
          (id) => prisma.checklistTemplateItem.upsert({
            where: { id },
            update: {
              labelAr: itemDefinition.labelAr,
              required: true,
              requiresPhoto: itemDefinition.requiresPhoto,
              requiresNote: false,
              displayOrder: index + 1,
              active: true,
            },
            create: {
              id,
              templateId: template.id,
              labelAr: itemDefinition.labelAr,
              required: true,
              requiresPhoto: itemDefinition.requiresPhoto,
              requiresNote: false,
              displayOrder: index + 1,
              active: true,
            },
          }),
        );
        seededItems.push(item);
      }
      checklistItems.set(template.id, seededItems);
    }
  }

  const planDefinitions = [
    {
      key: 'monthly',
      nameAr: 'باقة العناية الشهرية الذهبية',
      descriptionAr: 'أربع زيارات خلال 30 يومًا لسيارة واحدة.',
      price: 2200,
      validityDays: 30,
      visitCount: 4,
      allowedVehicleCount: 1,
      freezeAllowed: false,
      maxFreezeDays: 0,
      serviceKeys: ['essential', 'complete'],
    },
    {
      key: 'family',
      nameAr: 'باقة العائلة الملكية (8 زيارات)',
      descriptionAr: 'ثماني زيارات خلال 60 يومًا لثلاث سيارات.',
      price: 4200,
      validityDays: 60,
      visitCount: 8,
      allowedVehicleCount: 3,
      freezeAllowed: true,
      maxFreezeDays: 7,
      serviceKeys: ['essential', 'interior', 'complete'],
    },
  ];
  const plans = new Map<string, { id: string; price: number; visitCount: number }>();
  for (const definition of planDefinitions) {
    const plan = await stableUpsert(
      'seed-plan-' + definition.key,
      () => prisma.subscriptionPlan.findFirst({
        where: { nameAr: definition.nameAr },
        select: { id: true },
      }),
      (id) => prisma.subscriptionPlan.upsert({
        where: { id },
        update: {
          nameAr: definition.nameAr,
          descriptionAr: definition.descriptionAr,
          price: definition.price,
          validityDays: definition.validityDays,
          visitCount: definition.visitCount,
          allowedVehicleCount: definition.allowedVehicleCount,
          freezeAllowed: definition.freezeAllowed,
          maxFreezeDays: definition.maxFreezeDays,
          rules: { cancellationNoticeHours: 12 },
          active: true,
        },
        create: {
          id,
          nameAr: definition.nameAr,
          descriptionAr: definition.descriptionAr,
          price: definition.price,
          validityDays: definition.validityDays,
          visitCount: definition.visitCount,
          allowedVehicleCount: definition.allowedVehicleCount,
          freezeAllowed: definition.freezeAllowed,
          maxFreezeDays: definition.maxFreezeDays,
          rules: { cancellationNoticeHours: 12 },
          active: true,
        },
      }),
    );
    plans.set(definition.key, plan);
    await prisma.subscriptionPlanBranch.upsert({
      where: { planId_branchId: { planId: plan.id, branchId: branch.id } },
      update: {},
      create: {
        id: 'seed-plan-branch-' + definition.key,
        planId: plan.id,
        branchId: branch.id,
      },
    });
    for (const serviceKey of definition.serviceKeys) {
      const service = mapValue(services, serviceKey);
      await prisma.subscriptionPlanService.upsert({
        where: { planId_serviceId: { planId: plan.id, serviceId: service.id } },
        update: {},
        create: {
          id: 'seed-plan-service-' + definition.key + '-' + serviceKey,
          planId: plan.id,
          serviceId: service.id,
        },
      });
    }
  }

  const customerDefinitions = [
    {
      key: 'customer-1',
      notes: 'عميل دائم يفضل المواعيد الصباحية.',
      vehicle: {
        make: 'Mercedes-Benz',
        model: 'E200',
        year: 2024,
        color: 'أسود ملكي',
        vehicleSize: VehicleSize.SEDAN,
        plateNumber: 'أ ب ج 1234',
      },
      address: {
        compound: 'Allegria',
        district: 'سوديك',
        street: 'شارع الجولف الرئيسي',
        buildingNumber: 'فيلا 42',
        gateInstructions: 'بوابة 2',
      },
    },
    {
      key: 'customer-2',
      notes: 'تفضّل التواصل عبر واتساب.',
      vehicle: {
        make: 'BMW',
        model: 'X3',
        year: 2023,
        color: 'أبيض',
        vehicleSize: VehicleSize.CROSSOVER,
        plateNumber: 'س ر ة 5678',
      },
      address: {
        compound: 'Beverly Hills',
        district: 'الثورة الخضراء',
        street: 'شارع النادي',
        buildingNumber: 'تاون هاوس 12',
        gateInstructions: 'البوابة الرئيسية',
      },
    },
    {
      key: 'customer-3',
      notes: 'عميل تجريبي لخدمات السيارات الكبيرة.',
      vehicle: {
        make: 'Toyota',
        model: 'Land Cruiser',
        year: 2022,
        color: 'فضي',
        vehicleSize: VehicleSize.LARGE_SUV,
        plateNumber: 'م ع ل 9012',
      },
      address: {
        compound: 'Al Rabwa',
        district: 'الربوة',
        street: 'شارع البحيرة',
        buildingNumber: 'فيلا 7',
        gateInstructions: 'الاتصال قبل الوصول',
      },
    },
  ];

  const customerProfiles = new Map<string, { id: string }>();
  const vehicles = new Map<string, {
    id: string;
    make: string;
    model: string;
    year: number;
    color: string;
    vehicleSize: VehicleSize;
    plateNumber: string | null;
  }>();
  const addresses = new Map<string, {
    id: string;
    compound: string;
    district: string;
    street: string;
    buildingNumber: string;
    gateInstructions: string | null;
  }>();

  for (const definition of customerDefinitions) {
    const user = mapValue(users, definition.key);
    const profile = await prisma.customerProfile.upsert({
      where: { userId: user.id },
      update: { notes: definition.notes },
      create: {
        id: 'seed-profile-' + definition.key,
        userId: user.id,
        notes: definition.notes,
      },
    });
    customerProfiles.set(definition.key, profile);

    const vehicle = await stableUpsert(
      'seed-vehicle-' + definition.key,
      () => prisma.vehicle.findFirst({
        where: { customerId: profile.id, plateNumber: definition.vehicle.plateNumber },
        select: { id: true },
      }),
      (id) => prisma.vehicle.upsert({
        where: { id },
        update: {
          make: definition.vehicle.make,
          model: definition.vehicle.model,
          year: definition.vehicle.year,
          color: definition.vehicle.color,
          vehicleSize: definition.vehicle.vehicleSize,
          plateNumber: definition.vehicle.plateNumber,
          isDefault: true,
        },
        create: {
          id,
          customerId: profile.id,
          make: definition.vehicle.make,
          model: definition.vehicle.model,
          year: definition.vehicle.year,
          color: definition.vehicle.color,
          vehicleSize: definition.vehicle.vehicleSize,
          plateNumber: definition.vehicle.plateNumber,
          isDefault: true,
        },
      }),
    );
    vehicles.set(definition.key, vehicle);

    const address = await stableUpsert(
      'seed-address-' + definition.key,
      () => prisma.customerAddress.findFirst({
        where: {
          customerId: profile.id,
          compound: definition.address.compound,
          buildingNumber: definition.address.buildingNumber,
        },
        select: { id: true },
      }),
      (id) => prisma.customerAddress.upsert({
        where: { id },
        update: {
          governorate: 'الجيزة',
          city: 'الشيخ زايد',
          district: definition.address.district,
          compound: definition.address.compound,
          street: definition.address.street,
          buildingNumber: definition.address.buildingNumber,
          gateInstructions: definition.address.gateInstructions,
          isDefault: true,
        },
        create: {
          id,
          customerId: profile.id,
          governorate: 'الجيزة',
          city: 'الشيخ زايد',
          district: definition.address.district,
          compound: definition.address.compound,
          street: definition.address.street,
          buildingNumber: definition.address.buildingNumber,
          gateInstructions: definition.address.gateInstructions,
          isDefault: true,
        },
      }),
    );
    addresses.set(definition.key, address);

    await stableUpsert(
      'seed-consent-' + definition.key,
      () => prisma.customerConsent.findFirst({
        where: {
          userId: user.id,
          consentType: 'BOOKING_TERMS',
          version: POLICY_VERSION,
        },
        select: { id: true },
      }),
      (id) => prisma.customerConsent.upsert({
        where: { id },
        update: { accepted: true, acceptedAt: SEEDED_AT, revokedAt: null },
        create: {
          id,
          userId: user.id,
          consentType: 'BOOKING_TERMS',
          version: POLICY_VERSION,
          accepted: true,
          acceptedAt: SEEDED_AT,
        },
      }),
    );
  }

  const monthlyPlan = mapValue(plans, 'monthly');
  const firstCustomer = mapValue(customerProfiles, 'customer-1');
  const firstVehicle = mapValue(vehicles, 'customer-1');
  const subscription = await stableUpsert(
    'seed-subscription-customer-1-monthly',
    () => prisma.customerSubscription.findFirst({
      where: {
        customerId: firstCustomer.id,
        planId: monthlyPlan.id,
        branchId: branch.id,
      },
      select: { id: true },
    }),
    (id) => prisma.customerSubscription.upsert({
      where: { id },
      update: {
        purchasePrice: monthlyPlan.price,
        startDate: SEEDED_AT,
        endDate: new Date('2026-08-31T00:00:00.000Z'),
        totalVisits: monthlyPlan.visitCount,
        usedVisits: 0,
        remainingVisits: monthlyPlan.visitCount,
        status: SubscriptionStatus.ACTIVE,
        frozenAt: null,
        frozenUntil: null,
        cancelledAt: null,
        cancellationReason: null,
      },
      create: {
        id,
        customerId: firstCustomer.id,
        planId: monthlyPlan.id,
        branchId: branch.id,
        purchasePrice: monthlyPlan.price,
        startDate: SEEDED_AT,
        endDate: new Date('2026-08-31T00:00:00.000Z'),
        totalVisits: monthlyPlan.visitCount,
        usedVisits: 0,
        remainingVisits: monthlyPlan.visitCount,
        status: SubscriptionStatus.ACTIVE,
      },
    }),
  );
  await prisma.subscriptionVehicle.upsert({
    where: {
      subscriptionId_vehicleId: {
        subscriptionId: subscription.id,
        vehicleId: firstVehicle.id,
      },
    },
    update: {},
    create: {
      id: 'seed-subscription-vehicle-customer-1',
      subscriptionId: subscription.id,
      vehicleId: firstVehicle.id,
    },
  });
  await prisma.subscriptionVisitLedger.upsert({
    where: { idempotencyKey: 'seed-subscription-purchase-customer-1-monthly' },
    update: {
      subscriptionId: subscription.id,
      action: VisitLedgerAction.PURCHASE,
      visitChange: monthlyPlan.visitCount,
      balanceBefore: 0,
      remainingAfter: monthlyPlan.visitCount,
      reason: 'اشتراك تجريبي أنشأه seed التطوير.',
      adjustedByUserId: opsManager.id,
    },
    create: {
      id: 'seed-ledger-subscription-purchase',
      subscriptionId: subscription.id,
      action: VisitLedgerAction.PURCHASE,
      visitChange: monthlyPlan.visitCount,
      balanceBefore: 0,
      remainingAfter: monthlyPlan.visitCount,
      idempotencyKey: 'seed-subscription-purchase-customer-1-monthly',
      reason: 'اشتراك تجريبي أنشأه seed التطوير.',
      adjustedByUserId: opsManager.id,
    },
  });

  const demoBookingDefinitions = [
    {
      key: 'assigned',
      bookingNumber: 'BQ-2026-1001',
      customerKey: 'customer-1',
      serviceKey: 'complete',
      teamKey: 'alpha',
      bookingStatus: BookingStatus.ASSIGNED,
      paymentStatus: PaymentStatus.VERIFIED,
      startAt: new Date('2026-08-03T06:00:00.000Z'),
    },
    {
      key: 'payment-review',
      bookingNumber: 'BQ-2026-1002',
      customerKey: 'customer-2',
      serviceKey: 'essential',
      teamKey: null,
      bookingStatus: BookingStatus.PAYMENT_UNDER_REVIEW,
      paymentStatus: PaymentStatus.PROOF_UPLOADED,
      startAt: new Date('2026-08-04T06:00:00.000Z'),
    },
    {
      key: 'awaiting-assignment',
      bookingNumber: 'BQ-2026-1003',
      customerKey: 'customer-3',
      serviceKey: 'interior',
      teamKey: null,
      bookingStatus: BookingStatus.AWAITING_ASSIGNMENT,
      paymentStatus: PaymentStatus.VERIFIED,
      startAt: new Date('2026-08-05T06:00:00.000Z'),
    },
    {
      key: 'in-service',
      bookingNumber: 'BQ-2026-1004',
      customerKey: 'customer-2',
      serviceKey: 'upholstery',
      teamKey: 'beta',
      bookingStatus: BookingStatus.IN_SERVICE,
      paymentStatus: PaymentStatus.VERIFIED,
      startAt: new Date('2026-08-06T06:00:00.000Z'),
    },
    {
      key: 'quality-review',
      bookingNumber: 'BQ-2026-1005',
      customerKey: 'customer-3',
      serviceKey: 'vip',
      teamKey: 'alpha',
      bookingStatus: BookingStatus.QUALITY_REVIEW,
      paymentStatus: PaymentStatus.VERIFIED,
      startAt: new Date('2026-08-08T06:00:00.000Z'),
    },
    {
      key: 'closed',
      bookingNumber: 'BQ-2026-1006',
      customerKey: 'customer-1',
      serviceKey: 'engine',
      teamKey: 'beta',
      bookingStatus: BookingStatus.CLOSED,
      paymentStatus: PaymentStatus.FULLY_PAID,
      startAt: new Date('2026-07-30T06:00:00.000Z'),
    },
  ];
  const paymentMethod = mapValue(paymentMethods, 'vodafone');
  const teamExecutionTargets = new Set<BookingStatus>([
    BookingStatus.TEAM_ACKNOWLEDGED,
    BookingStatus.ON_THE_WAY,
    BookingStatus.ARRIVED,
    BookingStatus.IN_SERVICE,
    BookingStatus.QUALITY_REVIEW,
  ]);
  const happyPathToAccepted: BookingStatus[] = [
    BookingStatus.REQUEST_SUBMITTED,
    BookingStatus.AWAITING_PAYMENT_PROOF,
    BookingStatus.PAYMENT_UNDER_REVIEW,
    BookingStatus.PAYMENT_VERIFIED,
    BookingStatus.AWAITING_OPERATIONS_REVIEW,
    BookingStatus.ACCEPTED,
  ];

  for (const definition of demoBookingDefinitions) {
    const profile = mapValue(customerProfiles, definition.customerKey);
    const customerUser = mapValue(users, definition.customerKey);
    const vehicle = mapValue(vehicles, definition.customerKey);
    const address = mapValue(addresses, definition.customerKey);
    const area = mapValue(coverageAreas, address.compound);
    const service = mapValue(services, definition.serviceKey);
    const team = definition.teamKey ? mapValue(teams, definition.teamKey) : null;
    const variant = await prisma.serviceVariant.findUniqueOrThrow({
      where: {
        serviceId_vehicleSize: {
          serviceId: service.id,
          vehicleSize: vehicle.vehicleSize,
        },
      },
    });
    const materialRequirements = await prisma.serviceMaterialRequirement.findMany({
      where: { serviceId: service.id },
      orderBy: [{ required: 'desc' }, { material: { nameAr: 'asc' } }],
      select: {
        materialId: true,
        quantity: true,
        required: true,
        notes: true,
        material: { select: { nameAr: true, unit: true } },
      },
    });
    const totalPrice = variant.price;
    const depositAmount = Math.ceil(totalPrice * service.depositValue / 100);
    const fullyPaid = definition.bookingStatus === BookingStatus.CLOSED;
    const underReview = definition.bookingStatus === BookingStatus.PAYMENT_UNDER_REVIEW;
    const amountPaid = underReview ? 0 : fullyPaid ? totalPrice : depositAmount;
    const amountDue = Math.max(0, totalPrice - amountPaid);
    const endAt = new Date(definition.startAt.getTime() + variant.durationMinutes * 60_000);
    const addressSnapshot = {
      governorate: 'الجيزة',
      city: 'الشيخ زايد',
      district: address.district,
      compound: address.compound,
      street: address.street,
      buildingNumber: address.buildingNumber,
      gateInstructions: address.gateInstructions,
    };
    const vehicleSnapshot = {
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      color: vehicle.color,
      vehicleSize: vehicle.vehicleSize,
      plateNumber: vehicle.plateNumber,
    };
    const serviceSnapshot = {
      id: service.id,
      nameAr: service.nameAr,
      slug: service.slug,
      vehicleSize: vehicle.vehicleSize,
      price: variant.price,
      durationMinutes: variant.durationMinutes,
      materials: materialRequirements.map((requirement) => ({
        id: requirement.materialId,
        nameAr: requirement.material.nameAr,
        unit: requirement.material.unit,
        quantity: requirement.quantity,
        required: requirement.required,
        notes: requirement.notes,
      })),
    };
    const contactSnapshot = {
      fullName: customerUser.fullName,
      phone: customerUser.phone,
    };
    const bookingData = {
      customerId: profile.id,
      branchId: branch.id,
      coverageAreaId: area.id,
      vehicleId: vehicle.id,
      serviceId: service.id,
      serviceVariantId: variant.id,
      subscriptionId: null,
      startAt: definition.startAt,
      endAt,
      totalDurationMinutes: variant.durationMinutes,
      basePrice: variant.price,
      addonPrice: 0,
      totalPrice,
      depositAmount,
      amountPaid,
      amountDue,
      paymentStatus: definition.paymentStatus,
      bookingStatus: definition.bookingStatus,
      assignmentMode: AssignmentMode.AUTOMATIC,
      assignedTeamId: team?.id ?? null,
      customerNotes: 'حجز تجريبي لحالة تشغيل حقيقية.',
      gateInstructions: address.gateInstructions,
      locationUrl: null,
      addressSnapshot,
      vehicleSnapshot,
      serviceSnapshot,
      contactSnapshot,
      policyVersion: POLICY_VERSION,
      policyAcceptedAt: SEEDED_AT,
      cancellationPolicyId: cancellationPolicy.id,
      cancellationPolicySnapshot,
      deletedAt: null,
      deletedByUserId: null,
      deleteReason: null,
    };
    const booking = await prisma.booking.upsert({
      where: { bookingNumber: definition.bookingNumber },
      update: bookingData,
      create: {
        id: 'seed-booking-' + definition.key,
        bookingNumber: definition.bookingNumber,
        ...bookingData,
      },
    });

    await stableUpsert(
      'seed-booking-item-' + definition.key,
      () => prisma.bookingItem.findFirst({
        where: { bookingId: booking.id, itemType: 'SERVICE', sourceId: service.id },
        select: { id: true },
      }),
      (id) => prisma.bookingItem.upsert({
        where: { id },
        update: {
          nameSnapshot: service.nameAr,
          quantity: 1,
          unitPrice: variant.price,
          durationMinutes: variant.durationMinutes,
          metadata: { vehicleSize: vehicle.vehicleSize },
        },
        create: {
          id,
          bookingId: booking.id,
          itemType: 'SERVICE',
          sourceId: service.id,
          nameSnapshot: service.nameAr,
          quantity: 1,
          unitPrice: variant.price,
          durationMinutes: variant.durationMinutes,
          metadata: { vehicleSize: vehicle.vehicleSize },
        },
      }),
    );

    if (team) {
      await stableUpsert(
        'seed-booking-assignment-' + definition.key,
        () => prisma.bookingAssignment.findFirst({
          where: { bookingId: booking.id, status: 'ACTIVE' },
          select: { id: true },
        }),
        (id) => prisma.bookingAssignment.upsert({
          where: { id },
          update: {
            teamId: team.id,
            assignedByUserId: opsManager.id,
            assignedAt: SEEDED_AT,
            endedAt: null,
            reason: 'إسناد تجريبي ثابت من seed التطوير.',
            status: 'ACTIVE',
            scoreLog: { score: 95, source: 'seed' },
          },
          create: {
            id,
            bookingId: booking.id,
            teamId: team.id,
            assignedByUserId: opsManager.id,
            assignedAt: SEEDED_AT,
            reason: 'إسناد تجريبي ثابت من seed التطوير.',
            status: 'ACTIVE',
            scoreLog: { score: 95, source: 'seed' },
          },
        }),
      );
      await stableUpsert(
        'seed-booking-assignment-history-' + definition.key,
        () => prisma.bookingAssignmentHistory.findFirst({
          where: { bookingId: booking.id, toTeamId: team.id, action: 'AUTO_ASSIGNED' },
          select: { id: true },
        }),
        (id) => prisma.bookingAssignmentHistory.upsert({
          where: { id },
          update: {
            fromTeamId: null,
            toTeamId: team.id,
            changedByUserId: opsManager.id,
            action: 'AUTO_ASSIGNED',
            reason: 'إسناد تجريبي ثابت من seed التطوير.',
            scoreLog: { score: 95, source: 'seed' },
          },
          create: {
            id,
            bookingId: booking.id,
            fromTeamId: null,
            toTeamId: team.id,
            changedByUserId: opsManager.id,
            action: 'AUTO_ASSIGNED',
            reason: 'إسناد تجريبي ثابت من seed التطوير.',
            scoreLog: { score: 95, source: 'seed' },
            createdAt: SEEDED_AT,
          },
        }),
      );
    }

    let workflow: BookingStatus[];
    if (underReview) {
      workflow = [
        BookingStatus.REQUEST_SUBMITTED,
        BookingStatus.AWAITING_PAYMENT_PROOF,
        BookingStatus.PAYMENT_UNDER_REVIEW,
      ];
    } else if (definition.bookingStatus === BookingStatus.AWAITING_ASSIGNMENT) {
      workflow = [...happyPathToAccepted, BookingStatus.AWAITING_ASSIGNMENT];
    } else if (definition.bookingStatus === BookingStatus.ASSIGNED) {
      workflow = [...happyPathToAccepted, BookingStatus.ASSIGNED];
    } else {
      workflow = [
        ...happyPathToAccepted,
        BookingStatus.ASSIGNED,
        BookingStatus.TEAM_ACKNOWLEDGED,
        BookingStatus.ON_THE_WAY,
        BookingStatus.ARRIVED,
        BookingStatus.IN_SERVICE,
      ];
      if (definition.bookingStatus !== BookingStatus.IN_SERVICE) {
        workflow.push(BookingStatus.QUALITY_REVIEW);
      }
      if (definition.bookingStatus === BookingStatus.CLOSED) {
        workflow.push(
          BookingStatus.SERVICE_COMPLETED,
          BookingStatus.DELIVERED,
          BookingStatus.CLOSED,
        );
      }
    }

    for (let index = 1; index < workflow.length; index += 1) {
      const fromStatus = workflow[index - 1];
      const toStatus = workflow[index];
      const employeeActor = Boolean(team && teamExecutionTargets.has(toStatus));
      const actor = employeeActor
        ? mapValue(users, definition.teamKey === 'beta' ? 'employee-3' : 'employee-1')
        : opsManager;
      const actorRole = employeeActor ? UserRole.EMPLOYEE : UserRole.OPERATIONS_MANAGER;
      await stableUpsert(
        'seed-status-history-' + definition.key + '-' + index,
        () => prisma.bookingStatusHistory.findFirst({
          where: { bookingId: booking.id, fromStatus, toStatus },
          select: { id: true },
        }),
        (id) => prisma.bookingStatusHistory.upsert({
          where: { id },
          update: {
            changedByUserId: actor.id,
            actorRole,
            reason: 'مسار تشغيلي تجريبي من seed التطوير.',
            metadata: { seed: true, sequence: index },
          },
          create: {
            id,
            bookingId: booking.id,
            fromStatus,
            toStatus,
            changedByUserId: actor.id,
            actorRole,
            reason: 'مسار تشغيلي تجريبي من seed التطوير.',
            metadata: { seed: true, sequence: index },
            createdAt: new Date(SEEDED_AT.getTime() + index * 60_000),
          },
        }),
      );
    }

    const seededProofFile = await ensureSeedPrivateSvg(
      'seed-payment-proofs',
      definition.key + '.svg',
      'Payment proof · ' + definition.bookingNumber,
    );
    const proofBookingFile = await prisma.bookingFile.upsert({
      where: { fileUrl: seededProofFile.fileUrl },
      update: {
        bookingId: booking.id,
        fileType: FileType.PAYMENT_PROOF,
        mimeType: 'image/svg+xml',
        sizeBytes: seededProofFile.sizeBytes,
        uploadedByUserId: customerUser.id,
      },
      create: {
        id: 'seed-booking-file-' + definition.key + '-payment-proof',
        bookingId: booking.id,
        fileType: FileType.PAYMENT_PROOF,
        fileUrl: seededProofFile.fileUrl,
        mimeType: 'image/svg+xml',
        sizeBytes: seededProofFile.sizeBytes,
        uploadedByUserId: customerUser.id,
      },
    });

    const proofStatus = underReview ? ProofStatus.UNDER_REVIEW : ProofStatus.VERIFIED;
    const proof = await prisma.paymentProof.upsert({
      where: { idempotencyKey: 'seed-payment-proof-' + definition.key },
      update: {
        bookingId: booking.id,
        paymentMethodId: paymentMethod.id,
        senderName: customerUser.fullName,
        senderPhoneOrAccount: customerUser.phone,
        referenceNumber: 'SEED-' + definition.bookingNumber,
        amountSubmitted: underReview ? depositAmount : amountPaid,
        transferTimestamp: SEEDED_AT,
        proofFileUrl: seededProofFile.fileUrl,
        proofFileId: proofBookingFile.id,
        status: proofStatus,
        reviewedByUserId: underReview ? null : opsManager.id,
        reviewNotes: underReview ? null : 'إثبات دفع تجريبي معتمد.',
        reviewedAt: underReview ? null : SEEDED_AT,
      },
      create: {
        id: 'seed-payment-proof-' + definition.key,
        bookingId: booking.id,
        paymentMethodId: paymentMethod.id,
        senderName: customerUser.fullName,
        senderPhoneOrAccount: customerUser.phone,
        referenceNumber: 'SEED-' + definition.bookingNumber,
        amountSubmitted: underReview ? depositAmount : amountPaid,
        transferTimestamp: SEEDED_AT,
        proofFileUrl: seededProofFile.fileUrl,
        proofFileId: proofBookingFile.id,
        status: proofStatus,
        reviewedByUserId: underReview ? null : opsManager.id,
        reviewNotes: underReview ? null : 'إثبات دفع تجريبي معتمد.',
        reviewedAt: underReview ? null : SEEDED_AT,
        idempotencyKey: 'seed-payment-proof-' + definition.key,
      },
    });

    if (!underReview) {
      await stableUpsert(
        'seed-payment-review-' + definition.key,
        () => prisma.paymentReview.findFirst({
          where: { proofId: proof.id, decision: ProofStatus.VERIFIED },
          select: { id: true },
        }),
        (id) => prisma.paymentReview.upsert({
          where: { id },
          update: {
            bookingId: booking.id,
            reviewedByUserId: opsManager.id,
            decision: ProofStatus.VERIFIED,
            amountExpected: amountPaid,
            amountSubmitted: amountPaid,
            notes: 'مراجعة دفع تجريبية.',
            previousStatus: ProofStatus.UNDER_REVIEW,
          },
          create: {
            id,
            proofId: proof.id,
            bookingId: booking.id,
            reviewedByUserId: opsManager.id,
            decision: ProofStatus.VERIFIED,
            amountExpected: amountPaid,
            amountSubmitted: amountPaid,
            notes: 'مراجعة دفع تجريبية.',
            previousStatus: ProofStatus.UNDER_REVIEW,
            createdAt: SEEDED_AT,
          },
        }),
      );
      await prisma.payment.upsert({
        where: { idempotencyKey: 'seed-payment-' + definition.key },
        update: {
          bookingId: booking.id,
          proofId: proof.id,
          amount: amountPaid,
          paymentMethod: paymentMethod.name,
          referenceNumber: 'SEED-' + definition.bookingNumber,
          recordedByUserId: opsManager.id,
          notes: 'دفعة تجريبية ثابتة من seed التطوير.',
        },
        create: {
          id: 'seed-payment-' + definition.key,
          bookingId: booking.id,
          proofId: proof.id,
          idempotencyKey: 'seed-payment-' + definition.key,
          amount: amountPaid,
          paymentMethod: paymentMethod.name,
          referenceNumber: 'SEED-' + definition.bookingNumber,
          recordedByUserId: opsManager.id,
          notes: 'دفعة تجريبية ثابتة من seed التطوير.',
          createdAt: SEEDED_AT,
        },
      });
    }

    let completedStages: ChecklistStage[] = [];
    if (definition.bookingStatus === BookingStatus.IN_SERVICE) {
      completedStages = [ChecklistStage.TEAM_PREPARATION, ChecklistStage.ARRIVAL_INSPECTION];
    } else if (
      definition.bookingStatus === BookingStatus.QUALITY_REVIEW ||
      definition.bookingStatus === BookingStatus.CLOSED
    ) {
      completedStages = [
        ChecklistStage.TEAM_PREPARATION,
        ChecklistStage.ARRIVAL_INSPECTION,
        ChecklistStage.SERVICE_EXECUTION,
        ChecklistStage.CLOSING,
      ];
    }

    if (completedStages.length && team) {
      const teamLeader = mapValue(users, definition.teamKey === 'beta' ? 'employee-3' : 'employee-1');
      for (const stage of completedStages) {
        const template = mapValue(checklistTemplates, checklistKey(service.id, stage));
        const instance = await stableUpsert(
          'seed-checklist-instance-' + definition.key + '-' + stage.toLowerCase(),
          () => prisma.bookingChecklistInstance.findFirst({
            where: { bookingId: booking.id, stage },
            select: { id: true },
          }),
          (id) => prisma.bookingChecklistInstance.upsert({
            where: { id },
            update: { completedAt: SEEDED_AT, completedByUserId: teamLeader.id },
            create: {
              id,
              bookingId: booking.id,
              stage,
              completedAt: SEEDED_AT,
              completedByUserId: teamLeader.id,
            },
          }),
        );
        for (const [index, item] of (checklistItems.get(template.id) ?? []).entries()) {
          let photoUrl: string | null = null;
          if (item.requiresPhoto) {
            const checklistFileName = definition.key + '-' + stage.toLowerCase() + '-' + (index + 1) + '.svg';
            const seededChecklistFile = await ensureSeedPrivateSvg(
              'seed-checklists',
              checklistFileName,
              'Checklist evidence · ' + definition.bookingNumber,
            );
            const checklistFileType =
              stage === ChecklistStage.CLOSING || stage === ChecklistStage.QUALITY_REVIEW
                ? FileType.AFTER_SERVICE
                : FileType.BEFORE_SERVICE;
            await prisma.bookingFile.upsert({
              where: { fileUrl: seededChecklistFile.fileUrl },
              update: {
                bookingId: booking.id,
                fileType: checklistFileType,
                mimeType: 'image/svg+xml',
                sizeBytes: seededChecklistFile.sizeBytes,
                uploadedByUserId: teamLeader.id,
              },
              create: {
                id: 'seed-booking-file-checklist-' + definition.key + '-' + stage.toLowerCase() + '-' + (index + 1),
                bookingId: booking.id,
                fileType: checklistFileType,
                fileUrl: seededChecklistFile.fileUrl,
                mimeType: 'image/svg+xml',
                sizeBytes: seededChecklistFile.sizeBytes,
                uploadedByUserId: teamLeader.id,
              },
            });
            photoUrl = seededChecklistFile.fileUrl;
          }
          await stableUpsert(
            'seed-checklist-result-' + definition.key + '-' + stage.toLowerCase() + '-' + (index + 1),
            () => prisma.bookingChecklistItemResult.findFirst({
              where: { instanceId: instance.id, itemId: item.id },
              select: { id: true },
            }),
            (id) => prisma.bookingChecklistItemResult.upsert({
              where: { id },
              update: {
                itemLabel: item.labelAr,
                isChecked: true,
                photoUrl,
                note: 'تم التحقق في بيانات العرض.',
                checkedByUserId: teamLeader.id,
                checkedAt: SEEDED_AT,
              },
              create: {
                id,
                instanceId: instance.id,
                itemId: item.id,
                itemLabel: item.labelAr,
                isChecked: true,
                photoUrl,
                note: 'تم التحقق في بيانات العرض.',
                checkedByUserId: teamLeader.id,
                checkedAt: SEEDED_AT,
              },
            }),
          );
        }
      }

      for (let index = 1; index <= service.minimumBeforePhotos; index += 1) {
        const seededBeforeFile = await ensureSeedPrivateSvg(
          'seed-before',
          definition.key + '-' + index + '.svg',
          'Before service · ' + definition.bookingNumber,
        );
        await prisma.bookingFile.upsert({
          where: { id: 'seed-booking-file-' + definition.key + '-before-' + index },
          update: {
            bookingId: booking.id,
            fileType: FileType.BEFORE_SERVICE,
            fileUrl: seededBeforeFile.fileUrl,
            mimeType: 'image/svg+xml',
            sizeBytes: seededBeforeFile.sizeBytes,
            uploadedByUserId: teamLeader.id,
          },
          create: {
            id: 'seed-booking-file-' + definition.key + '-before-' + index,
            bookingId: booking.id,
            fileType: FileType.BEFORE_SERVICE,
            fileUrl: seededBeforeFile.fileUrl,
            mimeType: 'image/svg+xml',
            sizeBytes: seededBeforeFile.sizeBytes,
            uploadedByUserId: teamLeader.id,
          },
        });
      }

      if (definition.bookingStatus !== BookingStatus.IN_SERVICE) {
        for (let index = 1; index <= service.minimumAfterPhotos; index += 1) {
          const seededAfterFile = await ensureSeedPrivateSvg(
            'seed-after',
            definition.key + '-' + index + '.svg',
            'After service · ' + definition.bookingNumber,
          );
          await prisma.bookingFile.upsert({
            where: { id: 'seed-booking-file-' + definition.key + '-after-' + index },
            update: {
              bookingId: booking.id,
              fileType: FileType.AFTER_SERVICE,
              fileUrl: seededAfterFile.fileUrl,
              mimeType: 'image/svg+xml',
              sizeBytes: seededAfterFile.sizeBytes,
              uploadedByUserId: teamLeader.id,
            },
            create: {
              id: 'seed-booking-file-' + definition.key + '-after-' + index,
              bookingId: booking.id,
              fileType: FileType.AFTER_SERVICE,
              fileUrl: seededAfterFile.fileUrl,
              mimeType: 'image/svg+xml',
              sizeBytes: seededAfterFile.sizeBytes,
              uploadedByUserId: teamLeader.id,
            },
          });
        }
      }
    }

    if (definition.bookingStatus === BookingStatus.CLOSED) {
      await prisma.qualityReview.upsert({
        where: { bookingId: booking.id },
        update: {
          reviewedByUserId: opsManager.id,
          approved: true,
          score: 5,
          notes: 'مراجعة جودة تجريبية معتمدة.',
          returnedToTeam: false,
        },
        create: {
          id: 'seed-quality-review-closed',
          bookingId: booking.id,
          reviewedByUserId: opsManager.id,
          approved: true,
          score: 5,
          notes: 'مراجعة جودة تجريبية معتمدة.',
          returnedToTeam: false,
          createdAt: SEEDED_AT,
        },
      });
    }
  }

  const seededPhones = userDefinitions.map((definition) => definition.phone);
  const seededUsers = await prisma.user.findMany({
    where: { phone: { in: seededPhones } },
    select: { role: true, mustChangePwd: true },
  });
  const expectedRoleCounts = new Map<UserRole, number>([
    [UserRole.SYSTEM_SUPER_ADMIN, 1],
    [UserRole.OWNER, 1],
    [UserRole.OPERATIONS_MANAGER, 1],
    [UserRole.EMPLOYEE, 4],
    [UserRole.CUSTOMER, 3],
  ]);
  for (const [role, expected] of expectedRoleCounts) {
    const actual = seededUsers.filter((user) => user.role === role).length;
    if (actual !== expected) {
      throw new Error('Seed validation failed for ' + role + ': expected ' + expected + ', got ' + actual + '.');
    }
  }
  if (seededUsers.some((user) => !user.mustChangePwd)) {
    throw new Error('Seed validation failed: every demo user must change their password.');
  }

  const [serviceCount, servicePolicyCount, zoneCount, areaCount, teamCount, planCount, bookingCount] = await Promise.all([
    prisma.service.count({ where: { slug: { in: serviceDefinitions.map((service) => service.slug) } } }),
    prisma.service.count({
      where: {
        slug: { in: serviceDefinitions.map((service) => service.slug) },
        cancellationPolicyId: cancellationPolicy.id,
      },
    }),
    prisma.coverageZone.count({
      where: { branchId: branch.id, name: { in: zoneDefinitions.map((zone) => zone.name) } },
    }),
    prisma.coverageArea.count({
      where: { id: { in: [...coverageAreas.values()].map((area) => area.id) } },
    }),
    prisma.team.count({
      where: { branchId: branch.id, name: { in: teamDefinitions.map((team) => team.name) } },
    }),
    prisma.subscriptionPlan.count({
      where: { nameAr: { in: planDefinitions.map((plan) => plan.nameAr) } },
    }),
    prisma.booking.count({
      where: { bookingNumber: { in: demoBookingDefinitions.map((booking) => booking.bookingNumber) } },
    }),
  ]);
  const shape = { serviceCount, servicePolicyCount, zoneCount, areaCount, teamCount, planCount, bookingCount };
  const expectedShape = {
    serviceCount: 7,
    servicePolicyCount: 7,
    zoneCount: 3,
    areaCount: 14,
    teamCount: 2,
    planCount: 2,
    bookingCount: 6,
  };
  for (const key of Object.keys(expectedShape) as Array<keyof typeof expectedShape>) {
    if (shape[key] !== expectedShape[key]) {
      throw new Error(
        'Seed validation failed for ' + key + ': expected ' + expectedShape[key] + ', got ' + shape[key] + '.',
      );
    }
  }

  console.log('Bareeq development seed completed successfully.');
  console.log('Seeded users: 10; branch: 1; teams: 2; services: 7; plans: 2; demo bookings: 6.');
  console.log('Demo passwords were supplied through environment variables and were not printed.');
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown seed failure';
    console.error('Bareeq seed failed: ' + message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
