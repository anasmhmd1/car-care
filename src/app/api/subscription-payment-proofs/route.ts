import {
  Prisma,
  SubscriptionPaymentProofStatus,
  SubscriptionStatus,
  UserRole,
} from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { deleteUploadedFile, processUpload } from '@/lib/upload';
import { databaseIdSchema } from '@/lib/validations/database-id';

const requestSchema = z.object({
  subscriptionId: databaseIdSchema,
  paymentMethodId: databaseIdSchema,
  amountSubmitted: z.coerce.number().int().positive().max(10_000_000),
  referenceNumber: z.string().trim().max(120).optional().transform((value) => value || undefined),
  transferTimestamp: z.string().datetime({ offset: true }).optional().transform((value) => (
    value ? new Date(value) : undefined
  )),
});

function uploadedFileLocation(url: string, fallbackName: string): { directory: string; fileName: string } {
  const segments = url.split('/').filter(Boolean);
  return {
    directory: segments.at(-2) ?? 'subscription-payment-proofs',
    fileName: segments.at(-1) ?? fallbackName,
  };
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.active || user.deletedAt || user.role !== UserRole.CUSTOMER) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول بحساب عميل نشط.' }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(user.id, 'upload');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'تم تجاوز عدد محاولات الرفع المسموح. حاول بعد قليل.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.resetIn) } },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const parsed = requestSchema.safeParse({
      subscriptionId: formData.get('subscriptionId'),
      paymentMethodId: formData.get('paymentMethodId'),
      amountSubmitted: formData.get('amountSubmitted'),
      referenceNumber: formData.get('referenceNumber') || undefined,
      transferTimestamp: formData.get('transferTimestamp') || undefined,
    });
    if (!(file instanceof File) || !parsed.success) {
      return NextResponse.json(
        { error: parsed.success ? 'اختر صورة أو ملف PDF للإثبات.' : parsed.error.issues[0]?.message },
        { status: 400 },
      );
    }

    const subscription = await db.customerSubscription.findFirst({
      where: {
        id: parsed.data.subscriptionId,
        status: SubscriptionStatus.PENDING_PAYMENT,
        customer: { userId: user.id },
      },
      select: { id: true, branchId: true },
    });
    if (!subscription) {
      return NextResponse.json({ error: 'طلب الاشتراك غير موجود أو لم يعد يقبل إثباتات.' }, { status: 404 });
    }

    const paymentMethod = await db.branchPaymentMethod.findFirst({
      where: {
        id: parsed.data.paymentMethodId,
        branchId: subscription.branchId,
        active: true,
      },
      select: { id: true },
    });
    if (!paymentMethod) {
      return NextResponse.json({ error: 'وسيلة الدفع غير متاحة لهذا الفرع.' }, { status: 400 });
    }

    const uploaded = await processUpload(file, 'subscription-payment-proofs');
    if ('error' in uploaded) {
      return NextResponse.json({ error: uploaded.error, code: uploaded.code }, { status: 400 });
    }

    try {
      const proof = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription-payment:${subscription.id}`}))`;
        const current = await tx.customerSubscription.findFirst({
          where: {
            id: subscription.id,
            status: SubscriptionStatus.PENDING_PAYMENT,
            customer: { userId: user.id },
          },
          select: {
            id: true,
            branchId: true,
            paymentProofs: {
              where: { status: SubscriptionPaymentProofStatus.APPROVED },
              take: 1,
              select: { id: true },
            },
          },
        });
        if (!current) throw new Error('SUBSCRIPTION_NOT_PENDING');
        if (current.paymentProofs.length > 0) throw new Error('PAYMENT_ALREADY_APPROVED');

        const currentMethod = await tx.branchPaymentMethod.findFirst({
          where: {
            id: paymentMethod.id,
            branchId: current.branchId,
            active: true,
          },
          select: { id: true },
        });
        if (!currentMethod) throw new Error('PAYMENT_METHOD_NOT_AVAILABLE');

        await tx.subscriptionPaymentProof.updateMany({
          where: {
            subscriptionId: current.id,
            status: SubscriptionPaymentProofStatus.UNDER_REVIEW,
          },
          data: {
            status: SubscriptionPaymentProofStatus.REUPLOAD_REQUIRED,
            reviewNotes: 'استبدله العميل بإثبات أحدث قبل المراجعة.',
          },
        });
        const created = await tx.subscriptionPaymentProof.create({
          data: {
            subscriptionId: current.id,
            paymentMethodId: currentMethod.id,
            proofFileUrl: uploaded.url,
            mimeType: uploaded.mimeType,
            sizeBytes: uploaded.sizeBytes,
            amountSubmitted: parsed.data.amountSubmitted,
            referenceNumber: parsed.data.referenceNumber,
            transferTimestamp: parsed.data.transferTimestamp,
            uploadedByUserId: user.id,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            actorRole: user.role,
            action: 'SUBSCRIPTION_PAYMENT_PROOF_UPLOADED',
            entityType: 'SubscriptionPaymentProof',
            entityId: created.id,
            afterJson: {
              subscriptionId: current.id,
              paymentMethodId: currentMethod.id,
              amountSubmitted: created.amountSubmitted,
              mimeType: created.mimeType,
              sizeBytes: created.sizeBytes,
              status: created.status,
            },
          },
        });
        return created;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 25_000,
      });

      return NextResponse.json({
        success: true,
        proofId: proof.id,
        status: proof.status,
      });
    } catch (error) {
      const location = uploadedFileLocation(uploaded.url, uploaded.fileName);
      await deleteUploadedFile(location.directory, location.fileName);
      if (error instanceof Error && error.message === 'PAYMENT_ALREADY_APPROVED') {
        return NextResponse.json({ error: 'تم اعتماد إثبات الدفع بالفعل ولا يمكن استبداله.' }, { status: 409 });
      }
      if (error instanceof Error && error.message === 'PAYMENT_METHOD_NOT_AVAILABLE') {
        return NextResponse.json({ error: 'وسيلة الدفع لم تعد متاحة.' }, { status: 409 });
      }
      if (error instanceof Error && error.message === 'SUBSCRIPTION_NOT_PENDING') {
        return NextResponse.json({ error: 'طلب الاشتراك لم يعد بانتظار الدفع.' }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    console.error('Subscription payment proof upload failed:', error);
    return NextResponse.json({ error: 'تعذر حفظ إثبات الدفع. حاول مرة أخرى.' }, { status: 500 });
  }
}
