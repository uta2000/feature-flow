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
| **One-sided modification** | Only one side has changes; the other side of the conflict markers is identical to the merge base (or empty) | **Tier 1** (additive) — auto-resolve by taking the modified side |
| **Adjacent additions** | Both sides add NEW lines without modifying any shared existing lines | **Tier 1** — auto-resolve by taking both sides |
| **Context-only keywords** | Behavioral keywords (`if`, `return`, etc.) appear in surrounding code but NOT between `<<<<<<<`/`=======`/`>>>>>>>` markers | **Tier 1** — ignore keywords and classify based on actual conflict content only |
| **Both-sided modification — structurally independent** | Both sides modify the same conflict region BUT at non-overlapping positions (different statements, different declarations within the same scope). Keywords may be present. | **Tier 2** — run the structural independence gate, attempt additive merge, verify with tests |
| **Both-sided modification — semantic overlap** | Both sides modify the SAME existing lines (shared lines in the merge base are changed differently by each side) | **Tier 3** — pause for user review (always) |
| **Unknown / malformed** | Marker parsing fails or structure cannot be determined | **Tier 3** (conservative default) |

**How to apply:**
1. Parse the conflict region between `<<<<<<<` and `>>>>>>>` markers
2. Identify the "ours" block (`<<<<<<<` to `=======`) and "theirs" block (`=======` to `>>>>>>>`)
3. If one block is empty or contains only lines NOT present in the merge base → **one-sided modification** → **Tier 1** (trivial)
4. If both blocks contain only NEW lines (additions, not modifications of existing lines) → **adjacent additions** → **Tier 1** (trivial)
5. If both blocks modify lines that existed in the merge base, check whether behavioral keywords appear only in surrounding context (outside the `<<<<<<<`/`=======`/`>>>>>>>` markers) — if so → **context-only keywords** → **Tier 1** (ignore keywords and classify based on conflict content only)
6. If both blocks modify lines that existed in the merge base and keywords appear within the markers → **both-sided modification** → run the **structural independence gate** (defined in Tier 2 below):
   - If the gate passes (changes at non-overlapping positions within the region, no shared-line modifications) → **Tier 2** (attempt additive merge + test verification)
   - If the gate fails (**semantic overlap** — both sides modify the same existing lines differently) → **Tier 3** (pause for user review)
7. If structure cannot be determined (malformed markers, unusual format) → **Tier 3** (conservative default)

---

## Tier 2: Attempt-with-Test-Verification (NEW)

**When this applies:** Tier 2 targets the gap currently over-flagged by the behavioral keyword check. When Structure Classification routes a conflict to "both-sided modification" and the keyword check would fire, the structural independence gate (below) runs *before* the escalation to Tier 3. If the gate passes, Tier 2 attempts an additive union merge and verifies safety by running the project test suite. This is a single-shot attempt, not a loop: one try, one verification, commit or escalate.

**Mode Behavior:**

| Mode | Tier 2 attempt | Tier 2 commit on green |
|------|----------------|------------------------|
| **YOLO** | Automatic — no user prompt | Automatic — announce only |
| **Express** | Automatic — no user prompt | Automatic — announce only |
| **Interactive** | Confirm attempt via `AskUserQuestion` before applying | Confirm commit via `AskUserQuestion` before pushing |

In all modes, failed Tier 2 attempts fall through to Tier 3 (which always pauses — see below).

### Structural Independence Gate

The gate determines whether a both-sided modification with behavioral keywords is eligible for Tier 2 (additive merge + test verification) or must escalate directly to Tier 3 (pause).

**Gate rules (evaluated in order — first match wins):**

1. **Behavioral keywords present but non-overlapping scopes.** Both blocks introduce behavioral constructs (`if`, `return`, etc.) in distinct statements that do not modify the same merge-base line. Example: both sides add a new `return` inside the same function, but at different positions around a shared statement. → **Gate passes** (Tier 2 eligible).
2. **Different declarations within the same file.** The conflict region spans multiple declarations (e.g., two functions, two `describe` blocks), and each side modifies a different declaration. → **Gate passes** (Tier 2 eligible).
3. **Shared-line modifications (semantic overlap).** Both sides modify the same existing line from the merge base differently — e.g., both change the same `if` condition, both rewrite the same return statement. Additive union merge would produce contradictory logic. → **Gate fails** (Tier 3 only).
4. **Ambiguous marker parsing or conflicting imports that Tier 1 did not already resolve.** → **Gate fails** (Tier 3, conservative).

**Invariant:** The gate is ONLY evaluated for both-sided modifications with behavioral keyword matches. Cases already caught by one-sided modification, adjacent additions, or context-only keywords continue to resolve as Tier 1 with no change in behavior.

**Procedure:**

1. **Attempt additive union merge** — write the merged file with both blocks concatenated in their original order. The "ours" block is placed first, followed by the "theirs" block, with the shared merge-base context surrounding both.
2. **Discover test runner** — see §Test Runner Discovery below. If no runner can be discovered for the project's stack, abort Tier 2 and escalate to Tier 3 with reason `test-runner-not-found`.
3. **Run tests under hard wall-clock timeout** — invoke the discovered command using the detected `timeout`/`gtimeout`/bash-kill fallback (see §Timeout Detection below). Default limit: 5 minutes, configurable via `merge.conflict_resolution.test_timeout_minutes` (minimum 1).
4. **On tests pass** (exit code 0 within the timeout window): commit the resolution and push.
5. **On tests fail** (non-zero exit, timeout, or runner crash): discard the attempt via `git checkout -- .` to restore the conflict markers, capture the combined stdout+stderr output (trimmed to 80 lines), and fall through to Tier 3 with that output attached to the presentation.

**Commit message contract:** Tier 2 commits MUST use the exact literal message `merge: resolve conflict, verified by tests` (no variants, no additional prefixes). This makes Tier 2 commits greppable and distinct from trivial (Tier 1) resolutions and manual (Tier 3) resolutions. When two or more files were resolved in the same Tier 2 attempt, the commit may include a multi-line body listing each file — but the first line is fixed.

**Announcement templates:**

Tier 2 attempt start:
```
<MODE>: ship — Conflict in PR #<N> (<file>:<scope>) → Tier 2 attempt
  → Structural independence check: <reason passed>
  → Applying additive merge...
  → Detected test runner: <command> (<source>)
  → Running: <TIMEOUT_CMD> <seconds> <command>
```

Tier 2 success:
```
  → Tests passed after <mm:ss>
  → Committed: merge: resolve conflict, verified by tests
  → Pushed. Proceeding to merge.
```

Tier 2 failure escalating to Tier 3:
```
  → Tests failed after <mm:ss> (exit <code>)
<MODE>: ship — Tier 2 tests failed in PR #<N> → Tier 3 pause
  → Discarded attempt (git checkout -- .)
  → Captured test output (<lines> lines)
  → Presenting to user...
```

Tier 2 skipped (no runner discoverable):
```
<MODE>: ship — Tier 2 skipped in PR #<N> → Tier 3 (reason: test-runner-not-found)
```

### Test Runner Discovery

Tier 2 needs a way to run the consumer project's test suite without hard-coding commands. The discovery algorithm is stack-aware and can be overridden by explicit config. This is a reusable helper — future remediation loops that need to run local tests can cite this subsection.

**Discovery order (first match wins):**

1. **Explicit config:** If `merge.conflict_resolution.test_command` is set in `.feature-flow.yml`, use it verbatim and stop. Example: `test_command: "pnpm test --silent"`. No further detection runs.
2. **Node.js stack detection** (when `stack:` in `.feature-flow.yml` contains `node-js`):
   - If `package.json` declares `packageManager: "pnpm@..."` → `pnpm test` (highest priority for pnpm projects)
   - Else if `pnpm-lock.yaml` exists → `pnpm test`
   - Else if `yarn.lock` exists → `yarn test`
   - Else if `package-lock.json` exists → `npm test`
   - Else if `package.json` exists (no lockfile) → `npm test`
3. **Python stack detection** (when `stack:` contains `python`):
   - If `pytest.ini` exists → `pytest`
   - Else if `pyproject.toml` exists with a `[tool.pytest]` or `[tool.pytest.ini_options]` section → `pytest`
   - Else if `setup.cfg` exists with a `[tool:pytest]` section → `pytest`
   - Else if `pyproject.toml` exists without pytest config but `setup.py` exists → `python -m pytest`
4. **No match:** return `None`. Tier 2 is skipped with reason `test-runner-not-found`, and the conflict escalates to Tier 3 without an attempted resolution (no Tier 2 output to show in the presentation).

**Example bash detection snippet (node-js path):**
```bash
if test -f package.json && grep -q '"packageManager":.*"pnpm' package.json; then
  TEST_CMD="pnpm test"
elif test -f pnpm-lock.yaml; then
  TEST_CMD="pnpm test"
elif test -f yarn.lock; then
  TEST_CMD="yarn test"
elif test -f package-lock.json; then
  TEST_CMD="npm test"
elif test -f package.json; then
  TEST_CMD="npm test"
else
  TEST_CMD=""  # fall through to python or skip
fi
```

The `packageManager` field in `package.json` takes precedence over lockfile heuristics when present — this handles projects that set a preferred package manager but haven't yet committed a lockfile for it.

### Timeout Detection

Tier 2 must enforce a hard wall-clock limit on the test run so a slow or hanging test suite cannot stall the `merge-prs` batch. The default limit is **5 minutes**, configurable via `merge.conflict_resolution.test_timeout_minutes` in `.feature-flow.yml` (minimum 1 minute).

**macOS does not ship a `timeout` command by default.** GNU `timeout` is available on Linux (from coreutils) and on macOS via Homebrew as `gtimeout`. If neither is available, fall back to a bash background-job + kill pattern.

**Detection snippet (run once per merge-prs invocation, before the first Tier 2 attempt):**
```bash
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD="gtimeout"
else
  TIMEOUT_CMD=""  # bash-kill fallback
fi
```

**Invocation with detected command:**
```bash
TIMEOUT_SECONDS=$(( ${TEST_TIMEOUT_MINUTES:-5} * 60 ))
if [ -n "$TIMEOUT_CMD" ]; then
  "$TIMEOUT_CMD" "$TIMEOUT_SECONDS" bash -c "$TEST_CMD"
  TEST_EXIT=$?
else
  # Bash background-kill fallback (no GNU timeout / gtimeout available)
  ( eval "$TEST_CMD" ) &
  TEST_PID=$!
  ( sleep "$TIMEOUT_SECONDS" && kill -TERM "$TEST_PID" 2>/dev/null ) &
  KILLER_PID=$!
  wait "$TEST_PID"; TEST_EXIT=$?
  kill -TERM "$KILLER_PID" 2>/dev/null
fi
```

**Exit code interpretation:**
- `0` → tests passed within the timeout window → commit Tier 2 resolution
- `1`–`127` → tests failed (normal failure) → discard attempt, escalate to Tier 3
- `124` (GNU `timeout` semantics) or `143` (SIGTERM from the bash fallback) → timed out → discard attempt, escalate to Tier 3 with reason `test-timeout`
- `>128` (killed by other signal) → treat as "tests failed" → discard and escalate

**Minimum timeout enforcement:** If `test_timeout_minutes` is set below 1 in config, clamp to 1 minute (a shorter window cannot reliably run any realistic test suite and would defeat Tier 2's purpose).

---

## Tier 3: Diff Presentation (Always Pauses)

**Tier 3 always pauses via `AskUserQuestion`, regardless of mode (YOLO, Express, or Interactive). This is the safety invariant of the 4-tier ladder — the single rule that must never be violated.** Tier 3 is reached when (a) Structure Classification routes a conflict to "both-sided modification" AND the structural independence gate fails (semantic overlap), (b) Tier 2 was attempted and tests failed, or (c) the conflict structure cannot be determined (conservative default for malformed markers).

**Never auto-resolve.** Always pause and present to the user.

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
  - unknown structure → TIER 3 (conservative default)

Step 2: Keyword check (ONLY for both-sided modifications)
  keywords = ["if ", "else", "for ", "while ", "return ", "throw ", "switch", "case ", "expect(", "assert", "toBe(", "toEqual("]
  Scan ONLY the lines between <<<<<<< and >>>>>>> markers (not surrounding context)
  if any keyword appears in the conflict marker region → run the structural independence gate (defined in Tier 2 above).
    - Gate passes (changes at non-overlapping positions) → TIER 2
    - Gate fails (semantic overlap) → TIER 3
```

**Presentation contents (what Tier 3 must show the user):**
- The raw conflict diff, trimmed to 40 lines if longer
- The Tier 2 proposed resolution (if any) — only present when Tier 2 was attempted
- The test failure output (if any) — only present when Tier 2 was attempted and its tests failed, trimmed to 80 lines

**Announce format (mode-aware):**
- YOLO: `YOLO: ship — Tier 3 pause in PR #N ([file]:[location]) → awaiting user`
- Express: `Express: ship — Tier 3 pause in PR #N ([file]:[location]) → awaiting user`
- Interactive: `Ship: Tier 3 conflict in PR #N ([file]:[location]) — review required`

Then use `AskUserQuestion`:
- Show the presentation contents above
- Option 1: "Accept proposed" — take the Tier 2 additive merge attempt (only shown when Tier 2 produced a resolution)
- Option 2: "Accept ours" — keep the current base branch version
- Option 3: "Accept theirs" — take the incoming branch version
- Option 4: "I'll resolve manually" — pause, let the user edit files in the worktree, then resume when they confirm
- Option 5: "Skip this PR" — fall through to Tier 4, log reason, continue with remaining PRs

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

### Example 7: Structurally-independent both-sided modification — Tier 2

```
 function validateUser(user) {
<<<<<<< HEAD
   if (rateLimit.exceeded(user.id)) {
     return { error: 'rate_limit' };
   }
=======
   if (!passwordStrength.check(user.password)) {
     return { error: 'weak_password' };
   }
>>>>>>> feature/password-strength
   return { ok: true, user };
 }
```

**Old classification:** `if` and `return` found in the conflict region → behavioral → paused for review. The user had to manually merge two independent guard clauses even though the resolution was mechanical (keep both).

**New classification:** Structure classification identifies this as a both-sided modification (both blocks sit inside the same function scope). The structural independence gate inspects the blocks: both are distinct guard clauses added to the same function body, neither modifies the shared `function validateUser(user) {` signature, and neither modifies the shared `return { ok: true, user };` trailer. The changes target non-overlapping positions → **gate passes → Tier 2**.

**Tier 2 outcome — tests pass path:**
1. Additive merge: concatenate both guard clauses in order (rate limit check first, password strength check second), preserving the shared signature and trailing return.
2. Discover test runner (e.g., `pnpm test` from `pnpm-lock.yaml`).
3. Run `pnpm test` under the 5-minute timeout.
4. Tests pass → commit `merge: resolve conflict, verified by tests` and push. Continue to the next PR.

**Tier 2 outcome — tests fail path:**
1. Tests fail after (e.g.) 00:47 with a `TypeError` in `passwordStrength.check` — a fixture was missing that only existed on the `feature/password-strength` branch.
2. Discard the attempt via `git checkout -- .` to restore the conflict markers.
3. Capture the test output (trimmed to 80 lines).
4. Escalate to **Tier 3** with the diff, the attempted resolution, and the test failure output. User decides: "Accept proposed" + add missing fixture, "Accept ours" (skip password strength), "I'll resolve manually", etc.

**Why Tier 2 fits here:** The old behavioral keyword check would have paused this conflict immediately, even though the resolution is mechanical in 90% of cases (simply keep both guard clauses). Tier 2 trusts the test suite as ground truth — if the additive merge is safe, tests pass and the conflict resolves automatically; if it isn't, the user still sees the full context including test output, and can decide with more information than the old path provided.
