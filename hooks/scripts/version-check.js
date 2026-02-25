#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = '.feature-flow.yml';

function getRunningVersion() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) return null;
  return path.basename(pluginRoot);
}

function parseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function classifyDrift(stored, running) {
  if (stored.major !== running.major) return 'major';
  if (stored.minor !== running.minor) return 'minor';
  if (stored.patch !== running.patch) return 'patch';
  return null;
}

function readPluginVersion(content) {
  const match = content.match(/^plugin_version:\s*(.+)$/m);
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
}

function stampVersion(content, version) {
  if (/^plugin_version:/m.test(content)) {
    return content.replace(/^plugin_version:\s*.+$/m, `plugin_version: ${version}`);
  }
  return `plugin_version: ${version}\n${content}`;
}

function notifyDrift(storedVersion, runningVersion) {
  const stored = parseSemver(storedVersion);
  const running = parseSemver(runningVersion);
  if (!stored || !running) return;

  const drift = classifyDrift(stored, running);
  if (!drift) return;

  const label = { major: 'Major', minor: 'Minor', patch: 'Patch' }[drift];
  console.log('');
  console.log(
    `UPGRADE NOTICE: ${label} version drift detected — ` +
    `config was stamped by v${storedVersion}, now running v${runningVersion}. ` +
    `Review CHANGELOG.md for what changed.`
  );
}

function main() {
  const runningVersion = getRunningVersion();
  if (!runningVersion || !parseSemver(runningVersion)) return;

  let content;
  try {
    content = fs.readFileSync(CONFIG_FILE, 'utf8');
  } catch (e) {
    // Config file does not exist — first-time user, nothing to do.
    if (e.code === 'ENOENT') return;
    // Any other read error (EACCES, EISDIR, etc.) is unexpected — re-throw so
    // the outer catch can log it with full context.
    throw e;
  }
  const storedVersion = readPluginVersion(content);

  if (storedVersion && storedVersion !== runningVersion) {
    notifyDrift(storedVersion, runningVersion);
  }

  const updated = stampVersion(content, runningVersion);
  if (updated !== content) {
    fs.writeFileSync(CONFIG_FILE, updated, 'utf8');
  }
}

try {
  main();
} catch (e) {
  // Non-fatal: version drift detection must never block a session. Log the error
  // so it is visible in the session transcript, then exit 0 so Claude continues.
  const detail = e instanceof Error ? e.message : String(e);
  console.error(`[feature-flow] version-check hook error: ${detail}`);
}
// Always exit 0 — this hook is advisory only. A failure here must not prevent
// the session from starting or the user's prompt from being processed.
process.exit(0);
