import type { TwinSyncResult } from './digitalTwinSynchronizer';
export interface MirrorTwinLabPort {
  syncMeasurement(twinId: string, channelId: string, sync: TwinSyncResult): void;
}
export function publishTwinSync(port: MirrorTwinLabPort, twinId: string, channelId: string, sync: TwinSyncResult): void {
  port.syncMeasurement(twinId, channelId, sync);
}
