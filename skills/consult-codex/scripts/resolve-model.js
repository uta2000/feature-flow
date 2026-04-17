'use strict';

async function resolveModel(config, introspect) {
  if (config && typeof config.model === 'string' && config.model.length > 0) {
    return { model: config.model, source: 'config' };
  }

  let advertised = [];
  try {
    advertised = await introspect();
  } catch (err) {
    return { model: null, reason: 'model_unresolvable', detail: err && err.message };
  }

  if (!Array.isArray(advertised) || advertised.length === 0) {
    return { model: null, reason: 'model_unresolvable' };
  }

  const nonCodex = advertised.find(m => typeof m === 'string' && !m.endsWith('-codex'));
  if (nonCodex) return { model: nonCodex, source: 'introspection' };

  return { model: advertised[0], source: 'introspection' };
}

module.exports = resolveModel;
