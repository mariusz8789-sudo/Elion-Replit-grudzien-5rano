import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import { listExperiments, type SavedExperiment } from '../core/scienceMemory';
import { ASTEX, ASTEX_TRAINING_OVERLAP, CSRN_KEY, IMATINIB, RUN8 } from '../core/home/homeFacts';
import { DASHBOARD_STRIP, LABEL_ORDER, groupById, labelCounts, type CapabilityGroup } from '../core/scientificOs/catalogue';
import { HOME_ENGINES, liveLabel, useLiveToolchain } from './home/HomeEngines';
import { Icon } from './home/Icon';
import '../styles-command-center.css';

/**
 * START — the command centre the owner approved on 29 Sep 2026 (bento, live
 * state). It is an OVERVIEW only: navigation lives in the menu, the
 * conversation in Ask, the full catalogue in More · Scientific OS (`#/more`).
 *
 * STATUS RULE (owner's): no number or status is typed in by hand. Each one is
 * read from a real source, and a source that has nothing shows an honest empty
 * state:
 *   - Running now     → committed Run 8 status record (`RUN8`), dated
 *   - Latest verified → committed imatinib Replay record (`IMATINIB`)
 *   - Drug Discovery  → committed Astex records (`ASTEX`)
 *   - Human Biology   → a description of the path, no count
 *   - Physics & CERN  → `GET /api/physics/cms-z`, live
 *   - Recent research → `listExperiments()` (Scientific Memory in this browser)
 *   - CSRN signature  → published key file (`CSRN_KEY`)
 *   - Compute         → `GET /api/compute/toolchain`, live
 *   - Backend         → `GET /api/health`, live
 *   - Group strip     → the audit catalogue (`core/scientificOs/catalogue`)
 * The two pictures are snapshots of Genesis's own renderers (Molecule World,
 * Human Explorer); each says so and opens the live screen.
 */

const MOLECULE_IMG = '/assets/home/molecule-world-caffeine.jpg';
const BODY_IMG = '/assets/home/human-explorer-body.jpg';

type Health = 'checking' | 'online' | 'offline';

interface CmsBin { readonly lowerGeV: number; readonly upperGeV: number; readonly eventCount: number }
type Cms = { phase: 'loading' } | { phase: 'ready'; bins: readonly CmsBin[]; events: number } | { phase: 'unavailable' };

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

/** "Mon 21:00 UTC" — a record's own time, in UTC so every reader sees the same thing. */
export function utcStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown time';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  return `${day} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

function readRecent(): { rows: readonly SavedExperiment[]; total: number } {
  try {
    const all = listExperiments();
    return { rows: all.slice(0, 3), total: all.length };
  } catch {
    return { rows: [], total: 0 };
  }
}

function useHealth(): Health {
  const [health, setHealth] = useState<Health>('checking');
  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(() => { if (!cancelled) setHealth('online'); })
      .catch(() => { if (!cancelled) setHealth('offline'); });
    return () => { cancelled = true; };
  }, []);
  return health;
}

function useCms(): Cms {
  const [cms, setCms] = useState<Cms>({ phase: 'loading' });
  useEffect(() => {
    let cancelled = false;
    fetch('/api/physics/cms-z')
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((body: { data?: { eventCount?: number; invariantMassGeV?: { histogram5GeV60To120?: CmsBin[] } } }) => {
        const bins = body.data?.invariantMassGeV?.histogram5GeV60To120;
        if (cancelled) return;
        if (!Array.isArray(bins) || bins.length === 0) { setCms({ phase: 'unavailable' }); return; }
        setCms({ phase: 'ready', bins, events: body.data?.eventCount ?? 0 });
      })
      .catch(() => { if (!cancelled) setCms({ phase: 'unavailable' }); });
    return () => { cancelled = true; };
  }, []);
  return cms;
}

/** The real CMS invariant-mass histogram; the fullest bin is the Z peak. */
function Histogram({ cms, tall }: { readonly cms: Cms; readonly tall?: boolean }): React.ReactElement {
  if (cms.phase !== 'ready') {
    return <p className="cc-empty" data-testid="home-cms-empty">{cms.phase === 'loading' ? 'Reading CMS data from the server…' : 'CMS data is not reachable on this server right now.'}</p>;
  }
  const max = Math.max(1, ...cms.bins.map((b) => b.eventCount));
  const peak = cms.bins.reduce((a, b) => (b.eventCount > a.eventCount ? b : a));
  const w = 360 / cms.bins.length;
  const h = tall ? 180 : 92;
  const first = cms.bins[0]!;
  const last = cms.bins[cms.bins.length - 1]!;
  return (
    <div data-testid="home-cms-histogram">
      <svg className="cc-hist" viewBox={`0 0 360 ${h}`} preserveAspectRatio="none" role="img" aria-label={`Invariant mass of ${cms.events} CMS muon pairs, peak ${peak.lowerGeV}–${peak.upperGeV} GeV`}>
        {cms.bins.map((b, i) => {
          const bh = Math.max(2, (b.eventCount / max) * (h - 4));
          const hot = b.eventCount >= peak.eventCount * 0.5;
          return <rect key={b.lowerGeV} x={i * w + 3} y={h - bh} width={w - 6} height={bh} rx={2} className={hot ? 'cc-hist-peak' : undefined} />;
        })}
      </svg>
      <p className="cc-hist-axis"><span>{first.lowerGeV} GeV</span><b>peak {peak.lowerGeV}–{peak.upperGeV} GeV</b><span>{last.upperGeV} GeV</span></p>
    </div>
  );
}

/** A hash drawn as a strip of colour cells plus its first 8 characters. */
function HashStrip({ hash }: { readonly hash: string }): React.ReactElement {
  return (
    <span className="cc-hash" title={hash}>
      {[...hash.slice(0, 16)].map((c, i) => {
        const n = parseInt(c, 16);
        return <i key={i} style={{ background: `hsl(${185 + n * 6},70%,${30 + n * 3}%)` }} />;
      })}
      <span>{hash.slice(0, 8)}…</span>
    </span>
  );
}

type View = 'molecule' | 'anatomy' | 'cms' | 'evidence';

const VIEWS: readonly { id: View; label: string; icon: 'pill' | 'body' | 'atom' | 'hash' }[] = [
  { id: 'molecule', label: 'Molecule', icon: 'pill' },
  { id: 'anatomy', label: 'Anatomy', icon: 'body' },
  { id: 'cms', label: 'CMS', icon: 'atom' },
  { id: 'evidence', label: 'Evidence', icon: 'hash' },
];

function LiveView({ cms }: { readonly cms: Cms }): React.ReactElement {
  const [view, setView] = useState<View>('molecule');
  const meta: Record<View, { title: string; tag: string; cap: string; hash: string; open: string }> = {
    molecule: { title: 'Drug Discovery', tag: 'MODEL', cap: 'Caffeine · 3D geometry from RDKit · Molecule World snapshot', hash: '#/molecule', open: 'Open Molecule World' },
    anatomy: { title: 'Human Biology', tag: 'EDUCATIONAL MODEL', cap: 'BodyParts3D atlas (CC BY 4.0) · Human Explorer snapshot', hash: '#/human-biology-lab', open: 'Open Human Explorer' },
    cms: { title: 'Physics · CERN', tag: 'REAL DATA', cap: 'Real CMS 2011 Z→μμ events · offline analysis, not a live detector', hash: '#/physics/cms-z', open: 'Open CMS data' },
    evidence: { title: 'Evidence & Replay', tag: `REPLAY ${IMATINIB.replay}`, cap: `Imatinib retrosynthesis · ${IMATINIB.retroEngine}`, hash: '#/evidence', open: 'Open Evidence & Replay' },
  };
  const m = meta[view];
  return (
    <div className={`cc-live cc-live-${view}`} data-testid="home-live-view" data-view={view}>
      <svg className="cc-live-ring" viewBox="0 0 400 392" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <ellipse cx="200" cy="185" rx="170" ry="60" transform="rotate(-14 200 185)" />
        <ellipse cx="200" cy="185" rx="150" ry="150" />
      </svg>
      {view === 'molecule' && <img className="cc-live-mol" src={MOLECULE_IMG} alt="Caffeine molecule rendered by Molecule World" />}
      {view === 'anatomy' && <img className="cc-live-body" src={BODY_IMG} alt="Human body rendered by Human Explorer" />}
      {view === 'cms' && <div className="cc-live-panel"><Histogram cms={cms} tall /></div>}
      {view === 'evidence' && (
        <div className="cc-live-panel cc-trace cc-trace-big">
          <b>INPUT</b><HashStrip hash={IMATINIB.inputHash} />
          <b>OUTPUT</b><HashStrip hash={IMATINIB.outputHash} />
          <b>REPLAY</b><span className={IMATINIB.replay === 'MATCH' ? 'cc-ok' : 'cc-warn'}>{IMATINIB.replay}</span>
        </div>
      )}
      <p className="cc-live-tl"><i className="cc-dot" />LIVE VIEW · {m.title.toUpperCase()}</p>
      <p className="cc-live-tr"><span className={`cc-pill ${m.tag === 'REAL DATA' || m.tag.startsWith('REPLAY MATCH') ? 'cc-pill-ok' : 'cc-pill-warn'}`}>{m.tag}</span></p>
      <p className="cc-live-cap">{m.cap} · <a href={m.hash}>{m.open}</a></p>
      <div className="cc-live-sw" role="group" aria-label="Live view">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
            <Icon name={v.icon} />{v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StripTile({ group }: { readonly group: CapabilityGroup }): React.ReactElement {
  const counts = labelCounts(group);
  return (
    <a className={`cc-ot${group.id === 'gov' ? ' cc-ot-gov' : ''}`} href={`#/more?group=${group.id}`} data-testid={`home-group-${group.id}`}>
      <Icon name={group.icon} />
      <b>{group.name}</b>
      <span className="cc-mix" aria-hidden="true">
        {LABEL_ORDER.filter((l) => counts[l] > 0).map((l) => <i key={l} className={`os-mix-${l}`} style={{ flex: counts[l] }} />)}
      </span>
      <small>{group.items.length} capabilities · {counts.AVAILABLE} available</small>
    </a>
  );
}

function Compute(): React.ReactElement {
  const live = useLiveToolchain();
  const runtimes = HOME_ENGINES.filter((e) => e.toolId !== null);
  const labels = runtimes.map((e) => ({ e, s: liveLabel(e, live) }));
  const ok = labels.filter((x) => x.s.tone === 'ok').length;
  return (
    <article className="cc-c cc-comp" data-testid="home-engines">
      <h2><Icon name="cpu" />Compute</h2>
      {live.phase === 'ready' ? (
        <p className="cc-big">{ok}<small> of {runtimes.length} engines available on this server</small></p>
      ) : (
        <p className="cc-empty">{live.phase === 'checking' ? 'Checking this server…' : 'Server unreachable, engine status unknown.'}</p>
      )}
      <span className="cc-dots" aria-hidden="true">{labels.map((x) => <i key={x.e.name} className={x.s.tone === 'ok' ? 'cc-dot-ok' : undefined} />)}</span>
      <details className="cc-engines">
        <summary>Show engines</summary>
        <ul>
          {labels.map(({ e, s }) => (
            <li key={e.name} data-testid={`home-engine-${e.name.toLowerCase().replace(/[^a-z]+/g, '-')}`}><b>{e.name}</b><span className={`cc-tone-${s.tone}`} title={s.detail}>{s.text}</span></li>
          ))}
        </ul>
      </details>
    </article>
  );
}

export function StartHero(): React.ReactElement {
  const health = useHealth();
  const cms = useCms();
  const [query, setQuery] = useState('');
  const recent = useMemo(readRecent, []);
  const strip = DASHBOARD_STRIP.map(groupById).filter((g): g is CapabilityGroup => g !== undefined);
  const running = RUN8.status === 'RUNNING';

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const t = query.trim();
    requestOpenScienceChat(t || undefined);
    setQuery('');
  };

  const pct = (n: number) => `${Math.round((n / ASTEX.denominator) * 100)}%`;

  return (
    <div className="cc" data-testid="start-hero" lang="en" dir="ltr">
      <section className="cc-hero">
        <div className="cc-hl">
          <p className="cc-eyebrow">
            <span className="cc-orb" aria-hidden="true">
              <svg viewBox="0 0 34 34"><ellipse cx="17" cy="17" rx="16" ry="6.5" transform="rotate(-25 17 17)" /><ellipse cx="17" cy="17" rx="16" ry="6.5" transform="rotate(40 17 17)" /></svg>
              <img src="/brand/genesis-mark.png" alt="" />
            </span>
            Genesis · Scientific OS
            <span className={`cc-health cc-health-${health}`} data-testid="home-backend">
              <i aria-hidden="true" />{health === 'checking' ? 'checking backend…' : health === 'online' ? 'backend online' : 'backend offline'}
            </span>
          </p>
          <h1 className="cc-title"><em>Verifiable</em> computational drug discovery.</h1>
          <p className="cc-sub">Run an experiment, see the result, verify it with Evidence and Replay.</p>
          <form className="cc-cmd" onSubmit={submit} role="search" data-testid="home-command">
            <Icon name="spark" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What do you want to investigate?" aria-label="What do you want to investigate?" />
            <button type="submit" aria-label="Ask Genesis"><Icon name="arrow" /></button>
          </form>

          <section className="cc-run" data-testid="home-running" aria-label="Running now">
            <a className="cc-thumb" href="#/molecule" aria-hidden="true" tabIndex={-1}><img src={MOLECULE_IMG} alt="" /></a>
            <p className="cc-k"><i className="cc-dot" />{running ? 'RUNNING NOW' : 'LATEST BENCHMARK'}<span>started {utcStamp(RUN8.startedAt)}</span></p>
            <h2>{RUN8.title}</h2>
            <p className="cc-m">
              <span><b>{RUN8.complexes}</b> unseen {RUN8.dataset} complexes · {RUN8.seeds} seeds · pre-registered</span>
              <span>{running ? 'Pass or fail is published when the run finishes' : `Status: ${RUN8.status}`} · recorded {relativeTime(RUN8.recordedAt)}</span>
            </p>
            <a className="cc-latest" href="#/evidence" data-testid="home-latest">
              <Icon name="replay" />
              <span>Latest verified: <strong>Imatinib route re-run</strong></span>
              <span className={`cc-pill ${IMATINIB.replay === 'MATCH' ? 'cc-pill-ok' : 'cc-pill-warn'}`}>REPLAY {IMATINIB.replay}</span>
            </a>
          </section>
        </div>
        <LiveView cms={cms} />
      </section>

      <section className="cc-bento" aria-label="Overview">
        <article className="cc-c cc-drug" data-testid="home-area-drug">
          <div>
            <h2><Icon name="pill" />Drug Discovery<span className="cc-pill cc-pill-cy">MAIN FOCUS</span></h2>
            <p className="cc-card-sub">Docking benchmark · Astex Diverse Set, {ASTEX.denominator} known drug–protein complexes</p>
            <div className="cc-kpis">
              <div className="cc-kpi">
                <p className="cc-n">{ASTEX.vinaPreregisteredTop1}<small>/{ASTEX.denominator}</small></p>
                <p className="cc-l">Vina baseline · pre-registered</p>
                <span className="cc-bar"><i style={{ width: pct(ASTEX.vinaPreregisteredTop1) }} /></span>
              </div>
              <div className="cc-kpi cc-kpi-hi">
                <p className="cc-n">{ASTEX.gninaTop1}<small>/{ASTEX.denominator}</small></p>
                <p className="cc-l">GNINA rescoring · development</p>
                <span className="cc-bar"><i style={{ width: pct(ASTEX.gninaTop1) }} /></span>
              </div>
            </div>
            <p className="cc-caveat">{ASTEX_TRAINING_OVERLAP.inTrainingLists} of these {ASTEX_TRAINING_OVERLAP.of} complexes are in GNINA&apos;s training data. This is development, not independent validation.</p>
            <p className="cc-r8"><i className="cc-dot" /><span><b>{RUN8.title}</b> · {RUN8.complexes} unseen complexes · {running ? 'running' : RUN8.status.toLowerCase()}</span></p>
            <p className="cc-actions">
              <a className="cc-cta" href="#/drug">Open Drug Discovery <Icon name="arrow" /></a>
              <a className="cc-link" href="#/discovery-track">Verified example: imatinib</a>
            </p>
          </div>
          <a className="cc-dvis" href="#/molecule" aria-label="Open Molecule World">
            <img src={MOLECULE_IMG} alt="" />
            <span>Molecule World · RDKit 3D</span>
          </a>
        </article>

        <article className="cc-c cc-human" data-testid="home-area-biology">
          <div className="cc-human-img"><img src={BODY_IMG} alt="Human Explorer atlas render" /></div>
          <div className="cc-human-top"><h2><Icon name="body" />Human Biology</h2><p className="cc-card-sub">Interactive anatomy atlas</p></div>
          <div className="cc-human-in">
            <p className="cc-chain"><span className="on">Body</span>→<span>Organ</span>→<span>Tissue</span>→<span>Cell</span></p>
            <p className="cc-fine">Educational model · no patient data</p>
            <a className="cc-cta" href="#/human-biology-lab">Explore the body <Icon name="arrow" /></a>
          </div>
        </article>

        <article className="cc-c cc-ev" data-testid="home-area-evidence">
          <h2><Icon name="replay" />Evidence &amp; Replay<span className={`cc-pill ${IMATINIB.replay === 'MATCH' ? 'cc-pill-ok' : 'cc-pill-warn'}`}>{IMATINIB.replay}</span></h2>
          <p className="cc-card-sub"><span className="cc-hide-m">Re-running the imatinib retrosynthesis reproduced the recorded route.</span><span className="cc-only-m">Imatinib route re-run matched the record.</span></p>
          <div className="cc-trace">
            <b>INPUT</b><HashStrip hash={IMATINIB.inputHash} />
            <b>OUTPUT</b><HashStrip hash={IMATINIB.outputHash} />
          </div>
          <p className="cc-match" data-testid="home-csrn">
            {CSRN_KEY.generated
              ? <span className="cc-pill cc-pill-ok">CSRN SIGNED · {CSRN_KEY.keyId}</span>
              : <span className="cc-pill cc-pill-warn">CSRN KEY PENDING</span>}
            <span className="cc-fine">no lab test yet</span>
          </p>
          <a className="cc-cta" href="#/reviewer"><span className="cc-hide-m">Try to break it in the Reviewer Room</span><span className="cc-only-m">Reviewer Room</span> <Icon name="arrow" /></a>
        </article>

        <article className="cc-c cc-cern" data-testid="home-area-physics">
          <h2><Icon name="atom" />Physics · CERN / CMS<span className="cc-pill cc-pill-mu">REAL DATA</span></h2>
          <p className="cc-card-sub">{cms.phase === 'ready' ? `${cms.events.toLocaleString('en-US')} real` : 'Real'} Z→μμ events, CMS 2011 open data. Offline analysis.</p>
          <Histogram cms={cms} />
          <a className="cc-cta" href="#/physics/cms-z">Open CMS data <Icon name="arrow" /></a>
        </article>

        <article className="cc-c cc-recent" data-testid="home-recent">
          <h2><Icon name="console" />Recent research<span className="cc-card-meta">Scientific Memory · this browser</span></h2>
          {recent.rows.length === 0 ? (
            <p className="cc-empty" data-testid="home-recent-empty">No runs saved in this browser yet. Ask a question above or open Drug Discovery to start one.</p>
          ) : (
            <ul className="cc-list">
              {recent.rows.map((r) => (
                <li key={r.id}>
                  <a href="#/memory">
                    <span className="cc-ic"><Icon name="flask" /></span>
                    <span><strong>{r.experimentName}</strong><small>{relativeTime(r.createdAt)}</small></span>
                    <span className="cc-pill cc-pill-cy">{r.epistemicStatus}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {recent.total > 0 && <a className="cc-link" href="#/memory">All {recent.total} saved runs</a>}
        </article>

        <Compute />
      </section>

      <section className="cc-os" aria-labelledby="cc-os-title" data-testid="home-more">
        <header className="cc-os-head">
          <h2 id="cc-os-title"><Icon name="grid" />More · Scientific OS</h2>
          <span>Everything else Genesis can do, grouped</span>
          <a href="#/more">Open all <Icon name="arrow" /></a>
        </header>
        <div className="cc-os-grid">{strip.map((g) => <StripTile key={g.id} group={g} />)}</div>
      </section>
    </div>
  );
}
