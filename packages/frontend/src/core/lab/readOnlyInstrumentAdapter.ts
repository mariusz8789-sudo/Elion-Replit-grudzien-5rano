import type { DeviceAdapter, DeviceCommand, DeviceMeasurement, LabDevice } from './devicePorts';
import { quantity, type SupportedUnit } from './physicalQuantity';

/**
 * The one concrete, non-simulated `DeviceAdapter` shape D-140 was missing: a READ-ONLY adapter that
 * turns frames delivered by some transport (a webhook body, an MQTT payload, a replayed instrument
 * log) into `DeviceMeasurement`s the canonical `HardwareInLoopBridge` -> `SensorIngestEngine` path
 * already understands. It is ported selectively from the legacy mega-pack V2
 * (`legacy/codex-handoff/.../bioRealLab/realLab.ts`: read-only capabilities, `hardwareIdentity`
 * required, validated hardware requires a calibration reference, `actuationUnavailable()`) and
 * `precisionBay/deviceShadow.ts` (`RealDeviceCommand = never`), onto the CURRENT D-140 types — no
 * second device registry, runtime or evidence path.
 *
 * What it deliberately does NOT do:
 * - it opens no socket, port or HTTP server; the transport is injected (`connect`), the same
 *   pattern `@genesis/core/connectors/sensorWebhookStream.ts::MqttTransportAdapter` uses;
 * - it never fabricates a reading: `read()` with no delivered frame throws;
 * - it never actuates: `execute()` always throws;
 * - it does not decide a frame is a physical measurement. The `sourceKind` is fixed per adapter by
 *   whoever wires a real instrument to it, and every frame must carry the raw payload, calibration
 *   reference, configuration fingerprint and provenance `SensorIngestEngine` requires.
 *
 * Wiring this adapter is NOT hardware verification. Only a run against a physical instrument can
 * move a capability to `HARDWARE_VERIFIED`.
 */
export type ReadOnlyInstrumentSourceKind = 'REAL_INSTRUMENT' | 'RECORDED_MEASUREMENT';

/** One frame exactly as a transport delivers it, before it becomes a `DeviceMeasurement`. */
export interface InstrumentFrame {
  readonly channelId: string;
  readonly value: number;
  readonly unit: SupportedUnit;
  /** ISO-8601 time the instrument (not Genesis) stamped the reading. */
  readonly sourceTimestamp: string;
  /** The instrument's own raw output for this reading, stored unchanged. */
  readonly rawPayload: string | readonly number[];
  readonly configurationFingerprint: string;
  readonly calibrationId: string;
  readonly provenance: readonly string[];
  readonly uncertainty?: number;
  readonly measurementId?: string;
}

export type FrameDecision = { readonly accepted: true; readonly channelId: string } | { readonly accepted: false; readonly reason: string };

export function actuationUnavailable(): never {
  throw new Error('READ_ONLY_INSTRUMENT: this adapter provides no device-actuation path.');
}

/** Structural checks a device must pass before it may be wired as a read-only instrument. */
export function validateReadOnlyInstrument(device: LabDevice, sourceKind: ReadOnlyInstrumentSourceKind): readonly string[] {
  const issues: string[] = [];
  const expectedMode = sourceKind === 'REAL_INSTRUMENT' ? 'LIVE_READ_ONLY' : 'REPLAY';
  if (device.executionMode !== expectedMode) issues.push(`EXECUTION_MODE_MUST_BE_${expectedMode}`);
  if (device.capabilities.length === 0) issues.push('NO_READ_CAPABILITY');
  if (device.capabilities.some((c) => c.access !== 'READ')) issues.push('WRITE_CAPABILITY_NOT_ALLOWED');
  if (!device.identity.serialIdentity?.trim()) issues.push('SERIAL_IDENTITY_REQUIRED');
  if (device.calibration === undefined) issues.push('CALIBRATION_REFERENCE_REQUIRED');
  if (device.provenance.length === 0) issues.push('DEVICE_PROVENANCE_REQUIRED');
  return issues;
}

const UNITS: ReadonlySet<string> = new Set(['K', 'C', 'Pa', 'kPa', 'MPa', 'GPa', 'kg', 'g', 'm', 'mm', 's', 'ms', 'V', 'A', 'L/min', 'mol/L', '1']);

export class ReadOnlyInstrumentAdapter implements DeviceAdapter {
  private readonly queues = new Map<string, InstrumentFrame[]>();
  private rejectedCount = 0;

  constructor(readonly device: LabDevice, readonly sourceKind: ReadOnlyInstrumentSourceKind) {
    const issues = validateReadOnlyInstrument(device, sourceKind);
    if (issues.length > 0) throw new Error(`Device ${device.identity.deviceId} cannot be a read-only instrument: ${issues.join(', ')}`);
  }

  /** Validates and buffers one delivered frame. Anything that is not a complete frame is refused, never repaired. */
  acceptFrame(payload: unknown): FrameDecision {
    const decision = this.check(payload);
    if (!decision.accepted) { this.rejectedCount += 1; return decision; }
    const frame = payload as InstrumentFrame;
    const queue = this.queues.get(frame.channelId) ?? [];
    queue.push(frame);
    this.queues.set(frame.channelId, queue);
    return decision;
  }

  /** Attach an externally owned transport. `subscribe` gets a handler and returns an unsubscribe function. */
  connect(subscribe: (handler: (payload: unknown) => void) => () => void): () => void {
    return subscribe((payload) => {
      if (typeof payload !== 'string') { this.acceptFrame(payload); return; }
      let parsed: unknown;
      try { parsed = JSON.parse(payload); } catch { this.rejectedCount += 1; return; }
      this.acceptFrame(parsed);
    });
  }

  pending(channelId: string): number { return this.queues.get(channelId)?.length ?? 0; }
  rejected(): number { return this.rejectedCount; }

  read(channelId: string, sequence: number): DeviceMeasurement {
    const frame = this.queues.get(channelId)?.shift();
    if (frame === undefined) throw new Error(`NO_FRAME_AVAILABLE: ${this.device.identity.deviceId}/${channelId} has no delivered reading; nothing is fabricated.`);
    return {
      measurementId: frame.measurementId ?? `${this.device.identity.deviceId}:${channelId}:${sequence}`,
      deviceId: this.device.identity.deviceId,
      channelId,
      quantity: quantity(frame.value, frame.unit),
      sourceTimestamp: frame.sourceTimestamp,
      ingestSequence: sequence,
      sourceKind: this.sourceKind,
      sourceMode: this.device.executionMode,
      calibrationId: frame.calibrationId,
      ...(frame.uncertainty === undefined ? {} : { uncertainty: frame.uncertainty }),
      provenance: [...frame.provenance],
      rawPayload: frame.rawPayload,
      configurationFingerprint: frame.configurationFingerprint,
    };
  }

  execute(command: DeviceCommand): never {
    void command;
    return actuationUnavailable();
  }

  private check(payload: unknown): FrameDecision {
    if (typeof payload !== 'object' || payload === null) return { accepted: false, reason: 'FRAME_NOT_AN_OBJECT' };
    const f = payload as Partial<Record<keyof InstrumentFrame, unknown>>;
    if (typeof f.channelId !== 'string') return { accepted: false, reason: 'CHANNEL_REQUIRED' };
    const capability = this.device.capabilities.find((c) => c.channelId === f.channelId);
    if (capability === undefined) return { accepted: false, reason: 'UNKNOWN_CHANNEL' };
    if (typeof f.value !== 'number' || !Number.isFinite(f.value)) return { accepted: false, reason: 'NON_FINITE_VALUE' };
    if (typeof f.unit !== 'string' || !UNITS.has(f.unit)) return { accepted: false, reason: 'UNSUPPORTED_UNIT' };
    if (quantity(f.value, f.unit as SupportedUnit).dimension !== capability.dimension) return { accepted: false, reason: 'UNIT_DIMENSION_MISMATCH' };
    if (typeof f.sourceTimestamp !== 'string' || !Number.isFinite(Date.parse(f.sourceTimestamp))) return { accepted: false, reason: 'SOURCE_TIMESTAMP_REQUIRED' };
    const raw = f.rawPayload;
    const rawOk = (typeof raw === 'string' && raw.length > 0) || (Array.isArray(raw) && raw.length > 0 && raw.every((x) => typeof x === 'number' && Number.isFinite(x)));
    if (!rawOk) return { accepted: false, reason: 'RAW_PAYLOAD_REQUIRED' };
    if (typeof f.configurationFingerprint !== 'string' || f.configurationFingerprint.trim() === '') return { accepted: false, reason: 'CONFIGURATION_FINGERPRINT_REQUIRED' };
    if (typeof f.calibrationId !== 'string' || f.calibrationId !== this.device.calibration?.calibrationId) return { accepted: false, reason: 'CALIBRATION_REFERENCE_MISMATCH' };
    if (!Array.isArray(f.provenance) || f.provenance.length === 0 || !f.provenance.every((p) => typeof p === 'string' && p.trim() !== '')) return { accepted: false, reason: 'SOURCE_PROVENANCE_REQUIRED' };
    if (f.uncertainty !== undefined && (typeof f.uncertainty !== 'number' || !Number.isFinite(f.uncertainty) || f.uncertainty < 0)) return { accepted: false, reason: 'INVALID_UNCERTAINTY' };
    if (f.measurementId !== undefined && typeof f.measurementId !== 'string') return { accepted: false, reason: 'INVALID_MEASUREMENT_ID' };
    return { accepted: true, channelId: f.channelId };
  }
}
