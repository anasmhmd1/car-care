-- Distributed rate limits and account lockouts shared by every app instance.
-- Only an HMAC digest of the identifier is stored; raw phone numbers/IPs are
-- deliberately excluded from this operational table.
CREATE TABLE "SecurityThrottle" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityThrottle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SecurityThrottle_keyHash_key" ON "SecurityThrottle"("keyHash");
CREATE INDEX "SecurityThrottle_action_windowStartedAt_idx" ON "SecurityThrottle"("action", "windowStartedAt");
CREATE INDEX "SecurityThrottle_lockedUntil_idx" ON "SecurityThrottle"("lockedUntil");
