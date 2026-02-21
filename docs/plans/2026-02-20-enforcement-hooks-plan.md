# Enforcement Hooks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add blocking enforcement hooks for tsc type checking, linting, and type-sync validation to the feature-flow plugin.

**Architecture:** Two-layer enforcement — PostToolUse runs per-file lint after each Write/Edit (immediate feedback), Stop hook runs full-project tsc + lint + type-sync gate (hard BLOCK). External Node.js scripts handle detection logic. All checks skip gracefully when tools aren't detected.

**Tech Stack:** Node.js scripts (child_process, fs), Claude Code hooks (hooks.json)

**Design doc:** `docs/plans/2026-02-19-enforcement-hooks.md`
**Issue:** #1

---

### Task 1: Create hooks/scripts/lint-file.js (per-file lint)

**Files:**
- Create: `hooks/scripts/lint-file.js`

**Acceptance Criteria:**
- [ ] File exists at `hooks/scripts/lint-file.js`
- [ ] Script reads JSON from stdin and extracts `tool_input.file_path`
- [ ] Script skips non-source files (test, spec, declaration, node_modules, .next, dist, build)
- [ ] Script detects ESLint by checking BOTH `node_modules/.bin/eslint` AND config file existence
- [ ] Script detects Biome by checking BOTH `node_modules/.bin/biome` AND config file existence
- [ ] Script outputs nothing when no linter is detected (graceful skip)
- [ ] Script outputs nothing when lint passes
- [ ] Script outputs `[feature-flow] LINT ERRORS in {filename}` format when lint fails
- [ ] Script always exits 0 (never crashes the hook system)

**Step 1: Create the scripts directory**

Run: `mkdir -p hooks/scripts`

**Step 2: Write lint-file.js**

```javascript
#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

let data = '';
process.stdin.on('data', chunk => (data += chunk));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const filePath = input.tool_input?.file_path || '';
    if (!isSourceFile(filePath)) process.exit(0);

    const errors = runLinter(filePath);
    if (errors) {
      const name = path.basename(filePath);
      console.log(
        `[feature-flow] LINT ERRORS in ${name} — fix these before continuing:\n${errors}`
      );
    }
  } catch {
    // Silent — never crash the hook system
  }
  process.exit(0);
});

function isSourceFile(f) {
  if (!/\.(ts|tsx|js|jsx)$/.test(f)) return false;
  if (/\.(test|spec|d)\.(ts|tsx|js|jsx)$/.test(f)) return false;
  if (/\/(node_modules|\.next|dist|build|\.git)\//.test(f)) return false;
  return true;
}

function runLinter(filePath) {
  if (existsSync('node_modules/.bin/eslint') && hasEslintConfig()) {
    try {
      execSync(`npx eslint "${filePath}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return null;
    } catch (e) {
      return (e.stdout || e.stderr || 'Lint errors found').trim();
    }
  }

  if (existsSync('node_modules/.bin/biome') && hasBiomeConfig()) {
    try {
      execSync(`npx biome check "${filePath}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return null;
    } catch (e) {
      return (e.stdout || e.stderr || 'Lint errors found').trim();
    }
  }

  return null;
}

function hasEslintConfig() {
  return [
    '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json',
    '.eslintrc.yml', '.eslintrc.yaml',
    'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
  ].some(c => existsSync(c));
}

function hasBiomeConfig() {
  return existsSync('biome.json') || existsSync('biome.jsonc');
}
```

**Step 3: Verify lint-file.js works — no linter case**

Run: `echo '{"tool_input":{"file_path":"src/lib/api.ts"}}' | node hooks/scripts/lint-file.js`
Expected: No output (no linter installed in this plugin project), exit 0

**Step 4: Verify lint-file.js works — non-source file skip**

Run: `echo '{"tool_input":{"file_path":"README.md"}}' | node hooks/scripts/lint-file.js`
Expected: No output, exit 0

Run: `echo '{"tool_input":{"file_path":"src/lib/api.test.ts"}}' | node hooks/scripts/lint-file.js`
Expected: No output, exit 0

**Step 5: Verify lint-file.js works — invalid JSON**

Run: `echo 'not json' | node hooks/scripts/lint-file.js`
Expected: No output, exit 0 (does not crash)

**Step 6: Commit**

```bash
git add hooks/scripts/lint-file.js
git commit -m "feat: add per-file lint hook script (PostToolUse)"
```

---

### Task 2: Create hooks/scripts/quality-gate.js (Stop gate)

**Files:**
- Create: `hooks/scripts/quality-gate.js`

**Acceptance Criteria:**
- [ ] File exists at `hooks/scripts/quality-gate.js`
- [ ] Script checks for `tsconfig.json` AND `node_modules/.bin/tsc` before running tsc
- [ ] Script checks for `package.json` lint script first, falls back to direct linter detection
- [ ] Script reads `.feature-flow.yml` stack field via line-based YAML parsing
- [ ] Script reads `.feature-flow.yml` types_path field when present
- [ ] Script checks `supabase status` before running `gen types` — skips with warning if not running
- [ ] Script compares generated Supabase types against existing file on disk
- [ ] Script checks Prisma schema mtime vs generated client mtime
- [ ] Script detects duplicate `.types.ts` files in `supabase/functions/` and diffs against canonical source
- [ ] Script runs ALL checks regardless of individual failures
- [ ] Script outputs `BLOCK: ...` with combined report when any check fails
- [ ] Script outputs `pass` when all checks pass (or all checks skip)
- [ ] Script always exits 0

**Step 1: Write quality-gate.js**

```javascript
#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const { existsSync, readFileSync, readdirSync, statSync } = require('fs');
const path = require('path');

const failures = [];
const warnings = [];

checkTypeScript();
checkLint();
checkTypeSync();

if (failures.length > 0) {
  const report = failures.join('\n\n');
  const warn = warnings.length > 0 ? '\n\n' + warnings.join('\n') : '';
  console.log(`BLOCK: Code quality checks failed. Fix before ending session:\n\n${report}${warn}`);
} else if (warnings.length > 0) {
  console.error(warnings.join('\n'));
}

process.exit(0);

// --- Check 1: TypeScript ---

function checkTypeScript() {
  const tsconfig = ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.build.json'].find(f =>
    existsSync(f)
  );
  if (!tsconfig) return;
  if (!existsSync('node_modules/.bin/tsc')) return;

  try {
    execSync('npx tsc --noEmit', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    const output = ((e.stdout || '') + (e.stderr || '')).trim();
    const errorLines = output.split('\n').filter(l => l.includes('error TS'));
    const count = errorLines.length;
    if (count > 0) {
      const shown = errorLines.slice(0, 20).join('\n  ');
      const more = count > 20 ? `\n  ... and ${count - 20} more` : '';
      failures.push(`[TSC] ${count} type error${count !== 1 ? 's' : ''}\n  ${shown}${more}`);
    }
  }
}

// --- Check 2: Lint ---

function checkLint() {
  // Try npm run lint first
  if (existsSync('package.json')) {
    try {
      const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
      if (pkg.scripts?.lint) {
        try {
          execSync('npm run lint', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
          return;
        } catch (e) {
          const output = ((e.stdout || '') + (e.stderr || '')).trim();
          failures.push(`[LINT] Lint errors found\n  ${output.split('\n').slice(0, 20).join('\n  ')}`);
          return;
        }
      }
    } catch {}
  }

  // Fallback: direct linter detection
  if (existsSync('node_modules/.bin/eslint') && hasEslintConfig()) {
    try {
      execSync('npx eslint .', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      return;
    } catch (e) {
      const output = ((e.stdout || '') + (e.stderr || '')).trim();
      failures.push(`[LINT] ESLint errors\n  ${output.split('\n').slice(0, 20).join('\n  ')}`);
      return;
    }
  }

  if (existsSync('node_modules/.bin/biome') && hasBiomeConfig()) {
    try {
      execSync('npx biome check .', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      const output = ((e.stdout || '') + (e.stderr || '')).trim();
      failures.push(`[LINT] Biome errors\n  ${output.split('\n').slice(0, 20).join('\n  ')}`);
    }
  }
}

// --- Check 3: Type-sync ---

function checkTypeSync() {
  if (!existsSync('.feature-flow.yml')) return;

  const yml = readFileSync('.feature-flow.yml', 'utf8');
  const stack = parseStack(yml);
  const typesPath = parseTypesPath(yml);

  if (stack.includes('supabase') && existsSync('supabase')) {
    checkSupabaseTypes(typesPath);
  }

  if (stack.includes('prisma') && existsSync('prisma/schema.prisma')) {
    checkPrismaTypes();
  }

  checkDuplicateTypes(typesPath);
}

function checkSupabaseTypes(typesPathOverride) {
  if (!existsSync('node_modules/.bin/supabase')) return;

  // Guard: is Supabase running?
  try {
    execSync('npx supabase status', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    warnings.push(
      '[feature-flow] Supabase not running locally — skipping type freshness check. Run "supabase start" to enable.'
    );
    return;
  }

  const typesFile = typesPathOverride || findTypesFile();
  if (!typesFile) {
    warnings.push('[feature-flow] No generated types file found — skipping Supabase type freshness check.');
    return;
  }

  try {
    const fresh = execSync('npx supabase gen types typescript --local', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const existing = readFileSync(typesFile, 'utf8');
    if (fresh.trim() !== existing.trim()) {
      failures.push(
        `[TYPE-SYNC] Generated Supabase types are stale\n  Run: npx supabase gen types typescript --local > ${typesFile}`
      );
    }
  } catch (e) {
    warnings.push(`[feature-flow] Failed to generate Supabase types: ${(e.message || '').slice(0, 100)}`);
  }
}

function checkPrismaTypes() {
  if (!existsSync('node_modules/.bin/prisma')) return;

  try {
    const schemaTime = statSync('prisma/schema.prisma').mtimeMs;
    const clientPaths = ['node_modules/.prisma/client/index.js', 'node_modules/@prisma/client/index.js'];
    const clientPath = clientPaths.find(p => existsSync(p));
    if (clientPath && schemaTime > statSync(clientPath).mtimeMs) {
      failures.push('[TYPE-SYNC] Prisma schema modified since last generation\n  Run: npx prisma generate');
    }
  } catch {}
}

function checkDuplicateTypes(typesPathOverride) {
  const canonical = typesPathOverride || findTypesFile();
  if (!canonical || !existsSync(canonical)) return;

  const canonicalContent = readFileSync(canonical, 'utf8');
  const edgeDirs = [];
  if (existsSync('supabase/functions')) edgeDirs.push('supabase/functions');

  for (const dir of edgeDirs) {
    for (const tf of findTypeFiles(dir)) {
      if (path.resolve(tf) === path.resolve(canonical)) continue;
      try {
        if (readFileSync(tf, 'utf8') !== canonicalContent) {
          failures.push(`[TYPE-SYNC] Type file ${tf} has drifted from canonical source ${canonical}`);
        }
      } catch {}
    }
  }
}

// --- Helpers ---

function findTypesFile() {
  return [
    'src/types/database.types.ts', 'src/types/supabase.types.ts',
    'types/database.types.ts', 'types/supabase.types.ts',
    'lib/types/database.types.ts', 'lib/database.types.ts',
    'app/types/database.types.ts', 'src/lib/database.types.ts',
  ].find(p => existsSync(p)) || null;
}

function findTypeFiles(dir) {
  const results = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...findTypeFiles(full));
      else if (/\.types\.ts$/.test(entry.name)) results.push(full);
    }
  } catch {}
  return results;
}

function parseStack(yml) {
  const stack = [];
  let inStack = false;
  for (const line of yml.split('\n')) {
    if (/^stack:/.test(line)) { inStack = true; continue; }
    if (inStack && /^\s+-\s+(.+)/.test(line)) {
      stack.push(line.match(/^\s+-\s+(.+)/)[1].trim().replace(/["']/g, ''));
    } else if (inStack && /^\S/.test(line)) {
      inStack = false;
    }
  }
  return stack;
}

function parseTypesPath(yml) {
  const m = yml.match(/^types_path:\s*(.+)$/m);
  return m ? m[1].trim().replace(/["']/g, '') : null;
}

function hasEslintConfig() {
  return [
    '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json',
    '.eslintrc.yml', '.eslintrc.yaml',
    'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
  ].some(c => existsSync(c));
}

function hasBiomeConfig() {
  return existsSync('biome.json') || existsSync('biome.jsonc');
}
```

**Step 2: Verify quality-gate.js — no tools case (this plugin project)**

Run: `node hooks/scripts/quality-gate.js < /dev/null`
Expected: No stdout output (no tsconfig, no package.json lint script, no .feature-flow.yml), exit 0

**Step 3: Verify quality-gate.js — handles missing stdin gracefully**

Run: `echo '' | node hooks/scripts/quality-gate.js`
Expected: No stdout output, exit 0

**Step 4: Commit**

```bash
git add hooks/scripts/quality-gate.js
git commit -m "feat: add quality gate Stop hook script (tsc + lint + type-sync)"
```

---

### Task 3: Update hooks.json — PostToolUse lint entries

**Files:**
- Modify: `hooks/hooks.json`

**Acceptance Criteria:**
- [ ] PostToolUse Write matcher has a new hook entry running `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lint-file.js` with timeout 30
- [ ] PostToolUse Edit matcher has a new hook entry running `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lint-file.js` with timeout 30
- [ ] New entries are appended AFTER existing hooks (plan reminder, console.log warning)
- [ ] hooks.json is valid JSON

**Step 1: Add lint hook to PostToolUse Write matcher**

In `hooks/hooks.json`, the PostToolUse Write matcher's `hooks` array (currently has 2 entries: plan reminder + console.log warning), append a third entry:

```json
{
  "type": "command",
  "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lint-file.js",
  "timeout": 30
}
```

**Step 2: Add lint hook to PostToolUse Edit matcher**

In `hooks/hooks.json`, the PostToolUse Edit matcher's `hooks` array (currently has 1 entry: console.log warning), append:

```json
{
  "type": "command",
  "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lint-file.js",
  "timeout": 30
}
```

**Step 3: Update PostToolUse descriptions**

- Write matcher description: `"Plan file reminder + console.log/debug warning + per-file lint for source files"`
- Edit matcher description: `"console.log/debug warning + per-file lint for edited source files"`

**Step 4: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8'));console.log('Valid JSON')"`
Expected: `Valid JSON`

**Step 5: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat: add PostToolUse lint hooks for Write and Edit"
```

---

### Task 4: Update hooks.json — Stop quality gate entry

**Files:**
- Modify: `hooks/hooks.json`

**Acceptance Criteria:**
- [ ] Stop array has a new FIRST entry (before existing acceptance-criteria hook) with command-type hook running `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/quality-gate.js`
- [ ] Stop gate hook has timeout 120 and statusMessage
- [ ] hooks.json is valid JSON
- [ ] Existing acceptance-criteria Stop hook is unchanged

**Step 1: Prepend quality gate to Stop array**

The current Stop array has 1 entry (acceptance criteria prompt). Insert a new entry as the FIRST element:

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/quality-gate.js",
      "timeout": 120,
      "statusMessage": "Running code quality checks (tsc, lint, type-sync)..."
    }
  ]
}
```

**Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8'));console.log('Valid JSON')"`
Expected: `Valid JSON`

**Step 3: Verify Stop array structure**

Run: `node -e "const h=JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8'));console.log('Stop hooks:',h.hooks.Stop.length,'entries');console.log('First:',h.hooks.Stop[0].hooks[0].type);console.log('Second:',h.hooks.Stop[1].hooks[0].type)"`
Expected: `Stop hooks: 2 entries`, `First: command`, `Second: prompt`

**Step 4: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat: add Stop quality gate hook (tsc + lint + type-sync)"
```

---

### Task 5: Update SessionStart hook message

**Files:**
- Modify: `hooks/hooks.json`

**Acceptance Criteria:**
- [ ] SessionStart message for existing users includes mention of enforcement hooks (tsc, lint, type-sync)
- [ ] hooks.json is valid JSON

**Step 1: Update SessionStart message**

In the SessionStart hook's echo message for existing `.feature-flow.yml` users, add a rule #5:

`(5) Stop hook runs tsc, lint, and type-sync checks — session cannot end with errors.`

**Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8'));console.log('Valid JSON')"`

**Step 3: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat: update SessionStart message with enforcement hook info"
```

---

### Task 6: Update project-context-schema.md — types_path field

**Files:**
- Modify: `references/project-context-schema.md`

**Acceptance Criteria:**
- [ ] New `types_path` field is documented in the schema section
- [ ] Schema example includes `types_path`
- [ ] Field description explains it's optional and when it's needed
- [ ] "How Skills Use This File" section updated to mention quality-gate hook

**Step 1: Add types_path to schema example**

After the `gotchas` field in the YAML example, add:

```yaml
types_path: src/types/database.types.ts  # Optional: canonical generated types path
```

**Step 2: Add types_path field documentation**

After the `gotchas` section, add:

```markdown
### `types_path`

Optional path to the canonical generated types file (e.g., `src/types/database.types.ts`). Used by the Stop hook quality gate to check type freshness and detect duplicate type files.

**When needed:** Only when the heuristic glob fails to find the generated types file. The quality gate checks common locations automatically: `src/types/`, `types/`, `lib/types/`, `lib/`, `app/types/`, `src/lib/`. If the file is in a non-standard location, set `types_path` explicitly.

**Format:** Single file path relative to project root.

```yaml
types_path: src/types/database.types.ts
```
```

**Step 3: Add hooks entry to "How Skills Use This File"**

After the `create-issue` section, add:

```markdown
### quality-gate hook (reads)
- **Reads** `stack` field to determine which type generators to check (supabase, prisma)
- **Reads** `types_path` field to find the canonical generated types file
```

**Step 4: Commit**

```bash
git add references/project-context-schema.md
git commit -m "docs: add types_path field to project context schema"
```

---

### Task 7: Update CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md`

**Acceptance Criteria:**
- [ ] New version section (1.7.0) documents all three enforcement hooks
- [ ] Lists new files: lint-file.js, quality-gate.js
- [ ] Documents the types_path schema addition
- [ ] Documents the two-layer enforcement strategy

**Step 1: Add version entry**

Prepend a new section before `## [1.6.0]`:

```markdown
## [1.7.0] - 2026-02-20

### Added
- **PostToolUse per-file lint hook** — runs ESLint or Biome on each source file after Write/Edit, providing immediate feedback to fix lint errors before continuing
- **Stop quality gate hook** — blocks session end with combined report when any of these checks fail:
  - **TypeScript type checking** (`tsc --noEmit`) — catches type errors across the full project
  - **Full project lint** (`npm run lint` or direct linter detection) — enforces project lint rules
  - **Type-sync: generated types freshness** — detects stale Supabase/Prisma generated types by regenerating and diffing
  - **Type-sync: duplicate type detection** — finds `.types.ts` files in edge function directories that have drifted from the canonical source
- External Node.js scripts (`hooks/scripts/lint-file.js`, `hooks/scripts/quality-gate.js`) for complex detection logic
- Dynamic tool detection — checks `node_modules/.bin/` for installed tools before running; never lets `npx` download tools
- Supabase instance guard — checks `supabase status` before `gen types --local`; skips gracefully if not running
- New `types_path` field in `.feature-flow.yml` for overriding canonical types file location

### Changed
- Stop hook array ordering: quality gate runs first, acceptance-criteria check runs second
- SessionStart message updated to mention enforcement hooks
- PostToolUse Write/Edit descriptions updated to include lint hook
```

**Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add v1.7.0 changelog for enforcement hooks"
```
