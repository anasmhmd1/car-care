'use server';

import { randomUUID } from 'crypto';
import {
  BookingHoldStatus,
  BookingStatus,
  FileType,
  PaymentStatus,
  Prisma,
  ProofStatus,
  SubscriptionStatus,
  UserRole,
  VehicleSize,
  VisitLedgerAction,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { evaluateRequestedInterval } from '@/lib/engine/availability';
import { expireAwaitingPaymentBooking } from '@/lib/engine/booking-expiration';
import { CustomerCreditError } from '@/lib/engine/customer-credit';
import { syncInvoiceForBooking } from '@/lib/engine/invoice';
import { transitionBookingStatus } from '@/lib/engine/transition';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { createMaterialRequirementsSnapshot } from '@/lib/booking/material-requirements-snapshot';
import {
  cancellationPolicyRevision,
  cancellationPolicySnapshot,
} from '@/lib/policies/cancellation';
import { BOOKING_TERMS_VERSION } from '@/lib/policies/versions';
import {
  createBookingSchema,
  uploadPaymentProofSchema,
} from '@/lib/validations/booking';

const DEFAULT_HOLD_MINUTES = 30;
const PAYMENT_REVIEW_HOLD_MINUTES = 24 * 60;
const TERMINAL_STATUSES: BookingStatus[] = [
  BookingStatus.CANCELLED,
  BookingStatus.REJECTED,
  BookingStatus.EXPIRED,
  BookingStatus.CLOSED,
];

class BookingInputError extends Error {}

type BookableSubscription = Prisma.CustomerSubscriptionGetPayload<{
  include: {
    plan: { include: { services: true; branches: true } };
    vehicles: true;
    serviceBalances: true;
  };
}>;

function getPositiveEnvMinutes(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function bookingNumber(now: Date) {
  const date = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('');
  return `BQ-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function createBookingAction(formData: FormData) {
  const user = await requireRole([UserRole.CUSTOMER]);
  const rateLimit = await checkRateLimit(user.id, 'booking');
  if (!rateLimit.allowed) {
    return { error: 'تم تجاوز عدد محاولات الحجز المسموح. حاول بعد قليل.' };
  }

  const parsed = createBookingSchema.safeParse({
    serviceId: formData.get('serviceId'),
    coverageAreaId: formData.get('coverageAreaId'),
    vehicleSize: formData.get('vehicleSize') || VehicleSize.SEDAN,
    startAt: formData.get('startAt'),
    addonIds: formData.get('addonIds') || '[]',
    vehicleMake: formData.get('vehicleMake'),
    vehicleModel: formData.get('vehicleModel'),
    vehicleYear: formData.get('vehicleYear'),
    vehicleColor: formData.get('vehicleColor'),
    plateNumber: formData.get('plateNumber') || '',
    street: formData.get('street'),
    buildingNumber: formData.get('buildingNumber'),
    unitNumber: formData.get('unitNumber') || '',
    landmark: formData.get('landmark') || '',
    gateInstructions: formData.get('gateInstructions') || '',
    locationUrl: formData.get('locationUrl') || '',
    customerNotes: formData.get('customerNotes') || '',
    contactName: formData.get('contactName') || user.fullName,
    contactPhone: formData.get('contactPhone') || user.phone,
    contactWhatsapp: formData.get('contactWhatsapp') || user.whatsapp || user.phone,
    policyAccepted: formData.get('policyAccepted'),
    policyVersion: formData.get('policyVersion') || BOOKING_TERMS_VERSION,
    acceptedCancellationPolicyId: formData.get('acceptedCancellationPolicyId'),
    acceptedCancellationPolicyRevision: formData.get('acceptedCancellationPolicyRevision'),
    vehicleId: formData.get('vehicleId'),
    addressId: formData.get('addressId'),
    subscriptionId: formData.get('subscriptionId'),
    useCredit: formData.get('useCredit'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'راجع بيانات الحجز المطلوبة.' };
  }

  const data = parsed.data;
  const now = new Date();
  if (data.startAt <= now) return { error: 'لا يمكن الحجز في موعد مضى.' };

  try {
    const result = await db.$transaction(async (tx) => {
      const area = await tx.coverageArea.findFirst({
        where: { id: data.coverageAreaId, active: true, zone: { branch: { status: 'ACTIVE' } } },
        include: { zone: { include: { branch: true } } },
      });
      if (!area) throw new BookingInputError('العنوان خارج التغطية الحالية.');

      // Serialize booking confirmations per branch. This lets a concurrent
      // request re-evaluate all teams instead of both choosing the same one.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`capacity:${area.zone.branchId}`}))`;

      const customer = await tx.customerProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      });
      let currentCreditBalance = customer.creditBalance;

      let vehicle = data.vehicleId
        ? await tx.vehicle.findFirst({ where: { id: data.vehicleId, customerId: customer.id } })
        : null;
      if (data.vehicleId && !vehicle) throw new BookingInputError('السيارة المختارة لا تخص حسابك.');
      if (!vehicle) {
        vehicle = await tx.vehicle.create({
          data: {
            customerId: customer.id,
            make: data.vehicleMake,
            model: data.vehicleModel,
            year: data.vehicleYear,
            color: data.vehicleColor,
            vehicleSize: data.vehicleSize,
            plateNumber: data.plateNumber || null,
            isDefault: (await tx.vehicle.count({ where: { customerId: customer.id } })) === 0,
          },
        });
      }

      let address = data.addressId
        ? await tx.customerAddress.findFirst({ where: { id: data.addressId, customerId: customer.id } })
        : null;
      if (data.addressId && !address) throw new BookingInputError('العنوان المختار لا يخص حسابك.');
      if (address && (
        address.governorate !== area.governorate ||
        address.city !== area.city ||
        address.district !== area.district ||
        address.compound !== area.compound
      )) {
        throw new BookingInputError('العنوان المحفوظ لا يطابق منطقة التغطية المختارة.');
      }
      if (!address) {
        address = await tx.customerAddress.create({
          data: {
            customerId: customer.id,
            governorate: area.governorate,
            city: area.city,
            district: area.district,
            compound: area.compound,
            street: data.street,
            buildingNumber: data.buildingNumber,
            unitNumber: data.unitNumber || null,
            landmark: data.landmark || null,
            gateInstructions: data.gateInstructions || null,
            locationUrl: data.locationUrl || null,
            isDefault: (await tx.customerAddress.count({ where: { customerId: customer.id } })) === 0,
          },
        });
      }

      let subscription: BookableSubscription | null = null;
      if (data.subscriptionId) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`subscription-balance:${data.subscriptionId}`}))`;
        subscription = await tx.customerSubscription.findFirst({
          where: {
            id: data.subscriptionId,
            customerId: customer.id,
            status: SubscriptionStatus.ACTIVE,
            startDate: { lte: now },
            endDate: { gt: data.startAt },
          },
          include: {
            plan: { include: { services: true, branches: true } },
            vehicles: true,
            serviceBalances: true,
          },
        });
        if (!subscription || subscription.remainingVisits < 1) {
          throw new BookingInputError('الاشتراك غير صالح أو لا توجد زيارات متبقية.');
        }
        if (!subscription.plan.services.some((service) => service.serviceId === data.serviceId)) {
          throw new BookingInputError('الخدمة المختارة غير مشمولة في هذا الاشتراك.');
        }
        if (subscription.branchId !== area.zone.branchId || (
          subscription.plan.branches.length > 0 &&
          !subscription.plan.branches.some((branch) => branch.branchId === area.zone.branchId)
        )) {
          throw new BookingInputError('الاشتراك غير صالح لهذا الفرع.');
        }
        if (!subscription.vehicles.some((linkedVehicle) => linkedVehicle.vehicleId === vehicle.id)) {
          throw new BookingInputError('السيارة المختارة غير مرتبطة بهذا الاشتراك.');
        }
        const serviceBalance = subscription.serviceBalances.find((balance) => balance.serviceId === data.serviceId);
        if (subscription.serviceBalances.length > 0 && (!serviceBalance || serviceBalance.remainingVisits < 1)) {
          throw new BookingInputError('لا توجد زيارات متبقية لهذه الخدمة داخل الباقة.');
        }
        const activeReservations = await tx.booking.count({
          where: {
            subscriptionId: subscription.id,
            ...(serviceBalance ? { serviceId: data.serviceId } : {}),
            deletedAt: null,
            bookingStatus: { notIn: TERMINAL_STATUSES },
            visitLedgerEntries: { some: { action: VisitLedgerAction.BOOKING_RESERVED } },
            AND: [
              { NOT: { visitLedgerEntries: { some: { action: VisitLedgerAction.BOOKING_COMPLETED } } } },
              { NOT: { visitLedgerEntries: { some: { action: VisitLedgerAction.BOOKING_CANCELLED_RESTORED } } } },
            ],
          },
        });
        const reservableVisits = serviceBalance?.remainingVisits ?? subscription.remainingVisits;
        if (activeReservations >= reservableVisits) {
          throw new BookingInputError(serviceBalance
            ? 'كل زيارات هذه الخدمة محجوزة في مواعيد أخرى.'
            : 'كل الزيارات المتبقية محجوزة في مواعيد أخرى.');
        }
      }

      const availability = await evaluateRequestedInterval(tx, {
        branchId: area.zone.branchId,
        serviceId: data.serviceId,
        coverageAreaId: data.coverageAreaId,
        vehicleSize: vehicle.vehicleSize,
        addonIds: data.addonIds,
        startAt: data.startAt,
      }, now);
      if (!availability) throw new BookingInputError('الموعد لم يعد متاحًا. اختر موعدًا آخر.');

      const service = await tx.service.findUnique({
        where: { id: data.serviceId },
        include: {
          cancellationPolicy: true,
          materialRequirements: {
            orderBy: [{ required: 'desc' }, { material: { nameAr: 'asc' } }],
            select: {
              materialId: true,
              quantity: true,
              required: true,
              notes: true,
              material: { select: { nameAr: true, unit: true } },
            },
          },
        },
      });
      if (!service) throw new BookingInputError('الخدمة غير متاحة.');
      if (!service.cancellationPolicy.active) {
        throw new BookingInputError(
          'سياسة الإلغاء المرتبطة بالخدمة غير نشطة. تواصل مع الدعم قبل إتمام الحجز.',
        );
      }
      const acceptedCancellationPolicy = cancellationPolicySnapshot(
        service.cancellationPolicy,
      );
      const currentCancellationPolicyRevision = cancellationPolicyRevision(
        service.cancellationPolicy,
      );
      if (
        (data.acceptedCancellationPolicyId ?? null) !== acceptedCancellationPolicy.policyId
        || data.acceptedCancellationPolicyRevision !== currentCancellationPolicyRevision
      ) {
        throw new BookingInputError(
          'تم تحديث سياسة الإلغاء منذ فتح صفحة الحجز. حدّث الصفحة وراجع السياسة الجديدة قبل التأكيد.',
        );
      }
      if (data.useCredit) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer-credit:${customer.id}`}))`;
        currentCreditBalance = (await tx.customerProfile.findUniqueOrThrow({
          where: { id: customer.id },
          select: { creditBalance: true },
        })).creditBalance;
      }
      const scheduledEndAt = new Date(data.startAt.getTime() + availability.totalDurationMinutes * 60_000);
      const totalPrice = subscription ? availability.addonPrice : availability.totalPrice;
      const depositAmount = subscription ? availability.addonPrice : availability.depositAmount;
      const creditAppliedAmount = data.useCredit
        ? Math.min(currentCreditBalance, totalPrice)
        : 0;
      const amountDue = totalPrice - creditAppliedAmount;
      const requiredPaymentAmount = Math.max(0, Math.min(
        amountDue,
        depositAmount - creditAppliedAmount,
      ));
      const paymentStatus = requiredPaymentAmount === 0
        ? PaymentStatus.NOT_REQUIRED
        : PaymentStatus.AWAITING_PROOF;

      const booking = await tx.booking.create({
        data: {
          bookingNumber: bookingNumber(now),
          customerId: customer.id,
          branchId: area.zone.branchId,
          coverageAreaId: area.id,
          vehicleId: vehicle.id,
          serviceId: service.id,
          serviceVariantId: availability.serviceVariantId,
          subscriptionId: subscription?.id ?? null,
          startAt: data.startAt,
          endAt: scheduledEndAt,
          totalDurationMinutes: availability.totalDurationMinutes,
          basePrice: subscription ? 0 : availability.basePrice,
          addonPrice: availability.addonPrice,
          totalPrice,
          depositAmount,
          amountPaid: creditAppliedAmount,
          amountDue,
          creditAppliedAmount,
          paymentStatus,
          bookingStatus: BookingStatus.REQUEST_SUBMITTED,
          assignmentMode: area.zone.branch.assignmentMode,
          customerNotes: data.customerNotes || null,
          gateInstructions: address.gateInstructions || data.gateInstructions || null,
          locationUrl: address.locationUrl || data.locationUrl || null,
          addressSnapshot: {
            governorate: address.governorate,
            city: address.city,
            district: address.district,
            compound: address.compound,
            street: address.street,
            buildingNumber: address.buildingNumber,
            unitNumber: address.unitNumber,
            landmark: address.landmark,
          },
          vehicleSnapshot: {
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            color: vehicle.color,
            size: vehicle.vehicleSize,
            plateNumber: vehicle.plateNumber,
          },
          serviceSnapshot: {
            nameAr: service.nameAr,
            basePrice: availability.basePrice,
            durationMinutes: availability.totalDurationMinutes,
            slotCount: availability.slotCount,
            variantId: availability.serviceVariantId,
            materials: createMaterialRequirementsSnapshot(service.materialRequirements),
          },
          contactSnapshot: {
            name: data.contactName,
            phone: data.contactPhone,
            whatsapp: data.contactWhatsapp,
          },
          policyVersion: BOOKING_TERMS_VERSION,
          policyAcceptedAt: now,
          cancellationPolicyId: acceptedCancellationPolicy.policyId,
          cancellationPolicySnapshot: acceptedCancellationPolicy,
        },
      });

      if (creditAppliedAmount > 0) {
        const balanceAfter = currentCreditBalance - creditAppliedAmount;
        const creditUpdate = await tx.customerProfile.updateMany({
          where: { id: customer.id, creditBalance: currentCreditBalance },
          data: { creditBalance: balanceAfter },
        });
        if (creditUpdate.count !== 1) {
          throw new BookingInputError('تغير رصيد التعويضات بالتزامن؛ أعد المحاولة.');
        }
        await tx.customerCreditTransaction.create({
          data: {
            customerId: customer.id,
            bookingId: booking.id,
            amount: -creditAppliedAmount,
            balanceBefore: currentCreditBalance,
            balanceAfter,
            transactionType: 'BOOKING_CREDIT_APPLIED',
            idempotencyKey: `booking:${booking.id}:credit-applied`,
            reason: 'استخدام رصيد التعويضات في سداد الحجز',
            createdByUserId: user.id,
          },
        });
      }

      const holdMinutes = paymentStatus === PaymentStatus.NOT_REQUIRED
        ? PAYMENT_REVIEW_HOLD_MINUTES
        : getPositiveEnvMinutes('BOOKING_HOLD_MINUTES', DEFAULT_HOLD_MINUTES);
      await tx.bookingHold.create({
        data: {
          bookingId: booking.id,
          teamId: availability.feasibleTeamIds[0],
          slotStartTime: booking.startAt,
          slotEndTime: booking.endAt,
          expiresAt: new Date(now.getTime() + holdMinutes * 60_000),
          status: BookingHoldStatus.ACTIVE,
        },
      });

      await tx.bookingItem.createMany({
        data: [
          {
            bookingId: booking.id,
            itemType: 'SERVICE',
            sourceId: service.id,
            nameSnapshot: service.nameAr,
            unitPrice: subscription ? 0 : availability.basePrice,
            durationMinutes: availability.totalDurationMinutes - availability.addonRecords.reduce((sum, addon) => sum + addon.durationMinutes, 0),
            metadata: { variantId: availability.serviceVariantId, slotCount: availability.slotCount, subscriptionCovered: Boolean(subscription) },
          },
          ...availability.addonRecords.map((addon) => ({
            bookingId: booking.id,
            itemType: 'ADDON',
            sourceId: addon.id,
            nameSnapshot: addon.nameAr,
            unitPrice: addon.price,
            durationMinutes: addon.durationMinutes,
            metadata: { slotCount: addon.slotCount },
          })),
        ],
      });

      if (availability.addonRecords.length) {
        await tx.bookingAddon.createMany({
          data: availability.addonRecords.map((addon) => ({
            bookingId: booking.id,
            addonId: addon.id,
            price: addon.price,
            durationMinutes: addon.durationMinutes,
          })),
        });
      }

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: BookingStatus.DRAFT,
          toStatus: BookingStatus.REQUEST_SUBMITTED,
          changedByUserId: user.id,
          actorRole: user.role,
          reason: 'إنشاء طلب حجز من العميل',
        },
      });
      await tx.customerConsent.create({
        data: {
          userId: user.id,
          consentType: 'BOOKING_TERMS',
          version: BOOKING_TERMS_VERSION,
          accepted: true,
          acceptedAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: user.role,
          action: 'BOOKING_CREATED',
          entityType: 'Booking',
          entityId: booking.id,
          afterJson: {
            bookingNumber: booking.bookingNumber,
            branchId: booking.branchId,
            totalPrice: booking.totalPrice,
            creditAppliedAmount,
            cancellationPolicyId: acceptedCancellationPolicy.policyId,
            cancellationPolicyVersion: acceptedCancellationPolicy.version,
            scheduledTeamHold: availability.feasibleTeamIds[0],
          },
        },
      });

      await syncInvoiceForBooking(tx, booking, user.id);

      if (subscription) {
        await tx.subscriptionVisitLedger.create({
          data: {
            subscriptionId: subscription.id,
            bookingId: booking.id,
            action: VisitLedgerAction.BOOKING_RESERVED,
            visitChange: 0,
            balanceBefore: subscription.remainingVisits,
            remainingAfter: subscription.remainingVisits,
            idempotencyKey: `subscription:${subscription.id}:booking:${booking.id}:reserved`,
            reason: 'حجز زيارة دون خصمها حتى اكتمال الخدمة',
          },
        });
      }

      if (paymentStatus === PaymentStatus.NOT_REQUIRED) {
        await transitionBookingStatus(tx, {
          bookingId: booking.id,
          toStatus: BookingStatus.PAYMENT_VERIFIED,
          actorUserId: user.id,
          actorRole: user.role,
          reason: 'الحجز لا يتطلب دفعة مسبقة',
        });
        await transitionBookingStatus(tx, {
          bookingId: booking.id,
          toStatus: BookingStatus.AWAITING_OPERATIONS_REVIEW,
          actorUserId: user.id,
          actorRole: user.role,
          reason: 'إحالة الحجز إلى مراجعة التشغيل دون دفعة مسبقة',
        });
      } else {
        await transitionBookingStatus(tx, {
          bookingId: booking.id,
          toStatus: BookingStatus.AWAITING_PAYMENT_PROOF,
          actorUserId: user.id,
          actorRole: user.role,
          reason: 'بانتظار إثبات التحويل',
        });
      }

      return {
        id: booking.id,
        bookingNumber: booking.bookingNumber,
        depositAmount: requiredPaymentAmount,
        paymentRequired: paymentStatus !== PaymentStatus.NOT_REQUIRED,
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 20_000,
      maxWait: 10_000,
    });

    revalidatePath('/account/bookings');
    return {
      success: true,
      bookingId: result.id,
      bookingNumber: result.bookingNumber,
      depositAmount: result.depositAmount,
      paymentRequired: result.paymentRequired,
    };
  } catch (error) {
    if (error instanceof BookingInputError || error instanceof CustomerCreditError) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
      return { error: 'الموعد حُجز للتو بواسطة عميل آخر. اختر موعدًا جديدًا.' };
    }
    console.error('Booking creation failed', error);
    return { error: 'تعذر إنشاء الحجز الآن. حاول مرة أخرى.' };
  }
}

export async function uploadPaymentProofAction(formData: FormData) {
  const user = await requireRole([UserRole.CUSTOMER]);
  const parsed = uploadPaymentProofSchema.safeParse({
    bookingId: formData.get('bookingId'),
    paymentMethodId: formData.get('paymentMethodId'),
    bookingFileId: formData.get('bookingFileId'),
    senderName: formData.get('senderName'),
    senderPhoneOrAccount: formData.get('senderPhoneOrAccount'),
    referenceNumber: formData.get('referenceNumber') || '',
    amountSubmitted: formData.get('amountSubmitted'),
    transferTimestamp: formData.get('transferTimestamp') || new Date(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'راجع بيانات إثبات التحويل.' };
  }
  const data = parsed.data;
  if (data.transferTimestamp.getTime() > Date.now() + 5 * 60_000) {
    return { error: 'وقت التحويل لا يمكن أن يكون في المستقبل.' };
  }

  try {
    const proof = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hold-expiry:${data.bookingId}`}))`;
      const booking = await tx.booking.findFirst({
        where: {
          id: data.bookingId,
          deletedAt: null,
          customer: { userId: user.id },
          bookingStatus: { in: [BookingStatus.AWAITING_PAYMENT_PROOF, BookingStatus.REQUEST_SUBMITTED] },
        },
        include: {
          holds: {
            where: {
              status: BookingHoldStatus.ACTIVE,
              expiresAt: { gt: new Date() },
            },
            select: { id: true },
          },
        },
      });
      if (!booking) throw new BookingInputError('الحجز غير موجود أو لا يقبل إثبات دفع جديدًا.');
      if (!booking.holds.length) {
        const expiredAt = new Date();
        await tx.bookingHold.updateMany({
          where: { bookingId: booking.id, status: BookingHoldStatus.ACTIVE },
          data: {
            status: BookingHoldStatus.EXPIRED,
            releasedAt: expiredAt,
            releasedReason: 'انتهت مهلة رفع إثبات الدفع',
          },
        });
        await expireAwaitingPaymentBooking(tx, {
          booking,
          actor: user,
          now: expiredAt,
        });
        return { expired: true as const };
      }

      const [paymentMethod, file, pendingProof] = await Promise.all([
        tx.branchPaymentMethod.findFirst({
          where: { id: data.paymentMethodId, branchId: booking.branchId, active: true },
        }),
        tx.bookingFile.findFirst({
          where: {
            id: data.bookingFileId,
            bookingId: booking.id,
            uploadedByUserId: user.id,
            fileType: FileType.PAYMENT_PROOF,
          },
        }),
        tx.paymentProof.findFirst({
          where: { bookingId: booking.id, status: ProofStatus.UNDER_REVIEW },
        }),
      ]);
      if (!paymentMethod) throw new BookingInputError('وسيلة الدفع غير متاحة لهذا الفرع.');
      if (!file) throw new BookingInputError('إثبات التحويل غير مرتبط بهذا الحجز.');
      if (pendingProof) throw new BookingInputError('يوجد إثبات تحويل قيد المراجعة بالفعل.');

      const created = await tx.paymentProof.create({
        data: {
          bookingId: booking.id,
          paymentMethodId: paymentMethod.id,
          senderName: data.senderName,
          senderPhoneOrAccount: data.senderPhoneOrAccount,
          referenceNumber: data.referenceNumber || null,
          amountSubmitted: data.amountSubmitted,
          transferTimestamp: data.transferTimestamp,
          proofFileUrl: file.fileUrl,
          proofFileId: file.id,
          status: ProofStatus.UNDER_REVIEW,
          idempotencyKey: `payment-proof:${file.id}`,
        },
      });

      await tx.booking.update({
        where: { id: booking.id },
        data: { paymentStatus: PaymentStatus.UNDER_REVIEW },
      });
      await tx.bookingHold.updateMany({
        where: { bookingId: booking.id, status: BookingHoldStatus.ACTIVE },
        data: {
          expiresAt: new Date(Date.now() + getPositiveEnvMinutes('PAYMENT_REVIEW_HOLD_MINUTES', PAYMENT_REVIEW_HOLD_MINUTES) * 60_000),
        },
      });
      await transitionBookingStatus(tx, {
        bookingId: booking.id,
        toStatus: BookingStatus.PAYMENT_UNDER_REVIEW,
        actorUserId: user.id,
        actorRole: user.role,
        reason: 'رفع إثبات التحويل للمراجعة',
        metadata: { proofId: created.id },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          actorRole: user.role,
          action: 'PAYMENT_PROOF_UPLOADED',
          entityType: 'PaymentProof',
          entityId: created.id,
          afterJson: { bookingId: booking.id, amountSubmitted: created.amountSubmitted, fileId: file.id },
        },
      });
      return { expired: false as const, proof: created };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidatePath(`/account/bookings/${data.bookingId}`);
    revalidatePath('/operations');
    if (proof.expired) {
      return { error: 'انتهت مهلة الاحتفاظ بالموعد. اختر موعدًا جديدًا.' };
    }
    return { success: true, proofId: proof.proof.id };
  } catch (error) {
    if (error instanceof BookingInputError || error instanceof CustomerCreditError) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { error: 'تم إرسال هذا الملف من قبل.' };
    }
    console.error('Payment proof upload failed', error);
    return { error: 'تعذر إرسال إثبات التحويل.' };
  }
}
