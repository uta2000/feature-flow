# Parallelize Skill Operations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the parallel dispatch pattern to 4 skill operations (design verification, spike experiments, context gathering, pattern study) and annotate the checklist with batch groupings.

**Architecture:** Each operation is rewritten from sequential inline execution to parallel agent dispatch using the Task tool. The code review pipeline (start-feature lines 475-569) is the reference pattern. All agents are dispatched in a single message to trigger concurrent execution, with a consistent failure handling pattern (retry once, then skip).

**Tech Stack:** Claude Code plugin (markdown skill files, no application code)

---

### Task 1: Annotate checklist with batch groupings

**Files:**
- Modify: `skills/design-verification/references/checklist.md:1-3`

**Step 1: Add batch header and first batch marker**

Insert a batch summary comment at the top of the file (before line 1) and add `<!-- batch: N -->` comments before each of the 14 category headings.

Use the Edit tool to prepend the batch header before the title, then add batch markers before each `## N.` heading.

The file currently starts with:
```markdown
# Design Verification Checklist

## 1. Schema Compatibility
```

Replace with:
```markdown
# Design Verification Checklist

<!-- Verification Batches:
  Batch 1 (Schema & Types): Categories 1-2
  Batch 2 (Pipeline & Components): Categories 3-5
  Batch 3 (Quality & Safety): Categories 6-8
  Batch 4 (Patterns & Build): Categories 9-12
  Batch 5 (Structure & Layout): Categories 13-14
  Batch 6 (Stack/Platform/Docs): Categories 15-18 (defined in SKILL.md, not here)
-->

<!-- batch: 1 -->
## 1. Schema Compatibility
```

**Step 2: Add remaining batch markers**

Add `<!-- batch: N -->` before each category heading where the batch changes:

- Before `## 2. Type Compatibility` — add `<!-- batch: 1 -->` (same batch as 1)
- Before `## 3. Pipeline / Flow Compatibility` — add `<!-- batch: 2 -->`
- Before `## 4. UI Component Inventory` — no marker needed (same batch as 3)
- Before `## 5. Cross-Feature Impact` — no marker needed (same batch as 3, 4)
- Before `## 6. Completeness` — add `<!-- batch: 3 -->`
- Before `## 7. Cost & Performance` — no marker needed
- Before `## 8. Migration Safety` — no marker needed
- Before `## 9. Internal Consistency` — add `<!-- batch: 4 -->`
- Before `## 10. Pattern Adherence` — no marker needed
- Before `## 11. Dependency & API Contract Verification` — no marker needed
- Before `## 12. Build Compatibility` — no marker needed
- Before `## 13. Route & Layout Chain` — add `<!-- batch: 5 -->`
- Before `## 14. Structural Anti-Patterns` — no marker needed

Only add a batch marker at the FIRST category of each new batch (where the batch number changes).

**Step 3: Verify**

Read `skills/design-verification/references/checklist.md` and confirm:
- Batch header comment exists at top with all 6 batches listed
- `<!-- batch: 1 -->` appears before `## 1. Schema Compatibility`
- `<!-- batch: 2 -->` appears before `## 3. Pipeline / Flow Compatibility`
- `<!-- batch: 3 -->` appears before `## 6. Completeness`
- `<!-- batch: 4 -->` appears before `## 9. Internal Consistency`
- `<!-- batch: 5 -->` appears before `## 13. Route & Layout Chain`
- All existing checklist content is preserved (no categories deleted or reordered)
- No `<!-- batch: 6 -->` marker in the file (Batch 6 is in SKILL.md)

**Step 4: Commit**

```bash
git add skills/design-verification/references/checklist.md
git commit -m "feat: annotate verification checklist with batch groupings for parallel dispatch"
```

**Acceptance criteria:**
- [ ] `checklist.md` contains a batch summary comment listing all 6 batches
- [ ] `checklist.md` contains exactly 5 `<!-- batch: N -->` markers (one per batch boundary: 1, 2, 3, 4, 5)
- [ ] Batch 6 is listed in the summary comment with note "(defined in SKILL.md, not here)"
- [ ] All 14 existing category sections are preserved with no content changes
- [ ] The file still starts with `# Design Verification Checklist` as its first non-comment heading

---

### Task 2: Parallelize design verification Step 4

**Files:**
- Modify: `skills/design-verification/SKILL.md:65-98`

**Step 1: Replace Step 4 content**

Replace the entire Step 4 section (from `### Step 4: Run Verification Checklist` through the end of the Documentation Compliance block, stopping before `### Step 5: Report Findings`) with the new parallel dispatch instructions.

The current Step 4 starts at line 65:
```markdown
### Step 4: Run Verification Checklist

Execute each category from the verification checklist. For each item, record: PASS, FAIL, or WARNING.
```

And ends just before line 99:
```markdown
### Step 5: Report Findings
```

Replace with new content that:

1. Opens with the same heading: `### Step 4: Run Verification Checklist`
2. Describes the parallel batch dispatch approach
3. Lists the 6 batch groupings table (matching the design doc)
4. Specifies verification depth filtering: before dispatching, consult the verification depth table; only dispatch batches containing at least one applicable category; pass applicable categories to each agent
5. Describes how to dispatch: use Task tool with `subagent_type=Explore`, all agents in a single message
6. Specifies context passed to each agent: (a) full design document, (b) assigned checklist categories from `references/checklist.md` (use batch markers to partition), (c) codebase exploration results from Step 3, (d) `.spec-driven.yml` content
7. Specifies expected return format per agent: `{ category, status: PASS|FAIL|WARNING, finding }`
8. Specifies Batch 6 conditional dispatch: only if `.spec-driven.yml` has stack/platform/gotchas or Context7 is available; Batch 6 sources check instructions from lines 86-97 of this SKILL.md, not from checklist.md
9. Specifies failure handling: retry failed agent once, then skip with warning noting which categories were skipped
10. Specifies consolidation: merge all agent results into unified report table, sort by category number
11. Preserves the category reference list (1-18) so the skill still documents what gets checked
12. Preserves the YOLO behavior note if present

**Step 2: Verify**

Read `skills/design-verification/SKILL.md` and confirm:
- Step 4 heading is preserved
- The 6-batch table is present
- Verification depth filtering paragraph is present
- Agent dispatch instructions specify `subagent_type=Explore` and "single message"
- Context, return format, and consolidation sections are present
- Batch 6 conditional dispatch is documented
- Failure handling (retry once, then skip) is documented
- Step 5 (Report Findings) immediately follows and is unchanged
- All content after Step 5 is unchanged

**Step 3: Commit**

```bash
git add skills/design-verification/SKILL.md
git commit -m "feat: parallelize design verification with 6 batch agents"
```

**Acceptance criteria:**
- [ ] Step 4 instructs dispatching 6 Explore agents in parallel batches (one per batch from checklist.md)
- [ ] The batch groupings table matches: Batch 1 (categories 1-2), Batch 2 (3-5), Batch 3 (6-8), Batch 4 (9-12), Batch 5 (13-14), Batch 6 (15-18)
- [ ] Step 4 specifies verification depth filtering before dispatching
- [ ] Step 4 specifies context passed: design doc, checklist categories, exploration results, .spec-driven.yml
- [ ] Step 4 specifies expected return format: `{ category, status, finding }`
- [ ] Step 4 specifies consolidation: merge into unified report table, sort by category number
- [ ] Step 4 specifies failure handling: retry once, then skip with warning
- [ ] Step 4 specifies Batch 6 conditional dispatch and that it sources from SKILL.md not checklist.md
- [ ] Step 5 (Report Findings) is unchanged
- [ ] The verification depth table (lines ~177-184) is unchanged

---

### Task 3: Parallelize spike experiments Step 3

**Files:**
- Modify: `skills/spike/SKILL.md:92-101`

**Step 1: Replace Step 3 content**

Replace the entire Step 3 section (from `### Step 3: Run Experiments` through the end of the CANNOT_TEST line, stopping before `### Step 4: Report Findings`) with parallel dispatch instructions.

The current Step 3 starts at line 92:
```markdown
### Step 3: Run Experiments

Execute each experiment and record results. For each:
```

And ends just before line 103:
```markdown
### Step 4: Report Findings
```

Replace with new content that:

1. Opens with the same heading: `### Step 3: Run Experiments`
2. Describes parallel dispatch: one agent per selected assumption
3. Specifies agent type: `general-purpose` (needs Bash for experiment scripts)
4. Specifies isolation: `isolation: "worktree"` on every dispatch
5. Specifies cap: maximum 5 concurrent agents; if more than 5 assumptions, dispatch first 5, wait, dispatch remainder
6. Specifies context passed to each agent: (a) the hypothesis, (b) experiment design from Step 2, (c) instructions to create spike script, run it, record evidence, return verdict, (d) note about API keys/credentials
7. Specifies expected return format: `{ assumption, verdict: CONFIRMED|DENIED|CANNOT_TEST, evidence }`
8. Specifies failure handling: retry failed agent once, then mark its assumption as CANNOT_TEST with evidence "Agent failed after retry"
9. Specifies consolidation: merge all results into the spike report table (same format as Step 4 expects)
10. Notes that worktrees are automatically cleaned up if no persistent changes

**Step 2: Verify**

Read `skills/spike/SKILL.md` and confirm:
- Step 3 heading is preserved
- Parallel dispatch with `general-purpose` agents specified
- `isolation: "worktree"` mentioned
- Cap of 5 concurrent agents documented with overflow handling
- Context, return format, failure handling, and consolidation documented
- Step 4 (Report Findings) immediately follows and is unchanged
- All content before Step 3 and after Step 4 is unchanged

**Step 3: Commit**

```bash
git add skills/spike/SKILL.md
git commit -m "feat: parallelize spike experiments with worktree-isolated agents"
```

**Acceptance criteria:**
- [ ] Step 3 dispatches one `general-purpose` agent per assumption
- [ ] Every agent dispatch uses `isolation: "worktree"`
- [ ] Maximum 5 concurrent agents with overflow handling documented
- [ ] Context passed: hypothesis, experiment design, instructions, env note
- [ ] Return format: `{ assumption, verdict, evidence }`
- [ ] Failure handling: retry once, then CANNOT_TEST
- [ ] Step 4 (Report Findings) and Step 5 (Write Back Gotchas) are unchanged

---

### Task 4: Parallelize design document context gathering

**Files:**
- Modify: `skills/design-document/SKILL.md:22-36`

**Step 1: Replace Step 1 codebase gathering**

The current Step 1 runs from line 22 to line 36. Replace the portion that describes codebase exploration (items 2-3 and the Glob/Grep/Read instructions) with parallel agent dispatch, while preserving item 1 (conversation extraction) and the YOLO behavior paragraph.

The new Step 1 should:

1. Preserve item 1: "From the conversation: Extract all decisions..."
2. Replace items 2-3 and Glob/Grep/Read instructions with parallel Explore agent dispatch:
   - Describe dispatching 3-4 Explore agents in parallel
   - Agent table: Format patterns (always), Stack & dependencies (always), Relevant code (always), Documentation via Context7 (conditional on `.spec-driven.yml` `context7` field)
   - Context per agent: feature description from brainstorming/issue, specific gathering assignment, library IDs for Documentation agent
   - Return format: `{ area, findings: string[] }`
   - Consolidation: synthesize all summaries into context for writing
   - Failure handling: retry once, then skip with warning
3. Preserve the clarification question behavior (AskUserQuestion)
4. Preserve the YOLO behavior paragraph

**Step 2: Verify**

Read `skills/design-document/SKILL.md` and confirm:
- Step 1 heading is preserved
- Item 1 (conversation extraction) is preserved
- Parallel Explore agent dispatch replaces sequential Glob/Grep/Read
- Agent assignment table with 4 agents present
- Context, return format, consolidation, and failure handling documented
- Clarification question behavior preserved
- YOLO behavior paragraph preserved
- Step 2 (Determine Sections) immediately follows and is unchanged

**Step 3: Commit**

```bash
git add skills/design-document/SKILL.md
git commit -m "feat: parallelize design document context gathering with Explore agents"
```

**Acceptance criteria:**
- [ ] Step 1 dispatches 3-4 parallel Explore agents for codebase/doc context
- [ ] Agent table lists: Format patterns, Stack & dependencies, Relevant code, Documentation (conditional)
- [ ] Conversation extraction (item 1) is preserved inline — not dispatched to an agent
- [ ] Context passed per agent: feature description, gathering assignment, library IDs
- [ ] Return format: `{ area, findings }`
- [ ] Failure handling: retry once, then skip
- [ ] YOLO behavior paragraph is preserved unchanged
- [ ] Step 2 (Determine Sections) and all subsequent steps are unchanged

---

### Task 5: Parallelize start-feature pattern study

**Files:**
- Modify: `skills/start-feature/SKILL.md:358-429`

**Step 1: Replace pattern study process**

The current "Study Existing Patterns" step runs from line 358 to line 429. Replace the process section (steps 1-7 and quality rules) with parallel dispatch, while preserving the step heading, purpose paragraph, output format, and quality rules concept.

The new process should:

1. Preserve the step heading and opening paragraph about preventing "vibing"
2. Step 1: Read `../../references/coding-standards.md` (stays inline — not parallelized)
3. Step 2: Identify areas of codebase to be modified (from implementation plan) — stays inline
4. Step 3: **Parallel dispatch** — For each identified area, dispatch one Explore agent. Each agent reads 2-3 example files in its area and extracts: file structure, error handling, naming conventions, state management patterns, and anti-patterns (files >300 lines, mixed concerns, circular deps, duplicated logic)
   - Agent type: `subagent_type=Explore`
   - Dispatch all agents in a single message
   - Context per agent: area name, file paths/directories to examine, instructions to extract patterns and flag anti-patterns
   - Return format per agent: area, patterns (aspect + pattern), antiPatterns (file + issue + recommendation)
   - Failure handling: retry once, then skip area with warning
5. Step 4: **Consolidation** — Merge all agent results into:
   - "Existing Patterns Found" sections (per area) — preserve the current output format
   - "Anti-Patterns Found (do NOT replicate)" section
6. Step 5: Generate "How to Code This" notes per task (stays inline — uses merged patterns)
7. Step 6: Pass patterns, notes, and anti-pattern warnings to implementation step as mandatory context
8. Quality rules: preserve the existing rules (read at least 2 files per area, consistency > purity except for structural anti-patterns)

**Step 2: Verify**

Read `skills/start-feature/SKILL.md` lines 358-430 and confirm:
- Step heading and purpose paragraph preserved
- coding-standards.md reading stays inline (Step 1)
- Area identification stays inline (Step 2)
- Parallel Explore agent dispatch replaces sequential file reading (Step 3)
- Agent dispatch specifies `subagent_type=Explore`, single message, context, return format, failure handling
- Consolidation merges into same output format as before (Step 4)
- "How to Code This" notes generation stays inline (Step 5)
- Context passing to implementation step stays inline (Step 6)
- Quality rules preserved
- Self-Review step (line ~431) immediately follows and is unchanged

**Step 3: Commit**

```bash
git add skills/start-feature/SKILL.md
git commit -m "feat: parallelize pattern study with Explore agents per codebase area"
```

**Acceptance criteria:**
- [ ] Pattern study dispatches one Explore agent per codebase area
- [ ] Agents dispatched in a single message for parallel execution
- [ ] coding-standards.md reading (Step 1) remains inline
- [ ] Area identification (Step 2) remains inline
- [ ] "How to Code This" notes generation remains inline (uses merged results)
- [ ] Agent context includes: area name, file paths, extraction instructions
- [ ] Agent return format includes patterns and anti-patterns
- [ ] Failure handling: retry once, then skip area
- [ ] Output format ("Existing Patterns Found" + "Anti-Patterns Found") is preserved
- [ ] Quality rules are preserved (2+ files per area, consistency > purity, structural anti-pattern exception)
- [ ] Self-Review step and Code Review Pipeline step are completely unchanged
