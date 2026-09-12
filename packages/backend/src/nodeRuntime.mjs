/**
 * Genesis OS — bramka runtime'u Node (P0.1).
 *
 * DLACZEGO TO ISTNIEJE. `store.mjs`, `agentRun.mjs` i cała trwałość backendu
 * importują `node:sqlite`, którego PRZED Node 22.5.0 po prostu nie ma.
 * Tymczasem repo deklarowało `>=18` w manifeście głównym, NIC w trzech
 * workspace'ach, a `.replit` uruchamiał `nodejs-20`. Na tej konfiguracji
 * `import { DatabaseSync } from 'node:sqlite'` wybucha na etapie
 * ROZWIĄZYWANIA MODUŁU (`ERR_UNKNOWN_BUILTIN_MODULE`) — zanim wykona się
 * jakakolwiek nasza linia, więc nie da się tego złapać `try/catch` w
 * `server.mjs` i nie da się tego opisać ludzkim komunikatem z wnętrza grafu
 * modułów. Dlatego bramka jest osobnym, bezzależnościowym modułem, który
 * `start.mjs` uruchamia PRZED dynamicznym importem serwera.
 *
 * SKĄD DOKŁADNIE 22.5.0 — nie z pamięci. Z własnego API Node:
 *   curl -sS https://nodejs.org/api/sqlite.json  →  sqlite: added v22.5.0,
 *                                                   DatabaseSync: added v22.5.0
 *
 * DWIE NIEZALEŻNE OSIE, CELOWO. Numer wersji jest deklaratywny (manifesty,
 * CI, obrazy) i może się rozjechać z rzeczywistością — np. custom build z
 * wyciętym `node:sqlite`, albo przyszły runtime, który go usunie. Dlatego
 * bramka sprawdza OBIE rzeczy: wersję ORAZ realną dostępność modułu. Sonda
 * zdolności jest empiryczna i nie może się pomylić co do tego, co naprawdę
 * jest w tym interpreterze.
 *
 * Zero zależności i zero importów spoza `node:module` — ten plik musi dać się
 * wykonać na KAŻDYM Node, także na tym, który właśnie odrzuca.
 */

import { isBuiltin } from 'node:module';

/** Najniższy Node, na którym `node:sqlite`/`DatabaseSync` istnieje. */
export const MINIMUM_NODE = '22.5.0';

/**
 * Rozbija napis wersji na liczby. `null` gdy to nie jest wersja — bo
 * „nieparsowalne" NIGDY nie może zostać po cichu potraktowane jako „dobre".
 */
export function parseNodeVersion(raw) {
  if (typeof raw !== 'string') return null;
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(raw.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** Czy `raw` jest >= `minimum`. Nieparsowalne wejście = false (fail closed). */
export function meetsMinimumNode(raw, minimum = MINIMUM_NODE) {
  const found = parseNodeVersion(raw);
  const floor = parseNodeVersion(minimum);
  if (!found || !floor) return false;
  if (found.major !== floor.major) return found.major > floor.major;
  if (found.minor !== floor.minor) return found.minor > floor.minor;
  return found.patch >= floor.patch;
}

/**
 * Czy ten interpreter NAPRAWDĘ ma `node:sqlite`.
 *
 * `module.isBuiltin()`, NIE `module.builtinModules`. Pierwsza wersja tej
 * funkcji używała listy `builtinModules` i test P0.1 („sonda musi zwrócić true
 * na tym interpreterze") wywalił się na zielonym Node 22.22.2 — bo
 * `builtinModules` CELOWO pomija moduły eksperymentalne, a `node:sqlite` nim
 * wciąż jest. Zmierzone:
 *   builtinModules.includes('sqlite') → false
 *   module.isBuiltin('node:sqlite')   → true
 *   process.getBuiltinModule('node:sqlite').DatabaseSync → function
 * Czyli lista dałaby FAŁSZYWĄ BLOKADĘ na runtimie, który działa — bramka
 * odmawiałaby startu poprawnej produkcji. Dokładnie ten błąd miał złapać test
 * napisany przed implementacją.
 *
 * `isBuiltin` zamiast `getBuiltinModule`, bo nie ma efektów ubocznych (to
 * drugie odpala ExperimentalWarning tylko za samo zapytanie) i istnieje od
 * Node 18.6 — a ten plik musi wykonać się także na runtimie, który odrzuca.
 */
export function hasNodeSqlite() {
  return typeof isBuiltin === 'function' ? isBuiltin('node:sqlite') : false;
}

/**
 * Werdykt o runtimie. Domyślnie o TYM procesie; parametry są po to, żeby
 * test mógł sprawdzić oba tryby porażki bez drugiego interpretera.
 */
export function checkNodeRuntime({ version = process.version, sqliteAvailable = hasNodeSqlite() } = {}) {
  if (!meetsMinimumNode(version)) return { ok: false, version, reason: 'VERSION_TOO_OLD' };
  if (!sqliteAvailable) return { ok: false, version, reason: 'SQLITE_UNAVAILABLE' };
  return { ok: true, version, reason: 'OK' };
}

/**
 * Komunikat dla operatora: co jest nie tak, czego potrzeba, i co zrobić.
 * Celowo mówi o KONSEKWENCJI („konta, projekty i Serie Prób"), bo operator
 * czytający log w środku wdrożenia potrzebuje wiedzieć, co się zepsuje, a nie
 * tylko którego modułu brakuje.
 */
export function nodeRuntimeMessage(result) {
  if (result.ok) return `Node ${result.version} — runtime OK (node:sqlite dostępny).`;
  const common = [
    `Wymagany Node >= ${MINIMUM_NODE}; znaleziono ${result.version}.`,
    'Powód: trwały magazyn Genesis (konta, projekty, Serie Prób) stoi na wbudowanym module node:sqlite,',
    `który pojawił się dopiero w Node ${MINIMUM_NODE}. Na starszym runtimie import node:sqlite zawodzi`,
    'przy rozwiązywaniu modułu, więc backend nie wystartuje w ogóle.',
    'Co zrobić: podnieś runtime (obraz node:22-slim, actions/setup-node node-version: 22, .replit modules = ["nodejs-22"]).',
  ];
  if (result.reason === 'SQLITE_UNAVAILABLE') {
    return [
      `Node ${result.version} jest dostatecznie nowy, ale ten interpreter NIE ma wbudowanego node:sqlite.`,
      'To zwykle okrojony/custom build. Trwały magazyn Genesis bez niego nie wystartuje.',
      'Co zrobić: użyj oficjalnej dystrybucji Node >= ' + MINIMUM_NODE + '.',
    ].join('\n');
  }
  return common.join('\n');
}

/**
 * Fail-fast. Zwraca werdykt gdy OK; gdy nie — wypisuje komunikat i kończy
 * proces kodem 1. `exit`/`write` wstrzykiwalne, żeby test nie musiał zabijać
 * własnego procesu, by sprawdzić zachowanie.
 */
export function assertSupportedNodeRuntime({
  version = process.version,
  sqliteAvailable = hasNodeSqlite(),
  write = (line) => process.stderr.write(line),
  exit = (code) => process.exit(code),
} = {}) {
  const result = checkNodeRuntime({ version, sqliteAvailable });
  if (!result.ok) {
    write(`GENESIS RUNTIME BLOCKED\n${nodeRuntimeMessage(result)}\n`);
    exit(1);
  }
  return result;
}
