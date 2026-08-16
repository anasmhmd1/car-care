import { FileType, Prisma } from '@prisma/client';
import { deleteUploadedFile } from '@/lib/upload';

/**
 * Automatically deletes payment receipt images and BookingFile records
 * upon booking acceptance to optimize disk space and database storage.
 */
export async function purgePaymentProofReceiptsForBooking(
  tx: Prisma.TransactionClient,
  bookingId: string,
): Promise<{ deletedFilesCount: number; purgedSizeBytes: number }> {
  // 1. Fetch payment proof files associated with this booking
  const files = await tx.bookingFile.findMany({
    where: {
      bookingId,
      fileType: FileType.PAYMENT_PROOF,
    },
    select: {
      id: true,
      fileUrl: true,
      sizeBytes: true,
    },
  });

  // 2. Disconnect/unlink payment proof records first to avoid foreign key errors
  await tx.paymentProof.updateMany({
    where: { bookingId },
    data: {
      proofFileId: null,
      proofFileUrl: '[PURGED_AFTER_ACCEPTANCE]',
    },
  });

  // 3. Delete physical files from disk storage
  let purgedSizeBytes = 0;
  for (const file of files) {
    purgedSizeBytes += file.sizeBytes ?? 0;
    try {
      const parts = file.fileUrl.split('/api/files/');
      if (parts[1]) {
        const [subDir, ...rest] = parts[1].split('/');
        const fileName = rest.join('/');
        if (subDir && fileName) {
          await deleteUploadedFile(subDir, fileName);
        }
      }
    } catch (err) {
      console.warn(`[Receipt Cleanup] Failed to delete file: ${file.fileUrl}`, err);
    }
  }

  // 4. Delete the BookingFile records from the database
  const deleteResult = await tx.bookingFile.deleteMany({
    where: {
      bookingId,
      fileType: FileType.PAYMENT_PROOF,
    },
  });

  return {
    deletedFilesCount: deleteResult.count,
    purgedSizeBytes,
  };
}
