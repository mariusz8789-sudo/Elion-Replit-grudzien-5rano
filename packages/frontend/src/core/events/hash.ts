/**
 * Deterministyczny hash łańcuchów (FNV-1a 32-bit → 8-hex) i kanoniczny JSON — jedna implementacja
 * w @genesis/core/determinism (ten sam algorytm co core/scienceMemory.ts::contentHash). Nie
 * kryptograficzny; służy wyłącznie powtarzalności. Klucze sortowane po jednostkach kodu UTF-16,
 * nie `localeCompare` (którego kolejność zależy od lokalizacji środowiska) — ta sama reguła co
 * EvidenceLedger i backendowy provenance.mjs.
 */
export { fnv1a, canonicalJson } from '@genesis/core/determinism.js';
