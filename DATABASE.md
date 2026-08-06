# Bareeq Database and Migration Guide

The canonical data model is `prisma/schema.prisma`. It targets PostgreSQL and currently contains 67 models and 19 enums. Prisma migrations—not `prisma db push`—are the deployment contract.

## 1. Connection variables

Prisma reads two URLs:

- `DATABASE_URL`: application/runtime connection. It may point to a compatible pool.
- `DIRECT_URL`: direct PostgreSQL connection used for migrations and schema inspection.

For a local PostgreSQL instance they may be identical. Migration credentials must be able to create the `pgcrypto` and `btree_gist` extensions used by the integrity migration.

## 2. Data conventions

- IDs are UUID strings unless a deterministic seed ID is intentionally supplied.
- Operational timestamps are stored as PostgreSQL timestamps and handled as UTC instants. Each branch stores an IANA timezone; current reporting defaults to `Africa/Cairo`.
- Scheduling intervals are half-open: `[startAt, endAt)`. A job ending exactly when another starts does not overlap.
- Prices, paid/due balances, refunds, and stored before/after balances are non-negative integers; ledger delta fields such as credit and visit changes may be signed. The current UI and seed interpret money as whole EGP values (no decimal currency arithmetic).
- User and Booking use soft-delete fields. Most evidence and financial relations use `Restrict` rather than destructive cascade deletion.
- Booking address, vehicle, service, contact, items, price, policy acceptance, and cancellation-policy values are snapshotted so later catalog/profile edits do not rewrite the commercial record.

## 3. Domain model map

### Identity, governance, security, and audit (12)

`BrandSettings`, `User`, `Role`, `Permission`, `UserPermission`, `Session`, `PasswordResetRequest`, `CustomerConsent`, `SecurityThrottle`, `AuditLog`, `SecurityEvent`, `AppSetting`.

- `BrandSettings.singletonKey` enforces one brand settings row and stores the global branch limit.
- `Session` stores only the SHA-256 hash of a signed cookie token plus revocation/security state.
- `PasswordResetRequest` is a manual recovery queue with pending/resolved/rejected state, accountable handler/completion fields, and only a bcrypt hash—not the temporary plaintext—when resolved.
- `Role.permissions` stores role configuration; `UserPermission` adds scoped `GRANT` or `DENY` overrides.
- `CustomerConsent` stores consent type, version, acceptance time, IP/user agent, and optional revocation.
- `SecurityThrottle` stores only an HMAC digest of each rate-limit/lockout key plus its action, counter, window, and optional lock expiry. PostgreSQL advisory locks serialize counter updates across application replicas.
- `AuditLog.branchId` is derived on insert by a PostgreSQL trigger from the referenced booking/branch/workforce/subscription entity (or validated metadata), allowing an Operations Manager's audit view to remain branch-scoped without trusting a client-supplied branch ID.

### Branches, coverage, and workforce (16)

`Branch`, `BranchMembership`, `BranchRequest`, `BranchPaymentMethod`, `CoverageZone`, `CoverageArea`, `ZoneTravelTime`, `BranchWorkingHours`, `BranchBlackoutDate`, `Team`, `TeamZone`, `TeamMember`, `TeamCapability`, `TeamTimeOff`, `TeamWorkingHours`, `EmployeeTimeOff`.

These records are the operating inputs consumed by availability and assignment: branch state/capacity, coverage, weekly hours/breaks, closures, travel matrix, team zones/capabilities/member count, and time off.

### Catalog and checklist definitions (8)

`Service`, `CancellationPolicy`, `BranchService`, `ServiceVariant`, `ServiceAddon`, `ServiceAddonLink`, `ChecklistTemplate`, `ChecklistTemplateItem`.

`BranchService` provides per-branch activation, booking, price, and duration overrides. Services carry deposit/full-prepayment rules, team size, slot demand, subscription eligibility, minimum photo counts, and one reusable cancellation policy. The selected policy's version, notice window, cancellation/rescheduling/late-request switches, and Arabic text are copied to `Booking.cancellationPolicySnapshot` at acceptance time.

### Customer records (3)

`CustomerProfile`, `Vehicle`, `CustomerAddress`.

`CustomerProfile.creditBalance` is the current credit balance; every applied booking credit is an atomic negative `CustomerCreditTransaction`, while approved cancellation credit is an atomic positive transaction. The append-only ledger carries idempotency and before/after balances.

### Booking, scheduling, and execution (12)

`Booking`, `BookingItem`, `BookingAddon`, `BookingHold`, `BookingAssignment`, `BookingAssignmentHistory`, `BookingStatusHistory`, `BookingTimeChange`, `BookingNote`, `BookingChecklistInstance`, `BookingChecklistItemResult`, `BookingFile`.

- `BookingHold` reserves a candidate team during payment/review/reschedule.
- `Booking.terminalReopenSourceStatus` and `terminalReopenedAt` mark a review-only administrative reopen; a database check requires the visible state to be `ADMIN_REVIEW_REQUIRED` and the source to be terminal.
- `BookingAssignmentHistory`, `BookingStatusHistory`, and `BookingTimeChange` retain who changed what and why.
- `BookingChecklistItemResult` stores the item label and execution evidence at the time of work.
- `BookingFile` is the authorization anchor for physical evidence; a file without a matching record is not served. Public before/after publication additionally requires a Customer consent timestamp and an Owner approval actor/timestamp.

### Payments, cases, and quality (9)

`PaymentProof`, `PaymentReview`, `Payment`, `Refund`, `CustomerCreditTransaction`, `CancellationRequest`, `Complaint`, `ComplaintEvidence`, `QualityReview`.

Payment proof review and the resulting `Payment` are distinct records. `Booking.creditAppliedAmount` snapshots how much Customer credit was consumed at creation; `amountPaid` combines that credit with later verified cash, while `amountDue` is capped at zero. Later balance collection is reconstructed from `Payment` rows rather than trusting the cached totals. Refund recording and approval are distinct fields/actions. Cancellation/rejection settlement stores cash refund, credit, and retained portions separately; together they must account for the full paid amount, and cash refund cannot exceed actual cash paid. Proof, refund, cancellation, and complaint evidence can be tied directly to `BookingFile` records.

### Subscriptions (7)

`SubscriptionPlan`, `SubscriptionPlanBranch`, `SubscriptionPlanService`, `CustomerSubscription`, `SubscriptionPaymentProof`, `SubscriptionVehicle`, `SubscriptionVisitLedger`.

`CustomerSubscription.purchasePrice` snapshots the plan price, while its initial start/end interval preserves the purchased validity duration that is restarted at activation. `SubscriptionPaymentProof` stores the branch payment method, private file URL/MIME/size, submitted amount, optional reference/time, review status, reviewer/time, and notes. Newer uploads supersede still-pending proofs; activation requires the latest proof to be approved for the exact snapshotted price and a payment method belonging to the subscription branch. The visit ledger distinguishes purchase, reservation, completion deduction, cancellation restoration, and manual adjustment. Unique keys prevent the same booking/action pair from being applied twice.

## 4. Enums

The 19 enums are:

`UserRole`, `VehicleSize`, `AssignmentMode`, `BranchStatus`, `PaymentMethodType`, `PaymentStatus`, `BookingStatus`, `ChecklistStage`, `FileType`, `ProofStatus`, `PermissionEffect`, `BookingHoldStatus`, `TimeChangeStatus`, `SubscriptionStatus`, `SubscriptionPaymentProofStatus`, `VisitLedgerAction`, `BranchRequestStatus`, `ComplaintStatus`, and `RefundStatus`.

`SubscriptionPaymentProofStatus` contains `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `AMOUNT_MISMATCH`, `REUPLOAD_REQUIRED`, and `DUPLICATE_SUSPECTED`.

See [BOOKING_STATE_MACHINE.md](BOOKING_STATE_MACHINE.md) for canonical booking transitions; enum membership alone does not authorize a transition.

## 5. Committed migrations

| Migration | Purpose |
|---|---|
| `20260801000000_initial_schema` | Initial domain tables, enums, indexes, and relations |
| `20260801010000_production_integrity` | Production fields/models, `pgcrypto`/`btree_gist`, checks, idempotency indexes, overlap exclusions, append-only audit/security triggers |
| `20260801020000_booking_consent_snapshot` | Booking contact snapshot plus policy version and acceptance timestamp |
| `20260801030000_case_finance_integrity` | Private evidence links, customer credit ledger, complaint evidence, refund timestamp, financial checks and append-only credit trigger |
| `20260801040000_persistent_security_throttles` | Shared PostgreSQL rate-limit/login-lockout counters keyed by HMAC digests |
| `20260801050000_gallery_consent_approval` | Customer gallery-consent timestamp and accountable Owner approval fields/indexes on booking evidence |
| `20260801060000_checklist_stage_integrity` | Consolidates duplicate templates/instances/results and enforces one service-stage template, one booking-stage instance, and one result per instance/item |
| `20260801065000_cancellation_settlement` | Adds explicit retained and Customer-credit portions so every paid cancellation decision balances against the amount paid |
| `20260801070000_subscription_payment_proofs` | Snapshots subscription purchase price and adds private, reviewable subscription payment proofs with status, amount/file constraints, indexes, and accountable user/payment-method relations |
| `20260801080000_branch_scoped_audit_permissions` | Adds `audit.view`/`employee.manage`, derives and backfills `AuditLog.branchId` through a trusted relationship trigger, indexes it, and restores append-only protection after the migration backfill |
| `20260801090000_booking_manager_override_permission` | Adds non-delegatable `booking.override_close` plus terminal-review source/time markers, check constraint, and index |
| `20260801091000_service_cancellation_policy` | Adds reusable service cancellation policies, a single active default invariant, required Service backfill, and immutable Booking policy snapshots |

Apply and inspect them with:

```bash
npm run db:generate
npm run db:migrate:deploy
npm run db:migrate:status
```

Use the following only while authoring a reviewed schema change in development:

```bash
npm run db:migrate:dev -- --name descriptive_change_name
```

Do not edit a migration that has already been applied. Add a forward migration instead.

## 6. Database-level integrity

Application validation is reinforced by PostgreSQL:

- Check constraints cover branch/team capacities, valid weekdays, service values, booking/hold time order, non-negative booking amounts and subscription purchase prices, positive payment/refund/subscription-proof amounts and proof sizes, credit balance arithmetic, and subscription visit arithmetic.
- Unique keys enforce user phone/email, branch code, service slug, cancellation-policy code and single-default identity, role/permission codes, session token hash, checklist service/stage and booking/stage/result identity, booking-proof/payment/refund/credit idempotency, subscription-proof file URL, and subscription booking/action idempotency.
- `BookingHold_team_no_overlap` excludes overlapping `ACTIVE` holds for one team.
- `Booking_assigned_team_no_overlap` excludes overlapping assigned bookings for one team unless the booking is `CANCELLED`, `REJECTED`, or `EXPIRED` (or soft-deleted/unassigned).
- `AuditLog`, `SecurityEvent`, and `CustomerCreditTransaction` reject UPDATE and DELETE through append-only triggers.
- `AuditLog_set_branch` derives a valid optional branch foreign key before insert; `AuditLog_branchId_createdAt_idx` supports scoped chronological reads. The foreign key uses `ON DELETE RESTRICT` so a branch cannot be removed while its append-only audit evidence references it.

These constraints are the last line of defense. Concurrency-sensitive application paths also use serializable transactions and PostgreSQL advisory locks.

## 7. Seed contract

`npm run db:seed` is deterministic sample data, not a production bootstrap. It requires `SEED_PASSWORD` (minimum 12 characters) and a different `SEED_ADMIN_PASSWORD` (minimum 16 characters), rejects obvious placeholders, hashes values, marks accounts for first-login password change, writes deterministic private evidence under `UPLOAD_DIR`, and refuses `NODE_ENV=production`.

The seed is designed to be rerunnable for its fixed records, but it still targets a disposable development/test database. Never point it at production.

## 8. Production System Admin bootstrap

`npm run admin:bootstrap` is separate from the demo seed. It consumes `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PHONE`, optional `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` (14–128 characters with upper/lowercase letters, a number, and a symbol). It validates the name/phone/email, rejects template and predictable credential fragments, and loads the normal Next environment files while honoring already-injected process values. Under one PostgreSQL advisory lock and transaction it refuses a duplicate identity or an existing non-deleted System Admin, creates an active `SYSTEM_SUPER_ADMIN` with a bcrypt hash and `mustChangePwd=true`, and appends `BOOTSTRAP_SYSTEM_ADMIN` to `AuditLog` without printing the password.

Run it exactly once after production migrations, replace every template placeholder, and remove the variables from the shell, secret injection, and any production `.env` after success. The Compose tools image contains the script and generated Prisma Client. Full commands are in [DEPLOYMENT.md](DEPLOYMENT.md).

## 9. Drift and an existing `db push` database

An older database created before the migration history must not receive the initial migration blindly. Back it up, then compare it:

Linux/macOS:

```bash
npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

Windows PowerShell:

```powershell
npx prisma migrate diff --from-url $env:DIRECT_URL --to-schema-datamodel prisma/schema.prisma --exit-code
```

Only if the comparison is clean may an operator baseline the initial migration:

```bash
npx prisma migrate resolve --applied 20260801000000_initial_schema
npm run db:migrate:status
```

Never use `migrate resolve --applied` to hide drift. Create and review a reconciliation migration when schemas differ.

## 10. Backup and restore

A valid recovery point contains both PostgreSQL and the upload store referenced by `BookingFile`, `SubscriptionPaymentProof`, and catalog URLs. Database-only restoration can leave broken file references; upload-only restoration can expose orphan bytes that the private handler will not serve.

Commands and the destructive-restore checklist are in [DEPLOYMENT.md](DEPLOYMENT.md).
