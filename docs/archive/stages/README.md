# Stage Archive

Stage 1–6 and the pre-stage MVP artifacts are historical evidence. They preserve decisions,
implementation plans, migration reasoning and QA results; they are not the current product manual.

Start with the current [README](../../../README.md), [product](../../product.md),
[architecture](../../architecture.md), [identity/security](../../identity-and-security.md),
[operations](../../operations.md), [testing/release](../../testing-and-release.md),
[roadmap](../../../roadmap.md) and active [Stage 7 spec](../../../specs/2026-07-15-internal-beta-productization-stage7-design.md).

## Source-of-truth rule

Current non-archived specs and the active plan win over this archive. When an archived statement
conflicts with current code/tests/production QA/current documentation, record and resolve the
conflict; do not revive the historical behavior silently.

## Index and old-path map

| Historical area | Archived evidence |
| --- | --- |
| Pre-stage MVP | [spec](pre-stage/2026-07-07-lunch-chrome-extension-design-spec.md), [plan](pre-stage/2026-07-07-lunch-vertical-slice-plan.md), [original Superpowers copies](pre-stage/legacy-superpowers-copy/) |
| Stage 1 | [multi-group design](stage-1/2026-07-08-multi-group-prototype-implementation-design.md), [foundation plan](stage-1/2026-07-08-multi-group-foundation-stage1-plan.md) |
| Stage 2 | [restaurant knowledge plan](stage-2/2026-07-09-group-scoped-restaurant-knowledge-stage2-plan.md) |
| Stage 3 | [recommendation/participation plan](stage-3/2026-07-09-today-recommendation-batch-participation-stage3-plan.md) |
| Stage 4 | [design](stage-4/2026-07-10-prototype-ui-wiring-stage4-design.md), [Extension plan](stage-4/2026-07-10-extension-prototype-ui-wiring-stage4a-plan.md), [Admin plan](stage-4/2026-07-10-admin-prototype-ui-wiring-stage4b-plan.md), [QA files](stage-4/) |
| Stage 5 | [design](stage-5/2026-07-14-dashboard-settings-weights-stage5-design.md), [plans and QA](stage-5/) |
| Stage 6 | [design](stage-6/2026-07-15-deploy-hardening-stage6-design.md), [plan](stage-6/2026-07-15-deploy-hardening-stage6-plan.md), [production QA](stage-6/2026-07-15-deploy-hardening-stage6-qa.md) |
| Cross-cutting policy | [subagent policy design and plan](cross-cutting/) |

The filenames retain their original dates and subjects. Plan and QA suffixes were added only to
avoid collisions after colocating each stage.
