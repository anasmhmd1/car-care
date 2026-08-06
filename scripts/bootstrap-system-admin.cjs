/* eslint-disable @typescript-eslint/no-require-imports -- this bootstrap is intentionally CommonJS for direct Node execution. */
const { PrismaClient, UserRole } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { loadEnvConfig } = require('@next/env');
const { z } = require('zod');

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();

const forbiddenCredentialFragment = /replace-with|change-me|placeholder|example|password|bareeq123/i;
const bootstrapSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^[\d+\-\s()]{8,20}$/),
  email: z.string().trim().email().nullable(),
  password: z.string()
    .min(14)
    .max(128)
    .regex(/[a-z]/, 'Password needs a lowercase letter.')
    .regex(/[A-Z]/, 'Password needs an uppercase letter.')
    .regex(/\d/, 'Password needs a number.')
    .regex(/[^A-Za-z0-9]/, 'Password needs a symbol.'),
}).superRefine((value, context) => {
  for (const [field, candidate] of Object.entries(value)) {
    if (candidate && forbiddenCredentialFragment.test(candidate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} contains a placeholder or predictable value.`,
      });
    }
  }
});

async function main() {
  const parsed = bootstrapSchema.safeParse({
    fullName: process.env.BOOTSTRAP_ADMIN_NAME ?? '',
    phone: process.env.BOOTSTRAP_ADMIN_PHONE ?? '',
    email: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() || null,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '',
  });
  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'configuration'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid bootstrap configuration: ${errors}`);
  }
  const { fullName, phone, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bareeq:bootstrap-system-admin'))`;
    const existingAdmin = await tx.user.findFirst({
      where: { role: UserRole.SYSTEM_SUPER_ADMIN, deletedAt: null },
      select: { id: true },
    });
    if (existingAdmin) {
      throw new Error('A System Super Admin already exists; bootstrap is create-only.');
    }

    const duplicateIdentity = await tx.user.findFirst({
      where: { OR: [{ phone }, ...(email ? [{ email }] : [])] },
      select: { id: true },
    });
    if (duplicateIdentity) {
      throw new Error('The bootstrap phone or email is already assigned to another user.');
    }

    const admin = await tx.user.create({
      data: {
        fullName,
        phone,
        email,
        passwordHash,
        role: UserRole.SYSTEM_SUPER_ADMIN,
        active: true,
        mustChangePwd: true,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: admin.id,
        actorRole: UserRole.SYSTEM_SUPER_ADMIN,
        action: 'BOOTSTRAP_SYSTEM_ADMIN',
        entityType: 'User',
        entityId: admin.id,
        afterJson: { role: UserRole.SYSTEM_SUPER_ADMIN, mustChangePwd: true },
        reason: 'Initial production bootstrap',
      },
    });
  });

  console.info('System Super Admin created. The temporary password was not printed and must be changed on first login.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'System-admin bootstrap failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
