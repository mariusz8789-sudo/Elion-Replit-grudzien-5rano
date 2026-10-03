import { getLocale, type Locale } from '../i18n';
import { ORGAN_ABOUT, REGION_LABEL, SYSTEM_PL, exploreOrgan, structureLabel, type BodyRegionId, type ExploreState, type StructureLabel } from './anatomyExplore';
import { anatomySideOf } from './anatomyNamesPl';

/**
 * Human Explorer words in Polish, English and Arabic. Polish is the source; English and Arabic are
 * written for this screen (the Arabic is a draft awaiting a native speaker's check). The ~1,040 atlas
 * structure names have verified Polish names; in English and Arabic they show the atlas's own English
 * anatomical name, never a guessed translation.
 */

type Triple = readonly [pl: string, en: string, ar: string];
const pick = (t: Triple, locale: Locale = getLocale()): string => (locale === 'ar' ? t[2] : locale === 'en' ? t[1] : t[0]);

const TEXT = {
  body: ['Ciało', 'Body', 'الجسم'],
  humanBody: ['Ciało człowieka', 'Human body', 'جسم الإنسان'],
  back: ['‹ Wstecz', '‹ Back', '‹ رجوع'],
  backAria: ['Wstecz o jeden poziom', 'Back one level', 'رجوع مستوى واحد'],
  whereAmI: ['Gdzie jesteś', 'Where you are', 'أين أنت'],
  tools: ['Narzędzia anatomii', 'Anatomy tools', 'أدوات التشريح'],
  menu: ['Menu anatomii', 'Anatomy menu', 'قائمة التشريح'],
  systems: ['Układy', 'Systems', 'الأجهزة'],
  bodySystems: ['Układy ciała', 'Body systems', 'أجهزة الجسم'],
  wholeBody: ['Całe ciało', 'Whole body', 'الجسم كله'],
  layers: ['Warstwy', 'Layers', 'الطبقات'],
  layersNote: ['Zdejmij warstwę, żeby zobaczyć, co leży pod nią.', 'Remove a layer to see what lies beneath it.', 'أزل طبقة لترى ما تحتها.'],
  remove: ['Zdejmij', 'Remove', 'إزالة'],
  show: ['Pokaż', 'Show', 'إظهار'],
  view: ['Widok', 'View', 'العرض'],
  search: ['Szukaj', 'Search', 'بحث'],
  searchTitle: ['Wyszukaj strukturę', 'Find a structure', 'ابحث عن بنية'],
  searchPlaceholder: ['np. łydka, kość udowa, aorta…', 'e.g. calf, femur, aorta…', 'مثل: الساق، عظم الفخذ، الأبهر…'],
  nothingFound: ['Nic nie znaleziono.', 'Nothing found.', 'لم يُعثر على شيء.'],
  notes: ['Notatki', 'Notes', 'ملاحظات'],
  addNote: ['Dodaj notatkę', 'Add a note', 'أضف ملاحظة'],
  notePlaceholder: ['Notatka', 'Note', 'ملاحظة'],
  saveNote: ['Zapisz notatkę', 'Save note', 'احفظ الملاحظة'],
  saveView: ['Zapisz widok', 'Save view', 'احفظ العرض'],
  takePhoto: ['Zrób zdjęcie', 'Take a picture', 'التقط صورة'],
  downloadPhoto: ['Pobierz zdjęcie', 'Download picture', 'نزّل الصورة'],
  savedViews: ['Zapisane widoki', 'Saved views', 'العروض المحفوظة'],
  deleteView: ['Usuń widok', 'Delete view', 'احذف العرض'],
  noteSaved: ['Notatka zapisana w tej przeglądarce.', 'Note saved in this browser.', 'حُفظت الملاحظة في هذا المتصفح.'],
  cannotSave: ['Ta przeglądarka nie pozwala zapisywać.', 'This browser does not allow saving.', 'هذا المتصفح لا يسمح بالحفظ.'],
  viewSaved: ['Widok zapisany w tej przeglądarce.', 'View saved in this browser.', 'حُفظ العرض في هذا المتصفح.'],
  photoReady: ['Zdjęcie gotowe: zapisz je poniżej.', 'Picture ready: save it below.', 'الصورة جاهزة: احفظها أدناه.'],
  photoFailed: ['Nie udało się zrobić zdjęcia tego widoku.', 'Could not take a picture of this view.', 'تعذّر التقاط صورة لهذا العرض.'],
  hintRegion: ['Dotknij narządu, mięśnia, kości albo nazwy. Warstwy zdejmują to, co leży na wierzchu.', 'Tap an organ, a muscle, a bone or a name. Layers remove what lies on top.', 'المس عضوًا أو عضلة أو عظمة أو اسمًا. الطبقات تزيل ما في الأعلى.'],
  hintBody: ['Dotknij części ciała albo wybierz układ. Każdą strukturę można też wyszukać.', 'Tap a part of the body or choose a system. Any structure can also be searched.', 'المس جزءًا من الجسم أو اختر جهازًا. يمكن أيضًا البحث عن أي بنية.'],
  systemPrefix: ['Układ', 'System:', 'جهاز'],
  macroToMicro: ['Od makro do mikro', 'From macro to micro', 'من الكبير إلى الدقيق'],
  histology: ['Histologia', 'Histology', 'علم الأنسجة'],
  view3d: ['Widok 3D', '3D view', 'عرض ثلاثي الأبعاد'],
  inBody: ['W ciele', 'In the body', 'داخل الجسم'],
  section: ['Przekrój', 'Section', 'مقطع'],
  closeSection: ['Zamknij przekrój', 'Close section', 'أغلق المقطع'],
  vessels: ['Unaczynienie', 'Blood supply', 'التروية الدموية'],
  nerves: ['Nerwy', 'Nerves', 'الأعصاب'],
  function: ['Funkcja', 'Function', 'الوظيفة'],
  blood: ['Krew', 'Blood', 'الدم'],
  working: ['Trwa…', 'Working…', 'جارٍ…'],
  microscope: ['Mikroskop', 'Microscope', 'المجهر'],
  bloodUnder: ['Krew pod mikroskopem', 'Blood under the microscope', 'الدم تحت المجهر'],
  tissue: ['Tkanka', 'Tissue', 'نسيج'],
  cellInside: ['Wnętrze komórki', 'Inside the cell', 'داخل الخلية'],
  cell: ['Komórka', 'Cell', 'خلية'],
  scale: ['skala', 'scale', 'المقياس'],
  slide: ['preparat histologiczny', 'histology slide', 'شريحة نسيجية'],
  virtualScope: ['mikroskop wirtualny', 'virtual microscope', 'مجهر افتراضي'],
  modelNotPatient: ['MODEL, nie zdjęcie pacjenta', 'MODEL, not a patient image', 'نموذج، وليس صورة مريض'],
  epiMODEL: ['MODEL', 'MODEL', 'نموذج'], epiSIMULATION: ['SYMULACJA', 'SIMULATION', 'محاكاة'], epiPREDICTION: ['PRZEWIDYWANIE', 'PREDICTION', 'تنبؤ'],
  epiREAL_DATA: ['DANE RZECZYWISTE', 'REAL DATA', 'بيانات حقيقية'], epiREAL_MEASUREMENT: ['POMIAR', 'REAL MEASUREMENT', 'قياس حقيقي'],
  epiEXTERNAL_REFERENCE: ['ŹRÓDŁO ZEWNĘTRZNE', 'EXTERNAL REFERENCE', 'مرجع خارجي'], epiUNKNOWN: ['NIEZNANE', 'UNKNOWN', 'غير معروف'], epiBLOCKED: ['ZABLOKOWANE', 'BLOCKED', 'محظور'],
  toDrug: ['Od narządu do leku', 'From organ to drug', 'من العضو إلى الدواء'],
  dTargets: ['Cele molekularne', 'Molecular targets', 'الأهداف الجزيئية'], dCandidates: ['Kandydaci', 'Candidates', 'المرشحون'],
  dPredictions: ['Przewidywania', 'Predictions', 'التنبؤات'], dExperiments: ['Eksperymenty', 'Experiments', 'التجارب'], dMeasurements: ['Pomiary', 'Measurements', 'القياسات'],
  notYetAvailable: ['jeszcze niedostępne', 'not yet available', 'غير متاح بعد'], notYetMeasured: ['jeszcze nie zmierzone', 'not yet measured', 'لم يُقس بعد'],
  toDrugNote: ['Genesis nie łączy jeszcze tego miejsca z celami leków. Nic tu nie jest zmyślone.', 'Genesis does not yet link this place to drug targets. Nothing here is invented.', 'لا يربط Genesis هذا المكان بأهداف الأدوية بعد. لا شيء هنا مختلق.'],
  sectionWhere: ['Położenie przekroju', 'Section position', 'موضع المقطع'],
  axisSAGITTAL: ['lewo–prawo', 'left–right', 'يسار–يمين'], axisCORONAL: ['przód–tył', 'front–back', 'أمام–خلف'], axisAXIAL: ['góra–dół', 'top–bottom', 'أعلى–أسفل'],
  labTitle: ['Laboratorium Genesis', 'Genesis laboratory', 'مختبر Genesis'],
  labHint: ['Człowiek stoi w szklanej komorze. Dotknij go, żeby podejść bliżej.', 'A human stands in the glass chamber. Tap it to walk closer.', 'يقف إنسان في الحجرة الزجاجية. المسه لتقترب.'],
  approach: ['Podejdź do człowieka', 'Walk up to the human', 'اقترب من الإنسان'],
  lab: ['Laboratorium', 'Laboratory', 'المختبر'],
  genericSample: ['próbka ogólna, nie z tego narządu', 'generic sample, not from this organ', 'عينة عامة، ليست من هذا العضو'],
  textbookSchematic: ['schemat podręcznikowy, nie skan tkanki', 'textbook schematic, not a tissue scan', 'مخطط من كتاب دراسي، ليس مسحًا للنسيج'],
  genericCell: ['model komórki ogólnej, nie komórki beta', 'generic cell model, not a beta cell', 'نموذج خلية عامة، ليس خلية بيتا'],
  surfaceSkin: ['Skóra', 'Skin', 'الجلد'],
  surfaceXray: ['RTG', 'X-ray', 'أشعة سينية'],
  surfaceGhost: ['Duch', 'Ghost', 'شفاف'],
  side: ['strona', 'side', 'الجانب'],
  left: ['lewa', 'left', 'الأيسر'],
  right: ['prawa', 'right', 'الأيمن'],
  namesInEnglish: ['', 'Anatomical name from the atlas.', 'الاسم التشريحي من الأطلس (بالإنجليزية).'],
} as const satisfies Record<string, Triple>;

export type ExplorerTextKey = keyof typeof TEXT;
export function tx(key: ExplorerTextKey, locale?: Locale): string { return pick(TEXT[key], locale); }

const REGION: Readonly<Record<BodyRegionId, Triple>> = {
  head: ['Głowa', 'Head', 'الرأس'], chest: ['Klatka piersiowa', 'Chest', 'الصدر'], abdomen: ['Brzuch', 'Abdomen', 'البطن'],
  pelvis: ['Miednica', 'Pelvis', 'الحوض'], arms: ['Ręce', 'Arms', 'الذراعان'], legs: ['Nogi', 'Legs', 'الساقان'],
};
export function regionName(id: BodyRegionId): string { return getLocale() === 'pl' ? REGION_LABEL[id] : pick(REGION[id]); }

const SYSTEM: Readonly<Record<string, Triple>> = {
  skin: ['Skórny', 'Integumentary', 'الجهاز الجلدي'], skeleton: ['Szkieletowy', 'Skeletal', 'الجهاز الهيكلي'], muscles: ['Mięśniowy', 'Muscular', 'الجهاز العضلي'],
  nervous: ['Nerwowy', 'Nervous', 'الجهاز العصبي'], circulatory: ['Krążenia', 'Circulatory', 'جهاز الدوران'], respiratory: ['Oddechowy', 'Respiratory', 'الجهاز التنفسي'],
  digestive: ['Pokarmowy', 'Digestive', 'الجهاز الهضمي'], urinary: ['Moczowy', 'Urinary', 'الجهاز البولي'], reproductive: ['Rozrodczy', 'Reproductive', 'الجهاز التناسلي'],
  endocrine: ['Dokrewny', 'Endocrine', 'جهاز الغدد الصماء'], lymphatic: ['Limfatyczny', 'Lymphatic', 'الجهاز اللمفاوي'],
};
export function bodySystemName(id: string, fallback: string): string { const t = SYSTEM[id]; return t ? pick(t) : fallback; }

const LAYER: Readonly<Record<string, Triple>> = {
  muscles: ['mięśnie', 'muscles', 'العضلات'], bones: ['kości', 'bones', 'العظام'], vessels: ['naczynia', 'vessels', 'الأوعية'],
  nerves: ['nerwy', 'nerves', 'الأعصاب'], organs: ['narządy', 'organs', 'الأعضاء'],
};
export function layerName(id: string, fallback: string): string { const t = LAYER[id]; return t ? pick(t) : fallback.toLowerCase(); }

const KIND: Readonly<Record<string, Triple>> = {
  skeletal: ['kość', 'bone', 'عظم'], muscular: ['mięsień', 'muscle', 'عضلة'], connective: ['tkanka łączna', 'connective tissue', 'نسيج ضام'],
  arterial: ['tętnica', 'artery', 'شريان'], venous: ['żyła', 'vein', 'وريد'], lymphatic: ['układ chłonny', 'lymphatic system', 'الجهاز اللمفاوي'],
  nervous: ['układ nerwowy', 'nervous system', 'الجهاز العصبي'], sensory: ['narząd zmysłu', 'sense organ', 'عضو حسي'], cardiac: ['serce', 'heart', 'القلب'],
  digestive: ['układ pokarmowy', 'digestive system', 'الجهاز الهضمي'], respiratory: ['układ oddechowy', 'respiratory system', 'الجهاز التنفسي'],
  urinary: ['układ moczowy', 'urinary system', 'الجهاز البولي'], endocrine: ['gruczoł dokrewny', 'endocrine gland', 'غدة صماء'],
  reproductive: ['układ rozrodczy', 'reproductive system', 'الجهاز التناسلي'], integumentary: ['skóra', 'skin', 'الجلد'],
};
export function atlasKindName(system: string): string { return getLocale() === 'pl' ? SYSTEM_PL[system] ?? system : KIND[system] ? pick(KIND[system]) : system; }

const LADDER: Readonly<Record<string, Triple>> = {
  body: ['Ciało', 'Body', 'الجسم'], organ: ['Narząd', 'Organ', 'العضو'], structure: ['Struktura', 'Structure', 'البنية'], tissue: ['Tkanka', 'Tissue', 'النسيج'], cell: ['Komórka', 'Cell', 'الخلية'],
  organelle: ['Organellum', 'Organelle', 'العُضيّة'], molecule: ['Cząsteczka', 'Molecule', 'الجزيء'], dna: ['DNA', 'DNA', 'DNA'],
};
export function ladderName(level: string, fallback: string): string { const t = LADDER[level]; return t ? pick(t) : fallback; }

const TISSUE: Readonly<Record<string, Triple>> = {
  CARDIAC: ['mięsień sercowy', 'heart muscle', 'عضلة القلب'], NEURAL: ['tkanka nerwowa', 'nerve tissue', 'نسيج عصبي'],
  LUNG: ['pęcherzyki płucne', 'lung alveoli', 'الحويصلات الرئوية'], LIVER: ['zraziki wątroby', 'liver lobules', 'فصيصات الكبد'],
  PANCREAS: ['trzustka · gronka i wysepka Langerhansa', 'pancreas · acini and an islet of Langerhans', 'البنكرياس · العنيبات وجزيرة لانغرهانس'],
  EPITHELIUM: ['nabłonek', 'epithelium', 'ظهارة'], GENERIC: ['tkanka ogólna', 'generic tissue', 'نسيج عام'], BLOOD: ['krew · rozmaz referencyjny', 'blood · reference smear', 'دم · لطاخة مرجعية'],
};
export function tissueName(type: string): string { const t = TISSUE[type]; return t ? pick(t) : type.toLowerCase(); }

const ORGAN: Readonly<Record<string, { name: Triple; role: readonly [string, string]; about: readonly [string, string]; system: readonly [string, string] }>> = {
  brain: { name: ['Mózg', 'Brain', 'الدماغ'], role: ['Controls the body, the senses, memory and thinking.', 'يتحكم في الجسم والحواس والذاكرة والتفكير.'], system: ['Nervous system', 'الجهاز العصبي'],
    about: ['The brain receives signals from the senses and sends commands to the muscles. The cortex handles thinking, speech and movement, the cerebellum balance, and the brainstem breathing and heartbeat.', 'يستقبل الدماغ الإشارات من الحواس ويرسل الأوامر إلى العضلات. القشرة مسؤولة عن التفكير والكلام والحركة، والمخيخ عن التوازن، وجذع الدماغ عن التنفس ونبض القلب.'] },
  eyes: { name: ['Oczy', 'Eyes', 'العينان'], role: ['Turn light into a signal for the brain.', 'تحوّلان الضوء إلى إشارة للدماغ.'], system: ['Sense organs', 'أعضاء الحس'],
    about: ['The cornea and lens focus light on the retina. Retinal cells turn it into a signal that the optic nerve carries to the brain.', 'تركّز القرنية والعدسة الضوء على الشبكية. تحوّله خلايا الشبكية إلى إشارة ينقلها العصب البصري إلى الدماغ.'] },
  heart: { name: ['Serce', 'Heart', 'القلب'], role: ['Pumps blood to the whole body.', 'يضخ الدم إلى الجسم كله.'], system: ['Circulatory system', 'جهاز الدوران'],
    about: ['The heart is a muscle with four chambers: two atria and two ventricles. The right side pumps blood to the lungs, the left side to the whole body. Valves keep blood flowing one way.', 'القلب عضلة ذات أربع حجرات: أذينان وبطينان. الجانب الأيمن يضخ الدم إلى الرئتين، والأيسر إلى الجسم كله. الصمامات تجعل الدم يتدفق في اتجاه واحد.'] },
  airways: { name: ['Drogi oddechowe', 'Airways', 'المجاري التنفسية'], role: ['The trachea and bronchi carry air to the lungs.', 'تنقل القصبة الهوائية والشعب الهواء إلى الرئتين.'], system: ['Respiratory system', 'الجهاز التنفسي'],
    about: ['The trachea splits into two main bronchi and then ever finer branches. At their ends, in the alveoli, oxygen passes into the blood and carbon dioxide out of it.', 'تنقسم القصبة الهوائية إلى شعبتين رئيسيتين ثم إلى فروع أدق فأدق. في نهاياتها، في الحويصلات الهوائية، ينتقل الأكسجين إلى الدم وثاني أكسيد الكربون منه.'] },
  aorta: { name: ['Aorta', 'Aorta', 'الأبهر'], role: ['The largest artery: carries blood out of the heart.', 'أكبر شريان: يخرج الدم من القلب.'], system: ['Circulatory system', 'جهاز الدوران'],
    about: ['The aorta leaves the left ventricle, arches over and runs down along the spine. Arteries to the head, arms, abdominal organs and legs branch from it.', 'يخرج الأبهر من البطين الأيسر وينحني قوسًا ثم ينزل بمحاذاة العمود الفقري. تتفرع منه الشرايين إلى الرأس والذراعين وأعضاء البطن والساقين.'] },
  stomach: { name: ['Żołądek', 'Stomach', 'المعدة'], role: ['Digests food with acid and enzymes.', 'يهضم الطعام بالحمض والإنزيمات.'], system: ['Digestive system', 'الجهاز الهضمي'],
    about: ['The stomach receives food from the oesophagus, mixes it with hydrochloric acid and enzymes, then moves it in portions into the duodenum.', 'تستقبل المعدة الطعام من المريء وتمزجه بحمض الهيدروكلوريك والإنزيمات، ثم تدفعه على دفعات إلى الاثني عشر.'] },
  liver: { name: ['Wątroba i drogi żółciowe', 'Liver and bile ducts', 'الكبد والقنوات الصفراوية'], role: ['Cleans the blood, makes bile and stores energy.', 'ينقّي الدم ويصنع الصفراء ويخزن الطاقة.'], system: ['Digestive system', 'الجهاز الهضمي'],
    about: ['The liver is the largest gland in the body. It breaks down drugs and toxins, stores sugar as glycogen and makes bile, which flows through the bile ducts to the intestine and helps digest fat.', 'الكبد أكبر غدة في الجسم. يفكك الأدوية والسموم ويخزن السكر على شكل غليكوجين ويصنع الصفراء التي تصل عبر القنوات الصفراوية إلى الأمعاء وتساعد على هضم الدهون.'] },
  pancreas: { name: ['Trzustka', 'Pancreas', 'البنكرياس'], role: ['Makes insulin and digestive enzymes.', 'يصنع الإنسولين والإنزيمات الهاضمة.'], system: ['Digestive and endocrine systems', 'الجهازان الهضمي والصماوي'],
    about: ['The pancreas has two jobs: it releases digestive enzymes into the duodenum, and its islets release insulin and glucagon into the blood to control blood sugar.', 'للبنكرياس وظيفتان: يفرز الإنزيمات الهاضمة في الاثني عشر، وتفرز جزره الإنسولين والغلوكاغون في الدم لتنظيم سكر الدم.'] },
  intestine: { name: ['Jelita', 'Intestines', 'الأمعاء'], role: ['Absorb nutrients and water.', 'تمتص المغذيات والماء.'], system: ['Digestive system', 'الجهاز الهضمي'],
    about: ['The small intestine (duodenum, jejunum and ileum) absorbs nutrients. The large intestine recovers water and forms stool.', 'تمتص الأمعاء الدقيقة (الاثنا عشر والصائم واللفائفي) المغذيات. وتستعيد الأمعاء الغليظة الماء وتكوّن البراز.'] },
  spleen: { name: ['Śledziona', 'Spleen', 'الطحال'], role: ['Filters the blood and supports immunity.', 'يرشّح الدم ويدعم المناعة.'], system: ['Lymphatic system', 'الجهاز اللمفاوي'],
    about: ['The spleen removes old red blood cells from the blood and stores some of the white blood cells that help fight infection.', 'يزيل الطحال خلايا الدم الحمراء القديمة ويخزن جزءًا من خلايا الدم البيضاء التي تساعد على مكافحة العدوى.'] },
  kidneys: { name: ['Nerki', 'Kidneys', 'الكليتان'], role: ['Filter the blood and make urine.', 'ترشّحان الدم وتصنعان البول.'], system: ['Urinary system', 'الجهاز البولي'],
    about: ['The kidneys filter the blood and remove excess water, salt and waste as urine. They also help control blood pressure. The adrenal glands sit on top of them.', 'ترشّح الكليتان الدم وتزيلان الماء والملح والفضلات الزائدة على شكل بول. وتساعدان أيضًا في تنظيم ضغط الدم. تقع الغدتان الكظريتان فوقهما.'] },
  bladder: { name: ['Pęcherz moczowy', 'Urinary bladder', 'المثانة'], role: ['Stores urine.', 'تخزّن البول.'], system: ['Urinary system', 'الجهاز البولي'],
    about: ['The ureters carry urine from the kidneys to the bladder, which stores it, and the urethra carries it out of the body.', 'ينقل الحالبان البول من الكليتين إلى المثانة التي تخزنه، ويخرجه الإحليل من الجسم.'] },
  rectum: { name: ['Odbytnica', 'Rectum', 'المستقيم'], role: ['The last part of the large intestine.', 'الجزء الأخير من الأمعاء الغليظة.'], system: ['Digestive system', 'الجهاز الهضمي'],
    about: ['The rectum is the last part of the large intestine. It holds stool before it leaves the body.', 'المستقيم هو الجزء الأخير من الأمعاء الغليظة. يحتفظ بالبراز قبل خروجه من الجسم.'] },
};

const en = (locale: Locale): 0 | 1 => (locale === 'ar' ? 1 : 0);

export function organName(id: string): string {
  const locale = getLocale(); const o = exploreOrgan(id);
  if (locale === 'pl' || !ORGAN[id]) return o?.label ?? id;
  return pick(ORGAN[id]!.name, locale);
}
export function organRole(id: string): string {
  const locale = getLocale(); const o = exploreOrgan(id);
  return locale === 'pl' || !ORGAN[id] ? o?.role ?? '' : ORGAN[id]!.role[en(locale)];
}
export function organAbout(id: string): { system: string; about: string } | null {
  const locale = getLocale(); const pl = ORGAN_ABOUT[id];
  if (!pl) return null;
  if (locale === 'pl' || !ORGAN[id]) return pl;
  const i = en(locale);
  return { system: ORGAN[id]!.system[i], about: ORGAN[id]!.about[i] };
}

/** The atlas name made readable ("Left gastrocnemius" stays English, first letter up). */
function atlasName(name: string): string { return name.charAt(0).toUpperCase() + name.slice(1); }

/** A structure's name and one line about it, in the chosen language. */
export function structureText(organId: string | null, name: string, system?: string | null): StructureLabel {
  const locale = getLocale();
  if (locale === 'pl') return structureLabel(organId, name, system);
  const side = anatomySideOf(name);
  const where = [side ? `${tx(side === 'lewa' ? 'left' : 'right', locale)} ${tx('side', locale)}` : null, system ? atlasKindName(system) : organId ? organName(organId) : null].filter(Boolean).join(' · ');
  return { label: atlasName(name), detail: [where, tx('namesInEnglish', locale)].filter(Boolean).join('. ') };
}

/** Breadcrumb in the chosen language. */
export function crumbsText(state: ExploreState): string[] {
  const out = [tx('body')];
  if (state.regionId) out.push(regionName(state.regionId));
  if (state.organId && exploreOrgan(state.organId)) out.push(organName(state.organId));
  if (state.structure) out.push(structureText(state.organId, state.structure, state.system).label);
  return out;
}
