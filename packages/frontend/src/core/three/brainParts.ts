/**
 * The brain close-up, part by part: every BodyParts3D brain structure keeps its own mesh,
 * so a tap names it. Names are translated here; the one-line roles are textbook-level
 * education for a layperson, never a clinical statement about a person.
 */

export interface BrainRegion {
  readonly id: string;
  readonly label: string;
  readonly role: string;
  /** Display tint of the region in the close-up. */
  readonly color: number;
  readonly match: (name: string) => boolean;
}

const has = (...words: string[]) => (name: string) => words.some((w) => name.toLowerCase().includes(w));

/** Order matters: the first region whose test matches owns the structure. */
export const BRAIN_REGIONS: readonly BrainRegion[] = [
  { id: 'frontal', label: 'Płat czołowy', role: 'Planowanie, decyzje, ruch i mowa.', color: 0xd9a7a0, match: has('frontal', 'precentral', 'orbital gyrus') },
  { id: 'parietal', label: 'Płat ciemieniowy', role: 'Czucie dotyku i orientacja w przestrzeni.', color: 0xd4b08c, match: has('postcentral', 'parietal', 'supramarginal', 'angular') },
  { id: 'temporal', label: 'Płat skroniowy', role: 'Słuch, rozpoznawanie twarzy i słów.', color: 0xc9a3b8, match: has('temporal gyrus', 'fusiform', 'insula') },
  { id: 'occipital', label: 'Płat potyliczny', role: 'Widzenie: tu powstaje obraz.', color: 0xa9b3d0, match: has('occipital') },
  { id: 'limbic', label: 'Układ limbiczny', role: 'Pamięć i emocje.', color: 0xe0c07a, match: has('hippocamp', 'amygdala', 'cingulate', 'fornix', 'mammillary', 'septum', 'stria terminalis') },
  { id: 'basal', label: 'Jądra podstawy', role: 'Płynny ruch i nawyki.', color: 0x9fc4a8, match: has('caudate', 'putamen', 'pallidus', 'internal capsule') },
  { id: 'diencephalon', label: 'Międzymózgowie', role: 'Przekazuje wrażenia zmysłów, steruje hormonami, snem i temperaturą.', color: 0x8fc9d6, match: has('thalam', 'hypothalam', 'habenula', 'geniculate', 'tuber cinereum', 'stria medullaris', 'lamina terminalis') },
  { id: 'visual', label: 'Drogi wzrokowe', role: 'Prowadzą obraz z oczu do mózgu.', color: 0x7fb0e8, match: has('optic') },
  { id: 'brainstem', label: 'Pień mózgu', role: 'Oddech, tętno, przytomność.', color: 0xc79a7c, match: has('midbrain', 'pons', 'medulla', 'colliculus', 'peduncle', 'interpeduncular', 'aqueduct', 'posterior commissure') },
  { id: 'cerebellum', label: 'Móżdżek', role: 'Równowaga i koordynacja ruchów.', color: 0xd7a0b8, match: has('cerebell') },
  { id: 'white', label: 'Istota biała i spoidła', role: 'Połączenia między obszarami mózgu.', color: 0xe8e0d2, match: has('white matter', 'corpus callosum', 'commissure') },
];

export const BRAIN_OTHER: BrainRegion = { id: 'other', label: 'Struktury mózgu', role: 'Część mózgu w atlasie BodyParts3D.', color: 0xd6b3a8, match: () => true };

export function brainRegionOf(name: string): BrainRegion {
  return BRAIN_REGIONS.find((r) => r.match(name)) ?? BRAIN_OTHER;
}

/** Polish names of the atlas terms (side prefix and "part of" removed first). */
const TERMS_PL: Readonly<Record<string, string>> = {
  'superior frontal gyrus': 'Zakręt czołowy górny', 'middle frontal gyrus': 'Zakręt czołowy środkowy', 'inferior frontal gyrus': 'Zakręt czołowy dolny',
  'precentral gyrus': 'Zakręt przedśrodkowy (ruch)', 'postcentral gyrus': 'Zakręt zaśrodkowy (czucie)', 'orbital gyrus': 'Zakręty oczodołowe',
  'superior parietal lobule': 'Płacik ciemieniowy górny', 'supramarginal gyrus': 'Zakręt nadbrzeżny', 'angular gyrus': 'Zakręt kątowy',
  'superior temporal gyrus': 'Zakręt skroniowy górny', 'middle temporal gyrus': 'Zakręt skroniowy środkowy', 'inferior temporal gyrus': 'Zakręt skroniowy dolny',
  'fusiform gyrus': 'Zakręt wrzecionowaty', 'insula': 'Wyspa', 'occipital lobe': 'Płat potyliczny',
  'hippocampus': 'Hipokamp', 'amygdala': 'Ciało migdałowate', 'cingulate gyrus': 'Zakręt obręczy', 'parahippocampal gyrus': 'Zakręt przyhipokampowy',
  'fornix of forebrain': 'Sklepienie', 'commissure of fornix of forebrain': 'Spoidło sklepienia', 'mammillary body': 'Ciało suteczkowate',
  'septum of telencephalon': 'Przegroda przezroczysta', 'stria terminalis': 'Prążek krańcowy',
  'caudate nucleus': 'Jądro ogoniaste', 'putamen': 'Skorupa', 'globus pallidus': 'Gałka blada', 'internal capsule': 'Torebka wewnętrzna',
  'thalamus': 'Wzgórze', 'hypothalamus': 'Podwzgórze', 'habenula': 'Uzdeczka', 'lateral geniculate body': 'Ciało kolankowate boczne (wzrok)',
  'medial geniculate body': 'Ciało kolankowate przyśrodkowe (słuch)', 'tuber cinereum': 'Guz popielaty', 'stria medullaris of thalamus': 'Prążek rdzenny wzgórza',
  'lamina terminalis': 'Blaszka krańcowa', 'optic tract': 'Pasmo wzrokowe', 'optic chiasm': 'Skrzyżowanie wzrokowe',
  'midbrain': 'Śródmózgowie', 'pons': 'Most', 'medulla oblongata': 'Rdzeń przedłużony', 'superior colliculus': 'Wzgórek górny', 'inferior colliculus': 'Wzgórek dolny',
  'brachium of superior colliculus': 'Ramię wzgórka górnego', 'brachium of inferior colliculus': 'Ramię wzgórka dolnego', 'peduncle of midbrain': 'Konar mózgu',
  'interpeduncular fossa': 'Dół międzykonarowy', 'cerebral aqueduct': 'Wodociąg mózgu', 'posterior commissure': 'Spoidło tylne', 'anterior commissure': 'Spoidło przednie',
  'cerebellum': 'Móżdżek', 'tentorium cerebelli': 'Namiot móżdżku', 'corpus callosum': 'Ciało modzelowate',
  'white matter of cerebral hemisphere': 'Istota biała półkuli',
};

export interface BrainPartLabel {
  readonly label: string;
  /** 'lewa' / 'prawa' półkula, or null for a midline structure. */
  readonly side: 'lewa' | 'prawa' | null;
}

export function brainPartLabel(name: string): BrainPartLabel {
  let n = name.toLowerCase();
  const side = /\bleft\b/.test(n) ? 'lewa' : /\bright\b/.test(n) ? 'prawa' : null;
  const part = /^anterior part of /.test(n) ? ' (przednia część)' : /^posterior part of /.test(n) ? ' (tylna część)' : '';
  n = n.replace(/^(anterior|posterior) part of /, '').replace(/\b(left|right) /, '');
  const base = TERMS_PL[n];
  return { label: base ? `${base}${part}` : name, side };
}
