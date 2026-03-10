# Vibecoding Prevention via Structured Acceptance Criteria — Design Document

**Date:** 2026-03-09
**Status:** Draft
**Issue:** #173

## Overview

Acceptance criteria written as prose ("ensure code quality", "feature works correctly") are vague, subjective, and cannot be automatically verified. This feature enforces a structured format — `[WHAT] measured by [HOW] verified by [COMMAND]` — that makes every criterion machine-verifiable and eliminates ambiguity in implementation plans.

---

## Example

**Bad (vague, unstructured):**
```
- [ ] Code quality is maintained
- [ ] Feature works correctly
- [ ] Performance is acceptable
```

**Good (structured format):**
```
- [ ] Structured format enforcement is active measured by verify-plan-criteria flagging criteria missing "measured by" and "verified by" keywords verified by `grep -c "measured by" skills/verify-plan-criteria/SKILL.md`
- [ ] Reference file is present measured by file existence at expected path verified by `ls references/acceptance-criteria-patterns.md`
- [ ] TypeScript types are valid measured by zero new compilation errors verified by `npm run typecheck`
- [ ] [MANUAL] Examples in acceptance-criteria-patterns.md are accurate and cover all common pattern types
```

---

## User Flow

### Step 1 — Write an implementation plan
User (or the lifecycle in YOLO/Express mode) writes an implementation plan via `writing-plans`. Acceptance criteria are written in `**Acceptance Criteria:**` sections using `- [ ]` items.

### Step 2 — Run verify-plan-criteria
The `verify-plan-criteria` skill scans all tasks. It currently checks for vague criteria ("works correctly", "looks good") and drafts replacements. After this change, it also checks format structure.

### Step 3 — Format check (new)
For each non-`[MANUAL]` criterion, the skill checks for the presence of both `measured by` and `verified by` keywords. Criteria missing these are flagged as non-conforming.

### Step 4 — Auto-draft structured replacement
Non-conforming criteria receive structured replacement drafts in the `[WHAT] measured by [HOW] verified by [COMMAND]` format. The drafting logic uses the same task context (Files, Steps, description) as the existing vague-criteria drafting.

### Step 5 — Review and apply
Drafted replacements are presented for approval (auto-accepted in YOLO mode). Applied to the plan via Edit tool.

---

## Pipeline / Architecture

### Format Validation Logic (added to Step 3 of verify-plan-criteria)

After the existing vague-criteria check, add a format check for each criterion:

```
has_structure = "measured by" in criterion_text AND "verified by" in criterion_text
```

Exempt from format check:
- Criteria with `[MANUAL]` prefix — manual verification criteria don't need a shell command
- Already-completed criteria (`- [x]`) — checked items are not re-validated

Flag non-conforming criteria with: `"Criterion does not follow [WHAT] measured by [HOW] verified by [COMMAND] format."`

### Updated Drafting Templates (Step 4 of verify-plan-criteria)

All drafted criteria must use the structured format. Updated template patterns:

| Trigger | Old Draft | New Draft |
|---------|-----------|-----------|
| Creating a file | `File exists at \`path\`` | `\`path\` is created measured by file presence verified by \`ls path\`` |
| Modifying a file | `Changes exist in \`path\`` | `\`path\` is modified measured by content change verified by \`grep 'expected_pattern' path\`` |
| Test execution | `Tests pass: \`cmd\`` | `Test suite passes measured by zero failures verified by \`cmd\`` |
| Typecheck | `` `cmd` passes with no new errors`` | `TypeScript types are valid measured by zero new compilation errors verified by \`cmd\`` |
| Lint | `` `cmd` passes with no new warnings`` | `Linting passes measured by zero new warnings verified by \`cmd\`` |
| Interface/type | `Type \`Name\` is exported from \`path\`` | `\`Name\` type is exported measured by interface presence verified by \`grep 'export.*Name' path\`` |
| Component | `Component \`Name\` exists and accepts expected props` | `\`Name\` component exists measured by file presence verified by \`ls path/Name.tsx\`` |
| API route | `Route handler exists at \`path\`` | `Route handler is defined measured by handler presence verified by \`grep 'handler' path\`` |
| Migration | `Migration file exists in migrations directory` | `Migration file is present measured by file existence verified by \`ls migrations/\`\` |

### New Reference Document

`references/acceptance-criteria-patterns.md` — serves as reference for both human writers and verify-plan-criteria's drafting step:

1. **Format specification** — authoritative definition of `[WHAT] measured by [HOW] verified by [COMMAND]`
2. **Good vs bad examples table** — 8-10 pairs covering common criteria types
3. **Common patterns** — file existence, command output, type checking, exports, components, API routes
4. **Special cases** — `[MANUAL]` prefix usage and when it's appropriate
5. **Anti-patterns** — prose criteria that look structured but aren't ("code is clean measured by review")

---

## Patterns & Constraints

### Error Handling
- No external calls. This is text parsing and file editing only.
- Graceful fallback: if a criterion line is malformed or unparseable, treat it as non-conforming rather than crashing.

### Types
- N/A — skill files are markdown text, not typed code.

### Performance
- O(n) scan over criteria lines — no concern.

### Stack-Specific
- This change touches skill instruction markdown files only. No Next.js or Textual library APIs involved.

---

## Scope

**Included:**
- Modify `skills/verify-plan-criteria/SKILL.md` — add format check in Step 3, update draft templates in Step 4
- Create `references/acceptance-criteria-patterns.md` — format spec, good/bad examples, common patterns

**Excluded:**
- Retroactive reformatting of existing plan files — old plans are not touched
- Changes to the `writing-plans` skill — owned by superpowers plugin, out of scope
- Any test scaffolding or CI changes — this is a markdown/skill text modification
- Changes to `verify-acceptance-criteria` — the execution-time verifier; format enforcement is a planning-time concern
