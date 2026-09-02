import { describe, expect, it } from 'vitest';
import type { CompoundLookupTransport } from '../core/discovery/molecular/compoundResolver';
import {
  buildNaturalProductLead,
  naturalProductClaimGuard,
  naturalProductStatement,
  type NaturalSourceClaim,
} from '../core/discovery/molecular/naturalProducts';

/**
 * ETAP 8 — NATURAL PRODUCTS.
 *
 * The property under test: natural origin is provenance and can never become
 * a safety, efficacy or toxicity statement.
 */
const lookup: CompoundLookupTransport = {
  transportId: 'test-fixture',
  available: () => ({ available: true, reason: '' }),
  fetchJson: () => ({
    ok: true,
    body: { PropertyTable: { Properties: [{ CID: 68827, SMILES: 'CC1=C(C2CC3C(C(=O)OC3O)CCC2(OO1)C)C', MolecularFormula: 'C15H22O5' }] } },
  }),
};

const citedClaim: NaturalSourceClaim = {
  sourceOrganism: 'Artemisia annua',
  compoundName: 'artemisinin',
  evidence: [{ kind: 'PEER_REVIEWED_LITERATURE', reference: 'Tu Y., Nature Medicine 2011', establishes: 'occurrence in the plant' }],
};

const uncitedClaim: NaturalSourceClaim = {
  sourceOrganism: 'a garden herb',
  compoundName: 'artemisinin',
  evidence: [{ kind: 'USER_ASSERTION', reference: '', establishes: 'claimed occurrence' }],
};

describe('STRAŻNIK: naturalne pochodzenie nie staje się twierdzeniem o bezpieczeństwie', () => {
  it('odrzuca "naturalne, więc bezpieczne" i warianty', () => {
    for (const statement of [
      'This natural compound is safe',
      'A plant-derived remedy without side effects',
      'Herbal and therefore non-toxic',
      'Botanical extract, gentle and effective',
    ]) {
      const verdict = naturalProductClaimGuard(statement);
      expect(verdict.allowed, statement).toBe(false);
      expect(verdict.reason).toMatch(/not evidence of either/i);
    }
  });

  it('przepuszcza zdania, które nie wnioskują właściwości z pochodzenia', () => {
    expect(naturalProductClaimGuard('Artemisinin occurs in Artemisia annua').allowed).toBe(true);
    expect(naturalProductClaimGuard('This compound requires toxicity testing').allowed).toBe(true);
    // Samo słowo "safe" bez odwołania do naturalności nie jest tym błędem.
    expect(naturalProductClaimGuard('The assay was run safely').allowed).toBe(true);
  });
});

describe('trop naturalny niesie dowód WYSTĘPOWANIA, nic więcej', () => {
  const lead = buildNaturalProductLead(citedClaim, lookup);

  it('cytowany dowód daje siłę CITED i realne referencje', () => {
    expect(lead.evidenceStrength).toBe('CITED');
    expect(lead.context.knownNaturalProduct).toBe(true);
    expect(lead.context.references[0]).toContain('Tu Y.');
    expect(lead.context.sourceOrganism).toBe('Artemisia annua');
  });

  it('kontekst nie zawiera ŻADNEJ wartości właściwości', () => {
    // Struktura NaturalProductContext to wyłącznie prowieniencja.
    expect(Object.keys(lead.context).sort()).toEqual(['knownNaturalProduct', 'references', 'sourceOrganism']);
  });

  it('ograniczenia mówią wprost, co dowód ustala, a czego nie', () => {
    const limitations = lead.limitations.join(' ');
    expect(limitations).toMatch(/Natural origin is provenance, not a property/i);
    expect(limitations).toMatch(/supports OCCURRENCE/i);
    expect(limitations).toMatch(/does not establish activity/i);
  });

  it('nazwa rozwiązuje się przez TEN SAM resolver, bez uprzywilejowanej ścieżki', () => {
    expect(lead.resolution.status).toBe('RESOLVED_SINGLE');
    expect(lead.seeds).toHaveLength(1);
    expect(lead.seeds[0]).toContain('C');
  });

  it('zdanie o tropie mówi tylko o występowaniu', () => {
    const statement = naturalProductStatement(lead);
    expect(statement).toMatch(/Occurrence is all this establishes/i);
    expect(naturalProductClaimGuard(statement).allowed).toBe(true);
  });
});

describe('brak cytowania jest widoczny, nie wygładzony', () => {
  const lead = buildNaturalProductLead(uncitedClaim, lookup);

  it('sama asercja nie czyni z tego znanego produktu naturalnego', () => {
    expect(lead.evidenceStrength).toBe('ASSERTED_WITHOUT_CITATION');
    // Bez cytowania NIE twierdzimy, że to znany produkt naturalny.
    expect(lead.context.knownNaturalProduct).toBeNull();
  });

  it('ograniczenia mówią, że samo występowanie jest niezweryfikowane', () => {
    expect(lead.limitations.join(' ')).toMatch(/Occurrence itself is unverified/i);
  });

  it('zdanie o tropie nie awansuje asercji na fakt', () => {
    expect(naturalProductStatement(lead)).toMatch(/without a citation/i);
  });
});

describe('nierozwiązana nazwa nie idzie dalej jako trop', () => {
  it('brak struktury → zero zasiewów i jawne ograniczenie', () => {
    const lead = buildNaturalProductLead(citedClaim);
    expect(lead.seeds).toHaveLength(0);
    expect(lead.limitations.join(' ')).toMatch(/cannot proceed on a name alone/i);
  });

  it('brak dowodu w ogóle jest oznaczony jako NONE', () => {
    const lead = buildNaturalProductLead({ ...citedClaim, evidence: [] }, lookup);
    expect(lead.evidenceStrength).toBe('NONE');
    expect(lead.limitations.join(' ')).toMatch(/occurrence claim is unsupported/i);
  });

  it('trop jest deterministycznie odciskany', () => {
    expect(buildNaturalProductLead(citedClaim, lookup).leadFingerprint)
      .toBe(buildNaturalProductLead(citedClaim, lookup).leadFingerprint);
  });
});
