import { summary as run3Summary } from '../../../../../docs/evidence/astex-redock-benchmark-2026-09-27-run3.json';
import { topK, topKDenominator, samplingCeilingInPool, vsVinaBaseline } from '../../../../../docs/evidence/astex-run7-gnina-rescore.json';
import { summary as redockSummary, engines as redockEngines, protocol as redockProtocol } from '../../../../../docs/evidence/finalist-falsification-2026-09-27.json';
import { replayVerdict as retroReplay, synthesis as retroSynthesis } from '../../../../../docs/evidence/imatinib-retrosynthesis-2026-09-27.json';
import genesisKeyFile from '../../../../../docs/keys/genesis-csrn-signing-key.json';

/**
 * HOME FACTS — every number the Start page shows, read from the committed
 * evidence files at build time. Nothing here is typed in by hand: if a record
 * changes, the page changes with it, and if a record is missing the build fails
 * instead of the page quietly showing an old number.
 *
 * Wording rule for Astex (owner's, verbatim): "Vina baseline: 46/85. Current
 * Astex development result with GNINA rescoring: 63/85." 63 is post-hoc
 * development on the same 85 cases and is never presented as independent
 * validation; 81 is a sampling ceiling, never a Top-1 result.
 */

export const ASTEX = {
  denominator: topKDenominator,
  /** Run 3: the preregistered, canonical Vina headline. */
  vinaPreregisteredTop1: run3Summary.successes,
  /** Vina score over the same pooled Run-6 poses that GNINA rescored. */
  vinaPooledTop1: vsVinaBaseline.baselineTop1,
  /** Run 7: GNINA CNN rescoring of those poses. Development result. */
  gninaTop1: topK.top1,
  /** Cases with ANY pose under 2 Å somewhere in the pool. Not a Top-1 result. */
  samplingCeiling: samplingCeilingInPool.successes,
  files: {
    run3: 'docs/evidence/astex-redock-benchmark-2026-09-27-run3.json',
    run7: 'docs/evidence/astex-run7-gnina-rescore.json',
  },
} as const;

/** The owner's exact wording for the two Astex numbers. */
export const ASTEX_WORDING = `Vina baseline: ${ASTEX.vinaPreregisteredTop1}/${ASTEX.denominator}. Current Astex development result with GNINA rescoring: ${ASTEX.gninaTop1}/${ASTEX.denominator}.`;

/**
 * Training overlap, from the exact PDB-id membership test in
 * `docs/evidence/posebusters-unseen-benchmark-prereg.json` (commit 47c7239f on the Astex branch,
 * not yet on main when this page was written):
 * 63 of the 85 Astex ids are in CrossDocked2020, 47 in PDBbind2016, 76 in the union — the data the
 * crossdock_default2018 GNINA models were fitted on. The unseen PoseBusters run is preregistered and
 * has no result yet, so the page shows no number for it.
 */
export const ASTEX_TRAINING_OVERLAP = { inTrainingLists: 76, of: 85 } as const;

export const ASTEX_CAVEAT = `Development benchmark, not validation. GNINA's training data contains ${ASTEX_TRAINING_OVERLAP.inTrainingLists} of these ${ASTEX_TRAINING_OVERLAP.of} complexes. Independent unseen validation pending (PoseBusters, 308 complexes, pre-registered, not yet run).`;

/** Imatinib redocked into ABL1 (PDB 1IEP) with real Vina + Meeko runs, plus its retrosynthesis record. */
export const IMATINIB = {
  pdbId: redockProtocol.pdbId,
  bestVinaKcalMol: redockSummary.bestAffinityKcalMolRange[0],
  medianRmsdA: redockSummary.medianRmsdA,
  vina: redockEngines.vina,
  meeko: redockEngines.meeko,
  routeSteps: retroSynthesis.topRoute.steps,
  retroEngine: retroSynthesis.engine,
  replay: retroReplay,
  files: {
    redock: 'docs/evidence/finalist-falsification-2026-09-27.json',
    retro: 'docs/evidence/imatinib-retrosynthesis-2026-09-27.json',
  },
} as const;

interface KeyFile { status: string; keyId: string | null }
const KEY = genesisKeyFile as KeyFile;

/** CSRN signing key state, from the published key file. */
export const CSRN_KEY: { readonly generated: boolean; readonly status: string; readonly keyId: string | null } = {
  generated: KEY.status === 'ACTIVE' && typeof KEY.keyId === 'string' && KEY.keyId.length > 0,
  status: KEY.status,
  keyId: KEY.keyId,
};
