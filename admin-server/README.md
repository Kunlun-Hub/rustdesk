# RustDesk Admin Server

Self-hosted administration console for a custom RustDesk deployment.

This project implements a clean-room admin backend and Ant Design web console that can receive RustDesk client heartbeats and system information through the existing `api-server` hooks.

## Stack

- PostgreSQL
- Node.js + TypeScript + Express
- Prisma ORM
- React + Ant Design

## Quick Start

```powershell
cd F:\rustdesk\rustdesk\admin-server
copy .env.example .env
docker compose up -d
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run healthcheck
npm run dev
```

The Compose server container runs `prisma migrate deploy` and the compiled seed script on startup after PostgreSQL is healthy. When running the npm commands directly on the host, make sure PostgreSQL is already reachable at `DATABASE_URL` before `npm run prisma:migrate`, `npm run seed`, or `npm run healthcheck`.

`npm run healthcheck` verifies database connectivity, required seed data, permission seed completeness, seeded role permission coverage for `Super Admin` and `External User`, recording directory writability, audit hash-chain integrity, external login provider readiness, public callback URLs, and reports warnings for unsafe development defaults. The result also reports control/data-plane counts for users, roles, permissions, devices, groups, policies, policy receipts, address books, connections, active connections, recordings, login providers, and linked external identities.
The same checks are available to administrators with `system.read` from the web console under `System Health`.

Default backend:

```text
http://localhost:21114
```

Default web console:

```text
http://localhost:5173
```

The compose stack also builds production containers:

```powershell
docker compose up -d --build
```

Production web console:

```text
http://localhost:8080
```

Set `JWT_SECRET`, `SESSION_TTL`, `ADMIN_PASSWORD`, `CLIENT_API_TOKEN`, `PUBLIC_BASE_URL`, `WEB_ORIGIN`, and `VITE_API_BASE` before exposing the stack.

Default admin login comes from `.env`:

```text
admin / admin123456
```

Change it before exposing the service.

## Client Integration

Build your custom RustDesk client with:

```text
api-server = http://your-admin-server:21114
custom-rendezvous-server = your-hbbs
relay-server = your-hbbr
key = your-hbbs-public-key
```

For production, set `CLIENT_API_TOKEN` on the server and have custom clients include the same value on client reporting requests. The backend accepts it as `Authorization: Bearer <token>`, `X-RustDesk-Token`, `X-Client-Token`, or an `access_token`/`token` request field. If `CLIENT_API_TOKEN` is empty, these endpoints stay open for local development and the healthcheck reports a warning.
Client-provided metadata is sanitized before being written to audit logs or business records such as sysinfo, connection metadata, policy receipts, and recording metadata, so body fields like `token`, `access_token`, authorization headers, passwords, and secrets are redacted at rest.

Administrators can also issue per-device client tokens from the Devices table. The token is shown once, stored only as a SHA-256 hash, can be revoked per device, and may be used in the same client token locations as the global token. When a device token is used, the server rejects requests that try to report, pull policy, update connections, or upload recordings for another RustDesk ID.

The current build supports these RustDesk client endpoints:

- `GET /api/login-options`
- `POST /api/login`
- `POST /api/logout`
- `POST /api/currentUser`
- `POST /api/sysinfo`
- `POST /api/sysinfo_ver`
- `POST /api/heartbeat`
- `POST /api/connection/start`
- `POST /api/connection/end`
- `POST /api/connection/:connectionRecordId/end`
- `POST /api/disconnect`
- `POST /api/record`
- `POST /api/record/init`
- `POST /api/record/:recordingId/upload`
- `POST /api/record/:recordingId/chunk`
- `PATCH /api/record/:recordingId`
- `GET /api/record/:recordingId`
- `GET /api/policy/:rustdeskId`
- `POST /api/policy`
- `POST /api/policy/ack`
- `POST /api/policy/report`
- Address book endpoints under `/api/ab`

`POST /api/record` remains a compatibility endpoint for one-shot multipart uploads. Newer clients can create an upload record first, upload the file into that record, and then mark the upload `COMPLETED` or `FAILED` so the admin console can audit interrupted and retried recordings.
For large recordings, clients can upload chunks with `POST /api/record/:recordingId/chunk` as multipart form data. Include `file`, `offset`, optional `totalSize`, optional JSON `metadata`, and `final=true` on the last chunk. The server appends only when `offset` matches the stored byte count and returns `409` with `expectedOffset` when the client should resume from a different byte position. When `totalSize` is provided, chunks that would exceed it are rejected with `413`, and a `final=true` chunk that still falls short returns `409` so the client can continue uploading instead of prematurely completing the recording. Rejected chunks, including malformed metadata JSON, are validated before any file write, keeping the on-disk recording aligned with the database offset for safe retry.
Whole-file uploads and chunks are accepted only while the recording is `UPLOADING`; completed, failed, or removed recordings return `409`. Client status updates follow the same upload lifecycle: only `UPLOADING` records can be patched, clients may mark them `COMPLETED`, `FAILED`, or keep them `UPLOADING`, and terminal recordings cannot be moved back or overwritten by the client.
Recording upload init, one-shot upload, chunk upload, and status updates all reject disabled devices with `403 Device is disabled`.
Client recording status lookup with `GET /api/record/:recordingId` returns upload state, timestamps, size, filename, device ID, and metadata, but never exposes the server-side storage path.

Connection events can still be inferred from `POST /api/heartbeat` `conns`, but custom clients should call `POST /api/connection/start` and `POST /api/connection/end` when a remote session opens or closes. The server keeps one active row per connection, automatically closes older duplicate active rows during refresh/end, returns `duplicateClosed` on explicit end, preserves the original connection metadata while appending `connectionEvents` timeline entries for start/refresh/end, and writes a `DISCONNECT` audit entry when the session ends.
Connection events must include either `connectionId`/`connection_id`/`connId` or `peerRustdeskId`/`peer`/`peer_id`. Heartbeat entries without a stable identity or with invalid timelines are ignored and counted in audit metadata, while explicit start/end calls return `400`; connection timestamps reject `endedAt` values earlier than `startedAt` and client- or administrator-supplied values more than five minutes in the future.
Administrators with `connections.write` can end stuck active connection records from the console with `POST /api/admin/connections/:id/end` or remove erroneous records with `DELETE /api/admin/connections/:id`; both actions are audited with a connection summary including device, peer, direction, connection ID, and timeline fields.
Stale active connection records can be previewed or closed in bulk from the console or with `POST /api/admin/connections/stale-sweep`. Set `CONNECTION_STALE_AFTER_MINUTES` to control the default threshold; request bodies may override it with `staleAfterMinutes` and can set `dryRun` for preview.
The console reports stale-sweep candidates or ended records with the threshold used, and the details table lists the exact active sessions affected before administrators execute the cleanup.
Connection records can be filtered by device, active/ended state, search text, and started time range. Administrators can export the same filtered result set as CSV from the console or with `GET /api/admin/connections/export`; the export writes an `AUDIT_EXPORT` audit event with the filters and row count.

Policy acknowledgements are reported with `POST /api/policy/ack` after a client applies or rejects a policy payload. The console exposes these receipts under `Policy Receipts` and inside each policy assignment dialog, making rollout status auditable per device.
Client policy acknowledgements that include `strategyId` or `strategyIds` are validated before receipt creation: unknown policies return `404`, policies not assigned to the reporting device or its group return `409`, duplicate strategy IDs are collapsed, and a single acknowledgement request can report at most 50 policies.
Policy application receipts can be filtered by device, policy, and status, then exported from the Policy Receipts page or with `GET /api/admin/policy-receipts/export`; the export includes the target device, policy version, hash, status, message, timestamps, metadata, and writes an `AUDIT_EXPORT` audit event.

The policy list also shows rollout counters for `APPLIED`, `FAILED`, `PENDING`, and total receipts so administrators can spot failed policy pushes without opening each policy.
Policies can be filtered by search text, target assignment type, and rollout status. Administrators can export the filtered policy configuration snapshot from the console or with `GET /api/admin/strategies/export`; the export includes assignments, rollout counters, `configOptions`, and `extra`, and writes an `AUDIT_EXPORT` audit event.
Administrators can re-push a policy from the assignment dialog. `POST /api/admin/strategies/:id/repush` resolves all assigned devices and groups, skips disabled devices, creates fresh `PENDING` receipts for the current policy version, and writes a `STRATEGY_PUSH` audit event with targeted, targetable, skipped-disabled, and created receipt counts.
Policy create/update requests reject duplicate names with `409`, policy updates return `404` for missing policies, and policy deletion is blocked with `409` while device or group assignments still reference the policy.
Policy assignment writes are validated before insertion: `POST /api/admin/strategies/:id/assignments` requires exactly one of `deviceId` or `groupId`, returns `404` when the policy or target is missing, returns `409` for duplicate target assignments, and rejects direct assignment to disabled devices. Assignment removal is scoped to the policy ID and writes a target summary to the audit log.
The assignment dialog can also preview the effective policy for a selected device or all devices in a selected group before assignment or re-push. The preview endpoint is `GET /api/admin/strategies/:id/preview?targetType=device|group&targetId=...` and returns the merged config, policy sources, version, and hash.
The console validates policy JSON before saving, so invalid `configOptions` or `extra` input is rejected locally instead of silently replacing the policy body with `{}`.
Policy previews also include `configSources`, a per-key explanation of the winning policy, source level (`device` or `group`), and version so administrators can audit why a device received a specific effective value.

Address books support owner and per-user shares. Clients may pass `userId`, `username`, or `email` to `/api/ab` and `/api/ab/:guid`; anonymous sync without a client token only returns `public` books, while user-scoped sync requires the global client token before returning public books plus `read`/`write` books, books the user owns, and books explicitly shared with that user. Per-device client tokens are limited to anonymous/public address book sync because they are bound to devices, not users.
Address book writes validate owner and share users before insertion or update. Duplicate address book GUIDs return `409`, and missing owner/share users return `404` instead of surfacing database constraint errors.
Address book peer writes require every requested peer tag to exist on the same address book first; missing tags return `404 Address book tags not found` with the missing tag names.
Deleting an address book tag also removes that tag from every peer in the same book in one transaction and records the affected peer count in the audit log, preventing stale peer tag references after taxonomy cleanup.
Address book peer passwords are encrypted before storage with `ADDRESS_BOOK_SECRET_KEY`. Admin address book list and peer APIs only return a `passwordConfigured` flag and never return stored encrypted or plaintext password values; client address book APIs decrypt values for compatible RustDesk sync. Existing plaintext peer passwords remain readable for migration compatibility, but new writes use encrypted storage.
Address books can be filtered by search text, owner, and share rule. Administrators can export the filtered address book list from the console or with `GET /api/admin/address-books/export`; the export includes owner, share users, tag names, peer IDs, and password-protected peer counts, but never exports peer passwords. The export writes an `AUDIT_EXPORT` audit event.
Client address book sync through `/api/ab` and `/api/ab/:guid` writes an `ADDRESS_BOOK_SYNC` audit event with the requesting user, returned book identifiers, and peer/tag counts. Rejected user-scoped sync attempts without global client authentication, including device-token attempts to request another user's address books, are audited too. The audit metadata never includes decrypted peer passwords.

The admin API also supports device maintenance operations:

- `POST /api/admin/devices/offline-sweep`
- `POST /api/admin/devices/bulk`

Devices are marked offline when `lastSeenAt` is older than `DEVICE_OFFLINE_AFTER_SECONDS` during device listing or an explicit sweep. The default threshold is 180 seconds.
Administrators can disable a device from the device edit dialog or bulk actions. Disabled devices remain offline even if they continue reporting, and client endpoints reject their heartbeat, sysinfo, connection, policy, and recording requests with `403 Device is disabled`.
Administrators can rotate or revoke a device's dedicated client token from the same Devices table. Device details show whether a dedicated token is configured, when it was issued, and when it last authenticated.
Device assets can be filtered by search text, online/offline/disabled state, and group. Administrators can export the filtered asset list from the console or with `GET /api/admin/devices/export`; the export includes client token status and related connection, recording, and policy receipt counts and writes an `AUDIT_EXPORT` audit event.
Device create/update and bulk operations validate referenced groups, policies, and selected device IDs before applying changes. Invalid device, group, or policy targets return `404` with the missing IDs instead of surfacing PostgreSQL foreign-key errors; bulk policy assignment skips disabled devices and returns the number of newly created assignments after duplicate assignments are skipped plus the disabled-device skip count.
Device write requests also validate unique identities before writing: conflicting `rustdeskId` or `uuid` values return `409 Device identity already exists` with the conflicting fields instead of surfacing PostgreSQL unique-constraint errors.
Device groups can be filtered by search text and exported from the Groups page or with `GET /api/admin/device-groups/export`; the export includes device counts, policy assignment counts, member RustDesk IDs, strategy names, and writes an `AUDIT_EXPORT` audit event.
Device group create/update requests reject duplicate names with `409`, update missing groups with `404`, and deletion is blocked with `409` while devices or policy assignments still reference the group; the blocked response includes the dependent device and policy-assignment counts.

Recording retention can be previewed or executed from the console or with:

- `POST /api/admin/recordings/retention`
- `POST /api/admin/recordings/upload`

Set `RECORDING_RETENTION_DAYS` to remove old recordings and `RECORDING_RETENTION_MAX_GB` to enforce a total storage cap. `maxTotalGb` set to `0` disables capacity-based cleanup. Retention cleanup records per-file states, treats already-missing files as removable, and keeps records active with failure details when a backing file cannot be deleted. Retention results report `candidateBytes` for the selected set, `reclaimedBytes` for successfully removed records, and `retainedBytesAfterFailure` for bytes left active after delete failures.
The console retention dialog surfaces the same candidate, age/capacity, removed, failed, and reclaimed-byte counts in the operation result message, with the candidate table kept visible for review.
Set `RECORDING_UPLOAD_MAX_MB` to control the maximum size accepted by one-shot, chunk, and administrator recording uploads; the configured value is shown in System Health.
Listing and downloading recordings require `recordings.read`; deletion and retention cleanup require `recordings.write`. Recording deletion removes the backing file before marking the database row `REMOVED`; already-missing files are recorded as `fileState: missing`, while other file deletion failures are audited and return `500` without reporting success.
Administrators with `recordings.write` can also upload completed recording files from the console; uploaded files are stored in `RECORDING_DIR`, linked to an optional device, and audited as `RECORD_UPLOAD`. When an upload specifies `deviceId` or `rustdeskId`, the device must exist or the API returns `404`; recording updates also reject `completedAt` values earlier than `startedAt`.
The console validates recording metadata JSON before saving, preventing malformed metadata edits from being silently persisted as an empty object.
Recording metadata can be filtered by search text, device, and status, then exported from the Recordings page or with `GET /api/admin/recordings/export`; the export includes metadata, device identity, status, timestamps, and byte sizes but does not include recording file contents. The export writes an `AUDIT_EXPORT` audit event.
Recording download and administrator upload failures in the console surface structured API error details, such as missing files, invalid metadata, or missing devices, instead of silently failing or showing raw JSON.

Audit logs can be filtered in the console and exported as CSV with the same filters. The export endpoint is:

- `GET /api/admin/audit-logs/export`

Audit export requires `audit.read` and writes an `auditLogExport` audit entry with the filters, exported row count, export window, truncation flag, and boundary entry hashes.
CSV exports escape spreadsheet formula-like values by prefixing cells that start with `=`, `+`, `-`, `@`, tab, or carriage return, reducing formula-injection risk when auditors open exports in spreadsheet tools.
CSV exports also sanitize object-valued cells such as recording, connection, policy receipt, and audit metadata before serialization, so token, password, secret, credential, authorization, and OAuth verifier fields are redacted even if older or administrator-entered metadata contained them.
Recording downloads are also audited with `RECORD_DOWNLOAD`; stream-open or transfer failures write failed download audit metadata and return `404` or `500` before headers are sent when possible. Audit CSV exports use the dedicated `AUDIT_EXPORT` action so compliance reviewers can filter these sensitive operations directly.
Console CSV export and audit verification actions reuse structured API error formatting, so permission, validation, and backend failures are shown with the returned error details.
User and role administration writes structured audit metadata for changed fields, added or removed role assignments, added or removed permission keys, and password-reset occurrence without recording password values.
User create, update, and bulk role assignment requests validate every requested `roleId` before changing data and return `400 Unknown role ids` for missing roles instead of surfacing database constraint errors or partially applying assignments. Bulk user operations also validate every selected `userId` first and return `404 Users not found` with the missing IDs before changing statuses or role assignments.
User create and update requests also check duplicate local identities before writing: duplicate usernames or email addresses return `409 User already exists` with the conflicting fields instead of surfacing PostgreSQL unique-constraint errors.
The console surfaces bulk user results with updated-user and role-assignment counts, and formats structured API error details such as missing IDs into readable messages instead of raw JSON.
User update, delete, and bulk status changes enforce that at least one `NORMAL` administrator remains; bulk operations evaluate the selected users as a set so one request cannot disable every active administrator. Administrators also cannot disable or demote their own signed-in account through single-user or bulk status operations.
Local account password lifecycle is covered by dedicated endpoints and console dialogs: signed-in local users can change their own password with `POST /api/currentUser/password`, and administrators with `users.write` can reset a user's local password with `POST /api/admin/users/:id/password`. Both actions are audited as `userPassword` updates and never store password values in audit metadata.
Role permission matrices can be exported from the Roles page or with `GET /api/admin/roles/export`; the export includes role descriptions, assigned user counts, permission counts, and permission keys, and writes an `AUDIT_EXPORT` audit event.
Role create and update requests reject duplicate role names with `409`, validate every requested permission key against the seeded permission catalog, and return `400 Unknown permission keys` instead of silently dropping or partially applying invalid permissions. Role deletion is blocked while users still have the role, and the `409` response includes the assigned-user count.
Audit metadata is sanitized before storage: fields whose names look like passwords, tokens, secrets, credentials, authorization headers, or OAuth verifier values are replaced with `[REDACTED]` before the audit hash is computed.
New audit entries are linked with a SHA-256 hash chain. The console can verify the latest audit chain from the Audit page, and the same check is available with:

- `GET /api/admin/audit-logs/verify`

The verifier recomputes each entry hash, checks the previous-hash links, reports legacy rows that were written before hashing existed, and writes an `auditLogVerify` audit event for the verification run including limit, checked row count, total rows scanned, missing-hash count, truncation state, and head hash.

## System Health

Administrators with `system.read` can inspect deployment readiness from the console or via:

- `GET /api/admin/system/health`

The protected health endpoint reuses the same checks as `npm run healthcheck`: database reachability, seed and permission completeness, seeded role permission coverage, recording directory writability, audit hash-chain integrity, enabled external login provider readiness, public callback URL settings, data-plane entity counts, and production-safety warnings for default secrets or open client APIs. It also validates `WEB_ORIGIN` URL entries and warns when `PUBLIC_BASE_URL` or non-localhost web origins use plain HTTP instead of HTTPS.
`SESSION_TTL` controls administrator session lifetime and accepts compact durations such as `30m`, `12h`, or `7d`; the configured value is shown in System Health.
Authentication endpoints are protected by a stricter configurable rate limit. Tune `AUTH_RATE_LIMIT_WINDOW_SECONDS` and `AUTH_RATE_LIMIT_MAX` for local policy; blocked attempts are audited as failed `LOGIN` events on `authRateLimit`.
The container health probe uses `GET /healthz`, a lightweight liveness check that only verifies the server can answer and reach PostgreSQL. Use `GET /health` or the protected system health endpoint for full deployment readiness diagnostics.

## Production Migration

For non-development deployments, run the checked-in migration instead of creating a new dev migration:

```powershell
npm run prisma:generate
npm run prisma:deploy
npm run seed
npm run healthcheck
```

The initial migration lives in `server/prisma/migrations/0001_init/migration.sql`.

## Login Integrations

The backend includes browser-based login flows for:

- OIDC authorization code + PKCE
- Enterprise WeChat scan login
- DingTalk scan login

Configure providers in the console under `Login Providers`, then enable them. `PUBLIC_BASE_URL` must be reachable by the provider callback URL.
The provider table shows readiness diagnostics, missing required fields, linked identity counts, and the exact start/callback URLs to register with OIDC, Enterprise WeChat, or DingTalk. Login options only expose enabled providers whose required fields are ready, and direct start attempts for incomplete providers return `400` with a failed `LOGIN` audit entry listing the missing fields.
Login provider writes reject duplicate providers with the same type and name using `409`. When a provider type is changed, fields from the previous provider type are cleared before validation so stale OIDC, Enterprise WeChat, or DingTalk configuration cannot remain mixed on the same provider.
Deleting a login provider that still has linked external identities returns `409` with `linkedAccounts` unless `force=true` is supplied; forced deletes cascade those identity links and record the affected count in the audit log. The console uses protected delete by default and only exposes a separate force-delete action when linked identities exist.
External login return URLs are restricted to the configured `WEB_ORIGIN` origins plus `PUBLIC_BASE_URL`; rejected, expired-state, provider-mismatch, provider-disabled, incomplete, or upstream callback failures are written to the audit log as failed `LOGIN` events and redirect back to a safe frontend callback URL with an `error` query parameter.
External login start requests with a `returnUrl` outside the allowlist are also audited as failed `LOGIN` events with `return_url_rejected` before continuing with the safe fallback callback URL.
Scan-login callbacks accept `code`, `authCode`, `auth_code`, or `tmp_auth_code` authorization-code query fields for Enterprise WeChat and DingTalk compatibility. Missing-code failures are audited with the received query field names.
External login audit metadata includes `providerType`, `codeField`, profile `source`, and `result` on successful or blocked callbacks so OIDC, Enterprise WeChat, DingTalk OAuth2, and DingTalk SNS fallback paths can be distinguished during incident review.
Successful external callbacks append the session `token` with URL-safe query parameter handling, preserving existing return URL query parameters instead of overwriting them.
The web console starts external login with its current origin as `returnUrl`, consumes the returned session token through `/api/currentUser`, stores the session locally, and removes token or error query parameters from the browser URL.

You can also preconfigure providers with environment variables before running `npm run seed` or `docker compose up -d --build`:

- `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`
- `WECHAT_CORP_ID`, `WECHAT_AGENT_ID`, `WECHAT_SECRET`
- `DINGTALK_APP_KEY`, `DINGTALK_APP_SECRET`

Seed enables a provider only when its required fields are present. Partial provider environment values are stored for later completion in the console but stay disabled.
When editing a provider in the console, leave the secret field blank to keep the existing OIDC client secret, Enterprise WeChat secret, or DingTalk app secret. Provider list, create, and update responses only report whether a secret is set; they never return secret values.
Login provider configuration can be exported from the Login Providers page or with `GET /api/admin/identity-providers/export`; the export includes readiness, missing fields, linked identity counts, callback URLs, and whether secrets are configured, but never includes secret values. Create, update, delete, and export operations write audit events with the same redacted provider summary.

New users created by OIDC, Enterprise WeChat, or DingTalk login use:

- `EXTERNAL_USER_DEFAULT_STATUS`, defaulting to `UNVERIFIED` so an administrator can approve the account before first use.
- `EXTERNAL_USER_DEFAULT_ROLE`, defaulting to the seeded `External User` read-only role. Set it to an empty value to create external users without a role.

If an external identity matches an existing user by email, the login links to that account without changing its current status or roles. Successful and blocked external login audit entries include whether the identity reused an existing link, linked an existing user by email, or created a new user, plus the identity link ID and profile source.
Administrators can approve or disable externally created users one at a time or in bulk from the Users table; `POST /api/admin/users/bulk` can update status and replace role assignments for selected accounts.
User records can be filtered by search text, status, role, and whether an external identity is linked. Administrators can export the filtered user list from the console or with `GET /api/admin/users/export`; the export includes roles and linked identity subjects and writes an `AUDIT_EXPORT` audit event.

Administrators with `users.read` can inspect linked OIDC, Enterprise WeChat, and DingTalk identities from the Users table or through `GET /api/admin/users/:id/identities`; raw provider profile fields are sanitized before storage and again before display so token, secret, authorization, and credential-like values are redacted.
Administrators with `users.write` can unlink an incorrect or retired external identity from the same dialog or with `DELETE /api/admin/users/:id/identities/:identityId`; unlinking writes an `identityProviderAccount` audit event.
Identity provider secrets such as OIDC `clientSecret` and Enterprise WeChat or DingTalk `appSecret` are encrypted at rest with `ADDRESS_BOOK_SECRET_KEY`. Existing plaintext values remain readable for migration compatibility, while newly created, updated, or seeded provider secrets are stored encrypted and never returned by the admin API or CSV export.
