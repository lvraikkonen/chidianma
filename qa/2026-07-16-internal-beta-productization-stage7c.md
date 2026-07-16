# Stage 7C Internal Beta Brand And Experience QA

Status: `Implementation complete; final candidate QA pending`

Date: 2026-07-16

## Outcome

The Stage 7C implementation is complete in the current workspace:

- deterministic warm-bowl brand assets and shared visual tokens;
- branded Extension popup/options/detail and lightweight Admin brand alignment;
- visible AA-oriented keyboard focus and 40px primary Extension targets;
- complete Admin Modal focus containment helpers and behavior;
- shared Admin/Extension QuickAdd lost-response reconciliation with guarded retry;
- dev/internal Extension build profiles, `0.2.0`, exact production host and stable
  Extension ID `bbkeaogleldgfnkgebdhdbiohlmonbkk`;
- clean-worktree-only package command, checksum/release metadata contract and
  controlled unpacked install/upgrade/rollback documentation.

No REST API, Prisma schema, identity model, Chrome permission category or
production deployment changed.

Stage 7D has not started. A colleague-distribution artifact has not been
generated from this uncommitted workspace.

## Automated verification

Commands used Node `22.23.1` and pnpm `9.15.0`.

| Command | Result |
| --- | --- |
| `pnpm --filter @lunch/server prisma:generate` | PASS after allowing Prisma to update its user cache |
| `pnpm test` | PASS: 646 tests — Shared 31, Server 265, Admin 85, Extension 265 |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS; default Extension build is internal |
| `pnpm --filter @lunch/extension build:dev` | PASS |
| `pnpm build:railway` | PASS |
| `pnpm check:docs` | PASS: 59 Markdown files / 133 local links |
| `pnpm check:release-artifacts` | PASS: Admin, Extension, Server and Railway contract |
| `pnpm check:release-secrets` | PASS: no supplied secrets or tracked private-key file |
| `STAGE7C_REQUIRE_ARTIFACTS=0 pnpm check:stage7c-release` | PASS: both profiles, icons, markup, exact host, stable ID, permissions and legacy-residue checks |
| `git diff --check` | PASS |

The first full test/typecheck attempt after dependency installation failed
because Prisma Client had not yet been generated. After `prisma:generate`, the
unchanged Server suite and all Stage 7C suites passed.

## Brand and accessibility checks

- Canonical SVG:
  [`assets/brand/brand-mark.svg`](../assets/brand/brand-mark.svg).
- Generated 16/32/48/128 PNGs have RGBA output, brand-color pixels, manifest
  references and a measured 12.5% content safety margin.
- The 16px optical variant and 128px notification asset were visually inspected
  as local files.
- Popup, Options, Detail and Admin use the same SVG mark.
- Source/build checks reject the old `♨`, standalone `餐`, font glyph gear,
  character close icon and internal Stage/override wording.
- Primary warm-orange buttons use dark ink rather than white; the measured
  contrast is approximately 4.63:1. Focus indicators use a solid accent-ink
  outline plus a soft halo.
- Popup and Detail now have one persistent document-level `h1`; dynamic state
  and restaurant headings use `h2`.

## QuickAdd recovery checks

Automated coverage includes:

- normal restaurant + recommendation success;
- lost restaurant response with one confirmed new matching record;
- lost recommendation response with confirmed matching current-member content;
- confirmed-missing restaurant and recommendation safe retry;
- read failure and multiple candidates entering `uncertain`;
- matching content from another membership not being treated as this write;
- trimmed strings and de-duplicated/sorted tag comparison;
- same-name/same-area pre-write duplicate stop;
- no write retry from `uncertain`;
- group change before an action and while a write is in flight;
- per-step Admin/Extension context guards that prevent the second old-group
  write after a context change.

## Modal checks

Automated coverage includes:

- autofocus/first-control and dialog fallback;
- forward/reverse looping;
- focus recovery when active focus is outside;
- disabled, hidden, ancestor-hidden and non-visible controls;
- empty dialog fallback;
- Escape blocked while pending;
- restore only to a still-connected trigger.

Focusable controls are queried on every Tab key event so conditional rendering
and disabled-state changes are reflected immediately.

## Build and distribution checks

Internal profile:

- name `中午吃点啥（内部测试）`;
- version `0.2.0`;
- fixed service and sole host permission
  `https://lunchserver-production.up.railway.app/*`;
- public manifest key and computed ID
  `bbkeaogleldgfnkgebdhdbiohlmonbkk`;
- no localhost, Railway wildcard, legacy read token/path or remote font in the
  built runtime;
- advanced API editing hidden, with read-only version/service support details.

Dev profile:

- name `中午吃点啥（开发版）`;
- no internal key;
- localhost plus exact production host;
- advanced API editing enabled;
- separate Extension ID so it can coexist with the internal build.

`pnpm package:extension:internal` was run as a negative gate and correctly
stopped with `extension_package_requires_clean_worktree`. The strict
`pnpm check:stage7c-release` likewise correctly reports
`stage7c_release_artifacts_missing` until a clean committed worktree produces:

```text
artifacts/extension/
  chidianma-extension-0.2.0-internal.zip
  chidianma-extension-0.2.0-internal.sha256
  chidianma-extension-0.2.0-internal.release.json
```

## Manual QA still required at the committed candidate

- Real Chrome light/dark toolbar check for the 16px icon.
- Popup loading, ready, empty, cached, disconnected, error and QuickAdd
  recovery states.
- Options and Detail desktop/narrow layouts and system notification icon.
- Admin desktop/390px layout and live Modal keyboard behavior.
- Load the same fixed-key candidate from two directories and confirm identical
  Extension ID.
- Replace candidate files and Reload; confirm identity, group, reminder and
  cache storage retention.
- Record Chrome version, committed revision and screenshots.
- Deploy the approved Admin-only Railway candidate and run production health,
  static Admin and core API regression smoke before any Stage 7D cohort starts.

Migration rehearsal was not rerun because Stage 7C changes no Server behavior,
Prisma schema or migration.
