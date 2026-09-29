import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import { listExperiments, type SavedExperiment } from '../core/scienceMemory';
import { getGenesisCapability } from '../core/capabilities/genesisCapabilityRegistry';
import { ASTEX, ASTEX_TRAINING_OVERLAP, CSRN_KEY, IMATINIB } from '../core/home/homeFacts';
import { HomeEnginesRow } from './home/HomeEngines';

/**
 * START — the dashboard. It is an OVERVIEW only: what Genesis is, the four
 * areas with one plain sentence and one honest status each, recent research,
 * evidence status and the engines. Navigation lives in the menu (AppShell),
 * the conversation lives in Ask (the one ScienceChat). Neither is repeated here.
 *
 * STATUS RULE (owner's): no number or status is typed in by hand. Each one is
 * read from a real source, and a source that has nothing shows an honest empty
 * state:
 *   - Drug Discovery  → committed Astex records (`homeFacts`)
 *   - Human Biology   → a description of the path, no count
 *   - Evidence        → committed imatinib Replay record (`homeFacts`)
 *   - Physics & CERN  → capability registry entry `cern-cms-open-data`
 *   - Recent research → `listExperiments()` (Scientific Memory in this browser)
 *   - CSRN signature  → published key file (`CSRN_KEY`)
 *   - Engines         → `GET /api/compute/toolchain`, live
 *   - Backend         → `GET /api/health`, live
 */

type Health = 'checking' | 'online' | 'offline';

const CMS = getGenesisCapability('cern-cms-open-data');

interface Area {
  readonly id: string;
  readonly title: string;
  readonly line: string;
  readonly status: string;
  readonly tone: 'ok' | 'warn' | 'muted';
  readonly note?: string;
  readonly cta: string;
  readonly hash: string;
  readonly extra?: { label: string; hash: string };
}

const AREAS: readonly Area[] = [
  {
    id: 'drug',
    title: 'Drug Discovery',
    line: 'Design, test and falsify computational drug candidates.',
    status: `Vina baseline ${ASTEX.vinaPreregisteredTop1}/${ASTEX.denominator} · GNINA dev ${ASTEX.gninaTop1}/${ASTEX.denominator}`,
    tone: 'ok',
    note: `Astex development benchmark, not validation: ${ASTEX_TRAINING_OVERLAP.inTrainingLists} of ${ASTEX_TRAINING_OVERLAP.of} complexes are in GNINA's training data.`,
    cta: 'Open Drug Discovery',
    hash: '#/drug',
    extra: { label: 'Verified example: imatinib', hash: '#/discovery-track' },
  },
  {
    id: 'biology',
    title: 'Human Biology',
    line: 'Explore anatomy from body to organ, tissue and cell.',
    status: 'Body → organ → tissue → cell',
    tone: 'muted',
    cta: 'Open Human Explorer',
    hash: '#/human-biology-lab',
  },
  {
    id: 'evidence',
    title: 'Evidence & Replay',
    line: 'Verify where a result came from and reproduce it.',
    status: `Imatinib route · Replay ${IMATINIB.replay}`,
    tone: IMATINIB.replay === 'MATCH' ? 'ok' : 'warn',
    cta: 'Open Reviewer Room',
    hash: '#/reviewer',
  },
  {
    id: 'physics',
    title: 'Physics & CERN',
    line: 'Run physical models and inspect real CMS Open Data.',
    status: CMS ? `CMS Open Data · ${CMS.readiness === 'AVAILABLE' ? 'available' : CMS.readiness.toLowerCase().replace(/_/g, ' ')}` : 'CMS Open Data · not registered',
    tone: CMS?.readiness === 'AVAILABLE' ? 'ok' : 'warn',
    note: CMS?.epistemicLabel === 'EXTERNAL_REAL_OBSERVATION' ? 'Published historical data, analysed offline. Not a live detector feed.' : undefined,
    cta: 'Open CMS data',
    hash: '#/physics/cms-z',
    extra: { label: 'Physics laboratory', hash: '#/scientific-worlds' },
  },
];

/** One compact row of the wider Scientific OS: links only, no counts. */
const BROADER: readonly { label: string; hash: string }[] = [
  { label: 'Chemistry', hash: '#/scientific-worlds?station=st-titration' },
  { label: 'Quantum', hash: '#/lab/quantum' },
  { label: 'Space-time', hash: '#/lab/spacetime' },
  { label: 'Black holes', hash: '#/geodesics' },
  { label: 'CERN Complex', hash: '#/cern-complex' },
  { label: 'Virtual Bio Lab', hash: '#/virtual-bio' },
  { label: 'World Director', hash: '#/world-director' },
];

/** "3 min ago", from the record's own timestamp. Never a made-up time. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'unknown time';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

function readRecent(): { rows: readonly SavedExperiment[]; total: number } {
  try {
    const all = listExperiments();
    return { rows: all.slice(0, 4), total: all.length };
  } catch {
    return { rows: [], total: 0 };
  }
}

export function StartHero(): React.ReactElement {
  const [health, setHealth] = useState<Health>('checking');
  const [query, setQuery] = useState('');
  const recent = useMemo(readRecent, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(() => { if (!cancelled) setHealth('online'); })
      .catch(() => { if (!cancelled) setHealth('offline'); });
    return () => { cancelled = true; };
  }, []);

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const t = query.trim();
    requestOpenScienceChat(t || undefined);
    setQuery('');
  };

  return (
    <div className="hp hp-v2" data-testid="start-hero" lang="en" dir="ltr">
      <header className="hp-head">
        <p className="hp-eyebrow">
          <span>Genesis · Scientific OS</span>
          <span className={`hp-health hp-health-${health}`} data-testid="home-backend">
            <i aria-hidden="true" />{health === 'checking' ? 'checking backend…' : health === 'online' ? 'backend online' : 'backend offline'}
          </span>
        </p>
        <h1 className="hp-title">Verifiable computational drug discovery.</h1>
        <p className="hp-sub">One scientific OS: drug discovery first, with human biology and physics on the same evidence layer.</p>
        <form className="hp-command" onSubmit={submit} role="search" data-testid="home-command">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to investigate?"
            aria-label="What do you want to investigate?"
          />
          <button type="submit" aria-label="Ask Genesis">→</button>
        </form>
      </header>

      <section className="hp-areas" aria-label="Areas">
        {AREAS.map((a) => (
          <article key={a.id} className="hp-area" data-testid={`home-area-${a.id}`}>
            <h2>{a.title}</h2>
            <p className="hp-area-line">{a.line}</p>
            <p className={`hp-area-status hp-tone-${a.tone}`}><i aria-hidden="true" />{a.status}</p>
            {a.note && <p className="hp-area-note">{a.note}</p>}
            <div className="hp-area-actions">
              <a className="hp-btn hp-btn-primary" href={a.hash}>{a.cta}</a>
              {a.extra && <a className="hp-link" href={a.extra.hash}>{a.extra.label}</a>}
            </div>
          </article>
        ))}
      </section>

      <div className="hp-duo">
        <section className="hp-card" aria-labelledby="hp-recent-title" data-testid="home-recent">
          <header className="hp-card-head">
            <h2 id="hp-recent-title">Recent research</h2>
            <span>Scientific Memory · this browser</span>
          </header>
          {recent.rows.length === 0 ? (
            <p className="hp-empty" data-testid="home-recent-empty">No runs saved yet. Ask a question or open an area above to start one.</p>
          ) : (
            <ul className="hp-recent">
              {recent.rows.map((r) => (
                <li key={r.id}>
                  <a href="#/memory">
                    <strong>{r.experimentName}</strong>
                    <small>{relativeTime(r.createdAt)} · {r.epistemicStatus}</small>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {recent.total > 0 && <a className="hp-link" href="#/memory">All {recent.total} saved runs</a>}
        </section>

        <section className="hp-card" aria-labelledby="hp-evidence-title" data-testid="home-evidence">
          <header className="hp-card-head">
            <h2 id="hp-evidence-title">Evidence status</h2>
            <span>from the committed records</span>
          </header>
          <p className="hp-kv"><span>Imatinib retrosynthesis</span><b className={IMATINIB.replay === 'MATCH' ? 'hp-tone-ok' : 'hp-tone-warn'}>Replay {IMATINIB.replay}</b></p>
          <p className="hp-kv" data-testid="home-csrn">
            <span>CSRN signature</span>
            {CSRN_KEY.generated ? <b className="hp-tone-ok">SIGNED · {CSRN_KEY.keyId}</b> : <b className="hp-tone-warn">PENDING · key not generated yet</b>}
          </p>
          <p className="hp-area-note">Every result is computational and labelled so. No Genesis prediction has been tested in a laboratory yet.</p>
          <a className="hp-link" href="#/reviewer">Try to break a result in the Reviewer Room</a>
        </section>
      </div>

      <HomeEnginesRow />

      <nav className="hp-broader" aria-label="Broader Scientific OS" data-testid="home-broader">
        <span>Broader Scientific OS</span>
        {BROADER.map((b) => <a key={b.hash} href={b.hash}>{b.label}</a>)}
      </nav>
    </div>
  );
}
