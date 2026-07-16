# Stage 7A Internal Beta Productization QA

Status: `Passed`

Date: 2026-07-15

## Outcome

Stage 7A is complete. The production-tested runtime implementation is frozen at
`1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9` by the local annotated tag
`v0.1.0-internal`; current product/architecture/security/operations/release
documentation no longer depends on reading Stage 1–6 plans; historical evidence
is preserved in an indexed archive; the accepted Claude Code review triage and
all known Stage 7A debts have explicit dispositions.

This is an audit baseline, not a colleague-distribution approval. Stage 7B and
7C remain blocking gates.

## Baseline and production evidence

- Tag peel: `v0.1.0-internal^{}` =
  `1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`.
- `HEAD` and `origin/main` at the start of 7A:
  `32d414a289c57d6ce0488448e612e8943b446a31`.
- `git diff 1eb7dbb..32d414a` contains only the Stage 6 plan, QA and roadmap
  records; no runtime implementation differs.
- Stage 6 production-QA deployment:
  `10f427de-858e-42f1-8c0c-23194180d4d8` at `1eb7dbb...`; Railway now records it
  as `REMOVED` after the later deployment.
- Current Railway deployment:
  `c85ac2ab-b43a-42d6-9b55-cf75322ff993`, status `SUCCESS`, revision
  `32d414a...`.
- Live read-only check on 2026-07-15: `/api/health` returned `{"ok":true}` and
  `/api/ready` returned HTTP 200 with database `ready` and revision `32d414a...`.
- Active PostgreSQL: `Postgres-W12K`; retained rollback service: `Postgres`.

The tag is local only. It was not pushed and no remote release or release
artifact was created.

## Recovery point and repository health

A pre-maintenance bundle was created at
`/private/tmp/chidianma-stage7a-pre-maintenance-2026-07-15.bundle` and
`git bundle verify` confirmed that it records the complete committed history and
the internal tag. It does not contain uncommitted 7A work.

Read-only repository inspection recorded:

- 14,507 loose objects using approximately 159.13 MiB;
- 1,071 packed objects in 35 packs using approximately 764.26 KiB;
- no objects classified by `git count-objects` as garbage;
- many unreachable loose objects from `git fsck --no-reflogs --unreachable`;
- `.git/gc.log` still blocks automatic GC and recommends pruning.

No prune, reflog expiry, destructive GC, reset, or object deletion was run.

## Documentation and archive

Created or replaced the current entry set:

- root `README.md`, `CHANGELOG.md` and `RELEASE.md`;
- `docs/product.md`, `docs/architecture.md`,
  `docs/identity-and-security.md`, `docs/operations.md` and
  `docs/testing-and-release.md`;
- proposed ADRs `docs/decisions/0001-lightweight-identity.md` and
  `docs/decisions/0002-extension-distribution.md`;
- rollback, reminder, migration-failure and suspected-isolation-breach runbooks;
- current Server/Extension READMEs, `AGENTS.md`, `CLAUDE.md` and the AI
  collaboration protocol.

Twenty-seven historical artifacts were moved by
`scripts/archive-stage-docs.mjs` into `docs/archive/stages/`, grouped as
pre-stage, Stage 1–6 and cross-cutting evidence. The two historical
`docs/superpowers` copies were byte-identical to their canonical pre-stage
artifacts and remain in an explicitly named legacy-copy directory for audit.
The archive index records the source-of-truth rule and path mapping.

`scripts/check-markdown-links.mjs` now supplies a repeatable local-link gate.
The final scan covers all repository Markdown, including the archive.

## Review disposition

The raw Claude Code multi-angle review is retained at
`qa/2026-07-15-production-baseline-autoplan-review.md`. Its corrected,
authoritative triage is
`qa/2026-07-15-production-baseline-review-triage.md`.

- Legacy Extension fallback, Server routes/shared auth, rate limiting, tested
  Origin policy, explicit group-creation policy, safe business error context and
  real-PostgreSQL refresh concurrency belong to 7B.
- Distribution/upgrade contract, detail-page and brand consistency, Modal focus
  behavior and QuickAdd lost-response idempotency belong to 7C.
- Alerting and privacy-bounded reminder observation belong to the operated beta
  in 7D.
- The real-PostgreSQL database verifier finding is closed as not reproducible;
  retained teammate attribution and PII semantics require explicit later
  decisions rather than incidental deletion.

## Dependency audit

`pnpm@11.0.0 audit --prod` was attempted with network access and failed because
the npm audit endpoint returned HTTP 410. This is a tool/endpoint failure, not a
clean scan.

The supported replacement was the official OSV-Scanner `v2.4.0` Darwin amd64
binary. Its SHA-256 matched the published value:

`088119325156321c34c456ac3703d6013538fd71cbac82b891ab34db491e4d66`

The full `pnpm-lock.yaml` scan found seven advisories in four packages. The
repeatable classifier `scripts/classify-production-osv-report.mjs` intersected
that report with `pnpm --filter @lunch/server list --prod --depth Infinity`:

- 121 production package versions classified;
- 0 critical, 0 high, 2 medium, 0 low;
- `@fastify/static@8.0.0`:
  `GHSA-pr96-94w5-mx2h` (CVSS 5.3) and
  `GHSA-x428-ghpx-8j92` (CVSS 5.9), fixed in `9.1.1`.

The current configuration does not enable directory listing and serves only
public Admin build files from the static root. The encoded-path finding still
has no upstream workaround, so both findings remain real. Official package
metadata says `@fastify/static >=8` supports Fastify 5, but `9.1.1` is a plugin
major and changes runtime dependencies. Owner: repository maintainer. Decision:
accept only until Stage 7B exits or 2026-07-22, whichever is first, then upgrade
with static-hosting regression tests. Reopen immediately if protected files or
static route guards are introduced.

The non-production portion of the full report contains a critical Vitest, a
high plus two medium Vite, and a medium esbuild advisory. These packages are not
in the Server production dependency tree. They remain a tested maintenance item
before the next distributable build; they do not pass silently as production
findings.

## Known debt dispositions

| Debt | Decision / owner | Review condition |
| --- | --- | --- |
| `@fastify/static` advisories | Time-limited acceptance by repository maintainer; upgrade/test in 7B or a dedicated maintenance slice | 7B exit or 2026-07-22; earlier on static-root/auth changes |
| Old Railway `Postgres` rollback DB | Retain; product/operations owner; no automatic deletion | Stage 7D complete + 14 days, operational review 2026-08-15, verified backup/restore and DB verifier, separate destructive approval |
| Stage 6 production QA data | Retain as clearly named Demo/smoke fixtures; product/operations owner; no cleanup script run | Review before expanding beyond the first 7D cohort or if real-user confusion/privacy risk appears |
| Unreachable Git objects / `gc.log` | Keep bundle recovery point; repository maintainer; no prune in 7A | Reassess after 7A work is committed/backed up or by 2026-07-22; prune/reflog expiry still needs separate approval |
| Extension standalone detail visual gap | Fix in 7C; Extension/product owner | 7C visual-consistency and real-Chrome acceptance gate |

Detail-page reproduction: build/load `apps/extension/dist`, establish an active
group with a current batch, open `detail.html`, and inspect the header Settings,
four feedback and decision buttons. `apps/extension/styles/detail.css` has no
rules for their emitted classes (`detail-settings-action`, `feedback-button`,
`decision-button`), so they render as raw browser-default controls while the
surrounding cards use the product theme. Stage 7C acceptance: match the shared
button language, provide at least a 40px target, visible keyboard focus and
disabled/pending states across narrow and desktop layouts.

## Automated verification

All commands below ran with Node `22.23.1` and pnpm `9.15.0` unless noted:

| Command | Result |
| --- | --- |
| `pnpm test` | PASS: Shared, Server, Admin and Extension suites |
| `pnpm typecheck` | PASS after narrowing the Admin Dashboard test fixture helper to its `ready` union member |
| `pnpm build` | PASS: Shared, Server, Admin and Extension |
| `pnpm build:railway` | PASS: Shared → Prisma client → Admin → Server |
| `pnpm check:docs` | PASS |
| `pnpm check:release-secrets` | PASS; Markdown plus built Admin/Extension scanned, no real secret environment values were supplied to the process |
| `pnpm check:release-artifacts` | PASS: Admin output, 20 Extension files, background/icons/pages, MV3 permissions and Railway contract |
| `pnpm check:production-vulnerabilities /private/tmp/chidianma-osv-v2.4.0.json` | PASS production threshold: 0 critical/high; 2 medium explicitly accepted above |
| `git diff --check` | PASS |
| Markdown local-link scan | PASS: 52 files / 122 local links, including this report |
| Tag peel comparison | PASS: exact full baseline commit |

The artifact gate intentionally reports three known 7B blockers rather than
claiming they were removed in 7A: development read-token residue, the unscoped
recommendation path and the legacy read header.

## Not run and non-actions

- No migration rehearsal: Stage 7A adds no migration or schema change; Stage 6
  fresh/legacy/live PostgreSQL evidence remains authoritative.
- No new production database verifier invocation: no runtime, schema or data
  changed, the live readiness database probe passed, and the Stage 6 post-QA
  verifier remains the latest approved full invariant check.
- No new manual Chrome smoke or visual screenshot: no Extension runtime/UI code
  changed. The Stage 6 real-Chrome QA remains valid; the 7C detail gap is
  reproducible from source and recorded above.
- No Railway deploy, production data cleanup, rollback database mutation, Git
  pruning, tag push, remote release, or colleague distribution was performed.
- No subagents were used.

## Remaining colleague-beta blockers

Stage 7B must close the legacy identity/API fallback, public API protection,
Origin and group-creation policy, safe error context and real PostgreSQL
concurrency evidence. Stage 7C must close brand/detail/accessibility/idempotency
issues and choose a versioned distribution/upgrade contract. Only then can the
ordinary colleague beta begin as Stage 7D.
