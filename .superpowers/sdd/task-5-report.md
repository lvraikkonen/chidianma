# Task 5 Report: Group Identity, Create, Join, List, And Session Routes

## Status

Implemented and committed Task 5 on `stage1-multi-group-foundation`.

Commit:

```text
164f223 feat: add group identity and join routes
```

No Codex subagents were created.

## Files Changed

- `apps/server/src/routes/groups.ts`
- `apps/server/src/app.ts`
- `apps/server/tests/groups.test.ts`

## What Changed

- Added `registerGroupRoutes()` with:
  - `POST /api/identities`
  - `POST /api/groups`
  - `POST /api/groups/join`
  - `GET /api/groups`
  - `POST /api/groups/:groupId/session`
- Registered group routes immediately after health routes in `buildApp()`.
- Added route-level group tests using an in-memory Prisma mock fixture.
- Covered identity creation, identity reuse, group creation, group listing, missing/tampered/expired identity tokens, invite-code join, existing-identity join, idempotent active-member join, removed-member rejection, and identity-to-group-session exchange.

## TDD Evidence

### RED 1: Create/List Routes Missing

Command:

```bash
pnpm --filter @lunch/server test -- groups.test.ts
```

Output excerpt:

```text
FAIL  tests/groups.test.ts > group routes > creates an identity and group, then lists active memberships
AssertionError: expected 404 to be 200

FAIL  tests/groups.test.ts > group routes > reuses an existing identity when creating a second group
AssertionError: expected 404 to be 200

FAIL  tests/groups.test.ts > group routes > returns 401 for missing and tampered identity tokens
AssertionError: expected 404 to be 401

FAIL  tests/groups.test.ts > group routes > returns 401 for expired identity tokens
AssertionError: expected 404 to be 401
```

### GREEN 1: Create/List Routes Pass

Command:

```bash
pnpm --filter @lunch/server test -- groups.test.ts
```

Output excerpt:

```text
✓ tests/groups.test.ts (12 tests) 214ms
Test Files  8 passed (8)
Tests  35 passed (35)
```

### RED 2: Join/Session Routes Missing

Command:

```bash
pnpm --filter @lunch/server test -- groups.test.ts
```

Output excerpt:

```text
FAIL  tests/groups.test.ts > group routes > joins a group with invite code and exchanges identity token for group session
AssertionError: expected 404 to be 200

FAIL  tests/groups.test.ts > group routes > reuses an existing identity when joining another group
AssertionError: expected 404 to be 200

FAIL  tests/groups.test.ts > group routes > joining an already-active group is idempotent and returns a fresh session
AssertionError: expected 404 to be 200

FAIL  tests/groups.test.ts > group routes > rejects removed members when joining an existing group
AssertionError: expected 404 to be 403
```

### GREEN 2: Full Route Set Passes

Command:

```bash
pnpm --filter @lunch/server test -- groups.test.ts
```

Output excerpt:

```text
✓ tests/groups.test.ts (16 tests) 322ms
Test Files  8 passed (8)
Tests  39 passed (39)
```

## Verification

Commands run:

```bash
pnpm --filter @lunch/server test -- groups.test.ts
pnpm --filter @lunch/server typecheck
git diff --check
```

Results:

- `pnpm --filter @lunch/server test -- groups.test.ts` exited 0 with `8 passed` test files and `39 passed` tests.
- `pnpm --filter @lunch/server typecheck` exited 0.
- `git diff --check` exited 0.

## Self-Review

- Scope stayed within Task 5 files.
- New group routes use identity tokens for optional/required Authorization, not group-session tokens and not `X-Lunch-Read-Token`.
- Missing, invalid, tampered, expired, and no-longer-valid identity tokens are converted through stable `AuthError`-derived responses.
- `POST /api/groups` and `POST /api/groups/join` reuse valid existing identities and create identities only when no identity token is supplied.
- Group creation writes group, admin membership, group settings, and scoring weights inside a transaction.
- Join is idempotent for active memberships and rejects removed memberships with `removed_member`.
- `GET /api/groups` lists active memberships ordered by `joinedAt`.
- `POST /api/groups/:groupId/session` requires an active membership before issuing a group session token.

## Concerns

- Git commit succeeded, but git printed an unrelated repository maintenance warning about an existing `.git/gc.log` and many unreachable loose objects. I did not modify repository maintenance state.

## Review Fix: Stable 400s For Malformed Group Route Bodies

Fixed the Important review finding for malformed or missing request bodies in:

- `POST /api/identities`
- `POST /api/groups`
- `POST /api/groups/join`

### RED Evidence

Command:

```bash
pnpm --filter @lunch/server test -- groups.test.ts
```

Output excerpt:

```text
FAIL  tests/groups.test.ts > group routes > returns 400 for missing and malformed identity creation bodies
AssertionError: expected 500 to be 400

FAIL  tests/groups.test.ts > group routes > returns 400 for missing and malformed group creation bodies
AssertionError: expected 500 to be 400

FAIL  tests/groups.test.ts > group routes > returns 400 for missing and malformed group join bodies
AssertionError: expected 500 to be 400
```

### GREEN Evidence

Commands:

```bash
pnpm --filter @lunch/server test -- groups.test.ts
pnpm --filter @lunch/server typecheck
git diff --check
```

Results:

- `pnpm --filter @lunch/server test -- groups.test.ts` exited 0 with `8 passed` test files and `42 passed` tests.
- `pnpm --filter @lunch/server typecheck` exited 0.
- `git diff --check` exited 0.

No Codex subagents were created.

## Review Fix: Separate Identity And Group Session Tokens

Fixed the Important review finding where signed group session tokens could be accepted by identity-token routes because both token shapes contain `identityId` and `exp`.

- Hardened `verifyIdentityToken()` to reject claims containing group-session-only fields: `groupId`, `membershipId`, or `role`.
- Added a token-level regression test for `verifyIdentityToken()` rejecting a signed group session token with `invalid_token`.
- Added route-level regression tests proving a real `groupSessionToken` from `POST /api/groups` is rejected with `401` and `invalid_token` by:
  - `GET /api/groups`
  - `POST /api/groups`
  - `POST /api/groups/join`
  - `POST /api/groups/:groupId/session`

### RED Evidence

Command:

```bash
pnpm --filter @lunch/server test -- groupTokens.test.ts groups.test.ts
```

Output excerpt:

```text
FAIL  tests/groupTokens.test.ts > multi-group signed tokens > rejects signed group session tokens as identity tokens
AssertionError: expected undefined to be an instance of AuthError

FAIL  tests/groups.test.ts > group routes > rejects a group session token when listing groups with an identity token
AssertionError: expected 200 to be 401

FAIL  tests/groups.test.ts > group routes > rejects a group session token when creating a group with an identity token
AssertionError: expected 200 to be 401

FAIL  tests/groups.test.ts > group routes > rejects a group session token when joining a group with an identity token
AssertionError: expected 200 to be 401

FAIL  tests/groups.test.ts > group routes > rejects a group session token when exchanging an identity token for a group session
AssertionError: expected 200 to be 401
```

### GREEN Evidence

Commands:

```bash
pnpm --filter @lunch/server test -- groupTokens.test.ts groups.test.ts
pnpm --filter @lunch/server typecheck
git diff --check
```

Results:

- `pnpm --filter @lunch/server test -- groupTokens.test.ts groups.test.ts` exited 0 with `8 passed` test files and `47 passed` tests.
- `pnpm --filter @lunch/server typecheck` exited 0.
- `git diff --check` exited 0.

No Codex subagents were created.
