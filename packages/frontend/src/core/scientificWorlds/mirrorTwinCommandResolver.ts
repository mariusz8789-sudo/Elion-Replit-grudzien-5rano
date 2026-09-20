import type { CommandResolver, CommandResolverContext, ResolvedWorldCommand } from './worldCommand';
import { normalizeText } from './worldCommand';

const HUMAN_STUDY = 'station:human-study';

/**
 * D-136 — CANONICAL MIRROR TWIN COMMAND RESOLVER.
 *
 * Free text -> a canonical `INTERACT` `WorldCommand` carrying one of the `MIRROR_*` actions that
 * `packages/core/src/flagship/mirrorTwinCommandBridge.ts` already understands (`mirrorEventFromWorldCommand`).
 * This resolver only produces the canonical command shape; it never touches `mirrorTwin.ts`'s state
 * machine directly and never invents a transition the bridge doesn't already define — an action this
 * file emits that the existing state machine refuses (e.g. a sync tick requested before entering the
 * zone) is refused by that state machine, exactly as any other illegal transition is, not smoothed
 * over here. No second Mirror Twin, no second renderer: this is the text-command front door onto the
 * one that already exists.
 */
export const MIRROR_TWIN_COMMAND_RESOLVER: CommandResolver = {
  id: 'GENESIS_MIRROR_TWIN_CANONICAL_V1',
  resolve(ctx: CommandResolverContext): readonly ResolvedWorldCommand[] | null {
    const n = normalizeText(ctx.clauseText);
    // Stems, not whole words: Polish inflects "lustro" -> "lustra"/"lustrze"/"lustrem", "blizniak" ->
    // "blizniaka"/"blizniaku" — matching the whole word (like the earlier, now-fixed display-mode bug)
    // would silently miss ordinary sentences.
    if (!/(mirror|lustr|bliznia[kc])/.test(n)) return null;

    const interact = (action: string, parameters: Readonly<Record<string, string | number | boolean>> = {}): readonly ResolvedWorldCommand[] => [
      { text: ctx.clauseText, intent: 'INTERACT', targetEntityId: HUMAN_STUDY, parameters: { action, ...parameters } },
    ];

    if (/(wejdz|enter|start|uruchom|otworz)/.test(n)) return interact('MIRROR_ENTER_ZONE');
    if (/(telemetri|telemetr)/.test(n)) return interact('MIRROR_TELEMETRY', { consent: true, mode: 'SYNTHETIC_FALLBACK', confidence: 1, ttlMs: 15000 });
    if (/(sync|synchroniz)/.test(n)) return interact('MIRROR_SYNC_TICK', { progress: 1 });
    if (/(rozbiez|rozejdz|diverg)/.test(n)) return interact('MIRROR_DIVERGE', { divergenceAction: ctx.clauseText });
    if (/(nagraj|capture|zrzut|uchwyc)/.test(n)) return interact('MIRROR_CAPTURE');
    if (/(replay|odtworz)/.test(n)) return interact('MIRROR_REPLAY');
    if (/(reset|zresetuj|wyzeruj)/.test(n)) return interact('MIRROR_RESET');
    return null;
  },
};
