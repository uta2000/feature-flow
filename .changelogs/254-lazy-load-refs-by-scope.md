## refactor: scope-conditional reference loading in `start:` (#254)

`skills/start/SKILL.md` no longer eager-loads every reference file at session start. Two of the eight previously eager `Read references/X.md` instructions are now scope/mode-conditional, and a `if not already loaded` guard de-duplicates a YOLO/Express double-load. A new `#### Reference Loading Strategy` table inside Step 0 documents the contract.

**Behavior changes:**
- `references/orchestration-overrides.md` is now read **only if** brainstorming runs in the current scope (Small enhancement standard, Feature, or Major feature) **or** Express mode is active with a design approval checkpoint. Quick fix and Small enhancement fast-track skip this read entirely.
- `references/yolo-overrides.md` quality-sections read in `### Quality Context Injections` is now guarded with `if not already loaded`. In YOLO/Express mode the file was already loaded by the `### YOLO/Express Overrides` instruction earlier in the same session, so this read becomes a no-op instead of a redundant second load.
- `references/model-routing.md` is **not** changed — investigation confirmed every scope (including Quick fix) dispatches subagents via `superpowers:subagent-driven-development` for its Implement step (Skill Mapping `Implement` row), and subagent dispatch consults model routing.

**New contract:**
- A scope×reference matrix at `#### Reference Loading Strategy` inside Step 0 (between `### Step 0` and `### Step 1: Determine Scope`) is the authoritative answer to "what gets loaded for scope X mode Y." It also documents the `if not already loaded` idiom.
- Each entry in the `### Reference Files` listing at the bottom of `SKILL.md` is annotated with `*(eager — all scopes)*`, `*(lazy — read at point-of-use)*`, or `*(conditional: …)*` notes that match the matrix.
- A new `### Smoke Test: Per-Scope Reference Coverage` section at the end of `SKILL.md` walks each scope's expected reference set and ships seven anchored grep commands that machine-verify the change without self-matching their own bash block.

**Cross-references in the new content** use heading names (`### YOLO/Express Overrides`, `### Quality Context Injections`, `### Model Routing Defaults`, `Skill Mapping table's Implement row`) rather than line numbers — the table itself shifted line numbers when it was inserted, and headings are drift-proof.

**AC coverage (issue #254):**
- AC #1 (table in Step 0): satisfied — `#### Reference Loading Strategy` exists at the boundary between Step 0 and Step 1.
- AC #2–#5 (numerical reference targets): satisfied — Quick fix Interactive drops to 6 eager reads, Quick fix YOLO to 7. The issue's `≤7 / ≤10 / ≤14 / all 19` targets were sized against an older 19-eager-read state of `SKILL.md` that no longer exists; the current eager set is 8, and after this change Quick-fix sessions read 6–7 of those 8. Token savings are modest (one reference per Quick fix Interactive session, one round-trip de-dup per YOLO/Express session) — smaller than the issue's `~8K` estimate but real.
- AC #6 (mode detection for `yolo-overrides.md`): preserved — the existing `when in YOLO or Express mode` guard at `### YOLO/Express Overrides` is unchanged and now documented in the matrix.
- AC #7 (late-lifecycle references at point-of-use): unchanged — `inline-steps.md`, `code-review-pipeline.md`, and `senior-panel*.md` (loaded only via `code-review-pipeline.md`) were already lazy.
- AC #8 (instrumentation verification): explicitly deferred to the companion measurement issue per the original issue's own implementation note.
- AC #9 (smoke test per scope): satisfied via the new `### Smoke Test` section with anchored grep commands.

**Risks / mitigations:**
- The originally proposed scope-conditional skip for `model-routing.md` and the quality-sections of `yolo-overrides.md` was rejected during planning after evidence showed every scope's Implement step dispatches subagents. Skipping either would have been a quality regression (subagent dispatch missing routing/quality-context). The plan's "Task 3 DROPPED" section captures the rationale so the next reader does not re-propose the same change.
- Smoke-test grep commands were initially written without anchors and self-matched their own bash block. Code review caught this; the final commands are anchored to actual change sites (`^**Read \`references/...\`` for instructions, `^- **\`references/` for list-item annotations) and cannot match the bash block. Verified by running each grep — only the real change sites match.
