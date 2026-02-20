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
    execSync(`npx tsc --noEmit --project "${tsconfig}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
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
      let val = line.match(/^\s+-\s+(.+)/)[1].trim().replace(/["']/g, '');
      val = val.replace(/\s+#.*$/, '');
      stack.push(val);
    } else if (inStack && /^\S/.test(line)) {
      inStack = false;
    }
  }
  return stack;
}

function parseTypesPath(yml) {
  const m = yml.match(/^types_path:\s*(.+)$/m);
  if (!m) return null;
  let val = m[1].trim().replace(/["']/g, '');
  val = val.replace(/\s+#.*$/, '');
  return val;
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
