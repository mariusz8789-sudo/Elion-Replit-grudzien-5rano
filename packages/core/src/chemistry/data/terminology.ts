/* Genesis Chemistry v0.1-compatible replacement; NOT the original Qwen v0.1. */
import type { GlossaryTerm } from '../genesisChemistryTypes.js';

export const GLOSSARY: readonly GlossaryTerm[] = [
  { id: 'atom', en: 'Atom', pl: 'Atom', es: 'Átomo', definition: 'smallest chemically identifiable unit of an element', category: 'fundamentals', aliases: ['atomic particle'], related: [] },
  { id: 'ion', en: 'Ion', pl: 'Jon', es: 'Ion', definition: 'charged atom or polyatomic species', category: 'fundamentals', aliases: ['cation', 'anion'], related: ['charge'] },
  { id: 'molecule', en: 'Molecule', pl: 'Cząsteczka', es: 'Molécula', definition: 'discrete species with covalent connectivity', category: 'fundamentals', aliases: ['molecular species'], related: ['bond'] },
  { id: 'phase', en: 'Phase', pl: 'Faza', es: 'Fase', definition: 'physical state descriptor', category: 'state', aliases: ['solid', 'liquid', 'gas'], related: [] },
  { id: 'aqueous', en: 'Aqueous', pl: 'Wodny', es: 'Acuoso', definition: 'dissolved in water', category: 'medium', aliases: ['water'], related: ['solution'] },
  { id: 'oxidation-state', en: 'Oxidation state', pl: 'Stopień utlenienia', es: 'Estado de oxidación', definition: 'formal electron-accounting descriptor', category: 'redox', aliases: ['oxidation number'], related: ['redox'] },
  { id: 'redox', en: 'Redox', pl: 'Redoks', es: 'Redox', definition: 'coupled oxidation-reduction chemistry', category: 'reaction', aliases: ['oxidation', 'reduction'], related: ['oxidation-state'] },
  { id: 'acid', en: 'Acid', pl: 'Kwas', es: 'Ácido', definition: 'proton donor model under Brønsted-Lowry', category: 'reaction', aliases: ['proton donor'], related: ['base'] },
  { id: 'base', en: 'Base', pl: 'Zasada', es: 'Base', definition: 'proton acceptor model under Brønsted-Lowry', category: 'reaction', aliases: ['proton acceptor'], related: ['acid'] },
  { id: 'salt', en: 'Salt', pl: 'Sól', es: 'Sal', definition: 'ionic compound formed from oppositely charged ions', category: 'compound', aliases: [], related: ['ion'] },
  { id: 'molar-mass', en: 'Molar mass', pl: 'Masa molowa', es: 'Masa molar', definition: 'mass per mole of a substance', category: 'quantity', aliases: ['molar weight'], related: [] },
  { id: 'stoichiometry', en: 'Stoichiometry', pl: 'Stechiometria', es: 'Estequiometría', definition: 'quantitative relations in balanced chemical equations', category: 'quantity', aliases: ['stoich'], related: ['reaction'] },
  { id: 'equilibrium', en: 'Equilibrium', pl: 'Równowaga', es: 'Equilibrio', definition: 'state where forward and reverse rates balance', category: 'reaction', aliases: ['chemical equilibrium'], related: ['reaction'] },
  { id: 'catalyst', en: 'Catalyst', pl: 'Katalizator', es: 'Catalizador', definition: 'species that changes rate without net consumption', category: 'reaction', aliases: ['catalizator'], related: ['reaction'] },
  { id: 'isotope', en: 'Isotope', pl: 'Izotop', es: 'Isótopo', definition: 'nuclide of an element with a specific mass number', category: 'nuclear', aliases: [], related: ['element'] },
  { id: 'metastable', en: 'Metastable', pl: 'Metastabilny', es: 'Metaestable', definition: 'excited state with relatively long lifetime', category: 'nuclear', aliases: [], related: ['isotope'] }
];

export const ALIAS_GRAPH: Readonly<Record<string, readonly string[]>> = {
  "water": [
    "H2O",
    "water",
    "woda",
    "agua"
  ],
  "ammonium": [
    "NH4+",
    "ammonium"
  ],
  "sulfate": [
    "SO4^2-",
    "sulfate",
    "siarczan"
  ],
  "carbonate": [
    "CO3^2-",
    "carbonate",
    "węglan"
  ],
  "oxidation-state": [
    "oxidation number",
    "stopień utlenienia",
    "estado de oxidación"
  ]
};
