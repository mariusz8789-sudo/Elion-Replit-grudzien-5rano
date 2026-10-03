import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { requestOpenScienceChat } from '../core/scienceChatBridge';
import { listExperiments, type SavedExperiment } from '../core/scienceMemory';
import { ASTEX, ASTEX_TRAINING_OVERLAP, CSRN_KEY, IMATINIB, RUN8 } from '../core/home/homeFacts';
import { DASHBOARD_STRIP, LABEL_ORDER, groupById, labelCounts, type CapabilityGroup } from '../core/scientificOs/catalogue';
import { HOME_ENGINES, liveLabel, useLiveToolchain } from './home/HomeEngines';
import { Icon } from './home/Icon';
import { startDay, startName, startText, type StartTextKey } from './home/startText';
import { useLocale, type Locale } from '../core/i18n';
import { capabilityLabel } from '../core/capabilityNames';
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
export function relativeTime(iso: string, now: number = Date.now(), locale: Locale = 'en'): string {
  const T = (k: StartTextKey): string => startText(k, locale);
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return T('unknownTime');
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return T('justNow');
  if (s < 3600) return `${Math.floor(s / 60)} ${T('minAgo')}`;
  if (s < 86400) return `${Math.floor(s / 3600)} ${T('hAgo')}`;
  const d = Math.floor(s / 86400);
  return d === 1 ? T('yesterday') : `${d} ${T('daysAgo')}`;
}

/** "Mon 21:00 UTC" — a record's own time, in UTC so every reader sees the same thing. */
export function utcStamp(iso: string, locale: Locale = 'en'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return startText('unknownTime', locale);
  const day = startDay(d.getUTCDay(), locale);
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
function Histogram({ cms, tall, locale }: { readonly cms: Cms; readonly tall?: boolean; readonly locale: Locale }): React.ReactElement {
  const T = (k: StartTextKey): string => startText(k, locale);
  if (cms.phase !== 'ready') {
    return <p className="cc-empty" data-testid="home-cms-empty">{cms.phase === 'loading' ? T('cmsLoading') : T('cmsUnavailable')}</p>;
  }
  const max = Math.max(1, ...cms.bins.map((b) => b.eventCount));
  const peak = cms.bins.reduce((a, b) => (b.eventCount > a.eventCount ? b : a));
  const w = 360 / cms.bins.length;
  const h = tall ? 180 : 92;
  const first = cms.bins[0]!;
  const last = cms.bins[cms.bins.length - 1]!;
  return (
    <div data-testid="home-cms-histogram">
      <svg className="cc-hist" viewBox={`0 0 360 ${h}`} preserveAspectRatio="none" role="img" aria-label={`${T('histAria')}: ${cms.events}, ${T('peak')} ${peak.lowerGeV}–${peak.upperGeV} GeV`}>
        {cms.bins.map((b, i) => {
          const bh = Math.max(2, (b.eventCount / max) * (h - 4));
          const hot = b.eventCount >= peak.eventCount * 0.5;
          return <rect key={b.lowerGeV} x={i * w + 3} y={h - bh} width={w - 6} height={bh} rx={2} className={hot ? 'cc-hist-peak' : undefined} />;
        })}
      </svg>
      <p className="cc-hist-axis"><span>{first.lowerGeV} GeV</span><b>{T('peak')} {peak.lowerGeV}–{peak.upperGeV} GeV</b><span>{last.upperGeV} GeV</span></p>
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

// Molecules live in the Drug Discovery card and under Life Sciences, not in the centre of Start (Mariusz, 30 Sep).
type View = 'anatomy' | 'cms' | 'evidence';

const VIEWS: readonly { id: View; label: StartTextKey | null; icon: 'pill' | 'body' | 'atom' | 'hash' }[] = [
  { id: 'anatomy', label: 'anatomy', icon: 'body' },
  { id: 'cms', label: null, icon: 'atom' },
  { id: 'evidence', label: 'evidence', icon: 'hash' },
];

function LiveView({ cms, locale }: { readonly cms: Cms; readonly locale: Locale }): React.ReactElement {
  const T = (k: StartTextKey): string => startText(k, locale);
  const [view, setView] = useState<View>('anatomy');
  // `ok` marks a tag backed by real data or a matched replay, so the pill colour never depends on the wording.
  const meta: Record<View, { title: string; tag: string; ok: boolean; cap: string; hash: string; open: string }> = {
    anatomy: { title: T('humanBiology'), tag: T('educationalModel'), ok: false, cap: T('capAnatomy'), hash: '#/human-biology-lab', open: T('openExplorer') },
    cms: { title: T('physicsCern'), tag: T('realData'), ok: true, cap: T('capCms'), hash: '#/physics/cms-z', open: T('openCms') },
    evidence: { title: T('evidenceReplay'), tag: `REPLAY ${IMATINIB.replay}`, ok: IMATINIB.replay === 'MATCH', cap: `${T('capEvidence')} · ${IMATINIB.retroEngine}`, hash: '#/evidence', open: T('openEvidence') },
  };
  const m = meta[view];
  return (
    <div className={`cc-live cc-live-${view}`} data-testid="home-live-view" data-view={view}>
      <svg className="cc-live-ring" viewBox="0 0 400 392" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <ellipse cx="200" cy="185" rx="170" ry="60" transform="rotate(-14 200 185)" />
        <ellipse cx="200" cy="185" rx="150" ry="150" />
      </svg>
      {view === 'anatomy' && <img className="cc-live-body" src={BODY_IMG} alt={T('bodyAlt')} />}
      {view === 'cms' && <div className="cc-live-panel"><Histogram cms={cms} tall locale={locale} /></div>}
      {view === 'evidence' && (
        <div className="cc-live-panel cc-trace cc-trace-big">
          <b>INPUT</b><HashStrip hash={IMATINIB.inputHash} />
          <b>OUTPUT</b><HashStrip hash={IMATINIB.outputHash} />
          <b>REPLAY</b><span className={IMATINIB.replay === 'MATCH' ? 'cc-ok' : 'cc-warn'}>{IMATINIB.replay}</span>
        </div>
      )}
      <p className="cc-live-tl"><i className="cc-dot" />{T('liveView')} · {m.title.toUpperCase()}</p>
      <p className="cc-live-tr"><span className={`cc-pill ${m.ok ? 'cc-pill-ok' : 'cc-pill-warn'}`}>{m.tag}</span></p>
      <p className="cc-live-cap">{m.cap} · <a href={m.hash}>{m.open}</a></p>
      <div className="cc-live-sw" role="group" aria-label={T('liveViewAria')}>
        {VIEWS.map((v) => (
          <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
            <Icon name={v.icon} />{v.label ? T(v.label) : 'CMS'}
          </button>
        ))}
      </div>
    </div>
  );
}

function StripTile({ group, locale }: { readonly group: CapabilityGroup; readonly locale: Locale }): React.ReactElement {
  const counts = labelCounts(group);
  return (
    <a className={`cc-ot${group.id === 'gov' ? ' cc-ot-gov' : ''}`} href={`#/more?group=${group.id}`} data-testid={`home-group-${group.id}`}>
      <Icon name={group.icon} />
      <b>{startName(group.name, locale)}</b>
      <span className="cc-mix" aria-hidden="true">
        {LABEL_ORDER.filter((l) => counts[l] > 0).map((l) => <i key={l} className={`os-mix-${l}`} style={{ flex: counts[l] }} />)}
      </span>
      <small>{group.items.length} {startText('capabilities', locale)} · {counts.AVAILABLE} {startText('available', locale)}</small>
    </a>
  );
}

function Compute({ locale }: { readonly locale: Locale }): React.ReactElement {
  const T = (k: StartTextKey): string => startText(k, locale);
  const live = useLiveToolchain();
  const runtimes = HOME_ENGINES.filter((e) => e.toolId !== null);
  const labels = runtimes.map((e) => ({ e, s: liveLabel(e, live, locale === 'pl' ? 'pl' : 'en') }));
  const ok = labels.filter((x) => x.s.tone === 'ok').length;
  return (
    <article className="cc-c cc-comp" data-testid="home-engines">
      <h2><Icon name="cpu" />{T('compute')}</h2>
      {live.phase === 'ready' ? (
        <p className="cc-big">{ok}<small> {T('enginesOf')} {runtimes.length} {T('enginesAvailable')}</small></p>
      ) : (
        <p className="cc-empty">{live.phase === 'checking' ? T('checkingServer') : T('serverUnreachable')}</p>
      )}
      <span className="cc-dots" aria-hidden="true">{labels.map((x) => <i key={x.e.name} className={x.s.tone === 'ok' ? 'cc-dot-ok' : undefined} />)}</span>
      <details className="cc-engines">
        <summary>{T('showEngines')}</summary>
        {/* Capabilities, not engines: the engine behind each one is under Technical details. */}
        <ul>
          {labels.map(({ e, s }) => (
            <li key={e.name} data-testid={`home-engine-${e.toolId}`}><b>{capabilityLabel(e.capability, locale)}</b><span className={`cc-tone-${s.tone}`}>{s.text}</span></li>
          ))}
        </ul>
      </details>
      <details className="cc-engines cc-tech" data-technical-details>
        <summary>{T('technicalDetails')}</summary>
        <ul>
          {HOME_ENGINES.map((e) => {
            const s = e.toolId === null ? null : labels.find((x) => x.e === e)?.s;
            return <li key={e.name} title={s?.detail}><b>{e.name}</b><span>{capabilityLabel(e.capability, locale)}{e.toolId === null ? ` · ${e.note ?? ''}` : ''}</span></li>;
          })}
        </ul>
      </details>
    </article>
  );
}

export function StartHero(): React.ReactElement {
  const locale = useLocale();
  const T = (k: StartTextKey): string => startText(k, locale);
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
    <div className="cc" data-testid="start-hero" lang={locale === 'pl' ? 'pl' : 'en'} dir="ltr">
      <section className="cc-hero">
        <div className="cc-hl">
          <p className="cc-eyebrow">
            <span className="cc-orb" aria-hidden="true">
              <svg viewBox="0 0 34 34"><ellipse cx="17" cy="17" rx="16" ry="6.5" transform="rotate(-25 17 17)" /><ellipse cx="17" cy="17" rx="16" ry="6.5" transform="rotate(40 17 17)" /></svg>
              <img src="/brand/genesis-mark.png" alt="" />
            </span>
            Genesis · Scientific OS
            <span className={`cc-health cc-health-${health}`} data-testid="home-backend">
              <i aria-hidden="true" />{health === 'checking' ? T('backendChecking') : health === 'online' ? T('backendOnline') : T('backendOffline')}
            </span>
          </p>
          <h1 className="cc-title"><em>{T('titleEm')}</em>{T('titleRest')}</h1>
          <p className="cc-sub">{T('sub')}</p>
          <form className="cc-cmd" onSubmit={submit} role="search" data-testid="home-command">
            <Icon name="spark" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={T('askPlaceholder')} aria-label={T('askPlaceholder')} />
            <button type="submit" aria-label={T('askButton')}><Icon name="arrow" /></button>
          </form>

          <section className="cc-run" data-testid="home-running" aria-label={T('runningAria')}>
            <p className="cc-k"><i className="cc-dot" />{running ? T('runningNow') : T('latestBenchmark')}<span>{T('started')} {utcStamp(RUN8.startedAt, locale)}</span></p>
            <h2>{startName(RUN8.title, locale)}</h2>
            <p className="cc-m">
              <span><b>{RUN8.complexes}</b> {T('unseenComplexes')} {RUN8.dataset}{locale === 'pl' ? '' : ` ${T('complexes')}`} · {RUN8.seeds} {T('seeds')} · {T('preregistered')}</span>
              <span>{running ? T('passOrFail') : `${T('status')}: ${startName(RUN8.status, locale)}`} · {T('recorded')} {relativeTime(RUN8.recordedAt, Date.now(), locale)}</span>
            </p>
            <a className="cc-latest" href="#/evidence" data-testid="home-latest">
              <Icon name="replay" />
              <span>{T('latestVerified')} <strong>{T('imatinibRerun')}</strong></span>
              <span className={`cc-pill ${IMATINIB.replay === 'MATCH' ? 'cc-pill-ok' : 'cc-pill-warn'}`}>REPLAY {IMATINIB.replay}</span>
            </a>
          </section>
        </div>
        <LiveView cms={cms} locale={locale} />
      </section>

      <section className="cc-bento" aria-label={T('overview')}>
        <article className="cc-c cc-drug" data-testid="home-area-drug">
          <div>
            <h2><Icon name="pill" />{T('drugDiscovery')}<span className="cc-pill cc-pill-cy">{T('mainFocus')}</span></h2>
            <p className="cc-card-sub">{T('dockingSub')} {ASTEX.denominator} {T('knownComplexes')}</p>
            <div className="cc-kpis">
              <div className="cc-kpi">
                <p className="cc-n">{ASTEX.vinaPreregisteredTop1}<small>/{ASTEX.denominator}</small></p>
                <p className="cc-l">{T('vinaBaseline')}</p>
                <span className="cc-bar"><i style={{ width: pct(ASTEX.vinaPreregisteredTop1) }} /></span>
              </div>
              <div className="cc-kpi cc-kpi-hi">
                <p className="cc-n">{ASTEX.gninaTop1}<small>/{ASTEX.denominator}</small></p>
                <p className="cc-l">{T('gninaRescoring')}</p>
                <span className="cc-bar"><i style={{ width: pct(ASTEX.gninaTop1) }} /></span>
              </div>
            </div>
            <p className="cc-caveat">{ASTEX_TRAINING_OVERLAP.inTrainingLists} {T('overlapOf')} {ASTEX_TRAINING_OVERLAP.of} {T('overlapRest')}</p>
            <details className="cc-engines cc-tech" data-technical-details data-testid="home-drug-tech">
              <summary>{T('technicalDetails')}</summary>
              <ul>
                <li><span>{T('techBaseline')}: {ASTEX.vinaPreregisteredTop1}/{ASTEX.denominator}</span></li>
                <li><span>{T('techRescore')}: {ASTEX.gninaTop1}/{ASTEX.denominator}</span></li>
                <li><span>{ASTEX_TRAINING_OVERLAP.inTrainingLists} {T('overlapOf')} {ASTEX_TRAINING_OVERLAP.of} {T('techOverlap')}</span></li>
                <li><span>{T('techMolecule')}</span></li>
              </ul>
            </details>
            <p className="cc-r8"><i className="cc-dot" /><span><b>{startName(RUN8.title, locale)}</b> · {RUN8.complexes} {T('unseenComplexes')}{locale === 'pl' ? '' : ` ${T('complexes')}`} · {running ? T('running') : startName(RUN8.status, locale).toLowerCase()}</span></p>
            <p className="cc-actions">
              <a className="cc-cta" href="#/drug">{T('openDrug')} <Icon name="arrow" /></a>
              <a className="cc-link" href="#/discovery-track">{T('verifiedExample')}</a>
            </p>
          </div>
          <a className="cc-dvis" href="#/molecule" aria-label={T('openMolecule')}>
            <img src={MOLECULE_IMG} alt="" />
            <span>Molecule World · 3D</span>
          </a>
        </article>

        <article className="cc-c cc-human" data-testid="home-area-biology">
          <div className="cc-human-img"><img src={BODY_IMG} alt={T('atlasAlt')} /></div>
          <div className="cc-human-top"><h2><Icon name="body" />{T('humanBiology')}</h2><p className="cc-card-sub">{T('atlasSub')}</p></div>
          <div className="cc-human-in">
            <p className="cc-chain"><span className="on">{T('body')}</span>→<span>{T('organ')}</span>→<span>{T('tissue')}</span>→<span>{T('cell')}</span></p>
            <p className="cc-fine">{T('noPatientData')}</p>
            <a className="cc-cta" href="#/human-biology-lab">{T('exploreBody')} <Icon name="arrow" /></a>
          </div>
        </article>

        <article className="cc-c cc-ev" data-testid="home-area-evidence">
          <h2><Icon name="replay" />{T('evidenceReplay')}<span className={`cc-pill ${IMATINIB.replay === 'MATCH' ? 'cc-pill-ok' : 'cc-pill-warn'}`}>{IMATINIB.replay}</span></h2>
          <p className="cc-card-sub"><span className="cc-hide-m">{T('evidenceLong')}</span><span className="cc-only-m">{T('evidenceShort')}</span></p>
          <div className="cc-trace">
            <b>INPUT</b><HashStrip hash={IMATINIB.inputHash} />
            <b>OUTPUT</b><HashStrip hash={IMATINIB.outputHash} />
          </div>
          <p className="cc-match" data-testid="home-csrn">
            {CSRN_KEY.generated
              ? <span className="cc-pill cc-pill-ok">CSRN SIGNED · {CSRN_KEY.keyId}</span>
              : <span className="cc-pill cc-pill-warn">{T('csrnPending')}</span>}
            <span className="cc-fine">{T('noLabTest')}</span>
          </p>
          <a className="cc-cta" href="#/reviewer"><span className="cc-hide-m">{T('breakItLong')}</span><span className="cc-only-m">{T('breakItShort')}</span> <Icon name="arrow" /></a>
        </article>

        <article className="cc-c cc-cern" data-testid="home-area-physics">
          <h2><Icon name="atom" />{T('cernTitle')}<span className="cc-pill cc-pill-mu">{T('realData')}</span></h2>
          <p className="cc-card-sub">{cms.phase === 'ready' ? `${cms.events.toLocaleString(locale === 'pl' ? 'pl-PL' : 'en-US')} ${T('realEvents')}` : T('realEventsNone')}{T('cmsSub')}</p>
          <Histogram cms={cms} locale={locale} />
          <a className="cc-cta" href="#/physics/cms-z">{T('openCms')} <Icon name="arrow" /></a>
        </article>

        <article className="cc-c cc-recent" data-testid="home-recent">
          <h2><Icon name="console" />{T('recentResearch')}<span className="cc-card-meta">{T('recentMeta')}</span></h2>
          {recent.rows.length === 0 ? (
            <p className="cc-empty" data-testid="home-recent-empty">{T('recentEmpty')}</p>
          ) : (
            <ul className="cc-list">
              {recent.rows.map((r) => (
                <li key={r.id}>
                  <a href="#/memory">
                    <span className="cc-ic"><Icon name="flask" /></span>
                    <span><strong>{r.experimentName}</strong><small>{relativeTime(r.createdAt, Date.now(), locale)}</small></span>
                    <span className="cc-pill cc-pill-cy">{r.epistemicStatus}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {recent.total > 0 && <a className="cc-link" href="#/memory">{T('allSaved')} {recent.total}</a>}
        </article>

        <Compute locale={locale} />
      </section>

      <section className="cc-os" aria-labelledby="cc-os-title" data-testid="home-more">
        <header className="cc-os-head">
          <h2 id="cc-os-title"><Icon name="grid" />{T('moreTitle')}</h2>
          <span>{T('moreSub')}</span>
          <a href="#/more">{T('openAll')} <Icon name="arrow" /></a>
        </header>
        <div className="cc-os-grid">{strip.map((g) => <StripTile key={g.id} group={g} locale={locale} />)}</div>
      </section>
    </div>
  );
}
