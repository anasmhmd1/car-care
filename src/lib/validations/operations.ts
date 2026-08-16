import { z } from 'zod';
import { databaseIdSchema } from '@/lib/validations/database-id';

// --------------------------------------------------------
// Operations Schemas
// --------------------------------------------------------

export const reviewPaymentProofSchema = z.object({
  proofId: databaseIdSchema,
  decision: z.enum(['VERIFY', 'REJECT', 'SHORT', 'REUPLOAD', 'DUPLICATE'], {
    errorMap: () => ({ message: 'القرار غير صالح' }),
  }),
  reviewNotes: z.string().max(1000).optional().default(''),
}).refine(
  (data) => data.decision === 'VERIFY' || data.reviewNotes.trim().length > 0,
  { message: 'سبب القرار إجباري عند عدم اعتماد إثبات التحويل', path: ['reviewNotes'] }
);

export const reviewBookingSchema = z.object({
  bookingId: databaseIdSchema,
  decision: z.enum(['ACCEPT', 'REJECT']),
  reason: z.string().trim().min(3, 'اكتب سبب القرار').max(1000),
});

export const assignTeamManuallySchema = z.object({
  bookingId: databaseIdSchema,
  teamId: databaseIdSchema,
  reason: z.string().min(1, 'سبب التوزيع مطلوب').max(500).default('Manual assignment by manager'),
});

export const recordBalancePaymentSchema = z.object({
  bookingId: databaseIdSchema,
  amount: z.coerce.number().int().positive('المبلغ يجب أن يكون أكبر من صفر'),
  paymentMethod: z.string().trim().min(2, 'وسيلة التحصيل مطلوبة').max(100),
  referenceNumber: z.string().trim().max(100).optional().default(''),
  notes: z.string().trim().max(1000).optional().default(''),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const releaseBookingHoldSchema = z.object({
  bookingId: databaseIdSchema,
  reason: z.string().trim().min(3, 'سبب تحرير الحجز المؤقت مطلوب').max(500),
});

export const updateBookingStatusSchema = z.object({
  bookingId: databaseIdSchema,
  targetStatus: z.string().min(1, 'الحالة المستهدفة مطلوبة'),
  reason: z.string().max(500).optional().default(''),
});

export const cancelBookingByOperationsSchema = z.object({
  bookingId: databaseIdSchema,
  reason: z.string().trim().min(3, 'سبب الإلغاء مطلوب (3 أحرف على الأقل)').max(1000),
});

export const rescheduleBookingByOperationsSchema = z.object({
  bookingId: databaseIdSchema,
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ الموعد الجديد غير صالح.'),
  targetTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'وقت الموعد الجديد غير صالح.'),
  reason: z.string().trim().min(3, 'سبب تغيير الموعد مطلوب').max(500),
});

export const transferBookingTeamSchema = z.object({
  bookingId: databaseIdSchema,
  targetTeamId: databaseIdSchema,
  reason: z.string().trim().min(3, 'سبب نقل الحجز مطلوب').max(500),
});

export const toggleBranchScheduleLockSchema = z.object({
  branchId: databaseIdSchema,
  locked: z.preprocess((val) => val === 'true' || val === true, z.boolean()),
  reason: z.string().trim().max(500).optional(),
});

// --------------------------------------------------------
// Cancellation & Refund Schemas
// --------------------------------------------------------

export const requestCancellationSchema = z.object({
  bookingId: databaseIdSchema,
  reason: z.string().min(1, 'سبب الإلغاء مطلوب').max(1000),
  preferredAction: z.enum(['REFUND', 'RESCHEDULE', 'CREDIT']).default('REFUND'),
  alternativeDates: z.string().max(500).optional().default(''),
  notes: z.string().max(1000).optional().default(''),
  attachmentFileId: databaseIdSchema.optional(),
});

export const reviewCancellationSchema = z.object({
  cancellationId: databaseIdSchema,
  decision: z.enum(['APPROVE', 'REJECT'], {
    errorMap: () => ({ message: 'القرار غير صالح' }),
  }),
  resolutionType: z.enum([
    'REFUND_FULL', 'REFUND_PARTIAL', 'NO_REFUND', 'CREDIT',
    'KEEP_DEPOSIT', 'VISIT_FEE', 'RESCHEDULE', 'ESCALATE',
  ]).optional(),
  resolutionNotes: z.string().min(1, 'ملاحظات القرار مطلوبة').max(1000),
  responsibleParty: z.enum(['CUSTOMER', 'TEAM', 'BRANCH', 'ACCESS', 'FORCE_MAJEURE']).optional(),
  approvedRefundAmount: z.coerce.number().int().min(0).optional(),
  visitFeeAmount: z.coerce.number().int().positive().optional(),
}).superRefine((data, context) => {
  if (data.decision !== 'APPROVE') return;
  if (!data.resolutionType) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['resolutionType'], message: 'نوع الحل مطلوب عند اعتماد الطلب' });
  }
  if (!data.responsibleParty) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['responsibleParty'], message: 'الطرف المسؤول مطلوب' });
  }
  if (data.resolutionType === 'REFUND_PARTIAL' && !data.approvedRefundAmount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['approvedRefundAmount'], message: 'حدد مبلغ الاسترداد الجزئي' });
  }
  if (data.resolutionType === 'VISIT_FEE' && !data.visitFeeAmount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['visitFeeAmount'], message: 'حدد قيمة رسوم الزيارة' });
  }
});

export const recordRefundSchema = z.object({
  bookingId: databaseIdSchema,
  amount: z.coerce.number().int().positive('مبلغ الاسترداد يجب أن يكون أكبر من صفر'),
  refundMethod: z.string().min(1, 'وسيلة الاسترداد مطلوبة').max(200),
  referenceNumber: z.string().max(100).optional().default(''),
  bookingFileId: databaseIdSchema,
  refundTimestamp: z.coerce.date(),
  idempotencyKey: z.string().trim().min(8).max(200),
  notes: z.string().max(1000).optional().default(''),
});

export const requestRescheduleSchema = z.object({
  bookingId: databaseIdSchema,
  reason: z.string().min(1, 'سبب التعديل مطلوب').max(1000),
  requestedStartAt: z.coerce.date(),
  proposedDates: z.string().max(1000).optional().default(''),
  notes: z.string().max(1000).optional().default(''),
});

export const reviewRescheduleSchema = z.object({
  timeChangeId: databaseIdSchema,
  decision: z.enum(['APPROVE', 'REJECT']),
  approvedStartAt: z.coerce.date().optional(),
  reviewNotes: z.string().trim().min(3, 'ملاحظات القرار مطلوبة').max(1000),
}).superRefine((data, context) => {
  if (data.decision === 'APPROVE' && !data.approvedStartAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['approvedStartAt'], message: 'اختر الموعد المعتمد' });
  }
});

export const approveRefundSchema = z.object({
  refundId: databaseIdSchema,
  reason: z.string().trim().min(3, 'سبب الاعتماد مطلوب').max(1000),
});

export const completeCancellationOverrideSchema = z.object({
  cancellationId: databaseIdSchema,
  reason: z.string().trim().min(10, 'اكتب سبب التجاوز بالتفصيل').max(1000),
});

// --------------------------------------------------------
// Quality Review Schema
// --------------------------------------------------------

export const qualityReviewSchema = z.object({
  bookingId: databaseIdSchema,
  approved: z.enum(['true', 'false']).transform((value) => value === 'true'),
  score: z.coerce.number().int().min(1).max(5).optional(),
  notes: z.string().max(1000).optional().default(''),
  returnedToTeam: z.enum(['true', 'false']).transform((value) => value === 'true').default('false'),
}).superRefine((data, context) => {
  if ((!data.approved || data.returnedToTeam) && data.notes.trim().length < 3) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['notes'], message: 'سبب إعادة المهمة للفريق مطلوب' });
  }
});

// --------------------------------------------------------
// Complaint Schema
// --------------------------------------------------------

export const createComplaintSchema = z.object({
  bookingId: databaseIdSchema,
  type: z.string().min(1, 'نوع الشكوى مطلوب').max(100),
  description: z.string().min(1, 'وصف الشكوى مطلوب').max(2000),
  evidenceFileIds: z.string().optional().default('[]').transform((value, context) => {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed) || parsed.length > 5 || parsed.some((id) => !databaseIdSchema.safeParse(id).success)) {
        throw new Error('invalid');
      }
      return [...new Set(parsed)] as string[];
    } catch {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'ملفات الشكوى غير صالحة' });
      return z.NEVER;
    }
  }),
});

export const triageComplaintSchema = z.object({
  complaintId: databaseIdSchema,
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  status: z.enum(['UNDER_REVIEW', 'ACTION_REQUIRED']),
  assignedToUserId: databaseIdSchema.optional(),
  notes: z.string().trim().min(3, 'ملاحظات الفرز مطلوبة').max(1000),
});

export const resolveComplaintSchema = z.object({
  complaintId: databaseIdSchema,
  resolution: z.string().min(1, 'وصف الحل مطلوب').max(2000),
  compensation: z.string().max(500).optional().default(''),
  status: z.enum(['RESOLVED', 'COMPENSATED', 'CLOSED']).default('RESOLVED'),
});

export type ReviewPaymentProofInput = z.infer<typeof reviewPaymentProofSchema>;
export type AssignTeamManuallyInput = z.infer<typeof assignTeamManuallySchema>;
export type RequestCancellationInput = z.infer<typeof requestCancellationSchema>;
export type ReviewCancellationInput = z.infer<typeof reviewCancellationSchema>;
export type RecordRefundInput = z.infer<typeof recordRefundSchema>;
