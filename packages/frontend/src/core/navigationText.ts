import { getLocale, type Locale } from './i18n';
import type { NavItem, NavSection } from './navigation';

/**
 * Menu words in English and Arabic. Polish lives in navigation.ts itself (the source); an entry
 * missing here shows its Polish label. Arabic falls back to English for the long tail of modules.
 * The Arabic is a draft awaiting a native speaker's check.
 */

type Pair = readonly [en: string, ar?: string];

const ITEMS: Readonly<Record<string, { label: Pair; short?: Pair; description?: Pair }>> = {
  home: { label: ['Start', 'البداية'], short: ['Start', 'البداية'], description: ['Overview: areas, recent research, evidence and engines', 'نظرة عامة: المجالات والأبحاث الأخيرة والأدلة والمحركات'] },
  science: { label: ['Drug discovery', 'اكتشاف الأدوية'], description: ['Docking, retrosynthesis, Evidence and Replay', 'الالتحام الجزيئي والتخليق الرجعي والأدلة وإعادة التشغيل'] },
  'human-biology-lab': { label: ['Human · Human Explorer', 'الإنسان · مستكشف الجسم'], short: ['Human', 'الإنسان'], description: ['Human atlas: skin, skeleton, organs, brain, cell', 'أطلس الإنسان: الجلد والهيكل والأعضاء والدماغ والخلية'] },
  reviewer: { label: ['Reviewer Room', 'غرفة المراجع'], description: ['Check the evidence and the CSRN signature', 'تحقق من الأدلة وتوقيع CSRN'] },
  evidence: { label: ['Evidence & Replay', 'الأدلة وإعادة التشغيل'], description: ['Where results come from, and re-running them', 'مصدر النتائج وإعادة تشغيلها'] },
  'scientific-worlds': { label: ['Laboratory', 'المختبر'], short: ['Lab', 'المختبر'], description: ['One space for Genesis experiments', 'مساحة واحدة لتجارب Genesis'] },
  'cms-open-data': { label: ['CERN · CMS data', 'سيرن · بيانات CMS'], description: ['Real CMS Z→μμ events; offline analysis, not the live LHC', 'أحداث CMS حقيقية Z→μμ؛ تحليل غير متصل، وليس مصادم LHC مباشرًا'] },
  discover: { label: ['Research console', 'وحدة البحث'], description: ['Candidates, evidence, falsification and the Winner Gate', 'المرشحون والأدلة والتفنيد وبوابة الفائز'] },
  chat: { label: ['Ask', 'اسأل'], short: ['Ask', 'اسأل'] },
  'scientific-os': { label: ['All capabilities', 'كل الإمكانات'], description: ['Everything in 7 groups, with its audited status', 'كل شيء في 7 مجموعات مع حالته المدققة'] },
  account: { label: ['Account: sign in or sign up', 'الحساب: تسجيل الدخول أو إنشاء حساب'] },
  settings: { label: ['Settings', 'الإعدادات'] },
  projects: { label: ['Projects (cloud)', 'المشاريع (السحابة)'] },
  campaign: { label: ['Advanced scientific campaign'] },
  'gov-campaign': { label: ['Government drug discovery: public-sector demo'] },
  cde: { label: ['Discovery engine (CDE)'] },
  pilot: { label: ['Experiment pilot'] },
  chemistry: { label: ['Chemistry: titration station'] },
  'chemistry-classic': { label: ['Chemistry: classic laboratory'] },
  physics: { label: ['Physics: light in curved spacetime'] },
  'black-hole': { label: ['Black hole: Schwarzschild'] },
  geodesics: { label: ['Photons around a black hole'] },
  universe: { label: ['Universe: the three-body problem'] },
  'cern-complex': { label: ['CERN complex'] },
  collider: { label: ['CERN: detector chamber'] },
  entanglement: { label: ['Entanglement measures'] },
  'myths-theories': { label: ['Myths and theories'] },
  'virtual-bio': { label: ['Virtual Lab: biology'] },
  memory: { label: ['Evidence and memory'] },
  'flight-control': { label: ['Science Flight Control'], description: ['Research runs, the job queue and experiment flights; pause, resume, cancel'] },
  'discovery-log': { label: ['Discovery log'] },
  'knowledge-sources': { label: ['Knowledge and public sources'] },
  verify: { label: ['Genesis Verify: check a result record'], description: ['Upload a Genesis record: sha256 fingerprints, the ledger and a replay of the computation, HTML report'] },
  worlds: { label: ['Visualisations and worlds'] },
  simulation: { label: ['Simulation generator'] },
  'world-proposal': { label: ['Propose a world'] },
  city3d: { label: ['3D city (WebGL)'] },
  reality: { label: ['Reality Navigator: an orbit and its variants', 'مستكشف الواقع: مدار ومتغيراته'], description: ['Change the star’s mass or the orbit, compare variants, save the scene and compute it again', 'غيّر كتلة النجم أو المدار، وقارن المتغيرات، واحفظ المشهد وأعد حسابه'] },
  'first-person-lab': { label: ['First-person laboratory'] },
  mirror: { label: ['Genesis Mirror: experimental'] },
  'matrix-map': { label: ['Matrix: system map'] },
  whatif: { label: ['What if?'] },
  conflict: { label: ['Model conflict'] },
  inquiry: { label: ['Autonomous inquiry'] },
  calibration: { label: ['How long is the infectious period?'] },
  'dome-world': { label: ['Dome vs globe'] },
  'protection-priority': { label: ['Who to protect first?'] },
  decipherment: { label: ['Decipherment'] },
  glossary: { label: ['Glossary', 'المسرد'] },
  clockwork: { label: ['CLOCKWORK: office deadlines'] },
  'investor-demo': { label: ['Guided demo'] },
  tour: { label: ['Genesis Tour: voice guide'] },
};

const GROUPS: Readonly<Record<string, Pair>> = {
  'more-ls': ['Life sciences', 'علوم الحياة'], 'more-evidence': ['Evidence and verification', 'الأدلة والتحقق'],
  'more-public': ['Government and public sector', 'الحكومة والقطاع العام'], 'more-physics': ['Physics, quantum and CERN', 'الفيزياء والكم وسيرن'],
  'more-worlds': ['World and digital twin', 'العالم والتوأم الرقمي'], 'more-learning': ['Education', 'التعليم'],
  'more-system': ['Platform', 'المنصة'], 'more-showcase': ['Showcases (experiments)', 'عروض (تجارب)'],
};

const SHELL = {
  more: ['Więcej', 'More', 'المزيد'],
  moreAll: ['Więcej · wszystkie moduły', 'More · all modules', 'المزيد · كل الوحدات'],
  allAreas: ['Wszystkie obszary Genesis', 'All areas of Genesis', 'كل مجالات Genesis'],
  closeMenu: ['Zamknij menu', 'Close menu', 'أغلق القائمة'],
  signIn: ['Zaloguj się', 'Sign in', 'تسجيل الدخول'],
  orSignUp: ['lub załóż konto', 'or create an account', 'أو أنشئ حسابًا'],
  signInShort: ['Zaloguj', 'Sign in', 'دخول'],
  account: ['Konto', 'Account', 'الحساب'],
  signInOrUp: ['Zaloguj się lub załóż konto', 'Sign in or create an account', 'سجّل الدخول أو أنشئ حسابًا'],
  otherViews: ['inne widoki', 'other views', 'عروض أخرى'],
  showViews: ['Pokaż', 'Show', 'إظهار'],
  hideViews: ['Ukryj', 'Hide', 'إخفاء'],
  navigation: ['Nawigacja Genesis', 'Genesis navigation', 'تنقل Genesis'],
  language: ['Język', 'Language', 'اللغة'],
  profileMenu: ['Menu dla profilu', 'Menu for profile', 'قائمة الملف الشخصي'],
} as const satisfies Record<string, readonly [string, string, string]>;

export function shellText(key: keyof typeof SHELL, locale: Locale = getLocale()): string {
  const t = SHELL[key];
  return locale === 'ar' ? t[2] : locale === 'en' ? t[1] : t[0];
}

function pickPair(pair: Pair | undefined, locale: Locale): string | undefined {
  if (!pair) return undefined;
  return locale === 'ar' ? pair[1] ?? pair[0] : pair[0];
}

export function navLabel(item: NavItem, locale: Locale = getLocale()): string {
  if (locale === 'pl') return item.label;
  return pickPair(ITEMS[item.id]?.label, locale) ?? item.label;
}

export function navShortLabel(item: NavItem, locale: Locale = getLocale()): string {
  if (locale === 'pl') return item.shortLabel ?? item.label.split(' ')[0]!;
  return pickPair(ITEMS[item.id]?.short, locale) ?? navLabel(item, locale).split(' ')[0]!;
}

/** The Polish line under a label, or its translation; a module without one shows no line in EN/AR. */
export function navDescription(item: NavItem, locale: Locale = getLocale()): string | undefined {
  if (locale === 'pl') return item.description;
  return pickPair(ITEMS[item.id]?.description, locale);
}

export function navGroupLabel(section: NavSection, locale: Locale = getLocale()): string {
  if (locale === 'pl') return section.label;
  return pickPair(GROUPS[section.id], locale) ?? section.label;
}
