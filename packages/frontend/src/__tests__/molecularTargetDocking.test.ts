import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createNodeDockingTransport } from '../core/discovery/molecular/dockingTransport.node';
import { detectReceptorPreparation, repositoryProxyReceptor } from '../core/discovery/molecular/receptorPreparation.node';
import {
  affinityIsAboutTarget,
  buildTargetHypothesis,
  prioritisationStatement,
  unresolvedTarget,
  type ReceptorStructure,
} from '../core/discovery/molecular/targetHypothesis';

/**
 * REAL PROTEIN DOCKING + THE MECHANISM GATE.
 *
 * This is the step from "generated a molecule" to "computationally prioritised
 * it against a target". The tests exist to keep that step honest: a real
 * docking score against a real protein is still NOT a target affinity unless
 * the target is resolved AND the docked structure is that target.
 */
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const prep = repositoryProxyReceptor(REPO_ROOT);
const dockingTransport = createNodeDockingTransport();
const dockingAvailable = dockingTransport.detect().available;
const prepAvailable = detectReceptorPreparation().available;

/** Ketamine — used ONLY as a reference structure to exercise the pipeline. */
const KETAMINE = 'CNC1(CCCCC1=O)c1ccccc1Cl';

const resolvedTarget = buildTargetHypothesis({
  targetId: 'CHEMBL:TEST', targetName: 'declared test target', biologicalSystem: 'test',
  mechanismHypothesis: 'declared for gate testing', status: 'RESOLVED', statusReason: 'test fixture',
  evidence: [{ source: 'USER_SUPPLIED', identifier: 'test', establishes: 'test' }],
  applicabilityDomain: 'test', requiredValidation: [],
});

describe('BRAMA MECHANIZMU — realny wynik dokowania to jeszcze nie powinowactwo', () => {
  const proxyReceptor: ReceptorStructure = {
    structureId: 'PDB:1VII', pdbqt: 'x', center: [0, 0, 0], boxSize: [20, 20, 20],
    relevance: 'STRUCTURAL_PROXY', provenance: 'test',
    proxyCaveat: 'real protein, not the hypothesised target',
  };
  const realTargetReceptor: ReceptorStructure = { ...proxyReceptor, relevance: 'MECHANISTICALLY_IMPLICATED', proxyCaveat: null };

  it('nierozwiązany target blokuje powinowactwo NAWET przy właściwym receptorze', () => {
    const gate = affinityIsAboutTarget(unresolvedTarget('no source configured', 'NOT_AVAILABLE'), realTargetReceptor);
    expect(gate.meaningful).toBe(false);
    expect(gate.reason).toMatch(/cannot be an affinity FOR a target that has not been established/i);
  });

  it('BIAŁKO ZASTĘPCZE blokuje powinowactwo NAWET przy rozwiązanym targecie', () => {
    const gate = affinityIsAboutTarget(resolvedTarget, proxyReceptor);
    expect(gate.meaningful).toBe(false);
    // To jest sedno: realne obliczenie na NIEWŁAŚCIWYM białku.
    expect(gate.reason).toMatch(/real protein but NOT the hypothesised target/i);
    expect(gate.reason).toMatch(/says nothing about this mechanism/i);
  });

  it('dopiero rozwiązany target ORAZ właściwy receptor otwierają bramę', () => {
    expect(affinityIsAboutTarget(resolvedTarget, realTargetReceptor).meaningful).toBe(true);
  });

  it('brak receptora to brak dokowania', () => {
    expect(affinityIsAboutTarget(resolvedTarget, null).meaningful).toBe(false);
  });

  it('zdanie o priorytetyzacji nigdy nie twierdzi aktywności', () => {
    const open = prioritisationStatement(resolvedTarget, true);
    expect(open).toMatch(/computational prioritisation, not evidence of activity/i);
    expect(open).toMatch(/not been experimentally validated/i);
    expect(open).not.toMatch(/works like|acts like|is active/i);

    const closed = prioritisationStatement(resolvedTarget, false);
    expect(closed).toMatch(/no mechanism is claimed/i);
  });
});

describe(`REALNE PRZYGOTOWANIE RECEPTORA (available=${prepAvailable})`, () => {
  if (!prepAvailable) {
    it('bez meeko/gemmi/prody przygotowanie jest jawnie zablokowane', () => {
      expect(prep.ok).toBe(false);
      if (prep.ok) return;
      expect(prep.error).toBe('BLOCKED_BY_RUNTIME');
    });
    return;
  }

  it('realna struktura 1VII z repozytorium daje realny receptor PDBQT', () => {
    expect(prep.ok).toBe(true);
    if (!prep.ok) return;
    expect(prep.receptor.structureId).toBe('PDB:1VII');
    // PDBQT jest realnym plikiem receptora, nie zaślepką.
    expect(prep.receptor.pdbqt.length).toBeGreaterThan(5000);
    expect(prep.receptor.pdbqt).toMatch(/^ATOM|^HETATM/m);
    expect(prep.engine).toMatch(/Meeko/);
  }, 900_000);

  it('środek pudełka jest LICZONY ze struktury, nie wpisany', () => {
    if (!prep.ok) return;
    // 1VII jest wyśrodkowane blisko początku układu — wartości pochodzą z pliku.
    expect(prep.receptor.center.every((c) => Number.isFinite(c))).toBe(true);
    expect(prep.receptor.boxSize.every((b) => b > 0 && b <= 40)).toBe(true);
    expect(prep.receptor.provenance).toMatch(/heavy atoms/);
  });

  it('receptor zastępczy MUSI nieść zastrzeżenie, inaczej jest odrzucony', () => {
    if (!prep.ok) return;
    expect(prep.receptor.relevance).toBe('STRUCTURAL_PROXY');
    expect(prep.receptor.proxyCaveat).toMatch(/NOT the mechanistic target/i);
    expect(prep.receptor.proxyCaveat).toMatch(/not evidence about any hypothesised mechanism/i);
  });
});

describe(`REALNE DOKOWANIE DO REALNEGO BIAŁKA (docking=${dockingAvailable} prep=${prepAvailable})`, () => {
  if (!dockingAvailable || !prepAvailable || !prep.ok) {
    it('bez silników ścieżka dokowania do białka jest jawnie zablokowana', () => {
      expect(dockingAvailable && prepAvailable && prep.ok).toBe(false);
    });
    return;
  }

  const receptor = prep.receptor;

  it('ketamina dokuje się do REALNEGO białka 1VII i daje realny wynik', () => {
    const result = dockingTransport.dock({
      ligandSmiles: KETAMINE,
      receptor: {
        kind: 'REAL_RECEPTOR', pdbqt: receptor.pdbqt, provenance: receptor.provenance,
        center: receptor.center, boxSize: receptor.boxSize,
      },
      seed: 42,
      exhaustiveness: 8,
      nPoses: 5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Realny wynik Vina wobec realnego białka — ujemna energia wiązania.
    expect(result.bestAffinityKcalMol).toBeLessThan(0);
    expect(result.bestAffinityKcalMol).toBeGreaterThan(-20);
    expect(result.poses.length).toBeGreaterThan(0);
    expect(result.engine).toMatch(/Vina/);
    // KLUCZOWE: worker potwierdza, że to NIE był zastępnik małocząsteczkowy.
    expect(result.receptorKind).toBe('REAL_RECEPTOR');
  }, 900_000);

  it('ale ten realny wynik NIE jest powinowactwem do mechanizmu ketaminy', () => {
    // Struktura jest realna, obliczenie jest realne — a mimo to brama zamknięta,
    // bo 1VII nie jest mechanistycznym celem ketaminy.
    const gate = affinityIsAboutTarget(resolvedTarget, receptor);
    expect(gate.meaningful).toBe(false);
    expect(gate.reason).toMatch(/1VII/);
  });
});
