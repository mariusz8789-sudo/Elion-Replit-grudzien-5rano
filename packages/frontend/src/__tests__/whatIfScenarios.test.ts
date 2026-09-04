import { describe, expect, it } from 'vitest';
import '../labs/index';
import { getLab } from '../core/registry';
import { WHAT_IF_SCENARIOS } from '../data/whatIfScenarios';
import type { ParamDef } from '../core/types';

/**
 * Każdy scenariusz "Co by było, gdyby?" musi celować w prawdziwe,
 * zarejestrowane laboratorium (i, jeśli podane, prawdziwy eksperyment w tym
 * laboratorium — patrz `experimentId`/core/scenarioBridge.ts) i wyłącznie w
 * klucze parametrów, które ten eksperyment faktycznie definiuje — inaczej
 * WhatIfScreen cicho nadpisałby nieistniejący parametr i użytkownik dostałby
 * domyślne (nie obiecane) ustawienie.
 */
function targetParams(s: (typeof WHAT_IF_SCENARIOS)[number]): ParamDef[] {
  const lab = getLab(s.labId)!;
  if (!s.experimentId) return lab.params;
  const exp = lab.experiments?.find((e) => e.id === s.experimentId);
  expect(exp, `scenariusz "${s.id}": eksperyment "${s.experimentId}" nie istnieje w lab "${s.labId}"`).toBeDefined();
  return exp!.params;
}

describe('WHAT_IF_SCENARIOS — spójność z rejestrem laboratoriów', () => {
  it('ma unikalne id', () => {
    const ids = WHAT_IF_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('każdy scenariusz wskazuje istniejące, zarejestrowane laboratorium', () => {
    for (const s of WHAT_IF_SCENARIOS) {
      expect(getLab(s.labId), `scenariusz "${s.id}" wskazuje nieistniejące lab "${s.labId}"`).toBeDefined();
    }
  });

  it('każdy nadpisany klucz parametru istnieje w params docelowego eksperymentu (bazowego lub wskazanego)', () => {
    for (const s of WHAT_IF_SCENARIOS) {
      const validKeys = new Set(targetParams(s).map((p) => p.key));
      for (const key of Object.keys(s.params)) {
        expect(validKeys.has(key), `scenariusz "${s.id}": klucz "${key}" nie istnieje w params["${s.labId}"${s.experimentId ? `/${s.experimentId}` : ''}]`).toBe(true);
      }
    }
  });

  it('wartości typu select/toggle w scenariuszu są zgodne z ParamDef (opcje / typ)', () => {
    for (const s of WHAT_IF_SCENARIOS) {
      const params = targetParams(s);
      for (const [key, value] of Object.entries(s.params)) {
        const def = params.find((p) => p.key === key)!;
        if (def.type === 'select') {
          const allowed = def.options!.map((o) => o.value);
          expect(allowed, `scenariusz "${s.id}": "${value}" nie jest dozwoloną opcją dla "${key}"`).toContain(value);
        }
        if (def.type === 'toggle') {
          expect(typeof value, `scenariusz "${s.id}": "${key}" powinien być boolean`).toBe('boolean');
        }
        if (def.type === 'slider') {
          expect(typeof value, `scenariusz "${s.id}": "${key}" powinien być liczbą`).toBe('number');
          if (def.min !== undefined) expect(Number(value)).toBeGreaterThanOrEqual(def.min);
          if (def.max !== undefined) expect(Number(value)).toBeLessThanOrEqual(def.max);
        }
      }
    }
  });
});
