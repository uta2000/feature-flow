# Rename Plugin to feature-flow — Design Document

**Date:** 2026-02-21
**Status:** Draft
**Issue:** #29

## Overview

Rename the plugin from `spec-driven` to `feature-flow` across all files, config format, and GitHub repo. The current name implies a spec/documentation tool; `feature-flow` describes what the plugin actually does — features flow through a structured lifecycle. This is a pure text replacement with no logic or behavioral changes.

## Replacement Rules

Eight replacement rules cover every occurrence:

| # | Pattern | Replacement | Where |
|---|---------|-------------|-------|
| 1 | `spec-driven` | `feature-flow` | Everywhere (case-sensitive) |
| 2 | `.spec-driven.yml` | `.feature-flow.yml` | Config file refs in skills, hooks, references, README |
| 3 | `[spec-driven]` | `[feature-flow]` | Log prefixes in hooks.json, quality-gate.js, lint-file.js |
| 4 | `github.com/uta2000/spec-driven` | `github.com/uta2000/feature-flow` | plugin.json, README.md |
| 5 | `"spec-driven"` keyword | `"feature-flow"` | plugin.json keywords array |
| 6 | `SPEC-DRIVEN` | `FEATURE-FLOW` | SessionStart hook uppercase text in hooks.json |
| 7 | CHANGELOG `[Unreleased]` | Rename refs in current unreleased content + add rename entry | CHANGELOG.md |
| 8 | Plugin description | Update to use `feature-flow` | plugin.json, marketplace.json, README.md |

Rules 1-6 are mechanical find-and-replace. Rules 7-8 require targeted edits.

## Files Affected

### Functional files (16 files, 120 occurrences)

- `.claude-plugin/plugin.json` (4) — name, homepage, repository, keywords
- `.claude-plugin/marketplace.json` (2) — name, description
- `hooks/hooks.json` (4) — SessionStart messages, inline hook log prefixes
- `hooks/scripts/quality-gate.js` (14) — `[spec-driven]` log prefixes, `.spec-driven.yml` check
- `hooks/scripts/lint-file.js` (2) — `[spec-driven]` log prefixes
- `skills/start-feature/SKILL.md` (21) — config file refs, plugin name
- `skills/design-verification/SKILL.md` (11) — config file refs, plugin name
- `skills/spike/SKILL.md` (5) — config file refs
- `skills/design-document/SKILL.md` (3) — config file refs
- `skills/create-issue/SKILL.md` (1) — config file ref
- `skills/verify-plan-criteria/SKILL.md` (1) — plugin name
- `references/auto-discovery.md` (9) — config file refs, plugin name
- `references/project-context-schema.md` (5) — config file format docs
- `references/coding-standards.md` (1) — plugin name
- `README.md` (28) — plugin name, install commands, config refs, repo URLs
- `CHANGELOG.md` (9) — unreleased section content + rename entry

### Historical plan files (19 files, 75 occurrences)

All files in `docs/plans/` — bulk find-and-replace for consistency.

### Post-merge manual steps

- GitHub repo: `gh repo rename feature-flow`
- Local directory: `mv ~/Dev/spec-driven ~/Dev/feature-flow`
- Marketplace: re-publish under new name
- Version bump: `1.13.0` → `1.14.0` in plugin.json

## Scope

**Included:**
- All `spec-driven` → `feature-flow` text replacements across 35 files
- All `.spec-driven.yml` → `.feature-flow.yml` config file references
- All `SPEC-DRIVEN` → `FEATURE-FLOW` uppercase replacements
- Version bump to `1.14.0`
- CHANGELOG rename entry
- CHANGELOG `[Unreleased]` content updated

**Excluded:**
- No backward compatibility shim (no users exist)
- No logic or behavioral changes
- `.worktrees/` directory ignored (ephemeral)
- Historical CHANGELOG version entries kept as-is (they document what the plugin was called at that time)
- GitHub repo rename and local directory rename are manual post-merge steps
