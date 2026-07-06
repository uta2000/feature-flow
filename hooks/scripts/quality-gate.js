#!/usr/bin/env node
'use strict';

const { exec, execSync } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { existsSync, readFileSync, writeFileSync, readdirSync, statSync } = require('fs');
const path = require('path');
const { readHookInput } = require('./lib/read-hook-input');

const failures = [];
const warnings = [];
// Checks that could not run to completion — crashed (unexpected throw) or timed
// out. These are INCONCLUSIVE, not passes: a check that never produced a verdict
// must not be counted as clean. Tracked separately from failures/warnings so the
// verified marker can be withheld and the block message can say "inconclusive".
const incomplete = [];

// Parse a positive number from an env override, falling back to `fallback` for any
// missing / non-numeric / zero / negative value. Guards the test seams below: a bad
// override (e.g. a mistyped FF_QG_MAX_BUFFER="-100") must not reach exec(), which
// throws RangeError on maxBuffer < 0, and must not silently disable the timeout.
function positiveNumberEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Test-command timeout. Overridable via env so the timeout path can be exercised
// in tests without waiting the full production duration.
const TEST_TIMEOUT_MS = positiveNumberEnv('FF_QG_TEST_TIMEOUT_MS', 60000);

// Output buffer cap for captured subprocess output. exec() defaults to 1 MB and
// REJECTS (killing the child) once a command's combined stdout+stderr crosses it —
// so a PASSING but chatty test/lint/tsc run would overflow and be mis-reported.
// 64 MB is ample headroom for any realistic run. Overridable via env so the
// overflow path can be exercised in tests without generating 64 MB of output.
const MAX_BUFFER = positiveNumberEnv('FF_QG_MAX_BUFFER', 64 * 1024 * 1024);

async function main() {
  // Respect the harness's loop-protection flag: when a previous Stop block already fired
  // for this turn, re-running the full check suite would just re-block in a loop.
  const payload = readHookInput();
  if (payload && payload.stop_hook_active === true) {
    return;
  }

  // Skip if lifecycle already verified at this commit with clean working tree
  try {
    const markerPath = path.join(
      execSync('git rev-parse --git-dir', { encoding: 'utf8', timeout: 5000 }).trim(),
      'feature-flow-verified'
    );
    if (existsSync(markerPath)) {
      const savedHash = readFileSync(markerPath, 'utf8').trim();
      const currentHash = execSync('git rev-parse HEAD', { encoding: 'utf8', timeout: 5000 }).trim();
      const dirty = execSync('git status --porcelain', { encoding: 'utf8', timeout: 5000 }).trim();
      if (savedHash === currentHash && !dirty) {
        console.error('[feature-flow] Quality gates already verified at this commit — skipping.');
        return;
      }
    }
  } catch {
    // Fall through to run checks — fail-open on any git/fs error
  }

  const checks = [
    ['TypeScript', checkTypeScript],
    ['Lint', checkLint],
    ['Type-sync', checkTypeSync],
  ];

  await Promise.allSettled(
    checks.map(([name, fn]) =>
      fn().catch(e => {
        const detail = errorDetail(e);
        warnings.push(`[feature-flow] ${name} check could not complete: ${detail}`);
        incomplete.push(`[${name}] check crashed before producing a result: ${detail}`);
      })
    )
  );

  // Run tests only after typecheck passes — tests depend on valid types
  const hasTypeErrors = failures.some(f => f.startsWith('[TSC]'));
  if (!hasTypeErrors) {
    await checkTests().catch(e => {
      const detail = errorDetail(e);
      warnings.push(`[feature-flow] Test check could not complete: ${detail}`);
      incomplete.push(`[TEST] check crashed before producing a result: ${detail}`);
    });
  }

  if (failures.length > 0 || incomplete.length > 0) {
    const sections = [];
    if (failures.length > 0) sections.push(failures.join('\n\n'));
    if (incomplete.length > 0) {
      sections.push(
        'Checks that could not complete (inconclusive — not counted as passing):\n' +
          incomplete.join('\n')
      );
    }
    if (warnings.length > 0) sections.push(warnings.join('\n'));
    const body = sections.join('\n\n');
    const reason = failures.length > 0
      ? `Code quality checks failed. Fix before ending session:\n\n${body}`
      : `Code quality checks are inconclusive — some checks could not complete, so this session is not verified. Re-run after resolving, or investigate the check itself:\n\n${body}`;
    console.log(JSON.stringify({ decision: 'block', reason }));
  } else if (warnings.length > 0) {
    console.error(warnings.join('\n'));
  }

  // Write the verification marker only when every check truly completed clean.
  // A crashed or timed-out check is inconclusive, not a pass — stamping "verified"
  // on it would let the next Stop at this commit short-circuit and skip all checks
  // (the cache-poisoning bug this guards against).
  if (failures.length === 0 && incomplete.length === 0) {
    writeVerificationMarker();
  }
}

main().catch(e => {
  console.error(`[feature-flow] Quality gate crashed: ${e.message?.slice(0, 200)}`);
}).finally(() => {
  process.exit(0);
});

// --- Marker file ---

function writeVerificationMarker() {
  try {
    const markerPath = path.join(
      execSync('git rev-parse --git-dir', { encoding: 'utf8', timeout: 5000 }).trim(),
      'feature-flow-verified'
    );
    const hash = execSync('git rev-parse HEAD', { encoding: 'utf8', timeout: 5000 }).trim();
    writeFileSync(markerPath, hash + '\n');
  } catch (e) {
    // Non-critical — marker write failure doesn't affect quality gate results
    console.error(`[feature-flow] Could not write verification marker: ${e.message?.slice(0, 100)}`);
  }
}

// --- Check 1: TypeScript ---

async function checkTypeScript() {
  const tsconfig = ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.build.json'].find(f =>
    existsSync(f)
  );
  if (!tsconfig) return;
  if (!existsSync('node_modules/.bin/tsc')) return;

  try {
    await execAsync(`npx tsc --noEmit --project "${tsconfig}"`, { encoding: 'utf8', maxBuffer: MAX_BUFFER });
  } catch (e) {
    const output = execOutput(e);
    const errorLines = output.split('\n').filter(l => l.includes('error TS'));
    const count = errorLines.length;
    if (count > 0) {
      const shown = errorLines.slice(0, 20).join('\n  ');
      const more = count > 20 ? `\n  ... and ${count - 20} more` : '';
      failures.push(`[TSC] ${count} type error${count !== 1 ? 's' : ''}\n  ${shown}${more}`);
    } else if (output) {
      failures.push(`[TSC] TypeScript check failed\n  ${output.slice(0, 500)}`);
    }
  }
}

// --- Check 2: Lint ---

async function checkLint() {
  // Try npm run lint first
  if (existsSync('package.json')) {
    try {
      const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
      if (pkg.scripts?.lint) {
        await runLintCommand('npm run lint', 'Lint errors found');
        return;
      }
    } catch (e) {
      warnings.push(`[feature-flow] Failed to parse package.json: ${e.message?.slice(0, 100) || 'unknown'}. Falling back to direct linter detection.`);
    }
  }

  // Fallback: direct linter detection
  if (existsSync('node_modules/.bin/eslint') && hasEslintConfig()) {
    await runLintCommand('npx eslint .', 'ESLint errors');
    return;
  }

  if (existsSync('node_modules/.bin/biome') && hasBiomeConfig()) {
    await runLintCommand('npx biome check .', 'Biome errors');
  }
}

async function runLintCommand(command, label) {
  try {
    await execAsync(command, { encoding: 'utf8', maxBuffer: MAX_BUFFER });
  } catch (e) {
    const lines = execOutput(e).split('\n').slice(0, 20).join('\n  ');
    failures.push(`[LINT] ${label}\n  ${lines}`);
  }
}

// --- Check 3: Type-sync ---

async function checkTypeSync() {
  if (!existsSync('.feature-flow.yml')) return;

  const yml = readFileSync('.feature-flow.yml', 'utf8');
  const stack = parseStack(yml);
  const typesPath = parseTypesPath(yml);

  if (stack.includes('supabase') && existsSync('supabase')) {
    await checkSupabaseTypes(typesPath);
  }

  if (stack.includes('prisma') && existsSync('prisma/schema.prisma')) {
    checkPrismaTypes();
  }

  checkDuplicateTypes(typesPath);
}

async function checkSupabaseTypes(typesPathOverride) {
  if (!existsSync('node_modules/.bin/supabase')) return;

  // Guard: is Supabase running?
  try {
    await execAsync('npx supabase status', { encoding: 'utf8', maxBuffer: MAX_BUFFER });
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
    const { stdout: fresh } = await execAsync('npx supabase gen types typescript --local', {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
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
  } catch (e) {
    warnings.push(`[feature-flow] Prisma type-sync check failed: ${e.message?.slice(0, 100)}`);
  }
}

function checkDuplicateTypes(typesPathOverride) {
  const canonical = typesPathOverride || findTypesFile();
  if (!canonical || !existsSync(canonical)) return;
  if (!existsSync('supabase/functions')) return;

  const canonicalContent = readFileSync(canonical, 'utf8');
  let typeFiles;
  try {
    typeFiles = findTypeFiles('supabase/functions');
  } catch (e) {
    warnings.push(`[feature-flow] Could not scan supabase/functions for duplicate types: ${e.message?.slice(0, 80)}`);
    return;
  }
  for (const tf of typeFiles) {
    if (path.resolve(tf) === path.resolve(canonical)) continue;
    try {
      if (readFileSync(tf, 'utf8') !== canonicalContent) {
        failures.push(`[TYPE-SYNC] Type file ${tf} has drifted from canonical source ${canonical}`);
      }
    } catch (e) {
      warnings.push(`[feature-flow] Could not read type file ${tf} for drift check: ${e.message?.slice(0, 80)}`);
    }
  }
}

// --- Check 4: Tests ---

async function checkTests() {
  const cmd = detectTestCommand();
  if (!cmd) return;

  try {
    await execAsync(cmd, {
      encoding: 'utf8',
      timeout: TEST_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      env: { ...process.env, CI: '1' },
    });
  } catch (e) {
    // Output overflowed even the generous MAX_BUFFER cap: exec killed the child and
    // rejected before the suite could report. The result is UNKNOWN, not a failure —
    // so classify it as inconclusive (block, no verified marker), never a red test.
    // Keyed on e.code (set on every Node version); MUST precede the SIGTERM/timeout
    // branch because an overflow can also present as killed+SIGTERM on older Node,
    // which would otherwise be mislabeled a timeout.
    if (e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      const limit = formatBytes(MAX_BUFFER);
      warnings.push(`[feature-flow] Test output too large to buffer (>${limit}) — inconclusive, not counted as passing. Run tests manually.`);
      incomplete.push(`[TEST] Test output too large to buffer (>${limit}) — could not determine pass/fail.`);
      return;
    }
    if (e.killed && e.signal === 'SIGTERM') {
      const secs = Math.round(TEST_TIMEOUT_MS / 1000);
      warnings.push(`[feature-flow] Test suite timed out (${secs}s) — inconclusive, not counted as passing. Run tests manually.`);
      incomplete.push(`[TEST] Test suite timed out after ${secs}s — could not determine pass/fail.`);
      return;
    }
    // e.code is the numeric exit code with promisify(exec); 127 = shell "command not found"
    if (e.code === 127) {
      warnings.push(`[feature-flow] Test command not found: "${cmd}". Ensure the tool is installed.`);
      return;
    }
    const output = execOutput(e);
    if (!output) {
      failures.push(`[TEST] Test suite failed: ${e.message?.slice(0, 200) || 'exit code ' + e.status}`);
    } else {
      const lines = output.split('\n').slice(0, 20).join('\n  ');
      failures.push(`[TEST] Test suite failed\n  ${lines}`);
    }
  }
}

function detectTestCommand() {
  if (existsSync('package.json')) {
    try {
      const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
      const testScript = pkg.scripts?.test;
      if (testScript && !testScript.includes('no test specified')) {
        if (!existsSync('node_modules')) {
          warnings.push('[feature-flow] node_modules not found — skipping test check. Run "npm install" first.');
          return null;
        }
        return 'npm test';
      }
    } catch (e) {
      warnings.push(`[feature-flow] Failed to parse package.json for test detection: ${e.message?.slice(0, 100) || 'unknown'}`);
    }
  }

  if (existsSync('Cargo.toml')) return 'cargo test';
  if (existsSync('go.mod')) return 'go test ./...';
  if (existsSync('mix.exs')) return 'mix test';
  if (existsSync('pyproject.toml') || existsSync('pytest.ini') || existsSync('setup.cfg') || existsSync('tox.ini')) {
    return 'python -m pytest';
  }

  if (existsSync('deno.json') || existsSync('deno.jsonc')) {
    return detectRuntimeTestCommand('deno', 'deno test', 'Install deno or remove deno.json.');
  }

  if (existsSync('bun.lockb') || existsSync('bun.lock') || existsSync('bunfig.toml')) {
    return detectRuntimeTestCommand('bun', 'bun test', 'Install bun or remove the lockfile.');
  }

  return null;
}

function detectRuntimeTestCommand(runtime, command, hint) {
  try {
    execSync(`${runtime} --version`, { stdio: 'pipe', timeout: 5000 });
    return command;
  } catch (e) {
    const isNotFound = e.code === 'ENOENT' || e.status === 127;
    const detail = isNotFound
      ? `${runtime} not found in PATH`
      : `${runtime} --version failed (${e.code || 'exit ' + e.status}): ${(e.message || '').slice(0, 100)}`;
    warnings.push(`[feature-flow] ${runtime} config found but ${detail} — skipping test check. ${hint}`);
    return null;
  }
}

// --- Helpers ---

function execOutput(e) {
  return ((e.stdout || '') + (e.stderr || '')).trim();
}

// Human-readable byte size, unit chosen by magnitude so a shrunk test-seam buffer
// reports "8KB" instead of a misleading rounded-to-zero ">0MB".
function formatBytes(n) {
  if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))}MB`;
  if (n >= 1024) return `${Math.round(n / 1024)}KB`;
  return `${n}B`;
}

// Safely extract a short detail string from any thrown/rejected value. A Promise
// can reject with null, undefined, a plain string, or a non-Error object, so
// `e.message?.slice(...)` would throw a TypeError on a null/undefined rejection —
// which, inside these .catch handlers, would silently drop the incomplete status
// and re-open the cache-poisoning hole. Never let detail extraction throw.
function errorDetail(e) {
  const msg = (e && (e.message || e)) || 'unknown error';
  return String(msg).slice(0, 100);
}

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
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      try {
        results.push(...findTypeFiles(full));
      } catch (e) {
        warnings.push(`[feature-flow] Could not scan directory ${full} for type files: ${e.message?.slice(0, 80)}`);
      }
    } else if (/\.types\.ts$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

function parseStack(yml) {
  const stack = [];
  let inStack = false;
  for (const line of yml.split('\n')) {
    if (/^stack:/.test(line)) { inStack = true; continue; }
    const m = inStack && line.match(/^\s+-\s+(.+)/);
    if (m) {
      stack.push(stripYamlValue(m[1]));
    } else if (inStack && /^\S/.test(line)) {
      inStack = false;
    }
  }
  return stack;
}

function parseTypesPath(yml) {
  const m = yml.match(/^types_path:\s*(.+)$/m);
  return m ? stripYamlValue(m[1]) : null;
}

function stripYamlValue(raw) {
  return raw.trim().replace(/["']/g, '').replace(/\s+#.*$/, '');
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
