#!/usr/bin/env node
'use strict';

const resolveModel = require('./resolve-model');

let passed = 0, failed = 0;

async function assertAsync(name, promise) {
  try {
    const result = await promise;
    if (result) { console.log(`  ok — ${name}`); passed++; }
    else { console.log(`  FAIL — ${name}`); failed++; }
  } catch (e) {
    console.log(`  FAIL — ${name} (threw: ${e.message})`); failed++;
  }
}

async function main() {
  console.log('=== resolve-model.js ===');

  await assertAsync(
    'returns configured model verbatim',
    resolveModel({ model: 'gpt-5.2' }, async () => ['gpt-9'])
      .then(r => r.model === 'gpt-5.2' && r.source === 'config')
  );

  await assertAsync(
    'falls back to introspection when config.model is null',
    resolveModel({ model: null }, async () => ['gpt-5.2', 'gpt-5.2-codex'])
      .then(r => r.model === 'gpt-5.2' && r.source === 'introspection')
  );

  await assertAsync(
    'introspection prefers non -codex variants',
    resolveModel({ model: null }, async () => ['gpt-5.2-codex', 'gpt-5.2', 'gpt-4o'])
      .then(r => r.model === 'gpt-5.2')
  );

  await assertAsync(
    'returns null with reason when introspection yields nothing',
    resolveModel({ model: null }, async () => [])
      .then(r => r.model === null && r.reason === 'model_unresolvable')
  );

  await assertAsync(
    'returns null when introspection throws',
    resolveModel({ model: null }, async () => { throw new Error('mcp down'); })
      .then(r => r.model === null && r.reason === 'model_unresolvable')
  );

  await assertAsync(
    'returns introspection error message in detail field',
    resolveModel({ model: null }, async () => { throw new Error('mcp server unreachable'); })
      .then(r => r.model === null && r.reason === 'model_unresolvable' && r.detail === 'mcp server unreachable')
  );

  console.log(`\n=== resolve-model.js: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
