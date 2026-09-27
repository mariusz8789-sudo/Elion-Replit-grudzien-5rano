/* Proprietary / All Rights Reserved - Genesis OS */
import { sha256HexSync } from '../knowledge/sha256.js';
import { ELEMENTS, ELEMENT_BY_SYMBOL, ELEMENT_ALIASES } from './data/elements.js';
import { ISOTOPES, IONS, BOND_TYPES, VSEPR } from './data/species.js';
import { INORGANIC, ORGANIC, FUNCTIONAL_GROUPS, BIOCHEMISTRY } from './data/compounds.js';
import { REACTIONS, PHYS_CHEM_EQUATIONS, STOICHIOMETRY_RULES } from './data/reactions.js';
import { EXTRA_REACTIONS, PKA_CONTEXT, REACTION_OVERRIDES } from './data/reactionsExtra.js';
import { GLOSSARY, ALIAS_GRAPH } from './data/terminology.js';
import { parseFormulaV2, molarMassOf, balanceCheck, buildManifest } from './chemistryCore.js';
import { atomicWeightView, phaseView } from './elementsNormalization.js';
import { applyIsotopeCorrections } from './isotopesCorrection.js';
import { normalizeCompound } from './compoundsNormalization.js';
import type { ChemicalElement, NormalizedCompound, NormalizedReaction, PkaRecord, Reaction } from './genesisChemistryTypes.js';

const shaOf = (value: unknown): string => sha256HexSync(JSON.stringify(value));

export class ChemistryKnowledgeAdapter {
  readonly isotopes = applyIsotopeCorrections(ISOTOPES);
  readonly compounds: readonly NormalizedCompound[] = [...INORGANIC, ...ORGANIC].map(normalizeCompound);
  readonly reactions: readonly NormalizedReaction[] = [...REACTIONS, ...EXTRA_REACTIONS].map((reaction): NormalizedReaction => {
    const override = REACTION_OVERRIDES[reaction.id];
    return {
      ...reaction,
      epistemic: override?.epistemic ?? reaction.epistemic,
      contextDependent: override?.contextDependent ?? reaction.contextDependent ?? false,
    };
  });

  getElement(query: string): ChemicalElement | undefined {
    const exact = ELEMENT_BY_SYMBOL.get(query);
    if (exact) return exact;
    const normalized = query.toLowerCase();
    return ELEMENTS.find((element) => element.name.toLowerCase() === normalized || element.namePl.toLowerCase() === normalized || element.nameEs.toLowerCase() === normalized);
  }

  getAtom(atomicNumber: number): ChemicalElement | undefined {
    return ELEMENTS.find((element) => element.atomicNumber === atomicNumber);
  }

  atomicWeight(atomicNumber: number) {
    const element = this.getAtom(atomicNumber);
    return element ? atomicWeightView(element) : undefined;
  }

  phase(atomicNumber: number) {
    const element = this.getAtom(atomicNumber);
    return element ? phaseView(element) : undefined;
  }

  getIon(formula: string) {
    return IONS.find((ion) => ion.formula === formula || ion.id === formula);
  }

  getIsotopes(symbol: string) {
    return this.isotopes.filter((isotope) => isotope.element === symbol);
  }

  getCompound(query: string): NormalizedCompound | undefined {
    return this.compounds.find((compound) => compound.id === query || compound.formula === query);
  }

  getMolecule(query: string): NormalizedCompound | undefined {
    return this.getCompound(query);
  }

  getFormula(formula: string) {
    const parsed = parseFormulaV2(formula);
    return { composition: parsed.composition, charge: parsed.charge, molarMass: molarMassOf(parsed.composition) };
  }

  getReaction(id: string): NormalizedReaction | undefined {
    return this.reactions.find((reaction) => reaction.id === id);
  }

  getReactionsByType(type: string): readonly NormalizedReaction[] {
    return this.reactions.filter((reaction) => reaction.reactionType.includes(type));
  }

  getPka(id: string): PkaRecord | undefined {
    return PKA_CONTEXT.find((record) => record.id === id);
  }

  getBond(id: string) {
    return BOND_TYPES.find((bond) => bond.id === id);
  }

  getVsepr(id: string) {
    return VSEPR.find((geometry) => geometry.id === id);
  }

  getPhysChem(id: string) {
    return PHYS_CHEM_EQUATIONS.find((equation) => equation.id === id);
  }

  getStoich(id: string) {
    return STOICHIOMETRY_RULES.find((rule) => rule.id === id);
  }

  getFunctionalGroup(id: string) {
    return FUNCTIONAL_GROUPS.find((group) => group.id === id);
  }

  getBio(id: string) {
    return BIOCHEMISTRY.find((bio) => bio.id === id);
  }

  getTerm(query: string) {
    const normalized = query.toLowerCase();
    return GLOSSARY.find((term) =>
      term.en.toLowerCase() === normalized ||
      term.pl.toLowerCase() === normalized ||
      term.es.toLowerCase() === normalized ||
      term.aliases.some((alias) => alias.toLowerCase() === normalized),
    );
  }

  resolveAlias(alias: string): string | undefined {
    const normalized = alias.toLowerCase();
    for (const [canonical, values] of Object.entries(ALIAS_GRAPH)) {
      if (canonical === normalized || values.some((value) => value.toLowerCase() === normalized)) return canonical;
    }
    return ELEMENT_ALIASES[normalized];
  }

  validateReaction(reactants: Reaction['reactants'], products: Reaction['products']) {
    return balanceCheck(reactants, products);
  }

  manifest() {
    const counts = {
      elements: ELEMENTS.length,
      isotopes: this.isotopes.length,
      ions: IONS.length,
      compounds: this.compounds.length,
      functionalGroups: FUNCTIONAL_GROUPS.length,
      biochemistry: BIOCHEMISTRY.length,
      reactions: this.reactions.length,
      glossary: GLOSSARY.length,
      bonds: BOND_TYPES.length,
      vsepr: VSEPR.length,
      pka: PKA_CONTEXT.length,
      physChemEquations: PHYS_CHEM_EQUATIONS.length,
      stoichiometryRules: STOICHIOMETRY_RULES.length,
    };

    return buildManifest(
      counts,
      {
        elements: shaOf(ELEMENTS),
        isotopes: shaOf(this.isotopes),
        ions: shaOf(IONS),
        compounds: shaOf(this.compounds),
        functionalGroups: shaOf(FUNCTIONAL_GROUPS),
        biochemistry: shaOf(BIOCHEMISTRY),
        reactions: shaOf(this.reactions),
        glossary: shaOf(GLOSSARY),
        bonds: shaOf(BOND_TYPES),
        vsepr: shaOf(VSEPR),
        pka: shaOf(PKA_CONTEXT),
        physChemEquations: shaOf(PHYS_CHEM_EQUATIONS),
        stoichiometryRules: shaOf(STOICHIOMETRY_RULES),
      },
      'SOURCE_DECLARED_NOT_LIVE_VERIFIED',
    );
  }
}

export const chemistryAdapter = new ChemistryKnowledgeAdapter();
