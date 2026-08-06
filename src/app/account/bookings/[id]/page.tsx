import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { whatsappHref } from '@/lib/contact-links';
import { getCustomerFacingStatusLabel, isValidStatusTransition } from '@/lib/engine/state-machine';
import { Sparkles, AlertCircle, FileText, ArrowRight, MessageSquare } from 'lucide-react';
import { BookingStatus, UserRole } from '@prisma/client';
import {
  evaluateCancellationPolicyRequest,
  readCancellationPolicySnapshot,
} from '@/lib/policies/cancellation';
import BookingActionsClient from './BookingActionsClient';
import GalleryConsentForm from './GalleryConsentForm';
import CustomerRatingForm from './CustomerRatingForm';


interface BookingDetailProps {
  params: Promise<{ id: string }>;
}

export default async function BookingDetailPage({ params }: BookingDetailProps) {
  const { id } = await params;
  const user = await requireRole([UserRole.CUSTOMER]);

  const booking = await db.booking.findFirst({
    where: {
      id,
      customer: { userId: user.id },
    },
    include: {
      service: true,
      vehicle: true,
      branch: true,
      coverageArea: true,
      paymentProofs: true,
      files: true,
      cancellationRequest: true,
      complaints: { orderBy: { createdAt: 'desc' } },
      timeChanges: { orderBy: { createdAt: 'desc' } },
      refunds: { orderBy: { createdAt: 'desc' } },
      customerRating: { select: { score: true, comment: true, approvedForPublic: true } },
    },
  });

  if (!booking) {
    notFound();
  }

  const paymentMethods = await db.branchPaymentMethod.findMany({
    where: { branchId: booking.branchId, active: true },
    select: {
      id: true,
      name: true,
      accountNumber: true,
      accountName: true,
      instructions: true,
      isDefault: true,
    },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });

  const beforeFiles = booking.files.filter((f) => f.fileType === 'BEFORE_SERVICE');
  const afterFiles = booking.files.filter((f) => f.fileType === 'AFTER_SERVICE');
  const customerVisibleStatus = booking.terminalReopenSourceStatus
    ?? booking.bookingStatus;
  const terminalReviewOnly = booking.terminalReopenSourceStatus !== null;
  const canUploadPayment = !terminalReviewOnly && customerVisibleStatus === BookingStatus.AWAITING_PAYMENT_PROOF && [
    'AWAITING_PROOF',
    'REUPLOAD_REQUIRED',
    'AMOUNT_SHORT',
    'REJECTED',
    'DUPLICATE_SUSPECTED',
  ].includes(booking.paymentStatus);
  const cancellationPolicy = readCancellationPolicySnapshot(
    booking.cancellationPolicySnapshot,
  );
  const policyCheckedAt = new Date();
  const cancellationEligibility = evaluateCancellationPolicyRequest(
    cancellationPolicy,
    'CANCELLATION',
    booking.startAt,
    policyCheckedAt,
  );
  const rescheduleEligibility = evaluateCancellationPolicyRequest(
    cancellationPolicy,
    'RESCHEDULING',
    booking.startAt,
    policyCheckedAt,
  );
  const canRequestCancellation = cancellationEligibility.allowed && !booking.cancellationRequest && isValidStatusTransition(
    customerVisibleStatus,
    BookingStatus.CANCELLATION_REQUESTED,
  );
  const canRequestReschedule = rescheduleEligibility.allowed && !booking.timeChanges.some((change) => change.status === 'PENDING') && isValidStatusTransition(
    customerVisibleStatus,
    BookingStatus.RESCHEDULE_REQUESTED,
  );

  return (
    <div className="space-y-8 pb-12" dir="rtl">
        
        {/* Back Link */}
        <Link href="/account/bookings" className="inline-flex items-center gap-2 text-xs font-semibold text-[#e5c45a] hover:underline">
          <ArrowRight className="w-4 h-4" />
          <span>العودة لقائمة حجوزاتي</span>
        </Link>

        {/* Header Banner */}
        <div className="p-8 rounded-3xl glass-card border border-[#c9a227]/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
            <div>
              <span className="text-xs text-neutral-400 block">رقم الحجز:</span>
              <h1 className="text-2xl sm:text-3xl font-black text-white">{booking.bookingNumber}</h1>
            </div>
            <div className="px-4 py-2 rounded-2xl bg-[#c9a227]/20 border border-[#c9a227]/40 text-[#e5c45a] font-black text-sm text-center">
              {getCustomerFacingStatusLabel(customerVisibleStatus)}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-neutral-300">
            <div>
              <span className="text-neutral-500 block">الخدمة:</span>
              <strong className="text-white text-sm">{booking.service.nameAr}</strong>
            </div>
            <div>
              <span className="text-neutral-500 block">تاريخ الزيارة:</span>
              <strong className="text-white text-sm">{new Date(booking.startAt).toLocaleDateString('ar-EG')} - {new Date(booking.startAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</strong>
            </div>
            <div>
              <span className="text-neutral-500 block">حالة التحويل اليدوي:</span>
              <strong className="text-[#e5c45a] text-sm">{booking.paymentStatus}</strong>
            </div>
          </div>
        </div>

        {/* Payment Proof Status Card */}
        {booking.paymentProofs.length > 0 && (
          <div className="p-6 rounded-2xl bg-[#141414] border border-[#c9a227]/20 space-y-3">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#c9a227]" />
              <span>إثبات التحويل المرفوع</span>
            </h3>

            {booking.paymentProofs.map((proof) => (
              <div key={proof.id} className="p-4 rounded-xl bg-[#080808] border border-neutral-800 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">اسم المحول: {proof.senderName} ({proof.senderPhoneOrAccount})</span>
                  <span className="font-bold text-[#e5c45a]">{proof.status}</span>
                </div>
                <div className="text-neutral-400">المبلغ المدخل: {proof.amountSubmitted} ج.م | مرجع: {proof.referenceNumber || 'لا يوجد'}</div>
                {proof.reviewNotes && (
                  <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px]">
                    ملاحظة المراجع: {proof.reviewNotes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Photos Evidence Section (Before / After) */}
        {(beforeFiles.length > 0 || afterFiles.length > 0) && (
          <div className="p-6 rounded-2xl bg-[#141414] border border-[#c9a227]/20 space-y-4">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#c9a227]" />
              <span>صور توثيق الخدمة (قبل وبعد)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-xs font-bold text-neutral-400 block mb-2">صور قبل التنفيذ ({beforeFiles.length})</span>
                <div className="grid grid-cols-2 gap-2">
                  {beforeFiles.map((file) => (
                    <Image key={file.id} src={file.fileUrl} alt="صورة السيارة قبل تنفيذ الخدمة" width={480} height={320} unoptimized className="w-full h-32 object-cover rounded-xl border border-neutral-800" />
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-[#e5c45a] block mb-2">صور بعد التنفيذ ({afterFiles.length})</span>
                <div className="grid grid-cols-2 gap-2">
                  {afterFiles.map((file) => (
                    <Image key={file.id} src={file.fileUrl} alt="صورة السيارة بعد تنفيذ الخدمة" width={480} height={320} unoptimized className="w-full h-32 object-cover rounded-xl border border-[#c9a227]/30" />
                  ))}
                </div>
              </div>
            </div>
            <GalleryConsentForm
              bookingId={booking.id}
              fileCount={beforeFiles.length + afterFiles.length}
              hasConsent={[...beforeFiles, ...afterFiles].every((file) => Boolean(file.customerGalleryConsentAt))}
            />
          </div>
        )}

        {/* Simple Receipt Section */}
        <div className="p-6 rounded-2xl bg-[#141414] border border-neutral-800 space-y-4">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#c9a227]" />
            <span>إيصال الحجز الإلكتروني</span>
          </h3>

          <div className="space-y-2 text-xs text-neutral-300 p-4 rounded-xl bg-[#080808]">
            <div className="flex justify-between border-b border-neutral-800 pb-2">
              <span>سعر الخدمة الأساسي:</span>
              <span>{booking.basePrice} ج.م</span>
            </div>
            {booking.addonPrice > 0 && (
              <div className="flex justify-between border-b border-neutral-800 pb-2">
                <span>الإضافات:</span>
                <span>+{booking.addonPrice} ج.م</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-sm text-[#e5c45a] pt-2">
              <span>المبلغ الإجمالي النهائي:</span>
              <span>{booking.totalPrice} ج.م</span>
            </div>
          </div>
        </div>

        {/* Cancellation Request Section */}
        {booking.cancellationRequest && (
          <div className="p-6 rounded-2xl bg-[#141414] border border-amber-500/30 space-y-3">
            <h3 className="font-bold text-sm text-amber-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>طلب الإلغاء / الاسترداد الحالي</span>
            </h3>
            <div className="p-4 rounded-xl bg-[#080808] text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-neutral-400">السبب: {booking.cancellationRequest.reason}</span>
                <span className="font-bold text-amber-400">{booking.cancellationRequest.status}</span>
              </div>
              <p className="text-neutral-400">الإجراء المفضل: {{
                REFUND: 'استرداد نقدي',
                RESCHEDULE: 'إعادة جدولة',
                CREDIT: 'رصيد حساب',
              }[booking.cancellationRequest.preferredAction] ?? booking.cancellationRequest.preferredAction}</p>
              {booking.cancellationRequest.resolutionNotes && (
                <p className="text-emerald-400 pt-1">رد الإدارة: {booking.cancellationRequest.resolutionNotes}</p>
              )}
            </div>
          </div>
        )}

        {(
          customerVisibleStatus === BookingStatus.SERVICE_COMPLETED
          || customerVisibleStatus === BookingStatus.DELIVERED
          || customerVisibleStatus === BookingStatus.CLOSED
        ) ? (
          <CustomerRatingForm bookingId={booking.id} rating={booking.customerRating} />
        ) : null}

        {(booking.timeChanges.length > 0 || booking.complaints.length > 0 || booking.refunds.length > 0) && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-5"><span className="text-xs text-neutral-500">طلبات تعديل الموعد</span><strong className="mt-2 block text-2xl text-white">{booking.timeChanges.length}</strong>{booking.timeChanges[0] && <span className="text-xs text-[#e5c45a]">{booking.timeChanges[0].status}</span>}</div>
            <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-5"><span className="text-xs text-neutral-500">الشكاوى المسجلة</span><strong className="mt-2 block text-2xl text-white">{booking.complaints.length}</strong>{booking.complaints[0] && <span className="text-xs text-[#e5c45a]">{booking.complaints[0].status}</span>}</div>
            <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-5"><span className="text-xs text-neutral-500">عمليات الاسترداد</span><strong className="mt-2 block text-2xl text-white">{booking.refunds.length}</strong>{booking.refunds[0] && <span className="text-xs text-[#e5c45a]">{booking.refunds[0].status}</span>}</div>
          </div>
        )}

        <BookingActionsClient
          bookingId={booking.id}
          customerName={user.fullName}
          customerPhone={user.phone}
          paymentMethods={paymentMethods.map((method) => ({
            id: method.id,
            name: method.name,
            accountNumber: method.accountNumber,
            accountName: method.accountName,
            instructions: method.instructions,
          }))}
          paymentAmount={Math.max(1, Math.min(booking.amountDue, Math.max(0, booking.depositAmount - booking.amountPaid)))}
          canUploadPayment={canUploadPayment}
          canRequestCancellation={canRequestCancellation}
          canRequestReschedule={canRequestReschedule}
          canPreferReschedule={rescheduleEligibility.allowed}
          canCreateComplaint={true}
        />

        {/* WhatsApp Support Button */}
        <div className="text-center pt-4">
          <a
            href={whatsappHref(booking.branch.whatsapp, `استفسار بخصوص الحجز رقم ${booking.bookingNumber}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#141414] border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs font-bold transition-colors"
          >
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <span>تواصل مع {booking.branch.nameAr} عبر WhatsApp</span>
          </a>
        </div>

    </div>
  );
}
