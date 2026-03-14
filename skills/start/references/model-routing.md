# Model Routing Defaults

**Usage:** Reference this file when dispatching subagents or suggesting model switches at phase boundaries. This is the single source of truth for model routing — all other sections reference these tables rather than re-stating rules.

---

**Opus orchestrator, cheap subagents:** The orchestrator runs on Opus 4.6 (`claude-opus-4-6`, 1M context, standard pricing) for the full session. Cost optimization comes from subagent routing — Task dispatches use explicit `model` params to run subagents on Sonnet or Haiku.

Standard Sonnet (`claude-sonnet-4-6`, ~200K context) compacts 2–3 times on full sessions (300–500K orchestrator tokens), degrading context quality. Sonnet 1M context is a separate option billed as extra usage — avoid it. Opus 1M is included at standard pricing with no premium.

**YOLO mode** wraps each phase in a Task with an explicit `model` param — giving full per-phase model control regardless of orchestrator model. **Interactive mode** inherits the orchestrator's model for inline Skill invocations (brainstorming, design document).

This section applies unconditionally in all modes (YOLO, Express, Interactive).

## Orchestrator-level phases (main conversation model)

| Phase | Recommended Model | Rationale |
|-------|-------------------|-----------|
| Brainstorming | `opus` | Creative reasoning, design-level decisions |
| Design document | `opus` | Architectural decisions, trade-off analysis |
| Design verification | `sonnet` | Checklist comparison against codebase |
| Implementation planning | `sonnet` | Structured task decomposition from approved design |
| Study existing patterns | `sonnet` | Pattern extraction (subagents use `haiku`) |
| Implementation (orchestrator) | `sonnet` | Dispatching and reviewing subagent results |
| Self-review | `sonnet` | Checklist-based diff review |
| Code review pipeline | `sonnet` | Dispatching and consolidating agent results |
| CHANGELOG generation | `sonnet` | Mechanical commit parsing |
| Final verification | `sonnet` | Acceptance criteria checking |
| Git operations (commit, PR, issue) | `sonnet` | Mechanical CLI operations |

## Subagent dispatches (Task tool `model` parameter)

| `subagent_type` | Default Model | Rationale | Override When |
|-----------------|---------------|-----------|---------------|
| `"Explore"` | `haiku` | Read-only operations (Glob, Grep, Read, LS); no advanced reasoning needed | Task requires substantive analysis (e.g., design-verification batch agents making PASS/FAIL/WARNING judgments) — use `sonnet` and document justification inline |
| `"general-purpose"` | `sonnet` | Write access; needs reasoning for implementation | Task involves architectural complexity ("architect", "migration", "schema change", "new data model") — use `opus` |
| `"Plan"` | `sonnet` | Architecture planning requires reasoning | — |
| Spec review / consumer verification | `sonnet` | Checklist comparison work | — |

## Enforcement

Convention-based via skill instructions. Skills that dispatch Task agents must include the `model` parameter explicitly. The YOLO/Express override section and inline steps reference this table rather than re-stating routing rules.
