# Task 2 Report: Prisma Multi-Group Schema

Status: DONE_WITH_CONCERNS

Commit:
- `fb9f7f0 feat: add multi-group prisma foundation`

## What I Implemented

- Updated `apps/server/prisma/schema.prisma` with the Task 2 multi-group foundation:
  - Replaced Prisma `FeedbackType.blocked` with `FeedbackType.avoid`.
  - Added `GroupRole`, `MembershipStatus`, `RecommendationBatchSource`, and `ParticipationStatus`.
  - Added `Identity`, `LunchGroup`, `GroupMembership`, `GroupSettings`, `ScoringWeights`, `DailyParticipation`, `DailyRecommendationBatch`, and `DailyRecommendationItem`.
  - Added `groupId` and membership links to legacy restaurant, recommendation, daily recommendation, weather snapshot, and feedback models.
  - Kept `Teammate` and legacy `DailyRecommendation` for existing route compatibility.
- Created `apps/server/prisma/migrations/20260708195726_multi_group_foundation/migration.sql`.
- Updated `apps/server/.env.example` with:
  - `ALLOW_PUBLIC_GROUP_CREATION=true`
  - `IDENTITY_TOKEN_TTL_DAYS=90`
  - `GROUP_SESSION_TTL_DAYS=14`
- Added `apps/server/src/services/groups/defaultGroup.ts` with `DEFAULT_GROUP_ID = "seed-group-default"`.
- Made narrow legacy route/service compatibility edits so existing routes still write/read the default group:
  - Feedback writes now map request `date` to Prisma `officeDate` and include `groupId`.
  - Restaurant list/create uses the default group.
  - Recommendation admin create uses the default group.
  - Today recommendation reads/writes use the default group and `avoid` feedback instead of `blocked`.
  - Weather snapshot cache uses the new `groupId_date_city` unique key.
- Updated existing server tests to assert the new default-group Prisma write shape.

## Verification Evidence

Baseline before changes:

```bash
pnpm --filter @lunch/server exec prisma validate
```

Output: schema valid.

```bash
pnpm --filter @lunch/server typecheck
```

Output: failed as expected because shared `FeedbackType` included `"avoid"` while Prisma still exposed `"blocked"`:

```text
src/routes/feedback.ts(27,9): error TS2322: Type ... FeedbackType is not assignable ...
Type '"avoid"' is not assignable to type 'FeedbackType'.
```

After schema changes:

```bash
pnpm --filter @lunch/server exec prisma generate
```

Output: generated Prisma Client v6.19.3 successfully.

Required final checks:

```bash
pnpm --filter @lunch/server exec prisma validate
```

Output:

```text
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

```bash
pnpm --filter @lunch/server typecheck
```

Output:

```text
$ tsc -p tsconfig.json --noEmit
```

Additional relevant check after compatibility/test edits:

```bash
pnpm --filter @lunch/server test
```

Output:

```text
Test Files  6 passed (6)
Tests  17 passed (17)
```

Migration tooling:

```bash
pnpm --filter @lunch/server exec prisma migrate dev --name multi_group_foundation
```

Sandboxed output:

```text
Datasource "db": PostgreSQL database "lunch_what", schema "public" at "localhost:5432"
Error: Schema engine error:
```

Escalated rerun output:

```text
Applying migration `20260708195726_multi_group_foundation`
Your database is now in sync with your schema.
```

The escalated run also generated a transient follow-up migration only to rename an over-long index to Prisma's truncated expected name. I folded that rename into `20260708195726_multi_group_foundation/migration.sql` and did not commit the transient second migration.

## Migration Safety Inspection

Inspected `apps/server/prisma/migrations/20260708195726_multi_group_foundation/migration.sql`.

Required ordering is present:

1. Creates new enums and new group tables.
2. Creates default identity/group/membership/settings/weights before legacy backfill:
   - `seed-identity-admin`
   - `seed-group-default`
   - `seed-membership-admin`
   - `group_settings` row for `seed-group-default`
   - `scoring_weights` row for `seed-group-default`
3. Adds legacy `group_id` columns as nullable:
   - `restaurants`
   - `recommendations`
   - `daily_recommendations`
   - `weather_snapshots`
   - `feedback`
4. Backfills old rows with `seed-group-default` before enforcing not-null.
5. Migrates feedback enum values by replacing the PostgreSQL enum and mapping legacy `blocked` to `avoid`.
6. Adds grouped indexes, unique constraints, and foreign keys after backfill.
7. Sets `group_id NOT NULL` only after backfill and FK creation for legacy tables.

The migration also renames `feedback.date` to `feedback.office_date`, drops the old global `restaurants.name` unique index, replaces legacy date/city and date/type indexes with grouped indexes, and makes `recommendations.teammate_id` nullable for compatibility.

## Files Changed

- `apps/server/.env.example`
- `apps/server/prisma/schema.prisma`
- `apps/server/prisma/migrations/20260708195726_multi_group_foundation/migration.sql`
- `apps/server/src/services/groups/defaultGroup.ts`
- `apps/server/src/routes/feedback.ts`
- `apps/server/src/routes/restaurants.ts`
- `apps/server/src/routes/recommendations-admin.ts`
- `apps/server/src/services/recommendation/today.ts`
- `apps/server/src/services/weather/officeWeather.ts`
- `apps/server/tests/feedback.test.ts`
- `apps/server/tests/recommendation.test.ts`

## Self-Review Findings

- No uncommitted repository changes remained immediately after the commit.
- `git diff --check` passed before commit.
- The migration does not add non-null `group_id` columns to populated legacy tables before backfilling them.
- Legacy routes remain on the single default group and do not implement later multi-group routes or group-session behavior.
- Test updates are limited to expected Prisma write shapes after the schema rename/default-group compatibility change.

## Issues Or Concerns

- DONE_WITH_CONCERNS because `prisma migrate dev` failed in the sandbox with a generic Prisma schema-engine error and only succeeded after escalation.
- The local PostgreSQL database used during verification briefly received Prisma's transient follow-up migration before I folded that index rename into the committed migration. The repository contains only the single intended Task 2 migration.
- The migration uses `seed-invite-code-hash` as a placeholder non-null `invite_code_hash`; real invite-code hashing/rotation behavior is intentionally deferred to later group auth tasks.

## Review Fix: Scope Legacy Restaurant Status Patch

Fixed review finding: `PATCH /api/restaurants/:id` now includes `groupId: DEFAULT_GROUP_ID` in the Prisma update `where` clause, preventing the legacy route from mutating restaurants outside the default group. Prisma `P2025` not-found results are returned as `404 { error: "Restaurant not found" }`.

RED:

```bash
pnpm --filter @lunch/server test -- adminRoutes.test.ts
```

Output:

```text
FAIL tests/adminRoutes.test.ts > admin routes > scopes legacy restaurant status updates to the default group
expected "spy" to be called with arguments...
- "groupId": "seed-group-default"
where: { id: "restaurant-1" }
Test Files 1 failed | 5 passed (6)
Tests 1 failed | 17 passed (18)
```

GREEN:

```bash
pnpm --filter @lunch/server test -- adminRoutes.test.ts
```

Output:

```text
Test Files 6 passed (6)
Tests 18 passed (18)
```

```bash
pnpm --filter @lunch/server typecheck
```

Output:

```text
$ tsc -p tsconfig.json --noEmit
```
