import type * as THREE_NS from 'three';

/**
 * GENESIS — PER-WORLD GRADE (D-132).
 *
 * WHY THIS EXISTS. The Human Biology lab rendered washed out: a near-white floor filling the lower
 * half of frame, no black point, no depth falloff, and a hero subject that did not separate from its
 * background. The cause was not the lighting rig — it was that this one scene ran the pipeline's
 * GENERIC studio environment (`ambient: 'studio+hdri'`, a white-ceilinged box at
 * `environmentIntensity` 1.15) ON TOP of a scene that had already set its own dark background, its
 * own exponential fog and its own key/fill/rim. Two environments fought and the brighter one won.
 * Every other pipeline scene in the repository already opts out of that box.
 *
 * WHAT IT IS. One table of world identities and one function that applies one. It is a look, not a
 * renderer: no new pipeline, no second post chain, no scene graph of its own. A world says which
 * grade it is, and gets its black point, its fog, its ambient balance, its exposure, its bloom and
 * its floor treatment from the same place every other world gets them.
 *
 * WHY A TABLE RATHER THAN NUMBERS IN EACH SCENE. The design contract
 * (`docs/DESIGN_WORLD_FIRST.md`) requires that each world look like ITSELF — a biology clean room
 * is not a collider hall is not deep sky — while the MECHANISM stays shared. Numbers scattered
 * through six scene files give the opposite: one world gets tuned, the rest drift. Here the
 * difference between CERN and Cosmos is four lines of data you can read side by side.
 *
 * WHAT IT IS NOT. Nothing here touches epistemics. A darker room and a brighter rim light change
 * how a model looks, never what it is worth: a graded scene carries exactly the same MODEL /
 * SIMULATED / RECONSTRUCTED labels it carried before.
 */

/** The worlds that have an identity on record. Wiring is per scene; see `WORLD_GRADES` notes. */
export type WorldGradeId = 'biology' | 'physics' | 'cern' | 'cosmos' | 'molecular' | 'hyperscope';

export interface WorldGrade {
  readonly id: WorldGradeId;
  /** One line a reader can check the render against. */
  readonly intent: string;
  /** Scene clear colour — the black point the whole image is judged against. */
  readonly background: number;
  /** Exponential fog: what turns a flat box into depth. `density` 0 disables it. */
  readonly fog: { readonly color: number; readonly density: number };
  /** The ambient bounce. Kept LOW: ambient fills shadows, and a scene with no shadows has no form. */
  readonly hemisphere: { readonly sky: number; readonly ground: number; readonly intensity: number };
  /**
   * `scene.environmentIntensity` once the room probe has been captured. A capture of a real dim
   * interior reads several stops below the procedural studio box, so these sit well above 1.
   */
  readonly environmentIntensity: number;
  readonly exposure: number;
  readonly bloom: { readonly strength: number; readonly radius: number; readonly threshold: number };
  /** The floor is the largest surface in most of these worlds, so it decides the whole image. */
  readonly floor: {
    readonly color: number; readonly roughness: number; readonly metalness: number; readonly envMapIntensity: number;
    /**
     * How much of the floor material's own surface relief survives the grade. The shared PBR floor
     * carries a high-frequency normal map tuned for a matte, lit-from-above surface; on a dark,
     * reflective grade that same relief reads as wet speckle rather than as a floor — it was the
     * second thing that made the laboratory look cheap. 1 keeps the material as authored; lower
     * values flatten the relief so the reflection, not the noise, carries the surface. Default 1.
     */
    readonly normalScale?: number;
    /**
     * Whether the floor keeps the shared material's roughness NOISE map. That map is what paints the
     * speckle a dark reflective grade reads as standing water; three.js has no intensity on a
     * roughness map, so the honest choice is per-world: keep it (a matte, worn floor wants it) or
     * drop it and let the grade's own roughness carry a polished surface. Default true.
     */
    readonly roughnessDetail?: boolean;
  };
}

/**
 * The six world identities. Read the `intent` lines together: they are the design contract's
 * per-world table expressed as numbers, and no two worlds may collapse into the same look.
 */
export const WORLD_GRADES: Readonly<Record<WorldGradeId, WorldGrade>> = {
  biology: {
    id: 'biology',
    intent: 'Chłodna sterylna sala: ciemna satynowa posadzka, czytelne materiały, światło skupione na bliźniaku.',
    background: 0x04080e,
    fog: { color: 0x071019, density: 0.034 },
    hemisphere: { sky: 0x9db6d8, ground: 0x10161d, intensity: 0.14 },
    environmentIntensity: 1.35,
    exposure: 0.78,
    bloom: { strength: 0.16, radius: 0.45, threshold: 1.05 },
    floor: { color: 0x202a33, roughness: 0.58, metalness: 0.04, envMapIntensity: 0.35, normalScale: 0.35, roughnessDetail: false },
  },
  physics: {
    id: 'physics',
    // GFX-1 exposure pass. The hall fell to black everywhere the ceiling panels did not reach: the
    // ambient bounce sat at 0.17 with fog eating the far wall, so the image had highlights and
    // shadows and nothing in between — no midtones, no readable equipment, no readable scientist.
    // The room keeps its mood (deep black point, visible falloff, atmosphere) and gains the middle:
    // more bounce, lighter fog, a little more exposure, the probe carrying more of the room, and a
    // higher bloom threshold so the panels stop blooming into clipped white. The ambient bounce stays
    // at the guardrail this repo already enforces (≤ 0.22, exposure ≤ 1): ambient fills shadows, and a
    // room with no shadows has no form — the midtones come from the room probe and the practicals
    // instead, which keep their falloff.
    intent: 'Beton i metal, neutralne światło warsztatowe — cieplejsze i brudniejsze niż biologia.',
    background: 0x06080a,
    fog: { color: 0x0b0f13, density: 0.019 },
    hemisphere: { sky: 0xaab4c0, ground: 0x1b1f24, intensity: 0.22 },
    environmentIntensity: 1.62,
    exposure: 1.0,
    bloom: { strength: 0.2, radius: 0.55, threshold: 1.02 },
    floor: { color: 0x1a1d21, roughness: 0.42, metalness: 0.06, envMapIntensity: 0.7, normalScale: 0.22, roughnessDetail: false },
  },
  cern: {
    id: 'cern',
    intent: 'Hala detektora: stal, ostrzegawczy pomarańcz, bardzo głęboki cień — światło wydobywa tylko pierścienie.',
    background: 0x050403,
    fog: { color: 0x0d0a07, density: 0.026 },
    hemisphere: { sky: 0xffb582, ground: 0x0e0b08, intensity: 0.1 },
    environmentIntensity: 1.1,
    exposure: 0.8,
    bloom: { strength: 0.46, radius: 0.7, threshold: 0.76 },
    floor: { color: 0x17130f, roughness: 0.5, metalness: 0.1, envMapIntensity: 0.6 },
  },
  cosmos: {
    id: 'cosmos',
    intent: 'Brak powietrza i brak podłogi: czerń absolutna, zero mgły, światło punktowe niesie cały obraz.',
    background: 0x02030a,
    fog: { color: 0x02030a, density: 0 },
    hemisphere: { sky: 0x2a2f52, ground: 0x04040a, intensity: 0.05 },
    environmentIntensity: 0.55,
    exposure: 0.95,
    bloom: { strength: 0.62, radius: 0.85, threshold: 0.62 },
    floor: { color: 0x05060d, roughness: 1, metalness: 0, envMapIntensity: 0.2 },
  },
  molecular: {
    id: 'molecular',
    intent: 'Szkło i ciecz: chłodny fiolet, mocne refleksy, jaśniej niż biologia bo materiały są metaliczne.',
    background: 0x07060f,
    fog: { color: 0x0c0a18, density: 0.022 },
    hemisphere: { sky: 0xb9a8ff, ground: 0x12101c, intensity: 0.2 },
    environmentIntensity: 1.5,
    exposure: 0.92,
    bloom: { strength: 0.4, radius: 0.62, threshold: 0.82 },
    floor: { color: 0x15121f, roughness: 0.2, metalness: 0.16, envMapIntensity: 1 },
  },
  hyperscope: {
    id: 'hyperscope',
    intent: 'Ciemne pole mikroskopu: prawie wszystko czarne, świeci wyłącznie próbka.',
    background: 0x020506,
    fog: { color: 0x04080a, density: 0.04 },
    hemisphere: { sky: 0x6fd8c4, ground: 0x030708, intensity: 0.07 },
    environmentIntensity: 0.8,
    exposure: 0.86,
    bloom: { strength: 0.55, radius: 0.75, threshold: 0.7 },
    floor: { color: 0x070c0e, roughness: 0.55, metalness: 0.04, envMapIntensity: 0.4 },
  },
};

/**
 * Apply a grade's background, fog and ambient bounce to a scene. Returns the hemisphere light so a
 * caller can dispose it; everything else lives on the scene. Exposure, bloom and the probe intensity
 * are pipeline inputs — see `gradePipelineOptions`.
 */
export function applyWorldGrade(THREE: typeof THREE_NS, scene: THREE_NS.Scene, grade: WorldGrade): THREE_NS.HemisphereLight {
  scene.background = new THREE.Color(grade.background);
  scene.fog = grade.fog.density > 0 ? new THREE.FogExp2(grade.fog.color, grade.fog.density) : null;
  const hemi = new THREE.HemisphereLight(grade.hemisphere.sky, grade.hemisphere.ground, grade.hemisphere.intensity);
  hemi.name = `grade:${grade.id}:hemisphere`;
  scene.add(hemi);
  return hemi;
}

/** The pipeline inputs a grade owns. Spread into `setupGraphicsPipeline`'s options. */
export function gradePipelineOptions(grade: WorldGrade, probePosition: THREE_NS.Vector3Tuple): {
  toneMappingExposure: number;
  bloom: { strength: number; radius: number; threshold: number };
  ambient: { mode: 'room-probe'; probe: { position: THREE_NS.Vector3Tuple; intensity: number } };
} {
  return {
    toneMappingExposure: grade.exposure,
    bloom: { ...grade.bloom },
    // `room-probe`, never `studio+hdri`: these interiors are worth reflecting, and the generic
    // studio box is exactly what washed the biology lab out. The probe reflects the room itself.
    ambient: { mode: 'room-probe', probe: { position: probePosition, intensity: grade.environmentIntensity } },
  };
}

/** Apply a grade's floor treatment to an already-built floor material, in place. */
export function applyGradeFloor(material: THREE_NS.MeshStandardMaterial, grade: WorldGrade): void {
  material.color.setHex(grade.floor.color);
  material.roughness = grade.floor.roughness;
  material.metalness = grade.floor.metalness;
  material.envMapIntensity = grade.floor.envMapIntensity;
  // The relief the grade wants, not the relief the shared material happens to carry.
  const scale = grade.floor.normalScale;
  if (scale !== undefined && material.normalMap && material.normalScale) material.normalScale.setScalar(scale);
  // A polished floor: the grade's roughness alone, without the shared noise map's speckle.
  if (grade.floor.roughnessDetail === false) material.roughnessMap = null;
  material.needsUpdate = true;
}
