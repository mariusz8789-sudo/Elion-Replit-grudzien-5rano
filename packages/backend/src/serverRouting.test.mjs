/**
 * Spójność routingu HTTP ↔ router API.
 *
 * server.mjs przepuszcza do `handleApi` tylko ścieżki pasujące do białej listy
 * PERSIST_API_PREFIXES; wszystko inne pod /api/ dostaje 404 JESZCZE PRZED routerem.
 * Dodanie nowej trasy `seg[0] === 'x'` w api.mjs bez dopisania prefiksu daje więc
 * trasę, która przechodzi wszystkie testy jednostkowe (bo te wołają handleApi
 * bezpośrednio) i mimo to nie działa przez HTTP. Dokładnie tak przepadła trasa
 * `/api/invites`.
 *
 * Test czyta ŹRÓDŁA obu plików, bo server.mjs startuje nasłuch przy imporcie i nie
 * da się z niego bezpiecznie zaimportować samej stałej.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const serverSrc = readFileSync(join(HERE, 'server.mjs'), 'utf8');
const apiSrc = readFileSync(join(HERE, 'api.mjs'), 'utf8');

/** Trasy najwyższego poziomu obsługiwane przez router (`seg[0] === '…'`). */
function apiTopLevelRoutes() {
  return [...new Set([...apiSrc.matchAll(/seg\[0\] === '([a-z0-9-]+)'/g)].map((m) => m[1]))];
}

/** Biała lista prefiksów, po której server.mjs decyduje o wejściu do handleApi. */
function persistPrefixes() {
  const m = serverSrc.match(/const PERSIST_API_PREFIXES = \[([^\]]+)\]/);
  assert.ok(m, 'PERSIST_API_PREFIXES musi istnieć w server.mjs');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('routing serwera pokrywa router API', () => {
  test('każda trasa seg[0] z api.mjs jest przepuszczana przez server.mjs', () => {
    const prefixes = persistPrefixes();
    const routes = apiTopLevelRoutes();
    assert.ok(routes.length >= 8, `spodziewano się kilku tras, znaleziono ${routes.length}`);

    const uncovered = routes.filter((r) => {
      if (r === 'v1') return false; // publiczne API v1 ma własną gałąź (`/api/v1/`)
      const url = `/api/${r}/`;
      return !prefixes.some((p) => url.startsWith(p));
    });
    assert.deepEqual(uncovered, [], `trasy bez prefiksu w server.mjs (404 przez HTTP): ${uncovered.join(', ')}`);
  });

  test('trasa zaproszeń jest publiczna i obecna na liście', () => {
    // Regresja: bez tego prefiksu link zapraszający zwracał 404, choć router działał.
    assert.ok(persistPrefixes().includes('/api/invites'));
    assert.ok(apiTopLevelRoutes().includes('invites'));
  });

  test('żaden prefiks nie jest martwy — każdy odpowiada realnej trasie', () => {
    const routes = apiTopLevelRoutes();
    const dead = persistPrefixes().filter((p) => {
      const name = p.replace(/^\/api\//, '').replace(/\/$/, '');
      return !routes.includes(name);
    });
    assert.deepEqual(dead, [], `prefiksy bez odpowiadającej trasy: ${dead.join(', ')}`);
  });
});
