# Enforcement Hooks — Design Document

**Date:** 2026-02-19
**Status:** Verified

## Overview

Add three enforcement capabilities to the feature-flow plugin's hook system: TypeScript type checking (`tsc --noEmit`), linting (project's configured linter), and type-sync validation (generated types freshness + duplicate detection). All hooks are dynamic — they detect the project's tooling at runtime and skip gracefully when tools are unavailable. Enforcement uses a two-layer strategy: PostToolUse for immediate per-file feedback and a Stop hook as a hard blocking gate.

## Architecture — Two-Layer Enforcement

### Layer 1: PostToolUse (per-file lint feedback)

**Trigger:** Write or Edit on `**/*.{ts,tsx,js,jsx}` files, excluding `node_modules/`, `.next/`, `dist/`, `build/`, and test/spec/type/declaration files.

**Stdin contract:** The script receives JSON on stdin with the tool event. Extract file path from `tool_input.file_path`.

**Behavior:**
1. Parse stdin JSON to get the file path.
2. Detect linter with installation check:
   - Check `node_modules/.bin/eslint` exists AND (`.eslintrc*` or `eslint.config.*` exists) → run `npx eslint {file}`.
   - Else check `node_modules/.bin/biome` exists AND (`biome.json` or `biome.jsonc` exists) → run `npx biome check {file}`.
   - Else skip. **Never let `npx` download a tool** — only run tools already installed in the project.
3. Run linter on the single changed file (full rules, not errors-only).
4. On failure, output feedback to Claude: `[feature-flow] LINT ERRORS in {filename} — fix these before continuing:\n{errors}`
5. On success or no linter detected, output nothing.

**Why per-file lint only (no tsc):** Running `tsc --noEmit` after every file change compiles the entire project (10-30s on large codebases). Single-file lint runs in ~1-2s. tsc is deferred to the Stop gate.

**Timeout:** 30 seconds.

**Implementation:** External Node.js script at `hooks/scripts/lint-file.js`, referenced via `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lint-file.js`. Node.js is used instead of bash because scripts need to (a) parse JSON from stdin, (b) parse YAML from `.feature-flow.yml`, and (c) run cross-platform. Node.js is guaranteed available since Claude Code runs on it.

### Layer 2: Stop Hook (full project gate)

**Trigger:** Session end (Stop event).

**Behavior:** Run three checks. All checks execute regardless of individual failures. Results are combined into a single report.

**Check 1 — TypeScript compilation:**
1. Check if `tsconfig.json` exists in the project root (also check `tsconfig.app.json`, `tsconfig.build.json`).
2. Verify `node_modules/.bin/tsc` exists (don't let `npx` download TypeScript).
3. If both found, run `npx tsc --noEmit 2>&1`.
4. If errors → include in BLOCK output.

**Check 2 — Full project lint:**
1. Check if `package.json` has a `lint` script → run `npm run lint 2>&1`.
2. Else detect linter directly (check `node_modules/.bin/` + config files for eslint/biome) → run on project.
3. If errors → include in BLOCK output.

**Check 3 — Type-sync (generated types freshness):**
1. Read `.feature-flow.yml` for `stack` field (parse YAML via simple line-based parsing in Node.js — no external YAML library needed for the flat structure).
2. If `supabase` in stack:
   a. First, check if Supabase is running: `npx supabase status 2>/dev/null`. If exit code is non-zero (not running), **skip freshness check** and output warning: `"[feature-flow] Supabase not running locally — skipping type freshness check. Run 'supabase start' to enable."`
   b. If running: find existing generated types file — glob for `**/database.types.ts` or `**/supabase.types.ts` in `src/`, `lib/`, `types/`, or `app/`. Also check `.feature-flow.yml` for `types_path` override.
   c. Run `npx supabase gen types typescript --local` and capture output.
   d. Diff output against the existing file. If different → include in BLOCK output with the regeneration command.
3. If `prisma` in stack:
   a. Compare `prisma/schema.prisma` modification time vs generated client modification time.
   b. Or run `npx prisma generate --dry-run` if available.
   c. If stale → include in BLOCK output.
4. Additional generators can be added over time.

**Check 3b — Type-sync (duplicate type file detection):**
1. Find canonical types file location (heuristic: glob for `*.types.ts` in `src/types/`, `src/lib/`, `types/`, `lib/`). Override: `types_path` in `.feature-flow.yml`.
2. Search edge function directories for type files:
   - `supabase/functions/**/*.types.ts`
   - Other edge function patterns as detected
3. For each type file found in edge function directories, diff against the canonical source.
4. If content differs → include in BLOCK output: "Type file {edge_file} has drifted from canonical source {canonical_file}."

**Combined output on failure:**
```
BLOCK: Code quality checks failed. Fix before ending session:

[TSC] 3 type errors in 2 files
  src/lib/api.ts(12,5): error TS2345: Argument of type 'string' is not assignable...
  src/components/Search.tsx(45,10): error TS2339: Property 'foo' does not exist...

[LINT] 2 lint errors
  src/lib/api.ts:8 — no-unused-vars: 'response' is defined but never used
  src/components/Search.tsx:22 — react-hooks/exhaustive-deps: missing dependency

[TYPE-SYNC] Generated Supabase types are stale
  Run: npx supabase gen types typescript --local > src/types/database.types.ts
```

**Timeout:** 120 seconds.

**Implementation:** External Node.js script at `hooks/scripts/quality-gate.js`. Uses a **command-type** Stop hook (not prompt-type). The script orchestrates all three checks, combines output, and outputs `BLOCK: ...` on failure or `pass` on success. Command-type is simpler, more reliable, and avoids LLM latency.

**Stop hook ordering:** This quality gate hook is added as the **first** entry in the Stop array, before the existing acceptance-criteria prompt hook. Type/lint errors are more immediately actionable than "run verify-acceptance-criteria."

## Dynamic Detection Strategy

All hooks must work with any project without configuration. Detection runs at hook execution time.

| Tool | Detection Method | Fallback |
|------|-----------------|----------|
| TypeScript | `tsconfig.json` exists in project root | Skip tsc check |
| ESLint | `node_modules/.bin/eslint` exists AND (`.eslintrc*` or `eslint.config.*`) | Try biome |
| Biome | `node_modules/.bin/biome` exists AND (`biome.json` or `biome.jsonc`) | Skip lint check |
| npm lint script | `package.json` has `scripts.lint` | Direct tool detection |
| Supabase types | `supabase` in `.feature-flow.yml` stack + `supabase/` dir exists | Skip type-sync |
| Prisma types | `prisma` in `.feature-flow.yml` stack + `prisma/schema.prisma` exists | Skip type-sync |
| Canonical types path | Glob heuristic for `*.types.ts` in common locations | `types_path` in `.feature-flow.yml` |

**Graceful degradation:** If none of the tools are detected, the hooks produce no output and don't block. The plugin adds zero friction to projects that don't use these tools.

## Schema Addition

Add optional `types_path` field to `.feature-flow.yml`:

```yaml
# .feature-flow.yml
platform: web
stack:
  - supabase
  - next-js
context7:
  next-js: /vercel/next.js
  supabase:
    - /websites/supabase
    - /supabase/supabase-js
types_path: src/types/database.types.ts   # Optional override for canonical types location
```

This field is only needed when the heuristic glob fails to find the canonical types file. Most projects won't need it.

## File Structure

New files added to the plugin:

```
hooks/
  hooks.json                    # Updated — new PostToolUse + Stop entries
  scripts/
    lint-file.js                # Per-file lint (PostToolUse) — Node.js
    quality-gate.js             # Full project gate (Stop) — Node.js
```

## Example — Hook Execution Flow

**During development (PostToolUse):**
```
Claude writes src/lib/api.ts via Write tool
  → PostToolUse fires
  → lint-file.js detects eslint (node_modules/.bin/eslint + config exist), runs: npx eslint src/lib/api.ts
  → ESLint finds unused import
  → Output: "[feature-flow] LINT ERRORS in api.ts — fix before continuing:
             src/lib/api.ts:3 — no-unused-vars: 'helper' is imported but never used"
  → Claude reads feedback, fixes the import, continues
```

**At session end (Stop):**
```
Claude attempts to end session
  → Stop hook fires
  → quality-gate.js runs all three checks:
    1. npx tsc --noEmit → 0 errors ✓
    2. npm run lint → 0 errors ✓
    3. supabase gen types diff → types match ✓
  → All pass → output "pass" → session ends normally
```

**At session end (Stop — failure):**
```
Claude attempts to end session
  → Stop hook fires
  → quality-gate.js runs all three checks:
    1. npx tsc --noEmit → 2 errors ✗
    2. npm run lint → 1 error ✗
    3. supabase gen types diff → stale ✗
  → Output: "BLOCK: Code quality checks failed..." (combined report)
  → Session cannot end → Claude fixes all issues → tries again
```

## Scope

**Included:**
- PostToolUse per-file lint hook (eslint/biome detection)
- Stop hook with tsc, full lint, and type-sync gate
- External Node.js scripts for complex detection logic
- Supabase and Prisma type generator support
- Heuristic canonical types detection with `types_path` override
- Schema addition for `types_path` in `.feature-flow.yml`
- Update to project-context-schema.md documenting the new field

**Excluded:**
- Type generators beyond Supabase and Prisma (can be added later)
- Per-file tsc in PostToolUse (performance concern)
- Auto-fixing lint errors (out of scope — Claude fixes them from feedback)
- Watch mode / incremental compilation (hooks are one-shot)
- Non-JavaScript/TypeScript language support (future work)
