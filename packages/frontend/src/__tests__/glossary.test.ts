import { describe, expect, it } from 'vitest';
import '../labs/index';
import { getLab } from '../core/registry';
import { GLOSSARY } from '../data/glossary';

describe('glossary data', () => {
  it('every term references a real, registered lab', () => {
    for (const t of GLOSSARY) {
      expect(getLab(t.labId), `"${t.term}" references unknown lab "${t.labId}"`).toBeDefined();
    }
  });

  it('has no duplicate terms', () => {
    const terms = GLOSSARY.map((t) => t.term);
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('every term and definition is non-empty', () => {
    for (const t of GLOSSARY) {
      expect(t.term.trim().length, `empty term for labId ${t.labId}`).toBeGreaterThan(0);
      expect(t.definition.trim().length, `empty definition for "${t.term}"`).toBeGreaterThan(0);
    }
  });

  it('covers every lab except the meta discovery lab', () => {
    const labIds = new Set(GLOSSARY.map((t) => t.labId));
    const allLabIds = new Set(
      ['universe', 'spacetime', 'einstein', 'quantum', 'atom', 'nuclear', 'particle', 'multiverse', 'civilization'],
    );
    for (const id of allLabIds) {
      expect(labIds.has(id), `no glossary terms for lab "${id}"`).toBe(true);
    }
  });
});
