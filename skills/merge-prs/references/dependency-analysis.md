# Dependency Analysis

Reference file for the `merge-prs` skill. Read this file during Step 3 (Determine merge order) to perform cross-PR import dependency analysis before applying heuristics.

---

## Overview

For each batch of PRs to merge, build a partial ordering based on import/require dependencies between their changed files. If PR B's diff imports a path that matches a file PR A changes, then PR A must merge before PR B.

**When to apply:** Before heuristics 2–5. Dependency constraints are hard ordering requirements, not tiebreakers.

**When to skip:** If a circular dependency is detected, warn the user and fall through to heuristics 2–5 (existing behavior).

---

## Metadata Block Precedence

When a PR's `feature-flow-metadata` block is present and parseable (bound to `metadata` in Step 4a.0 of `SKILL.md`), prefer its fields over diff-based file-overlap inference:

| Metadata field | Use in dependency analysis |
|---------------|---------------------------|
| `depends_on_prs` | Hard ordering requirements — these PRs must merge before this one, regardless of file overlap. |
| `sibling_prs` | Same-session grouping — treat as a batch; order within the batch by existing heuristics 2–5. |
| `risk_areas` | Semantic touchpoints — when two PRs share a `risk_areas` entry, treat as a soft ordering hint (prefer the PR with fewer `risk_areas` first to minimize blast radius). |

**Metadata is additive, not replacing.** Inference-detected edges not covered by metadata still apply. Example: if diff analysis finds PR B imports a file PR A changes, that constraint holds even if `depends_on_prs` is empty.

**When metadata is absent or `metadata` is `null`:** Skip this section entirely. Proceed directly to Steps 1–5 (diff-based inference). This is the expected path for PRs created outside the lifecycle.

See `fixtures/metadata-block-happy.md` for an example of a PR body with a well-formed block, and `fixtures/metadata-block-absent.md` for the no-block path.

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

For each changed file in each PR, extract import/require statements from the **diff content** (lines added by the PR). Use `gh pr diff <number>` to get full diff content, then scan for import patterns.

Only scan lines that are **added** (`+` prefix). Ignore context lines (no prefix) and removed lines (`-`) — context lines represent pre-existing code, not changes introduced by the PR, and would create false dependency edges.

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

Import paths are rarely identical to repository file paths. Use this two-tier matching strategy.

**Relative path resolution:** Before applying either tier, resolve relative imports (`./`, `../`) against the importing file's directory. For example, if `src/api/handler.ts` contains `import from '../utils'`, resolve to `src/utils` before matching.

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

Normalized: resolve `../utils` relative to `src/api/` → `src/utils` → try `.ts` extension → `src/utils.ts` → suffix match against `src/utils.ts` in `pr_files[#101]` → **match**.

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

After dependency analysis completes, announce with mode-aware prefixes (matching SKILL.md conventions):

**YOLO mode:**
- If edges found: `YOLO: ship — Dependency analysis: #[A] → #[B] (import constraint); remaining PRs ordered by heuristics`
- If no edges found: `YOLO: ship — Dependency analysis: no cross-PR imports detected — applying heuristics`
- If cycle detected: `YOLO: ship — Dependency analysis: circular dependency in [#N1, #N2] — falling back to heuristics`

**Express mode:** Same format, substitute `Express:` for `YOLO:`.

**Interactive mode:**
- If edges found: `Ship: Dependency analysis found import constraints: #[A] → #[B]. Remaining PRs ordered by heuristics.`
- If no edges found: `Ship: No cross-PR import dependencies detected — ordering by heuristics.`
- If cycle detected: `Ship: Circular import dependency detected among [#N1, #N2] — falling back to heuristic ordering.`
