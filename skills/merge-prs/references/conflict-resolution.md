# Conflict Resolution Rules

Reference file for the `merge-prs` skill. Read this file when a PR reports `mergeable: "CONFLICTING"`.

---

## Classification: Trivial vs Behavioral

Parse the conflict markers in the diff. Classify the conflict based on the content of the conflicting region.

### Trivial Conflicts (auto-resolvable)

Auto-resolve without user confirmation. Announce each resolution.

| Type | Detection | Resolution |
|------|-----------|------------|
| Import statement ordering | Conflicting region contains only `import`/`require` lines | Merge both import sets, sort alphabetically, deduplicate |
| Whitespace-only | Diff shows only trailing spaces, blank lines, or indentation | Accept one side (prefer incoming); re-run formatter if available |
| Lock files | Conflicting file is `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml` | Delete the lock file, run `npm install` / `yarn install` / `pnpm install` to regenerate |
| Auto-generated files | Filename contains `.generated.` or `.snap` (Jest snapshots) | Accept incoming (regenerate from source if needed) |
| Adjacent additive lines | Both sides add new lines without overlapping (gap between conflict markers is empty on one side) | Take both sides — prepend one block, append the other |
| CHANGELOG.md | Conflicting file is `CHANGELOG.md` | Take both entries; re-sort by date (newest first) |

**Announce format (YOLO/Express):**
`YOLO: ship — Trivial conflict in PR #N ([type]) → auto-resolved`

### Behavioral Conflicts (require confirmation)

**Never auto-resolve.** Always pause and present to the user, regardless of mode (YOLO, Express, or Interactive).

| Type | Detection heuristic |
|------|---------------------|
| Function body change | Conflicting region is inside a function/method body |
| Control flow change | Conflicting region contains `if`, `else`, `for`, `while`, `return`, `throw`, `switch`, `case` |
| API contract change | Conflicting region is a route definition, request/response schema, or middleware chain |
| Database schema change | Conflicting file is a migration or ORM model definition |
| Test assertion change | Conflicting region contains `expect(`, `assert`, `toBe(`, `toEqual(`, or similar |
| Config value change | Conflicting region changes env var defaults, feature flag values, or numeric thresholds |

**Detection heuristic — behavioral check:**
```
keywords = ["if ", "else", "for ", "while ", "return ", "throw ", "switch", "case ", "expect(", "assert", "toBe(", "toEqual("]
if any keyword appears in the conflict marker region → classify as behavioral
```

**Announce format (all modes):**
`YOLO: ship — Behavioral conflict in PR #N ([file]:[location]) → paused`

Then use `AskUserQuestion`:
- Show the conflict diff (trimmed to 40 lines if longer)
- Option 1: "Accept ours" — keep the current base branch version
- Option 2: "Accept theirs" — take the incoming branch version
- Option 3: "I'll resolve manually" — pause, let user fix, then resume
- Option 4: "Skip this PR" — log failure, continue with remaining PRs

---

## Design Doc Context Loading

When behavioral conflicts require interpretation, load the design doc for context:

**Step 1: Extract from PR body**
```bash
gh pr view <number> --json body --jq '.body' | grep -o 'feature-flow-design-doc: [^-]*' | sed 's/feature-flow-design-doc: //'
```

**Step 2: Fallback — scan docs/plans/**
```bash
# Find files matching branch name or issue number
ls docs/plans/ | grep -i "<branch_name_fragment>"
ls docs/plans/ | grep "<issue_number>"
```

**Step 3: Final fallback**
If no design doc found, proceed with conflict classification rules alone (no additional context).

**Using design doc context:**
- Read the relevant section of the design doc (data model decisions, API contracts, scope boundaries)
- If the design doc specifies which version is authoritative, suggest that option to the user
- If ambiguous, present both options with a brief summary of what each side preserves

---

## Examples

### Example 1: Import ordering (trivial)

```
<<<<<<< HEAD
import { foo } from './foo'
import { bar } from './bar'
=======
import { bar } from './bar'
import { baz } from './baz'
import { foo } from './foo'
>>>>>>> feature/add-baz
```

Classification: **trivial** — only import lines.
Resolution: merge all imports, sort alphabetically → `bar`, `baz`, `foo`.

### Example 2: Function body change (behavioral)

```
<<<<<<< HEAD
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0)
}
=======
function calculateTotal(items) {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0)
  return subtotal * (1 + TAX_RATE)
}
>>>>>>> feature/add-tax
```

Classification: **behavioral** — function body change, `return` keyword, logic difference.
Action: pause, present to user. Do not auto-resolve.

### Example 3: CHANGELOG.md (trivial)

```
<<<<<<< HEAD
## [1.5.0] - 2026-04-06
### Added
- Feature A
=======
## [1.5.0] - 2026-04-06
### Added
- Feature B
>>>>>>> feature/feature-b
```

Classification: **trivial** — CHANGELOG entry conflict.
Resolution: keep both `### Added` entries under the same version heading, sorted by feature name.

### Example 4: Lock file (trivial)

Conflicting file: `package-lock.json`

Classification: **trivial** — auto-generated lock file.
Resolution: delete, run `npm install` to regenerate.
