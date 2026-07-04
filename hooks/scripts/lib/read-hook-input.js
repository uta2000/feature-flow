'use strict';

const fs = require('fs');

/**
 * Reads the hook payload from stdin (fd 0) synchronously and parses it as JSON.
 * Fails open: returns null on any read error, empty stdin, or invalid JSON —
 * callers must treat null as "no usable payload, exit 0 silently."
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
