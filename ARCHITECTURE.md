# Bareeq Architecture

## 1. System shape

Bareeq is a single-brand modular monolith built with the Next.js App Router. Pages, server actions, route handlers, domain rules, and Prisma access ship as one application. PostgreSQL is the system of record. Private evidence and catalog media pass through a replaceable `StorageAdapter`; the bundled runtime driver stores them on a filesystem directory/volume.

```text
Browser
  |
  | HTTPS + HttpOnly session cookie
  v
Next.js middleware (coarse route/role gate + response headers)
  |
  +--> Server-rendered pages and Client Components
  +--> Server Actions (mutations)
  +--> Route Handlers (/api/availability, /api/upload, /api/subscription-payment-proofs, /api/files, /api/catalog-media)
          |
          v
Domain/auth/reporting modules in src/lib
          |
          +--> Prisma --> PostgreSQL 16
          +--> StorageAdapter --> local driver --> UPLOAD_DIR filesystem/volume
```

This is not a distributed microservice system and not a multi-tenant SaaS platform.

## 2. Application surfaces

| Surface | Main routes | Responsibility |
|---|---|---|
| Public | `/`, `/services`, `/plans`, `/areas`, `/policies/*` | Catalog, service detail, coverage, policies, SEO |
| Customer | `/account/*`, `/services/[slug]/book` | Profile, vehicles, addresses, bookings, evidence, cases, credit, subscriptions |
| Owner | `/admin` | Brand-wide command center and navigation to specialist tools |
| Catalog | `/admin/catalog` | Services, variants, add-ons, branch overrides, media and booking rules |
| Setup | `/admin/setup` | Employees, teams, zones, hours, blackouts, travel times, payment methods, capacity and checklists |
| Calendar | `/admin/calendar` | Branch-scoped Operations Manager or brand-wide Owner/System Admin day/week/30-day agenda/team views, filters and guarded rescheduling |
| Reports | `/admin/reports` | Branch-scoped Operations Manager or brand-wide Owner/System Admin booking, finance, operations, subscription and cancellation metrics plus CSV |
| Gallery governance | `/admin/gallery`, `/before-after` | Customer consent, Owner approval/revocation, and public before/after presentation |
| Operations | `/operations`, `/operations/password-resets`, `/operations/pricing`, `/operations/audit` | Payment and booking review, assignment, balance, cancellation/refund, complaint/quality, manual password recovery, explicitly delegated price-only updates, and branch-scoped audit visibility |
| Operations workforce | `/operations/workforce` | Branch-scoped Employees, teams, members, capabilities, zones, hours and time off under `workforce.manage` |
| Technician | `/staff` | Assigned jobs, execution states, checklist results, notes and photos |
| Delegated Employee duties | `/staff/delegated` | Explicitly granted and scoped payment review, booking acceptance/unassigned visibility, quality, balance collection, refund-proof recording, and closure queues |
| System governance | `/system-admin` | Owners, branch limit/requests, branch and user state, app settings and audits |

## 3. Authentication and authorization

Authentication is implemented in `src/lib/auth`.

- Passwords are bcrypt hashes (cost 12 in the current actions/seed).
- A successful login creates an HS256 JWT with fixed issuer `bareeq` and audience `bareeq-web`.
- The raw JWT exists only in the `bareeq_session` HttpOnly, SameSite=Lax cookie. PostgreSQL stores a SHA-256 token hash, expiry, session version, IP/user-agent metadata, last use, and revocation state.
- Every full server authorization read checks the signature, persisted token hash, session expiry/revocation, active/not-deleted user, role, `sessionVersion`, and `mustChangePwd` state.
- Password, role, activation, or other security-state changes bump `sessionVersion` and revoke sessions. Temporary-password users are restricted to `/account/profile` until they change the password.
- Middleware provides an early route gate, but server actions and route handlers repeat authorization against database state. Middleware is not treated as the only security boundary.

Manual Customer recovery starts from the login page. A generic response, phone+IP throttling, and one-pending-request rule limit enumeration and abuse. `/operations/password-resets` is brand-wide for Owner/System Admin and restricted for Operations Managers to Customers with bookings in their accessible branches. Resolve/reject actions require a verification reason; resolution installs a validated bcrypt temporary password, revokes sessions, clears lockout, forces first-login change, and writes audit/security evidence. No automated delivery integration exists, so identity verification and communicating the temporary password remain controlled human procedures.

Authorization has three layers:

1. Coarse roles (`SYSTEM_SUPER_ADMIN`, `OWNER`, `OPERATIONS_MANAGER`, `EMPLOYEE`, `CUSTOMER`).
2. Fine permission codes with role configuration and per-user `GRANT`/`DENY` overrides.
3. Resource scope: brand-wide Owner/System Admin, branch memberships for Operations Managers, assigned team/branch scope for Employees, and ownership for Customers.

See [PERMISSIONS.md](PERMISSIONS.md) for the exact matrix and override precedence.

## 4. Booking and availability core

`src/lib/engine/availability.ts` is the shared availability source used by public slot search and final booking/reschedule checks. For a requested interval it evaluates:

- active branch, active coverage area belonging to that branch, active/bookable service, and optional branch-service override;
- branch timezone, weekly hours, break, blackout dates, slot unit, daily booking limit, and arrival window;
- service variant, add-ons, calculated duration, price, deposit, slot count, and required team size;
- active teams with the service capability and allowed zone;
- active member count, employee/team time off, team hours and breaks;
- team daily capacity, active holds, confirmed bookings, half-open interval overlap, and previous/next zone travel buffer.

Public slot results are advisory. Creation, assignment, rescheduling, and calendar drag/drop re-evaluate the interval in PostgreSQL transactions. Booking and reschedule flows use serializable transactions plus a shared advisory lock keyed as `capacity:<branchId>`. Database GiST exclusion constraints independently reject overlapping active holds or assigned bookings for the same team.

`slotCount` is real time demand, not unused metadata. The quote combines the service/variant slot count with add-on slot counts, then `calculateReservedDurationMinutes` reserves `max(service duration rounded to the branch slot unit, slotCount × slotUnitMinutes)`. That expanded `endAt` drives slot generation, overlap checks, holds, and confirmed-booking exclusions. `Branch.dailyBookingLimit` and `Team.dailyCapacity` remain separate caps on the number of daily jobs; weighting those job counters again by `slotCount` would double-count the time demand already represented by the reserved interval.

Holds have explicit `ACTIVE`, `CONVERTED`, `RELEASED`, and `EXPIRED` states. Default configurable windows are 30 minutes before proof and 1,440 minutes during payment/operations/reschedule review. Expiry during the pre-proof states runs a shared locked settlement: the booking becomes `EXPIRED`, applied credit is returned exactly once, and any subscription visit reservation is released; a proof cannot be attached afterward. Manual pre-proof release uses the same helper. A management release during payment/operations review releases capacity but preserves the booking's pending financial/subscription rights; the response derives `reservationRetained` from holds that are still live after the release, not from the prior booking state alone.

Automatic assignment scores eligible teams by configured priority/workload/zone constraints. Manual assignment uses the same feasibility checks and records assignment history. Failure to find an eligible team sends the booking to the relevant unassigned/admin-review path instead of silently overbooking.

## 5. Workflow modules

### Booking and payments

Booking creation snapshots the address, vehicle, service, contact, booking-policy version, the service's reusable cancellation-policy ID and full accepted policy values, price rows, add-ons, and provisional team hold in one transaction. The wizard displays the exact cancellation-policy name, version, notice window, and Arabic text; it submits the policy ID and a revision composed from ID, version, and `updatedAt`. The transaction reloads the effective policy and rejects a stale revision, preventing a time-of-check/time-of-use policy change from being accepted without the Customer seeing it. Versioned registration/booking consents are stored separately. When the Customer opts into credit, the same transaction deducts at most the booking total from `CustomerProfile.creditBalance`, appends a negative idempotent `CustomerCreditTransaction`, and stores `Booking.creditAppliedAmount`; this reduces the server-calculated upfront transfer and can make the initial payment proof unnecessary. Manual proof review reacquires `capacity:<branchId>`, revalidates the persisted interval, and creates/extends a live hold before writing its immutable decision and idempotent `Payment`; lost capacity rejects the transaction without partial financial mutations. Verified totals combine approved cash with the already applied credit, capped at the booking total. Later balance collection is idempotent, ledger-derived, cannot exceed `amountDue`, and is accepted only from `ARRIVED` through `DELIVERED`; payment verification and operational acceptance remain separate decisions.

### Field execution and quality

The canonical transition service in `src/lib/engine/transition.ts` updates the booking, history, subscription ledger when applicable, and audit log atomically. It guards assignment, payment, team membership, required reason, checklist stages, minimum before/after photos, quality approval, and zero outstanding balance. Checklist and upload actions also enforce workflow windows: preparation is editable from acknowledgement through arrival, arrival inspection and before/damage evidence only at `ARRIVED`, and service/closing plus during/after evidence only at `IN_SERVICE`. The technician UI mirrors these gates, while the server remains authoritative. Checklist results retain the item label, note, photo URL, actor, and time. A stage is complete only when every currently active required item is checked and satisfies its photo/note requirements; the transition service repeats that live-template check before accepting execution milestones. Database uniqueness guarantees one template per service/stage, one instance per booking/stage, and one result per instance/item, while an advisory lock serializes edits to a booking stage.

`src/lib/engine/booking-administration.ts` provides the two exceptional paths demanded by governance. An Operations Manager or Owner with `booking.override_close`, branch access, an assigned team, zero balance, and a reason can move `IN_SERVICE`/`QUALITY_REVIEW` atomically through closure while bypassing only execution/closing checklist evidence, the minimum after-photo guard, and quality approval; the transition path, skipped guards, preserved constraints, and reason are audited, and normal subscription completion logic still runs. Separately, Owner alone can reopen `CLOSED`, `CANCELLED`, `REJECTED`, or `EXPIRED` to a review-only `ADMIN_REVIEW_REQUIRED` under `booking-terminal-reopen:<bookingId>`. The source state and reopen time are persisted. Normal state transitions, assignment/execution, refund recording/approval/Owner override, and hold release refuse the marker under the same lock; operational queues exclude it, and Customer views render the effective source terminal state without mutations. Owner ends the review with a reason by restoring that exact terminal state and clearing the marker. Neither open nor close reverses refunds, credit, assignment, payment, holds, or subscription ledgers.

### Cancellation, rescheduling, refund, and credit

Customer case requests preserve the prior booking state and optional evidence. Cancellation and rescheduling capability, notice classification, and late-request behavior come from the immutable policy snapshot accepted with that booking, so later catalog edits cannot rewrite the Customer's rule. A cancellation request that prefers `RESCHEDULE` is governed by the rescheduling capability too, and Operations approval re-evaluates the policy against `CancellationRequest.createdAt`, not the later review time. Operations can reject/restore, cancel, reschedule after a fresh capacity check, or escalate. Cancellation settlement calculates mutually exclusive cash-refund, Customer-credit, and retained portions for full/partial/no refund, convert-to-credit, keep-deposit, and visit-fee decisions; the three portions must equal the full `amountPaid`. Cash refund is capped by actual cash paid (`amountPaid - creditAppliedAmount`), so previously applied credit cannot be returned as cash. Any resulting credit is posted atomically and idempotently to the append-only credit ledger, and the booking payment state is derived from total value returned (cash plus credit), preventing a fully returned mixed payment from remaining partially refunded. Operational rejection of an already paid/credited booking creates a full-return `CancellationRequest`, releases a subscription reservation, returns the credit portion, and leaves any cash portion in the normal refund-proof queue. Refund recording and approval are separate, idempotent actions; approval requires `refund.approve` plus branch access for an Operations Manager/Owner/System Admin.

### Subscriptions

Plans are restricted by service, branch, vehicle count, validity, visits, and freeze rules. Customer purchase does not accept a branch chosen by the browser: it selects the Customer's most recent booking branch when that branch is active and eligible for the plan, otherwise the first eligible active branch ordered by code/id. A Customer cannot hold another pending, frozen, or unexpired active subscription for the same plan. Purchase snapshots `purchasePrice`, visit count, and validity duration and starts in `PENDING_PAYMENT` with a purchase ledger/audit record.

The Customer sees only the selected branch's active payment methods and uploads a private JPEG/PNG/WebP/PDF proof through `/api/subscription-payment-proofs`. Upload is rate-limited and serialized by subscription; a newer proof moves an older `UNDER_REVIEW` proof to `REUPLOAD_REQUIRED`, and the new physical file is deleted if its database transaction fails. Operations Manager/Owner/System Admin with `subscription.manage` and resource access review each proof with required notes as approved, rejected, re-upload required, duplicate suspected, or amount mismatch. An approval is valid only for an exact `purchasePrice` match and an active payment method belonging to the subscription branch. Activation is a separate action gated by the latest approved exact proof and starts a new term using the purchase-time validity-duration snapshot. Purchase, activation, freeze/unfreeze, extension, cancellation, and manual adjustments run serializably with idempotency keys.

Expired `ACTIVE` subscriptions are persisted lazily as `EXPIRED` before customer, administration, and report reads. The optimistic update and append-only audit entry share one transaction, so concurrent readers remain idempotent. A booking reserves a visit without decrementing it; manual visit deduction cannot consume capacity reserved by open bookings. The visit is decremented once at `SERVICE_COMPLETED` and restored only if an already deducted visit is legitimately released.

### Catalog, setup, calendar, and reports

- Catalog writes validate a complete service product (content, media URLs, variants, deposit rules, cancellation policy, add-ons, branch overrides) and run serializably with audit records. Owner/System Admin manage reusable policy versions, one active default, notice hours, cancellation/rescheduling/late-request switches, and Arabic policy text; the database enforces one active default and prevents deleting a policy still referenced by a service.
- Setup writes are Owner/System Admin-only and branch-scoped. The setup center owns the operating inputs consumed by availability and assignment and provides audited `GLOBAL`/`BRANCH` per-user permission overrides for Operations Manager/Employee accounts; role/permission definitions and `TEAM`-scope authoring remain outside that UI.
- The Operations workforce center exposes core workforce inputs to Operations Managers only for membership/permitted branches. `workforce.manage` covers teams, memberships, capabilities, zones, hours, and time off. Creating, editing, or deactivating an Employee account is separately gated by the optional branch-scoped `employee.manage`; Operations Managers still cannot create or promote Operations Managers, while Owner/System Admin retain wider workforce authority.
- Employee delegation is a hard allowlist, not arbitrary elevation. `/staff/delegated` exposes only `payment.review`, `booking.accept`, `booking.view_unassigned`, `quality.review`, `payment.record_balance`, `refund.record_proof`, and `booking.close`, and every action still enforces branch/team scope. Refund proof recording never grants refund approval. Assignment, cancellation approval, complaint administration, subscriptions, reports, workforce administration, and pricing remain unavailable to Employee even if a crafted override is submitted.
- `catalog.price.manage` is optional for an Operations Manager and available at `/operations/pricing`; the action can only change a service base price or an existing branch price override. It cannot create/delete services, change availability, duration, deposits, variants, or catalog state, and every write is audited.
- Calendar reads real booking data in day, week, 30-day agenda, and team views. Drag/drop opens an explicit confirmation; the server checks role, `booking.reschedule`, branch scope, state, team compatibility, and capacity before writing `BookingTimeChange`, history, and audit records.
- Reports query PostgreSQL at request time with date/branch/team/service/zone/booking/payment filters. Operations Managers receive only branches allowed by membership plus `reports.revenue`; Owner/System Admin use brand-wide access. The CSV route repeats the same authorization and scope, emits UTF-8 with BOM, quotes fields, and neutralizes spreadsheet-formula prefixes.

## 6. Files and media

`src/lib/upload.ts` stores and reads files through the `StorageAdapter` contract in `src/lib/storage/adapter.ts`, using random UUID names and portable relative keys. The bundled `LocalVolumeStorageAdapter` is selected by `STORAGE_DRIVER=local` and resolves those keys under `UPLOAD_DIR`; unsafe, absolute, empty, or traversal keys are rejected before filesystem access. Unsupported drivers fail closed instead of silently falling back. The upload layer limits user files to 10 MB and requires agreement between extension, declared MIME, and magic bytes for JPEG, PNG, WebP, or PDF.

Before the network upload, browser surfaces pass raster JPEG/PNG/WebP files through `src/lib/client/image-upload.ts`. The helper decodes orientation, bounds the longest dimension (2,560 px by default; 2,200 px for catalog), re-encodes to WebP at bounded quality, and thereby drops EXIF/GPS metadata. If canvas/bitmap processing is unavailable or fails, it returns the original file and the server-side validation remains authoritative. PDFs are never rasterized.

- Booking evidence is recorded in `BookingFile` and served by `/api/files/<category>/<name>`. The handler fails closed when the database record is missing and checks customer ownership, category-specific assigned-team/delegated access, or branch management. An assigned Employee sees execution-image categories only; payment, quality, or refund evidence requires the matching explicit delegated permission unless the actor is a manager. Before/after evidence has a two-party publishing gate: `customerGalleryConsentAt` must be present and an Owner must set `approvedForGallery` plus approval actor/time. Only then can an anonymous visitor load it for `/before-after`; revoking either side returns it to private access.
- Before/after/during/existing-damage execution categories accept image MIME only. Technician confirmation must reference an image record that the actor just uploaded to that booking, checklist-photo references must be eligible booking images, and transition photo counts ignore non-image records. Payment, refund, cancellation, and complaint evidence may still be PDF.
- Subscription proofs are recorded separately in `SubscriptionPaymentProof` but use the same private `/api/files/...` handler and upload root. Access is limited to the owning Customer, an Operations Manager with branch access plus `subscription.manage`, Owner, or System Admin with brand-wide access plus the permission decision. Delegated Employees can read the booking-file categories needed for their explicit payment-review, quality-review, or refund-proof grant; System Admin has brand-wide booking-file read access but still does not use the booking upload route.
- Catalog uploads use the same storage root under `catalog-media`. A file referenced by an active service is public/cacheable; an unreferenced file is visible only to Owner/System Admin for preview.

With the bundled local driver, database backups do not contain file bytes. PostgreSQL and `UPLOAD_DIR` must be backed up and restored as a coordinated pair. A future object-storage implementation can satisfy the same `put`/`read`/`delete`/`describe` contract without changing authorization or database anchors, but its own coordinated backup and recovery policy remains a deployment responsibility.

## 7. Data consistency and audit

- PostgreSQL check constraints protect positive capacities, valid intervals, non-negative balances, subscription purchase prices, positive subscription-proof amounts/sizes, and subscription visit arithmetic.
- Unique/idempotency keys protect payment, refund, credit, booking proof, subscription-proof file URLs, and subscription operations from duplicate application.
- AuditLog, SecurityEvent, and CustomerCreditTransaction are append-only at the database boundary through triggers. A database trigger derives `AuditLog.branchId` from trusted entity relationships, enabling `/operations/audit` to expose only accessible branches under `audit.view`; Owner/System Admin retain the broader view.
- Booking state history, assignment history, time-change records, payment reviews, quality/case records, subscription payment-proof reviews, and subscription ledgers preserve domain evidence.
- Business mutations generally use Prisma transactions; concurrency-sensitive mutations use serializable isolation and/or PostgreSQL advisory locks.

The current schema and migration details are in [DATABASE.md](DATABASE.md).

## 8. Runtime and deployment topology

The provided Docker topology contains:

- `web`: a non-root standalone Next.js container with a health check and the `uploads_data` volume;
- `db`: PostgreSQL 16 Alpine with `postgres_data`;
- `migrate`: a tools image/profile that runs `prisma migrate deploy` before the new web release.

Both published ports bind to loopback. Production requires a TLS reverse proxy and stable secrets. See [DEPLOYMENT.md](DEPLOYMENT.md).

The initial production `SYSTEM_SUPER_ADMIN` is created separately with `npm run admin:bootstrap`. The create-only command is protected by a PostgreSQL advisory lock, creates the account and audit event atomically, and forces a first-login password change. Its temporary environment values are not part of the steady-state web runtime.

## 9. Security controls and known architectural limits

Implemented controls include Zod validation, server-side RBAC/scope checks, short generic login errors, session revocation, login security events, upload content checks, path traversal protection, audit records, and headers including HSTS, frame denial, MIME sniffing denial, referrer policy, and a middleware permissions policy.

The PostgreSQL-backed limiter applies these fixed windows: login 5 attempts/5 minutes, registration 3/10 minutes, password reset 3/15 minutes for both phone and client IP, booking 10/minute, booking/catalog upload 20/minute, and the general fallback 30/minute. Five failed logins lock the phone key for 15 minutes. Login/register are keyed by normalized phone; authenticated booking/upload limits use the user ID. Only an HMAC digest keyed by `SESSION_SECRET` is stored in `SecurityThrottle`, and a PostgreSQL advisory lock serializes each counter across replicas.

Operational limits that must not be hidden:

- The included runtime implementation is the local-volume storage driver. Multiple web replicas require the same shared POSIX-compatible volume, or a separately implemented object-storage driver behind the included `StorageAdapter` contract; no S3-compatible driver is bundled.
- There is no background queue/worker. Expired holds are reconciled when availability is evaluated, and expired active subscriptions are persisted on later customer/management/report reads, not by a dedicated scheduler.
- Expired `SecurityThrottle` rows are reused when the same digest returns but are not proactively purged. Monitor table growth and add a reviewed retention job if high-cardinality traffic makes it necessary.
- The application intentionally has no payment, WhatsApp/SMS/email, map/GPS, CRM, advertising, automation, inventory, or accounting integration.
