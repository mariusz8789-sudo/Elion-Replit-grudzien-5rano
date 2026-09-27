import type { DeviceAdapter, DeviceMeasurement } from './devicePorts';
import type { AuthorizedDeviceCommand } from './labSafetyInterlock';

/** Transport-neutral bridge. It never constructs an authorization itself. */
export class HardwareInLoopBridge {
  private readonly adapters = new Map<string, DeviceAdapter>();
  registerAdapter(adapter: DeviceAdapter): void {
    const id = adapter.device.identity.deviceId;
    if (this.adapters.has(id)) throw new Error(`Adapter already registered: ${id}`);
    this.adapters.set(id, adapter);
  }
  read(deviceId: string, channelId: string, sequence: number): DeviceMeasurement {
    const adapter = this.adapters.get(deviceId); if (adapter === undefined) throw new Error(`No adapter: ${deviceId}`);
    return adapter.read(channelId, sequence);
  }
  executeAuthorized(authorization: AuthorizedDeviceCommand): void {
    const adapter = this.adapters.get(authorization.command.deviceId); if (adapter === undefined) throw new Error(`No adapter: ${authorization.command.deviceId}`);
    adapter.execute(authorization.command);
  }
}
