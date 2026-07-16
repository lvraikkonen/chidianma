# Identity and Security

Status: current baseline plus accepted Stage 7B blockers, 2026-07-15.

## Current lightweight identity

The current product does not have formal accounts. A browser creates an `Identity` with a generated
ID and user-chosen display name. The signed identity Token proves possession of that generated ID;
the display name itself proves nothing and need not be unique.

An identity joins a lunch group through its rotating invite code. The Server then issues a signed
group-session Token. Protected group requests revalidate the route group, membership ID, active
membership status and current role against PostgreSQL.

## What persists where

- Identity, groups, membership, restaurant knowledge, batches, participation and feedback persist
  in PostgreSQL.
- Admin keeps identity/group tokens in same-origin browser `localStorage`.
- Extension keeps tokens and cache in extension-isolated `chrome.storage.local`.
- Clearing browser/Extension storage or changing device loses possession of that local identity.

There is no cross-device recovery, account merge or verified mapping to a real person.

## Invite and removal semantics

- A group invite code grants the ability to join that group; it is not a personal credential.
- Invite codes are Server-generated, HMAC-hashed at rest, rotatable by Admins and versioned.
- A removed membership cannot use its old group session or self-restore with the same identity.
- The same human can create a different identity from another device/display name and attempt to
  join again. Admin removal is therefore a group-membership control, not a human ban.
- The last active Admin cannot be demoted or removed.

## Secret classes

- `SESSION_SECRET` and `DATABASE_URL` are production secrets and must never enter frontend bundles,
  documents, logs or shell output.
- Identity/group tokens and invite codes are bearer capabilities; avoid screenshots and support
  messages containing them.
- `EXTENSION_READ_TOKEN` and `TEAM_INVITE_CODE` are legacy compatibility values, not strong modern
  identity controls. They remain Server-only and are scheduled for removal/disablement in Stage 7B.

## Confirmed pre-beta blockers

1. Legacy unscoped routes remain registered; `/api/session` can mint a shared legacy admin session
   and an unscoped restaurant read is unauthenticated.
2. The Extension falls back to legacy recommendation/feedback routes when no active group exists.
3. Public identity/group/join endpoints do not have proxy-aware rate limiting.
4. CORS reflects arbitrary origins; the replacement policy must cover same-origin Admin, local Vite
   and the selected unpacked/unlisted Extension model without pretending CORS is authentication.
5. The intended production `ALLOW_PUBLIC_GROUP_CREATION` policy needs sanitized verification and a
   documented/tested decision.

Stage 7B closes these with tests. `Teammate` records remain historical attribution unless a separate
spec and migration explicitly preserve and replace that role.

## Open decisions for ADR 0001

- Support/reset flow when storage is cleared or a device is lost.
- PII retention, export, deletion or anonymization and its effect on last-admin/history invariants.
- Whether lightweight identity remains sufficient after observing Stage 7D support burden.

Formal accounts, OAuth, email login and account merging are not approved by the current spec.

## Security response

Suspected Token/invite exposure: rotate the relevant invite or `SESSION_SECRET`/database credential
through controlled operations, invalidate affected sessions as the design permits, inspect
group-scoped activity and avoid copying the secret into an incident report. A suspected isolation
breach follows [the isolation runbook](runbooks/suspected-isolation-breach.md).
