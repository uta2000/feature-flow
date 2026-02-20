# CHANGELOG Generation from Commits — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an inline "Generate CHANGELOG entry" step to the start-feature lifecycle that auto-generates a Keep a Changelog entry from the feature branch's git commits.

**Architecture:** New inline step in `skills/start-feature/SKILL.md`, inserted after Code Review Pipeline Step. Step lists for Small enhancement, Feature, and Major feature are updated with the new step and renumbered. README lifecycle table and diagram updated to match.

**Tech Stack:** Markdown (SKILL.md, README.md, CHANGELOG.md) — no runtime code, no tests to write.

---

### Task 1: Update step lists in SKILL.md

Add "Generate CHANGELOG entry" to Small enhancement, Feature, and Major feature step lists. Renumber Final verification and Commit and PR in each.

**Files:**
- Modify: `skills/start-feature/SKILL.md:159-211`

**Step 1: Edit Small enhancement step list (lines 159-174)**

Replace:
```markdown
**Small enhancement:**
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Documentation lookup (Context7)
- [ ] 3. Design document
- [ ] 4. Create issue
- [ ] 5. Implementation plan
- [ ] 6. Verify plan criteria
- [ ] 7. Worktree setup
- [ ] 8. Study existing patterns
- [ ] 9. Implement (TDD)
- [ ] 10. Self-review
- [ ] 11. Code review
- [ ] 12. Final verification
- [ ] 13. Commit and PR
```
```

With:
```markdown
**Small enhancement:**
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Documentation lookup (Context7)
- [ ] 3. Design document
- [ ] 4. Create issue
- [ ] 5. Implementation plan
- [ ] 6. Verify plan criteria
- [ ] 7. Worktree setup
- [ ] 8. Study existing patterns
- [ ] 9. Implement (TDD)
- [ ] 10. Self-review
- [ ] 11. Code review
- [ ] 12. Generate CHANGELOG entry
- [ ] 13. Final verification
- [ ] 14. Commit and PR
```
```

**Step 2: Edit Feature step list (lines 176-192)**

Replace:
```markdown
**Feature:**
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Documentation lookup (Context7)
- [ ] 3. Design document
- [ ] 4. Design verification
- [ ] 5. Create issue
- [ ] 6. Implementation plan
- [ ] 7. Verify plan criteria
- [ ] 8. Worktree setup
- [ ] 9. Study existing patterns
- [ ] 10. Implement (TDD)
- [ ] 11. Self-review
- [ ] 12. Code review
- [ ] 13. Final verification
- [ ] 14. Commit and PR
```
```

With:
```markdown
**Feature:**
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Documentation lookup (Context7)
- [ ] 3. Design document
- [ ] 4. Design verification
- [ ] 5. Create issue
- [ ] 6. Implementation plan
- [ ] 7. Verify plan criteria
- [ ] 8. Worktree setup
- [ ] 9. Study existing patterns
- [ ] 10. Implement (TDD)
- [ ] 11. Self-review
- [ ] 12. Code review
- [ ] 13. Generate CHANGELOG entry
- [ ] 14. Final verification
- [ ] 15. Commit and PR
```
```

**Step 3: Edit Major feature step list (lines 194-211)**

Replace:
```markdown
**Major feature:**
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Spike / PoC (if risky unknowns)
- [ ] 3. Documentation lookup (Context7)
- [ ] 4. Design document
- [ ] 5. Design verification
- [ ] 6. Create issue
- [ ] 7. Implementation plan
- [ ] 8. Verify plan criteria
- [ ] 9. Worktree setup
- [ ] 10. Study existing patterns
- [ ] 11. Implement (TDD)
- [ ] 12. Self-review
- [ ] 13. Code review
- [ ] 14. Final verification
- [ ] 15. Commit and PR
```
```

With:
```markdown
**Major feature:**
```
- [ ] 1. Brainstorm requirements
- [ ] 2. Spike / PoC (if risky unknowns)
- [ ] 3. Documentation lookup (Context7)
- [ ] 4. Design document
- [ ] 5. Design verification
- [ ] 6. Create issue
- [ ] 7. Implementation plan
- [ ] 8. Verify plan criteria
- [ ] 9. Worktree setup
- [ ] 10. Study existing patterns
- [ ] 11. Implement (TDD)
- [ ] 12. Self-review
- [ ] 13. Code review
- [ ] 14. Generate CHANGELOG entry
- [ ] 15. Final verification
- [ ] 16. Commit and PR
```
```

**Step 4: Verify step lists**

Confirm each step list has the correct count:
- Quick fix: 6 steps (unchanged)
- Small enhancement: 14 steps (was 13)
- Feature: 15 steps (was 14)
- Major feature: 16 steps (was 15)

**Acceptance Criteria:**
- [ ] Small enhancement step list contains "Generate CHANGELOG entry" as step 12, Final verification as step 13, Commit and PR as step 14 (14 total steps)
- [ ] Feature step list contains "Generate CHANGELOG entry" as step 13, Final verification as step 14, Commit and PR as step 15 (15 total steps)
- [ ] Major feature step list contains "Generate CHANGELOG entry" as step 14, Final verification as step 15, Commit and PR as step 16 (16 total steps)
- [ ] Quick fix step list is unchanged (6 steps, no CHANGELOG step)
- [ ] The string "Generate CHANGELOG entry" appears exactly 3 times in the step list sections (lines 149-211) of `skills/start-feature/SKILL.md` — one per non-quickfix scope

---

### Task 2: Add Generate CHANGELOG entry to Skill Mapping table

Add a new row to the Skill Mapping table for the Generate CHANGELOG entry step.

**Files:**
- Modify: `skills/start-feature/SKILL.md:241-260`

**Step 1: Add row to Skill Mapping table**

Insert a new row after the "Code review" row (line 255) and before "Final verification" (line 256):

```markdown
| Generate CHANGELOG entry | No skill — inline step (see below) | CHANGELOG.md updated with categorized entry |
```

The table should now look like:
```markdown
| Self-review | No skill — inline step (see below) | Code verified against coding standards before formal review |
| Code review | No skill — inline step (see below) | All Critical/Important findings fixed, tests pass |
| Generate CHANGELOG entry | No skill — inline step (see below) | CHANGELOG.md updated with categorized entry |
| Final verification | `spec-driven:verify-acceptance-criteria` + `superpowers:verification-before-completion` | All criteria PASS + lint/typecheck/build pass |
```

**Acceptance Criteria:**
- [ ] Skill Mapping table contains a "Generate CHANGELOG entry" row with skill "No skill — inline step (see below)" and expected output "CHANGELOG.md updated with categorized entry"
- [ ] The row appears between "Code review" and "Final verification"

---

### Task 3: Write the Generate CHANGELOG Entry Step inline section

Add the full inline step section to SKILL.md after the Code Review Pipeline Step section (which ends around line 471) and before the Documentation Lookup Step section (which starts around line 472).

**Files:**
- Modify: `skills/start-feature/SKILL.md` (insert after line 471, before `### Documentation Lookup Step`)

**Step 1: Write the inline section**

Insert the following section between the Code Review Pipeline Step's closing output block and the Documentation Lookup Step header:

```markdown
### Generate CHANGELOG Entry Step (inline — no separate skill)

This step runs after code review and before final verification. It auto-generates a CHANGELOG entry from the feature branch's git commits and presents it for user approval before writing. It runs for all scopes except Quick fix.

**Process:**

#### Phase 1: Collect commits

1. Get all commit messages on the feature branch: `git log --format="%s" main...HEAD`
2. Filter out merge commits matching `^Merge (branch|pull request)`
3. Filter out fixup/squash commits matching `^(fixup|squash)!`
4. If no commits remain after filtering, skip the step: "No commits found on feature branch — skipping CHANGELOG generation."

#### Phase 2: Categorize by conventional commit prefix

For each commit message, match against these prefixes:

| Prefix | Keep a Changelog Category |
|--------|--------------------------|
| `feat:` | Added |
| `fix:` | Fixed |
| `refactor:` | Changed |
| `docs:` | Documentation |
| `test:` | Testing |
| `chore:` | Maintenance |

**Processing rules:**
1. Match prefix case-insensitively: `feat:`, `Feat:`, `FEAT:` all match
2. Strip the prefix and optional scope: `feat(csv): add export` → `Add export`
3. Capitalize the first letter of the remaining message
4. Deduplicate entries with identical messages (case-insensitive, keep first occurrence)
5. If no commits match any prefix, put all entries under a single `### Changes` category
6. Omit empty categories from the output

#### Phase 3: Detect version (optional)

Check these sources in order, use the first one found:

1. `package.json` → `version` field
2. `Cargo.toml` → `[package]` section `version` field
3. `pyproject.toml` → `[project]` section `version` field
4. `mix.exs` → `@version` attribute
5. Latest git tag matching semver pattern: `git tag --sort=-v:refname | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+' | head -1`

If a version is detected, present it alongside `[Unreleased]` via `AskUserQuestion`:
- **Option 1:** `[Unreleased]` (Recommended) — assign version at release time
- **Option 2:** `[X.Y.Z] - YYYY-MM-DD` — use detected version now

If no version detected, use `[Unreleased]` without asking.

#### Phase 4: Generate entry

Format the entry in Keep a Changelog format:

```
## [Unreleased]

### Added
- Entry from feat: commit
- Entry from feat: commit

### Fixed
- Entry from fix: commit

### Changed
- Entry from refactor: commit
```

Category order: Added, Fixed, Changed, Documentation, Testing, Maintenance, Changes (fallback last).

#### Phase 5: Present for approval

Present the generated entry to the user via `AskUserQuestion`:

- **Option 1:** "Looks good — write it" — proceed to write
- **Option 2:** "Let me edit" — user provides corrections in freeform text, entry is revised
- **Option 3:** "Skip CHANGELOG" — announce risk: "No CHANGELOG entry will be included in this PR. You may want to add one manually." Proceed to next lifecycle step.

#### Phase 6: Write to CHANGELOG.md

**If CHANGELOG.md exists with an `[Unreleased]` section:**
1. Parse existing categories under `[Unreleased]`
2. For each generated category:
   - If the category exists in the file, append new entries at the end of that category's list
   - If the category doesn't exist, add it after the last existing category under `[Unreleased]`
3. Deduplicate: skip any generated entry that matches an existing entry (case-insensitive)
4. Preserve all existing entries — never remove or reorder them

**If CHANGELOG.md exists without `[Unreleased]`:**
1. Find the first `## [` heading (the latest version section)
2. Insert the new `## [Unreleased]` section before it

**If no CHANGELOG.md exists:**
1. Create the file with the Keep a Changelog header:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

[generated categories and entries]
```

After writing, announce: "CHANGELOG.md updated with N entries across M categories."

**Output format:**
```
## CHANGELOG Generation Results

**Version heading:** [Unreleased] (or [X.Y.Z] - YYYY-MM-DD)
**Commits parsed:** N
**Entries generated:** M (after dedup)
**Categories:** [list]
**Action:** Written to CHANGELOG.md / Skipped by user
```
```

**Step 2: Verify the section is correctly placed**

The section should appear:
- After the Code Review Pipeline Step section (ends with the `**Status:** Clean / N issues remaining` output block)
- Before the Documentation Lookup Step section (`### Documentation Lookup Step`)

**Acceptance Criteria:**
- [ ] `skills/start-feature/SKILL.md` contains a section titled "### Generate CHANGELOG Entry Step (inline — no separate skill)"
- [ ] The section appears after "Code Review Pipeline Step" and before "Documentation Lookup Step"
- [ ] The section contains Phase 1 through Phase 6 with all rules from the design doc
- [ ] Commit categorization table lists all 6 conventional commit prefixes plus the fallback
- [ ] Version detection lists all 5 sources (package.json, Cargo.toml, pyproject.toml, mix.exs, git tags)
- [ ] User approval flow has 3 options: approve, edit, skip
- [ ] Three CHANGELOG.md scenarios are documented: existing with [Unreleased], existing without, new file
- [ ] Merge rules specify: append to existing categories, add new categories after last existing, deduplicate case-insensitively, never remove or reorder

---

### Task 4: Update README.md lifecycle table

Add the Generate CHANGELOG entry row to the lifecycle table in README.md.

**Files:**
- Modify: `README.md:87-103`

**Step 1: Add row to lifecycle table**

Insert between "Code review" (line 101) and "Final verification" (line 102):

```markdown
| Generate CHANGELOG entry | **spec-driven** (inline) | Parses branch commits, generates Keep a Changelog entry |
```

**Acceptance Criteria:**
- [ ] README.md lifecycle table contains a "Generate CHANGELOG entry" row
- [ ] Plugin column shows `**spec-driven** (inline)`
- [ ] Row appears between "Code review" and "Final verification"

---

### Task 5: Update README.md lifecycle diagram

Add the Generate CHANGELOG entry step to the numbered lifecycle diagram in README.md.

**Files:**
- Modify: `README.md:151-172`

**Step 1: Insert new step and renumber**

The `b` suffix pattern in the diagram is for "mobile only" steps. CHANGELOG applies to all non-quickfix scopes, so it gets a full number. Insert step 15 and renumber everything after it:

```
14. Code Review                    ← inline (multi-agent pipeline: find → fix → re-verify)
15. Generate CHANGELOG Entry       ← inline (conventional commits → Keep a Changelog)
16. Final Verification             ← verify-acceptance-criteria + superpowers:verification-before-completion
16b. Beta Testing                  ← mobile only (TestFlight / Play Console)
17. PR / Merge                     ← superpowers:finishing-a-development-branch
17b. App Store Review              ← mobile only
18. Deploy
```

**Acceptance Criteria:**
- [ ] README.md lifecycle diagram contains "Generate CHANGELOG Entry" as step 15
- [ ] It appears after "Code Review" (step 14) and before "Final Verification" (step 16)
- [ ] Final Verification is step 16, PR / Merge is step 17, Deploy is step 18
- [ ] Mobile-only steps use correct parent numbers: 12b (Device Matrix Testing), 16b (Beta Testing), 17b (App Store Review)

---

### Task 6: Update CHANGELOG.md

Add entry for this feature under the next version.

**Files:**
- Modify: `CHANGELOG.md:1-10`

**Step 1: Add version entry**

Insert a new version section at the top (after the header, before `## [1.8.0]`):

```markdown
## [1.9.0] - 2026-02-20

### Added
- **CHANGELOG generation step** — new inline lifecycle step that auto-generates a Keep a Changelog entry from the feature branch's git commits. Parses conventional commit prefixes (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`), categorizes entries, and presents for user approval before writing to `CHANGELOG.md`. Falls back to a single "Changes" section for non-conventional commits. Supports version detection from `package.json`, `Cargo.toml`, `pyproject.toml`, `mix.exs`, and git tags. Merges into existing `[Unreleased]` sections without overwriting.
- Step added to Small enhancement (step 12), Feature (step 13), and Major feature (step 14) lifecycles. Quick fix is unchanged.
```

**Acceptance Criteria:**
- [ ] CHANGELOG.md has a `## [1.9.0]` section before `## [1.8.0]`
- [ ] The section has an `### Added` category
- [ ] The entry describes the CHANGELOG generation step feature
- [ ] The entry mentions conventional commit prefixes, user approval, version detection, and merge behavior

---

### Task 7: Commit

**Step 1: Stage and commit all changes**

```bash
git add skills/start-feature/SKILL.md README.md CHANGELOG.md docs/plans/2026-02-20-changelog-generation.md docs/plans/2026-02-20-changelog-generation-plan.md
git commit -m "feat: add CHANGELOG generation step to lifecycle (#8)"
```

**Acceptance Criteria:**
- [ ] All five files are committed: `skills/start-feature/SKILL.md`, `README.md`, `CHANGELOG.md`, `docs/plans/2026-02-20-changelog-generation.md`, `docs/plans/2026-02-20-changelog-generation-plan.md`
- [ ] Commit message references issue #8
