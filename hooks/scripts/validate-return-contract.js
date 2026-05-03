#!/usr/bin/env node
'use strict';

const fs = require('fs');

const SCHEMAS = {
  'verify-plan-criteria': {
    schema_version: 'number',
    phase: 'string',
    status: 'string',
    plan_path: 'string',
    criteria_total: 'number',
    criteria_machine_verifiable: 'number',
    criteria_added_by_agent: 'number',
    tasks_missing_criteria: 'array',
  },
  // bucket key = 'design' (phase_summaries); step name = 'design-document' (contract phase field)
  'design-document': {
    schema_version: 'number',
    phase: 'string',
    status: 'string',
    design_issue_url: 'string',
    issue_number: 'number',
    design_section_present: 'boolean',
    key_decisions: 'array',
    open_questions: 'array',
    tbd_count: 'number',
  },
  // Wave 3 phase 4 (#251) — Pattern B. Contract is written directly to a tmp
  // JSON file by the consolidator subagent (no phase_summaries bucket — the
  // four buckets are all claimed and the natural `implementation` slot will
  // collide with future Phase 6's subagent-driven-development contract).
  'verify-acceptance-criteria': {
    schema_version: 'number',
    phase: 'string',
    status: 'string',
    report_path: 'string',
    pass_count: 'number',
    fail_count: 'number',
    failed_criteria: 'array',
  },
};

const FAILED_CRITERIA_ITEM_FIELDS = ['task_id', 'criterion', 'reason'];

const VALID_STATUSES = new Set(['success', 'partial', 'failed']);

function checkField(obj, field, expectedType, errors) {
  if (!(field in obj)) {
    errors.push(`missing required field: ${field}`);
    return;
  }
  if (expectedType === 'array') {
    if (!Array.isArray(obj[field])) errors.push(`${field}: expected array, got ${typeof obj[field]}`);
  } else if (typeof obj[field] !== expectedType) {
    errors.push(`${field}: expected ${expectedType}, got ${typeof obj[field]}`);
  }
}

function validate(phaseId, obj) {
  const schema = SCHEMAS[phaseId];
  if (!schema) return [`unknown phase: ${phaseId}`];
  const errors = [];
  for (const [field, expectedType] of Object.entries(schema)) {
    checkField(obj, field, expectedType, errors);
  }
  // NOTE: phase mismatch check removed — phaseId is derived from obj.phase
  // in main(), so the comparison is always trivially equal here. If a future
  // caller adds an external --phase argument, restore this check then.
  if (!errors.length && !VALID_STATUSES.has(obj.status)) {
    errors.push(`status: expected one of success|partial|failed, got "${obj.status}"`);
  }
  if (!errors.length && Array.isArray(obj.tasks_missing_criteria)) {
    for (const item of obj.tasks_missing_criteria) {
      if (typeof item !== 'string') {
        errors.push('tasks_missing_criteria: all items must be strings');
        break;
      }
    }
  }
  if (!errors.length && phaseId === 'design-document') {
    for (const field of ['key_decisions', 'open_questions']) {
      if (Array.isArray(obj[field])) {
        for (const item of obj[field]) {
          if (typeof item !== 'string') {
            errors.push(`${field}: all items must be strings`);
            break;
          }
        }
      }
    }
  }
  if (!errors.length && phaseId === 'verify-acceptance-criteria' && Array.isArray(obj.failed_criteria)) {
    for (const item of obj.failed_criteria) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        errors.push('failed_criteria: all items must be objects');
        break;
      }
      let badField = null;
      for (const f of FAILED_CRITERIA_ITEM_FIELDS) {
        if (typeof item[f] !== 'string') { badField = f; break; }
      }
      if (badField) {
        errors.push(`failed_criteria: each item must have string fields ${FAILED_CRITERIA_ITEM_FIELDS.join(', ')} (missing or non-string: ${badField})`);
        break;
      }
    }
  }
  return errors;
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write('[validate-return-contract] usage: validate-return-contract.js <path>\n');
    process.exit(1);
  }
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); }
  catch (err) {
    process.stderr.write(`[validate-return-contract] cannot read file: ${err.message}\n`);
    process.exit(1);
  }
  let obj;
  try { obj = JSON.parse(raw); }
  catch (err) {
    process.stderr.write(`[validate-return-contract] parse error: ${err.message}\n`);
    process.exit(1);
  }
  const phaseId = obj.phase;
  if (!phaseId) {
    process.stderr.write('[validate-return-contract] missing phase field\n');
    process.exit(1);
  }
  if (!SCHEMAS[phaseId]) {
    process.stderr.write(`[validate-return-contract] unknown phase: ${phaseId}\n`);
    process.exit(1);
  }
  const errors = validate(phaseId, obj);
  if (errors.length) {
    for (const e of errors) process.stdout.write(`[validate-return-contract] ERROR: ${e}\n`);
    process.exit(1);
  }
  process.stdout.write('[validate-return-contract] OK\n');
  process.exit(0);
}

try { main(); } catch (err) {
  // Fail-closed: any unexpected error exits 1 so the orchestrator triggers
  // inline-fallback rather than silently accepting an unvalidated contract.
  try { process.stderr.write('[validate-return-contract] unexpected error: ' + (err && err.message) + '\n'); } catch (_) {}
  process.exit(1);
}
