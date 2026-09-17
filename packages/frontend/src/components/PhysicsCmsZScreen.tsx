import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { ProvenancePanel, type ProvenanceItem } from './genesis-ui/ProvenancePanel';
import { FingerprintChip } from './genesis-ui/FingerprintChip';
import { renderLowerHarmLabel, isRtl, SUPPORTED_LOCALES } from '../core/agent/lowerHarmLabels';
import type { SupportedLocale } from '../core/agent/phaseELabels';

/**
 * /physics/cms-z — CMS Open Data record 5208 (Z→μμ, 2011), read-only.
 *
 * Pure projection of `GET /api/physics/cms-z`. No SEED_ANALYSIS, no mock, no
 * fallback fixture: on a non-200 response this screen shows an honest
 * "data unavailable" state and nothing else. Every number, every provenance
 * field and the full histogram come from the real response body — this file
 * does not compute, derive, or invent a single statistic. The one exception
 * is the "audit annotation" section, which cites `docs/HADRON_COLLIDER_CAPABILITY_AUDIT.md`
 * (a real, committed document) rather than any live/engine data.
 */

interface CmsZHistogramBin {
  readonly lowerGeV: number;
  readonly upperGeV: number;
  readonly eventCount: number;
}

interface CmsZData {
  readonly dataset: {
    readonly recordUrl: string;
    readonly fileUrl: string;
    readonly license: string;
    readonly sha256: string;
    readonly sourceSelection: string;
    readonly dataLimit: string;
  };
  readonly eventCount: number;
  readonly uniqueEventCount: number;
  readonly invariantMassGeV: {
    readonly min: number;
    readonly max: number;
    readonly mean: number;
    readonly median: number;
    readonly events80To100GeV: number;
    readonly histogram5GeV60To120: readonly CmsZHistogramBin[];
  };
}

interface CmsZResponse {
  readonly data: CmsZData;
  readonly version: string;
  readonly engine: string;
  readonly resultOrigin: string;
  readonly dataProvenance: string;
  readonly offline: boolean;
  readonly live: boolean;
  readonly simulation: boolean;
}

type FetchState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly response: CmsZResponse }
  | { readonly phase: 'unavailable'; readonly status: number; readonly reason?: string };

const EXPECTED_SHA256 = '7782778f8417d2c732f4a64efcbfceb6192c97c3bcfd21c0cf1322d38ed965d1';

export function PhysicsCmsZScreen(): React.ReactElement {
  const [locale, setLocale] = useState<SupportedLocale>('en');
  const [state, setState] = useState<FetchState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/physics/cms-z')
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok) {
          const response = (await r.json()) as CmsZResponse;
          setState({ phase: 'ready', response });
        } else {
          const body = await r.json().catch(() => ({}) as { reason?: string });
          setState({ phase: 'unavailable', status: r.status, reason: (body as { reason?: string }).reason });
        }
      })
      .catch(() => { if (!cancelled) setState({ phase: 'unavailable', status: 0 }); });
    return () => { cancelled = true; };
  }, []);

  const t = (key: Parameters<typeof renderLowerHarmLabel>[0]): string => renderLowerHarmLabel(key, locale).text;
  const dir = isRtl(locale) ? 'rtl' : 'ltr';

  return (
    <div className="gu-screen" dir={dir} lang={locale}>
      <div className="gu-locale-switch" role="group" aria-label="Language">
        {SUPPORTED_LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            className={l === locale ? 'gu-locale-btn gu-locale-btn-active' : 'gu-locale-btn'}
            onClick={() => setLocale(l)}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="gu-offline-banner" role="alert">{t('CERN_OFFLINE_BANNER')}</div>
      <p className="gu-hint">{t('CERN_SCREEN_HINT')}</p>

      <section className="gu-whatis-grid">
        <div className="gu-whatis-col">
          <h3 className="section-label">{t('CMS_WHAT_IS_TITLE')}</h3>
          <ul>
            <li>{t('CMS_IS_1')}</li>
            <li>{t('CMS_IS_2')}</li>
            <li>{t('CMS_IS_3')}</li>
          </ul>
        </div>
        <div className="gu-whatis-col">
          <h3 className="section-label">{t('CMS_WHAT_IS_NOT_TITLE')}</h3>
          <ul>
            <li>{t('CMS_NOT_1')}</li>
            <li>{t('CMS_NOT_2')}</li>
            <li>{t('CMS_NOT_3')}</li>
          </ul>
        </div>
      </section>

      {state.phase === 'loading' && <p className="gu-hint">{t('CMS_LOADING')}</p>}

      {state.phase === 'unavailable' && (
        <div className="gu-locked-panel">
          <div className="gu-locked-icon">⛔</div>
          <h3>{t('CMS_UNAVAILABLE_TITLE')}</h3>
          <p>{t('CMS_UNAVAILABLE_BODY')}</p>
          {state.reason && <p className="gu-hint">{state.reason}</p>}
        </div>
      )}

      {state.phase === 'ready' && <CmsZReadyBody response={state.response} t={t} />}
    </div>
  );
}

function CmsZReadyBody({
  response,
  t,
}: {
  readonly response: CmsZResponse;
  readonly t: (key: Parameters<typeof renderLowerHarmLabel>[0]) => string;
}): React.ReactElement {
  const { data } = response;
  const mass = data.invariantMassGeV;
  const bins = mass.histogram5GeV60To120;
  const maxCount = useMemo(() => Math.max(1, ...bins.map((b) => b.eventCount)), [bins]);
  const shaMatch = data.dataset.sha256 === EXPECTED_SHA256;
  const windowPct = data.eventCount > 0 ? ((mass.events80To100GeV / data.eventCount) * 100).toFixed(1) : '0.0';

  const provenanceItems: ProvenanceItem[] = [
    { k: t('CMS_PROVENANCE_DATASET'), v: data.dataset.recordUrl },
    { k: t('CMS_PROVENANCE_LICENSE'), v: data.dataset.license },
    { k: t('CMS_PROVENANCE_SHA256'), v: `${data.dataset.sha256} — ${shaMatch ? t('CMS_PROVENANCE_SHA256_MATCH') : t('CMS_PROVENANCE_SHA256_MISMATCH')}` },
    { k: 'engine', v: response.engine },
    { k: 'version', v: response.version },
    { k: t('CMS_PROVENANCE_COLLECTED_PUBLISHED'), v: data.dataset.sourceSelection },
  ];

  return (
    <>
      <section className="gu-panel">
        <header className="gu-panel-header">
          <h3 className="section-label">{t('CMS_HISTOGRAM_TITLE')}</h3>
          <div>
            <FingerprintChip label={t('CMS_EVENT_COUNT_LABEL')} value={String(data.eventCount)} />
            <FingerprintChip label={t('CMS_MEDIAN_LABEL')} value={`${mass.median.toFixed(3)} GeV`} />
            <FingerprintChip label={t('CMS_WINDOW_LABEL')} value={`${mass.events80To100GeV} (${windowPct}%)`} />
          </div>
        </header>
        <svg viewBox={`0 0 ${bins.length * 52 + 20} 250`} className="gu-histogram" role="img" aria-label={t('CMS_HISTOGRAM_TITLE')}>
          {bins.map((bin, i) => {
            const h = (bin.eventCount / maxCount) * 200;
            const inWindow = bin.lowerGeV >= 80 && bin.upperGeV <= 100;
            return (
              <g key={`${bin.lowerGeV}-${bin.upperGeV}`}>
                <rect
                  className={inWindow ? 'gu-histogram-bar gu-histogram-bar-window' : 'gu-histogram-bar'}
                  x={20 + i * 52}
                  y={225 - h}
                  width={44}
                  height={h}
                />
                <text className="gu-histogram-label" x={20 + i * 52 + 22} y={240} textAnchor="middle">
                  {bin.lowerGeV}–{bin.upperGeV}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      <ProvenancePanel title={t('CMS_PROVENANCE_TITLE')} items={provenanceItems} />

      <section className="gu-panel">
        <h3 className="section-label">{t('CMS_AUDIT_TITLE')}</h3>
        <p className="gu-hint">docs/HADRON_COLLIDER_CAPABILITY_AUDIT.md (26 August 2026)</p>
        <div className="gu-whatis-grid">
          <div className="gu-whatis-col">
            <b>{t('CMS_AUDIT_OUTDATED_LABEL')}</b>
            <ul>
              <li>
                The audit found no real CERN data pipeline in production ("optional static CERN Open Data import
                hook... honestly falls back to synthetic data"). This screen and its GET /api/physics/cms-z
                endpoint are that real pipeline, built after the audit.
              </li>
            </ul>
          </div>
          <div className="gu-whatis-col">
            <b>{t('CMS_AUDIT_STILL_TRUE_LABEL')}</b>
            <ul>
              <li>No hadron event generator, beam/accelerator model, trigger, or detector-reconstruction pipeline exists.</li>
              <li>This remains a descriptive statistic over a preselected educational sample — not a full physics analysis, not suitable for an operational or accelerator decision.</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
