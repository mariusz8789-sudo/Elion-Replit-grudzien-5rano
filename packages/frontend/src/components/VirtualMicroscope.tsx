import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { renderMicroscopeFrame } from '../core/virtualBio/microscope';
import type { BioExperimentRecord, Stain } from '../core/virtualBio/contracts';
import { FingerprintChip } from './genesis-ui/FingerprintChip';

/**
 * Read-only projection of a frozen `BioExperimentRecord` — mandate item 8:
 * "VirtualMicroscope może renderować lokalnie, ale wyłącznie z zamrożonego
 * BioExperimentRecord". This component computes NOTHING scientific: every
 * pixel comes from `renderMicroscopeFrame()`, a pure function of the record
 * already passed in plus the view controls below. Changing a control
 * (stain/zoom/field) changes what is DISPLAYED, never the record itself.
 */

const STAINS: readonly Stain[] = ['STATE', 'VIABILITY', 'NONE'];

export function VirtualMicroscope({ record }: { readonly record: BioExperimentRecord }): React.ReactElement {
  const [seed, setSeed] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fieldIndex, setFieldIndex] = useState(0);
  const [stain, setStain] = useState<Stain>('STATE');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const frame = useMemo(
    () => renderMicroscopeFrame(record, { recordFingerprint: record.reproducibilityFingerprint, seed, zoom, fieldIndex, stain }),
    [record, seed, zoom, fieldIndex, stain],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#020403';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const c of frame.commands) {
      ctx.beginPath();
      ctx.arc(c.x * canvas.width, c.y * canvas.height, c.r * canvas.width, 0, Math.PI * 2);
      ctx.fillStyle = c.color;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }, [frame]);

  return (
    <section className="gu-panel">
      <div className="gu-offline-banner" role="alert">
        IN-SILICO TOY MODEL — NOT WET-LAB, NOT ANIMAL, NOT HUMAN DATA, NOT MEDICAL ADVICE
      </div>
      <canvas ref={canvasRef} width={520} height={360} style={{ width: '100%', borderRadius: 6, background: '#020403' }} />
      <div className="gu-locale-switch" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        {STAINS.map((s) => (
          <button
            key={s}
            type="button"
            className={s === stain ? 'gu-locale-btn gu-locale-btn-active' : 'gu-locale-btn'}
            onClick={() => setStain(s)}
          >
            {s}
          </button>
        ))}
        <button type="button" className="gu-locale-btn" onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>ZOOM+</button>
        <button type="button" className="gu-locale-btn" onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))}>ZOOM-</button>
        <button type="button" className="gu-locale-btn" onClick={() => setFieldIndex((f) => f + 1)}>FIELD+</button>
        <button type="button" className="gu-locale-btn" onClick={() => setSeed((s) => s + 1)}>RESEED</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <FingerprintChip label="record" value={record.reproducibilityFingerprint.slice(0, 12)} />
        <FingerprintChip label="view" value={frame.viewFingerprint.slice(0, 12)} />
        <span className="gu-hint" style={{ margin: 0 }}>what you see is what was computed</span>
      </div>
      {frame.note !== undefined && <p className="gu-hint">{frame.note}</p>}
      <p className="gu-hint">{record.disclosure}</p>
    </section>
  );
}
