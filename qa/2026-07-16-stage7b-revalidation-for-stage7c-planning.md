# Stage 7B Revalidation For Stage 7C Planning

Status: `Complete`

Date: 2026-07-16

## Outcome

Stage 7B remains complete and is a valid planning baseline for Stage 7C. The repository is clean at
`d7490ac588c85dad873220194c3e4027b27787b8`, `main` matches `origin/main`, the frozen Stage 6 tag
still peels to `1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`, and the current documents consistently
identify Railway deployment `6d80eb52-d35a-4554-9d66-aa44dd2d6b1c` as the Stage 7B production
runtime.

The current source, tests and built artifacts still enforce the Stage 7B boundary:

- Extension no-active-group behavior remains onboarding-only with no recommendation request,
  reminder or legacy fallback.
- The five former unscoped APIs remain JSON 404 routes.
- Identity renewal/link/reset, membership revalidation, rate limits, explicit CORS behavior, safe
  error logging and operator PII tooling remain covered.
- The release artifact contains no old read header, unscoped route or development read token.
- Stage 7C remains the owner of brand/detail consistency, Modal focus containment, QuickAdd
  lost-response safety and the distribution contract.

No production mutation, Railway deployment, Chrome Web Store action, colleague distribution or
Stage 7C implementation was performed during this review.

## Verification

Commands used Node `22.23.1` and pnpm `9.15.0` unless noted.

| Command | Result |
| --- | --- |
| `git status --short --branch` | PASS: clean `main`, aligned with `origin/main` |
| `git log -8 --oneline --decorate` | PASS: `d7490ac feat(stage7b)` is current HEAD |
| `git rev-parse 'v0.1.0-internal^{}'` | PASS: exact Stage 6 baseline |
| `pnpm test` | PASS: 625 tests — Shared 21, Server 265, Admin 78, Extension 261 |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS |
| `pnpm build:railway` | PASS |
| `pnpm check:docs` | PASS: 55 Markdown files / 120 local links |
| `pnpm check:release-artifacts` | PASS: Admin, Extension, MV3 permissions and Railway contract |
| `pnpm check:release-secrets` | PASS: 75 files; no supplied secret values |
| `git diff --check` | PASS |

An initial convenience run under the shell's Node `24.13.0` also passed, but it is not used as the
authoritative comparison because the repository and Stage 7B QA specify Node 22. The complete
verification table above was rerun through `fnm` with Node `22.23.1`.

## Not Re-run

`pnpm --filter @lunch/server migration:rehearse` could not start because the local Docker daemon was
not running:

```text
failed to connect to the docker API at unix:///Users/claus/.docker/run/docker.sock
```

This is an unavailable local prerequisite, not a migration or test assertion failure. The completed
Stage 7B QA remains the latest authoritative evidence for fresh/legacy PostgreSQL migration,
verifier repeatability, overlap abort and the real concurrent refresh assertion. Stage 7C currently
plans no Prisma schema change, but the full migration rehearsal remains a release gate before Stage
7C completion.

No fresh production smoke or live database verifier was run. The production deployment evidence in
[`2026-07-15-internal-beta-productization-stage7b.md`](2026-07-15-internal-beta-productization-stage7b.md)
remains authoritative until a Stage 7C rollout is separately approved and executed.

No subagents were used.

## Planning Decision

Stage 7C may proceed to detailed-plan review. The proposed plan must remain unapproved for execution
until its distribution cost/external actions, exact support channel, store version sequence and
production Extension origin are accepted.
