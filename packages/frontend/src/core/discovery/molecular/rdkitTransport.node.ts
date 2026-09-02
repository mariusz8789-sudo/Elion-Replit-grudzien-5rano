import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readDescriptorPayload, type RdkitDescribe, type RdkitDetect, type RdkitTransport } from './rdkitTransport';

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

  return {
    transportId: 'node-child-process',

    detect(): RdkitDetect {
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
    },

    describe(smiles: string): RdkitDescribe {
      const detected = this.detect();
      if (!detected.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: detected.reason };
      try {
        const reply = invoke({ cmd: 'descriptors', smiles: String(smiles ?? '') }, timeoutMs) as {
          ok?: boolean; data?: unknown; engine?: string; error?: string;
        };
        if (reply?.ok !== true) return { ok: false, error: 'INVALID_SMILES', reason: reply?.error ?? 'rdkit_rejected_input' };
        const data = readDescriptorPayload(reply.data);
        if (data === null) return { ok: false, error: 'EXECUTION_FAILED', reason: 'worker returned an unreadable descriptor payload' };
        return { ok: true, data, engine: reply.engine ?? detected.engine };
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
        return { ok: false, error: 'EXECUTION_FAILED', reason: message.slice(0, 160) };
      }
    },
  };
}
