#!/usr/bin/env node
'use strict';

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { existsSync, readFileSync, readdirSync, statSync } = require('fs');
const path = require('path');

const failures = [];
const warnings = [];

async function main() {
  const checks = [
    ['TypeScript', checkTypeScript],
    ['Lint', checkLint],
    ['Type-sync', checkTypeSync],
  ];

  await Promise.allSettled(
    checks.map(([name, fn]) =>
      fn().catch(e => {
        warnings.push(`[feature-flow] ${name} check failed unexpectedly: ${e.message?.slice(0, 100)}`);
      })
    )
  );

  // Run tests only after typecheck passes — tests depend on valid types
  const hasTypeErrors = failures.some(f => f.startsWith('[TSC]'));
  if (!hasTypeErrors) {
    await checkTests().catch(e => {
      warnings.push(`[feature-flow] Test check failed unexpectedly: ${e.message?.slice(0, 100)}`);
    });
  }

  if (failures.length > 0) {
    const report = failures.join('\n\n');
    const warn = warnings.length > 0 ? '\n\n' + warnings.join('\n') : '';
    console.log(`BLOCK: Code quality checks failed. Fix before ending session:\n\n${report}${warn}`);
  } else if (warnings.length > 0) {
    console.error(warnings.join('\n'));
  }
}

main().catch(e => {
  console.error(`[feature-flow] Quality gate crashed: ${e.message?.slice(0, 200)}`);
}).finally(() => {
  process.exit(0);
});

// --- Check 1: TypeScript ---

async function checkTypeScript() {
  const tsconfig = ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.build.json'].find(f =>
    existsSync(f)
  );
  if (!tsconfig) return;
  if (!existsSync('node_modules/.bin/tsc')) return;

  try {
    await execAsync(`npx tsc --noEmit --project "${tsconfig}"`, { encoding: 'utf8' });
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
    await execAsync(command, { encoding: 'utf8' });
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
    await execAsync('npx supabase status', { encoding: 'utf8' });
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
      timeout: 60000,
      env: { ...process.env, CI: '1' },
    });
  } catch (e) {
    if (e.killed && e.signal === 'SIGTERM') {
      warnings.push('[feature-flow] Test suite timed out (60s) — skipping. Run tests manually.');
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

  return null;
}

// --- Helpers ---

function execOutput(e) {
  return ((e.stdout || '') + (e.stderr || '')).trim();
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
