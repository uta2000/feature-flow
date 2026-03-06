# Fix Fragile Sentinel-Based Plugin Detection Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Update pre-flight detection to namespace-prefix — STATUS: pending
Task 2: Update Reviewer Stack Affinity Table — STATUS: pending
Task 3: Update code-review-pipeline reviewer references — STATUS: pending
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.

**Goal:** Replace hardcoded sentinel skill names with namespace-prefix detection so plugin checks don't silently fail when plugins rename their skills.

**Architecture:** Update three locations in the start skill: (1) pre-flight plugin detection in SKILL.md, (2) Reviewer Stack Affinity Table in SKILL.md, (3) reviewer dispatch names in code-review-pipeline.md. All changes are to markdown instruction files — no executable code.

**Tech Stack:** Markdown skill files (feature-flow plugin)

---

### Task 1: Update pre-flight detection to namespace-prefix

Update the `feature-dev` and `backend-api-security` pre-flight checks in SKILL.md to use namespace-prefix detection instead of hardcoded sentinel skill names. Also update the `superpowers` and `pr-review-toolkit` checks to use the same namespace-prefix pattern for consistency.

**Files:**
- Modify: `skills/start/SKILL.md:51-69` (feature-dev and backend-api-security pre-flight sections)
- Modify: `skills/start/SKILL.md:17-48` (superpowers, Context7, and pr-review-toolkit sections — consistency update)

**Step 1: Update feature-dev detection**

Change line 55 from:
```
Check for its presence by looking for `feature-dev:code-reviewer` in the loaded skill list.
```
To:
```
Check for its presence by looking for any skill starting with `feature-dev:` in the loaded skill list (namespace-prefix detection).
```

Also update the warning message on line 58 from `feature-dev:code-reviewer` to reference the namespace:
```
Without it, the code review pipeline will skip: feature-dev reviewers.
```

**Step 2: Update backend-api-security detection**

Change line 63 from:
```
Check for its presence by looking for `backend-api-security:backend-security-coder` in the loaded skill list.
```
To:
```
Check for its presence by looking for any skill starting with `backend-api-security:` in the loaded skill list (namespace-prefix detection).
```

Also update the warning message on line 66 from `backend-security-coder` to:
```
Without it, the code review pipeline will skip: backend-api-security reviewers.
```

**Step 3: Update superpowers detection for consistency**

Change line 19 from:
```
Check for its presence by looking for superpowers skills in the loaded skill list
```
To:
```
Check for its presence by looking for any skill starting with `superpowers:` in the loaded skill list (namespace-prefix detection)
```

**Step 4: Update pr-review-toolkit detection for consistency**

Change line 43 from:
```
Check for its presence by looking for `pr-review-toolkit:review-pr` in the loaded skill list.
```
To:
```
Check for its presence by looking for any skill starting with `pr-review-toolkit:` in the loaded skill list (namespace-prefix detection).
```

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "fix: replace hardcoded sentinel detection with namespace-prefix for all plugins"
```

**Acceptance Criteria:**
- [ ] `feature-dev` pre-flight check uses `feature-dev:` namespace prefix, not `feature-dev:code-reviewer`
- [ ] `backend-api-security` pre-flight check uses `backend-api-security:` namespace prefix, not `backend-api-security:backend-security-coder`
- [ ] `superpowers` pre-flight check uses `superpowers:` namespace prefix for consistency
- [ ] `pr-review-toolkit` pre-flight check uses `pr-review-toolkit:` namespace prefix, not `pr-review-toolkit:review-pr`
- [ ] Warning messages reference the plugin namespace (e.g., "feature-dev reviewers") instead of nonexistent skill names
- [ ] No remaining hardcoded sentinel skill names in the pre-flight check section (lines 17-69)

**Quality Constraints:**
- Pattern reference: follow existing `superpowers` check style (line 19) which already uses loose detection
- Files modified: `skills/start/SKILL.md` (design-first — 464 lines)
- Design-first files: `skills/start/SKILL.md` — implementer must output change plan before editing

---

### Task 2: Update Reviewer Stack Affinity Table

Update the reviewer names in the affinity table to match actual skill/agent names shipped by the plugins.

**Files:**
- Modify: `skills/start/SKILL.md:74-83` (Reviewer Stack Affinity Table)

**Step 1: Update feature-dev reviewer name**

Change line 80 from:
```
| `feature-dev:code-reviewer` | feature-dev | `*` (universal) | 2 |
```
To:
```
| `feature-dev:feature-dev` | feature-dev | `*` (universal) | 2 |
```

This matches the actual skill name shipped by the feature-dev plugin.

**Step 2: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "fix: update Reviewer Stack Affinity Table to match actual skill names"
```

**Acceptance Criteria:**
- [ ] `feature-dev` row in affinity table uses `feature-dev:feature-dev` as the reviewer name
- [ ] `backend-api-security:backend-security-coder` row is unchanged (cannot verify actual name without plugin installed)
- [ ] All other rows unchanged (superpowers, pr-review-toolkit internal agents, pr-test-analyzer, type-design-analyzer)
- [ ] Table markdown formatting is preserved (alignment, pipes)

**Quality Constraints:**
- Pattern reference: follow existing table row format in SKILL.md lines 75-83
- Files modified: `skills/start/SKILL.md` (design-first — 464 lines)

---

### Task 3: Update code-review-pipeline reviewer references

Update reviewer dispatch names in code-review-pipeline.md to match actual skill names, consistent with the affinity table changes in Task 2.

**Files:**
- Modify: `skills/start/references/code-review-pipeline.md:163,191` (reviewer dispatch table and conflict resolution)

**Step 1: Read code-review-pipeline.md**

Read the full file to understand context around lines 163 and 191.

**Step 2: Update dispatch table**

Change line 163 from:
```
| `feature-dev:code-reviewer` | feature-dev | ...
```
To:
```
| `feature-dev:feature-dev` | feature-dev | ...
```

Keep the rest of the row (checklist items, action, model, tier) unchanged.

**Step 3: Update conflict resolution**

Change line 191 from:
```
2. If same severity, prefer the more specific agent: `backend-security-coder` > pr-review-toolkit > `feature-dev:code-reviewer` > `superpowers:code-reviewer`
```
To:
```
2. If same severity, prefer the more specific agent: `backend-security-coder` > pr-review-toolkit > `feature-dev:feature-dev` > `superpowers:code-reviewer`
```

**Step 4: Commit**

```bash
git add skills/start/references/code-review-pipeline.md
git commit -m "fix: update code-review-pipeline reviewer names to match actual skills"
```

**Acceptance Criteria:**
- [ ] Dispatch table row for feature-dev uses `feature-dev:feature-dev`, not `feature-dev:code-reviewer`
- [ ] Conflict resolution rule uses `feature-dev:feature-dev`, not `feature-dev:code-reviewer`
- [ ] `backend-api-security:backend-security-coder` references unchanged (cannot verify without plugin)
- [ ] No other rows or content in the file are modified
- [ ] Table markdown formatting preserved

**Quality Constraints:**
- Pattern reference: follow existing table row format in code-review-pipeline.md
- Files modified: `skills/start/references/code-review-pipeline.md` (design-first — 200+ lines)
