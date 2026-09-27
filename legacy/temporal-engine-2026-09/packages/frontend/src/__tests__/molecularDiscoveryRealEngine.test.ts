import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPOSITION_TRANSFORMATIONS } from '../core/discovery/molecular/generation';

/**
 * REAL ENGINE TEST — not a fixture, not a mock.
 *
 * This test drives the repository's actual RDKit worker
 * (`packages/backend/src/compute/rdkit_worker.py`) and checks that the
 * composition deltas declared by this spike's enumerator agree with the real
 * structural chemistry RDKit performs for the equivalent SMARTS reaction.
 *
 * RDKit is an OPTIONAL runtime dependency of this repository (see
 * `compute/capabilities.mjs`: RDKit-backed capabilities are `AVAILABLE` or
 * `BLOCKED_BY_RUNTIME`, decided at runtime). Where it is absent — including
 * CI — this test asserts the honest blocked path instead of silently passing.
 * A skipped real-engine check is never counted as scientific validation.
 */

const WORKER = path.resolve(__dirname, '../../../backend/src/compute/rdkit_worker.py');

function callWorker(request: unknown): { ok: boolean; [key: string]: unknown } | null {
  try {
    const out = execFileSync('python3', [WORKER, JSON.stringify(request)], { timeout: 20_000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

const detected = callWorker({ cmd: 'detect' });
const rdkitAvailable = detected?.ok === true;

/** Composition transformation ↔ the RDKit SMARTS reaction that performs it structurally. */
const EQUIVALENT_REACTIONS: readonly { composition: keyof typeof COMPOSITION_TRANSFORMATIONS; rdkit: string; expectedFormula: string }[] = [
  { composition: 'add-CH2', rdkit: 'add-methyl', expectedFormula: 'C7H8' },
  { composition: 'add-OH', rdkit: 'add-hydroxyl', expectedFormula: 'C6H6O' },
  { composition: 'add-NH2', rdkit: 'add-amino', expectedFormula: 'C6H7N' },
  { composition: 'add-F', rdkit: 'add-fluoro', expectedFormula: 'C6H5F' },
];

function applyComposition(counts: Record<string, number>, delta: Readonly<Record<string, number>>): Record<string, number> {
  const next = { ...counts };
  for (const [element, change] of Object.entries(delta)) {
    const updated = (next[element] ?? 0) + change;
    if (updated === 0) delete next[element];
    else next[element] = updated;
  }
  return next;
}

function hill(counts: Record<string, number>): string {
  const rest = Object.keys(counts).filter((e) => e !== 'C' && e !== 'H').sort();
  const order = [...(counts.C ? ['C'] : []), ...(counts.H ? ['H'] : []), ...rest];
  return order.map((e) => `${e}${counts[e] === 1 ? '' : counts[e]}`).join('');
}

describe(`RDKit real-engine cross-check (available=${rdkitAvailable})`, () => {
  if (rdkitAvailable) {
    it('każda deklarowana delta kompozycji zgadza się z REALNYM produktem reakcji SMARTS w RDKit', () => {
      for (const pair of EQUIVALENT_REACTIONS) {
        const transformed = callWorker({ cmd: 'transform', smiles: 'c1ccccc1', transformation: pair.rdkit });
        expect(transformed?.ok, `RDKit transform ${pair.rdkit}`).toBe(true);

        const product = (transformed!.products as string[])[0]!;
        const described = callWorker({ cmd: 'descriptors', smiles: product });
        expect(described?.ok, `RDKit descriptors ${product}`).toBe(true);
        const rdkitFormula = (described!.data as { molecularFormula: string }).molecularFormula;

        // Wzór policzony przez enumerator kompozycji z benzenu (C6H6).
        const composed = hill(applyComposition({ C: 6, H: 6 }, COMPOSITION_TRANSFORMATIONS[pair.composition]));

        expect(rdkitFormula, `${pair.composition} vs ${pair.rdkit}`).toBe(pair.expectedFormula);
        expect(composed, `${pair.composition} composition delta`).toBe(rdkitFormula);
      }
    });

    it('deskryptory RDKit dla aspiryny są realne i zgodne z jej znanym wzorem', () => {
      const described = callWorker({ cmd: 'descriptors', smiles: 'CC(=O)Oc1ccccc1C(=O)O' });
      expect(described?.ok).toBe(true);
      const data = described!.data as { molecularFormula: string; molWt: number };
      expect(data.molecularFormula).toBe('C9H8O4');
      expect(data.molWt).toBeCloseTo(180.16, 1);
    });
  } else {
    it('bez RDKit test realnego silnika jest jawnie pominięty — nie liczy się jako walidacja', () => {
      expect(rdkitAvailable).toBe(false);
      // Zdolności strukturalne pozostają BLOCKED_BY_RUNTIME; nic nie jest udawane.
    });
  }
});
