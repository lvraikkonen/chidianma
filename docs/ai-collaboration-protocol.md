# chidianma AI Collaboration Protocol

## Agent Split

Claude Code + gstack:
- Thinks, reviews, validates, and releases.
- Owns product, UX, architecture, QA, release readiness, and documentation review.
- Produces or updates specs and handoff documents before implementation work.

Codex + Superpowers:
- Plans, implements, tests, and refactors.
- Owns execution of approved implementation plans.
- Implements in small vertical slices.
- Reports changed files, tests, and known issues before review.

## Golden Rule

Only one agent drives implementation at a time.

Claude Code may review implementation.
Codex may propose product changes.
But neither agent should silently change the other agent’s source-of-truth documents.

If specs, plans, tests, and implementation conflict, document the conflict before changing behavior.

## Model Policy for Codex Subagents

Codex and Superpowers may create subagents only when every created subagent uses GPT-5.5.

This is mandatory.

- GPT-5.5 is the only allowed model for Codex-created subagents.
- Do not create subagents with GPT-4.x, GPT-5, GPT-5 mini, Claude, Gemini, local models, or any other model.
- Do not silently fall back to a different model.
- If a tool or workflow cannot explicitly enforce GPT-5.5 for subagents, do not create subagents. Continue with a non-subagent workflow or document the limitation for reviewer attention.
- Any Codex handoff that used subagents must state that all subagents used GPT-5.5.

Claude Code / gstack review must treat violation of this rule as a blocking process issue.

## Workflow

1. Claude Code + gstack reviews product direction.
2. Claude Code + gstack produces or updates specs.
3. Claude Code + gstack creates a clear handoff to Codex.
4. Codex + Superpowers creates or updates an implementation plan.
5. Codex + Superpowers implements one vertical slice.
6. Codex summarizes implemented changes and test results.
7. Claude Code + gstack reviews UX, architecture, QA, security, privacy, and release readiness.
8. Codex fixes review findings.
9. Docs are updated.

## Required Handoff: Claude/gstack to Codex

- Goal
- Source documents
- Acceptance criteria
- Constraints
- Do-not-do list
- Test expectations
- Review requested after implementation
- Non-negotiable model rule: Codex-created subagents must use GPT-5.5 only

## Required Handoff: Codex to Claude/gstack

- Implemented changes
- Files changed
- Tests added
- Tests run
- Manual checks run
- Known issues
- Source-of-truth updates made
- Review requested
- Subagent disclosure:
  - Whether subagents were used
  - Confirmation that every Codex-created subagent used GPT-5.5
  - If no subagents were used, state that explicitly

## Conflict Resolution

If specs, plans, tests, and implementation conflict:

1. Do not guess.
2. Document the conflict.
3. Prefer specs for product behavior.
4. Prefer plans for current execution order.
5. Prefer tests for current verified behavior.
6. Prefer existing implementation only when specs and plans are silent.
7. Update specs/plans/tests before major code changes.

## Source of Truth Order

Use these documents as source of truth, in this order:

1. specs/
2. plans/
3. docs/ai-collaboration-protocol.md
4. tests
5. existing implementation

Current MVP documents:

- specs/2026-07-07-lunch-chrome-extension-design.md
- plans/2026-07-07-lunch-vertical-slice.md
- docs/ai-collaboration-protocol.md

Do not execute earlier or superseded revisions of the implementation plan.

## chidianma Product North Star

Help a small team decide lunch quickly and pleasantly by turning teammate knowledge into explainable daily recommendations.

The product should make teammates feel:
- I have a good lunch option quickly.
- I understand why this option was recommended.
- The reminder helps me, not interrupts me.
- My team’s recommendations are remembered.

The product should help the team see:
- What restaurants are available.
- Who recommended what.
- Which options fit today’s weekday, weather, distance, and feedback.
- What to improve next.

## Current MVP Boundaries

Build the first runnable vertical slice:

- `packages/shared` shared API contract.
- Fastify server on Railway.
- PostgreSQL persistence through Prisma.
- Chrome Manifest V3 extension.
- Popup display, settings, fallback cache, alarm, and notification.
- Minimal admin flow for teammate-maintained data.
- Server-side weather integration and graceful fallback.

The MVP should not include:

- Formal accounts, OAuth, or complex permissions.
- Delivery, payment, maps, or external restaurant platform integration.
- Complex social feed, comments, ranking, or leaderboard.
- Machine-learning recommendation model.
- Multi-tenant, multi-city, or multi-office platform behavior.
- Broad Chrome permissions such as `<all_urls>`.

## Engineering Guardrails

- Keep changes minimal and scoped.
- Preserve the current plan’s vertical-slice order.
- Use `apps/extension/`, `apps/server/`, `apps/admin/`, and `packages/shared/`.
- Keep shared contracts in `packages/shared`.
- Use Chrome MV3 service worker patterns.
- Persist extension state in `chrome.storage`.
- Use `chrome.alarms` for long-term scheduling.
- Keep notifications calm and useful.
- Use Fastify and Prisma/PostgreSQL.
- Use `OFFICE_TIMEZONE` for recommendation date boundaries.
- Keep `GET /api/today-recommendations` idempotent by default.
- Keep `forceRefresh=true` explicit.
- Keep weather server-side.
- Keep team invite code out of frontend bundles.
- Require signed session tokens for management writes.
- Treat `EXTENSION_READ_TOKEN` as a lightweight public API guard only.

## Done Definition

A task is ready for Claude/gstack review when:

- Implementation matches the active spec and plan.
- Files changed are listed.
- Relevant tests are added or updated.
- Relevant commands have been run.
- Untested areas are disclosed.
- Documentation is updated where behavior changed.
- Any use of Codex subagents is disclosed and confirmed GPT-5.5-only.
