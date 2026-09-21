import { bridgeDiscoveryRecordToPromotionInput } from '../orchestrator/discoveryRecordBridge';
import { canPromoteToWinnerRecord } from '../orchestrator/winnerGate';
import type { PromotionInput, PromotionResult, EvidenceInventoryItem } from '../orchestrator/winnerGate';
import type { Verdict } from '../orchestrator/contracts';
import type { DiscoveryRecord } from '../agent/discoveryContracts';

/**
 * MIND PROMOTION CALLER — the one real caller of `discoveryRecordBridge.ts`
 * this session's GAP audit found missing ("TABELA-G / PATCH-E" review,
 * docs/DECISIONS.md). This module composes two already-real, already-tested
 * decisions and NOTHING ELSE: `bridgeDiscoveryRecordToPromotionInput`
 * (vocabulary translation, `DiscoveryStatus` -> `Verdict`) and
 * `canPromoteToWinnerRecord` (D-057's evidence-sufficiency gate). It
 * recomputes neither.
 *
 * WHY `promotion` IS NULLABLE, NOT A FABRICATED PromotionResult. An earlier
 * draft of this file called `canPromoteToWinnerRecord({adjudicationVerdict:
 * 'NO_WINNER', inventory: []})` whenever the bridge returned
 * `NOT_APPLICABLE` — substituting a verdict no adjudicator ever computed,
 * exactly the fabrication `discoveryRecordBridge.ts` itself exists to
 * refuse. Rejected at audit, not landed. `NOT_APPLICABLE` means the bridge
 * refused to ask a promotion question at all (REPRODUCTION/KNOWN_RESULT/
 * NO_ACCESS/EXTENSION/NOVEL_HYPOTHESIS) — this caller mirrors that refusal
 * by returning `promotion: null`, never a computed answer to a question
 * nobody asked.
 */

export interface MindPromotionDecision {
  readonly promotion: PromotionResult | null;
  readonly sourceStatus: string;
  readonly reasons: readonly string[];
  readonly taxonomyVerdict: Verdict | null;
}

/** `DiscoveryRecord` path — via the bridge. `promotion` is `null` exactly when the bridge itself refused (`kind: 'NOT_APPLICABLE'`). */
export function decideFromDiscoveryRecord(record: DiscoveryRecord): MindPromotionDecision {
  const bridged = bridgeDiscoveryRecordToPromotionInput(record);
  if (bridged.kind === 'NOT_APPLICABLE' || bridged.promotionInput === null) {
    return { promotion: null, sourceStatus: bridged.sourceStatus, reasons: bridged.reasons, taxonomyVerdict: null };
  }
  return {
    promotion: canPromoteToWinnerRecord(bridged.promotionInput),
    sourceStatus: bridged.sourceStatus,
    reasons: bridged.reasons,
    taxonomyVerdict: bridged.promotionInput.adjudicationVerdict,
  };
}

/** Direct D-047 adjudication path — no `DiscoveryRecord`/bridge involved, for a caller that already has a real `Verdict` and evidence inventory. */
export function decideFromAdjudication(verdict: Verdict, inventory: readonly EvidenceInventoryItem[]): MindPromotionDecision {
  const input: PromotionInput = { adjudicationVerdict: verdict, inventory };
  return { promotion: canPromoteToWinnerRecord(input), sourceStatus: 'ADJUDICATED', reasons: [], taxonomyVerdict: verdict };
}

export type { PromotionInput, PromotionResult, EvidenceInventoryItem };
