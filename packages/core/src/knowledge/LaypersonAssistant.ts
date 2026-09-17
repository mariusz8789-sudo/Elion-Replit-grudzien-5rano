/* Proprietary / All Rights Reserved - Genesis OS */
import type { LaypersonAnswer, LaypersonSource } from './evidenceTypes.js';
import { KNOWLEDGE_DISCLAIMER } from './evidenceTypes.js';
import { statusLabelPl } from './classifyClaim.js';
import type { EvidenceLedger } from './EvidenceLedger.js';
const ROLE_PATTERN = /porad|porada|lek|diagnoz|dawk|prawn|pozew|inwest|lokata|projekt budowlany/i;
const tokensOf = (s: string): string[] => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 3);
/** Plain-language educational assistant. Can say "Nie wiem". Refuses expert roles. Never invents facts. */
export class LaypersonAssistant {
  constructor(private ledger: EvidenceLedger) {}
  answer(query: string): LaypersonAnswer {
    const roleRefusal = ROLE_PATTERN.test(query);
    const qTokens = tokensOf(query);
    const active = this.ledger.getActive();
    const matched = active.map(rec => ({ rec, score: qTokens.filter(t => rec.claim.toLowerCase().includes(t)).length })).filter(m => m.score >= 1).sort((a, b) => b.score - a.score);
    if (roleRefusal) return { answer: 'Nie udzielam porad medycznych, prawnych, finansowych ani inżynierskich. Mogę wyjaśnić, co wiemy, czego nie wiemy i jakie są źródła.', confidenceLevel: 'none', sources: [], disclaimer: KNOWLEDGE_DISCLAIMER, clarifyingQuestions: ['Czy chcesz poznać status dowodów dla tego tematu?'], saidIdontKnow: false, roleRefusal: true };
    if (matched.length === 0) return { answer: 'Nie wiem. Nie mam jeszcze wystarczających dowodów w bazie, żeby odpowiedzieć pewnie.', confidenceLevel: 'none', sources: [], disclaimer: KNOWLEDGE_DISCLAIMER, clarifyingQuestions: ['O jakie konkretnie zjawisko lub dokument chodzi?', 'Czy to ma być obserwacja, hipoteza czy model?'], saidIdontKnow: true, roleRefusal: false };
    const top = matched[0].rec;
    const sources: LaypersonSource[] = matched.slice(0, 3).map(m => ({ url: m.rec.sourceUrl, sourceKind: m.rec.provenance.sourceKind, status: m.rec.status }));
    const confidenceLevel = top.confidence >= 0.8 && top.status === 'verified' ? 'high' : top.confidence >= 0.5 ? 'medium' : 'low';
    const videoNote = top.provenance.sourceKind === 'video' ? ' Uwaga: to materiał filmowy — traktujemy go jako hipotezę do weryfikacji, nie fakt.' : '';
    return { answer: `Najprościej: ${top.claim} Status: ${statusLabelPl(top.status)}.${videoNote}`, confidenceLevel, sources, disclaimer: KNOWLEDGE_DISCLAIMER, clarifyingQuestions: ['Chcesz zobaczyć źródła i poziom pewności?'], saidIdontKnow: false, roleRefusal: false };
  }
}
