# chidianma AI Collaboration Protocol

## Roles

Claude Code with gstack is primarily the product, UX, architecture, QA,
release-readiness and documentation reviewer. Codex with Superpowers is the
primary planning, implementation, testing and refactoring agent.

Only one agent drives implementation at a time. Either agent may identify a
conflict or propose a change, but major behavior changes first update the active
spec and plan.

## Source of truth

Use current, non-archived material in this order:

1. current specifications in `specs/`;
2. the active implementation plan in `plans/`;
3. current product, architecture, identity/security, operations, testing/release
   documentation and this protocol;
4. tests;
5. implementation;
6. `docs/archive/stages/` only as historical audit evidence.

The current productization boundary is
[`../specs/2026-07-15-internal-beta-productization-stage7-design.md`](../specs/2026-07-15-internal-beta-productization-stage7-design.md).
The completed Stage 1–6 artifacts are indexed in
[`archive/stages/README.md`](archive/stages/README.md). A historical plan cannot
override a later current spec, verified production QA, tests, or current docs.

## Workflow

1. Review product direction and risks.
2. Create or update the current spec.
3. Create and approve a scoped implementation plan.
4. Implement one bounded slice with tests where practical.
5. Run the relevant tests, typechecks, builds and release gates.
6. Update current docs and write a QA handoff.
7. Review findings, fix accepted items, and preserve rejected/corrected triage.

Do not silently guess when sources conflict. Record the conflict and resolve the
higher-priority source before changing behavior.

## Handoff requirements

Reviewer to implementer:

- goal, source documents and acceptance criteria;
- constraints, explicit non-goals and expected checks;
- requested post-implementation review;
- any enforceable subagent-model requirement.

Implementer to reviewer:

- implemented changes and source-of-truth changes;
- files and tests changed;
- commands and manual checks run;
- untested areas, known issues and requested review;
- whether subagents were used, naming a model only when verifiable.

## Product and engineering guardrails

Keep the product focused on a small team's explainable 2–3-choice lunch loop.
Do not expand it into delivery, maps, payments, social feeds, formal accounts or
machine-learning ranking without a current spec. Preserve minimal Chrome
permissions, PostgreSQL as source of truth, server-side weather, timezone-aware
dates, group isolation, explicit refresh semantics and calm reminders.

Identity is currently lightweight. Group-scoped clients use bearer group
sessions; the unscoped routes and `X-Lunch-Read-Token` are legacy compatibility
only and must not receive new behavior.

## Done definition

A task is ready for review only when it matches the active spec and plan,
relevant automated/manual checks have been run, documentation reflects current
behavior, omissions and known issues are explicit, and any subagent use is
disclosed without unverifiable claims.
