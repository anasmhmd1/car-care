'use server';

import { db } from '@/lib/db';
import { createSession, destroySession, requireAuth, requireRole } from '@/lib/auth/session';
import { revokeAllUserSessionsAndBumpVersion } from '@/lib/auth/session-store';
import { logAudit } from '@/lib/audit';
import { vehicleSchema, addressSchema, profileUpdateSchema } from '@/lib/validations/admin';
import { changePasswordSchema } from '@/lib/validations/auth';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { Prisma, UserRole, VehicleSize } from '@prisma/client';
import { headers } from 'next/headers';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getClientIP, logSecurityEvent } from '@/lib/security/security-events';
import { phoneLookupCandidates, phoneSchema } from '@/lib/validations/phone';

// --------------------------------------------------------
// Vehicle CRUD
// --------------------------------------------------------

export async function addVehicleAction(formData: FormData) {
  const user = await requireRole([UserRole.CUSTOMER]);

  const raw = {
    make: (formData.get('make') as string || '').trim(),
    model: (formData.get('model') as string || '').trim(),
    year: formData.get('year') as string || '2024',
    color: (formData.get('color') as string || '').trim(),
    vehicleSize: (formData.get('vehicleSize') as string) || 'SEDAN',
    plateNumber: (formData.get('plateNumber') as string || '').trim(),
    notes: (formData.get('notes') as string || '').trim(),
    isDefault: formData.get('isDefault') === 'on' ? 'true' : 'false',
  };

  const parsed = vehicleSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'بيانات السيارة غير مكتملة' };
  }

  const data = parsed.data;

  const customerProfile = await db.customerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!customerProfile) return { error: 'الملف الشخصي غير موجود' };

  const vehicle = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer-resources:${customerProfile.id}`}))`;
    const isFirstVehicle = await tx.vehicle.count({ where: { customerId: customerProfile.id } }) === 0;
    const isDefault = data.isDefault || isFirstVehicle;
    if (isDefault) {
      await tx.vehicle.updateMany({
        where: { customerId: customerProfile.id },
        data: { isDefault: false },
      });
    }
    return tx.vehicle.create({
      data: {
        customerId: customerProfile.id,
        make: data.make,
        model: data.model,
        year: data.year,
        color: data.color,
        vehicleSize: VehicleSize[data.vehicleSize],
        plateNumber: data.plateNumber || null,
        notes: data.notes || null,
        isDefault,
      },
    });
  });

  revalidatePath('/account/vehicles');
  return { success: true, vehicleId: vehicle.id };
}

export async function updateVehicleAction(formData: FormData) {
  const user = await requireRole([UserRole.CUSTOMER]);
  const vehicleId = formData.get('vehicleId') as string;
  if (!vehicleId) return { error: 'معرف السيارة مطلوب' };

  const raw = {
    make: (formData.get('make') as string || '').trim(),
    model: (formData.get('model') as string || '').trim(),
    year: formData.get('year') as string || '2024',
    color: (formData.get('color') as string || '').trim(),
    vehicleSize: (formData.get('vehicleSize') as string) || 'SEDAN',
    plateNumber: (formData.get('plateNumber') as string || '').trim(),
    notes: (formData.get('notes') as string || '').trim(),
    isDefault: formData.get('isDefault') === 'on' ? 'true' : 'false',
  };

  const parsed = vehicleSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'بيانات السيارة غير صالحة' };
  }

  const data = parsed.data;

  // Verify ownership
  const customerProfile = await db.customerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!customerProfile) return { error: 'الملف الشخصي غير موجود' };

  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, customerId: customerProfile.id },
  });
  if (!vehicle) return { error: 'السيارة غير موجودة في حسابك' };

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer-resources:${customerProfile.id}`}))`;
    if (data.isDefault) {
      await tx.vehicle.updateMany({
        where: { customerId: customerProfile.id, id: { not: vehicleId } },
        data: { isDefault: false },
      });
    }
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: {
        make: data.make,
        model: data.model,
        year: data.year,
        color: data.color,
        vehicleSize: VehicleSize[data.vehicleSize],
        plateNumber: data.plateNumber || null,
        notes: data.notes || null,
        isDefault: data.isDefault || vehicle.isDefault,
      },
    });
  });

  revalidatePath('/account/vehicles');
  return { success: true };
}

export async function deleteVehicleAction(formData: FormData) {
  const user = await requireRole([UserRole.CUSTOMER]);
  const vehicleId = formData.get('vehicleId') as string;

  const customerProfile = await db.customerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!customerProfile) return { error: 'الملف الشخصي غير موجود' };

  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, customerId: customerProfile.id },
  });
  if (!vehicle) return { error: 'السيارة غير موجودة في حسابك' };

  const [bookingCount, subscriptionCount] = await Promise.all([
    db.booking.count({ where: { vehicleId } }),
    db.subscriptionVehicle.count({ where: { vehicleId } }),
  ]);
  if (bookingCount > 0 || subscriptionCount > 0) {
    return { error: 'لا يمكن حذف سيارة مرتبطة بحجز أو اشتراك؛ احتفظ بها كسجل تاريخي.' };
  }

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer-resources:${customerProfile.id}`}))`;
    await tx.vehicle.delete({ where: { id: vehicleId } });
    if (vehicle.isDefault) {
      const replacement = await tx.vehicle.findFirst({
        where: { customerId: customerProfile.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (replacement) await tx.vehicle.update({ where: { id: replacement.id }, data: { isDefault: true } });
    }
  });
  revalidatePath('/account/vehicles');
  return { success: true };
}

// --------------------------------------------------------
// Address CRUD
// --------------------------------------------------------

export async function addAddressAction(formData: FormData) {
  const user = await requireRole([UserRole.CUSTOMER]);

  const raw = {
    governorate: (formData.get('governorate') as string || '').trim(),
    city: (formData.get('city') as string || '').trim(),
    district: (formData.get('district') as string || '').trim(),
    compound: (formData.get('compound') as string || '').trim(),
    street: (formData.get('street') as string || '').trim(),
    buildingNumber: (formData.get('buildingNumber') as string || '').trim(),
    unitNumber: (formData.get('unitNumber') as string || '').trim(),
    landmark: (formData.get('landmark') as string || '').trim(),
    gateInstructions: (formData.get('gateInstructions') as string || '').trim(),
    locationUrl: (formData.get('locationUrl') as string || '').trim(),
    isDefault: formData.get('isDefault') === 'on' ? 'true' : 'false',
  };

  const parsed = addressSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'بيانات العنوان غير مكتملة' };
  }

  const data = parsed.data;

  const customerProfile = await db.customerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!customerProfile) return { error: 'الملف الشخصي غير موجود' };

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer-resources:${customerProfile.id}`}))`;
    const isFirstAddress = await tx.customerAddress.count({ where: { customerId: customerProfile.id } }) === 0;
    const isDefault = data.isDefault || isFirstAddress;
    if (isDefault) {
      await tx.customerAddress.updateMany({
        where: { customerId: customerProfile.id },
        data: { isDefault: false },
      });
    }
    await tx.customerAddress.create({
      data: {
        customerId: customerProfile.id,
        ...data,
        isDefault,
      },
    });
  });

  revalidatePath('/account/addresses');
  return { success: true };
}

export async function updateAddressAction(formData: FormData) {
  const user = await requireRole([UserRole.CUSTOMER]);
  const addressId = formData.get('addressId') as string;
  if (!addressId) return { error: 'معرف العنوان مطلوب' };

  const raw = {
    governorate: (formData.get('governorate') as string || '').trim(),
    city: (formData.get('city') as string || '').trim(),
    district: (formData.get('district') as string || '').trim(),
    compound: (formData.get('compound') as string || '').trim(),
    street: (formData.get('street') as string || '').trim(),
    buildingNumber: (formData.get('buildingNumber') as string || '').trim(),
    unitNumber: (formData.get('unitNumber') as string || '').trim(),
    landmark: (formData.get('landmark') as string || '').trim(),
    gateInstructions: (formData.get('gateInstructions') as string || '').trim(),
    locationUrl: (formData.get('locationUrl') as string || '').trim(),
    isDefault: formData.get('isDefault') === 'on' ? 'true' : 'false',
  };

  const parsed = addressSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'بيانات العنوان غير صالحة' };
  }

  const data = parsed.data;

  const customerProfile = await db.customerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!customerProfile) return { error: 'الملف الشخصي غير موجود' };

  const address = await db.customerAddress.findFirst({
    where: { id: addressId, customerId: customerProfile.id },
  });
  if (!address) return { error: 'العنوان غير موجود في حسابك' };

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer-resources:${customerProfile.id}`}))`;
    if (data.isDefault) {
      await tx.customerAddress.updateMany({
        where: { customerId: customerProfile.id, id: { not: addressId } },
        data: { isDefault: false },
      });
    }
    await tx.customerAddress.update({
      where: { id: addressId },
      data: { ...data, isDefault: data.isDefault || address.isDefault },
    });
  });

  revalidatePath('/account/addresses');
  return { success: true };
}

export async function deleteAddressAction(formData: FormData) {
  const user = await requireRole([UserRole.CUSTOMER]);
  const addressId = formData.get('addressId') as string;

  const customerProfile = await db.customerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!customerProfile) return { error: 'الملف الشخصي غير موجود' };

  const address = await db.customerAddress.findFirst({
    where: { id: addressId, customerId: customerProfile.id },
  });
  if (!address) return { error: 'العنوان غير موجود في حسابك' };

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer-resources:${customerProfile.id}`}))`;
    await tx.customerAddress.delete({ where: { id: addressId } });
    if (address.isDefault) {
      const replacement = await tx.customerAddress.findFirst({
        where: { customerId: customerProfile.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (replacement) await tx.customerAddress.update({ where: { id: replacement.id }, data: { isDefault: true } });
    }
  });
  revalidatePath('/account/addresses');
  return { success: true };
}

// --------------------------------------------------------
// Profile Update & Password Change
// --------------------------------------------------------

export async function updateProfileAction(formData: FormData) {
  const user = await requireAuth();

  const raw = {
    fullName: (formData.get('fullName') as string || '').trim(),
    phone: (formData.get('phone') as string || '').trim(),
    whatsapp: (formData.get('whatsapp') as string || '').trim(),
    email: (formData.get('email') as string || '').trim(),
  };

  const parsed = profileUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'بيانات غير صالحة' };
  }

  const data = parsed.data;

  // Check phone uniqueness if changed
  if (data.phone !== user.phone) {
    const existing = await db.user.findFirst({
      where: {
        id: { not: user.id },
        phone: { in: phoneLookupCandidates(data.phone) },
      },
    });
    if (existing && existing.id !== user.id) {
      return { error: 'رقم الهاتف مستخدم بالفعل من حساب آخر' };
    }
  }

  // Check email uniqueness if changed
  if (data.email && data.email !== user.email) {
    const existing = await db.user.findUnique({ where: { email: data.email } });
    if (existing && existing.id !== user.id) {
      return { error: 'البريد الإلكتروني مستخدم بالفعل من حساب آخر' };
    }
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      fullName: data.fullName,
      phone: data.phone,
      whatsapp: data.whatsapp || data.phone,
      email: data.email || null,
    },
  });

  await logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'UPDATE_PROFILE',
    entityType: 'User',
    entityId: user.id,
  });

  revalidatePath('/account/profile');
  return { success: true };
}

export async function changePasswordAction(formData: FormData) {
  const user = await requireAuth({ allowPasswordChangeRequired: true });

  const raw = {
    currentPassword: (formData.get('currentPassword') as string || '').trim(),
    newPassword: (formData.get('newPassword') as string || '').trim(),
    confirmPassword: (formData.get('confirmPassword') as string || '').trim(),
  };

  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'بيانات غير صالحة' };
  }

  const { currentPassword, newPassword } = parsed.data;

  // Verify current password
  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    return { error: 'كلمة المرور الحالية غير صحيحة' };
  }

  const newHash = await bcrypt.hash(newPassword, 12);

  const updatedUser = await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        mustChangePwd: false,
      },
    });
    await revokeAllUserSessionsAndBumpVersion(tx, user.id, 'PASSWORD_CHANGED');
    return tx.user.findUniqueOrThrow({ where: { id: user.id } });
  });

  // Every pre-change session is now invalid. Replace only this browser's
  // cookie with a session bound to the incremented sessionVersion.
  await destroySession('PASSWORD_CHANGED');
  await createSession(updatedUser);

  await logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'CHANGE_PASSWORD',
    entityType: 'User',
    entityId: user.id,
  });

  revalidatePath('/account/profile');
  return { success: true };
}

/**
 * Customer requests password reset (displayed to admin).
 */
export async function requestPasswordResetAction(formData: FormData) {
  const parsedPhone = phoneSchema.safeParse(formData.get('phone'));
  if (!parsedPhone.success) {
    return { error: parsedPhone.error.issues[0]?.message || 'رقم الهاتف غير صالح' };
  }
  const phone = parsedPhone.data;

  const genericResponse = {
    success: true,
    message: 'إذا كان الرقم مسجلًا، فسيتم إنشاء طلب آمن والتواصل معك من الفريق.',
  } as const;

  const requestHeaders = await headers();
  const clientIP = getClientIP(requestHeaders);
  const userAgent = requestHeaders.get('user-agent')?.slice(0, 1000) ?? null;
  const [phoneRate, ipRate] = await Promise.all([
    checkRateLimit(`phone:${phone}`, 'password-reset'),
    checkRateLimit(`ip:${clientIP}`, 'password-reset'),
  ]);
  if (!phoneRate.allowed || !ipRate.allowed) {
    await logSecurityEvent({
      eventType: 'RATE_LIMIT_EXCEEDED',
      description: 'Password-reset request rate limit exceeded.',
      ipAddress: clientIP,
      metadata: { action: 'password-reset', resetIn: Math.max(phoneRate.resetIn, ipRate.resetIn) },
    });
    return genericResponse;
  }

  const canonicalUser = await db.user.findUnique({ where: { phone } });
  const legacyCandidates = phoneLookupCandidates(phone).filter((candidate) => candidate !== phone);
  const legacyUsers = canonicalUser || legacyCandidates.length === 0
    ? []
    : await db.user.findMany({
      where: { phone: { in: legacyCandidates } },
      take: 2,
    });
  const user = canonicalUser ?? (legacyUsers.length === 1 ? legacyUsers[0] : null);
  if (!user || !user.active || user.deletedAt) {
    await logSecurityEvent({
      eventType: 'PASSWORD_RESET_REQUESTED',
      description: 'Password-reset request received for an unavailable account.',
      ipAddress: clientIP,
      metadata: { accountMatched: false },
    });
    return genericResponse;
  }

  const createdRequest = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`password-reset:${user.id}`}))`;
    const existing = await tx.passwordResetRequest.findFirst({
      where: { userId: user.id, status: 'PENDING' },
      select: { id: true },
    });
    if (existing) return null;

    const request = await tx.passwordResetRequest.create({
      data: { userId: user.id, status: 'PENDING' },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: null,
        actorRole: UserRole.CUSTOMER,
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'PasswordResetRequest',
        entityId: request.id,
        afterJson: { targetUserId: user.id, status: 'PENDING' },
        ipAddress: clientIP === 'unknown' ? null : clientIP,
        userAgent,
      },
    });
    return request;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  await logSecurityEvent({
    userId: user.id,
    eventType: 'PASSWORD_RESET_REQUESTED',
    description: createdRequest
      ? 'A password-reset request was created.'
      : 'A duplicate pending password-reset request was suppressed.',
    ipAddress: clientIP,
    metadata: { accountMatched: true, created: Boolean(createdRequest) },
  });

  return genericResponse;
}
