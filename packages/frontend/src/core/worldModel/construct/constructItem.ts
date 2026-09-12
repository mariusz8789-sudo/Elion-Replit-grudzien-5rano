import type { DataProvenance } from '../../dataProvenance';
import type { EpistemicStatus } from '../../generator/recipe';
import type { GenesisScientificCity4Options } from '../domains/genesisScientificCity4';

/**
 * GENESIS CONSTRUCT — declarative manifest vocabulary (Variant 1: Construct
 * -> WorldRegistry -> genesisScientificCity4.ts).
 *
 * Construct is a LOADER + STATE MACHINE, not a new engine: a `ConstructItem`
 * never carries simulation logic, only what world to build (`worldType` +
 * `options`, dispatched to an existing builder — today only
 * `buildGenesisScientificCity4`) and what it is DECLARED to be before it is
 * ever built.
 *
 * Per the epistemic-axis audit (generator/recipe.ts::EpistemicStatus REUSE,
 * core/dataProvenance.ts::DataProvenance KEEP SEPARATE, GraphEpistemicStatus/
 * HypothesisAssessment/ResearchChainTerminalStatus KEEP SEPARATE, no master
 * epistemic enum): a `ConstructItem` reuses those two EXISTING typed axes
 * verbatim rather than inventing a third "construct epistemic status".
 *
 * A genuine gap was found and is being resolved here, not silently papered
 * over: the audit's third requested axis, "scenario/training status", has
 * NO existing typed counterpart anywhere in Genesis (checked
 * `WorldModelProposalSource`, `ScenarioKind`, `KnowledgeEpistemicStatus`,
 * `HonestyLevel` — none represent it; `HonestyLevel` is documented
 * elsewhere as a separate mathematical-fidelity axis). On inspection this
 * is because it isn't a SCIENTIFIC epistemic claim at all: it is Construct's
 * OWN operational lifecycle for one manifest item, which the task brief
 * itself authorizes ("Construct is loader + state machine"). `ConstructLoadState`
 * below is that minimal, non-epistemic state machine — it never competes
 * with, extends, or is read as a claim-reliability axis by anything else.
 */

/** The one builder Construct currently knows how to dispatch to. Adding a second real production consumer means adding a member here AND a matching case in construct.ts's builder switch — never a silent fallback. */
export type ConstructWorldType = 'GENESIS_SCIENTIFIC_CITY_4';

/**
 * Construct's own item lifecycle — NOT an epistemic/scientific axis (see
 * module doc above). `PENDING` items have never been attempted; `LOADED`
 * items have a live world registered in the shared `WorldRegistry`;
 * `FAILED` items were attempted and threw (see `ConstructLoadedEntry.error`
 * for the explicit, never-swallowed reason); `UNLOADED` items were LOADED
 * and have since been explicitly unloaded.
 */
export type ConstructLoadState = 'PENDING' | 'LOADED' | 'FAILED' | 'UNLOADED';

/**
 * One declared, pre-authored world to load. `modelStatus`/`dataProvenance`
 * are the item's DECLARED status on Genesis's two existing epistemic axes —
 * Construct must carry them through to `ConstructLoadedEntry` completely
 * unchanged ("no silent epistemic upgrade": loading an item never
 * strengthens what it claims about itself).
 */
export interface ConstructItem {
  readonly itemId: string;
  readonly worldType: ConstructWorldType;
  /** Becomes the registered `WorldRecord.worldId` once loaded. */
  readonly worldId: string;
  /** Declared scientific-consensus level of the model being loaded (generator/recipe.ts::EpistemicStatus). Optional: not every construct item makes a model-consensus claim. */
  readonly modelStatus?: EpistemicStatus;
  /** Declared data-origin axis (core/dataProvenance.ts::DataProvenance) — required: every loaded world's data must be honestly labeled SIMULATED/REFERENCE/REAL_EXPERIMENTAL, never left unmarked. */
  readonly dataProvenance: DataProvenance;
  /** Builder-specific options, passed through to `buildGenesisScientificCity4` verbatim (minus `worldId`/`registry`, which Construct itself supplies). */
  readonly options?: Omit<GenesisScientificCity4Options, 'worldId' | 'registry'>;
  readonly notes?: string;
}

export const CONSTRUCT_MANIFEST_SCHEMA_VERSION = '1.0.0';

/**
 * A manifest is DATA — safe to log, diff, hash, or store, exactly like a
 * `WorldSpecification` (see specification/worldSpecification.ts's own
 * doc). `items` order is the DETERMINISTIC load order: Construct never
 * reorders, sorts, or parallelizes — it loads `items[0]`, then `items[1]`,
 * etc., in the exact array order given.
 */
export interface ConstructManifest {
  readonly manifestId: string;
  readonly schemaVersion: string;
  readonly items: readonly ConstructItem[];
}

export function buildConstructManifest(manifestId: string, items: readonly ConstructItem[]): ConstructManifest {
  return { manifestId, schemaVersion: CONSTRUCT_MANIFEST_SCHEMA_VERSION, items };
}
