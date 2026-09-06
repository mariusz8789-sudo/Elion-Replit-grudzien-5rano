import type { GenesisEvent } from '../../events/genesisEvent';
import { relationshipCascadeRule, withCascades, type CascadeRule } from '../cascade/cascadeRules';
import type { GroundingLevel, WorldModelEntity, WorldModelEntityPatch } from '../ecs/types';
import type { TemporalUpdater } from '../temporal/temporalEngine';

/**
 * CROSS-DOMAIN COUPLING (Generative Scientific World Model 2.0, section 8).
 *
 * NOT a universal physics engine: a `CrossDomainCoupling` is a STRUCTURED,
 * inspectable declaration wrapped around the existing
 * `relationshipCascadeRule` (cascade/cascadeRules.ts) — the actual
 * execution mechanism is reused verbatim, never reimplemented. What this
 * adds is making the mission's required fields (source domain, target
 * domain, the relationship it travels over, its condition, its effect, and
 * its own honesty disclosure) queryable DATA on the coupling itself, not
 * just implicit in a closure — so a scenario, a test, or eventually C1 can
 * ask "what cross-domain dependencies does this world have?" without
 * re-deriving them from code.
 *
 * `time` and `provenance` (the other two fields the mission requires) are
 * supplied by the underlying `GenesisEvent` each execution produces
 * (`timestamp`, `provenance.origin: 'consequence-rule'`) — never
 * duplicated here.
 */
export interface CrossDomainCoupling {
  readonly id: string;
  readonly sourceDomain: string;
  readonly targetDomain: string;
  readonly relationshipKind: string;
  /** Human-readable description of the triggering condition — documentation/introspection only; the actual check lives in `deriveEffect`. */
  readonly condition: string;
  /** Human-readable description of the effect this coupling applies when its condition holds. */
  readonly effect: string;
  /** This coupling's OWN honesty disclosure — e.g. `MODEL_ESTIMATE` when the condition is a real solver's numeric output, `PROCEDURAL_APPROXIMATION` for a qualitative flag with no quantitative backing behind it. Never `GROUNDED_EXACT` for a cross-domain link, since no validated unified model connects two independent domains exactly. */
  readonly grounding: GroundingLevel;
  readonly rule: CascadeRule;
}

export interface DefineCrossDomainCouplingOptions {
  id: string;
  sourceDomain: string;
  targetDomain: string;
  triggerEventType: string;
  relationshipKind: string;
  direction: 'from' | 'to';
  condition: string;
  effect: string;
  grounding: GroundingLevel;
  deriveEffect: (relatedEntity: WorldModelEntity, triggerEvent: GenesisEvent) => { patch: WorldModelEntityPatch; eventType: string; cause: string } | undefined;
}

export function defineCrossDomainCoupling(options: DefineCrossDomainCouplingOptions): CrossDomainCoupling {
  return {
    id: options.id,
    sourceDomain: options.sourceDomain,
    targetDomain: options.targetDomain,
    relationshipKind: options.relationshipKind,
    condition: options.condition,
    effect: options.effect,
    grounding: options.grounding,
    rule: relationshipCascadeRule({
      triggerEventType: options.triggerEventType,
      relationshipKind: options.relationshipKind,
      direction: options.direction,
      deriveEffect: options.deriveEffect,
    }),
  };
}

/** Composes every coupling's underlying rule into `updater` via the existing `withCascades` — never a second cascade engine. */
export function withCrossDomainCouplings(updater: TemporalUpdater, couplings: readonly CrossDomainCoupling[]): TemporalUpdater {
  return withCascades(
    updater,
    couplings.map((c) => c.rule),
  );
}
