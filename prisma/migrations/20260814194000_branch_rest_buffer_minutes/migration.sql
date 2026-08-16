-- Add restBufferMinutes column to Branch to allow configuring rest time between slots/bookings
ALTER TABLE "Branch" ADD COLUMN "restBufferMinutes" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Branch"
  ADD CONSTRAINT "Branch_restBufferMinutes_check" CHECK ("restBufferMinutes" >= 0);
