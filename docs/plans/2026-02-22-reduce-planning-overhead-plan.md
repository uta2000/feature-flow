# Reduce Planning Overhead for Small Features — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add fast-track logic to the small enhancement lifecycle that skips 3 redundant steps when a rich issue or detailed inline context is provided.

**Architecture:** Modify the start skill's markdown instructions to detect fast-track eligibility after issue richness scoring, add an alternative 14-step list for qualifying small enhancements, update checkpoint triggers and scope adjustment rules, and update the scope guide documentation.

**Tech Stack:** Markdown (Claude Code plugin skill files)

**Issue:** #59

---

### Task 1: Add fast-track detection logic after issue richness scoring

**Files:**
- Modify: `skills/start/SKILL.md:175-240`

**Acceptance Criteria:**
- [ ] A "Fast-Track Detection" subsection exists between issue richness scoring (line 175) and the scope classification section (line 181)
- [ ] The subsection specifies the condition: scope == "small enhancement" AND (issue_richness >= 3 OR inline_context_is_detailed)
- [ ] The subsection specifies that richness < 3 without detailed inline context uses the standard 17-step list
- [ ] YOLO/Express announcement text is specified: `YOLO: start — Small enhancement fast-track → Activated (issue #N richness: N/4). Skipping: brainstorming, design document, verify-plan-criteria.`
- [ ] Interactive announcement text is specified: `Issue #N has detailed requirements (richness: N/4). Fast-tracking: skipping brainstorming, design document, and verify-plan-criteria. The issue content serves as the design.`
- [ ] The step count in the combined scope + mode prompt (line 207) accounts for fast-track: `This looks like a **small enhancement** ([14 or 17] steps).`

**Step 1: Add the fast-track detection subsection**

Insert after line 179 (`If the user's initial message...treat this as equivalent to a detailed issue for recommendation purposes.`) and before line 181 (`**Scope classification:**`):

```markdown
**Fast-track detection (small enhancement only):**

After scoring issue richness and evaluating inline context, check if the small enhancement qualifies for a fast-track lifecycle:

1. **Condition:** Scope is classified as "small enhancement" AND either:
   - Issue richness score is 3+ (detailed issue), OR
   - Inline context provides equivalent detail (specific approach, file references, acceptance criteria)
2. **If fast-track qualifies:**
   - Set `fast_track` flag for step list building
   - Announce activation:
     - **YOLO/Express:** `"YOLO: start — Small enhancement fast-track → Activated (issue #N richness: [score]/4). Skipping: brainstorming, design document, verify-plan-criteria."`
     - **Interactive:** `"Issue #N has detailed requirements (richness: [score]/4). Fast-tracking: skipping brainstorming, design document, and verify-plan-criteria. The issue content serves as the design."`
3. **If fast-track does not qualify:** Use the standard 17-step small enhancement list. No announcement needed.

Fast-track detection runs after scope classification and mode selection. The step count in the scope + mode prompt reflects the fast-track status: 14 steps if fast-track qualifies, 17 steps otherwise.
```

**Step 2: Verify the edit**

Run: `grep -n "Fast-track detection" skills/start/SKILL.md`
Expected: One match in the Step 1 section, between issue richness scoring and scope classification.

**Step 3: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add fast-track detection logic for small enhancements"
```

---

### Task 2: Add the fast-track step list to Step 2

**Files:**
- Modify: `skills/start/SKILL.md:257-276`

**Acceptance Criteria:**
- [ ] A conditional prose line exists before the two small enhancement step lists explaining when to use each
- [ ] The existing "Small enhancement" step list (17 steps) is unchanged
- [ ] A new "Small enhancement (fast-track)" step list exists with exactly 14 steps
- [ ] The 14-step list starts with "Documentation lookup (Context7)" and ends with "Comment and close issue"
- [ ] The 14-step list does NOT contain: "Brainstorm requirements", "Design document", or "Verify plan criteria"
- [ ] Step 2 of the fast-track list is "Create issue" (consistent with skill mapping table)

**Step 1: Add the conditional logic and fast-track step list**

Replace the current small enhancement block (lines 257-276) with:

```markdown
**Small enhancement:**

If the small enhancement qualifies for fast-track (issue richness 3+ or equivalent inline detail), use the fast-track step list. Otherwise, use the standard step list.

*Standard (no fast-track):*
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Documentation lookup (Context7)
- [ ] 3. Design document
- [ ] 4. Create issue
- [ ] 5. Implementation plan
- [ ] 6. Verify plan criteria
- [ ] 7. Commit planning artifacts
- [ ] 8. Worktree setup
- [ ] 9. Copy env files
- [ ] 10. Study existing patterns
- [ ] 11. Implement (TDD)
- [ ] 12. Self-review
- [ ] 13. Code review
- [ ] 14. Generate CHANGELOG entry
- [ ] 15. Final verification
- [ ] 16. Commit and PR
- [ ] 17. Comment and close issue
```

*Fast-track (issue richness 3+ or detailed inline context):*
```
- [ ] 1. Documentation lookup (Context7)
- [ ] 2. Create issue
- [ ] 3. Implementation plan
- [ ] 4. Commit planning artifacts
- [ ] 5. Worktree setup
- [ ] 6. Copy env files
- [ ] 7. Study existing patterns
- [ ] 8. Implement (TDD)
- [ ] 9. Self-review
- [ ] 10. Code review
- [ ] 11. Generate CHANGELOG entry
- [ ] 12. Final verification
- [ ] 13. Commit and PR
- [ ] 14. Comment and close issue
```
```

**Step 2: Verify the edit**

Run: `grep -c "fast-track" skills/start/SKILL.md`
Expected: Multiple matches (detection logic + step list header + other references).

Run: `grep -n "Small enhancement" skills/start/SKILL.md | head -5`
Expected: Both "Small enhancement:" header and references to fast-track in the step list section.

**Step 3: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add fast-track 14-step list for small enhancements"
```

---

### Task 3: Update context window checkpoint 2 trigger

**Files:**
- Modify: `skills/start/SKILL.md:444-448`

**Acceptance Criteria:**
- [ ] Checkpoint 2's "After Step" column text includes the fast-track variant
- [ ] The text reads: `Design Verification (or Design Document for small enhancements, or Documentation Lookup for fast-track small enhancements)`
- [ ] The "Before Step" and "Focus Hint" columns are unchanged

**Step 1: Update the checkpoint table row**

Change line 447 from:
```
| 2 | Design Verification (or Design Document for small enhancements which skip verification) | Create Issue + Implementation Plan | `focus on the approved design and implementation plan` |
```
to:
```
| 2 | Design Verification (or Design Document for small enhancements, or Documentation Lookup for fast-track small enhancements) | Create Issue + Implementation Plan | `focus on the approved design and implementation plan` |
```

**Step 2: Verify the edit**

Run: `grep "Documentation Lookup for fast-track" skills/start/SKILL.md`
Expected: One match in the checkpoint table.

**Step 3: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: update checkpoint 2 trigger for fast-track small enhancements"
```

---

### Task 4: Add fast-track scope upgrade rule

**Files:**
- Modify: `skills/start/SKILL.md:1158-1166`

**Acceptance Criteria:**
- [ ] A new bullet point exists in the Scope Adjustment Rules section for fast-track upgrades
- [ ] The bullet specifies that if implementation planning or documentation lookup reveals more complexity, the scope upgrades from "small enhancement (fast-track)" to "feature" and inserts the missing steps (brainstorming, design document, design verification, verify-plan-criteria)
- [ ] The existing upgrade, downgrade, and add-spike rules are unchanged

**Step 1: Add the fast-track upgrade rule**

After the existing "Upgrade" bullet (line 1162), add:

```markdown
- **Fast-track upgrade:** Implementation planning or documentation lookup reveals more complexity than expected for a fast-tracked small enhancement → upgrade to "feature" scope, insert brainstorming, design document, design verification, and verify-plan-criteria steps before the current step, and resume from brainstorming
```

**Step 2: Verify the edit**

Run: `grep -n "Fast-track upgrade" skills/start/SKILL.md`
Expected: One match in the Scope Adjustment Rules section.

**Step 3: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add fast-track scope upgrade rule"
```

---

### Task 5: Add fast-track activation to the decision log

**Files:**
- Modify: `skills/start/SKILL.md:1108-1152`

**Acceptance Criteria:**
- [ ] Both YOLO and Express decision log templates include a row for fast-track activation
- [ ] The row shows: `| N | start | Fast-track detection | Activated (issue richness: N/4) — skipped: brainstorming, design document, verify-plan-criteria |`
- [ ] The row appears after the "Scope + mode" row and before the "brainstorming" row (or replaces the brainstorming row when fast-track is active)

**Step 1: Add fast-track row to YOLO decision log**

In the YOLO decision log template (after line 1117 `| 1 | start | Scope + mode | [scope], YOLO |`), add a comment indicating the fast-track row:

```markdown
| N | start | Fast-track detection | Activated (richness: [score]/4) — skipped: brainstorming, design-document, verify-plan-criteria |
```

This row replaces the `brainstorming | Design questions (self-answered)` row when fast-track is active (since brainstorming is skipped).

**Step 2: Add fast-track row to Express decision log**

In the Express decision log template (after line 1138 `| 1 | start | Scope + mode | [scope], Express |`), add the same row.

**Step 3: Verify the edit**

Run: `grep -n "Fast-track detection" skills/start/SKILL.md`
Expected: Matches in both the detection logic section AND the decision log templates.

**Step 4: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: add fast-track activation to decision log templates"
```

---

### Task 6: Update scope-guide.md with fast-track documentation

**Files:**
- Modify: `skills/start/references/scope-guide.md:26-48`

**Acceptance Criteria:**
- [ ] A "Fast-Track Conditions" subsection exists within the Small Enhancement section
- [ ] The subsection documents the trigger condition (issue richness 3+ or equivalent inline detail)
- [ ] The subsection lists the 14-step fast-track lifecycle
- [ ] The subsection states expected time savings (~3 min, 1-2M tokens)
- [ ] The existing Small Enhancement criteria, examples, and "Why no spike" text are unchanged

**Step 1: Add the fast-track conditions subsection**

After line 46 (`**Why no spike or design verification:** The change is small enough...`), insert:

```markdown

**Fast-Track Conditions:**

When a small enhancement has a linked issue with richness score 3+ (has acceptance criteria, concrete examples, structured content >200 words) or when the user provides equivalent inline detail, the lifecycle fast-tracks by skipping brainstorming, design document, and verify-plan-criteria:

**Fast-track lifecycle:** Doc lookup → Issue → Plan → Worktree → Implement → Review → Verify → PR

**Why safe to skip brainstorming + design doc:** The issue (or inline context) already contains the design decisions and acceptance criteria. Re-deriving them is pure duplication.

**Expected savings:** ~3 minutes and 1-2M tokens per small feature session.
```

**Step 2: Verify the edit**

Run: `grep -n "Fast-Track Conditions" skills/start/references/scope-guide.md`
Expected: One match in the Small Enhancement section.

**Step 3: Commit**

```bash
git add skills/start/references/scope-guide.md
git commit -m "docs: add fast-track conditions to scope guide"
```
