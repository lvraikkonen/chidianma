# AGENTS.md

## Project

chidianma / 中午吃点啥 is a small-team lunch recommendation product built as a Chrome Manifest V3 extension plus a lightweight Fastify backend and PostgreSQL database.

The product goal is not to become a full restaurant, delivery, map, or social review platform. The goal is to help a team reduce lunch decision friction through a simple loop:

Team recommendations → daily ranking → 2-3 explainable lunch choices → lightweight feedback → better future suggestions.

The first version should help teammates feel:
- I have a good lunch option quickly.
- I know why this option was recommended.
- The reminder is useful, not annoying.
- My team’s real recommendations are being preserved.

## Primary Development Agent

Codex with Superpowers is the primary implementation agent.

Responsibilities:
- Follow specs and plans.
- Use Superpowers workflows for specs, planning, implementation, testing, and review.
- Implement in small vertical slices.
- Use TDD whenever practical.
- Write or update tests before behavior changes.
- Preserve existing MVP behavior unless the spec explicitly changes it.
- Update relevant documentation after implementation.
- Summarize changed files, tests added, tests run, and known issues before handoff.

### Codex Subagent Model Requirement

When Codex or Superpowers creates any subagent, the subagent must use GPT-5.5.

This is a hard project rule.

- Do not create Codex subagents with any model other than GPT-5.5.
- Do not substitute GPT-4.x, GPT-5, GPT-5 mini, Claude, Gemini, local models, or any other model.
- Do not silently fall back to another model.
- If the tool cannot explicitly enforce GPT-5.5 for a subagent, do not create that subagent. Document the limitation and continue with a non-subagent workflow or ask for review.
- This applies to implementation, testing, code review, research, QA, refactoring, and plan execution subagents.

## Claude Code / gstack Role

Claude Code with gstack is primarily used for:
- Product review
- UX review
- Architecture review
- QA review
- Release readiness review
- Documentation review

Claude Code / gstack may propose implementation changes, but major behavior changes must be reflected in specs and plans before coding.

Claude Code / gstack should also verify that any Codex handoff or implementation report involving subagents confirms the GPT-5.5-only subagent rule.

## Source of Truth

Use these documents as source of truth, in this order:

1. specs/
2. plans/
3. docs/ai-collaboration-protocol.md
4. tests
5. existing implementation

If implementation conflicts with specs, do not silently change behavior. Report the conflict and update the relevant spec or plan first.

## Current MVP Documents

- specs/2026-07-07-lunch-chrome-extension-design.md
- plans/2026-07-07-lunch-vertical-slice.md
- docs/ai-collaboration-protocol.md

The current execution baseline is the approved lunch vertical slice. Do not execute earlier or superseded revisions of the plan.

## Product Principles

- Reduce lunch decision time for a small team.
- Recommend 2-3 options, not an overwhelming list.
- Every recommendation needs a readable reason.
- Prefer explainable scoring over black-box ranking.
- Preserve team-contributed restaurant and dish knowledge.
- Keep the Chrome extension calm: useful reminder, no aggressive interruption.
- Keep permissions minimal.
- Use backend persistence as the source of truth; do not rely only on extension local storage.
- Cache the last successful recommendation so the extension remains useful when the backend is temporarily unavailable.
- Treat weather as a useful signal, not a hard dependency.
- Keep the team invite code out of frontend bundles.
- Do not pretend `EXTENSION_READ_TOKEN` is a strong secret; it is only a lightweight public API guard.

## Engineering Rules

- Keep changes minimal and scoped.
- Do not rewrite unrelated modules.
- Do not introduce large abstractions without a spec.
- Do not add a new framework without explicit approval.
- Use the pnpm TypeScript monorepo structure:
  - `apps/extension/`
  - `apps/server/`
  - `apps/admin/`
  - `packages/shared/`
- Shared API contracts belong in `packages/shared` so the extension, server, and admin do not invent incompatible response structures.
- Chrome extension must use Manifest V3.
- Chrome service worker state must persist through `chrome.storage`; do not rely on long-lived globals.
- Chrome extension uses `chrome.alarms`, not `setTimeout` or `setInterval`, for long-term scheduling.
- Extension tests must not import side-effectful `background.ts`; pure scheduling logic belongs in `alarmSchedule.ts`.
- Extension manifest must be emitted to `apps/extension/dist/manifest.json`.
- Plugin permissions stay minimal: `alarms`, `notifications`, `storage`, and specific API host permissions.
- Server framework is Fastify.
- Server deploy target is Railway.
- Fastify on Railway must listen with `host: "::"` and `port: Number(process.env.PORT ?? 3000)`.
- Database is PostgreSQL through Prisma.
- Database migrations must include tests or verification steps.
- Recommendation API date boundaries use `OFFICE_TIMEZONE`, not server or user machine timezone.
- `GET /api/today-recommendations` is idempotent by default for the same office date.
- `GET /api/today-recommendations?forceRefresh=true` creates a new current batch and keeps old batches for review.
- Recommendation batch creation must use a transaction to avoid duplicate current batches around the lunch reminder time.
- Plugin recommendation requests include `X-Lunch-Read-Token`.
- Weather is called only by the server, never by the extension.
- After real weather is integrated, use `weather_snapshots` plus Open-Meteo-style fetching.
- If neither cached nor fetched weather is available, do not use rainy mock weather for scoring; return `weatherUnavailable=true` and score with `weatherMatch=0`.
- Management auth uses a short-lived signed session token created from teammate name + team invite code.
- Management write APIs must require `Authorization: Bearer <session-token>`.
- Admin frontend must never hardcode `TEAM_INVITE_CODE`; the invite input default is an empty string.
- Fastify static hosting of the production admin build is deploy-hardening work unless a current spec or plan explicitly includes it.

## Testing Rules

Before completing a task:
- Run relevant unit tests.
- Run relevant integration tests where available.
- Add tests for new behavior.
- Run relevant typechecks.
- Build affected packages when behavior touches frontend, extension, or shared contracts.
- Summarize what was tested and what was not tested.

Expected common checks:

```bash
pnpm build
pnpm test
pnpm typecheck
```

Package-specific checks may include:

```bash
pnpm --filter @lunch/server test
pnpm --filter @lunch/server typecheck
pnpm --filter @lunch/extension test
pnpm --filter @lunch/extension typecheck
pnpm --filter @lunch/extension build
pnpm --filter @lunch/admin typecheck
```

For Chrome extension work, manually smoke test `apps/extension/dist` in Chrome Developer mode when practical.

## Documentation Rules

When behavior changes:
- Update the relevant spec or plan.
- Add implementation notes if needed.
- Keep docs concise and dated.
- Keep source-of-truth changes explicit in the handoff summary.

### Artifact Locations

Superpowers-generated collaboration artifacts should be stored in the project-root folders, not under plugin or temporary workflow directories:

- Brainstorming/design specs: `specs/`
- Implementation plans: `plans/`
- QA reports, release checks, and manual validation results: `qa/`
- Collaboration protocol: `docs/ai-collaboration-protocol.md`

If a Superpowers skill suggests a default path such as `docs/superpowers/specs/`, use the project-root folder above instead.

## Do Not Do

- Do not build a full restaurant discovery, delivery, map, payment, or social review platform in the MVP.
- Do not add formal accounts, email login, OAuth, or complex permissions unless a spec explicitly requires it.
- Do not add machine-learning ranking before the explainable scoring loop is stable.
- Do not use broad Chrome host permissions such as `<all_urls>` unless explicitly approved.
- Do not call weather APIs from the extension.
- Do not embed `TEAM_INVITE_CODE` in frontend bundles.
- Do not treat `EXTENSION_READ_TOKEN` as strong security.
- Do not make product direction changes during implementation without updating specs and plans.
- Do not create Codex subagents with any model other than GPT-5.5.
