# CI Remediation

Reference file for the `merge-prs` skill. Read this file when a PR's `statusCheckRollup` reports a failing check — enter the bounded remediation loop described here.

See `references/best-effort-remediation.md` for the attempt loop skeleton and mode escalation contract. This file specializes only the CI-specific portions.

---

## Overview

When `gh pr view <number> --json statusCheckRollup` shows a failing check, do not investigate only once. Instead, enter the bounded remediation loop:

- **MAX_ATTEMPTS:** 3 (overridable via `.feature-flow.yml` `merge.ci_remediation.max_attempts`)
- **MAX_WALL_CLOCK:** 10 minutes (overridable via `merge.ci_remediation.max_wall_clock_minutes`)
- **CI_POLL_INTERVAL:** 30 seconds (overridable via `merge.ci_remediation.ci_poll_interval_seconds`, minimum 10s)

Fetch the failing run ID from `statusCheckRollup`, then call `gh run view <run-id> --log-failed` to pull the failure logs. Parse each failure into a `(category, file, line, message)` tuple using the detection heuristics below.

---

## Category Detection Heuristics

Apply these rules top-to-bottom against each failure entry from `gh run view <run-id> --log-failed`. Assign the **first matching category**.

| Category | Detection pattern | Example log snippet | Terminal? |
|----------|-------------------|---------------------|-----------|
| `lint-format` | Log contains `prettier`, `eslint`, `pylint`, `flake8`, `black`, `ruff`, `unexpected token`, `Parsing error`, or ends with `Expected N spaces` | `Expected 2 spaces but found 4` | No |
| `type-error` | Log contains `TS\d+:`, `Type '.*' is not assignable`, `Property '.*' does not exist`, `Cannot find name`, `mypy: error:`, `pyright:` | `TS2345: Argument of type 'string' is not assignable` | No |
| `test-flaky` | Failing test name matches the project known-flake list OR first encounter of a test timeout/network error that passes on re-run (see Flake Handling Policy) | `Error: ETIMEDOUT`, `connect ECONNREFUSED` (and passes on re-run) | No |
| `test-real` | Any `FAIL`/`FAILED` assertion not matching `test-flaky` criteria; or a `test-flaky` failure that also fails on re-run | `Expected: 42, Received: 0`, `AssertionError` | No |
| `build` | Log contains `Build failed`, `Cannot find module`, `webpack`, `tsc: error`, `esbuild`, `vite: error`, `rollup`, `SyntaxError` in a build step | `error TS6133: 'foo' is declared but its value is never read` | No |
| `dependency-install` | Log contains `npm ERR!`, `yarn error`, `pnpm ERR!`, `pip install`, `Could not resolve dependency`, `ERESOLVE` | `npm ERR! ERESOLVE unable to resolve dependency tree` | No |
| `timeout-infra` | Log contains `Job was cancelled`, `timed out after`, `The runner has received a shutdown signal`, GitHub Actions infrastructure timeout messages | `Error: The operation was canceled` (runner shutdown) | No |
| `unknown` | None of the above patterns matched | (any log not matching above) | **Yes** |

**Assignment rule:** Each failure entry gets exactly one category. If a failure matches multiple patterns, the first matching row wins (table is ordered by specificity: `lint-format` and `type-error` are most specific, `unknown` is the catch-all).

---

## Fix Strategies Per Category

| Category | Fix command / strategy | Notes |
|----------|------------------------|-------|
| `lint-format` | Run `npm run lint -- --fix` (JS/TS) or `black <file>` / `ruff check --fix <file>` (Python). If no auto-fix command available, run `prettier --write <file>` for formatting-only errors. | Commit with `fix(ci): resolve lint/format errors` |
| `type-error` | Read the exact `file:line` from the log. Open the file, inspect the type annotation, apply a minimal targeted fix (add missing type annotation, correct type cast, fix import). Do not refactor. | Commit with `fix(ci): resolve type errors in <file>` |
| `test-flaky` | Run `gh run rerun --failed <run-id>` to re-run the failing job. Do not apply any code change. If re-run passes, exit loop (success). If re-run fails, re-classify to `test-real`. | No commit needed for re-run. If re-classified, treat as `test-real`. |
| `test-real` | Cannot auto-fix. **Skip the PR immediately** with reason "real test failure — manual investigation required". | Terminal for this PR; do not consume remaining attempts. |
| `build` | Inspect the exact error. If it is a missing import or mis-named export (resolvable from the error message alone), apply the targeted fix. If it requires broader investigation, skip with reason "build failure — manual investigation required". | Commit with `fix(ci): resolve build error in <file>` |
| `dependency-install` | Run `npm install` / `yarn install` / `pnpm install` (match the project's package manager from `package.json`). Commit the updated lock file. | Commit with `fix(ci): regenerate lock file` |
| `timeout-infra` | Run `gh run rerun --failed <run-id>`. This is an infrastructure flake — do not apply code changes. | No commit needed. If re-run also times out, skip with reason "persistent infra timeout". |
| `unknown` | **Terminal** — skip the PR immediately. Do not apply any fix. | Reason: "unknown failure category — cannot auto-remediate" |

---

## Flake Handling Policy

A failure is classified as `test-flaky` on its first encounter only when:
1. The failing test name appears in the project's known-flake list (if one exists at `.feature-flow-flakes.txt` or similar), **OR**
2. The error message matches a transient-network or timeout pattern (`ETIMEDOUT`, `ECONNREFUSED`, `socket hang up`, `timed out after`) AND the test passes on a single re-run via `gh run rerun --failed`.

**Re-run rule:** Re-run once only. If the re-run passes → `test-flaky` confirmed (success). If the re-run fails → re-classify as `test-real` → skip the PR.

**Never re-run more than once per failure instance** — two consecutive failures of the same test indicate a real failure.

---

## Commit Message Contract

All CI-remediation commits MUST use the `fix(ci):` prefix. This makes them greppable and squash-cleanly separable.

**Format:**
```
fix(ci): <one-line summary of fixes>

- <category>: <file:line> — <what was fixed>
- <category>: <file:line> — <what was fixed>
...
```

**Examples:**
```
fix(ci): resolve lint and type errors in PR #42

- lint-format: src/foo.ts — prettier formatting
- type-error: src/bar.ts:42 — add missing string annotation
```

```
fix(ci): regenerate lock file after dependency update

- dependency-install: package-lock.json — npm install
```

**Rule:** Only include the multi-line body when two or more distinct fixes are applied in one attempt. Single-fix commits may use the one-liner only.

---

## Polling Behavior

After committing and pushing fixes, poll `gh pr checks <number>` every `CI_POLL_INTERVAL` seconds.

**Interpreting `gh pr checks` output:**

| Status value | Meaning | Action |
|--------------|---------|--------|
| `PENDING` | Check queued, not yet running | Continue polling |
| `IN_PROGRESS` | Check currently running | Continue polling |
| `COMPLETED` + `SUCCESS` | Check passed | All checks in this state → CI green → exit loop (success) |
| `COMPLETED` + `FAILURE` | Check failed | All checks no longer pending → CI red → increment attempt |
| `COMPLETED` + `CANCELLED` | Check was cancelled (infra) | Treat as `timeout-infra` → re-run once |

**Poll loop:**
1. Check elapsed wall-clock time — if >= `MAX_WALL_CLOCK`, stop polling and skip PR.
2. Run `gh pr checks <number> --json name,state,conclusion`
3. If any check is `PENDING` or `IN_PROGRESS` → wait `CI_POLL_INTERVAL` seconds, repeat.
4. If all checks are `COMPLETED`:
   - All `SUCCESS` → return green = true.
   - Any `FAILURE` → return green = false.
   - Any `CANCELLED` → return as `timeout-infra` (re-run, do not consume attempt).
5. **Transient `gh` errors** (non-zero exit, network error): retry once after 5 seconds. If still failing, skip PR with reason "gh pr checks command failed".

---

## Reference Back to Shared File

This file specializes the loop defined in `references/best-effort-remediation.md`:

- **Attempt loop skeleton** → `best-effort-remediation.md § Attempt Loop Skeleton`
- **Mode-aware escalation** → `best-effort-remediation.md § Mode-Aware Escalation Contract`
- **Announcement templates** → `best-effort-remediation.md § Announcement Format Templates`
- **Skip/pause/escalate decisions** → `best-effort-remediation.md § Decision Table`
- **Wall-clock tracking** → `best-effort-remediation.md § Wall-Clock Tracking Guidance`

CI-specific parameters:
- `detect_failures()` → `gh run view <run-id> --log-failed` + Category Detection Heuristics above
- `apply_fix(failure)` → Fix Strategies Per Category above
- `verify_success()` → Polling Behavior above
- `build_commit_message()` → Commit Message Contract above
