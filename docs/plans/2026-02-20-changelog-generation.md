# CHANGELOG Generation from Commits — Design Document

**Date:** 2026-02-20
**Status:** Draft
**Issue:** #8

## Overview

The spec-driven lifecycle's final steps (Commit and PR) create commits and a pull request but do not update the CHANGELOG. This means every feature ships without a changelog entry unless the developer writes one manually. This enhancement adds a new inline step — "Generate CHANGELOG entry" — that parses the feature branch's git commits, categorizes them by conventional commit prefix, generates a Keep a Changelog entry, and presents it for user approval before writing it to `CHANGELOG.md`.

## Example

**Input** — commits on the feature branch:

```
feat: add CSV export to results page
feat: add column selection dialog for CSV export
fix: handle empty result set in CSV export
refactor: extract export utilities from results component
test: add CSV export integration tests
```

**Generated CHANGELOG entry:**

```markdown
## [Unreleased]

### Added
- Add CSV export to results page
- Add column selection dialog for CSV export

### Fixed
- Handle empty result set in CSV export

### Changed
- Extract export utilities from results component

### Testing
- Add CSV export integration tests
```

**Non-conventional fallback** — when commits don't use prefixes:

```
Added CSV export feature
Fixed empty result handling
Updated tests
```

Generates:

```markdown
## [Unreleased]

### Changes
- Added CSV export feature
- Fixed empty result handling
- Updated tests
```

## User Flow

### Step 1 — Collect and categorize commits
The step runs `git log --format="%s" main...HEAD` to get all commit messages on the feature branch. Merge commits (`Merge branch...`, `Merge pull request...`) and fixup commits (`fixup!`, `squash!`) are filtered out. Each remaining commit is categorized by its conventional commit prefix.

### Step 2 — Generate entry
A CHANGELOG entry is generated in Keep a Changelog format. The version heading defaults to `## [Unreleased]`. If a version can be detected from `package.json` `version` field, `Cargo.toml` `[package] version`, `pyproject.toml` `[project] version`, `mix.exs` `@version`, or the latest semver git tag, it is offered as an alternative via `AskUserQuestion`.

### Step 3 — Present for approval
The generated entry is presented to the user via `AskUserQuestion` with options: "Looks good — write it", "Let me edit", "Skip CHANGELOG". If the user chooses to edit, they provide corrections in freeform text and the entry is revised. If they skip, the step announces the risk and proceeds.

### Step 4 — Write to CHANGELOG.md
The approved entry is written to the project's `CHANGELOG.md`:
- **File exists with `[Unreleased]` section:** Merge new entries into existing categories. New categories are appended after existing ones.
- **File exists without `[Unreleased]`:** Insert a new `## [Unreleased]` section after the file's header (first `# ` heading).
- **No file exists:** Create `CHANGELOG.md` with the Keep a Changelog header and the generated entry.

## Pipeline Architecture

The CHANGELOG generation step is a standalone inline step inserted into the lifecycle after Code Review and before Final Verification. It runs for all scopes except Quick fix.

**Current flow:**
```
... → Self-review → Code review → Final verification → Commit and PR
```

**New flow:**
```
... → Self-review → Code review → Generate CHANGELOG entry → Final verification → Commit and PR
```

### Step List Changes

**Small enhancement** (was 13 steps, now 14):
```
- [ ] 12. Generate CHANGELOG entry      ← NEW
- [ ] 13. Final verification             (was 12)
- [ ] 14. Commit and PR                  (was 13)
```

**Feature** (was 14 steps, now 15):
```
- [ ] 13. Generate CHANGELOG entry      ← NEW
- [ ] 14. Final verification             (was 13)
- [ ] 15. Commit and PR                  (was 14)
```

**Major feature** (was 15 steps, now 16):
```
- [ ] 14. Generate CHANGELOG entry      ← NEW
- [ ] 15. Final verification             (was 14)
- [ ] 16. Commit and PR                  (was 15)
```

**Quick fix** (unchanged — no CHANGELOG step).

### Skill Mapping Table Addition

| Step | Skill to Invoke | Expected Output |
|------|----------------|-----------------|
| Generate CHANGELOG entry | No skill — inline step (see below) | CHANGELOG.md updated with categorized entry |

### Commit Categorization Rules

| Prefix | Keep a Changelog Category |
|--------|--------------------------|
| `feat:` | Added |
| `fix:` | Fixed |
| `refactor:` | Changed |
| `docs:` | Documentation |
| `test:` | Testing |
| `chore:` | Maintenance |
| No prefix match | Changes (fallback) |

**Processing rules:**
1. Strip the prefix and optional scope from commit messages: `feat(csv): add export` → `Add export`
2. Capitalize the first letter of each entry
3. Deduplicate entries with identical messages (keep one)
4. Filter out merge commits matching `^Merge (branch|pull request)`
5. Filter out fixup/squash commits matching `^(fixup|squash)!`
6. Empty categories are omitted from the output

### Version Detection

Check these sources in order, use the first one found:

1. `package.json` → `version` field
2. `Cargo.toml` → `[package]` section `version` field
3. `pyproject.toml` → `[project]` section `version` field
4. `mix.exs` → `@version` attribute
5. Latest git tag matching semver pattern (`v?[0-9]+\.[0-9]+\.[0-9]+`)

If a version is detected, present it alongside `[Unreleased]` via `AskUserQuestion`. Default selection is `[Unreleased]`.

### Merge Into Existing `[Unreleased]`

When CHANGELOG.md already has an `[Unreleased]` section with entries:

1. Parse existing categories under `[Unreleased]` (e.g., existing `### Added` with entries)
2. For each generated category:
   - If the category already exists, append new entries at the end of that category's list
   - If the category doesn't exist, add it after the last existing category
3. Preserve all existing entries — never remove or reorder them
4. Deduplicate: if a generated entry matches an existing entry (case-insensitive), skip it

## Changes to Existing Files

### `skills/start-feature/SKILL.md`

1. **Step lists:** Add "Generate CHANGELOG entry" step to Small enhancement, Feature, and Major feature step lists (after Code review, before Final verification). Renumber subsequent steps.
2. **Skill mapping table:** Add the Generate CHANGELOG entry row.
3. **New inline section:** Add "Generate CHANGELOG Entry Step (inline — no separate skill)" section after the Code Review Pipeline Step section, containing the full generation logic.

### `README.md`

1. **Lifecycle table:** Add the Generate CHANGELOG entry row showing it's an inline step.
2. **Changelog section (if applicable):** Update with the new version entry for this feature.

### `CHANGELOG.md`

1. Add entry for this feature under the appropriate version.

## Scope

**Included:**
- Inline CHANGELOG generation step in `skills/start-feature/SKILL.md`
- Conventional commit prefix categorization with fallback
- Keep a Changelog format generation
- User approval flow (approve, edit, or skip)
- Merge into existing `[Unreleased]` section
- Version detection from common project files and git tags
- New CHANGELOG.md creation when file doesn't exist
- Step list and skill mapping table updates for all applicable scopes
- README lifecycle table update

**Excluded:**
- Automatic version bumping (version detection is read-only, for suggestion only)
- Modifying the `finishing-a-development-branch` superpowers skill
- Supporting non-Keep-a-Changelog formats (e.g., GNU Changelog, custom formats)
- Persisting generated entries across sessions if user skips
- Breaking changes detection or `BREAKING CHANGE:` footer parsing (can be added later)
- Scope parsing from conventional commits (e.g., `feat(auth):`) — scope is stripped, not used for grouping
