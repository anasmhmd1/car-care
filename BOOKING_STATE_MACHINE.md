# Bareeq Booking State Machine

The canonical graph is `src/lib/engine/state-machine.ts`. State-changing workflows should call `transitionBookingStatus` in `src/lib/engine/transition.ts` so the booking update, validation, status history, audit entry, and subscription effect (when applicable) occur in one transaction.

Repeated transitions are rejected. A value existing in the `BookingStatus` enum does not make an arbitrary transition legal.

## 1. Normal paid booking path

```text
DRAFT
  -> REQUEST_SUBMITTED
  -> AWAITING_PAYMENT_PROOF
  -> PAYMENT_UNDER_REVIEW
  -> PAYMENT_VERIFIED
  -> AWAITING_OPERATIONS_REVIEW
  -> ACCEPTED
  -> ASSIGNED (or AWAITING_ASSIGNMENT / ADMIN_REVIEW_REQUIRED)
  -> TEAM_ACKNOWLEDGED
  -> ON_THE_WAY
  -> ARRIVED
  -> IN_SERVICE
  -> QUALITY_REVIEW
  -> SERVICE_COMPLETED
  -> DELIVERED
  -> CLOSED
```

The create action writes the persisted booking as `REQUEST_SUBMITTED` and adds a history row from `DRAFT`. A booking that needs no initial payment—including one whose selected Customer credit covers the server-calculated upfront requirement—moves directly through `PAYMENT_VERIFIED` to `AWAITING_OPERATIONS_REVIEW` with `PaymentStatus.NOT_REQUIRED`.

Payment verification and operational acceptance are deliberately separate. A verified payment cannot bypass the operations review.

## 2. Complete transition table

| Current status | Allowed next statuses |
|---|---|
| `DRAFT` | `REQUEST_SUBMITTED`, `EXPIRED`, `CANCELLED` |
| `REQUEST_SUBMITTED` | `AWAITING_PAYMENT_PROOF`, `PAYMENT_UNDER_REVIEW`, `PAYMENT_VERIFIED`, `REJECTED`, `CANCELLATION_REQUESTED`, `EXPIRED` |
| `AWAITING_PAYMENT_PROOF` | `PAYMENT_UNDER_REVIEW`, `REJECTED`, `CANCELLATION_REQUESTED`, `EXPIRED` |
| `PAYMENT_UNDER_REVIEW` | `PAYMENT_VERIFIED`, `AWAITING_PAYMENT_PROOF`, `REJECTED`, `CANCELLATION_REQUESTED` |
| `PAYMENT_VERIFIED` | `AWAITING_OPERATIONS_REVIEW` |
| `AWAITING_OPERATIONS_REVIEW` | `ACCEPTED`, `REJECTED`, `RESCHEDULE_REQUESTED`, `CANCELLATION_REQUESTED` |
| `ACCEPTED` | `AWAITING_ASSIGNMENT`, `ASSIGNED`, `RESCHEDULE_REQUESTED`, `CANCELLATION_REQUESTED` |
| `AWAITING_ASSIGNMENT` | `ASSIGNED`, `ADMIN_REVIEW_REQUIRED`, `RESCHEDULE_REQUESTED`, `CANCELLATION_REQUESTED` |
| `ASSIGNED` | `TEAM_ACKNOWLEDGED`, `AWAITING_ASSIGNMENT`, `RESCHEDULE_REQUESTED`, `CANCELLATION_REQUESTED` |
| `TEAM_ACKNOWLEDGED` | `ON_THE_WAY`, `EXECUTION_FAILED`, `CUSTOMER_NO_SHOW`, `ACCESS_DENIED` |
| `ON_THE_WAY` | `ARRIVED`, `EXECUTION_FAILED`, `CUSTOMER_NO_SHOW`, `ACCESS_DENIED` |
| `ARRIVED` | `IN_SERVICE`, `CUSTOMER_NO_SHOW`, `ACCESS_DENIED`, `EXECUTION_FAILED` |
| `IN_SERVICE` | `QUALITY_REVIEW`, `EXECUTION_FAILED` |
| `QUALITY_REVIEW` | `SERVICE_COMPLETED`, `IN_SERVICE` |
| `SERVICE_COMPLETED` | `DELIVERED` |
| `DELIVERED` | `CLOSED` |
| `CLOSED` | None |
| `RESCHEDULE_REQUESTED` | `AWAITING_OPERATIONS_REVIEW`, `ACCEPTED`, `AWAITING_ASSIGNMENT`, `ASSIGNED`, `ADMIN_REVIEW_REQUIRED`, `CANCELLATION_REQUESTED` |
| `CANCELLATION_REQUESTED` | `REQUEST_SUBMITTED`, `AWAITING_PAYMENT_PROOF`, `PAYMENT_UNDER_REVIEW`, `PAYMENT_VERIFIED`, `AWAITING_OPERATIONS_REVIEW`, `CANCELLED`, `ACCEPTED`, `AWAITING_ASSIGNMENT`, `ASSIGNED`, `ADMIN_REVIEW_REQUIRED`, `RESCHEDULE_REQUESTED` |
| `CANCELLED` | None |
| `REJECTED` | None |
| `EXECUTION_FAILED` | `ADMIN_REVIEW_REQUIRED`, `RESCHEDULE_REQUESTED`, `CANCELLATION_REQUESTED` |
| `CUSTOMER_NO_SHOW` | `ADMIN_REVIEW_REQUIRED`, `RESCHEDULE_REQUESTED`, `CANCELLATION_REQUESTED` |
| `ACCESS_DENIED` | `ADMIN_REVIEW_REQUIRED`, `RESCHEDULE_REQUESTED`, `CANCELLATION_REQUESTED` |
| `ADMIN_REVIEW_REQUIRED` | `ACCEPTED`, `AWAITING_ASSIGNMENT`, `ASSIGNED`, `CANCELLATION_REQUESTED`, `REJECTED` |
| `EXPIRED` | None |

## 3. Transition guards

The transition service evaluates evidence in addition to the graph:

- A non-empty reason is required when the target is `REJECTED`, `RESCHEDULE_REQUESTED`, `CANCELLATION_REQUESTED`, `CANCELLED`, `EXECUTION_FAILED`, `CUSTOMER_NO_SHOW`, `ACCESS_DENIED`, or `ADMIN_REVIEW_REQUIRED`.
- `PAYMENT_VERIFIED`, `AWAITING_OPERATIONS_REVIEW`, and `ACCEPTED` require payment status `NOT_REQUIRED`, `VERIFIED`, `PARTIALLY_PAID`, or `FULLY_PAID`.
- `ASSIGNED` and every later delivery/closure state require an assigned team.
- An Employee moving through team execution targets must belong to the assigned team.
- Checklist/photo mutations are stage-gated as well as team-gated: `TEAM_PREPARATION` is editable from `TEAM_ACKNOWLEDGED` through `ARRIVED`; `ARRIVAL_INSPECTION` and before/damage images require `ARRIVED`; `SERVICE_EXECUTION`, `CLOSING`, and during/after images require `IN_SERVICE`. Closed or future stages cannot be pre-filled.
- `IN_SERVICE` requires completed `TEAM_PREPARATION` and `ARRIVAL_INSPECTION` checklist stages and the service's minimum before-photo count; only `BEFORE_SERVICE` records with an image MIME count.
- `QUALITY_REVIEW` requires completed `TEAM_PREPARATION`, `ARRIVAL_INSPECTION`, `SERVICE_EXECUTION`, and `CLOSING` stages and the minimum after-photo count; only `AFTER_SERVICE` image records count.
- A stored `completedAt` flag is not trusted by itself: each guarded transition rechecks every currently active required item and its `requiresPhoto`/`requiresNote` evidence. Checklist-stage/result uniqueness is also enforced in PostgreSQL.
- `SERVICE_COMPLETED` requires an approved quality review that was not returned to the team.
- `CLOSED` requires `amountDue === 0`.
- The explicit manager-override close is not a generic guard bypass. It requires Operations Manager/Owner role, `booking.override_close`, branch scope, a reason, `IN_SERVICE` or `QUALITY_REVIEW`, an assigned team, and zero balance. It may bypass only execution/closing checklist evidence, minimum after photos, and quality approval; subscription completion and all preserved financial/team constraints still run and are audited.

Role, fine-permission, branch, ownership, and assigned-team checks happen before/around this domain guard in each server action. Passing the graph alone does not confer authorization.

## 4. Payment proof and hold behavior

When `useCredit` is selected, booking creation applies `min(CustomerProfile.creditBalance, totalPrice)` inside the booking transaction. It stores the amount in `Booking.creditAppliedAmount`, reduces `creditBalance`, appends a negative idempotent `CustomerCreditTransaction`, initializes `amountPaid` with that credit, and reduces `amountDue` and the required upfront transfer. The browser estimate is informational; the server balance and quote are authoritative.

Booking creation reserves one feasible team with an `ACTIVE` hold. Default windows are:

- `BOOKING_HOLD_MINUTES=30` while waiting for an initial proof;
- `PAYMENT_REVIEW_HOLD_MINUTES=1440` after proof upload;
- `OPERATIONS_REVIEW_HOLD_MINUTES=1440` after payment verification;
- `RESCHEDULE_HOLD_MINUTES=1440` for calendar rescheduling.

All are positive-minute configuration values except the separate customer reschedule review path, which currently uses a fixed 1,440-minute window.

If the initial hold has expired when the Customer tries to attach proof, a shared transaction/lock marks the booking `EXPIRED`, returns any `creditAppliedAmount` through one idempotent terminal-credit key, releases any subscription reservation, and expires/releases the hold. Availability calculation runs the same reconciliation. Manual hold release while still awaiting proof uses this settlement too; release during payment/operations review frees capacity but preserves the pending booking and its financial/subscription rights. Proof decisions are:

- Verify: under `capacity:<branchId>` revalidate the stored appointment and create/extend a live hold first; lost capacity aborts without payment mutations. Then create an idempotent cash `Payment`, recompute `amountPaid` as applied credit plus verified cash (capped at the booking total), recompute `amountDue`, and move to payment and operations review states.
- Reject, amount short, duplicate suspected, or re-upload required: update proof/payment status and return the booking to `AWAITING_PAYMENT_PROOF` with a reason.

Balance collection is a later execution action, not an arbitrary booking adjustment. It is idempotent and recalculated from the immutable cash `Payment` ledger plus applied credit; it is accepted only for `ARRIVED`, `IN_SERVICE`, `QUALITY_REVIEW`, `SERVICE_COMPLETED`, or `DELIVERED`, and cannot exceed the remaining due amount.

## 5. Assignment paths

After operational acceptance, the assignment engine attempts automatic/manual assignment using the same availability constraints used for slot selection. A successful assignment records `BookingAssignment`, assignment history, consumes/converts the hold as appropriate, and moves to `ASSIGNED`.

If no team is feasible, the booking moves through `AWAITING_ASSIGNMENT` and may require `ADMIN_REVIEW_REQUIRED`. Manual reassignment and calendar rescheduling revalidate capability, zone, time off, capacity, travel buffers, and overlap under database locks.

## 6. Cancellation and restoration

Customer cancellation does not jump directly to `CANCELLED`. It creates one `CancellationRequest`, preserves `previousBookingStatus`, and moves to `CANCELLATION_REQUESTED`.

The request evaluates the immutable cancellation-policy snapshot accepted with that booking. It rejects cancellation when `allowsCancellation=false`, rejects a `preferredAction=RESCHEDULE` when `allowsRescheduling=false`, applies the service-specific `noticeHours`, and rejects a late request when `allowsLateRequests=false`; the final financial resolution remains an explicit operations decision. Operations approval repeats the same capability/window decision against the request's original `createdAt` rather than the later review time. A guarded standard fallback covers only legacy/invalid snapshots, and catalog edits never rewrite old bookings.

- Rejection restores the preserved state when it is still valid.
- Approval moves to `CANCELLED`, releases active holds/assignments, releases a subscription reservation, and records a balanced financial resolution: full/partial/no refund, Customer credit, retained deposit, or visit fee. The stored cash-refund + credit + retained portions must equal the full `amountPaid` and cannot overlap. Cash refund cannot exceed `amountPaid - creditAppliedAmount`; applied credit is returned only through an idempotent positive credit-ledger entry when the selected settlement policy calls for credit.
- Paid cases may require an idempotent refund record followed by a separately authorized approval from an Operations Manager/Owner/System Admin with `refund.approve` and branch access.
- A booking rejected during operations review uses the same financial invariants: a full-return `CancellationRequest` is created, the credit portion is restored, a subscription reservation is released, and any cash portion remains `APPROVED_REFUND_PENDING` until the ordinary refund proof/approval steps finish. Payment status is based on total returned value, so cash-plus-credit settlements are not misclassified.
- Administrative override exists for a case that cannot complete through the ordinary path and requires a recorded reason.

## 7. Rescheduling

A Customer request first passes the snapshotted policy's `allowsRescheduling` and notice/late-request rules, then creates `BookingTimeChange` with the old and requested interval and moves to `RESCHEDULE_REQUESTED`. Approval runs a fresh availability check under `reschedule:<bookingId>` and `capacity:<branchId>` advisory locks, updates the interval/assignment/hold/history, and marks the time-change row approved. Rejection restores the prior operational state with review notes.

Calendar drag/drop is not a client-only move. It opens a confirmation dialog and the server repeats permission, branch scope, booking-state, team, availability, travel, and overlap checks before committing an approved `BookingTimeChange` and audit trail.

## 8. Execution failures and quality return

`EXECUTION_FAILED`, `CUSTOMER_NO_SHOW`, and `ACCESS_DENIED` require a reason and lead to `ADMIN_REVIEW_REQUIRED`, rescheduling, or cancellation. They are not silent terminal outcomes.

A rejected quality review sends `QUALITY_REVIEW -> IN_SERVICE` and records the return. Only an approved review allows `SERVICE_COMPLETED`.

## 9. Subscription payment lifecycle and visit timing

A Customer subscription request resolves an eligible active branch on the server: the most recent eligible booking branch first, otherwise the first eligible branch ordered by code/id. It rejects another pending, frozen, or unexpired active subscription for the same plan, snapshots the price and validity duration, creates the visit balance/`PURCHASE` ledger entry, and starts in `PENDING_PAYMENT`.

The Customer uploads a private proof against an active payment method belonging to that branch. A newer upload marks older still-`UNDER_REVIEW` proofs as `REUPLOAD_REQUIRED`. A branch-authorized Operations Manager, Owner, or System Admin with `subscription.manage` records a reason and chooses approve, reject, re-upload, or duplicate; an approval with a non-exact amount becomes `AMOUNT_MISMATCH`. Activation is separate and requires the latest proof to be `APPROVED`, the amount to equal `purchasePrice`, and the payment method to belong to the subscription branch. Activation starts the term from that moment using the validity-duration snapshot captured at purchase.

An `ACTIVE` subscription whose `endDate` has passed is changed lazily to `EXPIRED` before relevant customer, administration, and report reads. The optimistic status update and audit append occur in one transaction, preventing duplicate concurrent expiry effects.

A subscription booking creates `BOOKING_RESERVED` with `visitChange=0`; reservation alone does not decrement the balance, but it does reduce spendable visit capacity so manual adjustments cannot consume visits promised to open bookings. `SERVICE_COMPLETED` applies `BOOKING_COMPLETED` exactly once and decrements one visit. Cancellation/release restores a visit only if a completion deduction actually exists, preventing a pre-service cancellation from increasing the balance.

## 10. Terminal statuses and administrative reopening

`CLOSED`, `CANCELLED`, `REJECTED`, and `EXPIRED` have no ordinary outgoing transitions in the canonical graph. Owner alone has a separate, serializable administrative action that requires a reason and moves one of those terminal states to `ADMIN_REVIEW_REQUIRED` under `booking-terminal-reopen:<bookingId>` lock, persisting `terminalReopenSourceStatus` and `terminalReopenedAt`. While marked, all normal transitions and assignment/execution are review-only; refund record/approve/Owner override and hold release take the same lock and refuse mutation, operational queues exclude the row, and Customer views show the effective source terminal state with no actions. Owner closes the review with a reason, restores the exact source status, clears the marker, and appends `BOOKING_TERMINAL_REVIEW_CLOSED`. Refund/payment/credit values, assignment, holds without reactivation, and subscription visit ledger remain untouched throughout.
