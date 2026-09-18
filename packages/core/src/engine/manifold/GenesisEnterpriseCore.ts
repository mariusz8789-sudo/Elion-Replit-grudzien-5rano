/* Proprietary / All Rights Reserved - Genesis OS */
import type { Clock } from '../../knowledge/evidenceTypes.js';
import { sha256hex, stableStringify } from '../../knowledge/EvidenceLedger.js';
import type { ResourceSample, ResourceSampler } from '../native/SystemResourceBridge.js';
import { Genesis5DManifoldEngine, type Manifold5DEvaluation, type Manifold5DPoint } from './Genesis5DManifoldEngine.js';

/**
 * GENESIS ENTERPRISE CORE — the receipt layer over the manifold engine and the
 * machine's real telemetry.
 *
 * There are no constants here: every telemetry number comes from the injected
 * `ResourceSampler` (in production `osSampler` → os.cpus / os.totalmem /
 * os.freemem / os.loadavg), the list of executed modules is the list that
 * actually ran, and the composite checksum is sha256 over the real outputs.
 * The delivered draft of this file hard-coded "64 threads / 16384 MB /
 * SECURE_OPTIMAL"; that is exactly what this implementation refuses to do.
 */

export interface NodeTelemetry {
  readonly nodeId: string;
  readonly cpuCount: number;
  readonly totalMemBytes: number;
  readonly freeMemBytes: number;
  readonly loadAvg: readonly [number, number, number];
  /** 0..1 pressure, same formula as SystemResourceBridge.pressure(). */
  readonly pressure: number;
  readonly sampledAt: number;
  readonly source: 'os';
}

export interface EnterpriseReceipt {
  readonly receiptId: string;
  readonly label: 'GEOMETRIC_MODEL';
  readonly modulesExecuted: readonly string[];
  readonly manifold: Manifold5DEvaluation;
  readonly telemetry: NodeTelemetry;
  readonly compositeChecksum: string;
  readonly issuedAt: number;
}

export function telemetryFromSample(nodeId: string, s: ResourceSample, at: number): NodeTelemetry {
  const memPressure = 1 - s.freeMemBytes / Math.max(1, s.totalMemBytes);
  const cpuPressure = Math.min(1, s.loadAvg[0] / Math.max(1, s.cpuCount));
  return {
    nodeId,
    cpuCount: s.cpuCount,
    totalMemBytes: s.totalMemBytes,
    freeMemBytes: s.freeMemBytes,
    loadAvg: [s.loadAvg[0], s.loadAvg[1], s.loadAvg[2]],
    pressure: Math.min(1, Math.max(0, 0.5 * memPressure + 0.5 * cpuPressure)),
    sampledAt: at,
    source: 'os',
  };
}

export class GenesisEnterpriseCore {
  private readonly manifold: Genesis5DManifoldEngine;
  constructor(private readonly clock: Clock, private readonly sampler: ResourceSampler) {
    this.manifold = new Genesis5DManifoldEngine(clock);
  }

  nodeTelemetry(nodeId: string): NodeTelemetry {
    return telemetryFromSample(nodeId, this.sampler.sample(), this.clock.now());
  }

  executePipeline(nodeId: string, points: readonly Manifold5DPoint[]): EnterpriseReceipt {
    const modulesExecuted: string[] = [];
    const manifold = this.manifold.evaluatePath(points);
    modulesExecuted.push('manifold5d');
    const telemetry = this.nodeTelemetry(nodeId);
    modulesExecuted.push('telemetry');
    const compositeChecksum = sha256hex(stableStringify({ manifoldProof: manifold.cryptographicProof, telemetry: { ...telemetry, sampledAt: undefined } }));
    return {
      receiptId: 'RCP-' + compositeChecksum.slice(0, 16),
      label: 'GEOMETRIC_MODEL',
      modulesExecuted,
      manifold,
      telemetry,
      compositeChecksum,
      issuedAt: this.clock.now(),
    };
  }
}
