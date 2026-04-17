#!/usr/bin/env node
'use strict';

/**
 * advisor-hint.js — SessionStart hook
 *
 * Runs on every session start. Checks six gate conditions; if all pass,
 * writes one banner line to stdout and updates the daily rate-limiter.
 *
 * Gate conditions (ALL must be true to show hint):
 *   1. .feature-flow.yml exists in cwd (this is a feature-flow project)
 *   2. advisor.enabled is not explicitly false in .feature-flow.yml
 *   3. No SUPPORTED_ADVISOR_HEADERS entry found in settings.json ANTHROPIC_BETA
 *   4. hints.advisor.dismissed is not true in .feature-flow.yml
 *   5. Active model is Sonnet, or undetectable (fail-open)
 *   6. Hint was not already shown today (rate limiter: once per calendar day)
 *
 * Detection helpers (getSettingsPath, readSettings, detectHeaderPresent,
 * parseHintsAdvisorDismissed, detectSonnet) are imported from check-advisor.js
 * to avoid duplication.
 *
 * Always exits 0 — a hook failure must never block a session start.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Resolve CLAUDE_PLUGIN_ROOT for the check-advisor / advisor-headers imports
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '..', '..');
const checkAdvisorPath = path.join(pluginRoot, 'skills', 'settings', 'scripts', 'check-advisor.js');
const {
  readSettings,
  detectHeaderPresent,
  parseHintsAdvisorDismissed,
  detectSonnet,
} = require(checkAdvisorPath);

// ─── Local helpers ────────────────────────────────────────────────────────────

function readYml() {
  const p = path.join(process.cwd(), '.feature-flow.yml');
  try { return fs.readFileSync(p, 'utf8'); }
  catch (_) { return null; }
}

function isAdvisorEnabled(ymlContent) {
  if (!ymlContent) return false;
  // Treat `advisor.enabled: false` as explicit opt-out. Absence = enabled (default).
  return !/^advisor:\s*\n(?:[ \t]+.*\n)*?[ \t]+enabled:\s*false\b/m.test(ymlContent);
}

function isSonnetOrUnknown() {
  // detectSonnet returns true | false | null. `null` = undetectable = fail-open.
  const sonnet = detectSonnet();
  return sonnet !== false;
}

function getHintStatePath() {
  return path.join(os.homedir(), '.feature-flow', 'hint-state.json');
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function wasShownToday() {
  try {
    const raw = fs.readFileSync(getHintStatePath(), 'utf8');
    const state = JSON.parse(raw);
    return state.last_advisor_hint === todayStr();
  } catch (_) {
    return false;
  }
}

function markShownToday() {
  const p = getHintStatePath();
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (_) { existing = {}; }
    existing.last_advisor_hint = todayStr();
    fs.writeFileSync(p, JSON.stringify(existing), 'utf8');
  } catch (_) {
    // Non-fatal — state update failure should not block the session
  }
}

// ─── Main gate function ───────────────────────────────────────────────────────

function shouldShowAdvisorHint() {
  const yml = readYml();
  if (!yml) return false;                                      // Condition 1
  if (!isAdvisorEnabled(yml)) return false;                    // Condition 2
  if (detectHeaderPresent(readSettings())) return false;       // Condition 3
  if (parseHintsAdvisorDismissed(yml)) return false;           // Condition 4
  if (!isSonnetOrUnknown()) return false;                      // Condition 5
  if (wasShownToday()) return false;                           // Condition 6
  return true;
}

module.exports = { shouldShowAdvisorHint };

// ─── Script entrypoint ────────────────────────────────────────────────────────

function main() {
  if (!shouldShowAdvisorHint()) return;

  console.log(
    '[feature-flow] Tip: enable the advisor beta header for a quality boost on complex tasks. ' +
    'Run `feature-flow:settings advisor` for details, or ' +
    '`feature-flow:settings advisor dismiss` to stop this tip.'
  );
  markShownToday();
}

try {
  main();
} catch (e) {
  const detail = e instanceof Error ? e.message : String(e);
  process.stderr.write(`[feature-flow] advisor-hint hook error: ${detail}\n`);
}
// Always exit 0 — this hook is advisory only.
process.exit(0);
