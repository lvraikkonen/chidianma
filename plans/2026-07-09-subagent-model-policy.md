# Subagent Model Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the obsolete GPT-5.5-only restriction and consistently allow platform-selected subagent models when the dispatch interface has no model selector.

**Architecture:** Treat `specs/2026-07-09-subagent-model-policy-design.md` as the policy source of truth, then align the repository instructions, collaboration protocol, active Stage 3 plan, and durable SDD ledger. This policy migration runs inline because the currently active policy blocks subagents until the correction is committed; subsequent Stage 3 tasks may use Subagent-Driven Development.

**Tech Stack:** Markdown project instructions, Superpowers workflow documents, Git, ripgrep.

## Global Constraints

- Do not change application code, API contracts, tests, dependencies, or product behavior.
- Allow the platform-selected, inherited, or default subagent model when no per-dispatch model selector exists.
- Do not claim a specific subagent model unless it was explicitly selected or otherwise verifiable.
- Preserve the historical record that Stage 3 Task 1 used inline execution.
- Store the implementation plan in the project-root `plans/` folder.

---

### Task 1: Align Subagent Model Policy Sources

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/ai-collaboration-protocol.md`
- Modify: `plans/2026-07-09-today-recommendation-batch-participation-stage3.md`
- Modify: `.superpowers/sdd/progress.md` (ignored durable workflow record)

**Interfaces:**
- Consumes: `specs/2026-07-09-subagent-model-policy-design.md`
- Produces: one consistent platform-native subagent model policy for future Codex and Superpowers execution

- [ ] **Step 1: Reproduce the policy conflict**

Run:

```bash
rg -n -i 'GPT-?5\.5|only allowed model|explicitly enforce.*subagent|confirmed GPT-5\.5' AGENTS.md docs/ai-collaboration-protocol.md plans/2026-07-09-today-recommendation-batch-participation-stage3.md
```

Expected: matches in the collaboration protocol and active Stage 3 plan, proving that removing the rule from `AGENTS.md` alone did not make the policy consistent.

- [ ] **Step 2: Add the platform compatibility rule to `AGENTS.md`**

Add this section after `Primary Development Agent` responsibilities:

```md
### Codex Subagent Model Selection

Codex and Superpowers may create subagents through the controls exposed by the active platform.

- When a dispatch interface exposes a model selector, choose a suitable model according to the active workflow and user instructions.
- When a dispatch interface does not expose a model selector, the platform-selected, inherited, or default subagent model is allowed.
- The absence of a per-dispatch model parameter must not by itself block Subagent-Driven Development.
- Do not claim a specific subagent model unless it was explicitly selected or otherwise verifiable.
```

- [ ] **Step 3: Replace the collaboration protocol model policy**

Replace `## Model Policy for Codex Subagents` with:

```md
## Model Policy for Codex Subagents

Codex and Superpowers may create subagents through the model-selection controls provided by the active platform.

- If the dispatch interface exposes a model selector, select a suitable model according to the active workflow and user instructions.
- If the dispatch interface does not expose a model selector, the platform-selected, inherited, or default subagent model is allowed.
- The absence of a per-dispatch model parameter must not by itself block Subagent-Driven Development.
- No specific model vendor or version is mandatory unless the user explicitly requires one for the current task and the platform can enforce it.
- Handoffs disclose whether subagents were used and only name a model when that model was explicitly selected or otherwise verifiable.
```

Replace the Claude/gstack-to-Codex handoff bullet with:

```md
- Any task-specific subagent model requirement and whether the active platform can enforce it
```

Replace the Codex-to-Claude/gstack disclosure block with:

```md
- Subagent disclosure:
  - Whether subagents were used
  - Which model was used only when explicitly selected or otherwise verifiable
  - Any platform limitation relevant to model selection
```

Replace the Done Definition subagent bullet with:

```md
- Any use of Codex subagents is disclosed without unverifiable model claims.
```

- [ ] **Step 4: Remove the obsolete Stage 3 execution restriction**

Delete the introductory `Project override` paragraph and this Global Constraints bullet:

```md
- Do not create Codex subagents unless GPT-5.5 can be explicitly enforced.
```

Replace the Task 7 handoff disclosure with:

```md
Subagent disclosure:
- State whether subagents were used.
- Name a subagent model only when it was explicitly selected or otherwise verifiable.
- State any platform limitation relevant to model selection.
```

Replace the final self-review bullet with:

```md
- Subagent use and any verifiable model-selection details are disclosed truthfully.
```

- [ ] **Step 5: Preserve and extend the Stage 3 progress record**

Keep the existing Task 1 inline-execution entry unchanged and append:

```md
Policy update: platform-selected subagent models are allowed for Task 2 onward; the absence of a per-dispatch model selector no longer blocks Subagent-Driven Development.
```

- [ ] **Step 6: Verify the obsolete restriction is gone**

Run:

```bash
rg -n -i 'GPT-?5\.5|only allowed model|explicitly enforce.*subagent|confirmed GPT-5\.5' AGENTS.md docs/ai-collaboration-protocol.md plans/2026-07-09-today-recommendation-batch-participation-stage3.md
```

Expected: no output and exit status 1 because none of the obsolete policy phrases remain.

Run:

```bash
rg -n 'platform-selected|does not expose a model selector|Whether subagents were used|Subagent use and any verifiable' AGENTS.md docs/ai-collaboration-protocol.md plans/2026-07-09-today-recommendation-batch-participation-stage3.md .superpowers/sdd/progress.md
```

Expected: matches in all four policy/progress locations.

Run:

```bash
git diff --check
git diff --name-only
```

Expected: no whitespace errors; changed tracked files are limited to `AGENTS.md`, `docs/ai-collaboration-protocol.md`, and the active Stage 3 plan.

- [ ] **Step 7: Commit the policy correction**

```bash
git add AGENTS.md docs/ai-collaboration-protocol.md plans/2026-07-09-today-recommendation-batch-participation-stage3.md
git commit -m "docs: allow platform-selected subagent models"
```
