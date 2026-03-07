# Fix context7 Parameter Name Mismatch Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Add parameter documentation to tool-api.md — STATUS: done (commit 93a81b7)
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent the AI from calling `mcp__plugin_context7_context7__query-docs` with the wrong parameter name `context7CompatibleLibraryID` by documenting the correct parameters explicitly in `tool-api.md`.

**Architecture:** Single-file documentation update to `references/tool-api.md`. Add parameter tables for both context7 MCP tools and a common-mistakes entry that explicitly calls out `context7CompatibleLibraryID` as the wrong name. No code logic changes — documentation only.

**Tech Stack:** Markdown

---

### Task 1: Add parameter documentation to tool-api.md

**Files:**
- Modify: `references/tool-api.md` (Context7 MCP Tools section, lines 110–134)

**Step 1: Verify the current state of the Context7 section**

Read `references/tool-api.md` lines 110–134 to confirm what exists. Expected: a table listing the two tools without parameter details, plus a usage pattern and one common-mistakes entry.

**Step 2: Replace the tool table and add parameter documentation**

Replace the existing Context7 section's tool table with expanded parameter tables for both tools. The updated section should read:

```markdown
**Tools:**

### `mcp__plugin_context7_context7__resolve-library-id`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `libraryName` | string | Yes | Library name to search for (e.g., `"next.js"`, `"supabase-js"`) |
| `query` | string | Yes | What you need to accomplish — used to rank results by relevance |

### `mcp__plugin_context7_context7__query-docs`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `libraryId` | string | Yes | Context7 library ID in format `/org/project` (from `resolve-library-id` or `.feature-flow.yml`) |
| `query` | string | Yes | Specific question or topic (e.g., `"server actions error handling"`) |
```

**Step 3: Add common-mistakes entry for the wrong parameter name**

Append to the existing "Common mistakes — do NOT do these" list in the Context7 section:

```markdown
- Do NOT use `context7CompatibleLibraryID` as a parameter name — the correct parameter is `libraryId`
- Do NOT omit `libraryName` when calling `resolve-library-id` — both `libraryName` and `query` are required
```

**Step 4: Verify the edit**

Read the updated section back and confirm:
- Both tools have parameter tables
- `libraryId` is documented as the correct parameter for `query-docs`
- `context7CompatibleLibraryID` appears in common mistakes
- No other content was accidentally removed

**Step 5: Commit**

```bash
git add references/tool-api.md
git commit -m "fix: document context7 tool parameters to prevent wrong parameter name usage

Closes #157"
```

**Acceptance Criteria:**
- [ ] `references/tool-api.md` contains a parameter table for `mcp__plugin_context7_context7__resolve-library-id` listing `libraryName` and `query`
- [ ] `references/tool-api.md` contains a parameter table for `mcp__plugin_context7_context7__query-docs` listing `libraryId` and `query`
- [ ] The common-mistakes section explicitly states: "Do NOT use `context7CompatibleLibraryID` as a parameter name — the correct parameter is `libraryId`"
- [ ] No existing content in `tool-api.md` outside the Context7 section is modified
- [ ] `git log` shows a new commit with the fix

**Quality Constraints:**
- Error handling: N/A — documentation-only change, no runtime logic
- Types: N/A — Markdown file
- Function length: N/A
- Pattern reference: Follow the existing Task Tool parameter table format in `references/tool-api.md` (lines 8–19)
- Files modified: `references/tool-api.md` (134 lines — design-first required)
- Design-first files: `references/tool-api.md` — implementer must output change plan before editing (shows exactly which lines are replaced/inserted)
