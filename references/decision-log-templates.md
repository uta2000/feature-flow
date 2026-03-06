# Decision Log Templates

These templates are used during Step 5 (Completion) of the start skill lifecycle. When the lifecycle ran in YOLO or Express mode, the orchestrator reads this file and appends the appropriate template after the standard completion summary.

## YOLO Decision Log

**YOLO (all scopes):**

```
## YOLO Decision Log

**Mode:** YOLO ([scope] scope)

| # | Skill | Decision | Auto-Selected |
|---|-------|----------|---------------|
| 1 | start | Scope + mode | [scope], YOLO |
| N | start | Fast-track detection | Activated (issue richness: [score]/4) — skipped: brainstorming, design document, verify-plan-criteria |
| ... | ... | ... | ... |
| N | brainstorming | Design questions (self-answered) | [count decisions auto-answered] |
| N | writing-plans | Execution choice | Subagent-Driven (auto-selected) |
| N | using-git-worktrees | Worktree directory | .worktrees/ (auto-selected) |
| N | finishing-a-dev-branch | Completion strategy | Push and create PR (auto-selected) |

**Total decisions auto-selected:** N (includes feature-flow decisions + superpowers overrides)
**Quality gates preserved:** hooks, tests, verification, code review
```

## Express Decision Log

**Express (all scopes):**

```
## Express Decision Log

**Mode:** Express ([scope] scope)
**Checkpoints:** N presented (M design approval, K compaction)

| # | Skill | Decision | Auto-Selected |
|---|-------|----------|---------------|
| 1 | start | Scope + mode | [scope], Express |
| N | start | Fast-track detection | Activated (issue richness: [score]/4) — skipped: brainstorming, design document, verify-plan-criteria |
| ... | ... | ... | ... |
| N | start | Compact checkpoint 1 | /compact (or skipped) |
| N | start | Compact checkpoint 2 | /compact (or skipped) |
| N | start | Compact checkpoint 3 | /compact (or skipped) |
| N | start | Compact checkpoint 4 | /compact (or skipped) |
| N | design-document | Design approval | ✋ User reviewed (approved / adjusted) |
| N | brainstorming | Design questions (self-answered) | [count decisions auto-answered] |
| N | writing-plans | Execution choice | Subagent-Driven (auto-selected) |
| N | using-git-worktrees | Worktree directory | .worktrees/ (auto-selected) |
| N | finishing-a-dev-branch | Completion strategy | Push and create PR (auto-selected) |

**Total decisions auto-selected:** N (includes feature-flow decisions + superpowers overrides)
**Checkpoints presented:** M (K compaction, J design approval)
**Quality gates preserved:** hooks, tests, verification, code review
```

## Interactive Mode

Interactive mode does not produce a decision log — all decisions were made interactively.
