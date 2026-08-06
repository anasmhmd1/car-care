# Bareeq Mobile Car Care Operations

Bareeq is a single-brand, Arabic-first web application for mobile car-care booking and field operations. It combines a public service catalog, a customer portal, owner and operations dashboards, a technician workflow, and system governance in one Next.js application.

The repository currently uses Next.js 15.5, React 19, TypeScript, Prisma 6, and PostgreSQL 16. Payments are reviewed manually; the project deliberately has no payment gateway, messaging API, map API, CRM, or marketing integration.

## Implemented application surfaces

- Public catalog, service details, plans, coverage areas, policies, contact pages, and SEO metadata.
- Customer registration with versioned consent records, manual password-recovery requests, vehicles, addresses, bookings, payment-proof upload, cancellation/reschedule requests, complaints, an auditable credit balance that can be applied during booking, and subscription purchase/payment-proof history.
- Owner command center plus dedicated catalog (`/admin/catalog`) with reusable versioned cancellation policies assigned to every service, operating setup (`/admin/setup`), calendar (`/admin/calendar`), reports (`/admin/reports`), CSV export, gallery approval (`/admin/gallery`), subscription management, and reasoned reopening of a terminal booking into administrative review without silently reversing its financial, hold, assignment, or subscription ledgers.
- Operations queues for payment review, operational acceptance, assignment, balance collection, cancellations, rescheduling, refunds, complaints, quality review, subscription-payment proof review/activation, and manually verified password recovery, plus permission- and membership-scoped workforce/teams/availability management, branch-scoped audit visibility at `/operations/audit`, calendar, reports/CSV, customer subscription administration, and an audited price-only delegation surface at `/operations/pricing`. An Operations Manager can manage teams and availability under the default `workforce.manage`; creating, editing, or deactivating Employee accounts additionally requires the optional `employee.manage` grant. The independent `booking.override_close` permission allows a reasoned, audited close from service/quality review while preserving team, zero-balance, and subscription-ledger guards.
- Technician tasks with guarded state changes, checklist execution, notes, and before/during/after evidence. An Employee with an explicit scoped grant can use `/staff/delegated` for only the seven optional office duties defined by the specification: payment review, booking acceptance, viewing unassigned work, quality review, balance collection, recording refund proof, and final booking closure.
- System Admin governance for Owner accounts, the brand-wide branch limit, branch requests and creation, branch status, application settings, user activation, and audit visibility.

## Prerequisites

- Node.js 20 or later. The production container uses Node 20 Alpine.
- npm compatible with the committed `package-lock.json` (npm 10 or later is recommended).
- PostgreSQL 16 with permission to enable `pgcrypto` and `btree_gist`, or Docker Engine with Docker Compose v2.

## Local installation

1. Install the exact dependency tree:

   ```bash
   npm ci
   ```

2. Copy the environment template and replace every placeholder. Never commit `.env`.

   Linux/macOS:

   ```bash
   cp .env.example .env
   openssl rand -base64 48
   ```

   Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   $bytes = New-Object byte[] 48
   [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
   [Convert]::ToBase64String($bytes)
   ```

   Put the generated value in `SESSION_SECRET`. It must contain at least 32 characters. The application does not read `JWT_SECRET`.

3. Generate Prisma Client and apply every committed migration:

   ```bash
   npm run db:generate
   npm run db:migrate:deploy
   npm run db:migrate:status
   ```

   `DATABASE_URL` can be a runtime/pool connection. `DIRECT_URL` must be a direct PostgreSQL connection that can run migrations. They may be identical for a local database. Do not use `prisma db push` for deployment.

4. Start the development server:

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000`.

## Development seed and demo accounts

The seed is sample data for local development or a disposable test database only. It creates the five roles, one branch, operating configuration, seven editable sample services, add-ons, checklist templates, plans, teams, customers, and bookings in several workflow states. It also writes deterministic private demo evidence below `UPLOAD_DIR`, so seed-backed acceptance needs both the database and that writable directory.

It is deterministic and can be run repeatedly without duplicating its fixed records. It refuses to run when `NODE_ENV=production`, requires both password variables, hashes them with bcrypt, never prints them, and marks every demo user with `mustChangePwd=true`.

Linux/macOS:

```bash
export SEED_PASSWORD="$(openssl rand -base64 24)"
export SEED_ADMIN_PASSWORD="$(openssl rand -base64 32)"
npm run db:seed
```

Windows PowerShell:

```powershell
$env:SEED_PASSWORD = "use-a-unique-temporary-value-at-least-12-characters"
$env:SEED_ADMIN_PASSWORD = "use-a-different-temporary-value-at-least-16-characters"
npm run db:seed
Remove-Item Env:SEED_PASSWORD, Env:SEED_ADMIN_PASSWORD
```

The seeded System Admin phone is `01000000000`; its password is the value supplied in `SEED_ADMIN_PASSWORD`. Other seeded accounts use `SEED_PASSWORD`. These are not production credentials.

## System Admin and Owner provisioning

- Non-production: `npm run db:seed` creates one System Admin for development/acceptance use.
- Owner accounts: a signed-in System Admin creates them from `/system-admin`. The temporary password must be at least 12 characters, is not logged, and must be changed on first login.
- Production: after migrations, inject `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PHONE`, optional `BOOTSTRAP_ADMIN_EMAIL`, and a unique temporary `BOOTSTRAP_ADMIN_PASSWORD` of 14–128 characters containing upper/lowercase letters, a number, and a symbol, then run `npm run admin:bootstrap` once. The Compose tools image includes this command. It validates and rejects placeholder/predictable values, takes a PostgreSQL advisory lock, refuses to create another non-deleted System Admin, hashes the password, sets `mustChangePwd=true`, and writes an audit record in the same transaction. Remove the four bootstrap values immediately after success; never leave them in the web runtime or use the demo seed in production. See [DEPLOYMENT.md](DEPLOYMENT.md) for secret-safe Compose examples.

## Branch limit and branch requests

`BrandSettings.maxBranches` is a brand-wide limit and defaults to one. An Owner requests a branch from `/admin`; that request does not create a branch. A System Admin reviews it from `/system-admin`. Approval collects the branch code/address/phone/WhatsApp, raises the limit when necessary, creates the branch and Owner membership, and creates default working hours in one serializable transaction. Rejection and requests for more information require a reason.

New branches still need their zones, areas, teams, capabilities, payment methods, hours, travel matrix, and checklists configured in `/admin/setup` before public availability is useful.

## Payment, credit, and subscriptions

- A Customer can opt to apply compensation credit while creating a booking. The server atomically deducts at most the booking total, appends a negative `CustomerCreditTransaction`, records `Booking.creditAppliedAmount`, and reduces the required upfront transfer. If credit covers that requirement, the booking enters operations review without a payment proof. Later verification counts approved cash plus the already applied credit, capped at the booking total.
- If the pre-proof hold expires—or management releases it while the booking is still waiting for proof—the booking becomes `EXPIRED`, its applied credit is returned exactly once, and any subscription reservation is released. Releasing a hold during payment/operations review removes capacity only; it does not silently erase the pending financial or subscription rights.
- Payment verification reacquires the branch capacity lock and revalidates the stored interval before writing any review or financial record. It creates or extends a valid hold for the persisted appointment; if capacity was lost, the transaction rejects without partially applying payment mutations. Manual release reports retained reservation only from holds that remain live after release.
- The booking wizard shows the selected service's actual cancellation-policy name, version, notice window, and Arabic text. Confirmation submits the policy ID plus an exact revision derived from `updatedAt`; the server rejects a stale confirmation if an administrator changed the policy after it was displayed, forcing the Customer to review the new rule before booking.
- Cancellation settlement separates cash refund, Customer credit, and retained value so they cannot overlap and must add up to the full amount paid. A cash refund cannot exceed the cash actually paid; applied credit is returned through the append-only credit ledger where the selected policy requires it. Operational rejection of an already paid/credited booking creates the same accountable full-return settlement and a cancellation/refund record instead of stranding value.
- The same accepted policy governs cancellation and rescheduling, including a cancellation request whose preferred outcome is `RESCHEDULE`; Operations re-evaluates eligibility against the request's original timestamp, not the later review time. A terminal booking reopened by Owner is review-only: ordinary transitions and refund/hold mutations are locked out, operational queues exclude it, the Customer sees the effective original terminal state without action buttons, and Owner closes the review by restoring that exact terminal state.
- A subscription request automatically chooses an eligible active branch from the Customer's most recent eligible booking, falling back deterministically to the first eligible branch. It snapshots the plan price and validity duration, starts as `PENDING_PAYMENT`, and exposes only that branch's active payment methods. The Customer uploads a private JPEG/PNG/WebP/PDF proof; Operations Manager/Owner/System Admin review it with a reason, and an approval becomes valid only when the submitted amount exactly matches the snapshotted price. Activation is a separate guarded action, and expired active subscriptions are persisted lazily on subsequent customer, administration, or report reads with an audit entry.

## Verification

Run the complete release checks against a disposable database that has all migrations:

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run audit
```

`npm run test:e2e:list` only lists Playwright cases. Unless `E2E_BASE_URL` points to an already running external instance, Playwright starts and manages `npm run dev` on `E2E_PORT` (default 3000; 3417 is a useful isolated local value). Database-backed acceptance covers the master scenarios for the full lifecycle, last-slot concurrency, payment re-upload, subscriptions, branch limit, authorization boundaries, and outside-coverage handling (1, 3, 6, 8, 9, 10, and 12). It requires `E2E_DATABASE_URL` to point to a **disposable, migrated, seeded** PostgreSQL database and intentionally skips when that prerequisite is absent. Never point the suite at development or production data—discard/reset the E2E database after a run. `npm run audit` enforces the committed high-severity dependency policy.

`.github/workflows/ci.yml` provisions PostgreSQL 16 for two jobs. The verification job applies migrations, checks schema drift and dependency policy, then runs type checking, lint, unit tests, and the production build. The E2E job migrates and seeds a separate database, installs Chromium, and runs the full Playwright suite.

## Docker Compose

After creating a production-safe `.env`:

```bash
docker compose build web migrate
docker compose up -d db
docker compose run --rm migrate
docker compose up -d web
docker compose ps
```

The database and application ports bind to loopback only. Put a TLS reverse proxy in front of the app. PostgreSQL data is stored in `postgres_data`; private uploads and catalog media are stored in `uploads_data`. Back up both volumes as a consistent pair.

## Storage and security notes

- Booking evidence is written through the replaceable `StorageAdapter`; `STORAGE_DRIVER=local` uses the persistent `UPLOAD_DIR` volume, while another adapter can be composed without changing authorization or database anchors. Files are recorded as `BookingFile` and served through `/api/files/...` after database-backed authorization. Subscription payment proofs share the private store and are anchored by `SubscriptionPaymentProof`; Customers can read their own proof, branch-authorized subscription managers can review it, and Owner/System Admin have brand-wide management access. Before/after images become anonymously visible only after explicit Customer gallery consent **and** accountable Owner approval. Browser upload surfaces, including subscription-proof uploads, re-render JPEG/PNG/WebP through canvas, preserve decoded orientation, bound dimensions/quality, remove embedded EXIF/GPS metadata, and send WebP; unsupported browsers fall back to the original. The server still enforces matching extension/MIME/magic bytes and a 10 MB limit for JPEG, PNG, WebP, or PDF. Before/after/during/damage execution categories are image-only and only image MIME records count toward workflow photo minimums; PDF remains available for documentary payment/refund/case/subscription evidence.
- Catalog images share the upload volume but use `/api/catalog-media/...`; media referenced by an active service is public and cacheable.
- Sessions are signed JWTs stored in an HttpOnly cookie, while only their SHA-256 hashes and revocation state are stored in PostgreSQL. Password, role, status, and session-version changes revoke existing sessions.
- Login/upload/action rate limits and login lockouts are stored in PostgreSQL under an HMAC digest of the identifier. Advisory locks make increments consistent across application replicas without storing raw phone numbers in the throttle table.
- Password recovery is manual: the login page returns a generic response, rate-limits both phone and IP, and creates at most one pending request. An Operations Manager sees only Customers tied to an accessible branch; Owner/System Admin see the brand-wide queue at `/operations/password-resets`. Resolution requires a recorded verification reason and a strong temporary password, revokes sessions/lockout, forces first-login change, and is audited. No email, SMS, or WhatsApp message is sent automatically.

## Deliberate boundaries

Bareeq is not SaaS or multi-tenant. It has no WhatsApp API (only manual `wa.me` links), SMS/email automation, payment gateway, Google Maps/geocoding, live GPS, external route optimization, CRM, ads integration, Zapier/Make, inventory, full accounting, chatbot, or marketplace.

## Documentation

- [Arabic overview](README_AR.md)
- [Architecture](ARCHITECTURE.md)
- [Database and migrations](DATABASE.md)
- [Roles and fine permissions](PERMISSIONS.md)
- [Booking state machine](BOOKING_STATE_MACHINE.md)
- [Deployment, backup, restore, and operational limits](DEPLOYMENT.md)
