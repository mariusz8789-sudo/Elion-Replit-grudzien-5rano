import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { DockingDetect, DockingRequest, DockingResult, DockingTransport } from './dockingTransport';

/**
 * NODE TRANSPORT for AutoDock Vina. Node-only for the same reason as the RDKit
 * and ADMET transports: it imports `node:child_process` and must never reach
 * the browser bundle.
 *
 * It drives `packages/backend/src/compute/dock_worker.py` — the same worker
 * `compute/dockingAdapter.mjs` uses — so Vina is not duplicated here.
 *
 * Docking is the most expensive engine in this repository: a single pose search
 * takes seconds even at low exhaustiveness. Batch size, exhaustiveness and pose
 * count are therefore all bounded, and identical requests are memoised.
 */
const WORKER_RELATIVE = '../../../../../backend/src/compute/dock_worker.py';

function pythonExecutable(): string {
  return process.env.GENESIS_DOCKING_PYTHON ?? process.env.GENESIS_PYTHON ?? 'python3';
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

export interface NodeDockingTransportOptions {
  timeoutMs?: number;
  /** Scratch directory for Vina artefacts. */
  outDir?: string;
}

export function createNodeDockingTransport(options: NodeDockingTransportOptions = {}): DockingTransport {
  const timeoutMs = options.timeoutMs ?? 300_000;
  let detectCache: DockingDetect | null = null;
  const dockCache = new Map<string, DockingResult>();

  function detect(): DockingDetect {
    if (detectCache !== null) return detectCache;
    try {
      const reply = invoke({ cmd: 'detect' }, 120_000) as {
        ok?: boolean; vinaVersion?: string; meekoVersion?: string; engine?: string; reason?: string; error?: string;
      };
      detectCache = reply?.ok === true
        ? {
          available: true,
          engine: reply.engine ?? `AutoDock Vina ${reply.vinaVersion ?? '?'}`,
          vinaVersion: reply.vinaVersion ?? '?',
          meekoVersion: reply.meekoVersion ?? '?',
        }
        : { available: false, reason: reply?.reason ?? reply?.error ?? 'docking_unavailable' };
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      detectCache = { available: false, reason: `vina/meeko unavailable in this runtime: ${message.slice(0, 160)}` };
    }
    return detectCache;
  }

  return {
    transportId: 'node-child-process',
    detect,

    dock(request: DockingRequest): DockingResult {
      const detected = detect();
      if (!detected.available) return { ok: false, error: 'BLOCKED_BY_RUNTIME', reason: detected.reason };

      const receptor = request.receptor;
      if (receptor.kind === 'REAL_RECEPTOR' && (receptor.pdbqt ?? '').length === 0) {
        return { ok: false, error: 'INVALID_INPUT', reason: 'A receptor declared REAL_RECEPTOR must carry PDBQT content.' };
      }
      if (receptor.kind === 'SMALL_MOLECULE_STANDIN' && (receptor.smiles ?? '').length === 0) {
        return { ok: false, error: 'INVALID_INPUT', reason: 'A stand-in receptor must carry SMILES.' };
      }

      const seed = request.seed ?? 42;
      const exhaustiveness = Math.min(request.exhaustiveness ?? 8, 32);
      const nPoses = Math.min(request.nPoses ?? 5, 20);
      const cacheKey = JSON.stringify([request.ligandSmiles, receptor.kind, receptor.pdbqt ?? receptor.smiles, seed, exhaustiveness, nPoses]);

      const cached = dockCache.get(cacheKey);
      if (cached !== undefined) return cached;

      let computed: DockingResult;
      try {
        const reply = invoke({
          cmd: 'dock',
          ligandSmiles: request.ligandSmiles,
          receptorSmiles: receptor.kind === 'SMALL_MOLECULE_STANDIN' ? receptor.smiles : undefined,
          receptorPdbqt: receptor.kind === 'REAL_RECEPTOR' ? receptor.pdbqt : undefined,
          boxSize: [22, 22, 22],
          exhaustiveness,
          nPoses,
          seed,
          outDir: options.outDir ?? path.resolve(__dirname, '../../../../../../.genesis-dock'),
        }, timeoutMs) as {
          ok?: boolean; bestAffinityKcalMol?: number; poses?: unknown; receptorKind?: string; error?: string;
        };

        if (reply?.ok !== true || typeof reply.bestAffinityKcalMol !== 'number') {
          computed = { ok: false, error: 'EXECUTION_FAILED', reason: reply?.error ?? 'dock_failed' };
        } else {
          const poses = Array.isArray(reply.poses)
            ? reply.poses
              .map((p, i) => {
                const affinity = typeof p === 'number' ? p
                  : typeof p === 'object' && p !== null && typeof (p as { affinityKcalMol?: unknown }).affinityKcalMol === 'number'
                    ? (p as { affinityKcalMol: number }).affinityKcalMol
                    : null;
                return affinity === null ? null : { affinityKcalMol: affinity, rank: i + 1 };
              })
              .filter((p): p is { affinityKcalMol: number; rank: number } => p !== null)
            : [];
          computed = {
            ok: true,
            bestAffinityKcalMol: reply.bestAffinityKcalMol,
            poses,
            // The worker reports what it actually docked against; we do not
            // assume the caller's declaration was honoured.
            receptorKind: reply.receptorKind === 'small_molecule_standin' ? 'SMALL_MOLECULE_STANDIN' : receptor.kind,
            engine: detected.engine,
            seed,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
        computed = { ok: false, error: 'EXECUTION_FAILED', reason: message.slice(0, 160) };
      }

      dockCache.set(cacheKey, computed);
      return computed;
    },
  };
}
