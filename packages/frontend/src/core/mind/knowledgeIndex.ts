import { InMemoryRecordStore, type KeyedRecordStore } from '../provenance/recordStore';
import { canonicalJson, fnv1a } from '../events/hash';
import type { MindKnowledgeItem, MindKnowledgeStatus } from './contracts';

/**
 * MIND KNOWLEDGE INDEX (docs/DECISIONS.md D-060) — the fact/claim level the
 * existing knowledge layer does not have.
 *
 * WHAT ALREADY EXISTED, AND IS REUSED, NOT REPLACED:
 *  - the epistemic-status axis itself — `MindKnowledgeStatus` extends
 *    `knowledge/supplementalRegistry.ts::KnowledgeEpistemicStatus`;
 *  - persistence — `provenance/recordStore.ts::KeyedRecordStore`, the same
 *    primitive `EvidenceConnectorStore` (D-057) is built on;
 *  - the hash provider — `events/hash.ts`.
 * `knowledge/registry.ts` routes a problem to a DOMAIN; it stores no claims.
 * That gap, and only that gap, is what this fills.
 *
 * WEAKEST-LINK RULE. `weakestLinkRank` is the minimum of the supplied
 * `engineeringGraph/provenance.ts::provenanceRank` values — order-isomorphic
 * to folding that module's own `weakerProvenance` over the same inputs
 * (verified: its RANK is ascending in confidence, `measured`=6 strongest, and
 * `weakerProvenance` returns the lower-ranked of two). A claim is never
 * recorded as better supported than its weakest input.
 *
 * AN LLM STATEMENT IS NEVER A FACT. Enforced structurally below, not by
 * convention: `llmAssisted` content offered as `FACT` is downgraded to
 * `HYPOTHESIS` on the way in, and the downgrade is part of the fingerprint.
 */
export class MindKnowledgeIndex {
  constructor(private readonly store: KeyedRecordStore<MindKnowledgeItem> = new InMemoryRecordStore<MindKnowledgeItem>()) {}

  async add(input: {
    readonly itemId: string;
    readonly status: MindKnowledgeStatus;
    readonly claim: string;
    readonly provenanceRefs: readonly string[];
    readonly provenanceRanks: readonly number[];
    readonly evidenceClass?: string;
    readonly llmAssisted: boolean;
  }): Promise<MindKnowledgeItem> {
    const status: MindKnowledgeStatus = input.llmAssisted && input.status === 'FACT' ? 'HYPOTHESIS' : input.status;
    const weakestLinkRank = input.provenanceRanks.length > 0 ? Math.min(...input.provenanceRanks) : Number.NaN;
    const base = { ...input, status, weakestLinkRank };
    const record: MindKnowledgeItem = Object.freeze({ ...base, fingerprint: fnv1a(canonicalJson(base)) });
    await this.store.put(record.itemId, record);
    return record;
  }

  async all(): Promise<readonly MindKnowledgeItem[]> {
    const keys = await this.store.list();
    const items = await Promise.all(keys.map((key) => this.store.get(key)));
    return items.filter((item): item is MindKnowledgeItem => item !== null);
  }

  /** Order-independent snapshot identity — two indices holding the same claims fingerprint identically. */
  async snapshotFingerprint(): Promise<string> {
    const items = await this.all();
    return fnv1a(canonicalJson([...items.map((item) => item.fingerprint)].sort()));
  }
}
