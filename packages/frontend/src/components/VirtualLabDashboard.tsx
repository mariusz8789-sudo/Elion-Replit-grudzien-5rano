import { useState } from 'react';
import type React from 'react';
import { runBioSafe } from '../core/virtualBio/experiment';
import { draftPublicValue } from '../core/virtualBio/publicValue';
import { BIO_REGISTRY } from '../core/virtualBio/models';
import { PILLARS } from '../core/virtualBio/gov';
import type { BioExperimentRecord, GovPillar, ParamSpec } from '../core/virtualBio/contracts';
import { VirtualMicroscope } from './VirtualMicroscope';

/**
 * VIRTUAL BIO LAB — read-only UI over `runBioSafe`. This component holds
 * NO scientific decision logic of its own (mandate item 7): it builds a
 * `BioExperimentDefinition` from the on-screen parameter values, calls the
 * real `runBioSafe()`, and renders whatever came back — including an
 * honest FAILED_CLOSED banner (item 12) when it does. No result is shown
 * before the click; no partial or synthetic result stands in for one.
 */

const DEFAULTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'B-CELL-001': { dose_uM: 5, IC50_uM: 4, hillN: 2, killRate: 0.05, growthRate: 0.03, steps_h: 72, resistFraction0: 0.001, resistIC50_mult: 20 },
  'B-PBPK-001': { dose_mg: 100, ka_per_h: 1.0, ke_per_h: 0.2, kt_per_h: 0.3, Vd_L: 40, steps_h: 48 },
  'B-RECEPTOR-001': { KD_nM: 10, hillAnalgesia: 2, hillRespiratory: 5 },
  'B-AMR-001': { MIC_mg_L: 2, antibiotic_mg_L: 1.5, growthRate: 0.5, killRate: 0.6, steps_h: 96, mutantFraction0: 0.000001, resistanceMult: 8 },
};

const RANGES: Readonly<Record<string, readonly [number, number]>> = {
  dose_uM: [0, 1000], IC50_uM: [0.01, 1000], hillN: [0.5, 8], killRate: [0, 1], growthRate: [0, 1], steps_h: [1, 240],
  resistFraction0: [0, 0.5], resistIC50_mult: [1, 1000], dose_mg: [0.1, 10000], ka_per_h: [0.01, 10], ke_per_h: [0.01, 5],
  kt_per_h: [0.01, 5], Vd_L: [1, 500], KD_nM: [0.1, 1000], hillAnalgesia: [0.5, 8], hillRespiratory: [0.5, 12],
  MIC_mg_L: [0.01, 100], antibiotic_mg_L: [0, 100], mutantFraction0: [0, 0.1], resistanceMult: [1, 1000],
};

export function VirtualLabDashboard(): React.ReactElement {
  const [modelId, setModelId] = useState<string>('B-CELL-001');
  const [pillar, setPillar] = useState<GovPillar>('G1');
  const [params, setParams] = useState<Readonly<Record<string, number>>>(DEFAULTS['B-CELL-001']!);
  const [record, setRecord] = useState<BioExperimentRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const selectModel = (id: string): void => {
    setModelId(id);
    setParams(DEFAULTS[id]!);
    setRecord(null);
  };

  const run = (): void => {
    setBusy(true);
    window.setTimeout(() => {
      const parameters: ParamSpec[] = Object.entries(params).map(([name, value]) => ({
        name,
        value,
        unit: '-',
        min: RANGES[name]?.[0] ?? 0,
        max: RANGES[name]?.[1] ?? 1e9,
        required: true,
      }));
      setRecord(
        runBioSafe({
          experimentId: `UI-${Date.now()}`,
          pillar,
          problemId: 'P-UI',
          hypothesisId: 'H-UI',
          modelId,
          parameters,
          seed: 42,
          observable: 'output',
          toyAccepted: true,
          provenance: [{ source: 'virtual-bio:ui', retrievedAt: new Date().toISOString() }],
        }),
      );
      setBusy(false);
    }, 0);
  };

  return (
    <div className="settings-view">
      <section className="settings-section">
        <h2>Virtual Bio Lab</h2>
        <p className="settings-hint">
          In-silico toy models only — hypothesis generation, never wet-lab, animal, human, or clinical evidence. Every
          run below happens in the browser; nothing is shown until you click.
        </p>
        <div className="gu-locale-switch" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
          {Object.keys(BIO_REGISTRY).map((m) => (
            <button key={m} type="button" className={m === modelId ? 'chip-btn primary' : 'chip-btn'} onClick={() => selectModel(m)}>
              {m}
            </button>
          ))}
        </div>
        <div className="gu-locale-switch" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          {PILLARS.map((p) => (
            <button key={p.id} type="button" className={p.id === pillar ? 'chip-btn primary' : 'chip-btn'} onClick={() => setPillar(p.id)}>
              {p.id} {p.name}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 8, marginBottom: 12 }}>
          {Object.entries(params).map(([k, v]) => (
            <label key={k} className="gu-hint" style={{ display: 'block' }}>
              {k}
              <input
                type="number"
                value={v}
                onChange={(e) => setParams((p) => ({ ...p, [k]: parseFloat(e.target.value) }))}
                style={{ display: 'block', width: '100%', marginTop: 2 }}
              />
            </label>
          ))}
        </div>
        <button type="button" className="chip-btn primary" onClick={run} disabled={busy}>
          {busy ? 'Computing…' : 'Run experiment (toy, fail-closed)'}
        </button>
      </section>

      {record === null ? (
        <section className="settings-section">
          <p className="empty-state">Nothing is computed until you click. This screen never shows a result that did not run.</p>
        </section>
      ) : record.status !== 'COMPLETED' ? (
        <section className="settings-section">
          <div className="gu-locked-panel">
            <div className="gu-locked-icon">⛔</div>
            <h3>{record.status}</h3>
            <p>{record.failReason}</p>
            <p className="gu-hint">Nothing was computed or faked — this is the honest, fail-closed state.</p>
          </div>
        </section>
      ) : (
        <>
          <section className="settings-section">
            <h3 className="section-label">Result</h3>
            <svg viewBox="0 0 600 160" style={{ width: '100%', height: 160 }} role="img" aria-label="model output trace">
              {record.result.values.length > 1 && (
                <polyline
                  fill="none"
                  stroke="var(--green)"
                  strokeWidth={2}
                  points={record.result.values
                    .map((v, i) => `${(i / (record.result.values.length - 1)) * 580 + 10},${150 - (v / Math.max(...record.result.values, 1e-9)) * 140}`)
                    .join(' ')}
                />
              )}
            </svg>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              {Object.entries(record.result.summary).map(([k, v]) => (
                <span key={k} className="gu-hint" style={{ margin: 0 }}>
                  {k}={Number.isFinite(v) ? v.toPrecision(4) : String(v)}
                </span>
              ))}
            </div>
          </section>

          <VirtualMicroscope record={record} />

          <section className="settings-section">
            <h3 className="section-label">Public value draft ({pillar}) — zero fabricated numbers</h3>
            {Object.entries(draftPublicValue(record).fields).map(([k, v]) => (
              <div key={k} className="gu-hint" style={{ marginBottom: 4 }}>
                <b style={{ color: 'var(--text)' }}>{k}</b>: {v.value} <span style={{ color: v.tag === 'NO_DATA' ? 'var(--red)' : undefined }}>[{v.tag}]</span>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
