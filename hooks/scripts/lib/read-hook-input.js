'use strict';

const fs = require('fs');

/**
 * Reads the hook payload from stdin (fd 0) synchronously and parses it as JSON.
 * Fails open: returns null on any read error, empty stdin, or invalid JSON —
 * callers must treat null as "no usable payload, exit 0 silently."
 * (One deliberate exception: quality-gate.js treats null as
 * stop_hook_active=false and runs its checks normally, since its Stop-hook
 * role does not depend on stdin content beyond that flag.)
 */
function readHookInput() {
  let raw;
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = { readHookInput };
