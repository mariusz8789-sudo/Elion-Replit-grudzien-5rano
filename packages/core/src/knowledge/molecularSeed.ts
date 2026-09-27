/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * DNA / RNA / ATP seed taxonomy and starter research questions — the delivered
 * consolidated pack's `dnaRnaAtpSeed.ts` and `researchQuestionCatalog.ts`, kept
 * as written. This is a STARTER (topic map + questions + what evidence each
 * needs), not knowledge: the knowledge itself flows through the canonical
 * ingestion and the EvidenceLedger, and every answer keeps its status.
 */

export interface ScientificTopicSeed { readonly id: string; readonly title: string; readonly subtopics: readonly string[]; readonly starterQuestions: readonly string[]; readonly evidenceRequired: readonly string[]; }

export const DNA_RNA_ATP_SEED: readonly ScientificTopicSeed[] = [
  {
    id: 'dna', title: 'DNA — struktura, replikacja i naprawa',
    subtopics: ['nukleotydy', 'podwójna helisa', 'replikacja', 'polimerazy', 'proofreading', 'mutacje', 'rekombinacja', 'naprawa DNA', 'chromatyna', 'epigenetyka'],
    starterQuestions: ['Jak działa replikacja DNA?', 'Co ogranicza dokładność kopiowania DNA?', 'Jak komórka wykrywa uszkodzenia DNA?'],
    evidenceRequired: ['podręcznik lub przegląd naukowy', 'źródło pierwotne dla twierdzeń szczegółowych'],
  },
  {
    id: 'rna', title: 'RNA — przepływ informacji i regulacja',
    subtopics: ['mRNA', 'tRNA', 'rRNA', 'miRNA', 'siRNA', 'lncRNA', 'transkrypcja', 'splicing', 'modyfikacje RNA', 'degradacja RNA'],
    starterQuestions: ['Jak transkrypcja zależy od regulacji genu?', 'Jak splicing wpływa na różnorodność białek?', 'Jak małe RNA regulują ekspresję?'],
    evidenceRequired: ['literatura przeglądowa', 'źródła pierwotne dla mechanizmów'],
  },
  {
    id: 'atp', title: 'ATP — energia komórkowa',
    subtopics: ['ATP/ADP/AMP', 'glikoliza', 'pirogronian', 'acetyl-CoA', 'cykl Krebsa', 'NADH', 'FADH2', 'łańcuch oddechowy', 'gradient protonowy', 'ATP synthase', 'fosforylacja oksydacyjna'],
    starterQuestions: ['Które etapy najbardziej ograniczają produkcję ATP?', 'Jak zmiana dostępności tlenu wpływa na ATP?', 'Jak przeciek protonowy wpływa na wydajność ATP synthase?'],
    evidenceRequired: ['źródła biologii komórkowej', 'dane eksperymentalne dla konkretnych parametrów', 'jawne założenia modelu'],
  },
];

export interface ResearchPrompt { readonly id: string; readonly domain: string; readonly question: string; readonly expectedEvidence: readonly string[]; }

export const MOLECULAR_RESEARCH_QUESTIONS: readonly ResearchPrompt[] = [
  { id: 'dna-repl-1', domain: 'DNA', question: 'Jakie mechanizmy zwiększają wierność replikacji DNA?', expectedEvidence: ['review', 'primary study'] },
  { id: 'dna-repair-1', domain: 'DNA', question: 'Jak różne szlaki naprawy DNA rozdzielają klasy uszkodzeń?', expectedEvidence: ['review', 'mechanistic study'] },
  { id: 'rna-splice-1', domain: 'RNA', question: 'Jak alternatywny splicing wpływa na repertuar białek?', expectedEvidence: ['review', 'transcriptomics/primary study'] },
  { id: 'rna-reg-1', domain: 'RNA', question: 'Jak małe RNA regulują ekspresję genów?', expectedEvidence: ['review', 'primary study'] },
  { id: 'atp-1', domain: 'ATP', question: 'Które parametry modelu najbardziej ograniczają przepływ przez łańcuch oddechowy?', expectedEvidence: ['biochemistry text', 'quantitative study'] },
  { id: 'atp-2', domain: 'ATP', question: 'Jak przeciek protonowy zmienia sprzężenie między gradientem protonowym a syntezą ATP?', expectedEvidence: ['mitochondrial physiology review', 'primary study'] },
  { id: 'mito-1', domain: 'Mitochondria', question: 'Jakie są główne punkty kontroli przepływu elektronów i protonów?', expectedEvidence: ['cell biology review'] },
  { id: 'protein-1', domain: 'Proteins', question: 'Jak sekwencja aminokwasowa wpływa na stabilność i fałdowanie białka?', expectedEvidence: ['structural biology review', 'primary data'] },
];

/** Which seed topic a free-text question touches, by subtopic/keyword overlap; null when none (no guessing). */
export function seedTopicFor(text: string): ScientificTopicSeed | null {
  const q = text.toLowerCase();
  const hit = DNA_RNA_ATP_SEED.filter((s) => q.includes(s.id) || s.subtopics.some((sub) => q.includes(sub.toLowerCase())));
  return hit.length === 1 ? hit[0] : hit.length > 1 ? hit.sort((a, b) => b.subtopics.filter((sub) => q.includes(sub.toLowerCase())).length - a.subtopics.filter((sub) => q.includes(sub.toLowerCase())).length)[0] : null;
}
