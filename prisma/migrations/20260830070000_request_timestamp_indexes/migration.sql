-- Keep the operational request queues ordered by the explicit customer
-- request instant without scanning historical status-row timestamps.
CREATE INDEX "BookingTimeChange_status_requestedAt_id_idx"
  ON "BookingTimeChange"("status", "requestedAt", "id");

CREATE INDEX "CancellationRequest_status_requestedAt_id_idx"
  ON "CancellationRequest"("status", "requestedAt", "id");
