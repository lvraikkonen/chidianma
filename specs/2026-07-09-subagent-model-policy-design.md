# Subagent Model Policy Design

**Date:** 2026-07-09
**Status:** Approved design, pending implementation

## Context

The project previously required every Codex-created subagent to use GPT-5.5 and prohibited subagents when the dispatch tool could not explicitly select that model. Commit `b94ab04` removed that rule from `AGENTS.md`, but equivalent restrictions remained in `docs/ai-collaboration-protocol.md` and the active Stage 3 execution plan. The generic Subagent-Driven Development workflow also prefers an explicit model selection, while the current Codex `spawn_agent` interface does not expose a model parameter.

These conflicting sources caused Task 1 to fall back to inline execution even though the current project intent is to allow Subagent-Driven Development.

## Decision

Codex and Superpowers may create subagents through the model-selection controls provided by the active platform.

- If the dispatch interface exposes a model selector, select a suitable model according to the active workflow and user instructions.
- If the dispatch interface does not expose a model selector, the platform-selected, inherited, or default subagent model is allowed.
- The absence of a per-dispatch model parameter must not by itself block Subagent-Driven Development.
- No specific model vendor or version is mandatory unless the user explicitly requires one for the current task and the platform can enforce it.
- Handoffs disclose whether subagents were used. They do not claim a specific model unless that model was explicitly selected or otherwise verifiable.

This project-level decision overrides generic workflow guidance that assumes every agent platform exposes a per-dispatch model selector.

## Source-of-Truth Changes

Implementation will make the policy consistent in these locations:

1. `AGENTS.md`
   - Add a short subagent model-selection compatibility rule.
2. `docs/ai-collaboration-protocol.md`
   - Replace the GPT-5.5-only policy and related review/handoff requirements with platform-native model selection and truthful disclosure.
3. `plans/2026-07-09-today-recommendation-batch-participation-stage3.md`
   - Remove the GPT-5.5 execution override and global constraint.
   - Update Task 7 handoff and self-review language so Tasks 2 onward can use Subagent-Driven Development.
4. `.superpowers/sdd/progress.md`
   - Preserve the historical fact that Task 1 used inline fallback under the policy active at that time.
   - Add a note that the policy was corrected for subsequent tasks.

## Non-Goals

- Do not change product behavior, API contracts, application code, or test behavior.
- Do not guarantee which model a platform chooses when it does not expose that information.
- Do not rewrite the Task 1 implementation history or claim that Task 1 used subagents.
- Do not require subagents for tasks where the selected workflow does not benefit from them.

## Verification

The policy change is complete when:

- `AGENTS.md`, the collaboration protocol, and the active Stage 3 plan no longer require GPT-5.5-only subagents.
- The authoritative project instructions explicitly allow `spawn_agent` when no model parameter is available.
- Stage 3 handoff language requires truthful subagent-use disclosure without unverifiable model claims.
- Task 1 remains recorded as inline execution, while subsequent Stage 3 tasks are not blocked from using Subagent-Driven Development.
- `git diff --check` passes and the changes contain no application-code modifications.
