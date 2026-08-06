'use server';

import { FileType, Prisma, UserRole } from '@prisma/client';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getClientIP } from '@/lib/security/security-events';
import { databaseIdSchema } from '@/lib/validations/database-id';

const customerConsentSchema = z.object({
  bookingId: databaseIdSchema,
  decision: z.enum(['GRANT', 'REVOKE']),
  explicitConsent: z.string().optional(),
});

const galleryReviewSchema = z.object({
  fileId: databaseIdSchema,
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().min(5).max(500),
});

const GALLERY_FILE_TYPES = [FileType.BEFORE_SERVICE, FileType.AFTER_SERVICE] as const;
const GALLERY_CONSENT_VERSION = 'GALLERY_PUBLICATION_V1';

export async function setCustomerGalleryConsentAction(formData: FormData) {
  const customer = await requireRole([UserRole.CUSTOMER]);
  const parsed = customerConsentSchema.safeParse({
    bookingId: formData.get('bookingId'),
    decision: formData.get('decision'),
    explicitConsent: formData.get('explicitConsent'),
  });
  if (!parsed.success) return { error: 'طلب موافقة النشر غير صالح' };
  if (parsed.data.decision === 'GRANT' && parsed.data.explicitConsent !== 'true') {
    return { error: 'يجب تحديد الموافقة الصريحة قبل السماح بالنشر العام' };
  }

  const requestHeaders = await headers();
  const ipAddress = getClientIP(requestHeaders);
  const userAgent = requestHeaders.get('user-agent')?.slice(0, 1000) ?? null;
  const consentType = `GALLERY_PUBLICATION:${parsed.data.bookingId}`;
  const now = new Date();

  try {
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`gallery-consent:${parsed.data.bookingId}`}))`;
      const booking = await tx.booking.findFirst({
        where: {
          id: parsed.data.bookingId,
          deletedAt: null,
          customer: { userId: customer.id },
        },
        select: {
          id: true,
          bookingNumber: true,
          files: {
            where: { fileType: { in: [...GALLERY_FILE_TYPES] } },
            select: { id: true },
          },
        },
      });
      if (!booking) throw new Error('BOOKING_NOT_FOUND');
      if (booking.files.length === 0) throw new Error('NO_GALLERY_FILES');

      await tx.customerConsent.updateMany({
        where: { userId: customer.id, consentType, revokedAt: null },
        data: { revokedAt: now },
      });

      const granted = parsed.data.decision === 'GRANT';
      await tx.customerConsent.create({
        data: {
          userId: customer.id,
          consentType,
          version: GALLERY_CONSENT_VERSION,
          accepted: granted,
          ipAddress: ipAddress === 'unknown' ? null : ipAddress,
          userAgent,
          revokedAt: granted ? null : now,
        },
      });

      const updated = await tx.bookingFile.updateMany({
        where: { bookingId: booking.id, fileType: { in: [...GALLERY_FILE_TYPES] } },
        data: granted
          ? { customerGalleryConsentAt: now }
          : {
              customerGalleryConsentAt: null,
              approvedForGallery: false,
              galleryApprovedByUserId: null,
              galleryApprovedAt: null,
            },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: customer.id,
          actorRole: customer.role,
          action: granted ? 'GRANT_GALLERY_PUBLICATION_CONSENT' : 'REVOKE_GALLERY_PUBLICATION_CONSENT',
          entityType: 'Booking',
          entityId: booking.id,
          beforeJson: { consent: granted ? false : true },
          afterJson: { consent: granted, affectedFiles: updated.count, consentVersion: GALLERY_CONSENT_VERSION },
          reason: granted ? 'موافقة العميل الصريحة على نشر صور قبل/بعد' : 'سحب العميل موافقة النشر العام',
          ipAddress: ipAddress === 'unknown' ? null : ipAddress,
          userAgent,
        },
      });
      return { granted, count: updated.count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidatePath(`/account/bookings/${parsed.data.bookingId}`);
    revalidatePath('/admin/gallery');
    revalidatePath('/before-after');
    return {
      success: true,
      message: result.granted
        ? `تم تسجيل موافقتك على ${result.count} صورة. لن تُنشر قبل مراجعة المالك.`
        : 'تم سحب الموافقة وإيقاف نشر صور هذا الحجز فورًا.',
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'BOOKING_NOT_FOUND') return { error: 'الحجز غير موجود أو لا يخص هذا الحساب' };
    if (error instanceof Error && error.message === 'NO_GALLERY_FILES') return { error: 'لا توجد صور قبل/بعد متاحة للموافقة عليها' };
    console.error('Gallery customer consent failed:', error);
    return { error: 'تعذر حفظ قرار موافقة النشر الآن' };
  }
}

export async function reviewGalleryFileAction(formData: FormData) {
  const owner = await requireRole([UserRole.OWNER]);
  const parsed = galleryReviewSchema.safeParse({
    fileId: formData.get('fileId'),
    decision: formData.get('decision'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'قرار مراجعة الصورة غير صالح' };

  const initial = await db.bookingFile.findUnique({
    where: { id: parsed.data.fileId },
    select: { bookingId: true },
  });
  if (!initial) return { error: 'الصورة غير موجودة' };

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`gallery-consent:${initial.bookingId}`}))`;
      const file = await tx.bookingFile.findUnique({
        where: { id: parsed.data.fileId },
        select: {
          id: true,
          bookingId: true,
          fileType: true,
          approvedForGallery: true,
          customerGalleryConsentAt: true,
          galleryApprovedAt: true,
        },
      });
      if (!file || !GALLERY_FILE_TYPES.includes(file.fileType as (typeof GALLERY_FILE_TYPES)[number])) {
        throw new Error('FILE_NOT_ELIGIBLE');
      }
      const approved = parsed.data.decision === 'APPROVE';
      if (approved && !file.customerGalleryConsentAt) throw new Error('CONSENT_REQUIRED');

      await tx.bookingFile.update({
        where: { id: file.id },
        data: approved
          ? {
              approvedForGallery: true,
              galleryApprovedByUserId: owner.id,
              galleryApprovedAt: new Date(),
            }
          : {
              approvedForGallery: false,
              galleryApprovedByUserId: null,
              galleryApprovedAt: null,
            },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: owner.id,
          actorRole: owner.role,
          action: approved ? 'APPROVE_GALLERY_FILE' : 'REJECT_OR_UNPUBLISH_GALLERY_FILE',
          entityType: 'BookingFile',
          entityId: file.id,
          beforeJson: {
            approvedForGallery: file.approvedForGallery,
            galleryApprovedAt: file.galleryApprovedAt?.toISOString() ?? null,
          },
          afterJson: { approvedForGallery: approved },
          reason: parsed.data.reason,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidatePath('/admin/gallery');
    revalidatePath('/before-after');
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message === 'FILE_NOT_ELIGIBLE') return { error: 'هذه الصورة غير مؤهلة للمعرض العام' };
    if (error instanceof Error && error.message === 'CONSENT_REQUIRED') return { error: 'لا يمكن النشر قبل موافقة العميل الصريحة' };
    console.error('Gallery review failed:', error);
    return { error: 'تعذر حفظ قرار مراجعة الصورة' };
  }
}
