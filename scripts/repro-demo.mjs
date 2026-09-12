/**
 * Genesis OS — PAKIET ODTWARZALNOŚCI (P3.2). Jedno polecenie, zero kluczy,
 * zero sieci, zero stanu z poprzednich uruchomień.
 *
 *   node scripts/repro-demo.mjs
 *
 * DLACZEGO TO NIE JEST „DEMO". Demo pokazuje, że coś się uruchomiło. Ten skrypt
 * porównuje każdy wynik z WARTOŚCIĄ OCZEKIWANĄ zapisaną w repo
 * (`docs/REPRODUCIBILITY_PACK.md` cytuje dokładnie te same liczby) i kończy się
 * kodem 1, gdy cokolwiek się rozjechało. Recenzent nie musi wierzyć w wynik —
 * uruchamia i patrzy na kod wyjścia.
 *
 * Co jest sprawdzane, i dlaczego akurat to:
 *   1. Bramka runtime (P0.1) — bez niej nic innego nie ma prawa wystartować.
 *   2. Trwałość danych + realny drill backup→restore (P0.2) na tymczasowej bazie.
 *   3. Tożsamość wydania (P0.3) — który kod to właściwie jest.
 *   4. Kontrakt zmiennych środowiskowych (P0.4) — czy deklaracja pokrywa kod.
 *   5. Kotwica zewnętrzna (P2.3) — obserwacja, której Genesis NIE wyprodukował.
 *   6. Autonomiczne dochodzenie QE3 — falsyfikacja odrzucająca 3 z 4 hipotez.
 *
 * Punkty 5 i 6 dotyczą kodu w TypeScripcie, więc skrypt bunduje wąską fasadę
 * (`core/repro/reproEntry.node.ts`) esbuildem do katalogu tymczasowego. Nic nie
 * jest instalowane ani zapisywane w repo.
 *
 * Flagi:  --json   wypisz maszynowo czytelny raport zamiast tabeli
 *         --update wypisz blok oczekiwanych wartości do wklejenia w dokumentację
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_MODE = process.argv.includes('--json');
const UPDATE_MODE = process.argv.includes('--update');

/**
 * WARTOŚCI OCZEKIWANE — deterministyczne i policzone, nie wpisane z pamięci.
 * Każda z nich jest sprawdzalna niezależnie: masa molowa z tablicy IUPAC 2021
 * w repo, wartość PubChem z przypiętego payloadu, odciski z jednej prymitywy
 * `fnv1a(canonicalJson(...))`.
 */
const EXPECTED = {
  anchorAssessment: 'SUPPORTED_WITHIN_PROTOCOL',
  anchorObserved: 194.19,
  anchorPredicted: 194.194,
  anchorOrigin: 'REFERENCE',
  anchorReplay: 'MATCH',
  anchorFingerprint: 'prediction-verification_c5c0af94',
  qe3Rounds: 2,
  qe3Probes: [1, 0],
  qe3Surviving: ['h:a-0.4'],
  qe3Falsified: ['h:a-0.2', 'h:a-0.6', 'h:a-0.8'],
  qe3StopReason: 'NO_CONTENDERS_LEFT',
  qe3Provenance: 'SIMULATED',
};

const checks = [];
const record = (name, ok, detail) => { checks.push({ name, ok, detail }); return ok; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- 1. Bramka runtime -------------------------------------------------------
const { checkNodeRuntime, MINIMUM_NODE } = await import(path.join(REPO, 'packages/backend/src/nodeRuntime.mjs'));
const runtime = checkNodeRuntime();
record('P0.1 runtime', runtime.ok, `${runtime.version} (wymagane >= ${MINIMUM_NODE}), node:sqlite dostępny`);

// --- 2. Trwałość + drill backup→restore --------------------------------------
const { classifyDbPath, snapshotDatabase, restoreDatabase } = await import(path.join(REPO, 'packages/backend/src/dbDurability.mjs'));
const dbDir = mkdtempSync(path.join(tmpdir(), 'genesis-repro-db-'));
let durabilityDetail;
let drillOk;
try {
  const live = path.join(dbDir, 'genesis.db');
  const db = new DatabaseSync(live);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('CREATE TABLE repro (id TEXT PRIMARY KEY, payload TEXT NOT NULL);');
  db.prepare('INSERT INTO repro VALUES (?, ?)').run('anchor-1', 'przed backupem');
  // Baza CELOWO otwarta: przy WAL świeży zapis siedzi w -wal, więc `cp` dałby
  // backup bez tego wiersza. To jest ten tryb porażki, który drill wyklucza.
  const snapshot = snapshotDatabase({ dbPath: live, dir: dbDir });
  db.prepare('INSERT INTO repro VALUES (?, ?)').run('anchor-2', 'po backupie');
  db.close();
  const restored = path.join(dbDir, 'restored.db');
  restoreDatabase({ backupFile: snapshot.file, dbPath: restored });
  const check = new DatabaseSync(restored);
  const rows = check.prepare('SELECT id FROM repro ORDER BY id').all().map((r) => r.id);
  check.close();
  drillOk = eq(rows, ['anchor-1']);
  durabilityDetail = `snapshot ${snapshot.bytes} B; po restore wiersze=[${rows.join(', ')}] (oczekiwane [anchor-1] — wiersz z WAL jest, wiersz po backupie nie)`;
  const verdict = classifyDbPath({ dbPath: '/data/genesis.db', appDir: path.join(REPO, 'packages/backend') });
  record('P0.2 trwałość', verdict.durability === 'PERSISTENT', `ścieżka /data/genesis.db → ${verdict.durability}`);
} finally {
  rmSync(dbDir, { recursive: true, force: true });
}
record('P0.2 drill backup→restore', drillOk, durabilityDetail);

// --- 3. Tożsamość wydania ----------------------------------------------------
const { resolveBuildInfo } = await import(path.join(REPO, 'packages/backend/src/buildInfo.mjs'));
const build = resolveBuildInfo({ env: process.env, repoDir: REPO });
record('P0.3 tożsamość wydania', build.commitSource !== 'unavailable', `commit ${build.commitShort} (źródło: ${build.commitSource})`);

// --- 4. Kontrakt zmiennych środowiskowych ------------------------------------
const envUsed = new Set(
  execFileSync('git', ['grep', '-hoE', 'process\\.env\\.[A-Z_][A-Z0-9_]*', '--', 'packages/', 'scripts/'], { cwd: REPO, encoding: 'utf8' })
    .split('\n').map((l) => l.replace('process.env.', '').trim())
    .filter((n) => n && !['NODE_ENV', 'CI', 'GITHUB_ACTIONS', 'npm_package_version'].includes(n)),
);
const envDocumented = new Set(
  [...execFileSync('cat', ['.env.example'], { cwd: REPO, encoding: 'utf8' }).matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)].map((m) => m[1]),
);
const envMissing = [...envUsed].filter((n) => !envDocumented.has(n));
record('P0.4 kontrakt .env', envMissing.length === 0, `${envUsed.size} zmiennych w kodzie, ${envDocumented.size} udokumentowanych, brakuje ${envMissing.length}`);

// --- 5 i 6. Warstwa naukowa (TypeScript, bundlowana na czas uruchomienia) ----
const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-repro-bundle-'));
let anchor;
let qe3;
try {
  const out = path.join(bundleDir, 'repro.mjs');
  execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
    path.join(REPO, 'packages/frontend/src/core/repro/reproEntry.node.ts'),
    '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error',
    // externalAnchor.ts pulls in the Kepler anchor's pinned HTML fixture via
    // Vite's `?raw` import convention; esbuild (used standalone here, not
    // through Vite) needs its own loader told to treat `.html` as raw text
    // to match that semantic, or bundling fails outright.
    '--loader:.html=text',
    `--outfile=${out}`,
  ], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
  const science = await import(out);
  anchor = science.reproExternalAnchor();
  qe3 = science.reproQe3Inquiry();
} finally {
  rmSync(bundleDir, { recursive: true, force: true });
}

record('P2.3 kotwica: werdykt', anchor.assessment === EXPECTED.anchorAssessment, `${anchor.assessment} (oczekiwane ${EXPECTED.anchorAssessment})`);
record('P2.3 kotwica: obserwacja zewnętrzna', anchor.observedValue === EXPECTED.anchorObserved && anchor.observationOrigin === EXPECTED.anchorOrigin,
  `${anchor.observedValue} g/mol, pochodzenie ${anchor.observationOrigin} (oczekiwane ${EXPECTED.anchorObserved} / ${EXPECTED.anchorOrigin})`);
record('P2.3 kotwica: predykcja Genesis', Math.abs(anchor.predictedValue - EXPECTED.anchorPredicted) < 1e-9,
  `${anchor.predictedValue} g/mol (oczekiwane ${EXPECTED.anchorPredicted})`);
record('P2.3 kotwica: odcisk i replay', anchor.verificationFingerprint === EXPECTED.anchorFingerprint && anchor.replay === EXPECTED.anchorReplay,
  `${anchor.verificationFingerprint} / ${anchor.replay} (oczekiwane ${EXPECTED.anchorFingerprint} / ${EXPECTED.anchorReplay})`);

record('QE3 dochodzenie: przebieg', qe3.rounds === EXPECTED.qe3Rounds && eq(qe3.probes, EXPECTED.qe3Probes),
  `${qe3.rounds} rundy, sondy whiteNoise=[${qe3.probes.join(', ')}] (oczekiwane ${EXPECTED.qe3Rounds} / [${EXPECTED.qe3Probes.join(', ')}])`);
record('QE3 dochodzenie: falsyfikacja', eq([...qe3.surviving], EXPECTED.qe3Surviving) && eq([...qe3.falsified].sort(), [...EXPECTED.qe3Falsified].sort()),
  `ocalała [${qe3.surviving.join(', ')}], sfalsyfikowane [${qe3.falsified.join(', ')}], stop ${qe3.stopReason}`);
record('QE3 dochodzenie: prowieniencja', qe3.dataProvenance === EXPECTED.qe3Provenance,
  `${qe3.dataProvenance} — dokładna algebra na zadeklarowanym stanie JEST symulacją i tak jest oznaczona`);

// --- Raport ------------------------------------------------------------------
const failed = checks.filter((c) => !c.ok);

if (UPDATE_MODE) {
  console.log(JSON.stringify({ anchor, qe3 }, null, 2));
} else if (JSON_MODE) {
  console.log(JSON.stringify({ commit: build.commit, node: runtime.version, checks, anchor, qe3, ok: failed.length === 0 }, null, 2));
} else {
  console.log(`\nGENESIS OS — PAKIET ODTWARZALNOŚCI`);
  console.log(`commit ${build.commit} (${build.commitSource}) · node ${runtime.version}\n`);
  for (const c of checks) console.log(`  ${c.ok ? 'OK  ' : 'FAIL'}  ${c.name.padEnd(34)} ${c.detail}`);
  console.log(`\n  Kotwica zewnętrzna — czego NIE dowodzi:\n  ${anchor.whatRemainsUntested}`);
  console.log(`\n  ${failed.length === 0 ? `WYNIK: ${checks.length}/${checks.length} zgodne z wartościami oczekiwanymi w repo.` : `WYNIK: ${failed.length} rozbieżności — ${failed.map((f) => f.name).join('; ')}`}\n`);
}

process.exit(failed.length === 0 ? 0 : 1);
