import { BookingStatus, FileType, UserRole } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { canAccessBranch } from '@/lib/auth/authorization';
import { canEmployeeAccessTaskAssignment } from '@/lib/auth/task-assignment';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/security/rate-limit';
import {
  bookingPermissionScopes,
  hasPermissionAcrossScopes,
  type PermissionCode,
} from '@/lib/auth/permissions';
import { deleteUploadedFile, processUpload } from '@/lib/upload';
import {
  canUploadExecutionFile,
  isExecutionFileType,
} from '@/lib/engine/evidence-stage';
import { databaseIdSchema } from '@/lib/validations/database-id';

const uploadRequestSchema = z.object({
  bookingId: databaseIdSchema,
  category: z.enum([
    'payment-proofs',
    'before-photos',
    'after-photos',
    'existing-damage',
    'during-photos',
    'refund-proofs',
    'cancellation-evidence',
    'complaint-evidence',
  ]),
});

const CATEGORY_FILE_TYPE: Record<z.infer<typeof uploadRequestSchema>['category'], FileType> = {
  'payment-proofs': FileType.PAYMENT_PROOF,
  'before-photos': FileType.BEFORE_SERVICE,
  'after-photos': FileType.AFTER_SERVICE,
  'existing-damage': FileType.EXISTING_DAMAGE,
  'during-photos': FileType.DURING_SERVICE,
  'refund-proofs': FileType.REFUND_PROOF,
  'cancellation-evidence': FileType.CANCELLATION_EVIDENCE,
  'complaint-evidence': FileType.COMPLAINT_EVIDENCE,
};

const CUSTOMER_CATEGORIES = new Set(['payment-proofs', 'cancellation-evidence', 'complaint-evidence']);
const EMPLOYEE_CATEGORIES = new Set(['before-photos', 'after-photos', 'existing-damage', 'during-photos']);
const IMAGE_ONLY_CATEGORIES = new Set(['before-photos', 'after-photos', 'existing-damage', 'during-photos']);
const TERMINAL_BOOKING_STATUSES = new Set<BookingStatus>([
  BookingStatus.CANCELLED,
  BookingStatus.REJECTED,
  BookingStatus.EXPIRED,
  BookingStatus.CLOSED,
]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser().catch(() => null);
  
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const parsed = uploadRequestSchema.safeParse({
      bookingId: formData.get('bookingId'),
      category: formData.get('category'),
    });
    if (!(file instanceof File) || !parsed.success) {
      return NextResponse.json({ error: 'اختر ملفًا وحدد الحجز ونوع المستند.' }, { status: 400 });
    }

    const { bookingId, category } = parsed.data;

    // If user is guest, only payment-proofs category is allowed
    if (!user) {
      if (category !== 'payment-proofs') {
        return NextResponse.json({ error: 'يجب تسجيل الدخول بحساب نشط.' }, { status: 401 });
      }
    } else if (!user.active || user.deletedAt) {
      return NextResponse.json({ error: 'حسابك غير نشط.' }, { status: 401 });
    }

    const rateLimitTarget = user ? user.id : `guest_upload_${bookingId}`;
    const rateLimit = await checkRateLimit(rateLimitTarget, 'upload');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'تم تجاوز عدد محاولات الرفع المسموح. حاول بعد قليل.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.resetIn) } },
      );
    }

    const fileType = CATEGORY_FILE_TYPE[category];
    if (IMAGE_ONLY_CATEGORIES.has(category) && !file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'هذا النوع من أدلة التنفيذ يقبل الصور فقط (JPG أو PNG أو WEBP).' },
        { status: 400 },
      );
    }
    const booking = await db.booking.findFirst({
      where: { id: bookingId, deletedAt: null },
      select: {
        id: true,
        bookingStatus: true,
        terminalReopenSourceStatus: true,
        assignedEmployeeId: true,
        assignedTeamId: true,
        branchId: true,
        customer: { select: { userId: true } },
        assignedTeam: {
          select: {
            members: {
              where: { userId: user ? user.id : 'guest_anon' },
              select: { id: true, isLeader: true },
            },
          },
        },
        branch: {
          select: {
            id: true,
            memberships: {
              where: { userId: user ? user.id : 'guest_anon' },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!booking) return NextResponse.json({ error: 'الحجز غير موجود.' }, { status: 404 });

    if (booking.terminalReopenSourceStatus) {
      return NextResponse.json(
        { error: 'الحجز مفتوح للمراجعة الإدارية فقط ولا يقبل ملفات جديدة.' },
        { status: 409 },
      );
    }

    if (
      isExecutionFileType(fileType) &&
      !canUploadExecutionFile(booking.bookingStatus, fileType)
    ) {
      return NextResponse.json(
        { error: 'لا يمكن رفع هذا النوع من صور التنفيذ في مرحلة الحجز الحالية.' },
        { status: 409 },
      );
    }

    let allowed = false;
    if (!user) {
      // Guest uploading payment proof for their newly created booking
      allowed = category === 'payment-proofs' && ([BookingStatus.AWAITING_PAYMENT_PROOF, BookingStatus.REQUEST_SUBMITTED] as readonly BookingStatus[]).includes(booking.bookingStatus);
    } else {
      const ownsBooking = booking.customer.userId === user.id;
      const teamMember = booking.assignedTeam?.members[0];
      const hasDirectEmployeeTaskAccess = canEmployeeAccessTaskAssignment({
        employeeId: user.id,
        assignedEmployeeId: booking.assignedEmployeeId,
        isTeamMember: Boolean(teamMember),
        isTeamLeader: Boolean(teamMember?.isLeader),
      });
      const managesBranch = Boolean(booking.branch?.memberships.length);
      const canUploadDelegatedRefundProof =
        user.role === UserRole.EMPLOYEE &&
        category === 'refund-proofs' &&
        await canAccessBranch(user, booking.branchId || booking.customer.userId);
      allowed =
        (user.role === UserRole.CUSTOMER && ownsBooking && CUSTOMER_CATEGORIES.has(category)) ||
        (user.role === UserRole.EMPLOYEE && hasDirectEmployeeTaskAccess && EMPLOYEE_CATEGORIES.has(category)) ||
        canUploadDelegatedRefundProof ||
        (user.role === UserRole.OPERATIONS_MANAGER && managesBranch) ||
        user.role === UserRole.OWNER;
    }

    if (!allowed || (user && user.role === UserRole.SYSTEM_SUPER_ADMIN)) {
      return NextResponse.json({ error: 'غير مصرح برفع هذا النوع لهذا الحجز.' }, { status: 403 });
    }

    const permissionByCategory: Partial<Record<typeof category, PermissionCode>> = {
      'before-photos': 'task.execute',
      'after-photos': 'task.execute',
      'existing-damage': 'task.execute',
      'during-photos': 'task.execute',
      'refund-proofs': 'refund.record_proof',
      'cancellation-evidence': 'cancellation.review',
      'complaint-evidence': 'complaint.manage',
    };
    const requiredPermission = permissionByCategory[category];
    if (
      user &&
      user.role !== UserRole.CUSTOMER &&
      requiredPermission &&
      !(await hasPermissionAcrossScopes(
        user,
        requiredPermission,
        bookingPermissionScopes({
          branchId: booking.branchId,
          assignedTeamId: booking.assignedTeamId,
        }),
      ))
    ) {
      return NextResponse.json({ error: 'لا تملك الصلاحية المطلوبة لرفع هذا النوع من الملفات.' }, { status: 403 });
    }

    if (
      category === 'payment-proofs' &&
      TERMINAL_BOOKING_STATUSES.has(booking.bookingStatus)
    ) {
      return NextResponse.json({ error: 'لا يمكن رفع إثبات دفع لحجز منتهٍ.' }, { status: 409 });
    }

    const upload = await processUpload(file, category);
    if ('error' in upload) {
      return NextResponse.json({ error: upload.error, code: upload.code }, { status: 400 });
    }

    const uploaderUserId = user ? user.id : booking.customer.userId;
    const uploaderRole = user ? user.role : UserRole.CUSTOMER;

    try {
      const bookingFile = await db.$transaction(async (tx) => {
        const record = await tx.bookingFile.create({
          data: {
            bookingId,
            fileType,
            fileUrl: upload.url,
            mimeType: upload.mimeType,
            sizeBytes: upload.sizeBytes,
            uploadedByUserId: uploaderUserId,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: uploaderUserId,
            actorRole: uploaderRole,
            action: 'BOOKING_FILE_UPLOADED',
            entityType: 'BookingFile',
            entityId: record.id,
            afterJson: {
              bookingId,
              fileType: record.fileType,
              mimeType: record.mimeType,
              sizeBytes: record.sizeBytes,
            },
          },
        });
        return record;
      });

      return NextResponse.json({
        success: true,
        bookingFileId: bookingFile.id,
        url: bookingFile.fileUrl,
        mimeType: bookingFile.mimeType,
        sizeBytes: bookingFile.sizeBytes,
      });
    } catch (error) {
      const segments = upload.url.split('/').filter(Boolean);
      await deleteUploadedFile(segments.at(-2) ?? category, segments.at(-1) ?? upload.fileName);
      throw error;
    }
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'تعذر حفظ الملف. حاول مرة أخرى.' }, { status: 500 });
  }
}
