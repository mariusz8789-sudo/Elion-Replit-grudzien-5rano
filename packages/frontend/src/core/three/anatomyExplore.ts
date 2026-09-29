import type { FullAtlasPart } from './bodyParts3dFullAtlas';
import { brainPartLabel, brainRegionOf } from './brainParts';

/**
 * HUMAN EXPLORER — one continuous descent: BODY → REGION → ORGAN → STRUCTURE, then the existing
 * macro→micro flow (tissue, cell). The person never leaves the body in its chamber: a tap narrows
 * the focus, Back widens it by exactly one level. Pure data and state here; the scene draws it.
 */

export type ExploreLevel = 'BODY' | 'REGION' | 'ORGAN' | 'STRUCTURE';
export type BodyRegionId = 'head' | 'chest' | 'abdomen' | 'pelvis' | 'arms' | 'legs';

export interface ExploreState {
  readonly level: ExploreLevel;
  readonly regionId: BodyRegionId | null;
  readonly organId: string | null;
  /** Atlas name of the tapped structure (e.g. "Left hippocampus"). */
  readonly structure: string | null;
}

export const EXPLORE_BODY: ExploreState = Object.freeze({ level: 'BODY', regionId: null, organId: null, structure: null });

export const REGION_LABEL: Readonly<Record<BodyRegionId, string>> = {
  head: 'Głowa', chest: 'Klatka piersiowa', abdomen: 'Brzuch', pelvis: 'Miednica', arms: 'Ręce', legs: 'Nogi',
};

/**
 * Region of a point on the atlas body (meters, Y up, feet at 0, +X = the body's left). Bands follow the
 * adult proportions of the atlas itself (height ≈ 1.73 m): chin ≈ 0.865 h, diaphragm ≈ 0.70 h,
 * iliac crest ≈ 0.57 h, groin ≈ 0.47 h; outside the trunk's half-width the point belongs to an arm.
 */
export function regionOfAtlasPoint(x: number, y: number, height: number): BodyRegionId {
  const r = y / height;
  if (r >= 0.855) return 'head';
  const half = r > 0.7 ? 0.105 * height : 0.1 * height;
  if (r > 0.44 && Math.abs(x) > half) return 'arms';
  if (r >= 0.7) return 'chest';
  if (r >= 0.57) return 'abdomen';
  if (r >= 0.47) return 'pelvis';
  return 'legs';
}

export interface ExploreOrgan {
  readonly id: string;
  readonly label: string;
  readonly region: BodyRegionId;
  /** The atlas structures that make up the organ; each stays its own tappable mesh in the body. */
  readonly atlas: (part: FullAtlasPart) => boolean;
  /** Canonical explorer organ for the existing macro→micro flow (tissue, microscope), when one exists. */
  readonly explorerOrganId?: string;
  /** One line for a layperson, textbook level. */
  readonly role: string;
}

const named = (re: RegExp, system?: string) => (p: FullAtlasPart) => (system === undefined || p.system === system) && re.test(p.name);
const inSkull = (p: FullAtlasPart) => p.bounds[0]![1]! > 1.35;

export const EXPLORE_ORGANS: readonly ExploreOrgan[] = [
  { id: 'brain', label: 'Mózg', region: 'head', explorerOrganId: 'brain', role: 'Steruje ciałem, zmysłami, pamięcią i myśleniem.',
    atlas: (p) => p.system === 'nervous' && inSkull(p) && !/nerve|ganglion|branch|spinal/i.test(p.name) },
  { id: 'eyes', label: 'Oczy', region: 'head', role: 'Zamieniają światło w sygnał dla mózgu.', atlas: named(/eyeball|cornea|\biris\b|\blens\b|retina$|sclera|vitreous|choroid$|corona ciliaris/i, 'sensory') },
  { id: 'heart', label: 'Serce', region: 'chest', explorerOrganId: 'heart', role: 'Pompuje krew do całego ciała.', atlas: (p) => p.system === 'cardiac' && !inSkull(p) },
  { id: 'airways', label: 'Drogi oddechowe', region: 'chest', explorerOrganId: 'left-lung', role: 'Tchawica i oskrzela prowadzą powietrze do płuc.', atlas: named(/trachea|bronch/i, 'respiratory') },
  { id: 'aorta', label: 'Aorta', region: 'chest', role: 'Największa tętnica: wyprowadza krew z serca.', atlas: named(/aorta$|^arch of aorta|^ascending aorta|^descending (thoracic )?aorta/i, 'arterial') },
  { id: 'stomach', label: 'Żołądek', region: 'abdomen', explorerOrganId: 'stomach', role: 'Trawi pokarm kwasem i enzymami.', atlas: named(/^stomach$/i, 'digestive') },
  { id: 'liver', label: 'Wątroba i drogi żółciowe', region: 'abdomen', explorerOrganId: 'liver', role: 'Oczyszcza krew, wytwarza żółć i magazynuje energię.', atlas: named(/liver|hepatic|biliary|gallbladder|cystic duct/i, 'digestive') },
  { id: 'pancreas', label: 'Trzustka', region: 'abdomen', explorerOrganId: 'pancreas', role: 'Wytwarza insulinę i enzymy trawienne.', atlas: named(/pancrea/i, 'digestive') },
  { id: 'intestine', label: 'Jelita', region: 'abdomen', explorerOrganId: 'small-intestine', role: 'Wchłaniają składniki pokarmu i wodę.', atlas: named(/duodenum|jejunum|ileum|ileocecal|colon|appendix|taenia/i, 'digestive') },
  { id: 'spleen', label: 'Śledziona', region: 'abdomen', role: 'Filtruje krew i wspiera odporność.', atlas: named(/^spleen$/i, 'lymphatic') },
  { id: 'kidneys', label: 'Nerki', region: 'abdomen', explorerOrganId: 'left-kidney', role: 'Filtrują krew i wytwarzają mocz.', atlas: named(/kidney|adrenal/i) },
  { id: 'bladder', label: 'Pęcherz moczowy', region: 'pelvis', role: 'Gromadzi mocz.', atlas: named(/urinary bladder|ureter|urethra/i, 'urinary') },
  { id: 'rectum', label: 'Odbytnica', region: 'pelvis', role: 'Końcowy odcinek jelita grubego.', atlas: named(/^rectum$/i, 'digestive') },
];

export function exploreOrgan(id: string | null): ExploreOrgan | null {
  return EXPLORE_ORGANS.find((o) => o.id === id) ?? null;
}

export function organsInRegion(region: BodyRegionId | null): readonly ExploreOrgan[] {
  return EXPLORE_ORGANS.filter((o) => o.region === region);
}

/** Polish names of common atlas terms outside the brain (the brain has its own dictionary). */
const TERMS_PL: Readonly<Record<string, string>> = {
  'wall of left atrium': 'Ściana lewego przedsionka', 'wall of right atrium': 'Ściana prawego przedsionka', 'wall of ventricle': 'Ściana komór',
  'cavity of left ventricle': 'Jama lewej komory', 'cavity of right ventricle': 'Jama prawej komory', 'cavity of left atrium': 'Jama lewego przedsionka', 'cavity of right atrium': 'Jama prawego przedsionka',
  'anterior leaflet of mitral valve': 'Zastawka mitralna, płatek przedni', 'posterior leaflet of mitral valve': 'Zastawka mitralna, płatek tylny',
  'anterior leaflet of tricuspid valve': 'Zastawka trójdzielna, płatek przedni', 'posterior leaflet of tricuspid valve': 'Zastawka trójdzielna, płatek tylny', 'septal leaflet of tricuspid valve': 'Zastawka trójdzielna, płatek przegrodowy',
  'anterior cusp of aortic valve': 'Zastawka aortalna, płatek przedni', 'left posterior cusp of aortic valve': 'Zastawka aortalna, płatek lewy tylny', 'right posterior cusp of aortic valve': 'Zastawka aortalna, płatek prawy tylny',
  'left anterior cusp of pulmonary valve': 'Zastawka płucna, płatek lewy przedni', 'right anterior cusp of pulmonary valve': 'Zastawka płucna, płatek prawy przedni', 'posterior cusp of pulmonary valve': 'Zastawka płucna, płatek tylny',
  'trachea': 'Tchawica', 'left main bronchus': 'Oskrzele główne lewe', 'right main bronchus proper': 'Oskrzele główne prawe',
  'arch of aorta': 'Łuk aorty', 'ascending aorta': 'Aorta wstępująca', 'descending aorta': 'Aorta zstępująca', 'descending thoracic aorta': 'Aorta piersiowa zstępująca', 'abdominal aorta': 'Aorta brzuszna',
  'stomach': 'Żołądek', 'esophagus': 'Przełyk', 'pancreas': 'Trzustka', 'parenchyma of pancreas': 'Miąższ trzustki', 'pancreatic duct': 'Przewód trzustkowy', 'pancreatic duct tree': 'Przewody trzustkowe',
  'duodenum': 'Dwunastnica', 'appendix': 'Wyrostek robaczkowy', 'ascending colon': 'Okrężnica wstępująca', 'transverse colon': 'Okrężnica poprzeczna', 'descending colon': 'Okrężnica zstępująca', 'rectum': 'Odbytnica',
  'proximal part of jejunum': 'Jelito czcze, początek', 'middle part of jejunum': 'Jelito czcze, środek', 'distal part of jejunum': 'Jelito czcze, koniec',
  'proximal part of ileum': 'Jelito kręte, początek', 'middle part of ileum': 'Jelito kręte, środek', 'distal part of ileum': 'Jelito kręte, koniec', 'ileocecal junction': 'Zastawka krętniczo-kątnicza',
  'caudate lobe of liver': 'Płat ogoniasty wątroby', 'gallbladder': 'Pęcherzyk żółciowy', 'common hepatic duct': 'Przewód wątrobowy wspólny', 'cystic duct': 'Przewód pęcherzykowy',
  'left hepatic duct': 'Przewód wątrobowy lewy', 'right hepatic duct': 'Przewód wątrobowy prawy', 'spleen': 'Śledziona',
  'left kidney': 'Nerka lewa', 'right kidney': 'Nerka prawa', 'left adrenal gland': 'Nadnercze lewe', 'right adrenal gland': 'Nadnercze prawe',
  'urinary bladder': 'Pęcherz moczowy', 'left ureter': 'Moczowód lewy', 'right ureter': 'Moczowód prawy', 'urethra': 'Cewka moczowa',
  'left cornea': 'Rogówka lewa', 'right cornea': 'Rogówka prawa', 'left lens': 'Soczewka lewa', 'right lens': 'Soczewka prawa', 'left iris': 'Tęczówka lewa', 'right iris': 'Tęczówka prawa',
  'left sclera': 'Twardówka lewa', 'right sclera': 'Twardówka prawa', 'left vitreous body': 'Ciało szkliste lewe', 'right vitreous body': 'Ciało szkliste prawe',
  'optic part of left retina': 'Siatkówka lewa', 'optic part of right retina': 'Siatkówka prawa', 'left choroid': 'Naczyniówka lewa', 'right choroid': 'Naczyniówka prawa',
};

export interface StructureLabel { readonly label: string; readonly detail: string | null }

/** What a tapped structure is called, and one line about it (hemisphere and role for the brain). */
export function structureLabel(organId: string | null, name: string): StructureLabel {
  if (organId === 'brain') {
    const b = brainPartLabel(name); const r = brainRegionOf(name);
    return { label: b.label, detail: `${b.side ? `${b.side} półkula · ` : ''}${r.label}: ${r.role}` };
  }
  const pl = TERMS_PL[name.toLowerCase()];
  if (pl) return { label: pl, detail: null };
  // Bronchial and biliary trees: many segment names, one readable family name.
  if (/bronchial tree/i.test(name)) return { label: `Drzewo oskrzelowe (${/^left|lingular/i.test(name) ? 'lewe płuco' : 'prawe płuco'})`, detail: name };
  if (/biliary tree|hepatic/i.test(name)) return { label: 'Drogi żółciowe wątroby', detail: name };
  return { label: name, detail: null };
}

/** One level deeper. A tap on something already selected keeps the state. */
export function exploreInto(state: ExploreState, hit: { kind: 'region'; id: BodyRegionId } | { kind: 'organ'; id: string } | { kind: 'structure'; name: string }): ExploreState {
  if (hit.kind === 'region') return { level: 'REGION', regionId: hit.id, organId: null, structure: null };
  if (hit.kind === 'organ') {
    const organ = exploreOrgan(hit.id);
    return organ ? { level: 'ORGAN', regionId: organ.region, organId: organ.id, structure: null } : state;
  }
  if (!state.organId) return state;
  return { ...state, level: 'STRUCTURE', structure: hit.name };
}

/** Back widens the focus by exactly one level: structure → organ → region → body. */
export function exploreBack(state: ExploreState): ExploreState {
  if (state.level === 'STRUCTURE') return { ...state, level: 'ORGAN', structure: null };
  if (state.level === 'ORGAN') return { level: 'REGION', regionId: state.regionId, organId: null, structure: null };
  return EXPLORE_BODY;
}

/** Breadcrumb from the body to the current focus, e.g. Ciało › Głowa › Mózg › Hipokamp. */
export function exploreCrumbs(state: ExploreState): readonly string[] {
  const out = ['Ciało'];
  if (state.regionId) out.push(REGION_LABEL[state.regionId]);
  const organ = exploreOrgan(state.organId);
  if (organ) out.push(organ.label);
  if (state.structure) out.push(structureLabel(state.organId, state.structure).label);
  return out;
}
