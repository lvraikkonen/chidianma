# Stage 7A Trusted Baseline And Documentation Closure Plan

Status: `Done`

Date: 2026-07-15

Completion evidence:
[`qa/2026-07-15-internal-beta-productization-stage7a.md`](../qa/2026-07-15-internal-beta-productization-stage7a.md)

## Goal And Boundary

Freeze the production-verified Stage 1–6 release, replace stage-dependent
documentation with a concise current-state product/operations set, preserve
historical plans and QA evidence, complete multi-angle baseline reviews, and
give every known Stage 7A debt an explicit disposition.

Authoritative Stage 7 design:
[`specs/2026-07-15-internal-beta-productization-stage7-design.md`](../specs/2026-07-15-internal-beta-productization-stage7-design.md)

Production implementation baseline:
`1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`.

The current `main` also contains `32d414a`, which records the Stage 6 production
QA without changing the deployed runtime. The release tag must point to the
production implementation baseline, while current documentation may continue
from `main`.

Stage 7A does not change lunch-product behavior, select or implement a formal
account system, redesign the Extension, delete either Railway database, clean
production QA data, prune Git objects, publish a tag/release, or start colleague
beta. Destructive or externally visible actions require their own approval.

The Claude Code multi-angle review is complete. Its accepted triage is recorded
in
[`qa/2026-07-15-production-baseline-review-triage.md`](../qa/2026-07-15-production-baseline-review-triage.md).
The review's proposed rate-limit, CORS, Extension fallback and Server legacy-route
changes alter runtime behavior and therefore belong to Stage 7B, not to an
"immediate" side lane inside this documentation-focused plan.

## Task 1: Freeze Facts Before Moving Files

- Record a clean/dirty worktree snapshot without modifying unrelated user work.
- Verify the full baseline commit, the current `HEAD`, the exact diff between
  them, and the Stage 6 QA claim that the baseline is the deployed revision.
- Inventory all specs, plans, QA reports, README files, operational scripts,
  environment documentation, and incoming links before choosing archive paths.
- Run read-only Git health checks and record the existing `.git/gc.log` warning,
  unreachable-object counts, repository size, refs, and remotes without printing
  credentials.
- Record the current dependency-audit evidence and re-run the production audit
  only with a compatible tool version. Do not upgrade dependencies in this task.

Deliverable: a dated `qa/` baseline inventory containing commands, sanitized
results, and exact unresolved questions.

## Task 2: Create And Verify The Internal Version Boundary

- Create annotated tag `v0.1.0-internal` at the exact full baseline commit, then
  verify its peeled commit. Do not create it at `HEAD` by convenience.
- Add root `CHANGELOG.md` with an `v0.1.0-internal` entry covering the user-facing
  Admin, Extension, recommendation, history/settings, reminder, isolation,
  production and rollback capabilities already verified in Stage 6.
- Add a short root `RELEASE.md` recording the tag/commit, Railway deployment and
  service identifiers, active and rollback database service names, readiness
  verification, migration state, rollback procedure, retained QA data and known
  issues. Reference the Stage 6 QA report instead of duplicating secrets or long
  evidence.
- Treat tag push, remote release creation and artifact upload as separate
  release actions. Stop for approval before performing any of them.
- Treat this tag as an audit boundary for the deployed baseline, not as the
  colleague-beta distribution version. Stage 7C must version the later 7B/7C
  hardened build separately.

Verification:

```bash
git rev-parse 'v0.1.0-internal^{}'
git rev-parse 1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9
git show --no-patch --format=fuller v0.1.0-internal
```

Both revisions must match exactly.

## Task 3: Build The Current-State Documentation Set

Before moving historical files, create and review the current documents:

- `README.md`: product entry, Internal Beta state, core experience, deployed
  Admin/Extension usage, local development, repository map, identity boundary,
  tests/release, Railway operations, limitations, and roadmap.
- `docs/product.md`: current product actors, lunch loop, surfaces, and intentional
  non-goals.
- `docs/architecture.md`: Shared/Server/Admin/Extension boundaries, persistence,
  weather, recommendation batches, cache behavior, deployment topology, and
  links to current contracts.
- `docs/identity-and-security.md`: current lightweight identity/session/invite/
  removal semantics, security limitations, secret classifications, and Stage 7B
  open decisions. This is descriptive in 7A, not the Stage 7B hardening itself.
- `docs/operations.md`: Railway services, health/readiness, migrations, database
  verification, logs, rollback, retained old database, QA data, and incident
  basics.
- `docs/testing-and-release.md`: automated gates, migration rehearsal, artifact
  scans, Chrome QA, release/tag discipline, and evidence locations.
- `docs/decisions/0001-lightweight-identity.md`: create as `Proposed` with current
  facts and Stage 7B decision questions; do not pre-approve an account solution.
- `docs/decisions/0002-extension-distribution.md`: create as `Proposed` with
  unpacked vs unlisted options for Stage 7C; do not claim a decision yet.

Environment documentation lists variable names, purpose, required/optional
status and safe examples only. It must not contain real invite codes, tokens,
session secrets, database URLs or credentials.

Current docs must be checked against code, tests, Railway config and Stage 6 QA.
When those sources disagree, record the conflict and resolve it explicitly;
do not silently copy historical plan language.

## Task 4: Archive Stage 1–6 Without Losing Evidence

- Create `docs/archive/stages/README.md` with the purpose of the archive, the
  current-doc entry points, the source-of-truth rule, and an old-path → new-path
  index.
- Group Stage 1–6 design specs, implementation plans and QA evidence under
  `docs/archive/stages/stage-1/` through `stage-6/`. Preserve meaningful file
  names and Git history; do not delete evidence merely because it is verbose.
- Classify cross-cutting documents that are not owned by one stage before
  moving them. Keep active project instructions and collaboration protocol out
  of the historical archive.
- Update every repository link discovered in Task 1, including links inside
  archived documents where practical. The archive index must supply a path for
  any intentionally unmodified historical link.
- Update `AGENTS.md`, `roadmap.md`, and `docs/ai-collaboration-protocol.md` so
  current specs/current product docs and historical artifacts cannot be
  confused. Remove obsolete execution-baseline statements only after their
  replacements are linked.
- Do not archive the active Stage 7 design or this Stage 7A plan.

Completion requires a link check over all tracked Markdown files and a manual
spot check from README → current docs → roadmap → archive → QA evidence.

## Task 5: Preserve And Apply The Multi-Angle Review

Claude Code completed the product, identity/auth, security/privacy,
architecture/data-integrity, UX/accessibility, operations/release and
maintainability review in
[`reviews/2026-07-15-production-baseline-autoplan-review.md`](../qa/2026-07-15-production-baseline-autoplan-review.md).
Direct source/QA verification produced the accepted triage in
[`qa/2026-07-15-production-baseline-review-triage.md`](../qa/2026-07-15-production-baseline-review-triage.md).

The triage is authoritative over the raw severity roll-up:

- P1-1/P2-7 legacy client and server paths plus P1-2/P2-1 public API protection
  are confirmed 7B blockers.
- P1-3 deployment/hosting documentation is a confirmed 7A blocker.
- P1-4 is split: safe Server error context belongs to 7B; alerting and reminder
  observation belong to the operated beta in 7D. Fastify already emits
  structured Pino logs.
- P3-12 is closed as not reproducible because the verifier ran against real
  fresh, legacy and Railway PostgreSQL databases.
- P2-10 is narrowed to a missing real-PostgreSQL concurrent refresh test.
- The retained `Teammate` attribution model is not deleted as incidental legacy
  cleanup; any removal requires its own current spec and migration evidence.
- PII deletion/anonymization and Extension distribution remain ADR decisions,
  not pre-approved implementations.

During the documentation/archive work, keep the raw review traceable and keep
the accepted triage in `qa/` (or its indexed archive successor). Every remaining
finding must retain evidence, beta-blocking status, target substage and a
disposition (`fix`, `accept-until`, `defer-with-reason`, or
`not-reproducible`).

All 7A–7C blockers must be resolved before the colleague beta. Stage 7D findings
are beta-operation obligations and do not become a pre-beta gate unless a later
spec explicitly changes the Stage 7 blocking model.

## Task 6: Dispose Of The Known Stage 7A Debt Register

### `@fastify/static` advisories

- Identify the exact advisory, affected range, installed path and upstream
  compatible fixed version.
- Prefer a compatible patch/minor upgrade with focused static-hosting tests. If
  no safe compatible fix exists, record the exploitability analysis, existing
  mitigations, owner, acceptance deadline and review trigger in `RELEASE.md` and
  the Stage 7A QA report.
- Do not perform a breaking Fastify/framework upgrade without a separate spec.

### Old Railway rollback database

- Record the service name, purpose, owner, retention deadline, deletion
  prerequisites, backup/restore expectation and verification required before
  deletion.
- Do not delete, disconnect or mutate it in Stage 7A. Deletion remains a
  separately approved destructive operation.

### Production Stage 6 QA data

- Decide between clearly labeled Demo fixture and reviewed targeted cleanup.
- If retaining it, label and document its operational meaning without exposing
  invite values.
- If cleanup is selected, first specify allowed IDs/relationships, dry-run
  counts, invariants, transaction/rollback behavior, backup requirement and
  post-run database verification. Implement and review a targeted script; do
  not run it against production without separate approval.

### Git unreachable objects and `.git/gc.log`

- Capture a restorable repository backup or verified remote/ref recovery path
  before maintenance.
- Diagnose object sources and repository impact with read-only commands first.
- Prefer normal non-pruning maintenance only after review. Any immediate prune,
  reflog expiration or equivalent destructive cleanup requires separate
  approval and is not implied by this plan.

### Extension detail-page visual gap

- Add a reproducible screenshot/state description and Stage 7C acceptance item.
- Do not redesign the page during 7A documentation closure.

## Task 7: Verification And Handoff

Required documentation/release checks:

```bash
git diff --check
git status --short
git rev-parse 'v0.1.0-internal^{}'
```

Also run:

- tracked Markdown local-link validation;
- secret/residue scans covering current docs, archive, built Admin and Extension;
- a supported, reproducible production dependency vulnerability scan with its
  tool version recorded; high/critical findings fail the gate and lower findings
  require explicit disposition. Select the tool from verified current behavior
  rather than assuming `pnpm audit`, `audit-ci`, or OSV compatibility.
- an extended artifact gate that verifies built Extension runtime assets,
  expected background/icon/manifest output and permissions—not only the source
  manifest. It must detect and report the already-triaged development/legacy
  residue; Stage 7B promotes that residue to a blocking failure after removing
  the compatibility path;
- affected tests/typechecks/builds for any dependency, script or runtime change;
- full `pnpm test`, `pnpm typecheck` and `pnpm build` if Stage 7A changes runtime
  dependencies or behavior;
- a read-only production readiness/revision check and database verifier only
  through already-approved operational access, recording sanitized evidence.

Write `qa/2026-07-XX-internal-beta-productization-stage7a.md` with changed files,
tag verification, documentation/link/secret checks, review disposition, debt
decisions, commands run, tests not run and reasons, remaining 7B/7C blockers,
and known issues.

Mark Stage 7A `Done` in this plan and roadmap only when every exit gate in the
Stage 7 design has objective evidence. Then make Stage 7B `Ready for Planning`;
do not write or execute Stage 8 work.

## Completion Checklist

- [x] Baseline facts and read-only repository/dependency evidence recorded.
- [x] `v0.1.0-internal` points exactly to the production implementation commit.
- [x] `CHANGELOG.md` and `RELEASE.md` are accurate, concise and secret-free.
- [x] README plus five current docs and two proposed ADRs are reviewed.
- [x] Stage 1–6 artifacts are indexed and traceable in the archive.
- [x] All tracked Markdown local links pass validation.
- [x] Multi-angle Claude Code / gstack review is completed and its corrected
  triage is accepted in `qa/`.
- [x] Every known debt has an explicit disposition and review condition.
- [x] Relevant automated/release checks pass and omissions are documented.
- [x] Stage 7A QA handoff is complete; no destructive or external release action
  is misreported as completed.
