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

**Announce format (YOLO/Express):**
`YOLO: ship — Trivial conflict in PR #N ([type]) → auto-resolved`

### Structure Classification (pre-filter)

Before checking for behavioral keywords, classify the conflict's *structure*. This determines whether keywords are relevant at all.

| Structure | Description | Classification |
|-----------|-------------|----------------|
| **One-sided modification** | Only one side has changes; the other side of the conflict markers is identical to the merge base (or empty) | Trivial (additive) — auto-resolve by taking the modified side |
| **Adjacent additions** | Both sides add NEW lines without modifying any shared existing lines | Trivial — auto-resolve by taking both sides |
| **Context-only keywords** | Behavioral keywords (`if`, `return`, etc.) appear in surrounding code but NOT between `<<<<<<<`/`=======`/`>>>>>>>` markers | Ignore keywords — classify based on the actual conflict content only |
| **Both-sided modification** | Both sides modify the SAME existing lines (lines present in the merge base are changed differently by each side) | Proceed to behavioral keyword check below |

**How to apply:**
1. Parse the conflict region between `<<<<<<<` and `>>>>>>>` markers
2. Identify the "ours" block (`<<<<<<<` to `=======`) and "theirs" block (`=======` to `>>>>>>>`)
3. If one block is empty or contains only lines NOT present in the merge base → **one-sided modification** → trivial
4. If both blocks contain only NEW lines (additions, not modifications of existing lines) → **adjacent additions** → trivial
5. If both blocks modify lines that existed in the merge base, check whether behavioral keywords appear only in surrounding context (outside the `<<<<<<<`/`=======`/`>>>>>>>` markers) — if so → **context-only keywords** → ignore keywords and classify based on conflict content only
6. If both blocks modify lines that existed in the merge base and keywords appear within the markers → **both-sided modification** → proceed to behavioral keyword check
7. If structure cannot be determined (malformed markers, unusual format) → default to **behavioral** (conservative)

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

**Detection heuristic — two-step behavioral check:**
```
Step 1: Classify conflict structure (see Structure Classification above)
  - one-sided modification → TRIVIAL (skip keyword check entirely)
  - adjacent additions → TRIVIAL (skip keyword check entirely)
  - context-only keywords → IGNORE keywords (classify based on conflict content only)
  - both-sided modification → proceed to Step 2
  - unknown structure → BEHAVIORAL (conservative default)

Step 2: Keyword check (ONLY for both-sided modifications)
  keywords = ["if ", "else", "for ", "while ", "return ", "throw ", "switch", "case ", "expect(", "assert", "toBe(", "toEqual("]
  Scan ONLY the lines between <<<<<<< and >>>>>>> markers (not surrounding context)
  if any keyword appears in the conflict marker region → classify as behavioral
```

**Announce format (mode-aware):**
- YOLO: `YOLO: ship — Behavioral conflict in PR #N ([file]:[location]) → paused`
- Express: `Express: ship — Behavioral conflict in PR #N ([file]:[location]) → paused`
- Interactive: `Ship: Behavioral conflict in PR #N ([file]:[location]) — review required`

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

### Example 3: Lock file (trivial)

Conflicting file: `package-lock.json`

Classification: **trivial** — auto-generated lock file.
Resolution: delete, run `npm install` to regenerate.

### Example 4: Additive-only — reclassified from behavioral to trivial

```
<<<<<<< HEAD
+function newHelper() {
+  return computeValue();
+}
=======
+function otherHelper() {
+  if (condition) return fallback;
+}
>>>>>>> feature-branch
```

**Old classification:** `return` and `if` detected → behavioral → pause for review.
**New classification:** Both sides add new lines, no shared lines modified → **trivial** (adjacent additions) → auto-resolve (take both).

**Why reclassified:** Structure classification (Step 1) identifies this as adjacent additions — both blocks contain only new lines. The keyword check (Step 2) is never reached.

### Example 5: Context-only keywords — reclassified from behavioral to trivial

```
function existingCode() {
  if (x) return y;  // ← context line, NOT between conflict markers
<<<<<<< HEAD
+  logMetric('a');
=======
+  logMetric('b');
>>>>>>> feature-branch
}
```

**Old classification:** `if` and `return` found in the conflict region → behavioral → pause for review.
**New classification:** Keywords only appear in surrounding context lines (outside `<<<<<<<`/`=======`/`>>>>>>>` markers) → keywords are ignored. The actual conflicting lines (`logMetric('a')` vs `logMetric('b')`) contain no behavioral keywords → not a behavioral conflict. Resolution: these are competing alternatives (not additive), so present to the user to pick one — but without the behavioral escalation.

**Why reclassified:** Context-only keywords are not part of the conflict. The conflict itself is a simple value choice, not a semantic logic change. The user still resolves it, but it's not flagged as a behavioral safety concern.

### Example 6: True both-sided modification — still behavioral

```
<<<<<<< HEAD
  if (user.isAdmin) {
    return adminDashboard();
  }
=======
  if (user.role === 'superadmin') {
    return superAdminView();
  }
>>>>>>> feature-branch
```

**Old classification:** behavioral (correct).
**New classification:** Both sides modify the same existing `if` condition and return statement → **behavioral** → pause for review (unchanged).

**Why still behavioral:** Structure classification (Step 1) identifies this as a both-sided modification — both sides change the same existing lines. The keyword check (Step 2) confirms `if` and `return` are present → behavioral. This is the only scenario where semantic conflicts are possible.
