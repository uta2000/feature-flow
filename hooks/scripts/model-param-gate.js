#!/usr/bin/env node
'use strict';

const { readHookInput } = require('./lib/read-hook-input');

function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
}

function main() {
  const payload = readHookInput();
  if (!payload) process.exit(0);

  const toolInput = payload.tool_input || {};
  if (!toolInput.subagent_type) process.exit(0);
  if (toolInput.model) process.exit(0);

  deny(
    `Task/Agent dispatch to "${toolInput.subagent_type}" is missing explicit \`model\` parameter. ` +
    `Set model: "haiku" (Explore), "sonnet" (general-purpose/Plan), or "opus" (creative phases). ` +
    `See references/tool-api.md.`
  );
  process.exit(0);
}

try {
  main();
} catch (err) {
  try { process.stderr.write('[model-param-gate] fail-open due to internal error: ' + (err && err.message) + '\n'); } catch (_) { /* stderr unavailable */ }
  process.exit(0);
}
