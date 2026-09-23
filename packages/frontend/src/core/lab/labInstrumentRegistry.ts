import type { LabDevice } from './devicePorts';
import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';

export class LabInstrumentRegistry {
  private readonly devices = new Map<string, LabDevice>();
  constructor(private readonly runtime: LabRuntime) {}

  register(device: LabDevice): void {
    const id = device.identity.deviceId;
    if (this.devices.has(id)) throw new Error(`Device already registered: ${id}`);
    this.devices.set(id, device);
    emitLabEvidence(this.runtime, {
      type: 'DEVICE_REGISTERED', modelId: 'D140_INSTRUMENT_REGISTRY', solverId: 'registry-v1', input: device.identity,
      result: device, epistemicStatus: 'HYBRID_DERIVED', evidenceClass: 'DERIVED', provenance: device.provenance,
    });
  }

  get(deviceId: string): LabDevice {
    const device = this.devices.get(deviceId);
    if (device === undefined) throw new Error(`Unknown device: ${deviceId}`);
    return device;
  }

  list(): readonly LabDevice[] { return [...this.devices.values()].sort((a, b) => a.identity.deviceId.localeCompare(b.identity.deviceId)); }
  discoverByCapability(capabilityId: string): readonly LabDevice[] {
    return this.list().filter((d) => d.capabilities.some((c) => c.capabilityId === capabilityId));
  }
}
