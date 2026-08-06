# Bareeq Production Deployment and Recovery

This guide describes the repository's current Docker Compose baseline: one Next.js web container, PostgreSQL 16, and one persistent upload volume. Use a secured Linux host for production. Windows Docker Desktop is suitable for local verification, not the recommended production host.

## 1. Production readiness gates

Do not promote a release until all of the following are true:

- `.env` contains unique production values and is excluded from version control and image build context.
- PostgreSQL and upload backups have both been restored successfully in a separate environment.
- All committed migrations have applied cleanly to a disposable copy of production data.
- Type checking, lint, unit tests, Playwright, build, and the chosen dependency audit policy pass.
- TLS, reverse-proxy headers, monitoring, log retention, and backup retention are configured.
- The create-only production bootstrap has created the first System Admin, the temporary bootstrap values have been removed, and that account has changed its temporary password.
- For more than one web replica, every replica uses the same primary PostgreSQL database, `SESSION_SECRET`, and shared upload storage.

## 2. Environment variables

Create the server `.env` from `.env.example`; never commit or bake it into the final image.

| Variable | Required | Secret | Purpose/default |
|---|:---:|:---:|---|
| `DATABASE_URL` | Yes | Yes | Runtime PostgreSQL URL; Compose builds it from `POSTGRES_*` |
| `DIRECT_URL` | Yes | Yes | Direct PostgreSQL URL for Prisma migrations |
| `SESSION_SECRET` | Yes | Yes | HS256 signing key, minimum 32 characters |
| `SESSION_TTL_DAYS` | No | No | Absolute session lifetime, 1–30 days; invalid values fall back to 7 |
| `NEXT_PUBLIC_APP_URL` | Yes | No | Final public HTTPS origin; used at build and runtime |
| `STORAGE_DRIVER` | No | No | Private-storage implementation; bundled value/default is `local`, unsupported values fail closed |
| `UPLOAD_DIR` | Yes outside Compose | No | Private upload root; Compose fixes it to `/app/data/uploads` |
| `BOOKING_HOLD_MINUTES` | No | No | Initial proof window; default 30 |
| `PAYMENT_REVIEW_HOLD_MINUTES` | No | No | Proof-review hold; default 1440 |
| `OPERATIONS_REVIEW_HOLD_MINUTES` | No | No | Operations-review hold; default 1440 |
| `RESCHEDULE_HOLD_MINUTES` | No | No | Calendar reschedule hold; default 1440 |
| `BOOTSTRAP_ADMIN_NAME` | Bootstrap only | No | Full name for the first production System Admin |
| `BOOTSTRAP_ADMIN_PHONE` | Bootstrap only | Sensitive | Unique login phone for the first production System Admin |
| `BOOTSTRAP_ADMIN_EMAIL` | Bootstrap only | Sensitive | Optional unique email; an empty value becomes `null` |
| `BOOTSTRAP_ADMIN_PASSWORD` | Bootstrap only | Yes | Unique temporary password, minimum 14; forced change on first login |
| `SEED_PASSWORD` | Seed only | Yes | Temporary shared non-admin demo password, minimum 12 |
| `SEED_ADMIN_PASSWORD` | Seed only | Yes | Separate demo System Admin password, minimum 16 |
| `E2E_DATABASE_URL` | Acceptance only | Yes | Disposable migrated/seeded E2E database; never production |
| `E2E_BASE_URL` | E2E only | No | Existing external target URL; omit to let Playwright manage local Next dev |
| `E2E_PORT` | Local E2E only | No | Port for the Playwright-managed local server; default 3000, isolated value 3417 recommended |
| `POSTGRES_USER` | Compose | No | Container database user; default `bareeq` |
| `POSTGRES_PASSWORD` | Compose | Yes | Long URL-safe database password |
| `POSTGRES_DB` | Compose | No | Database name; default `bareeq_db` |
| `POSTGRES_PORT` | Compose | No | Loopback host port; default 5432 |
| `APP_PORT` | Compose | No | Loopback host port; default 3000 |

Generate `SESSION_SECRET` rather than inventing one.

Linux:

```bash
openssl rand -base64 48
```

Windows PowerShell:

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Keep `SESSION_SECRET` stable across restarts/replicas. Rotating it invalidates every signed session and changes the HMAC namespace used by rate-limit/lockout keys, effectively resetting those counters while leaving the old digest rows for later retention cleanup. Do not configure `JWT_SECRET`; the application does not use it.

Keep passwords, tokens, API keys, and private keys in the host/platform secret manager or environment. The System Admin application-setting action rejects secret-like keys and is not a secret vault.

`docker-compose.yml` sets `STORAGE_DRIVER=local`, fixes `UPLOAD_DIR` to the persistent volume, and forwards all four hold-window variables through its shared application environment anchor. Cancellation notice rules now come from the versioned policy assigned to each service and snapshotted on each booking, not from a runtime environment variable. The bootstrap variables are intentionally absent from that steady-state anchor; inject them only into the one-time command.

The application reaches private files through the `StorageAdapter` contract. The bundled local driver is appropriate for this single-host/shared-volume topology. If a later multi-replica deployment cannot share that volume, implement and register an object-storage driver with equivalent private access, durability, deletion, backup, and recovery semantics; setting an unsupported driver name alone intentionally stops file handling.

## 3. First Docker deployment

The Compose file binds database and application ports to `127.0.0.1`. The web container runs as a non-root user and has a health check.

```bash
docker compose build web migrate
docker compose up -d db
docker compose run --rm migrate
# Complete the one-time bootstrap in section 4 before exposing a new installation.
docker compose up -d web
docker compose ps
```

Verify migrations and logs:

```bash
docker compose run --rm migrate npm run db:migrate:status
docker compose logs --tail=200 web db
```

Expected persistent volumes:

- `postgres_data` → `/var/lib/postgresql/data`
- `uploads_data` → `/app/data/uploads`

The upload volume contains private booking evidence, private subscription payment proofs, and catalog media.

## 4. First System Admin and Owner accounts

### Development and acceptance

Use `npm run db:seed` only with `NODE_ENV` not equal to `production`. It creates a demo System Admin and Owner, hashes caller-supplied passwords, and forces first-login password changes.

### Production

Do not bypass the seed's production guard or reuse seed credentials. The `migrate` tools image contains the bootstrap script and generated Prisma Client; its normal Compose environment already points to the production database. Bootstrap values are deliberately not part of the shared runtime environment.

Use a unique, temporary password. The following Bash form reads it without echoing it or placing its value in the command history, then forwards only the named variables to the one-time tools container:

```bash
export BOOTSTRAP_ADMIN_NAME='Initial System Admin'
export BOOTSTRAP_ADMIN_PHONE='replace-with-the-real-login-phone'
export BOOTSTRAP_ADMIN_EMAIL='replace-with-the-real-email'
read -rsp 'Temporary System Admin password: ' BOOTSTRAP_ADMIN_PASSWORD
echo
export BOOTSTRAP_ADMIN_PASSWORD
docker compose run --rm \
  -e BOOTSTRAP_ADMIN_NAME \
  -e BOOTSTRAP_ADMIN_PHONE \
  -e BOOTSTRAP_ADMIN_EMAIL \
  -e BOOTSTRAP_ADMIN_PASSWORD \
  migrate npm run admin:bootstrap
unset BOOTSTRAP_ADMIN_NAME BOOTSTRAP_ADMIN_PHONE BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
```

For Windows PowerShell, obtain the temporary password as a `SecureString`, expose it only for the child process, and clean the environment in `finally`:

```powershell
$env:BOOTSTRAP_ADMIN_NAME = 'Initial System Admin'
$env:BOOTSTRAP_ADMIN_PHONE = 'replace-with-the-real-login-phone'
$env:BOOTSTRAP_ADMIN_EMAIL = 'replace-with-the-real-email'
$securePassword = Read-Host 'Temporary System Admin password' -AsSecureString
$credential = [PSCredential]::new('bootstrap', $securePassword)
$env:BOOTSTRAP_ADMIN_PASSWORD = $credential.GetNetworkCredential().Password
try {
    docker compose run --rm `
        -e BOOTSTRAP_ADMIN_NAME `
        -e BOOTSTRAP_ADMIN_PHONE `
        -e BOOTSTRAP_ADMIN_EMAIL `
        -e BOOTSTRAP_ADMIN_PASSWORD `
        migrate npm run admin:bootstrap
} finally {
    Remove-Item Env:BOOTSTRAP_ADMIN_NAME, Env:BOOTSTRAP_ADMIN_PHONE, Env:BOOTSTRAP_ADMIN_EMAIL, Env:BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    $credential = $null
    $securePassword = $null
}
```

Email is optional; omit its export/assignment and corresponding `-e` line if the first account has no email. Replace every placeholder before running the command. The script also loads normal Next `.env` files when run directly, but explicit process values take precedence. Do not put the temporary password in source, a Compose file, a committed `.env`, command arguments, tickets, or logs; remove any real bootstrap values from `.env` after success.

The command validates a 2–100 character name, a constrained 8–20 character phone, an optional valid email, and a 14–128 character password containing upper/lowercase letters, a number, and a symbol. It rejects known placeholder/predictable fragments, takes the `bareeq:bootstrap-system-admin` PostgreSQL advisory lock, and runs in one transaction. It refuses an existing non-deleted System Admin or duplicate phone/email, creates an active `SYSTEM_SUPER_ADMIN` with bcrypt cost 12 and `mustChangePwd=true`, appends `BOOTSTRAP_SYSTEM_ADMIN` to `AuditLog`, and never prints the password. A failure rolls back the account and audit row together. It is create-only, so do not treat rerunning it as account recovery.

After the first System Admin signs in, Owner accounts are created from `/system-admin`. System Admin supplies a temporary password of at least 12 characters; the application requires the Owner to change it at first login.

## 5. Branch limit and new branches

The branch limit is stored in `BrandSettings.maxBranches`, defaults to one, and cannot be reduced below the current branch count through the System Admin action.

The production workflow is:

1. Owner submits a named request/reason from `/admin`; no branch is created.
2. System Admin can reject, request more information, or approve from `/system-admin`.
3. Approval takes a unique code, address, phone, and WhatsApp number. Under a serializable transaction and the `bareeq:branch-limit` advisory lock, it raises the global limit if necessary, creates the branch, Owner membership, and seven default working-hour rows, then marks the request `IMPLEMENTED` and audits it.
4. Owner/System Admin completes zones, areas, teams, capabilities, hours, travel times, payment methods, capacity, and checklists in `/admin/setup`; optional per-branch service overrides are managed in `/admin/catalog`.

A newly approved branch is active but will not produce useful public slots until its operating configuration is complete.

## 6. Subsequent releases

Take verified database and upload backups before every release. Then:

```bash
docker compose build web migrate
docker compose run --rm migrate
docker compose up -d --remove-orphans web
docker compose ps
docker compose logs --tail=200 web
```

Migrations are forward-only release artifacts. Never edit an applied migration. Application rollback may use a compatible earlier image; database rollback requires a tested restore. Do not assume an older image can read a newer schema.

## 7. Existing databases created with `db push`

Applying `20260801000000_initial_schema` directly to populated tables will fail. First take and verify a backup, then compare the live database with the checked-in schema.

Linux:

```bash
npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

Windows PowerShell:

```powershell
npx prisma migrate diff --from-url $env:DIRECT_URL --to-schema-datamodel prisma/schema.prisma --exit-code
```

Continue only if there is no difference. Otherwise stop and create a reviewed reconciliation migration. For a clean match:

```bash
npx prisma migrate resolve --applied 20260801000000_initial_schema
npm run db:migrate:status
```

Never use `migrate resolve --applied` to conceal drift.

## 8. Release verification and E2E

Run against a disposable PostgreSQL database with the same migrations:

```bash
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run audit
```

For full database-backed acceptance coverage:

1. Create a separate disposable database.
2. Point `DATABASE_URL`, `DIRECT_URL`, and `E2E_DATABASE_URL` to that database.
3. Set non-production `SEED_PASSWORD` and `SEED_ADMIN_PASSWORD`, run migrations and `npm run db:seed`.
4. Set a test-only `SESSION_SECRET` of at least 32 characters.
5. Optionally set `E2E_PORT=3417` to isolate the Playwright-managed local server, then run `npm run test:e2e`. Use `E2E_BASE_URL` instead only when targeting an already running server.

The database-backed suite covers master scenarios 1, 3, 6, 8, 9, 10, and 12, including the full browser lifecycle, final-slot concurrency, proof replacement, subscription ledger, branch limit, authorization isolation, and outside-coverage contact path. These seed-backed cases skip themselves when `E2E_DATABASE_URL` or the database is absent; a skipped prerequisite is not proof that the acceptance scenario passed. The suite mutates fixtures and must never target development or production data; discard/reset its database after the run. `npm run test:e2e:list` also does not execute tests, and `npm run audit` fails on high-or-critical dependency findings.

The committed `.github/workflows/ci.yml` repeats these gates on Node 20 with PostgreSQL 16. Its `verify` job deploys migrations, checks Prisma drift, audits production dependencies, and runs typecheck/lint/unit/build. Its separate `e2e` job migrates and seeds a disposable database, installs Chromium, and executes Playwright. CI configuration is not a substitute for confirming that the workflow actually ran on the release commit.

## 9. PostgreSQL backup

Use PostgreSQL 16 tools and custom format. The following avoids shell binary-redirection differences on Windows by writing inside the container and copying the file out.

Create the destination first.

Linux:

```bash
mkdir -p backups
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force backups
```

Then, from either shell:

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/bareeq.dump'
docker compose cp db:/tmp/bareeq.dump ./backups/bareeq.dump
```

Name the host file with a timestamp in your backup system. Remove the temporary container copy only after confirming the host file exists. Store backups encrypted with access control and retention.

Verify every backup by restoring it into a **different** PostgreSQL 16 database/container and running:

```bash
npm run db:migrate:status
npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

A dump that has never been restored is not a verified backup.

## 10. Upload backup

Database dumps do not contain file bytes. Copy the upload volume at the same recovery point:

```bash
docker compose cp web:/app/data/uploads/. ./backups/uploads/
```

For a consistent pair, briefly quiesce writes or stop the web service while taking both backups:

```bash
docker compose stop web
# take database and upload backups
docker compose start web
```

Record the database dump and upload archive under one recovery-point ID. Encryption and access controls are required because uploads can contain booking/subscription payment proofs, complaint, cancellation, refund, damage, and service evidence.

## 11. Destructive restore runbook

Prefer restoring into a new database and a new upload volume, validate there, then switch traffic. Restoring over production is destructive.

Before an in-place restore:

1. Confirm the target host, Compose project, database name, and selected backup.
2. Stop the web service.
3. Take a second safety backup of the current database and uploads.
4. Copy the selected dump into the database container.

```bash
docker compose stop web
docker compose cp ./backups/SELECTED.dump db:/tmp/restore.dump
docker compose exec -T db sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/restore.dump'
docker compose run --rm migrate
```

Restore the matching upload set into a clean/staged `uploads_data` volume. Do not merge unrelated recovery points. After verifying that the target upload directory/volume is empty, the copy step is:

```bash
docker compose cp ./backups/uploads/. web:/app/data/uploads/
docker compose run --rm --user root web chown -R 1001:1001 /app/data/uploads
```

Then validate private booking and subscription-proof file reads, catalog images, authentication, booking counts, cash/credit/refund totals, subscription balances/proof states, migration status, and application health before restarting:

```bash
docker compose up -d web
docker compose ps
docker compose logs --tail=200 web db
```

## 12. TLS reverse proxy

Terminate TLS in a maintained reverse proxy and forward to loopback port 3000. Preserve host, protocol, and client forwarding headers.

```nginx
server {
    listen 443 ssl http2;
    server_name bareeq.example.com;

    ssl_certificate /etc/letsencrypt/live/bareeq.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bareeq.example.com/privkey.pem;

    client_max_body_size 11m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Set `NEXT_PUBLIC_APP_URL=https://bareeq.example.com` **before** building. Automate certificate renewal and test the health check through the proxy.

## 13. Monitoring and maintenance

At minimum monitor:

- web/container health, restarts, latency, 5xx/429 rate, and disk usage;
- PostgreSQL connections, storage, locks, failed migrations, and backup age;
- `uploads_data` capacity and backup age;
- login failures/account locks, invalid uploads, `SecurityThrottle` row/lock growth, and relevant `SecurityEvent`/`AuditLog` growth;
- bookings stuck in payment/operations/admin review, active holds past expiry, due balances, pending refunds, subscription proofs stuck under review, expired active subscriptions, and subscription balance anomalies.

The application has no background worker. Expired holds are reconciled during availability evaluation, while active subscription expiry is persisted on later customer, administration, and report reads. Operations should monitor stale rows and define a reviewed maintenance job if proactive expiry is required.

## 14. Horizontal scaling limitations

The current Compose baseline is intentionally single-web-instance:

- Rate limits and account lockouts are shared in PostgreSQL and serialized per HMAC key with advisory locks; Redis is not required for correctness in the current design. All replicas must share the same `SESSION_SECRET` and primary database. Monitor database contention and retain edge/WAF throttling as defense in depth where available.
- Uploads are filesystem-based. Multiple replicas need the same mounted volume or an object-storage implementation that preserves the authorization model.
- JWT signing requires the same `SESSION_SECRET` on every replica; PostgreSQL session state is already shared.
- Capacity correctness depends on PostgreSQL transactions, advisory locks, and exclusion constraints, so all replicas must use the same primary database for writes.

## 15. Deliberately absent integrations

Do not configure nonexistent integrations. The base product has no payment gateway, WhatsApp/SMS/email automation, Google Maps/geocoding, live GPS, external route optimizer, CRM, advertising dashboard/pixels, Zapier/Make, inventory, full accounting, chatbot/live chat, or marketplace. Telephone and `wa.me` links are manual contact only.
