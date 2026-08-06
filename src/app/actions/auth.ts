'use server';

import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createSession, destroySession } from '@/lib/auth/session';
import { createCustomerRegistration } from '@/lib/auth/registration';
import { logAudit } from '@/lib/audit';
import { loginSchema, registerSchema } from '@/lib/validations/auth';
import { checkRateLimit, recordLoginFailure, isAccountLocked, clearLockout } from '@/lib/security/rate-limit';
import { getClientIP, logSecurityEvent } from '@/lib/security/security-events';
import { phoneLookupCandidates } from '@/lib/validations/phone';
import { getSafeLocalReturnPath } from '@/lib/auth/return-url';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function loginAction(_prevState: unknown, formData: FormData) {
  const customerCallback = getSafeLocalReturnPath(formData.get('callback'));
  const raw = {
    phone: (formData.get('phone') as string || '').trim(),
    password: (formData.get('password') as string || '').trim(),
  };

  // Zod validation
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'بيانات غير صالحة' };
  }

  const { phone, password } = parsed.data;

  // Throttle both the canonical account identity and origin. A phone-only
  // limit can be bypassed by cycling numbers, while an IP-only limit lets a
  // distributed attack target one account indefinitely.
  const requestHeaders = await headers();
  const clientIP = getClientIP(requestHeaders);
  const [phoneRate, ipRate] = await Promise.all([
    checkRateLimit(`phone:${phone}`, 'login'),
    checkRateLimit(`ip:${clientIP}`, 'login'),
  ]);
  const rateCheck = {
    allowed: phoneRate.allowed && ipRate.allowed,
    resetIn: Math.max(phoneRate.resetIn, ipRate.resetIn),
  };
  if (!rateCheck.allowed) {
    await logSecurityEvent({
      eventType: 'RATE_LIMIT_EXCEEDED',
      description: `Rate limit exceeded for login: ${phone}`,
      ipAddress: clientIP,
      metadata: { phone, resetIn: rateCheck.resetIn },
    });
    return { error: `تم تجاوز عدد المحاولات المسموحة. يرجى المحاولة بعد ${rateCheck.resetIn} ثانية.` };
  }

  // Account lockout check
  if (await isAccountLocked(phone)) {
    return { error: 'تم تعليق الحساب مؤقتاً بسبب محاولات تسجيل دخول متعددة. يرجى المحاولة لاحقاً.' };
  }

  const canonicalUser = await db.user.findUnique({ where: { phone } });
  const legacyCandidates = phoneLookupCandidates(phone).filter((candidate) => candidate !== phone);
  const legacyUsers = canonicalUser || legacyCandidates.length === 0
    ? []
    : await db.user.findMany({
      where: { phone: { in: legacyCandidates } },
      take: 2,
    });
  // A canonical record always wins. If two legacy identities normalize to the
  // same value, fail safely until the migration/manual review resolves it.
  const user = canonicalUser ?? (legacyUsers.length === 1 ? legacyUsers[0] : null);

  if (!user || !user.active || user.deletedAt) {
    const lockResult = await recordLoginFailure(phone);
    await logSecurityEvent({
      eventType: 'LOGIN_FAILURE',
      description: `Failed login attempt for phone: ${phone}`,
      ipAddress: clientIP,
      metadata: { phone, reason: 'user_not_found_or_inactive' },
    });
    if (lockResult.locked) {
      await logSecurityEvent({
        eventType: 'ACCOUNT_LOCKED',
        description: `Account locked after repeated failures: ${phone}`,
        metadata: { phone, lockoutMinutes: lockResult.lockoutMinutes },
      });
    }
    return { error: 'رقم الهاتف أو كلمة المرور غير صحيحة' };
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    const lockResult = await recordLoginFailure(phone);
    await logSecurityEvent({
      eventType: 'LOGIN_FAILURE',
      description: `Failed login attempt for user: ${user.id}`,
      ipAddress: clientIP,
      metadata: { userId: user.id, phone },
    });
    if (lockResult.locked) {
      await logSecurityEvent({
        eventType: 'ACCOUNT_LOCKED',
        description: `Account locked: ${user.id}`,
        metadata: { userId: user.id, lockoutMinutes: lockResult.lockoutMinutes },
      });
    }
    return { error: 'رقم الهاتف أو كلمة المرور غير صحيحة' };
  }

  // Clear lockout on successful login
  await clearLockout(phone);

  await createSession(user);

  await logSecurityEvent({
    eventType: 'LOGIN_SUCCESS',
    description: `Successful login: ${user.id}`,
    ipAddress: clientIP,
    metadata: { userId: user.id, role: user.role },
  });

  await logAudit({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'USER_LOGIN',
    entityType: 'User',
    entityId: user.id,
  });

  // Check if user must change password on first login
  if (user.mustChangePwd) {
    redirect('/account/profile?change_password=true');
  }

  // Redirect based on role
  switch (user.role) {
    case 'SYSTEM_SUPER_ADMIN':
      redirect('/system-admin');
    case 'OWNER':
      redirect('/admin');
    case 'OPERATIONS_MANAGER':
      redirect('/operations');
    case 'EMPLOYEE':
      redirect('/staff');
    case 'CUSTOMER':
      redirect(customerCallback ?? '/account');
    default:
      redirect('/account');
  }
}

export async function registerAction(_prevState: unknown, formData: FormData) {
  const customerCallback = getSafeLocalReturnPath(formData.get('callback'));
  const raw = {
    fullName: (formData.get('fullName') as string || '').trim(),
    phone: (formData.get('phone') as string || '').trim(),
    whatsapp: (formData.get('whatsapp') as string || '').trim(),
    email: (formData.get('email') as string || '').trim(),
    password: (formData.get('password') as string || '').trim(),
    policyAgreement: formData.get('policyAgreement') as string,
  };

  // Zod validation
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'بيانات غير صالحة' };
  }

  const { fullName, phone, password } = parsed.data;
  const whatsapp = parsed.data.whatsapp ?? phone;
  const requestHeaders = await headers();
  const clientIP = getClientIP(requestHeaders);

  const [phoneRate, ipRate] = await Promise.all([
    checkRateLimit(`phone:${phone}`, 'register'),
    checkRateLimit(`ip:${clientIP}`, 'register'),
  ]);
  const rateCheck = {
    allowed: phoneRate.allowed && ipRate.allowed,
    resetIn: Math.max(phoneRate.resetIn, ipRate.resetIn),
  };
  if (!rateCheck.allowed) {
    await logSecurityEvent({
      eventType: 'RATE_LIMIT_EXCEEDED',
      description: 'Registration rate limit exceeded.',
      ipAddress: clientIP,
      metadata: { phone, resetIn: rateCheck.resetIn, action: 'register' },
    });
    return { error: 'تم تجاوز عدد المحاولات المسموحة. يرجى المحاولة لاحقاً.' };
  }

  const existing = await db.user.findFirst({
    where: { phone: { in: phoneLookupCandidates(phone) } },
  });

  if (existing) {
    return { error: 'رقم الهاتف مسجل بالفعل. يرجى تسجيل الدخول.' };
  }

  // Check email uniqueness if provided
  if (raw.email) {
    const emailExists = await db.user.findUnique({
      where: { email: raw.email },
    });
    if (emailExists) {
      return { error: 'البريد الإلكتروني مسجل بالفعل.' };
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const metadata = {
    acceptedAt: new Date(),
    ipAddress: clientIP === 'unknown' ? null : clientIP,
    userAgent: requestHeaders.get('user-agent')?.slice(0, 1000) ?? null,
  };

  let user: Awaited<ReturnType<typeof createCustomerRegistration>>;
  try {
    user = await db.$transaction(
      (tx) => createCustomerRegistration(tx, {
        fullName,
        phone,
        whatsapp,
        email: raw.email || null,
        passwordHash,
        ...metadata,
      }),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return {
        error: 'تعذر إنشاء الحساب بهذه البيانات. جرّب رقم هاتف أو بريدًا آخر، أو سجّل الدخول إذا كان لديك حساب.',
      };
    }
    console.error('Customer registration failed', error);
    return { error: 'تعذر إنشاء الحساب الآن. حاول مرة أخرى.' };
  }

  // A session is only issued after every registration record is committed.
  await createSession(user);

  redirect(customerCallback ?? '/account');
}

export async function logoutAction() {
  await destroySession('USER_LOGOUT');
  redirect('/login');
}
