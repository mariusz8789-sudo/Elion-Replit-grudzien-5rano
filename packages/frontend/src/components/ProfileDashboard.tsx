import { capabilityOverview, profileLabel, type AccountProfile } from '../core/accountProfiles';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import type { SimplifiedProfile } from '../core/profileNavigation';
import { getLocale, useLocale } from '../core/i18n';

/** English and Arabic for this page; Polish is the source text above (the Arabic is a draft for a native check). */
const TR: Readonly<Record<string, readonly [string, string]>> = {
  'Poznaj ciało człowieka': ['Explore the human body', 'استكشف جسم الإنسان'], 'Skóra, szkielet, narządy, mózg': ['Skin, skeleton, organs, brain', 'الجلد والهيكل والأعضاء والدماغ'],
  'Laboratorium': ['Laboratory', 'المختبر'], 'Fizyka, chemia i biologia': ['Physics, chemistry and biology', 'الفيزياء والكيمياء والأحياء'],
  'Słowniczek': ['Glossary', 'المسرد'], 'Pojęcia wyjaśnione prostym językiem': ['Terms explained in plain words', 'مصطلحات مشروحة بلغة بسيطة'],
  'Zadaj pytanie': ['Ask a question', 'اطرح سؤالًا'], 'Napisz, czego chcesz się dowiedzieć': ['Write what you want to find out', 'اكتب ما تريد معرفته'],
  'Dowody i powtórzenie': ['Evidence & Replay', 'الأدلة وإعادة التشغيل'], 'Skąd są wyniki i jak je powtórzyć': ['Where results come from and how to re-run them', 'مصدر النتائج وكيفية إعادة تشغيلها'],
  'Dane CERN': ['CERN data', 'بيانات سيرن'], 'Prawdziwe zdarzenia CMS, offline': ['Real CMS events, offline', 'أحداث CMS حقيقية، دون اتصال'],
  'Pokój recenzenta': ['Reviewer Room', 'غرفة المراجع'], 'Sprawdź dowody i podpis wyniku': ['Check the evidence and the result signature', 'تحقق من الأدلة وتوقيع النتيجة'],
  'Twój pulpit — uczeń': ['Your dashboard: pupil', 'لوحتك: تلميذ'], 'Twój pulpit — student': ['Your dashboard: student', 'لوحتك: طالب جامعي'], 'Twój pulpit — nauczyciel': ['Your dashboard: teacher', 'لوحتك: معلّم'],
  'Tu poznasz ciało człowieka, zrobisz eksperyment i zapytasz o to, czego nie rozumiesz.': ['Here you explore the human body, run an experiment and ask about what you do not understand.', 'هنا تستكشف جسم الإنسان وتجري تجربة وتسأل عمّا لا تفهمه.'],
  'Nauka, laboratoria i prawdziwe dane: możesz sprawdzić, skąd pochodzi każdy wynik.': ['Learning, laboratories and real data: you can check where every result comes from.', 'تعلّم ومختبرات وبيانات حقيقية: يمكنك التحقق من مصدر كل نتيجة.'],
  'Materiały, które możesz pokazać na lekcji: człowiek, laboratorium, dane i dowody.': ['Material you can show in class: the human body, the laboratory, data and evidence.', 'مواد يمكنك عرضها في الدرس: جسم الإنسان والمختبر والبيانات والأدلة.'],
  'Widoki dla klasy: w przygotowaniu. Na razie nie ma listy uczniów ani zadań dla klasy.': ['Class views: in preparation. There is no pupil list or class assignments yet.', 'عروض الصف: قيد الإعداد. لا توجد بعد قائمة تلاميذ ولا مهام للصف.'],
  'Profil': ['Profile', 'الملف الشخصي'], 'Co tu jest: ': ['What is here: ', 'ما الموجود هنا: '], 'Najważniejsze miejsca': ['Main places', 'الأماكن الرئيسية'],
  'Pokaż pełny pulpit Genesis': ['Show the full Genesis dashboard', 'اعرض لوحة Genesis الكاملة'], 'Twój profil nie obejmuje': ['Your profile does not include', 'ملفك الشخصي لا يشمل'],
  'Uczeń / szkoła': ['Pupil / school', 'تلميذ / مدرسة'], 'Student': ['Student', 'طالب جامعي'], 'Nauczyciel': ['Teacher', 'معلّم'], 'Badacz / naukowiec': ['Researcher / scientist', 'باحث / عالم'], 'Firma / instytucja': ['Company / institution', 'شركة / مؤسسة'],
  'Nauka i laboratoria edukacyjne': ['Learning and educational labs', 'التعلّم والمختبرات التعليمية'], 'Czytanie wyników i dowodów': ['Reading results and evidence', 'قراءة النتائج والأدلة'],
  'Widoki dla klasy i nauczania': ['Class and teaching views', 'عروض الصف والتدريس'], 'Uruchamianie silników obliczeniowych': ['Running compute engines', 'تشغيل محركات الحوسبة'],
  'Kampanie odkrywania leków': ['Drug discovery campaigns', 'حملات اكتشاف الأدوية'], 'Źródła instytucjonalne (RESTRICTED)': ['Institutional sources (RESTRICTED)', 'مصادر مؤسسية (مقيّدة)'],
};
/** This page's Polish text in the chosen language. */
export function L(pl: string): string {
  const locale = getLocale(); const t = TR[pl];
  return !t || locale === 'pl' || locale === 'es' ? pl : locale === 'ar' ? t[1] : t[0];
}

/**
 * PULPIT PROFILU — prosty start dla ucznia, studenta i nauczyciela.
 *
 * Jeden ekran telefonu, kilka dużych kafli prowadzących do PRAWDZIWYCH tras
 * (każdy `hash` rozpoznaje `parseHash` w App.tsx). Bez liczb i statusów:
 * pulpit mówi tylko, dokąd można pójść. Pełny pulpit Genesis (StartHero) jest
 * zawsze o jedno stuknięcie dalej (`#/?full`).
 */

export const FULL_DASHBOARD_HASH = '#/?full';

export interface DashboardTile {
  readonly id: string;
  readonly icon: string;
  readonly title: string;
  readonly text: string;
  /** Prawdziwa trasa albo `undefined` dla akcji „Zadaj pytanie” (otwiera czat). */
  readonly hash?: string;
}

const LEARNER_TILES: readonly DashboardTile[] = [
  { id: 'human', icon: '🧍', title: 'Poznaj ciało człowieka', text: 'Skóra, szkielet, narządy, mózg', hash: '#/human-biology-lab' },
  { id: 'lab', icon: '⌬', title: 'Laboratorium', text: 'Fizyka, chemia i biologia', hash: '#/scientific-worlds' },
  { id: 'glossary', icon: '📚', title: 'Słowniczek', text: 'Pojęcia wyjaśnione prostym językiem', hash: '#/glossary' },
  { id: 'ask', icon: '✦', title: 'Zadaj pytanie', text: 'Napisz, czego chcesz się dowiedzieć' },
];

const byId = new Map(LEARNER_TILES.map((tile) => [tile.id, tile] as const));
const pick = (...ids: string[]): DashboardTile[] => ids.map((id) => byId.get(id)).filter((tile): tile is DashboardTile => tile !== undefined);

/** Student i nauczyciel: pięć dużych kafli; słowniczek i pytanie jako małe skróty pod nimi. */
const STUDENT_TILES: readonly DashboardTile[] = [
  ...pick('human', 'lab'),
  { id: 'evidence', icon: '📋', title: 'Dowody i powtórzenie', text: 'Skąd są wyniki i jak je powtórzyć', hash: '#/evidence' },
  { id: 'cern', icon: '⚛', title: 'Dane CERN', text: 'Prawdziwe zdarzenia CMS, offline', hash: '#/physics/cms-z' },
  { id: 'reviewer', icon: '🔎', title: 'Pokój recenzenta', text: 'Sprawdź dowody i podpis wyniku', hash: '#/reviewer' },
];
const STUDENT_SHORTCUTS: readonly DashboardTile[] = pick('glossary', 'ask');

export interface ProfileDashboardContent {
  readonly title: string;
  readonly intro: string;
  /** 3–5 dużych kafli. */
  readonly tiles: readonly DashboardTile[];
  /** Małe skróty pod kaflami (opcjonalne). */
  readonly shortcuts: readonly DashboardTile[];
  readonly note?: string;
}

/** Co pokazuje pulpit każdego profilu — edytuj tutaj. */
export const PROFILE_DASHBOARDS: Readonly<Record<SimplifiedProfile, ProfileDashboardContent>> = Object.freeze({
  UCZEN: {
    title: 'Twój pulpit — uczeń',
    intro: 'Tu poznasz ciało człowieka, zrobisz eksperyment i zapytasz o to, czego nie rozumiesz.',
    tiles: LEARNER_TILES,
    shortcuts: [],
  },
  STUDENT: {
    title: 'Twój pulpit — student',
    intro: 'Nauka, laboratoria i prawdziwe dane: możesz sprawdzić, skąd pochodzi każdy wynik.',
    tiles: STUDENT_TILES,
    shortcuts: STUDENT_SHORTCUTS,
  },
  NAUCZYCIEL: {
    title: 'Twój pulpit — nauczyciel',
    intro: 'Materiały, które możesz pokazać na lekcji: człowiek, laboratorium, dane i dowody.',
    tiles: STUDENT_TILES,
    shortcuts: STUDENT_SHORTCUTS,
    note: 'Widoki dla klasy: w przygotowaniu. Na razie nie ma listy uczniów ani zadań dla klasy.',
  },
});

function Tile({ tile, small = false }: { tile: DashboardTile; small?: boolean }): JSX.Element {
  const className = small ? 'pdash-tile pdash-shortcut' : 'pdash-tile';
  const body = (
    <>
      <span className="pdash-tile-icon" aria-hidden="true">{tile.icon}</span>
      <span className="pdash-tile-text">
        <strong>{L(tile.title)}</strong>
        {!small && <small>{L(tile.text)}</small>}
      </span>
      <span className="pdash-tile-arrow" aria-hidden="true">›</span>
    </>
  );
  if (tile.hash === undefined) {
    return (
      <button type="button" className={className} onClick={() => requestOpenScienceChat()} data-testid={`pdash-tile-${tile.id}`}>
        {body}
      </button>
    );
  }
  return <a className={className} href={tile.hash} data-testid={`pdash-tile-${tile.id}`}>{body}</a>;
}

export function ProfileDashboard({ profile }: { profile: SimplifiedProfile }): JSX.Element {
  useLocale();
  const dashboard = PROFILE_DASHBOARDS[profile];
  const locked = capabilityOverview(profile as AccountProfile).filter((entry) => !entry.allowed).map((entry) => L(entry.label));
  return (
    <section className="pdash" aria-labelledby="pdash-title" data-testid="profile-dashboard" data-profile={profile}>
      <header className="pdash-head">
        <span className="pdash-profile">{L('Profil')}: {L(profileLabel(profile))}</span>
        <h1 id="pdash-title">{L(dashboard.title)}</h1>
        <p className="pdash-intro"><span className="pdash-intro-label">{L('Co tu jest: ')}</span>{L(dashboard.intro)}</p>
      </header>
      <nav className="pdash-tiles" aria-label={L('Najważniejsze miejsca')}>
        {dashboard.tiles.map((tile) => <Tile key={tile.id} tile={tile} />)}
      </nav>
      {dashboard.shortcuts.length > 0 && (
        <div className="pdash-shortcuts">
          {dashboard.shortcuts.map((tile) => <Tile key={tile.id} tile={tile} small />)}
        </div>
      )}
      {dashboard.note !== undefined && <p className="pdash-note" data-testid="pdash-note">{L(dashboard.note)}</p>}
      <a className="pdash-full" href={FULL_DASHBOARD_HASH} data-testid="pdash-full">{L('Pokaż pełny pulpit Genesis')}</a>
      {locked.length > 0 && (
        <p className="pdash-locked" data-testid="pdash-locked">{L('Twój profil nie obejmuje')}: {locked.join(', ')}.</p>
      )}
    </section>
  );
}

export default ProfileDashboard;
