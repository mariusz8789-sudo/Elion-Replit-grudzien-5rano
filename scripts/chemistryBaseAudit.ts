import { ELEMENTS } from '../packages/core/src/chemistry/data/elements.js';
import { ISOTOPES, IONS, BOND_TYPES, VSEPR } from '../packages/core/src/chemistry/data/species.js';
import { INORGANIC, ORGANIC, FUNCTIONAL_GROUPS, BIOCHEMISTRY } from '../packages/core/src/chemistry/data/compounds.js';
import { REACTIONS } from '../packages/core/src/chemistry/data/reactions.js';
import { EXTRA_REACTIONS } from '../packages/core/src/chemistry/data/reactionsExtra.js';
import { GLOSSARY } from '../packages/core/src/chemistry/data/terminology.js';
import { balanceCheck, parseFormulaV2 } from '../packages/core/src/chemistry/chemistryCore.js';

const issues: string[] = [];
const allReactions = [...REACTIONS, ...EXTRA_REACTIONS];
const compounds = [...INORGANIC, ...ORGANIC];
const registryGroups: Array<[string, readonly { id: string }[]]> = [
  ['ions', IONS],
  ['bonds', BOND_TYPES],
  ['vsepr', VSEPR],
  ['compounds', compounds],
  ['functionalGroups', FUNCTIONAL_GROUPS],
  ['biochemistry', BIOCHEMISTRY],
  ['reactions', allReactions],
  ['glossary', GLOSSARY],
];

if (ELEMENTS.length !== 118) issues.push(`ELEMENT_COUNT:${ELEMENTS.length}`);
if (new Set(ELEMENTS.map((e) => e.atomicNumber)).size !== 118) issues.push('ELEMENT_ATOMIC_NUMBER_DUPLICATE');
if (new Set(ELEMENTS.map((e) => e.symbol)).size !== 118) issues.push('ELEMENT_SYMBOL_DUPLICATE');
if (ELEMENTS.some((e) => !e.provenance || e.provenance.verificationStatus !== 'SOURCE_DECLARED_NOT_LIVE_VERIFIED')) issues.push('ELEMENT_PROVENANCE_STATUS');

for (const [name, rows] of registryGroups) {
  if (new Set(rows.map((row) => row.id)).size !== rows.length) issues.push(`${name.toUpperCase()}_ID_DUPLICATE`);
}
const isotopeKeys = ISOTOPES.map((iso) => `${iso.element}-${iso.massNumber}-${iso.metastable ? 'm' : 'g'}`);
if (new Set(isotopeKeys).size !== isotopeKeys.length) issues.push('ISOTOPE_KEY_DUPLICATE');

for (const compound of compounds) {
  if (!compound.id || !compound.formula || !compound.composition || !compound.provenance) issues.push(`COMPOUND:${compound.id}`);
}

for (const reaction of allReactions) {
  const balance = balanceCheck(reaction.reactants, reaction.products);
  if (!balance.atomsOk || !balance.chargeOk) issues.push(`UNBALANCED:${reaction.id}`);
}

const parserCases: Array<[string, number]> = [
  ['NH4+', 1],
  ['Fe3+', 3],
  ['SO4^2-', -2],
  ['Fe(CN)6^3-', -3],
  ['[Fe(CN)6]4-', -4],
  ['[Cu(NH3)4]2+', 2],
];
for (const [formula, charge] of parserCases) {
  const parsed = parseFormulaV2(formula);
  if (parsed.charge !== charge) issues.push(`PARSER_CHARGE:${formula}`);
}

const counts = {
  elements: ELEMENTS.length,
  isotopes: ISOTOPES.length,
  ions: IONS.length,
  bonds: BOND_TYPES.length,
  vsepr: VSEPR.length,
  compounds: compounds.length,
  functionalGroups: FUNCTIONAL_GROUPS.length,
  biochemistry: BIOCHEMISTRY.length,
  reactions: allReactions.length,
  glossary: GLOSSARY.length,
};

const result = { status: issues.length ? 'FAIL' : 'PASS', counts, issues };
console.log(JSON.stringify(result, null, 2));
if (issues.length) process.exit(1);
