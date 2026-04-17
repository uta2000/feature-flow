// skills/consult-codex/scripts/config.js
'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = '.feature-flow.yml';

const DEFAULTS = {
  enabled: false,
  model: null,
  timeout_seconds: 180,
  proactive_reviews: {
    design_doc: true,
    plan_criteria: true,
    pre_harden: true
  }
};

// Extract the raw text of a top-level `codex:` block. Returns null if absent.
function extractSection(yml) {
  const lines = yml.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^codex:\s*$/.test(lines[i])) { start = i + 1; break; }
  }
  if (start === -1) return null;
  const block = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line === '' || /^\s/.test(line)) block.push(line);
    else break;
  }
  return block.join('\n');
}

function parseBool(value) {
  if (value === undefined || value === null) return undefined;
  const v = String(value).trim().toLowerCase();
  if (v === 'true' || v === 'yes' || v === '1') return true;
  if (v === 'false' || v === 'no' || v === '0') return false;
  return undefined;
}

function parseInt10(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

// Strip inline comment, trim whitespace, and remove matched surrounding quotes.
// Only strips when both ends match the same quote type; leaves unmatched/embedded quotes alone.
function stripValue(v) {
  return v
    .replace(/\s*#.*$/, '')
    .trim()
    .replace(/^"(.*)"$|^'(.*)'$/, (_m, d, s) => d ?? s ?? '');
}

// Flat key-value parse within a section; supports simple nested maps (depth 2).
function parseSection(block) {
  const out = {};
  const lines = block.split('\n');
  let currentMap = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const twoSpace = /^  ([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(raw);
    const fourSpace = /^    ([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(raw);
    if (twoSpace) {
      const [, k, v] = twoSpace;
      if (v === '') { currentMap = {}; out[k] = currentMap; }
      else { out[k] = stripValue(v); currentMap = null; }
    } else if (fourSpace && currentMap) {
      const [, k, v] = fourSpace;
      currentMap[k] = stripValue(v);
    }
  }
  return out;
}

function load(worktreeRoot) {
  const p = path.join(worktreeRoot, CONFIG_FILE);
  if (!fs.existsSync(p)) return { ...DEFAULTS };

  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); }
  catch { return { ...DEFAULTS }; }

  const block = extractSection(raw);
  if (!block) return { ...DEFAULTS };

  let parsed;
  try { parsed = parseSection(block); }
  catch { return { ...DEFAULTS }; }

  const enabledRaw = parsed.enabled;
  const enabledParsed = parseBool(enabledRaw);
  if (enabledRaw !== undefined && enabledParsed === undefined) {
    process.stderr.write(`[consult-codex] codex.enabled value not recognized: '${enabledRaw}' — treating as disabled. Use true|false|yes|no|1|0.\n`);
  }
  const enabled = enabledParsed === true;
  const model = typeof parsed.model === 'string' ? parsed.model : DEFAULTS.model;
  const timeout_seconds = parseInt10(parsed.timeout_seconds) ?? DEFAULTS.timeout_seconds;

  const pr = parsed.proactive_reviews || {};
  const proactive_reviews = {
    design_doc:    parseBool(pr.design_doc)    ?? DEFAULTS.proactive_reviews.design_doc,
    plan_criteria: parseBool(pr.plan_criteria) ?? DEFAULTS.proactive_reviews.plan_criteria,
    pre_harden:    parseBool(pr.pre_harden)    ?? DEFAULTS.proactive_reviews.pre_harden
  };

  return { enabled, model, timeout_seconds, proactive_reviews };
}

module.exports = { load, DEFAULTS };
