-- Public gallery publishing is a two-party workflow: explicit customer
-- consent followed by an accountable Owner approval.
ALTER TABLE "BookingFile"
ADD COLUMN "customerGalleryConsentAt" TIMESTAMP(3),
ADD COLUMN "galleryApprovedByUserId" TEXT,
ADD COLUMN "galleryApprovedAt" TIMESTAMP(3);

CREATE INDEX "BookingFile_approvedForGallery_customerGalleryConsentAt_idx"
ON "BookingFile"("approvedForGallery", "customerGalleryConsentAt");

ALTER TABLE "BookingFile"
ADD CONSTRAINT "BookingFile_galleryApprovedByUserId_fkey"
FOREIGN KEY ("galleryApprovedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
