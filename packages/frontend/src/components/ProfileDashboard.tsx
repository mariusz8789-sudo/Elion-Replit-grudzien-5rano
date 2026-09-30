import { capabilityOverview, profileLabel, type AccountProfile } from '../core/accountProfiles';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import type { SimplifiedProfile } from '../core/profileNavigation';

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
        <strong>{tile.title}</strong>
        {!small && <small>{tile.text}</small>}
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
  const dashboard = PROFILE_DASHBOARDS[profile];
  const locked = capabilityOverview(profile as AccountProfile).filter((entry) => !entry.allowed).map((entry) => entry.label);
  return (
    <section className="pdash" aria-labelledby="pdash-title" data-testid="profile-dashboard" data-profile={profile}>
      <header className="pdash-head">
        <span className="pdash-profile">Profil: {profileLabel(profile)}</span>
        <h1 id="pdash-title">{dashboard.title}</h1>
        <p className="pdash-intro"><span className="pdash-intro-label">Co tu jest: </span>{dashboard.intro}</p>
      </header>
      <nav className="pdash-tiles" aria-label="Najważniejsze miejsca">
        {dashboard.tiles.map((tile) => <Tile key={tile.id} tile={tile} />)}
      </nav>
      {dashboard.shortcuts.length > 0 && (
        <div className="pdash-shortcuts">
          {dashboard.shortcuts.map((tile) => <Tile key={tile.id} tile={tile} small />)}
        </div>
      )}
      {dashboard.note !== undefined && <p className="pdash-note" data-testid="pdash-note">{dashboard.note}</p>}
      <a className="pdash-full" href={FULL_DASHBOARD_HASH} data-testid="pdash-full">Pokaż pełny pulpit Genesis</a>
      {locked.length > 0 && (
        <p className="pdash-locked" data-testid="pdash-locked">Twój profil nie obejmuje: {locked.join(', ')}.</p>
      )}
    </section>
  );
}

export default ProfileDashboard;
