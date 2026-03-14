# Model Routing Defaults

**Usage:** Reference this file when dispatching subagents or suggesting model switches at phase boundaries. This is the single source of truth for model routing — all other sections reference these tables rather than re-stating rules.

---

**Opus orchestrator, cheap subagents:** The orchestrator runs on Opus 4.6 (`claude-opus-4-6`, 1M context, standard pricing) for the full session. Cost optimization comes from subagent routing — Task dispatches use explicit `model` params to run subagents on Sonnet or Haiku.

Standard Sonnet (`claude-sonnet-4-6`, ~200K context) compacts 2–3 times on full sessions (300–500K orchestrator tokens), degrading context quality. Sonnet 1M context is a separate option billed as extra usage — avoid it. Opus 1M is included at standard pricing with no premium.

**YOLO mode** wraps each phase in a Task with an explicit `model` param — giving full per-phase model control regardless of orchestrator model. **Interactive mode** inherits the orchestrator's model for inline Skill invocations (brainstorming, design document).

This section applies unconditionally in all modes (YOLO, Express, Interactive).

## YOLO mode — Task dispatch with explicit model params

In YOLO mode, brainstorming, design document, and planning phases are dispatched as `Task` calls wrapping the skill invocation. This gives per-phase model control regardless of the orchestrator's model.

| Phase | Dispatch | Model | Rationale |
|-------|----------|-------|-----------|
| Brainstorming | `Task(model: "opus")` → Skill | `opus` | Creative reasoning, design-level decisions |
| Design document | `Task(model: "opus")` → Skill | `opus` | Architectural decisions, trade-off analysis |
| Design verification | `Task(model: "sonnet")` via existing dispatch | `sonnet` | Checklist comparison against codebase |
| Implementation planning | `Task(model: "sonnet")` → Skill | `sonnet` | Structured task decomposition |
| All other phases | Inline (orchestrator) | Orchestrator model | Mechanical work, subagents handle heavy lifting |

## Interactive / Express mode — inline Skill calls

Brainstorming and design document run as inline `Skill` calls (no `model` param — inherits parent). Start sessions with Opus (`claude --model claude-opus-4-6` or use the default) so brainstorming inherits Opus.

| Phase | Dispatch | Model | Rationale |
|-------|----------|-------|-----------|
| Brainstorming | `Skill(...)` inline | Inherits parent (should be Opus) | Interactive Q&A with user |
| Design document | `Skill(...)` inline | Inherits parent (should be Opus) | Architectural decisions |
| All other phases | Same as YOLO | Same as YOLO | No difference after design phase |

## `/model` command — permanently off-limits

The `/model` command writes to `~/.claude/settings.json`, a global config file. It applies to "this session and future Claude Code sessions" — affecting all terminal windows and tmux panes. Never use `/model` in feature-flow workflows. Use `--model` at session startup for session-scoped isolation.

## Subagent dispatches (Task tool `model` parameter)

| `subagent_type` | Default Model | Rationale | Override When |
|-----------------|---------------|-----------|---------------|
| `"Explore"` | `haiku` | Read-only operations (Glob, Grep, Read, LS); no advanced reasoning needed | Task requires substantive analysis (e.g., design-verification batch agents making PASS/FAIL/WARNING judgments) — use `sonnet` and document justification inline |
| `"general-purpose"` | `sonnet` | Write access; needs reasoning for implementation | Task involves architectural complexity ("architect", "migration", "schema change", "new data model") — use `opus` |
| `"Plan"` | `sonnet` | Architecture planning requires reasoning | — |
| Spec review / consumer verification | `sonnet` | Checklist comparison work | — |

## Enforcement

All `Task` dispatches must include an explicit `model` parameter. Omitting `model` causes the subagent to inherit the parent model — which wastes cost when the parent is Opus. See #191 for the enforcement hook that blocks dispatches without `model`.
