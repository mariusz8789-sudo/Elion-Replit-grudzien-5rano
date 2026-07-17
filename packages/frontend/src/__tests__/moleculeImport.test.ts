import { describe, expect, it } from 'vitest';
import { parseMoleculeCsv, entriesToLines, detectImportKind } from '../core/moleculeImport';

describe('parseMoleculeCsv', () => {
  it('parses a CSV with name/smiles headers, any column order', () => {
    const csv = 'smiles,name\nCC(=O)Oc1ccccc1C(=O)O,Aspiryna\nCCO,Etanol';
    const out = parseMoleculeCsv(csv);
    expect(out).toEqual([
      { name: 'Aspiryna', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
      { name: 'Etanol', smiles: 'CCO' },
    ]);
  });

  it('accepts the Polish "nazwa" header', () => {
    const csv = 'nazwa,smiles\nWoda,O';
    expect(parseMoleculeCsv(csv)).toEqual([{ name: 'Woda', smiles: 'O' }]);
  });

  it('falls back to column 0 = name, column 1 = SMILES when there is no recognizable header', () => {
    const csv = 'Aspiryna,CC(=O)Oc1ccccc1C(=O)O\nEtanol,CCO';
    expect(parseMoleculeCsv(csv)).toEqual([
      { name: 'Aspiryna', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
      { name: 'Etanol', smiles: 'CCO' },
    ]);
  });

  it('defaults the name to the SMILES itself when no name column is present', () => {
    const csv = 'smiles\nCCO\nCCN';
    expect(parseMoleculeCsv(csv)).toEqual([{ name: 'CCO', smiles: 'CCO' }, { name: 'CCN', smiles: 'CCN' }]);
  });

  it('handles quoted fields containing commas', () => {
    const csv = 'name,smiles\n"Compound, batch 2",CCO';
    expect(parseMoleculeCsv(csv)).toEqual([{ name: 'Compound, batch 2', smiles: 'CCO' }]);
  });

  it('skips rows with an empty SMILES field', () => {
    const csv = 'name,smiles\nBroken,\nGood,CCO';
    expect(parseMoleculeCsv(csv)).toEqual([{ name: 'Good', smiles: 'CCO' }]);
  });

  it('returns [] for empty input', () => {
    expect(parseMoleculeCsv('')).toEqual([]);
    expect(parseMoleculeCsv('   \n  \n')).toEqual([]);
  });

  it('respects the max cap', () => {
    const csv = 'smiles\n' + Array.from({ length: 10 }, () => 'CCO').join('\n');
    expect(parseMoleculeCsv(csv, 3)).toHaveLength(3);
  });
});

describe('entriesToLines', () => {
  it('renders entries back into the shared "Name = SMILES" textarea format', () => {
    expect(entriesToLines([{ name: 'Aspiryna', smiles: 'CC(=O)Oc1ccccc1C(=O)O' }, { name: 'CCO', smiles: 'CCO' }]))
      .toBe('Aspiryna = CC(=O)Oc1ccccc1C(=O)O\nCCO = CCO');
  });
});

describe('detectImportKind', () => {
  it('recognizes .csv (case-insensitive)', () => {
    expect(detectImportKind('molecules.csv')).toBe('csv');
    expect(detectImportKind('MOLECULES.CSV')).toBe('csv');
  });
  it('recognizes .mol and .sdf/.sd', () => {
    expect(detectImportKind('aspirin.mol')).toBe('mol');
    expect(detectImportKind('batch.sdf')).toBe('sdf');
    expect(detectImportKind('batch.SD')).toBe('sdf');
  });
  it('returns null for unsupported extensions', () => {
    expect(detectImportKind('molecules.txt')).toBeNull();
    expect(detectImportKind('molecules')).toBeNull();
  });
});
