import { getLocale, type Locale } from './i18n';
import { NAV_ITEMS, activeNavId, type NavItem, type NavSection } from './navigation';

/**
 * Menu words in English and Arabic. Polish lives in navigation.ts itself (the source); an entry
 * missing here shows its Polish label. Arabic falls back to English for the long tail of modules.
 * The Arabic is a draft awaiting a native speaker's check.
 */

type Pair = readonly [en: string, ar?: string];

const ITEMS: Readonly<Record<string, { label: Pair; short?: Pair; description?: Pair }>> = {
  home: { label: ['Start', 'البداية'], short: ['Start', 'البداية'], description: ['Overview: areas, recent research and evidence', 'نظرة عامة: المجالات والأبحاث الأخيرة والأدلة'] },
  chat: { label: ['Ask Genesis', 'اسأل Genesis'], short: ['Ask', 'اسأل'], description: ['Describe a research task; Genesis routes it to a model or the right screen'] },
  discover: { label: ['Research runs', 'عمليات البحث'], short: ['Runs', 'العمليات'], description: ['Start a run: candidates, evidence, falsification and the Winner Gate'] },
  inquiry: { label: ['Hypotheses', 'الفرضيات'], description: ['Genesis proposes hypotheses and drops the ones the computation contradicts'] },
  science: { label: ['Drug discovery', 'اكتشاف الأدوية'], description: ['Drug candidates for a protein: docking, synthesis route, evidence', 'مرشحو الأدوية لبروتين: الالتحام وطريق التخليق والأدلة'] },
  'human-biology-lab': { label: ['Human biology', 'بيولوجيا الإنسان'], short: ['Human', 'الإنسان'], description: ['Human atlas: body, organ, tissue, cell', 'أطلس الإنسان: الجسم والعضو والنسيج والخلية'] },
  molecule: { label: ['Molecules', 'الجزيئات'], description: ['A molecule in 3D: geometry, bonds and properties'] },
  'cms-open-data': { label: ['Physics & CERN', 'الفيزياء وسيرن'], description: ['Real CMS Z→μμ events; offline analysis, not a live detector', 'أحداث CMS حقيقية Z→μμ؛ تحليل غير متصل، وليس كاشفًا مباشرًا'] },
  'scientific-worlds': { label: ['Laboratory & simulations', 'المختبر والمحاكاة'], short: ['Lab', 'المختبر'], description: ['One space for Genesis experiments and simulations', 'مساحة واحدة لتجارب Genesis ومحاكاتها'] },
  evidence: { label: ['Evidence & Replay', 'الأدلة وإعادة التشغيل'], short: ['Evidence', 'الأدلة'], description: ['Where a result comes from, and whether a re-run gives the same', 'مصدر النتيجة وهل تعطي إعادة التشغيل النتيجة نفسها'] },
  reviewer: { label: ['Reviewer Room', 'غرفة المراجع'], description: ['Try to break a result: inputs, tests, negative results', 'حاول نقض النتيجة: المدخلات والاختبارات والنتائج السلبية'] },
  memory: { label: ['Scientific Memory', 'الذاكرة العلمية'], description: ['Saved runs, plans registered before the result, provenance'] },
  verify: { label: ['Genesis Verify', 'Genesis Verify'], description: ['Upload a Genesis record: fingerprints, the ledger and a replay of the computation, HTML report'] },
  'flight-control': { label: ['Science Flight Control'], description: ['Research runs, the job queue and experiment flights; pause, resume, cancel'] },
  dossier: { label: ['Candidates', 'المرشحون'], description: ['Saved candidates with their evidence; download the dossier'] },
  pilot: { label: ['Evidence packs & exports', 'حزم الأدلة والتصدير'], description: ['Plan → result → an evidence pack to download and replay'] },
  'scientific-os': { label: ['All capabilities', 'كل الإمكانات'], description: ['The full catalogue, each entry with its audited status', 'الكتالوج الكامل، لكل بند حالته المدققة'] },
  account: { label: ['Account: sign in or sign up', 'الحساب: تسجيل الدخول أو إنشاء حساب'], description: ['Sign in, register and your account profile'] },
  settings: { label: ['Settings', 'الإعدادات'], description: ['Account, projects, research mode'] },
  projects: { label: ['Projects (cloud)', 'المشاريع (السحابة)'] },
  campaign: { label: ['Advanced scientific campaign'], description: ['Specialist view: candidates, plans, evidence and replay'] },
  'gov-campaign': { label: ['Drug discovery for the public sector'], description: ['A full campaign on a real candidate pool: screening, falsification, safety gate, verdict'] },
  cde: { label: ['Discovery engine'] },
  precision: { label: ['Molecule reference analysis'] },
  chemistry: { label: ['Chemistry: titration station'], description: ['Charge balance in the main Laboratory'] },
  'chemistry-classic': { label: ['Chemistry: classic laboratory'] },
  'virtual-bio': { label: ['Virtual biology lab'], description: ['Teaching models: cell, pharmacokinetics, receptor, antibiotic resistance'] },
  'cell-lab': { label: ['Virtual cell'] },
  physics: { label: ['Physics: light in curved spacetime'], description: ['The Laboratory observation window: Shapiro delay and light bending (model)'] },
  'black-hole': { label: ['Black hole: Schwarzschild'], description: ['Horizon radius and light paths around a black hole'] },
  geodesics: { label: ['Photons around a black hole'] },
  universe: { label: ['Universe: the three-body problem'], description: ['Three bodies moving, computed step by step'] },
  'cern-complex': { label: ['CERN complex'], description: ['Walk the hall, tunnel and detector chamber: a collision model, separate from the CMS data'] },
  collider: { label: ['CERN: detector chamber'] },
  'lab-fpv': { label: ['Quantum laboratory'] },
  entanglement: { label: ['Entanglement measures'] },
  clockwork: { label: ['CLOCKWORK: office deadlines'], description: ['Statutory deadlines of an office, computed deterministically'] },
  whatif: { label: ['What if?'], description: ['Branch at the moment of decision and compare the outcomes'] },
  'decision-explorer': { label: ['Decision explorer'] },
  conflict: { label: ['Model conflict'] },
  'protection-priority': { label: ['Who to protect first?'] },
  'investor-demo': { label: ['Guided demo'], description: ['Experiment, result and evidence in one run'] },
  tour: { label: ['Voice guide'] },
  glossary: { label: ['Glossary', 'المسرد'] },
  'dome-world': { label: ['Dome vs globe'] },
  calibration: { label: ['How long is the infectious period?'] },
  'knowledge-sources': { label: ['Knowledge and public sources'], description: ['Proposed sources; a person publishes or rejects each one'] },
  'meta-cognition': { label: ['Genesis self-audit'], description: ['What Genesis knows, where it contradicts itself and what it lacks'] },
  'discovery-log': { label: ['Discovery log'] },
  worlds: { label: ['Worlds and crisis simulations'], description: ['Synthetic worlds: city, flood, wildfire, epidemic. Scenarios, not forecasts'] },
  simulation: { label: ['Simulation generator'] },
  'world-director': { label: ['World Director'], description: ['Text description → 3D world'] },
  'world-proposal': { label: ['Propose a world'] },
  city3d: { label: ['3D city'] },
  'first-person-lab': { label: ['Laboratory: scenarios'] },
  reality: { label: ['Reality Navigator: an orbit and its variants', 'مستكشف الواقع: مدار ومتغيراته'], description: ['Change the star’s mass or the orbit, compare variants, save the scene and compute it again', 'غيّر كتلة النجم أو المدار، وقارن المتغيرات، واحفظ المشهد وأعد حسابه'] },
  mirror: { label: ['Genesis Mirror'], description: ['Synthetic skeleton, no camera'] },
  'matrix-map': { label: ['Matrix: system map'], description: ['Every run and how it connects'] },
  matrix: { label: ['Matrix: HUD'] },
  'myths-theories': { label: ['Myths and theories'], description: ['Speculative spacetime models: an openly labelled sandbox'] },
  decipherment: { label: ['Decipherment'] },
  cyber: { label: ['Cyber'], description: ['Incident investigation on a toy application: hypotheses and evidence, no accusations'] },
};

/** Main groups and More groups. */
const GROUPS: Readonly<Record<string, Pair>> = {
  research: ['Research', 'البحث'], explore: ['Explore', 'استكشاف'], proof: ['Proof', 'الإثبات'],
  operations: ['Operations', 'العمليات'], deliver: ['Deliver', 'التسليم'],
  'more-ls': ['Life sciences', 'علوم الحياة'], 'more-physics': ['Physics and space', 'الفيزياء والفضاء'],
  'more-public': ['Decisions and public sector', 'القرارات والقطاع العام'], 'more-learning': ['Learning and knowledge', 'التعلم والمعرفة'],
  'more-system': ['Account and platform', 'الحساب والمنصة'], 'more-showcase': ['DEMO · showcases and experiments', 'عرض تجريبي · عروض وتجارب'],
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
  search: ['Szukaj', 'Search', 'بحث'],
  searchHint: ['Szukaj celu, miejsca albo możliwości…', 'Search a goal, a place or a capability…', 'ابحث عن هدف أو مكان أو إمكانية…'],
  collapse: ['Zwiń menu', 'Collapse menu', 'طي القائمة'],
  expand: ['Rozwiń menu', 'Expand menu', 'توسيع القائمة'],
  explorer: ['Wszystko w Genesis', 'Everything in Genesis', 'كل شيء في Genesis'],
  moreModules: ['Więcej modułów', 'More modules', 'وحدات أخرى'],
  demo: ['DEMO', 'DEMO', 'DEMO'],
  demoNote: ['Syntetyczne pokazy i eksperymenty wewnętrzne. Działają, ale nie są dowodem ani produktem.', 'Synthetic showcases and internal experiments. They run, but they are not evidence and not a product.', 'عروض اصطناعية وتجارب داخلية. تعمل، لكنها ليست دليلًا ولا منتجًا.'],
  soon: ['wkrótce', 'soon', 'قريبًا'],
  serverStatus: ['Stan serwera', 'Server status', 'حالة الخادم'],
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

/** Every id with an English label: a test keeps the English menu complete. */
export const TRANSLATED_NAV_IDS: readonly string[] = Object.keys(ITEMS);

/**
 * The title a screen's top bar shows: the navigation name of the place the hash
 * belongs to, in the chosen language (Arabic falls back to English), so the
 * title always matches the menu. A route with no menu entry (a deep link) keeps
 * the title its screen passed.
 */
export function screenTitle(hash: string, fallback: string, locale: Locale = getLocale()): string {
  const id = activeNavId(hash);
  const item = id === null ? undefined : NAV_ITEMS.find((entry) => entry.id === id);
  return item ? navLabel(item, locale) : fallback;
}
