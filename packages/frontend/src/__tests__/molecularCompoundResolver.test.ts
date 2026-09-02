import { describe, expect, it } from 'vitest';
import {
  pubchemFormulaUrl,
  pubchemNameUrl,
  readPubchemProperties,
  resolveCompound,
  seedsFromResolution,
  unavailableLookupTransport,
  type CompoundLookupTransport,
} from '../core/discovery/molecular/compoundResolver';

/**
 * ETAP 14 — NAME / FORMULA / SMILES INPUT.
 *
 * The property these tests protect: a molecular formula never resolves to one
 * molecule, and a name is never answered from an internal table.
 */

/** TEST FIXTURE transport — clearly labelled. It replays a recorded PubChem shape. */
function fixtureTransport(body: unknown): CompoundLookupTransport {
  return {
    transportId: 'test-fixture',
    available: () => ({ available: true, reason: '' }),
    fetchJson: () => ({ ok: true, body }),
  };
}

const ASPIRIN_BODY = {
  PropertyTable: {
    Properties: [{ CID: 2244, SMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O', MolecularFormula: 'C9H8O4' }],
  },
};

const FORMULA_BODY = {
  PropertyTable: {
    Properties: [
      { CID: 2244, SMILES: 'CC(=O)OC1=CC=CC=C1C(=O)O', MolecularFormula: 'C9H8O4' },
      { CID: 68231, SMILES: 'COC(=O)C1=CC=CC=C1OC=O', MolecularFormula: 'C9H8O4' },
      { CID: 5281855, SMILES: 'C1=CC2=C(C=C1O)C(=CC(=O)O2)CO', MolecularFormula: 'C9H8O4' },
    ],
  },
};

describe('adresy trafiają w dozwolony prefiks proxy repozytorium', () => {
  it('URL nazwy jest pod /rest/pug/compound/', () => {
    expect(pubchemNameUrl('aspirin')).toContain('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/aspirin/');
  });

  it('nazwa jest bezpiecznie zakodowana', () => {
    expect(pubchemNameUrl('acetylsalicylic acid')).toContain('acetylsalicylic%20acid');
    expect(pubchemNameUrl('a/b?c')).not.toMatch(/name\/a\/b\?c/);
  });

  it('URL wzoru używa fastformula i ma limit rekordów', () => {
    const url = pubchemFormulaUrl('C9H8O4', 5);
    expect(url).toContain('/fastformula/C9H8O4/');
    expect(url).toContain('MaxRecords=5');
  });
});

describe('SMILES nie wymaga sieci i jest uczciwie oznaczony', () => {
  it('rozwiązuje się natychmiast jako USER_SUPPLIED', () => {
    const resolution = resolveCompound({ kind: 'smiles', value: 'c1ccccc1' });

    expect(resolution.status).toBe('RESOLVED_SINGLE');
    expect(resolution.structures[0]!.source).toBe('USER_SUPPLIED');
    expect(resolution.sourceUrl).toBeNull();
    // Nie jest zweryfikowany wobec żadnego rejestru — i to jest powiedziane.
    expect(resolution.ambiguityNote).toMatch(/not checked against any register/i);
  });
});

describe('WZÓR SUMARYCZNY nigdy nie daje jednej cząsteczki', () => {
  it('wiele struktur o tym samym wzorze wraca jako AMBIGUOUS', () => {
    const resolution = resolveCompound({ kind: 'formula', value: 'C9H8O4' }, fixtureTransport(FORMULA_BODY));

    expect(resolution.status).toBe('RESOLVED_AMBIGUOUS');
    expect(resolution.structures).toHaveLength(3);
    expect(resolution.ambiguityNote).toMatch(/does not determine a structure/i);
  });

  it('nawet JEDEN wynik dla wzoru pozostaje AMBIGUOUS', () => {
    // Liczba trafień to własność pokrycia rejestru, nie chemii.
    const resolution = resolveCompound({ kind: 'formula', value: 'C9H8O4' }, fixtureTransport(ASPIRIN_BODY));

    expect(resolution.status).toBe('RESOLVED_AMBIGUOUS');
    expect(resolution.status).not.toBe('RESOLVED_SINGLE');
  });

  it('limit struktur jest przestrzegany', () => {
    const resolution = resolveCompound({ kind: 'formula', value: 'C9H8O4' }, fixtureTransport(FORMULA_BODY), { maxStructures: 2 });
    expect(resolution.structures).toHaveLength(2);
  });
});

describe('NAZWA LEKU rozwiązuje się tylko przez realny rejestr', () => {
  it('jedno trafienie daje RESOLVED_SINGLE z realnym źródłem', () => {
    const resolution = resolveCompound({ kind: 'name', value: 'aspirin' }, fixtureTransport(ASPIRIN_BODY));

    expect(resolution.status).toBe('RESOLVED_SINGLE');
    expect(resolution.structures[0]!.source).toBe('PUBCHEM');
    expect(resolution.structures[0]!.molecularFormula).toBe('C9H8O4');
    expect(resolution.structures[0]!.registryId).toBe('CID:2244');
    expect(resolution.sourceUrl).toContain('pubchem');
  });

  it('bez transportu Genesis NIE zgaduje struktury z nazwy', () => {
    const resolution = resolveCompound({ kind: 'name', value: 'aspirin' }, unavailableLookupTransport);

    expect(resolution.status).toBe('NOT_AVAILABLE');
    expect(resolution.structures).toHaveLength(0);
    expect(resolution.ambiguityNote).toMatch(/no internal drug dictionary and will not guess/i);
  });

  it('wiele rekordów dla nazwy jest oznaczone jako niejednoznaczne', () => {
    const resolution = resolveCompound({ kind: 'name', value: 'x' }, fixtureTransport(FORMULA_BODY));
    expect(resolution.status).toBe('RESOLVED_AMBIGUOUS');
    expect(resolution.ambiguityNote).toMatch(/salts, isomers or formulations/i);
  });

  it('brak trafień to NOT_FOUND, nie pusty sukces', () => {
    const resolution = resolveCompound({ kind: 'name', value: 'zzz' }, fixtureTransport({ PropertyTable: { Properties: [] } }));
    expect(resolution.status).toBe('NOT_FOUND');
    expect(resolution.reason).toMatch(/no usable structure/i);
  });
});

describe('uszkodzona odpowiedź nie zamienia się w wynik', () => {
  it('wpisy bez SMILES są odrzucane, nie naprawiane', () => {
    const structures = readPubchemProperties({
      PropertyTable: { Properties: [{ CID: 1, MolecularFormula: 'C9H8O4' }, { CID: 2, SMILES: 'CCO' }] },
    });
    expect(structures).toHaveLength(1);
    expect(structures[0]!.canonicalSmiles).toBe('CCO');
  });

  it('kompletnie obcy kształt daje pustą listę', () => {
    expect(readPubchemProperties({ nonsense: true })).toHaveLength(0);
    expect(readPubchemProperties(null)).toHaveLength(0);
    expect(readPubchemProperties('a string')).toHaveLength(0);
  });

  it('błąd transportu jest NOT_AVAILABLE z powodem i zachowanym URL', () => {
    const failing: CompoundLookupTransport = {
      transportId: 'failing',
      available: () => ({ available: true, reason: '' }),
      fetchJson: () => ({ ok: false, reason: 'connect_rejected by egress policy' }),
    };
    const resolution = resolveCompound({ kind: 'name', value: 'aspirin' }, failing);

    expect(resolution.status).toBe('NOT_AVAILABLE');
    expect(resolution.reason).toContain('connect_rejected');
    expect(resolution.sourceUrl).toContain('pubchem');
  });

  it('puste wejście jest odrzucone', () => {
    expect(resolveCompound({ kind: 'name', value: '   ' }).status).toBe('INVALID_INPUT');
  });
});

describe('zasiewy do przebiegu odkrywczego', () => {
  it('nieudane rozwiązanie daje ZERO zasiewów, nie zgadywane', () => {
    expect(seedsFromResolution(resolveCompound({ kind: 'name', value: 'x' }, unavailableLookupTransport))).toHaveLength(0);
  });

  it('niejednoznaczny wzór daje WSZYSTKIE kandydujące struktury jako zasiewy', () => {
    const resolution = resolveCompound({ kind: 'formula', value: 'C9H8O4' }, fixtureTransport(FORMULA_BODY));
    expect(seedsFromResolution(resolution)).toHaveLength(3);
  });
});
