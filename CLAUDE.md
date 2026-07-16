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

The product has completed Stage 1–6 production QA. The production-verified
runtime baseline is `1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`. Stage 7A is
complete; Stage 7B is Ready for Planning and has no approved implementation plan
yet.

Current sources:

- `specs/2026-07-15-internal-beta-productization-stage7-design.md`
- `plans/2026-07-15-internal-beta-productization-stage7a.md`
- `qa/2026-07-15-production-baseline-review-triage.md`
- `qa/2026-07-15-internal-beta-productization-stage7a.md`
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
names are not verified accounts. The Extension's legacy unscoped/read-token
fallback, corresponding Server routes, public-API controls and explicit group
creation policy are accepted Stage 7B blockers. Do not add features to legacy
paths or silently expand Stage 7B into formal accounts/OAuth.

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
