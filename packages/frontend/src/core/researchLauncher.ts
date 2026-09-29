import { NAV_ITEMS, RESEARCH_TOPICS, type ResearchAction, type ResearchTopic } from './navigation';
import { getGenesisCapability, listGenesisCapabilities, type GenesisCapabilityReadiness, type GenesisEpistemicLabel } from './capabilities/genesisCapabilityRegistry';

/**
 * RESEARCH LAUNCHER resolution: turns the topic config in `navigation.ts` into
 * something a screen can act on. Readiness and the epistemic label always come
 * from `genesisCapabilityRegistry`; an action that is not runnable today
 * resolves to null and is simply not shown. No routing, no chat logic here.
 */

export interface ResolvedLaunch {
  readonly label: string;
  readonly keywords?: string;
  /** Navigate here… */
  readonly hash?: string;
  /** …or send this existing command to the one Science Chat. */
  readonly chatCommand?: string;
  readonly readiness: GenesisCapabilityReadiness | 'ROUTE';
  readonly epistemicLabel?: GenesisEpistemicLabel;
}

const RUNNABLE: ReadonlySet<GenesisCapabilityReadiness> = new Set(['AVAILABLE', 'PARTIAL']);

/** The registry entry that visualises this route, if any: its readiness then governs the route too. */
function capabilityForRoute(hash: string) {
  return listGenesisCapabilities().find((c) => c.visualizationRoute === hash);
}

export function resolveLaunch(action: ResearchAction): ResolvedLaunch | null {
  const t = action.target;
  if (t.kind === 'capability' || t.kind === 'chat') {
    const cap = getGenesisCapability(t.capabilityId);
    if (!cap || !RUNNABLE.has(cap.readiness)) return null;
    if (t.kind === 'chat') {
      if (cap.selectionMode !== 'FABRIC' && cap.selectionMode !== 'CUSTOM_FLOW') return null;
      return { label: action.label, keywords: action.keywords, chatCommand: t.command, readiness: cap.readiness, epistemicLabel: cap.epistemicLabel };
    }
    if (!cap.visualizationRoute) return null;
    return { label: action.label, keywords: action.keywords, hash: cap.visualizationRoute, readiness: cap.readiness, epistemicLabel: cap.epistemicLabel };
  }
  const hash = t.kind === 'nav' ? NAV_ITEMS.find((i) => i.id === t.navId && i.status !== 'planned')?.hash : t.hash;
  if (!hash) return null;
  const cap = capabilityForRoute(hash);
  if (cap && !RUNNABLE.has(cap.readiness)) return null;
  return { label: action.label, keywords: action.keywords, hash, readiness: cap?.readiness ?? 'ROUTE', epistemicLabel: cap?.epistemicLabel };
}

export interface ResolvedTopic { readonly topic: ResearchTopic; readonly actions: readonly ResolvedLaunch[] }

/** Topics with only their runnable actions; a topic with none is dropped. */
export function resolvedResearchTopics(): readonly ResolvedTopic[] {
  return RESEARCH_TOPICS
    .map((topic) => ({ topic, actions: topic.actions.map(resolveLaunch).filter((a): a is ResolvedLaunch => a !== null) }))
    .filter((t) => t.actions.length > 0);
}

/** Short, honest label for the kind of knowledge an action yields. */
export function epistemicBadge(label: GenesisEpistemicLabel | undefined): string | null {
  switch (label) {
    case 'EXTERNAL_REAL_OBSERVATION': return 'REAL DATA';
    case 'LIVE_COMPUTATIONAL_EXPERIMENT': return 'COMPUTED';
    case 'EDUCATIONAL_MODEL': return 'EDUCATIONAL';
    case 'TOY_MODEL': return 'TOY MODEL';
    case 'THEORETICAL_MODEL': return 'THEORY';
    case 'SCENARIO': return 'SCENARIO';
    case 'PROTOTYPE': return 'PROTOTYPE';
    case 'MODEL': return 'MODEL';
    default: return null;
  }
}
