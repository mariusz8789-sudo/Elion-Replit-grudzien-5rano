import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  readDescriptorPayload,
  type RdkitDescribe,
  type RdkitDetect,
  type RdkitSimilarity,
  type RdkitTransform,
  type RdkitTransformations,
  type RdkitTransport,
} from './rdkitTransport';

/**
 * NODE TRANSPORT — drives the repository's REAL RDKit worker directly.
 *
 * This file is Node-only ON PURPOSE and must never be imported from a
 * component or from any module the browser bundle reaches: it imports
 * `node:child_process`. Tests and Node-side scripts import it; the UI uses the
 * HTTP transport instead. Keeping it in a separate file is what makes that
 * boundary enforceable rather than a comment.
 *
 * It runs `packages/backend/src/compute/rdkit_worker.py` — the same worker
 * `compute/rdkitAdapter.mjs` uses. RDKit is an OPTIONAL runtime dependency
 * (`compute/capabilities.mjs` marks RDKit-backed capabilities AVAILABLE or
 * BLOCKED_BY_RUNTIME at runtime), so absence is a first-class, reported state.
 */
const WORKER_RELATIVE = '../../../../../backend/src/compute/rdkit_worker.py';

/** Same env contract as `compute/rdkitAdapter.mjs` — one place to point at a validated interpreter. */
function pythonExecutable(): string {
  return process.env.GENESIS_RDKIT_PYTHON ?? process.env.GENESIS_PYTHON ?? 'python3';
}

function workerPath(): string {
  return path.resolve(__dirname, WORKER_RELATIVE);
}

function invoke(request: unknown, timeoutMs: number): unknown {
  const out = execFileSync(pythonExecutable(), [workerPath(), JSON.stringify(request)], {
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

export interface NodeRdkitTransportOptions {
  /** Hard ceiling per worker call. Keeps a discovery batch bounded (ETAP 11). */
  timeoutMs?: number;
}

export function createNodeRdkitTransport(options: NodeRdkitTransportOptions = {}): RdkitTransport {
  const timeoutMs = options.timeoutMs ?? 10_000;
  let detectCache: RdkitDetect | null = null;

  /**
   * Every worker call spawns a Python process, which dominates the cost of a
   * discovery batch. RDKit is deterministic for a fixed version and these
   * commands are pure functions of their input, so identical calls are
   * memoised for the life of the transport. This changes only how many
   * processes run — never what any answer is — and a fresh transport starts
   * with an empty cache, so it cannot mask a changed engine between runs.
   */
  const describeCache = new Map<string, RdkitDescribe>();
  const transformCache = new Map<string, RdkitTransform>();
  const similarityCache = new Map<string, RdkitSimilarity>();

  function detect(): RdkitDetect {
    if (detectCache !== null) return detectCache;
    try {
      const reply = invoke({ cmd: 'detect' }, timeoutMs) as { ok?: boolean; version?: string; error?: string };
      detectCache = reply?.ok === true && typeof reply.version === 'string'
        ? { available: true, engine: `RDKit ${reply.version}`, version: reply.version }
        : { available: false, reason: reply?.error ?? 'rdkit_unavailable' };
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      detectCache = { available: false, reason: `python/rdkit unavailable in this runtime: ${message.slice(0, 160)}` };
    }
    return detectCache;
  }

  function runDescribe(smiles: string, fallbackEngine: string): RdkitDescribe {
    try {
      const reply = invoke({ cmd: 'descriptors', smiles: String(smiles ?? '') }, timeoutMs) as {
        ok?: boolean; data?: unknown; engine?: string; error?: string;
      };
      if (reply?.ok !== true) return { ok: false, error: 'INVALID_SMILES', reason: reply?.error ?? 'rdkit_rejected_input' };
      const data = readDescriptorPayload(reply.data);
      if (data === null) return { ok: false, error: 'EXECUTION_FAILED', reason: 'worker returned an unreadable descriptor payload' };
      return { ok: true, data, engine: reply.engine ?? fallbackEngine };
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      return { ok: false, error: 'EXECUTION_FAILED', reason: message.slice(0, 160) };
    }
  }

  function runTransform(smiles: string, transformation: string): RdkitTransform {
    try {
      const reply = invoke({ cmd: 'transform', smiles: String(smiles ?? ''), transformation }, timeoutMs) as {
        ok?: boolean; parentCanonical?: string; products?: unknown; transformation?: string; error?: string;
      };
      if (reply?.ok !== true || typeof reply.parentCanonical !== 'string' || !Array.isArray(reply.products)) {
        return { ok: false, error: 'INVALID_SMILES', reason: reply?.error ?? 'rdkit_rejected_transform' };
      }
      const products = reply.products.filter((p): p is string => typeof p === 'string' && p.length > 0);
      return { ok: true, parentCanonical: reply.parentCanonical, products, transformation: reply.transformation ?? transformation };
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      return { ok: false, error: 'EXECUTION_FAILED', reason: message.slice(0, 160) };
    }
  }

  function runSimilarity(smiles: string, reference: string): RdkitSimilarity {
    try {
      const reply = invoke({ cmd: 'similarity', smiles: String(smiles ?? ''), reference: String(reference ?? '') }, timeoutMs) as {
        ok?: boolean;
        tanimoto?: number;
        fingerprint?: string;
        candidateCanonical?: string;
        referenceCanonical?: string;
        scaffoldCandidate?: string;
        scaffoldReference?: string;
        sameScaffold?: boolean;
        error?: string;
      };
      if (
        reply?.ok !== true
        || typeof reply.tanimoto !== 'number'
        || typeof reply.candidateCanonical !== 'string'
        || typeof reply.referenceCanonical !== 'string'
      ) {
        return { ok: false, error: 'INVALID_SMILES', reason: reply?.error ?? 'rdkit_rejected_similarity_input' };
      }
      return {
        ok: true,
        tanimoto: reply.tanimoto,
        fingerprint: reply.fingerprint ?? 'morgan_r2_2048',
        candidateCanonical: reply.candidateCanonical,
        referenceCanonical: reply.referenceCanonical,
        scaffoldCandidate: reply.scaffoldCandidate ?? '',
        scaffoldReference: reply.scaffoldReference ?? '',
        sameScaffold: reply.sameScaffold === true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      return { ok: false, error: 'EXECUTION_FAILED', reason: message.slice(0, 160) };
    }
  }

  return {
    transportId: 'node-child-process',

    detect,

    describe(smiles: string): RdkitDescribe {
      const detected = detect();
      if (!detected.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: detected.reason };
      const cached = describeCache.get(smiles);
      if (cached !== undefined) return cached;
      const computed = runDescribe(smiles, detected.engine);
      describeCache.set(smiles, computed);
      return computed;
    },

    transform(smiles: string, transformation: string): RdkitTransform {
      const detected = detect();
      if (!detected.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: detected.reason };
      const key = `${transformation}\u0000${smiles}`;
      const cached = transformCache.get(key);
      if (cached !== undefined) return cached;
      const computed = runTransform(smiles, transformation);
      transformCache.set(key, computed);
      return computed;
    },

    transformations(): RdkitTransformations {
      const detected = detect();
      if (!detected.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: detected.reason };
      try {
        const reply = invoke({ cmd: 'transformations' }, timeoutMs) as { ok?: boolean; transformations?: unknown; error?: string };
        if (reply?.ok !== true || !Array.isArray(reply.transformations)) {
          return { ok: false, error: 'EXECUTION_FAILED', reason: reply?.error ?? 'unreadable_transformation_list' };
        }
        return { ok: true, transformations: reply.transformations.filter((t): t is string => typeof t === 'string') };
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
        return { ok: false, error: 'EXECUTION_FAILED', reason: message.slice(0, 160) };
      }
    },

    similarity(smiles: string, reference: string): RdkitSimilarity {
      const detected = detect();
      if (!detected.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: detected.reason };
      const key = `${smiles}\u0000${reference}`;
      const cached = similarityCache.get(key);
      if (cached !== undefined) return cached;
      const computed = runSimilarity(smiles, reference);
      similarityCache.set(key, computed);
      return computed;
    },
  };
}
