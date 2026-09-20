/* Proprietary / All Rights Reserved - Genesis OS */
import { ELEMENTS } from '../packages/core/src/chemistry/data/elements.js';
import { IONS, BOND_TYPES, VSEPR } from '../packages/core/src/chemistry/data/species.js';
import { FUNCTIONAL_GROUPS, BIOCHEMISTRY } from '../packages/core/src/chemistry/data/compounds.js';
import { GLOSSARY } from '../packages/core/src/chemistry/data/terminology.js';
import { PKA_CONTEXT } from '../packages/core/src/chemistry/data/reactionsExtra.js';
import { chemistryAdapter } from '../packages/core/src/chemistry/chemistryKnowledgeAdapter.js';
import { balanceCheck, molarMassOf, parseFormulaV2 } from '../packages/core/src/chemistry/chemistryCore.js';

const problems: string[] = [];

if (ELEMENTS.length !== 118) problems.push(`ELEMENT_COUNT:${ELEMENTS.length}`);
if (new Set(ELEMENTS.map((e) => e.symbol)).size !== ELEMENTS.length) problems.push('DUPLICATE_ELEMENT_SYMBOL');
if (new Set(ELEMENTS.map((e) => e.atomicNumber)).size !== ELEMENTS.length) problems.push('DUPLICATE_ATOMIC_NUMBER');

for (const compound of chemistryAdapter.compounds) {
  try {
    const parsed = parseFormulaV2(compound.formula);
    for (const symbol of Object.keys(parsed.composition)) {
      if (parsed.composition[symbol] !== compound.composition[symbol]) problems.push(`COMPOSITION:${compound.id}:${symbol}`);
    }
    if (Object.keys(parsed.composition).sort().join(',') !== Object.keys(compound.composition).sort().join(',')) problems.push(`FORMULA_KEYS:${compound.id}`);
    if (Math.abs(compound.molarMass - molarMassOf(compound.composition)) > 0.01) problems.push(`MOLAR_MASS:${compound.id}`);
    if (!compound.phase || !compound.medium || !compound.structureKind) problems.push(`UNNORMALIZED_COMPOUND:${compound.id}`);
  } catch (error) {
    problems.push(`FORMULA_ERROR:${compound.id}:${String(error)}`);
  }
}

for (const reaction of chemistryAdapter.reactions) {
  const result = balanceCheck(reaction.reactants, reaction.products);
  if (!result.atomsOk) problems.push(`UNBALANCED_ATOMS:${reaction.id}`);
  if (!result.chargeOk) problems.push(`UNBALANCED_CHARGE:${reaction.id}`);
  if (reaction.contextDependent === undefined) problems.push(`REACTION_CONTEXT_UNSET:${reaction.id}`);
}

for (const isotope of chemistryAdapter.isotopes) {
  const atomicNumber = ELEMENTS.find((e) => e.symbol === isotope.element)?.atomicNumber;
  if (atomicNumber !== undefined && isotope.neutrons !== isotope.massNumber - atomicNumber) problems.push(`NEUTRON_COUNT:${isotope.element}-${isotope.massNumber}`);
  if (!isotope.stable && !isotope.halfLife) problems.push(`MISSING_HALFLIFE:${isotope.element}-${isotope.massNumber}${isotope.metastable ? 'm' : ''}`);
}

for (const ion of IONS) if (!ion.composition || Object.keys(ion.composition).length === 0) problems.push(`ION_NO_COMPOSITION:${ion.id}`);
for (const group of FUNCTIONAL_GROUPS) if (!group.structure || !group.generalFormula) problems.push(`FUNCTIONAL_GROUP_INCOMPLETE:${group.id}`);
for (const bio of BIOCHEMISTRY) if (!bio.class) problems.push(`BIO_CLASS_EMPTY:${bio.id}`);
for (const term of GLOSSARY) if (!term.definition) problems.push(`GLOSSARY_EMPTY:${term.id}`);
if (BOND_TYPES.length < 8) problems.push(`BOND_COUNT:${BOND_TYPES.length}`);
if (VSEPR.length < 13) problems.push(`VSEPR_COUNT:${VSEPR.length}`);
if (PKA_CONTEXT.length === 0) problems.push('PKA_EMPTY');

const manifest = chemistryAdapter.manifest();
for (const [name, sha] of Object.entries(manifest.sha256)) if (!/^[0-9a-f]{64}$/u.test(sha)) problems.push(`BAD_SHA:${name}`);
if (manifest.verificationStatus !== 'SOURCE_DECLARED_NOT_LIVE_VERIFIED') problems.push('UNSAFE_VERIFICATION_STATUS');

console.log(JSON.stringify({
  package: manifest.package,
  version: manifest.version,
  counts: manifest.counts,
  problems,
  verificationStatus: manifest.verificationStatus,
  sha256: manifest.sha256,
}, null, 2));

if (problems.length > 0) process.exit(1);
