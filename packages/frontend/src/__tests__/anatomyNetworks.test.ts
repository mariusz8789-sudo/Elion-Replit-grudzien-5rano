import { describe, expect, it } from 'vitest';
import { createHumanDigitalTwinManifest } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { ANATOMY_NETWORK_BUILDERS, buildLymphaticNetwork, buildNeuralNetwork, buildVascularNetwork, validateAnatomyNetwork } from '../core/scientificWorlds/humanLab/anatomyNetworks';

/**
 * D-135 — real graph structure for vascular/neural/lymphatic networks, replacing the old "tint the
 * whole organ mesh" stand-in. These are pure data tests (no renderer, no browser needed): every edge
 * must reference a real node, span two distinct positions, and carry a positive radius, and every
 * network must be anchored to the SAME manifest the rest of the app uses (no invented body layout).
 */
const manifest = createHumanDigitalTwinManifest('HDT-net-test');

describe('D-135 anatomy networks — real graphs anchored to the canonical manifest', () => {
  it('all three networks validate: every edge is real, non-degenerate, positively sized', () => {
    for (const network of [buildVascularNetwork(manifest), buildNeuralNetwork(manifest), buildLymphaticNetwork(manifest)]) {
      const result = validateAnatomyNetwork(network);
      expect(result.errors, network.kind).toEqual([]);
      expect(result.ok, network.kind).toBe(true);
    }
  });

  it('every node is anchored to a finite, real position (no NaN, no undefined organ lookup slipping through)', () => {
    for (const network of Object.values(ANATOMY_NETWORK_BUILDERS).map((build) => build(manifest))) {
      for (const n of network.nodes) {
        expect(Number.isFinite(n.positionMeters.x), n.id).toBe(true);
        expect(Number.isFinite(n.positionMeters.y), n.id).toBe(true);
        expect(Number.isFinite(n.positionMeters.z), n.id).toBe(true);
      }
    }
  });

  it('every node and edge is epistemically MODEL — a schematic topology, never claimed as a real scan', () => {
    for (const network of Object.values(ANATOMY_NETWORK_BUILDERS).map((build) => build(manifest))) {
      expect(network.nodes.every((n) => n.epistemic === 'MODEL'), network.kind).toBe(true);
      expect(network.edges.every((e) => e.epistemic === 'MODEL'), network.kind).toBe(true);
    }
  });

  it('the vascular network actually connects the heart to both lungs and both kidneys (real topology, not a placeholder)', () => {
    const v = buildVascularNetwork(manifest);
    const reaches = (fromId: string, toId: string): boolean => {
      const seen = new Set<string>(); const stack = [fromId];
      while (stack.length) {
        const id = stack.pop()!; if (id === toId) return true; if (seen.has(id)) continue; seen.add(id);
        for (const e of v.edges) { if (e.fromId === id) stack.push(e.toId); if (e.toId === id) stack.push(e.fromId); }
      }
      return false;
    };
    expect(reaches('v:heart', 'v:left-lung')).toBe(true);
    expect(reaches('v:heart', 'v:right-lung')).toBe(true);
    expect(reaches('v:heart', 'v:left-kidney')).toBe(true);
    expect(reaches('v:heart', 'v:right-kidney')).toBe(true);
    expect(reaches('v:heart', 'v:liver')).toBe(true);
  });

  it('the neural network connects the brain down to the sacral cord through every intermediate segment', () => {
    const n = buildNeuralNetwork(manifest);
    const order = ['n:brain', 'n:cervical', 'n:thoracic', 'n:lumbar', 'n:sacral'];
    for (let i = 0; i < order.length - 1; i += 1) {
      expect(n.edges.some((e) => e.fromId === order[i] && e.toId === order[i + 1]), `${order[i]}->${order[i + 1]}`).toBe(true);
    }
  });

  it('the lymphatic network connects cervical nodes through the thoracic duct down to both inguinal clusters', () => {
    const l = buildLymphaticNetwork(manifest);
    const hasPath = (fromId: string, toId: string): boolean => {
      const seen = new Set<string>(); const stack = [fromId];
      while (stack.length) { const id = stack.pop()!; if (id === toId) return true; if (seen.has(id)) continue; seen.add(id); for (const e of l.edges) { if (e.fromId === id) stack.push(e.toId); if (e.toId === id) stack.push(e.fromId); } }
      return false;
    };
    expect(hasPath('l:cervical', 'l:inguinal-l')).toBe(true);
    expect(hasPath('l:cervical', 'l:inguinal-r')).toBe(true);
  });

  it('is deterministic: two builds from the same manifest are equal by value', () => {
    expect(buildVascularNetwork(manifest)).toEqual(buildVascularNetwork(manifest));
    expect(buildNeuralNetwork(manifest)).toEqual(buildNeuralNetwork(manifest));
    expect(buildLymphaticNetwork(manifest)).toEqual(buildLymphaticNetwork(manifest));
  });

  it('validateAnatomyNetwork rejects a dangling edge, a zero-length edge and a non-positive radius', () => {
    const base = buildVascularNetwork(manifest);
    const dangling = validateAnatomyNetwork({ ...base, edges: [...base.edges, { id: 'bad', fromId: 'v:heart', toId: 'v:does-not-exist', label: 'x', radiusMeters: 0.01, epistemic: 'MODEL' }] });
    expect(dangling.ok).toBe(false);
    expect(dangling.errors.some((e) => e.includes('EDGE_UNKNOWN_TO'))).toBe(true);

    const zeroLength = validateAnatomyNetwork({ ...base, edges: [{ id: 'bad', fromId: 'v:heart', toId: 'v:heart', label: 'x', radiusMeters: 0.01, epistemic: 'MODEL' }] });
    expect(zeroLength.ok).toBe(false);
    expect(zeroLength.errors.some((e) => e.includes('EDGE_ZERO_LENGTH'))).toBe(true);

    const badRadius = validateAnatomyNetwork({ ...base, edges: [{ ...base.edges[0], radiusMeters: 0 }] });
    expect(badRadius.ok).toBe(false);
    expect(badRadius.errors.some((e) => e.includes('EDGE_NONPOSITIVE_RADIUS'))).toBe(true);
  });
});
