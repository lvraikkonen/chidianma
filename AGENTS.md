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

### Codex Subagent Model Selection

Codex and Superpowers may create subagents through the controls exposed by the active platform.

- When a dispatch interface exposes a model selector, choose a suitable model according to the active workflow and user instructions.
- When a dispatch interface does not expose a model selector, the platform-selected, inherited, or default subagent model is allowed.
- The absence of a per-dispatch model parameter must not by itself block Subagent-Driven Development.
- Do not claim a specific subagent model unless it was explicitly selected or otherwise verifiable.

## Code Intelligence

- When CodeGraph is available and the workspace index is initialized, use it before manual `rg`/file-reading loops for symbol lookup, module understanding, call-flow tracing, caller/callee discovery, and change-impact analysis.
- Prefer:
  - `codegraph_context` for understanding a feature or module.
  - `codegraph_search` for locating symbols.
  - `codegraph_trace` for cross-file call paths.
  - `codegraph_impact` before changing shared symbols.
- If CodeGraph reports stale or pending files, read those specific files directly before relying on their contents.
- Fall back to `rg` and direct file reads when CodeGraph is unavailable, uninitialized, ambiguous, or does not cover the required detail.
- CodeGraph is a structural navigation aid, not a source of product requirements or correctness validation. Specs and plans remain authoritative; verify changes with tests, typecheck, and builds.

## Claude Code / gstack Role

Claude Code with gstack is primarily used for:
- Product review
- UX review
- Architecture review
- QA review
- Release readiness review
- Documentation review

Claude Code / gstack may propose implementation changes, but major behavior changes must be reflected in specs and plans before coding.

## Source of Truth

Use current, non-archived documents as source of truth, in this order:

1. Current specs in `specs/`
2. The active plan in `plans/`
3. Current product/architecture/security/operations/release documentation and `docs/ai-collaboration-protocol.md`
4. tests
5. existing implementation
6. Historical Stage artifacts, only as audit evidence

If implementation conflicts with specs, do not silently change behavior. Report the conflict and update the relevant spec or plan first.

Historical or superseded Stage documents must not override a later current spec, verified production QA, current tests, or current product documentation. Preserve them for traceability and make any conflict explicit.

## Current Stage Documents

- specs/2026-07-15-internal-beta-productization-stage7-design.md
- plans/2026-07-15-internal-beta-productization-stage7a.md
- plans/2026-07-15-internal-beta-productization-stage7b.md
- docs/archive/stages/stage-6/2026-07-15-deploy-hardening-stage6-qa.md
- qa/2026-07-15-production-baseline-review-triage.md
- qa/2026-07-15-internal-beta-productization-stage7a.md
- qa/2026-07-15-internal-beta-productization-stage7b.md
- roadmap.md
- docs/ai-collaboration-protocol.md

The frozen Stage 6 audit baseline is `1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`.
The current Stage 7B production runtime is Railway deployment
`6d80eb52-d35a-4554-9d66-aa44dd2d6b1c`, tracked by deployment ID and image digest because it was
uploaded from the approved uncommitted workspace. Stage 7A and Stage 7B are complete; Stage 7C is
Ready for Planning. Do not execute Stage 7C until a current detailed plan is written and approved;
do not execute earlier, completed, or superseded plans.

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
- Keep the removed `EXTENSION_READ_TOKEN` and legacy read-token paths out of current runtime and
  release artifacts.

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
- Group-scoped `GET /api/groups/:groupId/today-recommendations` reads the current batch and does not create one.
- Group-scoped `POST /api/groups/:groupId/today-recommendations/refresh` creates a new current batch and keeps old batches for review.
- Recommendation batch creation must use a transaction to avoid duplicate current batches around the lunch reminder time.
- Group-scoped Extension requests use the active group's bearer session token.
  `X-Lunch-Read-Token` and the former unscoped routes were removed in Stage 7B; do not reintroduce
  them.
- Weather is called only by the server, never by the extension.
- After real weather is integrated, use `weather_snapshots` plus Open-Meteo-style fetching.
- If neither cached nor fetched weather is available, do not use rainy mock weather for scoring; return `weatherUnavailable=true` and score with `weatherMatch=0`.
- Current management auth uses an identity token plus a group-scoped session token whose active membership is revalidated by the Server.
- Group management write APIs must require `Authorization: Bearer <group-session-token>` and enforce the current membership role.
- Admin frontend must never hardcode `TEAM_INVITE_CODE`; the invite input default is an empty string.
- Production Fastify serves the built Admin at the same origin as the API. Preserve API route precedence, Admin cache behavior, and production missing-build failure unless a current spec changes them.

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
- Do not reintroduce `EXTENSION_READ_TOKEN` or legacy unscoped recommendation authentication.
- Do not make product direction changes during implementation without updating specs and plans.
