import type { EpistemicLabel } from './epistemic';
import type { HumanDigitalTwinManifest } from './types';

/**
 * D-135 — VASCULAR / NEURAL / LYMPHATIC NETWORK GRAPHS.
 *
 * Before this module, `visualModes.ts`'s VASCULAR and NERVOUS display modes were a colour/visibility
 * filter over whole ORGAN meshes (heart/kidney/liver tinted red; the nervous-system organ nodes
 * tinted amber) — never a connective structure. That is not a network: it cannot show a vessel or a
 * nerve pathway between two organs, only "this organ belongs to that system". This module is the real
 * graph the brief asks for: named waypoints anchored to the manifest's own organ/region positions
 * (`anatomyAtlas.ts` stays the single source of truth for where the body actually is; a network never
 * invents its own body layout) and edges between them, each with a radius and a label.
 *
 * WHAT THIS IS, AND IS NOT. Every edge here is a SCHEMATIC major-vessel / major-nerve-trunk / major-
 * lymphatic-trunk path — the kind of topology diagram used in an anatomy atlas, not a patient-specific
 * angiogram or tractography scan. Every node and edge carries `epistemic: 'MODEL'` and nothing in this
 * module may upgrade that. It is deterministic and depends on nothing but the manifest passed in, so
 * two calls with the same manifest produce byte-identical graphs (required for replay/provenance).
 */

export type AnatomyNetworkKind = 'VASCULAR' | 'NEURAL' | 'LYMPHATIC';

export interface NetworkNode {
  readonly id: string;
  readonly label: string;
  readonly positionMeters: { readonly x: number; readonly y: number; readonly z: number };
  /** A hub node (a real anatomical landmark, e.g. a lymph node cluster) renders as a marker; a plain
   * waypoint (a point along a vessel/nerve trunk with no landmark of its own) does not. */
  readonly hub: boolean;
  readonly epistemic: EpistemicLabel;
}

export interface NetworkEdge {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly label: string;
  readonly radiusMeters: number;
  readonly epistemic: EpistemicLabel;
}

export interface AnatomyNetwork {
  readonly kind: AnatomyNetworkKind;
  readonly nodes: readonly NetworkNode[];
  readonly edges: readonly NetworkEdge[];
}

function pos(manifest: HumanDigitalTwinManifest, nodeId: string): { x: number; y: number; z: number } {
  const n = manifest.nodes.find((entry) => entry.id === nodeId);
  if (!n) throw new Error(`ANATOMY_NETWORK_ANCHOR_NOT_FOUND:${nodeId}`);
  return { ...n.positionMeters };
}

function mid(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, t = 0.5): { x: number; y: number; z: number } {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function offset(p: { x: number; y: number; z: number }, dx: number, dy: number, dz: number): { x: number; y: number; z: number } {
  return { x: p.x + dx, y: p.y + dy, z: p.z + dz };
}

/**
 * SCHEMATIC major vessels: aorta (heart -> abdominal trunk -> pelvis), pulmonary vessels (heart <->
 * each lung), renal arteries (abdominal trunk -> each kidney), a hepatic vessel (trunk -> liver), the
 * carotid (heart region -> head) and the superior vena cava (head -> heart, the return path).
 */
export function buildVascularNetwork(manifest: HumanDigitalTwinManifest): AnatomyNetwork {
  const heart = pos(manifest, 'heart');
  const head = pos(manifest, 'head');
  const abdomen = pos(manifest, 'abdomen');
  const pelvis = pos(manifest, 'pelvis');
  const leftLung = pos(manifest, 'left-lung');
  const rightLung = pos(manifest, 'right-lung');
  const leftKidney = pos(manifest, 'left-kidney');
  const rightKidney = pos(manifest, 'right-kidney');
  const liver = pos(manifest, 'liver');

  const nodes: readonly NetworkNode[] = [
    { id: 'v:heart', label: 'Serce (odejście naczyń)', positionMeters: heart, hub: true, epistemic: 'MODEL' },
    { id: 'v:aortic-arch', label: 'Łuk aorty', positionMeters: offset(heart, 0, 0.08, 0), hub: false, epistemic: 'MODEL' },
    { id: 'v:abdominal-aorta', label: 'Aorta brzuszna', positionMeters: abdomen, hub: true, epistemic: 'MODEL' },
    { id: 'v:iliac-bifurcation', label: 'Rozwidlenie biodrowe', positionMeters: mid(abdomen, pelvis, 0.85), hub: true, epistemic: 'MODEL' },
    { id: 'v:carotid-head', label: 'Tętnica szyjna → głowa', positionMeters: head, hub: true, epistemic: 'MODEL' },
    { id: 'v:left-lung', label: 'Płuco lewe', positionMeters: leftLung, hub: true, epistemic: 'MODEL' },
    { id: 'v:right-lung', label: 'Płuco prawe', positionMeters: rightLung, hub: true, epistemic: 'MODEL' },
    { id: 'v:liver', label: 'Wątroba', positionMeters: liver, hub: true, epistemic: 'MODEL' },
    { id: 'v:left-kidney', label: 'Nerka lewa', positionMeters: leftKidney, hub: true, epistemic: 'MODEL' },
    { id: 'v:right-kidney', label: 'Nerka prawa', positionMeters: rightKidney, hub: true, epistemic: 'MODEL' },
  ];
  const edges: readonly NetworkEdge[] = [
    { id: 'v:e-arch', fromId: 'v:heart', toId: 'v:aortic-arch', label: 'Aorta wstępująca', radiusMeters: 0.013, epistemic: 'MODEL' },
    { id: 'v:e-carotid', fromId: 'v:aortic-arch', toId: 'v:carotid-head', label: 'Tętnica szyjna wspólna', radiusMeters: 0.004, epistemic: 'MODEL' },
    { id: 'v:e-descending', fromId: 'v:aortic-arch', toId: 'v:abdominal-aorta', label: 'Aorta zstępująca', radiusMeters: 0.011, epistemic: 'MODEL' },
    { id: 'v:e-iliac', fromId: 'v:abdominal-aorta', toId: 'v:iliac-bifurcation', label: 'Aorta brzuszna → biodrowa', radiusMeters: 0.008, epistemic: 'MODEL' },
    { id: 'v:e-hepatic', fromId: 'v:abdominal-aorta', toId: 'v:liver', label: 'Tętnica wątrobowa', radiusMeters: 0.004, epistemic: 'MODEL' },
    { id: 'v:e-renal-l', fromId: 'v:abdominal-aorta', toId: 'v:left-kidney', label: 'Tętnica nerkowa lewa', radiusMeters: 0.0035, epistemic: 'MODEL' },
    { id: 'v:e-renal-r', fromId: 'v:abdominal-aorta', toId: 'v:right-kidney', label: 'Tętnica nerkowa prawa', radiusMeters: 0.0035, epistemic: 'MODEL' },
    { id: 'v:e-pulm-l', fromId: 'v:heart', toId: 'v:left-lung', label: 'Tętnica płucna lewa', radiusMeters: 0.006, epistemic: 'MODEL' },
    { id: 'v:e-pulm-r', fromId: 'v:heart', toId: 'v:right-lung', label: 'Tętnica płucna prawa', radiusMeters: 0.006, epistemic: 'MODEL' },
  ];
  return { kind: 'VASCULAR', nodes, edges };
}

/**
 * SCHEMATIC central nervous system trunk: brain -> a spinal cord waypoint chain through the neck,
 * thorax, abdomen and pelvis, with a small number of major peripheral branches (cervical/brachial
 * toward the shoulder area, lumbosacral toward the hip area) leaving the cord — a topology diagram,
 * not a tractography scan.
 */
export function buildNeuralNetwork(manifest: HumanDigitalTwinManifest): AnatomyNetwork {
  const brain = pos(manifest, 'brain');
  const head = pos(manifest, 'head');
  const thorax = pos(manifest, 'thorax');
  const abdomen = pos(manifest, 'abdomen');
  const pelvis = pos(manifest, 'pelvis');

  const cervical = mid(head, thorax, 0.4);
  const thoracicCord = mid(thorax, abdomen, 0.3);
  const lumbarCord = mid(abdomen, pelvis, 0.5);

  const nodes: readonly NetworkNode[] = [
    { id: 'n:brain', label: 'Mózg (pień)', positionMeters: brain, hub: true, epistemic: 'MODEL' },
    { id: 'n:cervical', label: 'Odcinek szyjny rdzenia', positionMeters: cervical, hub: true, epistemic: 'MODEL' },
    { id: 'n:thoracic', label: 'Odcinek piersiowy rdzenia', positionMeters: thoracicCord, hub: false, epistemic: 'MODEL' },
    { id: 'n:lumbar', label: 'Odcinek lędźwiowy rdzenia', positionMeters: lumbarCord, hub: true, epistemic: 'MODEL' },
    { id: 'n:sacral', label: 'Odcinek krzyżowy rdzenia', positionMeters: pelvis, hub: true, epistemic: 'MODEL' },
    { id: 'n:brachial-l', label: 'Splot ramienny lewy', positionMeters: offset(cervical, -0.22, -0.02, 0), hub: true, epistemic: 'MODEL' },
    { id: 'n:brachial-r', label: 'Splot ramienny prawy', positionMeters: offset(cervical, 0.22, -0.02, 0), hub: true, epistemic: 'MODEL' },
    { id: 'n:lumbosacral-l', label: 'Splot lędźwiowo-krzyżowy lewy', positionMeters: offset(lumbarCord, -0.14, -0.05, 0), hub: true, epistemic: 'MODEL' },
    { id: 'n:lumbosacral-r', label: 'Splot lędźwiowo-krzyżowy prawy', positionMeters: offset(lumbarCord, 0.14, -0.05, 0), hub: true, epistemic: 'MODEL' },
  ];
  const edges: readonly NetworkEdge[] = [
    { id: 'n:e-brainstem', fromId: 'n:brain', toId: 'n:cervical', label: 'Pień mózgu → rdzeń szyjny', radiusMeters: 0.006, epistemic: 'MODEL' },
    { id: 'n:e-cervical-thoracic', fromId: 'n:cervical', toId: 'n:thoracic', label: 'Rdzeń kręgowy (szyjny → piersiowy)', radiusMeters: 0.005, epistemic: 'MODEL' },
    { id: 'n:e-thoracic-lumbar', fromId: 'n:thoracic', toId: 'n:lumbar', label: 'Rdzeń kręgowy (piersiowy → lędźwiowy)', radiusMeters: 0.0045, epistemic: 'MODEL' },
    { id: 'n:e-lumbar-sacral', fromId: 'n:lumbar', toId: 'n:sacral', label: 'Rdzeń kręgowy (lędźwiowy → krzyżowy)', radiusMeters: 0.004, epistemic: 'MODEL' },
    { id: 'n:e-brachial-l', fromId: 'n:cervical', toId: 'n:brachial-l', label: 'Splot ramienny lewy', radiusMeters: 0.0035, epistemic: 'MODEL' },
    { id: 'n:e-brachial-r', fromId: 'n:cervical', toId: 'n:brachial-r', label: 'Splot ramienny prawy', radiusMeters: 0.0035, epistemic: 'MODEL' },
    { id: 'n:e-lumbosacral-l', fromId: 'n:lumbar', toId: 'n:lumbosacral-l', label: 'Splot lędźwiowo-krzyżowy lewy', radiusMeters: 0.0035, epistemic: 'MODEL' },
    { id: 'n:e-lumbosacral-r', fromId: 'n:lumbar', toId: 'n:lumbosacral-r', label: 'Splot lędźwiowo-krzyżowy prawy', radiusMeters: 0.0035, epistemic: 'MODEL' },
  ];
  return { kind: 'NEURAL', nodes, edges };
}

/**
 * SCHEMATIC lymphatic trunk: cervical nodes (neck) -> thoracic duct (the body's main lymphatic vessel,
 * running up the torso) -> abdominal trunk -> inguinal nodes (groin), plus an axillary (armpit-area)
 * node cluster off the thoracic duct near the thorax. Node clusters are drawn as hubs; the duct itself
 * is the connecting trunk.
 */
export function buildLymphaticNetwork(manifest: HumanDigitalTwinManifest): AnatomyNetwork {
  const head = pos(manifest, 'head');
  const thorax = pos(manifest, 'thorax');
  const abdomen = pos(manifest, 'abdomen');
  const pelvis = pos(manifest, 'pelvis');

  const cervical = offset(head, 0, -0.12, 0.02);
  const axillaryL = offset(thorax, -0.22, 0.05, 0);
  const axillaryR = offset(thorax, 0.22, 0.05, 0);
  const inguinalL = offset(pelvis, -0.13, -0.06, 0.03);
  const inguinalR = offset(pelvis, 0.13, -0.06, 0.03);

  const nodes: readonly NetworkNode[] = [
    { id: 'l:cervical', label: 'Węzły szyjne', positionMeters: cervical, hub: true, epistemic: 'MODEL' },
    { id: 'l:thoracic-duct-top', label: 'Przewód piersiowy (górny)', positionMeters: thorax, hub: false, epistemic: 'MODEL' },
    { id: 'l:axillary-l', label: 'Węzły pachowe lewe', positionMeters: axillaryL, hub: true, epistemic: 'MODEL' },
    { id: 'l:axillary-r', label: 'Węzły pachowe prawe', positionMeters: axillaryR, hub: true, epistemic: 'MODEL' },
    { id: 'l:cisterna-chyli', label: 'Zbiornik mleczu (cisterna chyli)', positionMeters: abdomen, hub: true, epistemic: 'MODEL' },
    { id: 'l:inguinal-l', label: 'Węzły pachwinowe lewe', positionMeters: inguinalL, hub: true, epistemic: 'MODEL' },
    { id: 'l:inguinal-r', label: 'Węzły pachwinowe prawe', positionMeters: inguinalR, hub: true, epistemic: 'MODEL' },
  ];
  const edges: readonly NetworkEdge[] = [
    { id: 'l:e-cervical-duct', fromId: 'l:cervical', toId: 'l:thoracic-duct-top', label: 'Przewód piersiowy (szyja → klatka)', radiusMeters: 0.003, epistemic: 'MODEL' },
    { id: 'l:e-duct-axillary-l', fromId: 'l:thoracic-duct-top', toId: 'l:axillary-l', label: 'Naczynia pachowe lewe', radiusMeters: 0.0025, epistemic: 'MODEL' },
    { id: 'l:e-duct-axillary-r', fromId: 'l:thoracic-duct-top', toId: 'l:axillary-r', label: 'Naczynia pachowe prawe', radiusMeters: 0.0025, epistemic: 'MODEL' },
    { id: 'l:e-duct-cisterna', fromId: 'l:thoracic-duct-top', toId: 'l:cisterna-chyli', label: 'Przewód piersiowy (klatka → brzuch)', radiusMeters: 0.0035, epistemic: 'MODEL' },
    { id: 'l:e-cisterna-inguinal-l', fromId: 'l:cisterna-chyli', toId: 'l:inguinal-l', label: 'Naczynia pachwinowe lewe', radiusMeters: 0.003, epistemic: 'MODEL' },
    { id: 'l:e-cisterna-inguinal-r', fromId: 'l:cisterna-chyli', toId: 'l:inguinal-r', label: 'Naczynia pachwinowe prawe', radiusMeters: 0.003, epistemic: 'MODEL' },
  ];
  return { kind: 'LYMPHATIC', nodes, edges };
}

export const ANATOMY_NETWORK_BUILDERS: Readonly<Record<AnatomyNetworkKind, (manifest: HumanDigitalTwinManifest) => AnatomyNetwork>> = {
  VASCULAR: buildVascularNetwork,
  NEURAL: buildNeuralNetwork,
  LYMPHATIC: buildLymphaticNetwork,
};

export interface NetworkValidationResult { readonly ok: boolean; readonly errors: readonly string[]; }

/** Every edge must reference a real node id, connect two distinct positions, and carry a positive radius. */
export function validateAnatomyNetwork(network: AnatomyNetwork): NetworkValidationResult {
  const errors: string[] = [];
  const byId = new Map(network.nodes.map((n) => [n.id, n]));
  if (new Set(network.nodes.map((n) => n.id)).size !== network.nodes.length) errors.push('DUPLICATE_NODE_ID');
  for (const e of network.edges) {
    const from = byId.get(e.fromId); const to = byId.get(e.toId);
    if (!from) errors.push(`EDGE_UNKNOWN_FROM:${e.id}:${e.fromId}`);
    if (!to) errors.push(`EDGE_UNKNOWN_TO:${e.id}:${e.toId}`);
    if (from && to && from.positionMeters.x === to.positionMeters.x && from.positionMeters.y === to.positionMeters.y && from.positionMeters.z === to.positionMeters.z) errors.push(`EDGE_ZERO_LENGTH:${e.id}`);
    if (!(e.radiusMeters > 0)) errors.push(`EDGE_NONPOSITIVE_RADIUS:${e.id}`);
    for (const p of [from?.positionMeters, to?.positionMeters]) {
      if (p && (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z))) errors.push(`NODE_NONFINITE_POSITION:${e.id}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
