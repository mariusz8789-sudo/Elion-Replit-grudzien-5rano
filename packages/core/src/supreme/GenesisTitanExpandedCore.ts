import { createHash } from 'node:crypto';
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export type ClaimStatus = 'VERIFIED' | 'ACTIVE_RESEARCH' | 'THEORETICAL' | 'UNSUBSTANTIATED';
export type MethodTag = 'PASTEUR_CONTROL' | 'FLEMING_INHIBITION' | 'FRANKLIN_REPLICATION' | 'CRICK_SEQUENCE_LOGIC' | 'KOCH_POSTULATES';
export interface TitanBioEntry { readonly id: string; readonly title: string; readonly claimStatus: ClaimStatus; readonly method: MethodTag; readonly evidenceNote: string; }
export const TITAN_BIO_KNOWLEDGE: readonly TitanBioEntry[] = [
  { id: 'GERM_THEORY', title: 'Teoria zarazkowa (Pasteur)', claimStatus: 'VERIFIED', method: 'PASTEUR_CONTROL', evidenceNote: 'Kontrolowane eksperymenty z kolbami łabędzimi obaliły samorództwo; podstawa sterylizacji i szczepionek.' },
  { id: 'PENICILLIN', title: 'Penicylina (Fleming)', claimStatus: 'VERIFIED', method: 'FLEMING_INHIBITION', evidenceNote: 'Obserwacja strefy hamowania wokół Penicillium; potwierdzona i rozwinięta klinicznie.' },
  { id: 'DNA_HELIX', title: 'Struktura DNA (Franklin/Watson/Crick)', claimStatus: 'VERIFIED', method: 'FRANKLIN_REPLICATION', evidenceNote: 'Dyfrakcja RTG (Photo 51) i model podwójnej helisy; replikowalna krystalografia.' },
  { id: 'CENTRAL_DOGMA', title: 'Centralny dogmat (Crick)', claimStatus: 'VERIFIED', method: 'CRICK_SEQUENCE_LOGIC', evidenceNote: 'DNA→RNA→białko; kierunek przepływu informacji potwierdzony; wyjątki (retrowirusy) udokumentowane.' },
  { id: 'KOCH_POSTULATES', title: 'Postulaty Kocha', claimStatus: 'VERIFIED', method: 'KOCH_POSTULATES', evidenceNote: 'Kryteria przyczynowości zakaźnej; współcześnie uzupełnione o molekularne wersje postulatów.' },
  { id: 'MRNA_PLATFORM', title: 'Platformy mRNA', claimStatus: 'VERIFIED', method: 'CRICK_SEQUENCE_LOGIC', evidenceNote: 'Terapeutyki i szczepionki mRNA zatwierdzone; mechanizm translacji egzogennego transkryptu.' },
  { id: 'GUT_MICROBIOME_AXIS', title: 'Oś jelito-mózg / mikrobiota', claimStatus: 'ACTIVE_RESEARCH', method: 'PASTEUR_CONTROL', evidenceNote: 'Korelacje i modele zwierzęce aktywne; przyczynowość u człowieka częściowo nieustalona.' },
  { id: 'PRION_ONLY_INHERITANCE', title: 'Dziedziczenie wyłącznie prionowe', claimStatus: 'THEORETICAL', method: 'CRICK_SEQUENCE_LOGIC', evidenceNote: 'Białkowe elementy dziedziczne istnieją (np. drożdże); zakres u ssaków badany.' },
];
export interface TitanDecision { readonly query: string; readonly usedEntries: readonly string[]; readonly methods: readonly MethodTag[]; readonly confidence: number; readonly recommendation: string; readonly dataLabel: 'BIOLOGICAL_SYNTHETIC_ESTIMATE'; readonly fingerprint: string; }
/** Expanded titan synthesis: deterministic decision heuristic grounded in labelled historical method tags. */
export class GenesisTitanExpandedCore {
  constructor(private clock: Clock, private seed: number) {}
  listKnowledge(): readonly TitanBioEntry[] { return TITAN_BIO_KNOWLEDGE; }
  decide(query: string, evidenceIds: readonly string[]): TitanDecision {
    const used = TITAN_BIO_KNOWLEDGE.filter(e => evidenceIds.includes(e.id));
    const verified = used.filter(e => e.claimStatus === 'VERIFIED').length;
    const confidence = +Math.min(0.95, 0.4 + 0.1 * verified + 0.05 * used.length).toFixed(2);
    const methods = [...new Set(used.map(e => e.method))];
    const recommendation = used.length === 0 ? 'INSUFFICIENT_EVIDENCE: brak etykietowanych wpisów; zastosuj protokół kontrolny Pasteura przed wnioskowaniem.' : `Wnioskuj metodami [${methods.join(', ')}]; priorytetyzuj wpisy VERIFIED; oznacz resztę jako ACTIVE_RESEARCH/THEORETICAL.`;
    return { query, usedEntries: used.map(e => e.id), methods, confidence, recommendation, dataLabel: 'BIOLOGICAL_SYNTHETIC_ESTIMATE', fingerprint: sha256hex(stableStringify({ seed: this.seed, query, usedEntries: used.map(e => e.id), confidence })) };
  }
}
