# Genesis Graphics — the visual target

**These two images are the agreed visual target for Genesis. They are the reference every graphics
decision is measured against.** They were supplied by the project owner with the instruction that
this is how Genesis is meant to look — so they live in the repo rather than in a chat log, and they
survive any loss of session context.

| File | What it shows |
|---|---|
| `genesis-virtual-lab.png` | The Virtual Lab: a photoreal bioreactor hero shot, a multi-camera "Auto Science Director" rig, live instrument charts, causal-lineage panel |
| `genesis-epidemiology-city.png` | The World Engine: a night city seen from the air, glowing infection hotspots, dense lit skyline, live epidemiology panels |

## What these are, and what they are not

**They are a target, not a screenshot of Genesis.** Nothing in the current build looks like this yet.
They are concept renders — a bar to climb toward, not evidence of a shipped state. Do not present
them, or anything resembling them, as a capture of the running product. (See `../../../../..` repo
convention on REAL / APPROXIMATION / NOT_MODELLED / BLOCKED labelling.)

**Crucially, they do not change the science rules.** The glowing hotspots in the city render are only
legitimate if they are driven by real C3 state through the canonical WorldFrame. A beautiful render of
invented data is the exact failure this engine's contracts exist to prevent — see
`../ADAPTER_CONTRACT.md` and `../SOLVER_DATA_CONTRACT.md`. The target is *how it looks*, never *what
it claims*.

## The specific, extractable qualities to build toward

Read as a checklist rather than a mood board — each of these is a concrete, implementable property:

1. **Density.** The skyline runs to the horizon. Massing is continuous, not a handful of objects on
   an empty plane. Depth comes from hundreds of buildings, not from fog alone.
2. **Emissive windows everywhere.** The night city reads as lit because thousands of small warm/cool
   window quads glow. This is the single highest-impact cheap effect, and it must be instanced
   (`createFacadeBuilding` already does one `InstancedMesh` per building for exactly this reason).
3. **Bloom, used with restraint.** Lights bleed slightly. Bright emissive surfaces halo. The pipeline
   already has `UnrealBloomPass` — the target's look depends on it being on and correctly tuned.
4. **Atmospheric perspective.** Distant geometry desaturates and fades into haze; near geometry stays
   crisp. This is what separates "a world" from "objects at various distances".
5. **Warm/cool colour contrast.** Cyan/blue ambient city against warm amber windows and red state
   hotspots. Neutral grey everywhere is what makes a scene read as a technical demo.
6. **State as coloured light, not repainted objects.** In the target, an infection hotspot is a pool
   of red *light* over a district — the buildings underneath keep their own materials. Repainting a
   whole building in a state colour is what the current build did and what made it look like a toy.
7. **Roads that read as roads.** Markings, kerbs, vehicle light trails, wet specular response.
8. **Real reflections where water exists.** The coast/water in the target carries the city's lights.
9. **Composed camera.** The hero shot is framed — an elevated three-quarter view with a clear
   subject, not an arbitrary orbit position.
10. **UI and 3D share one palette.** The panels and the scene are the same design system; the 3D view
    is not a separate-looking widget embedded in a different-looking app.

## Honest gap between target and current build

Recorded so progress is measurable rather than asserted:

- Density: current scientific-city context is ~20 buildings on a 150-unit plot. Target is a skyline.
- Emissive windows: **done** at kit level (`createFacadeBuilding`, instanced).
- Bloom: available in `postProcessing.ts`; needs per-scene verification that it is actually enabled.
- Atmospheric perspective: fog exists (`environment.ts`); the depth-graded desaturation of the target
  is not implemented.
- Hotspot light pools: **not implemented**, and correctly blocked on real C3 state to drive them.
- Water/reflections: `water.ts` exists but is not wired into any production scene.
- Vehicle light trails, road markings, kerbs: not implemented.
- Composed camera: `cameraRig.ts` exists and is used; cinematic framing presets are partial.
