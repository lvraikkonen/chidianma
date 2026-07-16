# CLAUDE.md

## Role

Claude Code with gstack is the primary product, UX, architecture, QA,
release-readiness and documentation reviewer for chidianma / 中午吃点啥. Codex
with Superpowers is the primary implementation agent. Do not take over major
implementation or change product behavior without an active spec and plan.

Use the installed gstack skills for the matching review, browsing, QA, release
or documentation workflow. Preserve the role split and record review output in
`specs/` or `qa/` as appropriate.

## Current context

The product has completed Stage 1–6 production QA. The frozen Stage 6 audit
baseline is `1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`. Stage 7A and Stage 7B
are complete. Stage 7C implementation, packaging, Railway QA, real Chrome QA
and final release gates are complete. Stage 7D is Ready for Planning; its
colleague cohort has not started.
The current production runtime is Railway deployment
`a1e581ad-cb05-48b3-b7f9-6db9858b4fb2`, sourced from commit
`2b2e48c063e3df7d5ccd7ac6a5a2b84dbc436497`. Stage 7B deployment
`6d80eb52-d35a-4554-9d66-aa44dd2d6b1c` is the immediate application rollback point.

Current sources:

- `specs/2026-07-15-internal-beta-productization-stage7-design.md`
- `plans/2026-07-15-internal-beta-productization-stage7a.md`
- `plans/2026-07-15-internal-beta-productization-stage7b.md`
- `plans/2026-07-16-internal-beta-productization-stage7c.md`
- `qa/2026-07-15-production-baseline-review-triage.md`
- `qa/2026-07-15-internal-beta-productization-stage7a.md`
- `qa/2026-07-15-internal-beta-productization-stage7b.md`
- `qa/2026-07-16-stage7b-revalidation-for-stage7c-planning.md`
- `qa/2026-07-16-internal-beta-productization-stage7c.md`
- `README.md` and `docs/*.md`
- `roadmap.md`

Historical Stage 1–6 material is audit evidence under
`docs/archive/stages/`; it is not an execution plan. Follow the source order in
`AGENTS.md` and `docs/ai-collaboration-protocol.md`.

## Review boundary

Always check that the product still reduces lunch-decision friction with 2–3
explainable options, calm reminders, minimal Chrome permissions, group
isolation, server-side weather, `OFFICE_TIMEZONE` dates, idempotent reads and
explicit refreshes.

Production Fastify currently serves the built Admin at the same origin. Current
identity is a local lightweight identity plus group-scoped sessions; display
names are not verified accounts. Stage 7B removed the Extension's legacy
unscoped/read-token fallback and corresponding Server routes, added public-entry
controls, and disabled production group creation. Do not reintroduce legacy
paths or silently expand Stage 7C into formal accounts/OAuth. Stage 7C is
complete. Do not start ordinary colleague beta until a current Stage 7D
detailed plan is written and approved.

## Handoff to Codex

Provide a goal, current source documents, non-negotiables, acceptance criteria,
scope exclusions, test expectations and requested follow-up review. A subagent
model constraint is valid only when the active platform can enforce and verify
it; otherwise disclose the limitation instead of claiming compliance.

## Review of Codex output

Verify the active spec/plan, changed files, tests and manual checks, documentation
updates, known issues, secret scans, minimal host permissions, emitted Extension
manifest, and any disclosed subagent use. Full workspace changes should normally
pass `pnpm test`, `pnpm typecheck` and `pnpm build` before release review.
