# Identity and Security

Status: Stage 7B production-verified, 2026-07-16.

## Current lightweight identity

The product does not have formal accounts. A device creates an `Identity` with a generated ID and
user-chosen display name. The signed Identity Token proves possession of that generated ID; the
display name itself proves nothing and need not be unique. Every newly issued Identity/Group Token
carries `authVersion`; older versionless Tokens are accepted only against database version zero.

An identity joins a lunch group through its rotating invite code. The Server then issues a signed
group-session Token. Protected group requests revalidate route group, membership ID/identity,
database identity/anonymization/version, active membership status and current role in PostgreSQL.

An already connected device can generate `LINK-XXXX-XXXX-XXXX`: 60 random bits, 10-minute expiry,
single use, HMAC-only at rest. Issuing a new code consumes older pending codes. Reset all connections
increments `authVersion`, deletes pending link codes and returns the current device a new Token.

## What persists where

- Identity, groups, membership, restaurant knowledge, batches, participation and feedback persist
  in PostgreSQL.
- Admin keeps identity/group tokens in same-origin browser `localStorage`.
- Extension keeps tokens and cache in extension-isolated `chrome.storage.local`.
- Clearing every connected device loses possession of the lightweight identity. With no remaining
  Token there is no self-service recovery: create a new identity and rejoin groups.

There is no verified mapping to a real person, account merge or long-term recovery credential.

## Invite and removal semantics

- A group invite code grants the ability to join that group; it is not a personal credential.
- Invite codes are Server-generated, HMAC-hashed at rest, rotatable by Admins and versioned.
- A removed membership cannot use its old group session or self-restore with the same identity.
- The same human can create a different identity from another device/display name and attempt to
  join again. Admin removal is therefore a group-membership control, not a human ban.
- The last active Admin cannot be demoted or removed.
- If the only Admin loses all Tokens, an operator may replace that Admin only after verifying the
  known colleague relationship; this is an operational recovery, not personal identity proof.

## Secret classes

- `SESSION_SECRET` and `DATABASE_URL` are production secrets and must never enter frontend bundles,
  documents, logs or shell output.
- Identity/group Tokens, invite codes and identity link codes are bearer capabilities; avoid screenshots and support
  messages containing them.

The production runtime no longer reads the two legacy compatibility environment values, the
variables have been removed from Railway, and the unscoped legacy API/auth surface is not
registered. Public production group creation is disabled.

## Edge protection

- Single-replica in-memory rate limits protect identity entry, group create/join, session issuance,
  link-code generation and reset. Production client IP uses only a validated Railway `X-Real-IP`,
  otherwise socket IP. A shared store is required before adding replicas.
- CORS allows the exact public origin, local Vite only outside production, and strict
  `chrome-extension://[a-p]{32}` origins. It allows no credentials and is not authentication.
- 500 responses are fixed `internal_error`. Logs whitelist request/Railway IDs, method, route
  template, group/date/operation/retry and classified Prisma code—never headers, body, query,
  display name, bearer values, codes, database URL or raw Prisma message.

`Teammate` records remain historical attribution. Closed routes do not delete historical data.

## PII support and retention

Current identity PII is retained during the controlled beta until an anonymization request. The
support target for export/anonymization is seven days.

- All four operator commands default to dry-run and apply requires the exact printed confirmation.
  `identity:export` then writes a new `0600` JSON file and refuses overwrite. It includes only the
  chosen identity, memberships and that identity's creation/participation/feedback/batch attribution.
  Cross-group last-Admin checks block anonymization
  atomically. Anonymization removes active memberships, clears last-seen, uses one anonymous label,
  increments authorization version and deletes link codes while retaining historical foreign keys.
- There is no self-service delete API. De-identified history remains; final retention is revisited
  with the Stage 7D account decision.

Formal accounts, OAuth, email login, single-device remote revocation and account merging are not
approved. ADR 0001 defines the immediate misuse/operator-recovery/support-rate triggers that force
a formal-account ADR.

## Security response

Suspected Token/invite exposure: rotate the relevant invite or credential through controlled
operations, use reset all connections/operator revoke for identity sessions, inspect
group-scoped activity and avoid copying the secret into an incident report. A suspected isolation
breach follows [the isolation runbook](runbooks/suspected-isolation-breach.md).
