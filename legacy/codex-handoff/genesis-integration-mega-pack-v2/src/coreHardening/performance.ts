/** ADAPTER/VALIDATOR UTILITY (fix area 6). */
export interface PerformanceSlo {
  id: string;
  metric: "FPS" | "FRAME_MS" | "LATENCY_MS" | "RAM_MB" | "VRAM_MB" | "ENTITY_COUNT" | "ASSET_MB";
  operator: "<=" | ">=";
  target: number;
  targetHardware: string;
}

export interface PerformanceSample {
  sloId: string;
  value: number;
  timestamp: string;
}

export interface SloResult {
  sloId: string;
  pass: boolean;
  target: number;
  actual: number;
}

export function evaluateSlo(slo: PerformanceSlo, sample: PerformanceSample): SloResult {
  if (sample.sloId !== slo.id) throw new Error("SLO/sample id mismatch.");
  const pass = slo.operator === "<=" ? sample.value <= slo.target : sample.value >= slo.target;
  return { sloId: slo.id, pass, target: slo.target, actual: sample.value };
}
