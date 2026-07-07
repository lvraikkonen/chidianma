# Task 2 Report (Shared Types and Scoring Helpers)

Implemented on top of `f8e7246` (branch `codex-lunch-task1`).

## Files Added
- `packages/shared/src/index.ts`
- `packages/shared/src/types.ts`
- `packages/shared/src/api.ts`
- `packages/shared/src/scoring.ts`
- `packages/shared/tests/scoring.test.ts`

## Implemented Contracts
- Added shared API constants: `LUNCH_HEADLINE`, `READ_TOKEN_HEADER`.
- Added shared domain types: `RestaurantStatus`, `FeedbackType`, `WeatherTag`, `WeekdayTag`, `RecommendationItem`, `TodayRecommendationResponse`.
- Added score model types and scorer implementation for weekday/weather/distance/recommendation/penalty logic.
- Re-exported contracts from shared index.

## TDD Evidence
- RED step (test-first) was performed by creating `packages/shared/tests/scoring.test.ts` first.
- Command run after creating the test:
  - `pnpm --filter @lunch/shared test`
  - Result: failing (`No test files found`) due workspace command running in package cwd with Vitest config include pattern (`packages/**/tests/**/*.test.ts`) not matching when scoped from `packages/shared`.
- GREEN step:
  - `pnpm --filter @lunch/shared exec vitest run --config /Users/claus/chidianma/vitest.config.ts --root /Users/claus/chidianma /Users/claus/chidianma/packages/shared/tests/scoring.test.ts`
  - Result: passed, `2 tests` passed.

## Command Verification
- Required command 1 (RED intent): `pnpm --filter @lunch/shared test`
  - Output: failure, no test files discovered (command-level mismatch rather than assertion failure).
- Required command 2: `pnpm --filter @lunch/shared test`
  - Same `No test files found` outcome.
- Required command 3: `pnpm --filter @lunch/shared typecheck`
  - Passed: `tsc -p tsconfig.json --noEmit`.

## Commit
- Commit created: `feat: add shared lunch contracts`

## Concerns
- `packages/shared/package.json` script uses `vitest run tests` and executes from package cwd, which does not match root Vitest include globs for this workspace layout. It prevents the exact `pnpm --filter @lunch/shared test` command from discovering the new test file without extra Vitest path flags.
- Initial `pnpm` runs also required `pnpm install` reconciliation before being able to execute (workspace environment side effect, later resolved via install).

