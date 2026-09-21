import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDigitalTwin } from './GenesisCityDigitalTwin.js';
import { GenesisDisasterEngine } from './GenesisDisasterEngine.js';
import { CityDisasterController, traceChecksum } from './CityDisasterController.js';
const src = (f: string) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
describe('digital twin', () => {
  it('deterministic serialize', () => expect(createDigitalTwin(7, 'WARSAW').serialize()).toBe(createDigitalTwin(7, 'WARSAW').serialize()));
  it('neighbors bounded', () => { const t = createDigitalTwin(7, 'WARSAW'); expect(t.neighbors(0).every(n => n >= 0)).toBe(true); });
});
describe('disaster engine', () => {
  it('epidemic deterministic snapshot', () => { const g = createDigitalTwin(7, 'WARSAW').grid;
    const run = () => { const e = new GenesisDisasterEngine(g, 'EPIDEMIC'); for (let i = 0; i < 10; i++) e.step(1, { seir: { beta: 0.3, sigma: 0.2, gamma: 0.1, mobility: 0.05 } }); return e.snapshot(); };
    expect(run().metrics.infected).toBe(run().metrics.infected); });
  it('flood inundates', () => { const g = createDigitalTwin(7, 'WARSAW').grid; const e = new GenesisDisasterEngine(g, 'FLOOD');
    e.step(1, { flood: { inflowCell: 500, inflowRate: 100, roughness: 1 } }); for (let i = 0; i < 10; i++) e.step(1, { flood: { inflowCell: 500, inflowRate: 0, roughness: 1 } });
    expect(e.snapshot().metrics.inundatedCells).toBeGreaterThan(0); });
  it('blast zones present & labeled', () => { const g = createDigitalTwin(7, 'DUBAI').grid; const e = new GenesisDisasterEngine(g, 'BLAST'); const s = e.snapshot(); expect(s.metrics.glassM).toBeGreaterThan(s.metrics.severeM); expect(s.dataLabel).toBe('DISASTER_SCENARIO'); });
});
describe('controller', () => {
  it('traceChecksum stable', () => expect(traceChecksum('abc')).toBe(traceChecksum('abc')));
  it('frames append & checksum chain', () => { const t = createDigitalTwin(7, 'WARSAW'); const c = new CityDisasterController(t, 'EPIDEMIC');
    c['engine'].step(1, { seir: { beta: 0.3, sigma: 0.2, gamma: 0.1, mobility: 0.05 } }); c['pushFrame'](); c['pushFrame']();
    expect(c.getFrames().length).toBe(2); expect(c.getTraceChecksum()).toMatch(/^[0-9a-f]{8}$/); c.dispose(); });
});
describe('iron rules', () => {
  for (const f of ['GenesisCityDigitalTwin.ts', 'GenesisDisasterEngine.ts', 'CityDisasterController.ts']) it(f + ' no Math.random/Date.now', () => { const s = src(f); expect(s).not.toContain('Math.random('); expect(s).not.toContain('Date.now('); });
});
