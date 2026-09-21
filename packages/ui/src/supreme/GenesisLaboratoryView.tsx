import React, { useMemo, useState } from 'react';
import { SpacetimeCurvatureEngine } from '@genesis/core/supreme/SpacetimeCurvatureEngine.js';

const clock = { t: 0, now() { return this.t; } };
const SCALES = [ { id: 'atomic', label: 'Skala atomowa', m: 1e-10 }, { id: 'molecular', label: 'Skala molekularna', m: 1e-9 }, { id: 'cellular', label: 'Skala komórkowa', m: 1e-5 }, { id: 'human', label: 'Skala człowieka', m: 1 }, { id: 'planetary', label: 'Skala planetarna', m: 1e7 }, { id: 'stellar', label: 'Skala gwiezdna', m: 1e9 }, { id: 'astro', label: 'Skala astrofizyczna', m: 1e16 } ];
const GUIDE = [ 'Witaj w Genesis Laboratory — Twoim cichym azylu badawczym.', 'Ustaw masę i promień, aby zobaczyć dylatację czasu.', 'Przesuń skalę od atomu do astrofizyki.', 'Włącz Flow State, aby ograniczyć bodźce i skupić się na modelu.', 'Każdy wynik to RELATIVISTIC_SIMULATION / MODEL_ESTIMATE, nie pomiar.' ];
const shell: React.CSSProperties = { position: 'relative', width: '100%', height: '100%', background: 'radial-gradient(1200px 700px at 70% -10%, #06101f 0%, #02050a 55%)', color: '#dce8f5', overflow: 'hidden', fontFamily: '"Segoe UI", system-ui, sans-serif' };
const panel: React.CSSProperties = { background: 'rgba(8,14,24,.86)', border: '1px solid #1b2b42', borderRadius: 12, padding: 14, backdropFilter: 'blur(8px)' };
const badge: React.CSSProperties = { border: '1px solid #22384f', borderRadius: 20, padding: '4px 10px', fontSize: 9, fontWeight: 700, letterSpacing: 1 };
const btn = (on = false): React.CSSProperties => ({ background: on ? '#0e2036' : '#0b1526', border: `1px solid ${on ? '#38bdf8' : '#22384f'}`, color: on ? '#38bdf8' : '#dce8f5', borderRadius: 8, padding: '8px 12px', fontSize: 10, letterSpacing: 1, cursor: 'pointer', fontWeight: 700 });

export const GenesisLaboratoryView: React.FC = () => {
  const engine = useMemo(() => new SpacetimeCurvatureEngine(clock), []);
  const [massExp, setMassExp] = useState(30); const [radiusExp, setRadiusExp] = useState(4);
  const [scaleIdx, setScaleIdx] = useState(3); const [flow, setFlow] = useState(false); const [guideIdx, setGuideIdx] = useState(0);
  const massKg = Math.pow(10, massExp); const radiusM = Math.pow(10, radiusExp);
  const sol = useMemo(() => engine.solve({ massKg, radiusM, spinAM: 0, impactParamB: radiusM * 3, steps: 200, stepSize: 0.02 }), [engine, massKg, radiusM]);
  return (
    <div style={shell}>
      <div style={{ position: 'absolute', left: 16, top: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ ...badge, color: '#a78bfa' }}>DATA: RELATIVISTIC_SIMULATION / MODEL_ESTIMATE</span>
        <span style={{ ...badge, color: '#38bdf8' }}>STATUS: POC</span>
        {flow && <span style={{ ...badge, color: '#34d399' }}>FLOW STATE</span>}
      </div>
      <div style={{ ...panel, position: 'absolute', left: 16, top: 56, width: 300 }}>
        <b>PRZEWODNIK</b>
        <p style={{ fontSize: 11, lineHeight: 1.6, margin: '8px 0' }}>{GUIDE[guideIdx]}</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={btn()} onClick={() => setGuideIdx(i => Math.max(0, i - 1))}>← WSTECZ</button>
          <button style={btn()} onClick={() => setGuideIdx(i => Math.min(GUIDE.length - 1, i + 1))}>DALEJ →</button>
          <button style={btn(flow)} onClick={() => setFlow(f => !f)}>FLOW</button>
        </div>
      </div>
      <div style={{ ...panel, position: 'absolute', right: 16, top: 56, width: 300 }}>
        <b>POKRĘTŁA PRECYZYJNE</b>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, marginTop: 8 }}>Masa (10^n kg) <input type="range" min={20} max={36} step={1} value={massExp} onChange={e => setMassExp(+e.target.value)} /><span>1e{massExp} kg</span></label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, marginTop: 8 }}>Promień (10^n m) <input type="range" min={1} max={12} step={1} value={radiusExp} onChange={e => setRadiusExp(+e.target.value)} /><span>1e{radiusExp} m</span></label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, marginTop: 8 }}>Skala <input type="range" min={0} max={SCALES.length - 1} step={1} value={scaleIdx} onChange={e => setScaleIdx(+e.target.value)} /><span>{SCALES[scaleIdx].label}</span></label>
      </div>
      <div style={{ ...panel, position: 'absolute', left: 16, right: 16, bottom: 16 }}>
        <b>ODCZYTY (deterministyczne)</b>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 8, fontSize: 11 }}>
          <div>Rs: <b>{sol.schwarzschildRadiusM.toExponential(2)} m</b></div>
          <div>Dylatacja: <b>{sol.timeDilationFactor.toFixed(6)}</b></div>
          <div>Redshift z: <b>{sol.gravitationalRedshiftZ.toExponential(2)}</b></div>
          <div>Deflekcja: <b>{sol.deflectionRad.toFixed(4)} rad</b></div>
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: '#7d93ad' }}>fingerprint: {sol.fingerprint.slice(0, 16)}… · HONEST MODE: to symulacja modelu, nie pomiar laboratoryjny.</div>
      </div>
    </div>
  );
};
export default GenesisLaboratoryView;
