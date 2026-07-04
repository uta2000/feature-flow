#!/usr/bin/env node
'use strict';

const { readHookInput } = require('./lib/read-hook-input');

function advise(context) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: context,
    },
  }));
}

function main() {
  const payload = readHookInput();
  if (!payload) process.exit(0);

  const toolInput = payload.tool_input || {};
  const filePath = toolInput.file_path || '';
  if (!/plans\/.*\.md/.test(filePath)) process.exit(0);

  advise(
    '[feature-flow] Plan file written. Run verify-plan-criteria before proceeding. ' +
    '(YOLO mode: this step runs automatically as part of the lifecycle — continue without pausing.)'
  );
  process.exit(0);
}

try {
  main();
} catch (err) {
  try { process.stderr.write('[plan-reminder] fail-open due to internal error: ' + (err && err.message) + '\n'); } catch (_) { /* stderr unavailable */ }
  process.exit(0);
}
