#!/usr/bin/env node
'use strict';

/**
 * Centralized list of Anthropic beta header values that indicate the advisor
 * feature is enabled. Update this array when Anthropic renames or GAs the
 * advisor beta. Include old values for one release cycle to avoid false-positive
 * hints for users still on an older beta header.
 *
 * Update site: this file only. All scripts that need the header list import from here.
 */
const SUPPORTED_ADVISOR_HEADERS = [
  'advisor-tool-2026-03-01',
];

module.exports = { SUPPORTED_ADVISOR_HEADERS };
