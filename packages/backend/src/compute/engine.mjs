/**
 * Backendowy silnik obliczeniowy (Priorytet 1 + 2). Wykonuje modele z rejestru
 * z pełną walidacją, jednostkami, ostrzeżeniami, zakresem ważności i
 * PROWIENIENCJĄ — każdy przebieg jest audytowalny i odtwarzalny.
 *
 * Kontrakt „Scientific Run" (schemat przebiegu):
 *   runId, modelId, modelVersion, domain, status, inputs, outputs (z jednostkami),
 *   units, warnings, validity, assumptions, provenance, deterministic, seed,
 *   startedAt, finishedAt, durationMs, engine.
 *
 * Determinizm: obecne modele nie używają RNG, więc `seed` jest zapisywany, ale
 * nie zmienia wyniku (deterministic:true). Modele stochastyczne (gdy powstaną)
 * dostaną `stochastic:true` w rejestrze i będą honorować seed — silnik już go
 * przekazuje, więc kontrakt jest gotowy.
 */

import { randomUUID } from 'node:crypto';
import { getModel, listModels, modelMetadata } from './registry.mjs';

export const ENGINE_VERSION = '1.0.0';

export { listModels, getModel, modelMetadata };

/**
 * Waliduje wejścia względem deklaracji modelu.
 * Zwraca { ok, values } albo { ok:false, error, message }.
 * Zasady: nieznany klucz → odrzucenie; brak → wartość domyślna; wartość musi być
 * liczbą skończoną w zakresie [min,max].
 */
export function validateInputs(model, rawInputs) {
  const input = rawInputs && typeof rawInputs === 'object' && !Array.isArray(rawInputs) ? rawInputs : {};
  const declared = new Map(model.inputs.map((i) => [i.id, i]));

  for (const key of Object.keys(input)) {
    if (!declared.has(key)) {
      return { ok: false, error: 'unknown_parameter', message: `Nieznany parametr „${key}" dla modelu ${model.id}.` };
    }
  }

  const values = {};
  for (const spec of model.inputs) {
    const provided = input[spec.id];
    const v = provided === undefined ? spec.default : provided;
    if (spec.type === 'string') {
      if (typeof v !== 'string') {
        return { ok: false, error: 'invalid_value', message: `Parametr „${spec.id}" musi być tekstem.` };
      }
      const s = v.trim();
      if (!s) return { ok: false, error: 'invalid_value', message: `Parametr „${spec.id}" nie może być pusty.` };
      if (s.length > (spec.maxLength ?? 200)) {
        return { ok: false, error: 'out_of_range', message: `„${spec.id}" przekracza ${spec.maxLength ?? 200} znaków.` };
      }
      values[spec.id] = s;
      continue;
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { ok: false, error: 'invalid_value', message: `Parametr „${spec.id}" musi być skończoną liczbą.` };
    }
    if (spec.min !== undefined && v < spec.min) {
      return { ok: false, error: 'out_of_range', message: `„${spec.id}" = ${v} < min ${spec.min} ${spec.unit}.` };
    }
    if (spec.max !== undefined && v > spec.max) {
      return { ok: false, error: 'out_of_range', message: `„${spec.id}" = ${v} > max ${spec.max} ${spec.unit}.` };
    }
    values[spec.id] = v;
  }
  return { ok: true, values };
}

/**
 * Wykonuje model. Zwraca pełny rekord „Scientific Run" (patrz wyżej).
 * Nie rzuca dla błędów walidacji/wykonania — zwraca run ze status:'error',
 * żeby API i persystencja miały jednolity, audytowalny kształt.
 */
export function runModel(modelId, rawInputs, opts = {}) {
  const startedAt = Date.now();
  const runId = randomUUID();
  const model = getModel(modelId);

  const base = {
    runId,
    modelId,
    engine: `genesis-compute@${ENGINE_VERSION}`,
    seed: opts.seed ?? null,
    startedAt,
  };

  if (!model) {
    return { ...base, status: 'error', error: 'unknown_model', message: `Brak modelu „${modelId}".`, finishedAt: Date.now(), durationMs: Date.now() - startedAt };
  }

  const valid = validateInputs(model, rawInputs);
  if (!valid.ok) {
    return {
      ...base, modelVersion: model.version, domain: model.domain,
      status: 'rejected', error: valid.error, message: valid.message,
      finishedAt: Date.now(), durationMs: Date.now() - startedAt,
    };
  }

  // Opcjonalna walidacja domenowa modelu (np. poprawność wzoru chemicznego).
  if (typeof model.validate === 'function') {
    const domainCheck = model.validate(valid.values);
    if (domainCheck && domainCheck.ok === false) {
      return {
        ...base, modelVersion: model.version, domain: model.domain, inputs: valid.values,
        status: 'rejected', error: domainCheck.error ?? 'invalid_input', message: domainCheck.message,
        finishedAt: Date.now(), durationMs: Date.now() - startedAt,
      };
    }
  }

  let result;
  try {
    result = model.execute(valid.values, { seed: opts.seed });
  } catch (err) {
    return {
      ...base, modelVersion: model.version, domain: model.domain, inputs: valid.values,
      status: 'error', error: 'execution_failed', message: String(err?.message ?? err),
      finishedAt: Date.now(), durationMs: Date.now() - startedAt,
    };
  }

  const units = {};
  for (const o of model.outputs) units[o.id] = o.unit;
  const finishedAt = Date.now();

  return {
    ...base,
    modelName: model.name,
    modelVersion: model.version,
    domain: model.domain,
    status: 'ok',
    deterministic: !model.stochastic,
    inputs: valid.values,
    outputs: result.outputs,
    units,
    warnings: result.warnings ?? [],
    validity: model.validity,
    assumptions: model.assumptions,
    provenance: model.provenance,
    finishedAt,
    durationMs: finishedAt - startedAt,
  };
}
