import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as qm from './compute/qmAdapter.mjs';
import * as md from './compute/mdAdapter.mjs';
import * as docking from './compute/dockingAdapter.mjs';
import * as protein from './compute/proteinAdapter.mjs';
import { probeEnvironment } from './compute/scienceEnv.mjs';
import { listToolchain, getTool, TOOL_STATUS, capabilityAvailable, _resetValidation } from './campaign/toolchain.mjs';

/**
 * Ciężkie silniki naukowe (QM/MD/dokowanie/białka) na REALNYM runtime. Każdy test
 * pomijany, gdy silnik niedostępny (BLOCKED_BY_RUNTIME = uczciwy stan, nie porażka).
 * Zdolność jest DONE tylko, gdy realny przypadek referencyjny PRZECHODZI.
 */
const qmOn = qm.detect().available;
const mdOn = md.detect().available;
const dockOn = docking.detect().available;
const protOn = protein.detect().available;

describe('runtime scientific-environment audit', () => {
  test('probe returns real runtime + honest per-engine statuses', () => {
    const r = probeEnvironment();
    assert.equal(r.ok, true);
    assert.ok(r.runtime.os && r.runtime.python && r.runtime.cpuCount >= 1);
    assert.ok(r.engines.rdkit);
    // Statusy pochodzą z realnej sondy importu, nie z nazw pakietów.
    for (const e of Object.values(r.engines)) {
      assert.ok(['AVAILABLE', 'NOT_INSTALLED', 'BLOCKED_BY_RUNTIME'].includes(e.status));
    }
  });
});

describe('quantum chemistry (PySCF)', () => {
  (qmOn ? test : test.skip)('reference H2 RHF/STO-3G matches literature within tolerance', () => {
    const r = qm.referenceCase();
    assert.equal(r.ok, true);
    assert.equal(r.pass, true, `energy ${r.energyHartree} vs ${r.expected}`);
    assert.ok(Math.abs(r.energyHartree - (-1.1168)) <= 0.02);
  });
  (qmOn ? test : test.skip)('real single-point on water geometry returns physical values', () => {
    const r = qm.singlePoint({
      method: 'RHF', basis: 'sto-3g',
      atoms: [{ element: 'O', x: 0, y: 0, z: 0.1173 }, { element: 'H', x: 0, y: 0.7572, z: -0.4692 }, { element: 'H', x: 0, y: -0.7572, z: -0.4692 }],
    });
    assert.equal(r.ok, true);
    assert.ok(r.data.converged);
    assert.ok(Math.abs(r.data.energyHartree - (-74.963)) < 0.01);
    assert.ok(r.data.dipoleDebye > 1.5 && r.data.dipoleDebye < 2.0); // woda ~1.7-1.85 D w tej bazie
    assert.equal(r.meta.method, 'RHF');
  });
  test('unavailable engine is an honest BLOCKED_BY_RUNTIME, never faked', () => {
    if (qmOn) return; // środowisko ma PySCF — nic do udowodnienia tutaj
    const r = qm.referenceCase();
    assert.equal(r.ok, false);
    assert.equal(r.error, 'BLOCKED_BY_RUNTIME');
  });
});

describe('molecular dynamics (OpenMM)', () => {
  (mdOn ? test : test.skip)('reference water-box minimization lowers energy and NVT holds temperature', () => {
    const r = md.referenceCase({ steps: 200 });
    assert.equal(r.ok, true);
    assert.equal(r.pass, true);
    assert.ok(r.data.potentialEnergyMinimizedKjmol < r.data.potentialEnergyInitialKjmol, 'minimalizacja obniża energię');
    assert.ok(r.data.temperatureK > 150 && r.data.temperatureK < 450);
    assert.ok(r.data.atoms > 100);
  });
});

describe('molecular docking (AutoDock Vina + Meeko)', () => {
  (dockOn ? test : test.skip)('reference dock executes, produces poses and a finite favorable score', () => {
    const r = docking.referenceCase();
    assert.equal(r.ok, true);
    assert.equal(r.pass, true);
    assert.ok(r.nPoses >= 1);
    assert.ok(r.bestAffinityKcalMol < 0, 'realny wynik Vina (kcal/mol)');
    // Realne artefakty z hashami (nie zmyślone).
    assert.ok(r.artifacts.some((a) => a.kind === 'ligand_pdbqt' && a.sha256_16));
    assert.ok(r.artifacts.some((a) => a.kind === 'docked_pdbqt'));
  });
  (dockOn ? test : test.skip)('a real dock of a candidate ligand is deterministic with a fixed seed', () => {
    const spec = { ligandSmiles: 'c1ccccc1O', receptorSmiles: 'c1ccc2[nH]ccc2c1', center: [0, 0, 0], boxSize: [20, 20, 20], exhaustiveness: 4, nPoses: 3, seed: 7 };
    const a = docking.dock(spec);
    const b = docking.dock(spec);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(a.data.bestAffinityKcalMol, b.data.bestAffinityKcalMol, 'deterministyczne przy stałym seedzie');
  });
});

describe('protein structure ingestion (Biopython)', () => {
  (protOn ? test : test.skip)('reference PDB parses to the expected chains/residues', () => {
    const r = protein.referenceCase();
    assert.equal(r.ok, true);
    assert.equal(r.pass, true);
    assert.equal(r.report.aminoAcids, 2);
  });
  (protOn ? test : test.skip)('missing backbone atoms / waters trigger ADDITIONAL_INPUT_REQUIRED, never silent edits', () => {
    const pdb = [
      'ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00  0.00           N',
      'ATOM      2  CA  ALA A   1       1.000   0.000   0.000  1.00  0.00           C',
      'HETATM    3  O   HOH A   2       5.000   5.000   5.000  1.00  0.00           O',
      'END', '',
    ].join('\n');
    const r = protein.validatePdb(pdb);
    assert.equal(r.ok, true);
    assert.equal(r.report.needsPreparation, true);
    assert.equal(r.report.status, 'ADDITIONAL_INPUT_REQUIRED');
    assert.ok(r.report.residuesMissingBackbone.length >= 1);
  });
});

describe('toolchain registry validates engines by real reference cases', () => {
  test('AVAILABLE requires a passing reference case; ADMET/toxicity are honest gaps', () => {
    _resetValidation();
    const tc = listToolchain();
    const byId = Object.fromEntries(tc.map((t) => [t.toolId, t]));
    // ADMET/toksyczność: nigdy sfabrykowane — jawne luki zdolności.
    assert.equal(byId.admet.status, TOOL_STATUS.CAPABILITY_GAP);
    assert.equal(byId.toxicity.status, TOOL_STATUS.CAPABILITY_GAP);
    // RDKit ma być AVAILABLE (jest w tym repo wymagane).
    assert.equal(byId.rdkit.status, TOOL_STATUS.AVAILABLE);
    assert.ok(byId.rdkit.validation.every((v) => v.pass));
    // Silniki dostępne w runtime muszą mieć dowód referencyjny.
    if (qmOn) assert.equal(byId.pyscf.status, TOOL_STATUS.AVAILABLE);
    if (mdOn) assert.equal(byId.openmm.status, TOOL_STATUS.AVAILABLE);
    if (dockOn) assert.equal(byId.vina.status, TOOL_STATUS.AVAILABLE);
    if (protOn) assert.equal(byId.biopython.status, TOOL_STATUS.AVAILABLE);
    // Każdy AVAILABLE niesie dowód referencyjny.
    for (const t of tc) {
      if (t.status === TOOL_STATUS.AVAILABLE) assert.ok(t.validation && t.validation.length >= 1, `${t.toolId} bez dowodu`);
    }
  });
  test('getTool + capabilityAvailable reflect validated state', () => {
    assert.ok(getTool('rdkit'));
    assert.equal(getTool('nonexistent'), null);
    assert.equal(capabilityAvailable('admet-estimation'), false);
  });
});
