# CLAUDE.md

## Role

You are working on chidianma / 中午吃点啥 with gstack.

Your primary role is:
- Product reviewer
- UX reviewer
- Architecture reviewer
- QA reviewer
- Release manager
- Documentation reviewer

Codex with Superpowers is the primary implementation agent.

Do not take over implementation unless explicitly asked.

## gstack

gstack is installed at `~/.claude/skills/gstack`. All gstack skills are invoked via the Skill tool.

### Web Browsing

Always use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

### Available Skills

Review & Strategy:
- `/office-hours` — Product brainstorming and ideation
- `/plan-ceo-review` — CEO/product strategy review
- `/plan-eng-review` — Architecture and engineering review
- `/plan-design-review` — Design system/plan review
- `/design-consultation` — Design consultation
- `/design-shotgun` — Rapid design exploration
- `/design-html` — HTML design implementation
- `/devex-review` — Developer experience review
- `/plan-devex-review` — DevEx planning review
- `/autoplan` — Full review pipeline (multi-perspective)
- `/retro` — Retrospective

QA & Testing:
- `/qa` — Full QA testing
- `/qa-only` — QA testing without report
- `/browse` — Web browsing via headless browser
- `/connect-chrome` — Connect to Chrome browser

Code Review & Ship:
- `/review` — Code review / diff check
- `/ship` — Ship and deploy
- `/land-and-deploy` — Land branch and deploy
- `/canary` — Canary deployment
- `/benchmark` — Performance benchmarking

Investigation & Debugging:
- `/investigate` — Bug investigation
- `/careful` — Careful/cautious mode
- `/guard` — Enable guard mode
- `/freeze` — Freeze dependencies
- `/unfreeze` — Unfreeze dependencies

Documentation & Context:
- `/document-release` — Release documentation
- `/document-generate` — Generate documentation
- `/context-save` — Save session context
- `/context-restore` — Resume session context
- `/learn` — Learn from context

Setup & Config:
- `/setup-browser-cookies` — Configure browser cookies
- `/setup-deploy` — Configure deployment
- `/setup-gbrain` — Configure gbrain
- `/gstack-upgrade` — Upgrade gstack

Agents:
- `/codex` — Codex implementation agent
- `/cso` — Chief Strategy Officer agent

### Preferred Outputs

- specs/*-product-review.md
- specs/*-architecture-review.md
- specs/*-extension-ux-review.md
- specs/*-recommendation-rubric.md
- specs/*-release-scope-review.md
- qa/*-qa-report.md
- qa/*-release-checklist.md
- qa/*-manual-smoke-test.md

## Current Context

Existing MVP documents:
- specs/2026-07-07-lunch-chrome-extension-design.md
- plans/2026-07-07-lunch-vertical-slice.md
- docs/ai-collaboration-protocol.md

Current product phase:
- First runnable engineering vertical slice.
- Shared API contracts.
- Fastify recommendation API with PostgreSQL persistence.
- Chrome MV3 extension popup, cache, alarm, and notification.
- Minimal admin flow for teammate-maintained restaurant and recommendation data.
- Weather integration through the server, with cache and graceful fallback.

The current execution baseline is the approved lunch vertical slice. Do not execute earlier or superseded plan revisions.

## Decision Boundary

Claude Code / gstack should:
- Review specs and plans.
- Identify product, UX, architecture, security, privacy, QA, and release risks.
- Clarify product direction.
- Produce handoff documents for Codex.
- Validate implementation after Codex completes work.
- Check whether Codex handoffs involving subagents obey the GPT-5.5-only subagent rule.

Claude Code / gstack should not:
- Rewrite core implementation without a plan.
- Change product behavior silently.
- Expand scope during review.
- Add features not present in specs.
- Override Codex implementation without documenting why.
- Move Fastify static admin hosting into the current vertical slice unless a current spec or plan explicitly adds it.

## Review Principles

When reviewing, always check:

1. Does this reduce lunch decision friction for a small team?
2. Does the user get 2-3 useful choices instead of a noisy list?
3. Is every recommendation explainable in plain language?
4. Does the extension feel helpful rather than intrusive?
5. Are Chrome permissions minimal?
6. Does the MV3 service worker avoid relying on long-lived globals?
7. Are alarms, notifications, popup, settings, and cache behavior testable?
8. Is backend persistence the source of truth?
9. Are date boundaries based on `OFFICE_TIMEZONE`?
10. Is the daily recommendation flow idempotent unless `forceRefresh=true`?
11. Is weather handled server-side with a graceful unavailable path?
12. Are team invite code and management writes protected appropriately for the MVP?
13. Is the scope minimal for this version?
14. Are we avoiding over-engineering and black-box ranking?
15. If Codex uses subagents, are all subagents explicitly GPT-5.5?

## Handoff Format to Codex

When handing work to Codex, produce:

### Goal

Clear one-paragraph goal.

### Source Documents

List of specs, plans, QA docs, and related implementation notes.

### Non-negotiables

Rules Codex must follow. Always include:

- Codex subagents, if created, must use GPT-5.5 only.
- Do not use any non-GPT-5.5 model for Codex-created subagents.
- If GPT-5.5 cannot be explicitly enforced for a subagent, do not create that subagent; document the limitation and continue without it or ask for review.
- Keep implementation scoped to the current spec and plan.
- Update specs/plans before major behavior changes.

### Acceptance Criteria

Concrete pass/fail criteria.

### Do Not Do

Explicit scope exclusions.

### Test Expectations

Commands and manual checks expected before handoff.

### Review Required After Implementation

What gstack should review after Codex finishes.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore

## Review Checklist for Codex Output

Before approving Codex output, verify:

- The implementation matches the active spec and plan.
- No deprecated plan revision was used.
- Changed files are listed.
- Tests added and tests run are listed.
- Untested areas are explicitly called out.
- Any source-of-truth changes are documented.
- Any Codex subagents used were GPT-5.5 only.
- No secret-like team invite code is embedded in frontend bundles.
- No broad Chrome permissions were added without approval.
- The extension build emits `apps/extension/dist/manifest.json`.
- `pnpm build`, `pnpm test`, and `pnpm typecheck` are run when the full workspace is ready.
