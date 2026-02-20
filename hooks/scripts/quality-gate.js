#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const { existsSync, readFileSync, readdirSync, statSync } = require('fs');
const path = require('path');

const failures = [];
const warnings = [];

try { checkTypeScript(); } catch (e) { warnings.push(`[spec-driven] TypeScript check failed unexpectedly: ${e.message?.slice(0, 100)}`); }
try { checkLint(); } catch (e) { warnings.push(`[spec-driven] Lint check failed unexpectedly: ${e.message?.slice(0, 100)}`); }
try { checkTypeSync(); } catch (e) { warnings.push(`[spec-driven] Type-sync check failed unexpectedly: ${e.message?.slice(0, 100)}`); }
try { checkTests(); } catch (e) { warnings.push(`[spec-driven] Test check failed unexpectedly: ${e.message?.slice(0, 100)}`); }

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
    execSync(`npx tsc --noEmit --project "${tsconfig}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
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

function checkLint() {
  // Try npm run lint first
  if (existsSync('package.json')) {
    try {
      const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
      if (pkg.scripts?.lint) {
        runLintCommand('npm run lint', 'Lint errors found');
        return;
      }
    } catch (e) {
      warnings.push(`[spec-driven] Failed to parse package.json: ${e.message?.slice(0, 100) || 'unknown'}. Falling back to direct linter detection.`);
    }
  }

  // Fallback: direct linter detection
  if (existsSync('node_modules/.bin/eslint') && hasEslintConfig()) {
    runLintCommand('npx eslint .', 'ESLint errors');
    return;
  }

  if (existsSync('node_modules/.bin/biome') && hasBiomeConfig()) {
    runLintCommand('npx biome check .', 'Biome errors');
  }
}

function runLintCommand(command, label) {
  try {
    execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    const lines = execOutput(e).split('\n').slice(0, 20).join('\n  ');
    failures.push(`[LINT] ${label}\n  ${lines}`);
  }
}

// --- Check 3: Type-sync ---

function checkTypeSync() {
  if (!existsSync('.spec-driven.yml')) return;

  const yml = readFileSync('.spec-driven.yml', 'utf8');
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
      '[spec-driven] Supabase not running locally — skipping type freshness check. Run "supabase start" to enable.'
    );
    return;
  }

  const typesFile = typesPathOverride || findTypesFile();
  if (!typesFile) {
    warnings.push('[spec-driven] No generated types file found — skipping Supabase type freshness check.');
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
    warnings.push(`[spec-driven] Failed to generate Supabase types: ${(e.message || '').slice(0, 100)}`);
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
  if (!existsSync('supabase/functions')) return;

  const canonicalContent = readFileSync(canonical, 'utf8');
  for (const tf of findTypeFiles('supabase/functions')) {
    if (path.resolve(tf) === path.resolve(canonical)) continue;
    try {
      if (readFileSync(tf, 'utf8') !== canonicalContent) {
        failures.push(`[TYPE-SYNC] Type file ${tf} has drifted from canonical source ${canonical}`);
      }
    } catch {}
  }
}

// --- Check 4: Tests ---

function checkTests() {
  const cmd = detectTestCommand();
  if (!cmd) return;

  try {
    execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
      env: { ...process.env, CI: '1' },
    });
  } catch (e) {
    if (e.killed && e.signal === 'SIGTERM') {
      warnings.push('[spec-driven] Test suite timed out (60s) — skipping. Run tests manually.');
      return;
    }
    if (e.code === 'ENOENT' || e.status === 127) {
      warnings.push(`[spec-driven] Test command not found: "${cmd}". Ensure the tool is installed.`);
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
          warnings.push('[spec-driven] node_modules not found — skipping test check. Run "npm install" first.');
          return null;
        }
        return 'npm test';
      }
    } catch (e) {
      warnings.push(`[spec-driven] Failed to parse package.json for test detection: ${e.message?.slice(0, 100) || 'unknown'}`);
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
