# Testing and Release

Status: current as of 2026-07-20.

## Automated gates

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm build:railway
pnpm --filter @lunch/extension build:dev
pnpm check:release-artifacts
pnpm check:release-secrets
pnpm check:stage7c-release
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

The opt-in Docker rehearsal deploys migrations to fresh PostgreSQL, runs two concurrent real
recommendation refreshes (two successful batches, exactly one current), migrates a legacy fixture,
checks verifier repeatability and proves overlapping legacy/new batch data aborts atomically.

## Documentation and artifact gates

- Validate every tracked/current Markdown local link.
- Scan current docs, Admin and Extension artifacts for real secret values and forbidden production
  residue without printing the values.
- Verify built Admin HTML/hashed assets and Server production entry points.
- Verify built Extension manifest, MV3 background asset, icons, declared permissions and host
  permissions.
- Build both Extension profiles and verify names, version, internal key/stable ID, default service,
  advanced-host visibility, exact production host and absence of localhost/wildcard values from
  the internal runtime.
- Verify the four PNG icons, canonical SVG copies, safe margins, alpha, brand pixels and manifest
  references.
- Validate the versioned internal ZIP, checksum and release metadata schema. The packaging command
  refuses a dirty or uncommitted worktree.
- Run a supported vulnerability scan against the committed `pnpm-lock.yaml`; record tool version
  and disposition. High/critical findings block release.

The artifact gate fails if built Extension/Server runtime contains an old header, unscoped API path
or development read-token default. It no longer reports legacy residue as an accepted blocker.

## Chrome manual QA

For Extension changes, build `apps/extension/dist` and load it unpacked in real Chrome. Check:

- first-run/onboarding and active-group switching;
- popup/detail/settings loading, empty, error, expired and cached states;
- participation, decision, feedback and history;
- suspended-worker primary reminder, conditional second reminder and decided suppression;
- permissions, notification click behavior and upgrade/reload behavior.

Record Chrome version, build/revision, tested states and untested areas in `qa/`.
For the controlled install/upgrade/rollback flow, use
[Internal Extension Distribution](extension-internal-distribution.md).

## Version semantics

- `v0.1.0-internal` freezes the exact Stage 6 production-QA baseline.
- `v0.1.0-internal` remains a local Stage 6 audit tag; it is not the Stage 7B/7C distributable
  beta version.
- The pushed annotated tag `v0.2.0-internal` freezes the Stage 7D baseline at
  `072ce70abda268f2cdf4fea1a349c16a976e70b5`; it does not assert that this docs-only commit is the
  current Railway runtime.
- Stage 7B is production-verified. Extension `0.2.0` is the Stage 7C candidate boundary and has
  passed automated, Railway and real Chrome exit gates.
- Stage 7D.0 freezes the approved planning baseline. Stage 7D feature flags and explicit cohort
  approval still control colleague rollout.
- `CHANGELOG.md` records user-facing capability; `RELEASE.md` records deployment/database/rollback
  state and known issues.

## Release handoff

Every handoff lists changed files, tests/checks run, manual QA, known issues, skipped checks and
rollback implications. Never claim a tag, deploy, migration, cleanup, push or remote release that
was not objectively verified.
