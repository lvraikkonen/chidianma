# Testing and Release

Status: current as of 2026-07-15.

## Automated gates

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm build:railway
pnpm check:release-artifacts
pnpm check:release-secrets
```

The npm audit endpoint used by pnpm 9 and 11 currently returns HTTP 410. For a
release audit, download a pinned official OSV-Scanner binary, verify its
published SHA-256, scan `pnpm-lock.yaml` to JSON, then classify only packages in
the Server production tree:

```bash
osv-scanner scan source --lockfile=pnpm-lock.yaml --format=json --output-file=/tmp/osv.json .
pnpm check:production-vulnerabilities /tmp/osv.json
```

The classifier fails on CVSS high/critical production findings. Medium/low
findings require an explicit release disposition; the full report still makes
development-tool findings visible.

Package-level checks are preferred during development; full monorepo checks are required before a
release-affecting handoff. Behavior changes add tests before implementation when practical.

## Database gates

```bash
pnpm --filter @lunch/server migration:rehearse
```

The opt-in Docker rehearsal deploys migrations to fresh PostgreSQL, migrates a legacy fixture,
checks verifier repeatability and proves overlapping legacy/new batch data aborts atomically. A
real-PostgreSQL concurrent refresh test remains a Stage 7B requirement.

## Documentation and artifact gates

- Validate every tracked/current Markdown local link.
- Scan current docs, Admin and Extension artifacts for real secret values and forbidden production
  residue without printing the values.
- Verify built Admin HTML/hashed assets and Server production entry points.
- Verify built Extension manifest, MV3 background asset, icons, declared permissions and host
  permissions.
- Run a supported vulnerability scan against the committed `pnpm-lock.yaml`; record tool version
  and disposition. High/critical findings block release.

Known legacy fallback/dev placeholders are Stage 7B blockers and must be reported during 7A rather
than silently normalized as a distributable build.

## Chrome manual QA

For Extension changes, build `apps/extension/dist` and load it unpacked in real Chrome. Check:

- first-run/onboarding and active-group switching;
- popup/detail/settings loading, empty, error, expired and cached states;
- participation, decision, feedback and history;
- suspended-worker primary reminder, conditional second reminder and decided suppression;
- permissions, notification click behavior and upgrade/reload behavior.

Record Chrome version, build/revision, tested states and untested areas in `qa/`.

## Version semantics

- `v0.1.0-internal` freezes the exact Stage 6 production-QA baseline.
- The tag is local until separately approved for push; it is not the Stage 7B/7C distributable
  beta version.
- The hardened client/server pair receives a new version after 7B and 7C pass.
- `CHANGELOG.md` records user-facing capability; `RELEASE.md` records deployment/database/rollback
  state and known issues.

## Release handoff

Every handoff lists changed files, tests/checks run, manual QA, known issues, skipped checks and
rollback implications. Never claim a tag, deploy, migration, cleanup, push or remote release that
was not objectively verified.
