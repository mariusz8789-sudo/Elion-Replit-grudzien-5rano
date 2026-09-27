import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  ADMET_MAX_BATCH,
  readAdmetPayload,
  type AdmetDetect,
  type AdmetPredictResult,
  type AdmetTransport,
} from './admetTransport';

/**
 * NODE TRANSPORT for ADMET-AI. Node-only for the same reason as
 * `rdkitTransport.node.ts`: it imports `node:child_process` and must never
 * reach the browser bundle.
 *
 * It drives `packages/backend/src/compute/admet_worker.py` — the same worker
 * `compute/admetAdapter.mjs` uses — so ADMET-AI is not duplicated here.
 *
 * ADMET-AI loads a Chemprop model per call, which is slow (tens of seconds).
 * That makes BATCHING and MEMOISATION structural requirements, not niceties:
 * one call for a whole batch, and repeated SMILES answered from cache.
 */
const WORKER_RELATIVE = '../../../../../backend/src/compute/admet_worker.py';

function pythonExecutable(): string {
  return process.env.GENESIS_ADMET_PYTHON ?? process.env.GENESIS_PYTHON ?? 'python3';
}

function invoke(request: unknown, timeoutMs: number): unknown {
  const out = execFileSync(pythonExecutable(), [path.resolve(__dirname, WORKER_RELATIVE), JSON.stringify(request)], {
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

export interface NodeAdmetTransportOptions {
  /** ADMET-AI needs real time to load its model; default is generous but bounded. */
  timeoutMs?: number;
}

export function createNodeAdmetTransport(options: NodeAdmetTransportOptions = {}): AdmetTransport {
  const timeoutMs = options.timeoutMs ?? 600_000;
  let detectCache: AdmetDetect | null = null;
  const predictionCache = new Map<string, { values: Record<string, number>; engine: string }>();

  function detect(): AdmetDetect {
    if (detectCache !== null) return detectCache;
    try {
      const reply = invoke({ cmd: 'detect' }, 120_000) as { ok?: boolean; version?: string; error?: string; reason?: string };
      detectCache = reply?.ok === true && typeof reply.version === 'string'
        ? { available: true, engine: `ADMET-AI ${reply.version}`, version: reply.version }
        : { available: false, reason: reply?.reason ?? reply?.error ?? 'admet_ai_unavailable' };
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      detectCache = { available: false, reason: `python/admet_ai unavailable in this runtime: ${message.slice(0, 160)}` };
    }
    return detectCache;
  }

  return {
    transportId: 'node-child-process',
    detect,

    predict(smilesList: readonly string[]): AdmetPredictResult {
      const detected = detect();
      if (!detected.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: detected.reason };

      const unique = [...new Set(smilesList.filter((s) => typeof s === 'string' && s.length > 0))].sort();
      if (unique.length === 0) return { ok: false, error: 'INVALID_INPUT', reason: 'no SMILES supplied' };

      const bySmiles: Record<string, { values: Record<string, number>; engine: string }> = {};
      const missing = unique.filter((smiles) => {
        const cached = predictionCache.get(smiles);
        if (cached === undefined) return true;
        bySmiles[smiles] = cached;
        return false;
      });

      // One worker call per batch: the model load dominates, so N calls for N
      // molecules would be N model loads.
      for (let offset = 0; offset < missing.length; offset += ADMET_MAX_BATCH) {
        const chunk = missing.slice(offset, offset + ADMET_MAX_BATCH);
        try {
          const reply = invoke({ cmd: 'predict', smiles: chunk }, timeoutMs) as {
            ok?: boolean; predictions?: unknown; version?: string; error?: string;
          };
          if (reply?.ok !== true) {
            return { ok: false, error: 'EXECUTION_FAILED', reason: reply?.error ?? 'admet_predict_failed' };
          }
          const parsed = readAdmetPayload(reply.predictions, detected.engine);
          for (const [smiles, prediction] of Object.entries(parsed)) {
            predictionCache.set(smiles, prediction);
            bySmiles[smiles] = prediction;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
          return { ok: false, error: 'EXECUTION_FAILED', reason: message.slice(0, 160) };
        }
      }

      return { ok: true, bySmiles, engine: detected.engine };
    },
  };
}
