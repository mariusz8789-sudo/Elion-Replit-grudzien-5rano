/**
 * Deterministyczny hash łańcuchów (FNV-1a 32-bit → 8-hex). ŚWIADOMIE ten sam
 * algorytm co core/scienceMemory.ts::contentHash — nie tworzymy „drugiego
 * systemu", tylko udostępniamy ogólną, bezstanową funkcję do stabilnych ID
 * zdarzeń i skrótów parametrów. Nie kryptograficzny; służy wyłącznie
 * powtarzalności (ten sam wejściowy string → ten sam skrót).
 */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Kanoniczny JSON: klucze posortowane rekurencyjnie → stabilny skrót niezależny od kolejności pól. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => [k, sortKeys(val)]),
    );
  }
  return v;
}
