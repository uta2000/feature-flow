#!/usr/bin/env node
'use strict';

/**
 * check-advisor.js
 *
 * Reads the user's Claude Code settings.json (OS-specific path) and the local
 * .feature-flow.yml to determine advisor configuration state.
 *
 * As a CLI, outputs a single JSON object to stdout:
 *   { sonnet: boolean|null, header_present: boolean, dismissed: boolean }
 *
 * Also exports helper functions so other scripts (e.g. hooks/scripts/advisor-hint.js)
 * can share detection logic without duplicating it.
 *
 * Fields:
 *   sonnet        — true if CLAUDE_MODEL env suggests Sonnet; false if detected and
 *                   non-Sonnet; null if undetectable (fail-open: eligible for hint)
 *   header_present — true if any SUPPORTED_ADVISOR_HEADERS entry found in ANTHROPIC_BETA
 *   dismissed     — true if hints.advisor.dismissed: true in .feature-flow.yml
 *
 * Always exits 0 — errors are logged to stderr and produce safe defaults.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { SUPPORTED_ADVISOR_HEADERS } = require('./advisor-headers.js');

// ─── Platform-specific settings.json path ────────────────────────────────────

function getSettingsPath() {
  const platform = process.platform;
  const home = os.homedir();

  if (platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appdata, 'claude', 'settings.json');
  }
  if (platform === 'linux') {
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    const xdgPath = path.join(xdgConfig, 'claude', 'settings.json');
    if (fs.existsSync(xdgPath)) return xdgPath;
  }
  return path.join(home, '.claude', 'settings.json');
}

// ─── Read settings.json ───────────────────────────────────────────────────────

function readSettings() {
  const p = getSettingsPath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

// ─── Detect advisor header in settings.json ───────────────────────────────────

function detectHeaderPresent(settings) {
  if (!settings || typeof settings !== 'object') return false;
  const env = settings.env || {};
  const betaValue = env.ANTHROPIC_BETA || env.anthropic_beta || '';
  if (typeof betaValue !== 'string' || !betaValue) return false;
  const parts = betaValue.split(',').map((s) => s.trim());
  return SUPPORTED_ADVISOR_HEADERS.some((h) => parts.includes(h));
}

// ─── YAML parser: hints.advisor.dismissed ─────────────────────────────────────

/**
 * Line-by-line parser for `hints.advisor.dismissed: true` in YAML text.
 * Avoids unbounded-capture regex bugs where sibling keys under `hints:` with
 * a `dismissed` field would falsely match.
 */
function parseHintsAdvisorDismissed(yamlText) {
  if (typeof yamlText !== 'string') return false;
  const lines = yamlText.split('\n');
  let inHints = false;
  let hintsIndent = -1;
  let inAdvisor = false;
  let advisorIndent = -1;

  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indentMatch = raw.match(/^[ \t]*/);
    const indent = indentMatch ? indentMatch[0].length : 0;
    const trimmed = raw.trim();

    if (!inHints) {
      if (trimmed === 'hints:') {
        inHints = true;
        hintsIndent = indent;
      }
      continue;
    }

    // We are inside `hints:`. Leave when we hit a line at the same or shallower indent.
    if (indent <= hintsIndent) {
      inHints = false;
      inAdvisor = false;
      continue;
    }

    if (!inAdvisor) {
      if (trimmed === 'advisor:') {
        inAdvisor = true;
        advisorIndent = indent;
      }
      continue;
    }

    // Inside the advisor block. Leave when indent drops back to advisorIndent or less.
    if (indent <= advisorIndent) {
      inAdvisor = false;
      // Re-evaluate this line against `hints:` bounds on next iteration.
      // If this line is still deeper than hintsIndent, it's a sibling of advisor.
      // Current loop iteration ends; the next line is checked fresh.
      continue;
    }

    if (/^dismissed:\s*true\b/.test(trimmed)) return true;
  }
  return false;
}

function readDismissed() {
  const ymlPath = path.join(process.cwd(), '.feature-flow.yml');
  try {
    const raw = fs.readFileSync(ymlPath, 'utf8');
    return parseHintsAdvisorDismissed(raw);
  } catch (_) {
    return false;
  }
}

// ─── Detect model (fail-open) ─────────────────────────────────────────────────

function detectSonnet() {
  const model = process.env.CLAUDE_MODEL || '';
  if (!model) return null; // undetectable — fail-open
  return /sonnet/i.test(model);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const settings = readSettings();
  const result = {
    sonnet: detectSonnet(),
    header_present: detectHeaderPresent(settings),
    dismissed: readDismissed(),
  };
  process.stdout.write(JSON.stringify(result) + '\n');
}

module.exports = {
  getSettingsPath,
  readSettings,
  detectHeaderPresent,
  readDismissed,
  detectSonnet,
  parseHintsAdvisorDismissed,
};

if (require.main === module) {
  try {
    main();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    process.stderr.write(`[feature-flow] check-advisor error: ${detail}\n`);
    process.stdout.write(JSON.stringify({ sonnet: null, header_present: false, dismissed: false }) + '\n');
  }
  process.exit(0);
}
