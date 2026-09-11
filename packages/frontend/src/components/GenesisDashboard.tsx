import { useEffect, useMemo, useState } from 'react';
import { listExperiments, type SavedExperiment } from '../core/scienceMemory';
import { kindsOf, type MatrixKind } from './GenesisMatrixHub';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import { getToken, useSession } from '../core/backend/session';
import { listProjects, type Project } from '../core/backend/client';
import { synthesizeNextQuestion } from '../core/agent/crossDomainSynthesis';
import { subscribeScienceMemory } from '../core/scienceMemoryEvents';

/** Where to send the user for a cross-domain next question — the one screen
 * that always shows the record (`#/matrix`) unless the domain has its own
 * dedicated workspace already registered in `navigation.ts`. Exported so it
 * can be pinned directly, the same way `decideNextAction` is below. */
export function crossDomainHash(labId: string): string {
  if (labId === 'cyber-security') return '#/cyber';
  if (labId === 'decipherment') return '#/decipherment';
  return '#/matrix';
}

/**
 * GENESIS DASHBOARD — the mission surface of the application.
 *
 * This is NOT a second state system and NOT a second data layer. Every
 * number on this screen is derived at render time from stores that already
 * exist and are already the single source of truth elsewhere:
 *   - scientific counts  → `listExperiments()` (the same Science Memory that
 *                          Matrix and Scientific Memory read) classified by
 *                          `kindsOf()`, imported from GenesisMatrixHub so
 *                          there is exactly ONE classification rule in the
 *                          codebase, not two that can drift apart
 *   - system status      → the backend's real `GET /api/health` payload
 *   - active project     → the real `GET /api/projects` for the signed-in
 *                          session; never invented, never a placeholder
 *   - science chat       → `requestOpenScienceChat()`, which surfaces the ONE
 *                          globally mounted `ScienceChat`
 *
 * HONESTY RULES this screen keeps:
 *   - A count that is zero is shown as zero with a real way to create the
 *     first record. It is never padded, never seeded with demo data.
 *   - Anything the backend has not answered yet reads "sprawdzam…", and
 *     anything it cannot answer reads "niedostępne" — not a fake green light.
 *   - NEXT ACTION is chosen from what the loop actually lacks (no hypotheses
 *     → start one; hypotheses but no evidence → collect evidence). It is
 *     navigation grounded in real counts, not a generated recommendation
 *     dressed up as an AI decision.
 */

interface HealthPayload {
  readonly ok?: boolean;
  readonly version?: string;
  readonly uptimeSec?: number;
  readonly ai?: string;
  readonly persistence?: string;
  readonly static?: boolean;
  readonly toolchain?: readonly { id: string; status: string; version: string | null }[];
}

type HealthState =
  | { phase: 'loading' }
  | { phase: 'ready'; payload: HealthPayload }
  | { phase: 'unreachable' };

/** The four loop stages the dashboard summarises, in scientific order. */
const LOOP_TILES: readonly { kind: MatrixKind; label: string; hash: string; hint: string }[] = [
  { kind: 'HYPOTHESIS', label: 'Hipotezy', hash: '#/genesis-world', hint: 'Discovery Loop w World Engine' },
  { kind: 'EXPERIMENT', label: 'Eksperymenty', hash: '#/first-person-lab', hint: 'Scenario Engine, pilot eksperymentu' },
  { kind: 'EVIDENCE', label: 'Evidence', hash: '#/drug', hint: 'Dochodzenia i weryfikacja predykcji' },
  { kind: 'SCENARIO', label: 'Scenariusze', hash: '#/what-if', hint: 'Rozgałęzienia i porównania' },
];

/**
 * The backend reports each tool's real status string — today `AVAILABLE` or
 * `BLOCKED_BY_RUNTIME` from `listToolchain()`. Matching those exact values
 * matters: an over-narrow match would render "0/6 gotowych" on a perfectly
 * healthy install, which is the same class of lie as a fake green light.
 */
function isToolReady(tool: { status: string }): boolean {
  return tool.status === 'AVAILABLE' || tool.status === 'ready' || tool.status === 'ok';
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '—';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'przed chwilą';
  if (min < 60) return `${min} min temu`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} godz. temu`;
  return `${Math.round(h / 24)} dni temu`;
}

/**
 * The single next step, decided by what the record set actually lacks.
 * Exported so it can be tested directly against real `SavedExperiment`
 * shapes without a DOM.
 */
export function decideNextAction(counts: Record<MatrixKind, number>): { title: string; why: string; cta: string; hash: string } {
  if (counts.HYPOTHESIS === 0 && counts.EXPERIMENT === 0 && counts.EVIDENCE === 0) {
    return {
      title: 'Postaw pierwszą hipotezę',
      why: 'Pamięć Naukowa jest pusta — pętla nie ma jeszcze od czego się zacząć.',
      cta: 'Otwórz World Engine',
      hash: '#/genesis-world',
    };
  }
  if (counts.HYPOTHESIS > 0 && counts.EVIDENCE === 0) {
    return {
      title: 'Zbierz evidence dla istniejących hipotez',
      why: `${counts.HYPOTHESIS} hipotez${counts.HYPOTHESIS === 1 ? 'a jest' : 'y są'} zapisan${counts.HYPOTHESIS === 1 ? 'a' : 'e'}, ale żadna nie została jeszcze skonfrontowana z realnym pomiarem.`,
      cta: 'Otwórz Drug Discovery',
      hash: '#/drug',
    };
  }
  if (counts.EVIDENCE > 0 && counts.SCENARIO === 0) {
    return {
      title: 'Rozgałęź scenariusz na podstawie evidence',
      why: 'Masz potwierdzone obserwacje, ale żadnego wariantu „co gdyby" zbudowanego na nich.',
      cta: 'Otwórz Co by było, gdyby?',
      hash: '#/what-if',
    };
  }
  return {
    title: 'Przejrzyj pełną mapę w Matrix',
    why: 'Pętla jest domknięta na wszystkich etapach — Matrix pokazuje relacje między nimi.',
    cta: 'Otwórz Genesis Matrix',
    hash: '#/matrix',
  };
}

export function GenesisDashboard(): JSX.Element {
  const session = useSession();
  const [records, setRecords] = useState<readonly SavedExperiment[]>([]);
  const [health, setHealth] = useState<HealthState>({ phase: 'loading' });
  const [projects, setProjects] = useState<readonly Project[] | null>(null);
  const [ask, setAsk] = useState('');

  useEffect(() => {
    // Re-read on every Science Memory write, not only at mount: Home hosts the
    // real chat inline, so a loop saved in the conversation must be visible to
    // the Next Question card beside it without a reload.
    const read = (): void => setRecords(listExperiments());
    read();
    return subscribeScienceMemory(read);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((payload: HealthPayload) => { if (!cancelled) setHealth({ phase: 'ready', payload }); })
      .catch(() => { if (!cancelled) setHealth({ phase: 'unreachable' }); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) { setProjects(null); return; }
    let cancelled = false;
    void listProjects(token).then((r) => { if (!cancelled) setProjects(r.ok ? r.data : []); });
    return () => { cancelled = true; };
  }, [session]);

  const counts = useMemo(() => {
    const base = {
      HYPOTHESIS: 0, WORLD: 0, MODEL: 0, SCENARIO: 0, EVIDENCE: 0,
      CYBER: 0, DECIPHERMENT: 0, RESEARCH_CHAIN: 0, REPLAY: 0, EXPERIMENT: 0,
    } as Record<MatrixKind, number>;
    for (const record of records) for (const kind of kindsOf(record)) base[kind] += 1;
    return base;
  }, [records]);

  const recent = useMemo(() => records.slice(0, 5), [records]);
  const focus = recent[0] ?? null;
  const next = useMemo(() => decideNextAction(counts), [counts]);
  /**
   * CROSS-DOMAIN NEXT QUESTION (master gap plan P1.3) — a read-only
   * projection over the SAME `records` this screen already loaded, looking
   * across every domain's own already-persisted terminal-status/conflict
   * vocabulary (`synthesizeNextQuestion`, crossDomainSynthesis.ts) rather
   * than `decideNextAction`'s coarse stage counts above. When it finds a
   * genuinely open item, it replaces the generic "Postaw pierwszą hipotezę"
   * card with the specific one; when it finds nothing (its own honest
   * `null`, not an empty placeholder), the existing count-based `next`
   * stands unchanged. No second Memory, no second Discovery Engine.
   */
  const crossDomain = useMemo(() => synthesizeNextQuestion(records), [records]);
  const activeProject = projects && projects.length > 0 ? projects[0] : null;

  const submitAsk = (): void => {
    const text = ask.trim();
    if (!text) return;
    setAsk('');
    requestOpenScienceChat(text);
  };

  return (
    <div className="dash">
      <header className="dash-top">
        <div className="dash-top-main">
          <span className="dash-eyebrow">Genesis · Mission Control</span>
          <h1 className="dash-title">
            {focus ? focus.experimentName : 'Brak aktywnej misji'}
          </h1>
          <p className="dash-subtitle">
            {focus
              ? <>Ostatni przebieg: {timeAgo(focus.createdAt)} · {kindsOf(focus).join(' · ')} · epistemic: {focus.epistemicStatus}</>
              : <>Genesis nie zarejestrował jeszcze żadnego przebiegu. Poniżej jest realny pierwszy krok — nic tu nie jest zapełnione danymi demonstracyjnymi.</>}
          </p>
        </div>
        <div className="dash-top-actions">
          <button className="dash-btn dash-btn-primary" onClick={() => { window.location.hash = '#/matrix'; }}>
            ◈ Otwórz Matrix
          </button>
          <button className="dash-btn" onClick={() => requestOpenScienceChat()}>
            ▸ Science Chat
          </button>
        </div>
      </header>

      <div className="dash-ask">
        <input
          className="dash-ask-input"
          value={ask}
          placeholder={'Zapytaj Genesis — np. „zasymuluj odpływ z 2 ha po ulewie 40 mm/h”'}
          aria-label="Zapytaj Genesis"
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitAsk(); }}
        />
        <button className="dash-ask-send" onClick={submitAsk} disabled={!ask.trim()}>Wyślij →</button>
      </div>

      <section className="dash-loop" aria-label="Stan pętli naukowej">
        {LOOP_TILES.map((tile) => (
          <button key={tile.kind} className="dash-tile" onClick={() => { window.location.hash = counts[tile.kind] > 0 ? '#/matrix' : tile.hash; }}>
            <span className="dash-tile-count">{counts[tile.kind]}</span>
            <span className="dash-tile-label">{tile.label}</span>
            <span className="dash-tile-hint">{counts[tile.kind] > 0 ? 'Pokaż w Matrix →' : tile.hint}</span>
          </button>
        ))}
      </section>

      <div className="dash-grid">
        <section className="dash-card dash-card-next" aria-label="Następny krok" data-testid="dash-next-step">
          <div className="dash-card-head"><span className="dash-card-kicker">Następny krok</span></div>
          {crossDomain ? (
            <div className="dash-cross-domain" data-testid="dash-cross-domain-question">
              <h2 className="dash-next-title">{crossDomain.question}</h2>
              <p className="dash-next-why">{crossDomain.whyThisQuestion}</p>
              <p className="gsc-caption">{crossDomain.whyNow}</p>
              {crossDomain.conflicts.length > 0 && (
                <p className="gsc-caption dash-next-conflict">
                  Konflikt w tej domenie: {crossDomain.conflicts[0]}
                </p>
              )}
              {crossDomain.relatedPriorWork.length > 0 && (
                <p className="gsc-caption">
                  Powiązana wcześniejsza praca: {crossDomain.relatedPriorWork.length} rekord(y)
                  ({crossDomain.relatedPriorWork.map((r) => r.relation).join(', ')}).
                </p>
              )}
              <p className="gsc-caption dash-next-test">Następny test: {crossDomain.nextTestOrExperiment}</p>
              <button
                className="dash-btn dash-btn-primary"
                onClick={() => { window.location.hash = crossDomainHash(crossDomain.domain); }}
              >
                Otwórz {crossDomain.domain} →
              </button>
            </div>
          ) : (
            <>
              <h2 className="dash-next-title">{next.title}</h2>
              <p className="dash-next-why">{next.why}</p>
              <button className="dash-btn dash-btn-primary" onClick={() => { window.location.hash = next.hash; }}>{next.cta} →</button>
            </>
          )}
        </section>

        <section className="dash-card" aria-label="Ostatnia aktywność naukowa">
          <div className="dash-card-head">
            <span className="dash-card-kicker">Ostatnia aktywność</span>
            {records.length > 0 && <button className="dash-card-more" onClick={() => { window.location.hash = '#/memory'; }}>Pamięć Naukowa →</button>}
          </div>
          {recent.length === 0 ? (
            <p className="dash-empty">
              Brak zapisanych przebiegów. Każdy uruchomiony eksperyment, scenariusz i dochodzenie trafia tutaj automatycznie —
              ta lista zapełni się realnymi danymi, nie przykładowymi.
            </p>
          ) : (
            <ul className="dash-activity">
              {recent.map((record) => (
                <li key={record.id}>
                  <button className="dash-activity-row" onClick={() => { window.location.hash = '#/matrix'; }}>
                    <span className="dash-activity-name">{record.experimentName}</span>
                    <span className="dash-activity-meta">{kindsOf(record).join(' · ')} · {timeAgo(record.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dash-card" aria-label="Status systemu">
          <div className="dash-card-head"><span className="dash-card-kicker">Status systemu</span></div>
          {health.phase === 'loading' && <p className="dash-empty">Sprawdzam backend…</p>}
          {health.phase === 'unreachable' && (
            <p className="dash-empty">
              Backend niedostępny. Aplikacja działa w trybie lokalnym: symulacje i Pamięć Naukowa
              w przeglądarce nadal działają, ale konta, projekty i weryfikacja serwerowa są wyłączone.
            </p>
          )}
          {health.phase === 'ready' && (
            <ul className="dash-status">
              <li><span>Backend</span><span className="dash-ok">online · v{health.payload.version ?? '—'}</span></li>
              <li><span>Persystencja</span><span className={health.payload.persistence === 'ready' ? 'dash-ok' : 'dash-warn'}>{health.payload.persistence ?? 'nieznana'}</span></li>
              <li><span>Warstwa AI</span><span className={health.payload.ai === 'ready' ? 'dash-ok' : 'dash-warn'}>{health.payload.ai === 'ready' ? 'gotowa' : 'brak klucza'}</span></li>
              <li><span>Pamięć Naukowa</span><span className="dash-ok">{records.length} rekordów</span></li>
              {health.payload.toolchain && health.payload.toolchain.length > 0 && (
                <li>
                  <span>Toolchain</span>
                  <span className="dash-ok">
                    {health.payload.toolchain.filter(isToolReady).length}/{health.payload.toolchain.length} gotowych
                  </span>
                </li>
              )}
            </ul>
          )}
        </section>

        <section className="dash-card" aria-label="Aktywny projekt">
          <div className="dash-card-head"><span className="dash-card-kicker">Aktywny projekt</span></div>
          {!session ? (
            <>
              <p className="dash-empty">
                Nie jesteś zalogowany. Projekty w chmurze, współdzielone dochodzenia i weryfikacja serwerowa
                wymagają konta; cała praca lokalna działa bez niego.
              </p>
              <button className="dash-btn" onClick={() => { window.location.hash = '#/projects'; }}>Zaloguj się →</button>
            </>
          ) : activeProject ? (
            <>
              <h2 className="dash-next-title">{activeProject.name}</h2>
              <p className="dash-next-why">{activeProject.description || 'Bez opisu.'} · rola: {activeProject.role}</p>
              <button className="dash-btn" onClick={() => { window.location.hash = '#/projects'; }}>Zarządzaj projektami →</button>
            </>
          ) : projects === null ? (
            <p className="dash-empty">Wczytuję projekty…</p>
          ) : (
            <>
              <p className="dash-empty">Zalogowany jako {session.user.email}, ale nie masz jeszcze żadnego projektu.</p>
              <button className="dash-btn" onClick={() => { window.location.hash = '#/projects'; }}>Utwórz projekt →</button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default GenesisDashboard;
