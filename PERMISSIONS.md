# Bareeq Roles, Permissions, and Scope

Bareeq authorizes every protected mutation on the server. Client visibility and middleware redirects improve UX, but neither is treated as proof of authority.

## 1. Roles and route homes

| Role | Default home | Primary responsibility |
|---|---|---|
| `SYSTEM_SUPER_ADMIN` | `/system-admin` | Governance, Owner accounts, brand branch limit/requests, user/branch state, settings and audit |
| `OWNER` | `/admin` | Brand-wide commercial and operational ownership |
| `OPERATIONS_MANAGER` | `/operations` | Branch-scoped payment, booking, assignment, case and quality operations; optional price-only delegation |
| `EMPLOYEE` | `/staff` | Work assigned to the Employee's team plus a strict optional-duty allowlist |
| `CUSTOMER` | `/account` | The Customer's own profile, vehicles, addresses, bookings, cases and subscriptions |

All roles can reach exactly `/account/profile` when a temporary password must be changed. The rest of `/account` is Customer-only. `/admin` is Owner/System Admin in general, with three branch-scoped Operations Manager exceptions (`/admin/calendar`, `/admin/reports`, and `/admin/subscriptions`); `/admin/gallery` is explicitly Owner-only. `/operations` is Operations Manager/Owner/System Admin, including permission-gated `/operations/pricing` and branch-scoped `/operations/audit`; `/staff` is Employee/Operations Manager/Owner, including `/staff/delegated`; `/system-admin` is System Admin-only.

Public browsing is unauthenticated. Creating a booking requires a Customer session.

## 2. Resource scope

Role permission is necessary but not sufficient:

- `SYSTEM_SUPER_ADMIN` and `OWNER` have brand-wide branch access in the shared branch-scope helper.
- `OPERATIONS_MANAGER` can act only on branches present in `BranchMembership`.
- `EMPLOYEE` branch visibility is derived from branch membership and team membership; execution actions additionally require the booking to be assigned to the Employee's team.
- `CUSTOMER` actions query through the current user's `CustomerProfile` and booking ownership.

The private file handler repeats resource authorization rather than trusting dashboard access. Customers see allowed evidence on their own booking; assigned Employees see only execution-image categories, while payment/quality/refund evidence requires the matching explicit delegated grant. Operations Managers see branch evidence, and Owner/System Admin have brand-wide booking-file read access. Subscription proofs are visible to the owning Customer, an Operations Manager with branch access plus `subscription.manage`, Owner, or System Admin with brand-wide access plus the permission decision. Physical bytes without a matching `BookingFile` or `SubscriptionPaymentProof` record fail closed.

## 3. Fine permission codes

`src/lib/auth/permissions.ts` defines 21 codes:

| Code | Default Operations Manager | Default Employee | Enforced directly today |
|---|:---:|:---:|:---:|
| `booking.accept` | Yes | No | Yes |
| `booking.assign` | Yes | No | Yes |
| `booking.view_unassigned` | Yes | No | Yes for the delegated read queue |
| `booking.close` | Yes | No | Yes; Employee requires an explicit scoped grant |
| `booking.override_close` | Yes | No | Yes; Operations Manager/Owner only, reasoned and branch-scoped; never Employee-delegatable |
| `booking.reschedule` | Yes | No | Yes |
| `booking.release_hold` | Yes | No | Yes |
| `payment.review` | Yes | No | Yes |
| `payment.record_balance` | Yes | No | Yes; Employee requires an explicit scoped grant and the booking must be in an eligible execution/delivery state |
| `refund.record_proof` | Yes | No | Yes |
| `refund.approve` | Yes | No | Yes; action also requires Operations Manager/Owner/System Admin role and branch access |
| `cancellation.review` | Yes | No | Yes |
| `quality.review` | Yes | No | Yes |
| `complaint.manage` | Yes | No | Yes |
| `subscription.manage` | Yes | No | Yes for administrative subscription actions |
| `reports.revenue` | Yes | No | Yes for branch-scoped report page and CSV export |
| `audit.view` | Yes | No | Yes for `/operations/audit`; rows are restricted by derived `AuditLog.branchId` |
| `workforce.manage` | Yes | No | Yes for `/operations/workforce`, the setup center, and their actions |
| `employee.manage` | No | No | Yes for Operations Manager create/update/deactivate Employee actions; explicit branch-scoped grant required |
| `task.execute` | Yes | Yes | Yes for technician task, note, checklist, and photo actions |
| `catalog.price.manage` | No | No | Yes for audited base/branch price-only writes at `/operations/pricing`; Employee is hard-blocked |

Owner and System Admin default to `*`. Customer defaults to no fine permissions. A currently applicable per-user `DENY` can override even a wildcard default.

## 4. Permission decision order

For actions that call `hasPermission`, the runtime decision is:

1. Any applicable, unexpired `UserPermission` with `DENY` returns false.
2. An explicit `GRANT` returns true.
3. A matching permission or `*` in `Role.permissions`, or a boolean value in an object-shaped role configuration, is used.
4. Otherwise the hard-coded role default is used.

Therefore, omitting a code from an array-shaped `Role.permissions` does not revoke a hard-coded default; use an explicit boolean `false` object entry or a user `DENY` until the permission model is redesigned.

`hasPermission` supports `GLOBAL`, `BRANCH`, and `TEAM` scope descriptors. It selects only unexpired overrides matching either `GLOBAL/GLOBAL` or the requested scope; if both a grant and deny apply, deny wins. Current domain actions pass branch scope for booking, payment, refund, cancellation, quality, complaint, subscription, task, upload, calendar, workforce, and Operations Manager report decisions. Brand-wide report access uses the global decision. Resource-level branch/team/ownership queries still run independently and cannot be bypassed by a permission grant.

The setup center now provides an audited UI for Owner/System Admin to create, edit, expire, and revoke per-user `UserPermission` overrides for Operations Manager and Employee accounts at `GLOBAL` or `BRANCH` scope. Employee overrides are restricted server-side to the seven specification-approved optional codes: `payment.review`, `booking.accept`, `booking.view_unassigned`, `quality.review`, `payment.record_balance`, `refund.record_proof`, and `booking.close`. It does not edit `Role`/`Permission` definitions or expose `TEAM`-scope authoring. The development seed creates the baseline role and permission rows.

## 5. Capability matrix

| Capability | Customer | Employee | Operations Manager | Owner | System Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| Browse public catalog | Yes | Yes | Yes | Yes | Yes |
| Create booking | Own account | No | No | No | No |
| Manage vehicles/addresses | Own | No | No | No | No |
| Request password recovery | Public generic request for own phone | Public form only | Public form only | Public form only | Public form only |
| Resolve/reject Customer password recovery | No | No | Customers linked to accessible branches | Brand-wide | Brand-wide |
| View booking detail/evidence | Own allowed evidence | Assigned execution evidence only; delegated payment/quality/refund evidence requires the matching scoped grant | Branch | Brand | Brand-wide read; no technician route |
| Upload booking payment/case evidence | Own eligible booking | Assigned-team execution evidence; delegated refund proof only with grant | Branch | Brand | No on booking upload route |
| Execute task/checklist/photos | No | Assigned team | Assigned/branch workflow | Brand | No technician route |
| Review payment and accept booking | No | Only if explicitly granted and branch-scoped | Branch + fine permission | Brand + fine permission | Brand + fine permission |
| Assign/reschedule/release hold | Request only | No; excluded from Employee allowlist and hard role gates | Branch + fine permission | Brand + fine permission | Brand + fine permission |
| Manage customer subscriptions | Own purchase, proof upload/history, and records | No | Branch + fine permission; proof review/activation included, plan definitions excluded | Brand + fine permission | Brand + fine permission |
| Review cancellation/complaint/quality | Submit own request | Quality only with an explicit scoped grant; no cancellation/complaint administration | Branch + fine permission | Brand + fine permission | Brand + fine permission |
| Grant/revoke public gallery consent | Own booking | No | No | No | No |
| Approve/reject/unpublish before/after image | No | No | No | Owner-only; reason required | No |
| Record refund evidence | No | Explicit scoped grant; record only | Branch + fine permission | Brand + fine permission | Brand + fine permission |
| Approve refund | No | No | Branch + fine permission | Brand + fine permission | Brand + fine permission |
| Manage catalog/setup | No | No | Optional `catalog.price.manage` at `/operations/pricing`; price fields only, no `/admin` catalog/setup | Yes | Yes |
| Manage teams/hours/time off | No | No | Authorized branches + default `workforce.manage` | Brand + fine permission | Brand + fine permission |
| Create/update/deactivate Employee accounts | No | No | Authorized branches + explicit `employee.manage` | Brand + fine permission | Brand + fine permission |
| Manager-override close / terminal review | No | No | Branch + `booking.override_close`; close only | Override close + Owner-only reopen/close review | No; hard role gate |
| Manage per-user permission overrides | No | No | No | Operations Manager/Employee targets | Operations Manager/Employee targets |
| View reports/CSV | No | No | Authorized branches + fine permission | Yes | Yes |
| View audit log | No | No | Derived accessible branches + `audit.view` | Brand | Brand |
| Request a branch | No | No | No | Yes | Allowed by action, normally governance reviews Owner requests |
| Approve and create branch | No | No | No | No | Yes |
| Create Owner | No | No | No | No | Yes |

`/staff/delegated` is the UI for the seven Employee optional duties. Its queues are filtered by the applicable branch/team decision before rendering, and the invoked server action repeats role, fine-permission, and resource-scope checks. `refund.record_proof` can upload and record evidence but cannot approve the refund. Employee overrides outside the allowlist are rejected server-side rather than merely hidden.

Subscription payment-proof review is part of `subscription.manage`, not `payment.review`. The Customer can upload only to an owned `PENDING_PAYMENT` subscription and only through an active payment method from its resolved branch. Operations Manager/Owner/System Admin review and activation actions repeat the subscription's branch scope; the private-file read repeats the same ownership/management boundary.

Gallery publication intentionally does not use a fine-permission code. The Customer action verifies ownership, explicit consent, and eligible before/after files. The Owner action requires an accountable reason and cannot approve without Customer consent. Customer revocation removes the approval immediately. Anonymous file access requires both consent and Owner approval timestamps.

Password-reset queue actions also use role plus resource scope rather than a fine-permission code. An Operations Manager can act only when the Customer has a booking in one of that manager's accessible branches; Owner/System Admin are brand-wide. The handler accepts only pending Customer requests, requires a verification/rejection reason, and rejects inactive targets.

## 6. Session and account security effects

- Inactive or soft-deleted users fail session validation.
- Temporary-password accounts are forced to change their password before accessing other protected routes.
- Password reset, password change, role change, account disable/enable, and relevant administrative changes revoke stored sessions by bumping `sessionVersion`.
- System Admin cannot disable the currently signed-in System Admin from the generic activation action, and generic workforce actions cannot promote/manage Owner or System Admin accounts.
- Registration creates the Customer, profile, versioned privacy/booking consents, and audit record in one serializable transaction.

## 7. Audit expectations

Security-sensitive mutations create `AuditLog` and/or `SecurityEvent` records containing actor, action, entity, before/after metadata, reason when required, and timestamp. Database triggers reject UPDATE or DELETE on these logs. Audit visibility does not grant permission to perform the audited operation.
