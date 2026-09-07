# The Honest Adapter Contract

**One of three documents in the same family — read the right one for your question:**

| Document | Question it answers | Audience |
|---|---|---|
| `VISUALIZATION_REUSE_AUDIT.md` | *Which domains already have a real visualization, and can it be reused?* | C2, planning |
| `SOLVER_DATA_CONTRACT.md` | *What data must a solver produce for C2 to render it at all?* | C3, implementing |
| **`ADAPTER_CONTRACT.md`** (this one) | ***Given that data, how is an honest C2 adapter written?*** | **C2, implementing** |

**Before writing an adapter, read the RULE box in §2** on where a discrete `entity.status` token
actually comes from (it is derived by the adapter, not supplied ready-made by C3), and
`SOLVER_DATA_CONTRACT.md` Rule 3 for what a solver must emit to make that derivation possible.

## Why this document exists

`waterInfrastructureBridge.ts` is the first — and, as of this writing, only — example of a real
pattern: a `WorldFrameRenderer` resolver/updater pair built for a C3 domain that doesn't have real,
queryable, spatial state yet. It was built once, under time pressure, by working the rules out from
first principles (this engine's core "never fabricate a scientific state" rule, applied to a
renderer). Nothing wrote those rules down as a standard — they only exist as comments inside that one
file.

That's a problem the moment a second domain needs the same treatment. C3 is currently running a full
scientific consolidation audit before it ships any new domain (weather, structural, fire, traffic,
quantum, or whatever the audit prioritizes) — see this repo's own mission history. When one of those
domains ships real state, whoever builds its C2 adapter should not have to re-derive this contract
from scratch, or worse, quietly skip a rule `waterInfrastructureBridge.ts` happened to get right by
accident of careful writing. This document is that write-up: a checklist and a rationale, kept
separate from any one adapter's implementation so it survives even if `waterInfrastructureBridge.ts`
itself is later refactored or removed.

**This is a contract for HOW to write an adapter, not a promise that one is needed.** Most domains
never need this at all — a `Sim3D` scene that resolves its own real WorldFrame entities directly
(most of this codebase) has nothing to bridge. This pattern exists specifically for the narrow case:
a real domain entity exists conceptually, is spatially real, but its dynamic STATE is not yet backed
by a real solver/model, or is only partially backed. If a domain ships with full real state from day
one, it likely doesn't need an "honest adapter" at all — just a normal `resolveVisual`/`updateVisual`
pair, no `isReallyModeled()` gate required. Reach for this contract when you're tempted to render a
state that isn't real yet, not as boilerplate for every new domain.

## The shape

An adapter is a factory function returning exactly this shape (see `WorldFrameRendererOptions` in
`worldFrameRenderer.ts`):

```ts
export interface YourDomainAdapter {
  resolveVisual(entity: WorldFrameEntity): EntityVisualSpec;
  updateVisual(entity: WorldFrameEntity, object: THREE_NS.Object3D): void;
  dispose(): void;
}

export function createYourDomainAdapter(
  THREE: typeof THREE_NS,
  materials: YourDomainAdapterMaterials, // caller-owned, see "Materials" below
): YourDomainAdapter { /* ... */ }
```

A caller wires it in with zero glue code:

```ts
const adapter = createYourDomainAdapter(THREE, materials);
const renderer = new WorldFrameRenderer(THREE, scene, {
  resolveVisual: adapter.resolveVisual,
  updateVisual: adapter.updateVisual,
});
// on scene teardown:
adapter.dispose();
```

That's the whole integration surface. If your adapter needs anything more than this triple, it
probably isn't a `WorldFrameRenderer` adapter — reconsider before adding new integration surface here.

## The rules, in the order you'll hit them

### 1. Visual-hint routing: a guard function, not a hardcoded string

Export a `ReadonlySet` of the `visualHint` values your adapter understands, and a type-guard function
over it:

```ts
export type YourDomainVisualHint = 'object:your-thing-a' | 'object:your-thing-b';
const YOUR_DOMAIN_VISUAL_HINTS: ReadonlySet<string> = new Set<YourDomainVisualHint>([...]);
export function isYourDomainVisualHint(hint: string | undefined): hint is YourDomainVisualHint {
  return hint !== undefined && YOUR_DOMAIN_VISUAL_HINTS.has(hint);
}
```

This lets a multi-domain caller (a scene composing several adapters) route each entity to the right
adapter without either adapter needing to know the others exist, and without duplicating the hint
list at every call site. `waterInfrastructureBridge.ts`'s `isWaterInfrastructureVisualHint` is the
reference implementation.

### 2. The `isReallyModeled()` gate — the one rule everything else exists to serve

This is the actual point of the whole pattern. Define, once, a narrow predicate:

```ts
const KNOWN_STATES: ReadonlySet<string> = new Set<YourDomainState>(['STATE_A', 'STATE_B', /* ... */]);
function isReallyModeled(entity: WorldFrameEntity): entity is WorldFrameEntity & { status: YourDomainState } {
  return entity.grounding !== 'NOT_MODELED' && KNOWN_STATES.has(entity.status ?? '');
}
```

Two independent conditions, both required:

- **`entity.grounding !== 'NOT_MODELED'`** — the entity-level honesty signal `worldFrame.ts` defines.
  Note this is almost always already `true` by the time your adapter's `resolveVisual` even runs: an
  entity with `grounding: 'NOT_MODELED'` never reaches ANY domain resolver — `worldFrameRenderer.ts`
  intercepts it earlier and renders its own generic placeholder (see "Two different axes of honesty"
  below). This check in your adapter mostly matters inside `updateVisual`, since an entity's grounding
  can change between one sync and the next (a real state feed can go stale/disconnect) — always
  re-check it every call, don't cache the result from `resolveVisual`.
- **`KNOWN_STATES.has(entity.status ?? '')`** — an **allowlist**, never a denylist. Your domain's real
  state enum is finite and known in advance (it comes from your own kit's own state type, e.g.
  `WaterInfrastructureState`). Anything NOT in that allowlist — an empty string, a typo, a future
  state your kit doesn't render yet, a value some other domain's convention put there by mistake — is
  treated as unmodeled, not guessed at. Never write `if (status !== 'FAILED') { /* assume normal */ }`;
  always write `if (KNOWN_STATES.has(status)) { /* the one thing this status legitimately means */ }`.

Both branches of the boolean matter for the same reason: a `status` string existing at all does not
mean it is REAL. C3 could ship an entity with a `status` field for an entirely different purpose (a
lifecycle stage, a UI-only tag) that happens to collide with one of your allowlist strings — the
`grounding` check is what stops that coincidence from becoming a fabricated reading. Conversely, a
`grounding` of `'MODELED'` does not mean every field on the entity is real — hence the allowlist stays
in force even when grounding passes.

> **RULE — `entity.status` is NOT a ready-made discrete token supplied by C3, and an adapter must
> never assume it is.** No current solver follows that pattern: C3's solvers write a *human-readable
> description* into `statusLabel` (which becomes `entity.status`) — real examples shipping today are
> `'Pump tripped (overload protection)'`, `` `Q=0.030m³/s, 1240W shaft power` ``, and
> `` `I=42 R=13 D=2 (day 7.5)` ``. **None of those can ever match a `KNOWN_STATES` allowlist**, so an
> adapter that gates on `entity.status` alone will classify every entity as `notModeled` forever,
> silently. The discrete token MUST instead be **derived deterministically by the adapter (or the
> scene's frame builder) from the solver's real numeric or structural output** — the working pattern
> already in production, from `genesisScientificCitySim.ts`:
>
> ```ts
> const status = entity.scalars.volumetricFlow === 0 ? 'FAILED' : 'NORMAL';
> ```
>
> That derivation is a real domain fact read from a real solver output, and it belongs in reviewable
> code with a comment naming the quantity it reads — it is not a fabricated label. `KNOWN_STATES`
> then remains exactly as specified above: the allowlist that validates the *derived* token, and the
> gate that keeps anything unrecognised at a neutral appearance. Detailed requirements on what a
> solver must emit for such a derivation to be possible (numeric channels, units, documented
> thresholds) are formalised in **`SOLVER_DATA_CONTRACT.md`** (Rule 3).

### 3. What "not really modeled" renders as: real geometry, neutral state — never an empty group, never a guessed reading

When `isReallyModeled()` is false, the adapter's job is:

- **Still build the correct real geometry** for that visual hint, via your domain's own existing kit
  (e.g. `waterInfrastructure.ts`'s `createPump`). Never a placeholder box, never an empty
  `THREE.Group()` — the entity is spatially/conceptually real (that's WHY it reached your adapter and
  not `worldFrameRenderer.ts`'s own `NOT_MODELED` short-circuit); only its dynamic reading is unreal.
  A viewer should see "a real pump, in its default/neutral look" — not "nothing" and not "a red FAILED
  pump for no real reason."
- **Never call the state-transition method** (`setState`, or whatever your kit's own visual-state API
  is called) with a guessed value. Simplest correct default: don't call it at all, and let the kit's
  own construction-time default stand (e.g. `createPump(..., { state: 'NORMAL' })` at build time is
  fine — that's a static prop, not a claim about live state — but `updateVisual` must never call
  `setState()` again unless `isReallyModeled()` is true for THAT sync).
- **Tag it**: `object.userData.notModeled = !isReallyModeled(entity)`. Set this once in `resolveVisual`
  at creation AND re-set it every `updateVisual` call (an entity can transition from real-backed to
  not, or back, between frames — the tag must track the CURRENT sync, not just the entity's state at
  creation). This is what lets a test or an inspector panel assert "this component's appearance is not
  backed by a real model" without re-deriving the grounding logic itself. Name the field exactly
  `notModeled` — a second adapter inventing its own name (`isUnmodeled`, `fakeState`, `noData`) makes
  every future cross-domain test/inspector re-learn a new convention for the same concept.

### 4. Local-origin geometry — build at `[0, 0, 0]`, always

Every object your `resolveVisual` constructs must be positioned at local origin (`position: [0, 0, 0]`
passed to whatever kit function builds it), regardless of where the entity actually is in the world.
This is not a simplification — it is required correctness: `WorldFrameRenderer.applyTransform` (see
`worldFrameRenderer.ts`) calls `object.position.set(...entity.position)` on every tracked object on
every `sync()`, unconditionally overwriting whatever position the object already had. Any position an
adapter bakes into its geometry above `[0, 0, 0]` is silently clobbered the very next sync — worse, it
can produce a confusing ONE-FRAME-ONLY correct-looking result during manual testing that then visibly
snaps to the wrong place, since the object briefly renders at its construction position before the
first `sync()` pass reapplies the real one.

If your visual is a composite that needs internal offsets between its own parts (e.g. a pump's motor
sitting above its housing), those offsets are relative to the returned object's own local origin —
fine, expected, unrelated to this rule. The rule is specifically: the OUTERMOST object your
`resolveVisual` hands back must have no assumption baked in about its OWN absolute position in world
space. `WorldFrameEntity.position`/`.rotation`/`.scale` are the only source of truth for that, and they
flow through `WorldFrameRenderer`, not through your adapter.

**A pipe/connector to a SECOND entity's position is explicitly out of scope for this pattern.** If your
domain has a real relationship between two entities (a pipe run connecting a pump to a building, a
cable connecting two nodes), `resolveVisual` for a single entity has no way to know the other
endpoint's position — it only ever receives ONE `WorldFrameEntity` at a time. See
`genesisScientificCitySim.ts`'s own resolution: build that connector ONCE, directly, as static
scene decoration outside the `WorldFrameRenderer`/adapter pathway entirely (using the domain kit's own
exported primitives directly, e.g. `createPipeNetwork`), when the real endpoints are static for the
scene's lifetime. This is not a second visual system — it's reuse of the same kit functions the
adapter itself calls, just invoked directly by scene code that has both positions in hand. Do not try
to extend `EntityVisualSpec` or `WorldFrameRenderer` itself to support multi-entity geometry to avoid
this — that would be exactly the kind of speculative renderer-level complexity the architecture
forbids (see `worldFrameRenderer.ts`'s own "grep this file: there is no domain branch" rule).

### 5. Materials are caller-owned

An adapter's factory function takes a `materials` argument and never disposes any material it didn't
create itself internally. This matches every other kit in this engine (see `sceneEnvironment.ts`'s own
`ownsGroundMaterial` tracking for the general pattern). If your adapter needs a fallback for an
optional material slot (`materials.pipeMaterial ?? materials.housingMaterial`), that's fine — but never
call `.dispose()` on anything the caller handed you.

### 6. `dispose()` clears bookkeeping only — it does not touch the scene

`WorldFrameRenderer.dispose()` (or its own per-entity removal during `sync()`) is what actually removes
objects from the scene and calls `disposeSceneResources()` on them — that's the renderer's job, not the
adapter's. An adapter's own `dispose()` only needs to forget whatever per-entity bookkeeping it kept
(e.g. a `Map<entityId, TrackedHandle>` for calling `setState()` later) — see
`waterInfrastructureBridge.ts`'s `dispose()`, which is exactly `handles.clear()`. Call the adapter's
`dispose()` when the OWNING `WorldFrameRenderer` is disposed, not before (the renderer may still be
calling `updateVisual` up to that point).

### 7. Two different axes of "not real" — do not conflate them

This tripped up an earlier pass on this exact bridge, so it's worth stating explicitly:

- **`entity.grounding === 'NOT_MODELED'`** is handled ENTIRELY inside `WorldFrameRenderer` itself,
  BEFORE your adapter's `resolveVisual` is ever called. Such an entity renders as
  `defaultBoundaryPlaceholder` (or a caller's `resolveBoundaryPlaceholder` override) — a generic,
  domain-blind, translucent wireframe sphere. Your adapter has NO say over this case; it never even
  sees the entity.
- **`entity.status` being missing, empty, or an unrecognized string** (while `grounding` is still
  `'MODELED'`/omitted) is entirely YOUR adapter's responsibility, via `isReallyModeled()` above. This
  entity DOES reach your `resolveVisual`/`updateVisual` — it renders real, correctly-shaped geometry,
  just with a neutral/default state rather than a fabricated reading.

If you find yourself checking `entity.grounding` inside your OWN `resolveVisual`/`updateVisual` for
any reason other than the re-check `isReallyModeled()` already does, stop — that's very likely this
conflation happening again. The renderer already handled the `NOT_MODELED`-as-a-whole-entity case for
you.

## Checklist for a new domain adapter

1. Confirm the domain genuinely needs this pattern: a real, spatial entity exists, but its dynamic
   state is not (yet, or not fully) backed by a real C3 solver. If the domain ships full real state,
   skip this whole pattern — write a plain resolver.
2. Define the domain's real state enum as a TypeScript union, sourced from the domain's own visual kit
   (not invented in the adapter file) — this becomes `KNOWN_STATES`.
3. Write the `is<Domain>VisualHint` guard + hint set.
4. Write `isReallyModeled()`: `grounding !== 'NOT_MODELED' && KNOWN_STATES.has(status ?? '')`.
5. `resolveVisual`: build real geometry at local origin via the domain's own kit; tag
   `userData.notModeled = !isReallyModeled(entity)`; tag `userData.<domain>VisualHint = entity.visualHint`
   for inspectability, matching the water bridge's own convention.
6. `updateVisual`: re-check `isReallyModeled()` (state can change between syncs); update the
   `notModeled` tag; call the state-transition method ONLY when modeled, with the real `status`, never
   otherwise.
7. `dispose()`: clear only this adapter's own bookkeeping map(s).
8. If the domain has a real cross-entity relationship (a connector to a second entity), build it once,
   directly, outside the adapter — see rule 4 above — never by extending `WorldFrameRenderer`/
   `EntityVisualSpec`.
9. Test the honesty boundary explicitly, the way `graphicsWaterInfrastructureBridge.test.ts` does: an
   entity with no `status`, an entity with an unrecognized `status`, and an entity with
   `grounding: 'NOT_MODELED'` must all render real geometry tagged `notModeled: true` and must never
   trigger a state-driven visual change. Then test the positive path: a real, allowlisted `status`
   (with `grounding` not `'NOT_MODELED'`) DOES drive the visual, and `notModeled` is `false`.
10. Wire it into exactly the real production scene(s) that have a real entity of this kind — per this
    engine's own "engine module → production scene → visible result" gate — never into a scene as
    decorative population dressed up to look like it's driven by real state.

## Reference implementation

`graphics/waterInfrastructureBridge.ts` is the canonical example this document was extracted from.
Read it alongside this document; where they ever disagree, this document describes the intended
general contract and the water bridge should be brought in line with it (file a note in its own
module doc rather than silently drifting).
