# GENESIS KNOWLEDGE VERTICAL SLICE — RAPORT DLA MANUSA (QWEN, BEZ DOSTĘPU DO REPO)
## Zmienione / proponowane pliki
- packages/core/src/knowledge/evidenceTypes.ts (PROPOSED FILE)
- packages/core/src/knowledge/classifyClaim.ts (PROPOSED FILE)
- packages/core/src/knowledge/EvidenceLedger.ts (PROPOSED FILE)
- packages/core/src/knowledge/LaypersonAssistant.ts (PROPOSED FILE)
- packages/core/src/knowledge/index.ts (barrel, PROPOSED FILE)
- packages/core/src/knowledge/knowledge.test.ts (PROPOSED TESTS)
## Zaimplementowany vertical slice
EvidenceRecord (id, sourceUrl, sourceTimestamp, claim, claimType, confidence, status, retrievedAt, contentHash, provenance, disclaimer) z dozwolonymi claimType/status; classifyClaim nigdy nie awansuje materiału filmowego do `verified` bez niezależnego źródła; EvidenceLedger: append-only łańcuch SHA-256, deduplikacja po contentHash, wersjonowanie, tryb propose-only z jawnym publish(approver); LaypersonAssistant: prosty język, źródła, poziom pewności, „Nie wiem", pytania doprecyzowujące, odmowa ról eksperta.
## Wyniki testów / lint / build
NOT EXECUTED BY QWEN (brak dostępu do repo). Testy napisane; uruchomienie po stronie Claude/Manus: `npx vitest run packages/core/src/knowledge`.
## Determinizm
Zero Math.random()/Date.now() w silnikach; retrievedAt i `at` z wstrzykniętego Clock; contentHash i hash łańcucha = SHA-256(stableStringify(...)) — powtarzalne dla tych samych wejść.
## Model bezpieczeństwa i prywatności
Brak scraperów YouTube; brak sekretów/kluczy; wideo traktowane jako hipotezy; publikacja do aktywnej bazy wyłącznie po jawnym zatwierdzeniu (propose-only); asystent nie udziela porad medycznych/prawnych/finansowych; ledger audytowalny (verifyLedger).
## NOT_IMPLEMENTED
- Harmonogram „samouczenia co 24h": NIE wdrożony (wymaga źródeł, ingestii, scoringu, wersjonowania, rollbacku, ochrony prompt-injection, approval gate, monitoringu).
- Integracja z istniejącymi modułami ledger/knowledge repo: NIE wykonana (Claude musi znaleźć istniejące API, aby nie dublować).
- OCR/GIS/thermal/CV workbenches: poza zakresem tego slice.
## Rekomendacja następnego kroku
Najpierw źródła + schema + approval workflow; dopiero potem automatyzacja. Claude: sprawdź branch/status, znajdź istniejące ledger/hash/knowledge moduły, podłącz barrel minimalnie, uruchom testy/lint/build, pokaż diff.
