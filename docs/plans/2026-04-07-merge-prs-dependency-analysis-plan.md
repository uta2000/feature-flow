# Merge-PRs Dependency Analysis Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Update Step 3 in SKILL.md — STATUS: pending
Task 2: Create dependency-analysis.md reference file — STATUS: pending
Task 3: Commit both files — STATUS: pending
CURRENT: none
-->

> **For Claude:** Read only the PROGRESS INDEX to determine current task.
> Then read the full section for that specific task only.
> Tool parameter types: Edit `replace_all`: boolean (`true`/`false`), NOT string. Read `offset`/`limit`: number, NOT string.

**Goal:** Add lightweight cross-PR import dependency analysis to the merge-prs skill's ordering logic, so that PRs whose changed files are imported by other PRs are always merged first.

**Architecture:** All changes are Markdown documentation files — no compiled code. The dependency analysis runs as a new Step 3a (priority #1) inserted before the four existing heuristics in `skills/merge-prs/SKILL.md`. Full algorithm detail lives in a new reference file `skills/merge-prs/references/dependency-analysis.md`, modeled after the existing `conflict-resolution.md` reference.

**Tech Stack:** Markdown skill files, `gh` CLI (already used by merge-prs), `git` — no compiled code, no tests to write.

---

## Parallelization Note

Task 1 (SKILL.md update) and Task 2 (new reference file) touch different files with no dependencies between them — they can run in parallel. Task 3 (commit) must come last.

---

### Task 1: Update Step 3 in `skills/merge-prs/SKILL.md`

**Files:**
- Modify: `skills/merge-prs/SKILL.md` (lines 61–71)

**What this is:** Replace the existing Step 3 "Determine merge order" block to add dependency analysis as priority #1, renumber the four existing heuristics as priorities 2–5, and add a reference to the new `dependency-analysis.md` file.

**Context to read first:**
- Read `skills/merge-prs/SKILL.md` lines 61–72 — the exact block being replaced
- Read `skills/merge-prs/references/conflict-resolution.md` lines 1–10 — the "Read this file when…" reference pattern used in SKILL.md

**Step 1: Locate the exact block to replace**

Run:
```bash
grep -n "Step 3\|pending CI\|fewest changed\|main.*master\|ascending PR" /Users/weee/Dev/feature-flow/skills/merge-prs/SKILL.md
```

Expected output: lines 61–70 showing the Step 3 heading and the four numbered criteria.

**Step 2: Replace the Step 3 block**

Find this exact text in `skills/merge-prs/SKILL.md`:

```markdown
### Step 3: Determine merge order

Sort the discovered PRs to minimize conflicts:

1. PRs with no pending CI checks first (fastest path)
2. PRs with fewest changed files second (lowest conflict surface)
3. PRs targeting `main` / `master` before PRs targeting feature branches
4. Within ties: ascending PR number (oldest first)

**Express/YOLO:** Announce: `Express: ship — Merge order: #[N1] → #[N2] → ... Proceeding...`
**Interactive:** Present order, wait for confirmation via `AskUserQuestion` before proceeding.
```

Replace it with:

```markdown
### Step 3: Determine merge order

**Read `references/dependency-analysis.md`** to perform cross-PR import dependency analysis before applying heuristics.

Sort the discovered PRs to minimize conflicts:

1. **Dependency constraints** — if PR B's changed files import a file that PR A changes, PR A merges first. Run dependency analysis per `references/dependency-analysis.md` before applying heuristics 2–5. If a circular dependency is detected, warn and skip to heuristics 2–5.
2. PRs with no pending CI checks first (fastest path)
3. PRs with fewest changed files second (lowest conflict surface)
4. PRs targeting `main` / `master` before PRs targeting feature branches
5. Within ties: ascending PR number (oldest first)

**Express/YOLO:** Announce: `Express: ship — Merge order: #[N1] → #[N2] → ... Proceeding...`
**Interactive:** Present order, wait for confirmation via `AskUserQuestion` before proceeding.
```

**Step 3: Verify the edit looks correct**

Run:
```bash
grep -n -A 20 "Step 3: Determine merge order" /Users/weee/Dev/feature-flow/skills/merge-prs/SKILL.md | head -25
```

Expected: The new block shows "Dependency constraints" as item 1, "pending CI" as item 2, and the reference to `dependency-analysis.md` at the top.

**Acceptance Criteria:**
- [ ] Step 3 shows "Dependency constraints" as item 1 with reference to `dependency-analysis.md`
- [ ] Existing heuristics are renumbered 2–5
- [ ] A "Read `references/dependency-analysis.md`" callout appears at the top of Step 3
- [ ] No other sections of SKILL.md are modified

**Quality Constraints:**
- Pattern: follow existing SKILL.md step structure and reference callout format (match §Conflict Resolution's "Read references/..." pattern)
- Files modified: `skills/merge-prs/SKILL.md` (275 lines)
- Parallelizable: yes

---

### Task 2: Create `skills/merge-prs/references/dependency-analysis.md`

**Files:**
- Create: `skills/merge-prs/references/dependency-analysis.md`

**What this is:** A new reference file documenting the full dependency analysis algorithm — import extraction patterns for four languages, graph construction, topological sort with cycle fallback, path matching strategy, edge cases, and worked examples. Modeled after `conflict-resolution.md`.

**Context to read first:**
- Read `skills/merge-prs/references/conflict-resolution.md` — the structure and tone to match (header, classification tables, code blocks, examples section)

**Step 1: Confirm the references directory exists and is writable**

Run:
```bash
ls /Users/weee/Dev/feature-flow/skills/merge-prs/references/
```

Expected: `CLAUDE.md  conflict-resolution.md` — confirms the directory exists.

**Step 2: Create the file**

Write `skills/merge-prs/references/dependency-analysis.md` with the following content:

````markdown
# Dependency Analysis

Reference file for the `merge-prs` skill. Read this file during Step 3 (Determine merge order) to perform cross-PR import dependency analysis before applying heuristics.

---

## Overview

For each batch of PRs to merge, build a partial ordering based on import/require dependencies between their changed files. If PR B's diff imports a path that matches a file PR A changes, then PR A must merge before PR B.

**When to apply:** Before heuristics 2–5. Dependency constraints are hard ordering requirements, not tiebreakers.

**When to skip:** If a circular dependency is detected, warn the user and fall through to heuristics 2–5 (existing behavior).

---

## Step 1: Collect Changed Files per PR

For each PR in the batch, get its changed files:

```bash
gh pr diff <number> --name-only
```

Store the result as a list:
```
pr_files[<number>] = ["src/utils.ts", "src/api/handler.ts", ...]
```

---

## Step 2: Extract Imports from Changed Files

For each changed file in each PR, extract import/require statements from the **diff content** (lines prefixed with `+` or unchanged context). Use `gh pr diff <number>` to get full diff content, then scan for import patterns.

Only scan lines that are added (`+`) or context lines (no prefix) — ignore removed lines (`-`).

### Import Patterns by Language

#### JavaScript / TypeScript

```
import ... from '[path]'
import('[path]')
require('[path]')
export ... from '[path]'  ← re-export (counts as dependency)
```

Regex (applied per line):
```
/(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/
/(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/
/require\s*\(\s*['"]([^'"]+)['"]\s*\)/
```

#### Python

```
import foo
from foo import bar
from foo.bar import baz
```

Regex:
```
/^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/
```

Convert dotted module path to file path: `foo.bar.baz` → `foo/bar/baz.py` (also try `foo/bar/baz/__init__.py`).

#### Go

```
import "github.com/org/repo/pkg/foo"
import (
    "github.com/org/repo/pkg/foo"
)
```

Regex:
```
/"([^"]+)"/
```

Filter to paths that start with the repo module prefix (read from `go.mod` if present). Strip the module prefix to get a local path: `github.com/org/repo/pkg/foo` → `pkg/foo`.

#### Rust

```
use crate::utils;
use super::handler;
use self::config;
```

Regex:
```
/^use\s+(crate|super|self)::([\w:]+)/
```

Convert `::` path to directory path: `crate::utils::helpers` → `src/utils/helpers.rs` (also try `src/utils/helpers/mod.rs`).

---

## Step 3: Build the Dependency Graph

For each PR B, for each import path extracted from B's changed files:

1. Normalize the import path to a candidate file path (see §Path Matching).
2. For each other PR A, check if the candidate path matches any file in `pr_files[A]`.
3. If match found: add edge **A → B** (A must merge before B).

```
dependency_graph = {}
for each PR B:
  for each import_path in imports_of(B):
    candidate = normalize(import_path)
    for each PR A (A ≠ B):
      if candidate matches any file in pr_files[A]:
        dependency_graph[A].add(B)   # A → B means A before B
```

---

## Step 4: Topological Sort

Run Kahn's algorithm on `dependency_graph`:

```
1. Compute in-degree for each PR node
2. Initialize queue with all PRs that have in-degree 0
3. While queue is non-empty:
   a. Pop PR with lowest PR number (for determinism)
   b. Append to sorted order
   c. For each successor S of this PR: decrement S's in-degree
   d. If S's in-degree reaches 0: add to queue
4. If sorted order length < total PRs: cycle detected → warn and fall back
```

**Fallback on cycle:**

```
Warning: Circular import dependency detected among PRs [#N1, #N2, ...].
         Falling back to heuristic ordering (CI status → file count → base branch → PR number).
```

Present this warning to the user in all modes (YOLO, Express, and Interactive) before proceeding with heuristic ordering.

---

## Path Matching Strategy

Import paths are rarely identical to repository file paths. Use this two-tier matching strategy:

### Tier 1: Exact suffix match

Check whether any file in `pr_files[A]` ends with the normalized import path:

```
"src/utils.ts".endsWith("utils.ts")  → true
"src/utils.ts".endsWith("src/utils.ts")  → true
"src/utils.ts".endsWith("utils")  → false (no extension match)
```

For TypeScript/JavaScript, try the import path with extensions appended: `.ts`, `.tsx`, `.js`, `.jsx`, `/index.ts`, `/index.js`.

### Tier 2: Basename match (fuzzy fallback)

If no suffix match, compare basename only:

```
basename("src/utils.ts") === basename(import_path_with_extension)
```

Only apply fuzzy match if **exactly one** file in the entire batch matches the basename. If multiple files share the same basename, skip the fuzzy match to avoid false positives.

### Non-matches (always skip)

- Node.js built-in modules (`fs`, `path`, `os`, `http`, etc.)
- `node_modules` paths (anything not starting with `.`, `/`, or the repo module prefix)
- Absolute paths outside the repository root
- Paths starting with `@` that resolve to `node_modules` (e.g. `@scope/package`)

---

## Edge Cases

### Re-exports (JS/TS)

```typescript
export { foo } from './utils'
export * from './utils'
```

Treat as import dependency — the re-exporting file depends on `./utils`. Include these in extraction.

### Dynamic imports (JS/TS)

```typescript
const mod = await import('./plugin')
const mod = require('./config')
```

Include in extraction. The regex patterns above already capture these.

### Barrel files (`index.ts`)

A file `src/components/index.ts` that re-exports from sibling files creates transitive dependencies. **Do not chase transitive imports** — only analyze the direct imports of each PR's changed files. Transitive analysis produces too many false positives.

### Monorepo paths

For workspaces using `@scope/package-name` internal imports:

- Read `package.json` `workspaces` field or `pnpm-workspace.yaml` to find local package names
- Map `@scope/package-name` to its local directory (e.g. `packages/package-name/`)
- Then check if any file in `pr_files[A]` lives under that directory

If workspace config is unavailable or parsing fails, skip monorepo path resolution and continue with standard matching.

### Python `__init__.py`

For `from foo.bar import baz`, the import could resolve to:
- `foo/bar/baz.py`
- `foo/bar/baz/__init__.py`
- A name exported from `foo/bar/__init__.py`

Try all three candidates. Match on first hit.

### Go vendor directory

If a Go repo uses vendoring (`vendor/` directory exists), also check `vendor/<import_path>` as a candidate. Local package imports take priority.

---

## Examples

### Example 1: Direct dependency (JS/TS)

PR #101 changes: `src/utils.ts`
PR #102 changes: `src/api/handler.ts`

Diff of `handler.ts` in PR #102 contains:
```typescript
import { formatDate } from '../utils'
```

Normalized: `utils.ts` (try `../utils.ts` → suffix match against `src/utils.ts` → **match**).

Result: Edge **#101 → #102**. Merge order: `#101 → #102`.

**Before (heuristic only):** `#102 → #101` (102 has fewer changed files)
**After (with dependency analysis):** `#101 → #102`

---

### Example 2: No cross-dependencies

PR #103 changes: `src/auth/login.ts`
PR #104 changes: `src/payments/checkout.ts`

Neither file imports anything from the other PR's changed files.

Result: No edges. Fall through to heuristics 2–5.

**Ordering:** Determined by CI status → file count → base branch → PR number (existing behavior unchanged).

---

### Example 3: Circular dependency (Python)

PR #105 changes: `app/models/user.py`
PR #106 changes: `app/models/team.py`

`user.py` diff contains: `from app.models.team import Team`
`team.py` diff contains: `from app.models.user import User`

Result: Edges #105 → #106 AND #106 → #105 → **cycle detected**.

```
Warning: Circular import dependency detected among PRs [#105, #106].
         Falling back to heuristic ordering (CI status → file count → base branch → PR number).
```

---

### Example 4: Chain dependency (Go)

PR #107 changes: `pkg/config/config.go`
PR #108 changes: `pkg/server/server.go`
PR #109 changes: `cmd/main/main.go`

`server.go` imports `"github.com/org/repo/pkg/config"` → matches `pkg/config/config.go` in #107. Edge: **#107 → #108**.
`main.go` imports `"github.com/org/repo/pkg/server"` → matches `pkg/server/server.go` in #108. Edge: **#108 → #109**.

Topological sort: `#107 → #108 → #109`.

---

## Announce Format

After dependency analysis completes, announce in all modes:

- If edges found: `Dependency analysis: #[A] → #[B] (import constraint) — applying before heuristics`
- If no edges found: `Dependency analysis: no cross-PR imports detected — applying heuristics`
- If cycle detected: `Dependency analysis: circular dependency in [#N1, #N2] — falling back to heuristics`
````

**Step 3: Verify the file was created**

Run:
```bash
ls /Users/weee/Dev/feature-flow/skills/merge-prs/references/
```

Expected: `CLAUDE.md  conflict-resolution.md  dependency-analysis.md`

**Step 4: Spot-check key sections exist**

Run:
```bash
grep -n "Step 1\|Step 2\|Step 3\|Step 4\|Path Matching\|Edge Cases\|Examples\|Announce Format" /Users/weee/Dev/feature-flow/skills/merge-prs/references/dependency-analysis.md
```

Expected: Lines for all eight major sections present.

**Acceptance Criteria:**
- [ ] File exists at `skills/merge-prs/references/dependency-analysis.md`
- [ ] Contains import extraction patterns for JS/TS, Python, Go, and Rust
- [ ] Documents graph construction algorithm (edges from import matches)
- [ ] Documents Kahn's topological sort with cycle detection
- [ ] Contains two-tier path matching strategy (exact suffix + basename fallback)
- [ ] Contains edge cases section (re-exports, dynamic imports, barrel files, monorepo, Python __init__, Go vendor)
- [ ] Contains at least 4 worked examples (direct dep, no dep, circular, chain)
- [ ] Contains announce format for all three modes

**Quality Constraints:**
- Pattern: follow `conflict-resolution.md` structure (header, classification tables, code blocks, examples section)
- Parallelizable: yes

---

### Task 3: Commit

**Files:**
- `skills/merge-prs/SKILL.md`
- `skills/merge-prs/references/dependency-analysis.md`

**Step 1: Stage the files**

```bash
git add skills/merge-prs/SKILL.md skills/merge-prs/references/dependency-analysis.md
```

**Step 2: Verify staged files**

```bash
git diff --staged --stat
```

Expected: Two files listed — `SKILL.md` with a small diff (Step 3 block update) and `dependency-analysis.md` as a new file.

**Step 3: Commit**

```bash
git commit -m "feat: add cross-PR import dependency analysis to merge-prs ordering (#220)

Adds dependency analysis as priority #1 in Step 3 of the merge-prs skill.
When PR B's changed files import from a file PR A changes, PR A is ordered
first. Supports JS/TS, Python, Go, and Rust import detection. Circular
dependencies warn and fall back to existing heuristic ordering.
Documents full algorithm in skills/merge-prs/references/dependency-analysis.md."
```

**Step 4: Verify commit**

```bash
git log --oneline -3
```

Expected: New commit at the top with the message above.

**Acceptance Criteria:**
- [ ] Both files are committed in a single commit
- [ ] Commit message references issue #220

**Quality Constraints:**
- Parallelizable: no
