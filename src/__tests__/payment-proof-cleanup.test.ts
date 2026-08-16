import { describe, expect, it, vi } from 'vitest';
import { FileType, type Prisma } from '@prisma/client';
import { purgePaymentProofReceiptsForBooking } from '@/lib/engine/payment-proof-cleanup';
import * as uploadModule from '@/lib/upload';

describe('Payment Proof Receipt Purging on Booking Acceptance (حذف صورة إيصال التحويل تلقائيًا بعد قبول الحجز)', () => {
  it('unlinks payment proofs, deletes physical files, and removes BookingFile records', async () => {
    const deleteUploadedFileSpy = vi.spyOn(uploadModule, 'deleteUploadedFile').mockResolvedValue(true);

    const mockBookingFiles = [
      {
        id: 'file-1',
        fileUrl: '/api/files/payment-proofs/receipt-123.jpg',
        sizeBytes: 250_000,
      },
    ];

    const mockTx = {
      bookingFile: {
        findMany: vi.fn().mockResolvedValue(mockBookingFiles),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      paymentProof: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as Prisma.TransactionClient;

    const result = await purgePaymentProofReceiptsForBooking(mockTx, 'booking-abc');

    // 1. Should query payment proof files for this booking
    expect(mockTx.bookingFile.findMany).toHaveBeenCalledWith({
      where: {
        bookingId: 'booking-abc',
        fileType: FileType.PAYMENT_PROOF,
      },
      select: {
        id: true,
        fileUrl: true,
        sizeBytes: true,
      },
    });

    // 2. Should unlink payment proof records to satisfy foreign keys
    expect(mockTx.paymentProof.updateMany).toHaveBeenCalledWith({
      where: { bookingId: 'booking-abc' },
      data: {
        proofFileId: null,
        proofFileUrl: '[PURGED_AFTER_ACCEPTANCE]',
      },
    });

    // 3. Should invoke physical file deletion with extracted subDirectory and filename
    expect(deleteUploadedFileSpy).toHaveBeenCalledWith('payment-proofs', 'receipt-123.jpg');

    // 4. Should delete database records from bookingFile
    expect(mockTx.bookingFile.deleteMany).toHaveBeenCalledWith({
      where: {
        bookingId: 'booking-abc',
        fileType: FileType.PAYMENT_PROOF,
      },
    });

    // 5. Result stats
    expect(result.deletedFilesCount).toBe(1);
    expect(result.purgedSizeBytes).toBe(250_000);

    deleteUploadedFileSpy.mockRestore();
  });
});
