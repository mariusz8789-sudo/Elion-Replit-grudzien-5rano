/**
 * MoleculeViewer (V6 Candidate Viewer) — REAL molecular rendering from a SMILES.
 *   • 2D: RDKit's own MolDraw2DSVG depiction (inlined, publication-quality).
 *   • 3D: ball-and-stick from RDKit ETKDG-embedded, force-field-optimised coordinates
 *         (Three.js, OrbitControls rotate/zoom, atom selection, PNG export).
 *   • Properties: formula, atom/bond counts, force field, formal charge.
 *
 * HONESTY: geometry + depiction come from the backend RDKit worker. If RDKit is
 * unavailable the viewer says so (BLOCKED_BY_RUNTIME) — it never draws a fake
 * structure. The 3D coordinates are computed, not measured (labelled as such).
 */
import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import { renderMolecule, type MoleculeRender, type MoleculeAtom, type MoleculeBond } from '../../core/backend/client';
import { Icon } from '../Icon';
import { StatusPill } from './DiscoveryShell';

/** CPK-ish element colours (hex) for the 3D model. */
const CPK: Record<string, number> = {
  H: 0xe6ecf5, C: 0x4b5468, N: 0x4c7dff, O: 0xf05a5a, S: 0xf0c419, P: 0xf0873a,
  F: 0x6ee7a0, Cl: 0x6ee7a0, Br: 0xb15b3a, I: 0xa06bd6, default: 0xd679a6,
};
const ATOM_R: Record<string, number> = { H: 0.28, C: 0.42, N: 0.4, O: 0.4, S: 0.5, P: 0.5, default: 0.44 };

export function MoleculeViewer({ smiles, title }: { smiles: string; title?: string }) {
  const [data, setData] = useState<MoleculeRender | null>(null);
  const [tab, setTab] = useState<'2d' | '3d' | 'props'>('2d');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!smiles) return;
    setLoading(true); setErr(null); setData(null);
    renderMolecule(smiles, 'both').then((r) => {
      setLoading(false);
      if (r.ok) setData(r.data); else setErr(r.message);
    });
  }, [smiles]);

  const d2 = data?.depiction2d;
  const m3 = data?.model3d;

  return (
    <div className="mv">
      <div className="mv-head">
        <div className="ds-tabs" style={{ margin: 0 }}>
          <button className={`ds-tab${tab === '2d' ? ' active' : ''}`} onClick={() => setTab('2d')}><Icon name="molecule" size={14} /> 2D</button>
          <button className={`ds-tab${tab === '3d' ? ' active' : ''}`} onClick={() => setTab('3d')}><Icon name="atom" size={14} /> 3D</button>
          <button className={`ds-tab${tab === 'props' ? ' active' : ''}`} onClick={() => setTab('props')}><Icon name="chart" size={14} /> Właściwości</button>
        </div>
        {d2?.ok ? <StatusPill kind="info">RDKit · {d2.molecularFormula}</StatusPill> : null}
      </div>

      {loading ? <div className="skeleton" style={{ height: 300 }} /> : null}
      {err ? <div className="ds-empty"><Icon name="alert" size={22} className="ds-empty-icon" /><h4>Backend niedostępny</h4><p>{err}</p></div> : null}

      {data && !loading ? (
        <>
          {tab === '2d' ? <Viewer2D depiction={d2} title={title ?? d2?.canonicalSmiles ?? smiles} /> : null}
          {tab === '3d' ? <Viewer3D model={m3 ?? null} /> : null}
          {tab === 'props' ? <ViewerProps data={data} /> : null}
        </>
      ) : null}
    </div>
  );
}

function Viewer2D({ depiction, title }: { depiction: MoleculeRender['depiction2d'] | undefined; title: string }) {
  if (!depiction?.ok || !depiction.svg) {
    return <div className="ds-empty"><Icon name="block" size={22} className="ds-empty-icon" /><h4>{depiction?.error ?? 'BLOCKED_BY_RUNTIME'}</h4><p>{depiction?.reason ?? 'RDKit nie jest dostępny — struktura nie jest rysowana (nigdy nie zmyślamy).'}</p></div>;
  }
  // Render the RDKit SVG as an isolated <img> data-URI: the depiction shows exactly
  // as authored (white card, black skeleton) with zero CSS/DOM bleed from the app.
  const svgIdx = depiction.svg.indexOf('<svg');
  const cleanSvg = svgIdx >= 0 ? depiction.svg.slice(svgIdx) : depiction.svg;
  const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}`;
  const exportSvg = () => {
    const a = document.createElement('a'); a.href = dataUri; a.download = `${title.slice(0, 40)}.svg`; a.click();
  };
  return (
    <div className="mv-stage">
      <div className="mv-2d"><img src={dataUri} alt={`Struktura 2D: ${title}`} /></div>
      <div className="mv-toolbar">
        <button className="ds-btn" onClick={exportSvg}><Icon name="chart" size={14} /> Eksportuj SVG</button>
      </div>
    </div>
  );
}

function ViewerProps({ data }: { data: MoleculeRender }) {
  const d2 = data.depiction2d, m3 = data.model3d;
  const rows: [string, string][] = [
    ['Wzór sumaryczny', d2?.molecularFormula ?? '—'],
    ['SMILES (kanoniczny)', d2?.canonicalSmiles ?? data.smiles],
    ['Atomy (z H)', m3?.ok ? String(m3.nAtoms) : '—'],
    ['Wiązania', m3?.ok ? String(m3.bonds?.length ?? 0) : '—'],
    ['Pole siłowe (3D)', m3?.ok ? String(m3.forceField) : '—'],
    ['Ładunek formalny', m3?.ok ? String(m3.charge) : '—'],
  ];
  return (
    <div className="mv-stage">
      <dl className="ds-defs" style={{ gridTemplateColumns: '1fr' }}>
        {rows.map(([k, v]) => <div key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: '1rem' }}><dt>{k}</dt><dd className="ds-mono" style={{ textAlign: 'right', wordBreak: 'break-all' }}>{v}</dd></div>)}
      </dl>
      <p className="ds-note ds-mt">Geometria 3D jest <strong>obliczona</strong> (ETKDG + MMFF/UFF), nie zmierzona eksperymentalnie.</p>
    </div>
  );
}

function Viewer3D({ model }: { model: MoleculeRender['model3d'] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selected, setSelected] = useState<{ element: string; x: number; y: number; z: number } | null>(null);

  useEffect(() => {
    if (!model?.ok || !model.atoms || !mountRef.current) return;
    const mount = mountRef.current;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      if (disposed) return;

      const width = mount.clientWidth || 480;
      const height = 360;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      mount.appendChild(renderer.domElement);
      canvasRef.current = renderer.domElement;

      scene.add(new THREE.AmbientLight(0xffffff, 0.75));
      const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(4, 6, 8); scene.add(key);

      const atoms = model.atoms as MoleculeAtom[];
      const bonds = (model.bonds ?? []) as MoleculeBond[];
      // Centre the molecule.
      const cx = atoms.reduce((s, a) => s + a.x, 0) / atoms.length;
      const cy = atoms.reduce((s, a) => s + a.y, 0) / atoms.length;
      const cz = atoms.reduce((s, a) => s + a.z, 0) / atoms.length;
      const group = new THREE.Group();
      const meta: { element: string; x: number; y: number; z: number }[] = [];
      const sphereGeo = new THREE.SphereGeometry(1, 24, 18);
      let maxR = 1;
      for (const a of atoms) {
        const r = ATOM_R[a.element] ?? ATOM_R.default;
        const mat = new THREE.MeshStandardMaterial({ color: CPK[a.element] ?? CPK.default, roughness: 0.35, metalness: 0.1 });
        const mesh = new THREE.Mesh(sphereGeo, mat);
        mesh.scale.setScalar(r);
        mesh.position.set(a.x - cx, a.y - cy, a.z - cz);
        mesh.userData = { element: a.element, x: a.x, y: a.y, z: a.z };
        group.add(mesh);
        meta.push({ element: a.element, x: a.x, y: a.y, z: a.z });
        maxR = Math.max(maxR, mesh.position.length() + r);
      }
      // Bonds as cylinders.
      const cylGeo = new THREE.CylinderGeometry(0.09, 0.09, 1, 12);
      const bondMat = new THREE.MeshStandardMaterial({ color: 0x8d97b4, roughness: 0.5 });
      const up = new THREE.Vector3(0, 1, 0);
      for (const b of bonds) {
        const a1 = atoms[b.a], a2 = atoms[b.b];
        if (!a1 || !a2) continue;
        const p1 = new THREE.Vector3(a1.x - cx, a1.y - cy, a1.z - cz);
        const p2 = new THREE.Vector3(a2.x - cx, a2.y - cy, a2.z - cz);
        const mid = p1.clone().add(p2).multiplyScalar(0.5);
        const dir = p2.clone().sub(p1);
        const len = dir.length();
        const cyl = new THREE.Mesh(cylGeo, bondMat);
        cyl.position.copy(mid);
        cyl.scale.set(1, len, 1);
        cyl.quaternion.setFromUnitVectors(up, dir.clone().normalize());
        group.add(cyl);
      }
      scene.add(group);

      camera.position.set(0, 0, maxR * 3.2 + 2);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true; controls.dampingFactor = 0.08;

      // Atom picking.
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const onClick = (ev: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(group.children, false).find((h) => (h.object as { userData?: { element?: string } }).userData?.element);
        if (hit) setSelected((hit.object as THREE.Mesh).userData as { element: string; x: number; y: number; z: number });
      };
      renderer.domElement.addEventListener('click', onClick);

      let raf = 0;
      const tick = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(tick); };
      tick();

      const onResize = () => { const w = mount.clientWidth || width; renderer.setSize(w, height); camera.aspect = w / height; camera.updateProjectionMatrix(); };
      window.addEventListener('resize', onResize);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
        renderer.domElement.removeEventListener('click', onClick);
        controls.dispose(); sphereGeo.dispose(); cylGeo.dispose(); renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      };
    })();

    return () => { disposed = true; cleanup(); };
  }, [model]);

  if (!model) return <div className="ds-empty"><Icon name="block" size={22} className="ds-empty-icon" /><h4>3D pominięte</h4><p>Model 3D nie został zażądany.</p></div>;
  if (!model.ok) return <div className="ds-empty"><Icon name="block" size={22} className="ds-empty-icon" /><h4>{model.error ?? 'BLOCKED_BY_RUNTIME'}</h4><p>{model.reason ?? 'RDKit/embed 3D niedostępny — nie rysujemy zmyślonej geometrii.'}</p></div>;

  const exportPng = () => {
    const c = canvasRef.current; if (!c) return;
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'molecule-3d.png'; a.click();
  };
  return (
    <div className="mv-stage">
      <div className="mv-3d" ref={mountRef} />
      <div className="mv-toolbar">
        <span className="ds-note">Przeciągnij, aby obrócić · scroll = zoom · kliknij atom</span>
        {selected ? <span className="mv-atom">Atom: <strong>{selected.element}</strong> ({selected.x.toFixed(2)}, {selected.y.toFixed(2)}, {selected.z.toFixed(2)} Å)</span> : null}
        <button className="ds-btn" onClick={exportPng} style={{ marginLeft: 'auto' }}><Icon name="chart" size={14} /> Eksportuj PNG</button>
      </div>
    </div>
  );
}
