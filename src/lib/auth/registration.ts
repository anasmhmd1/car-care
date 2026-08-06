import { UserRole, type Prisma } from '@prisma/client';
import { REGISTRATION_CONSENTS } from '@/lib/policies/versions';

interface CustomerRegistrationInput {
  fullName: string;
  phone: string;
  whatsapp: string;
  email: string | null;
  passwordHash: string;
  acceptedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Persists every record required for a customer registration. The caller must
 * pass a transaction client so a user can never exist without the matching
 * profile, versioned consents, and immutable registration audit entry.
 */
export async function createCustomerRegistration(
  tx: Prisma.TransactionClient,
  input: CustomerRegistrationInput,
) {
  const user = await tx.user.create({
    data: {
      fullName: input.fullName,
      phone: input.phone,
      whatsapp: input.whatsapp,
      email: input.email,
      passwordHash: input.passwordHash,
      role: UserRole.CUSTOMER,
      customerProfile: {
        create: {},
      },
    },
  });

  await tx.customerConsent.createMany({
    data: REGISTRATION_CONSENTS.map((consent) => ({
      userId: user.id,
      consentType: consent.consentType,
      version: consent.version,
      accepted: true,
      acceptedAt: input.acceptedAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    })),
  });

  await tx.auditLog.create({
    data: {
      actorUserId: user.id,
      actorRole: UserRole.CUSTOMER,
      action: 'CUSTOMER_REGISTER',
      entityType: 'User',
      entityId: user.id,
      afterJson: {
        acceptedConsents: REGISTRATION_CONSENTS.map((consent) => ({
          type: consent.consentType,
          version: consent.version,
        })),
      },
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  return user;
}
