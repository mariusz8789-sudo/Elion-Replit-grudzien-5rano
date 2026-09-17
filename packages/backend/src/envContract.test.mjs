import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * P0.4 — `.env.example` jest KONTRAKTEM, nie notatką.
 *
 * Przed zmianą dokumentował 5 z 25 zmiennych, które kod naprawdę czyta, i
 * POMIJAŁ dwie zmienne kredencjałowe (`GENESIS_RESEARCH_API_KEY`,
 * `GENESIS_INSTITUTIONAL_API_KEY`). Operator wdrażający system nie mógł
 * wiedzieć, jakie sekrety on w ogóle przyjmuje — a to jest dokładnie to
 * pytanie, które zadaje audyt bezpieczeństwa przed grantem.
 *
 * Defekt polegał na DRYFIE, więc naprawa bez mechanicznej blokady dryfu
 * rozjedzie się ponownie przy pierwszej nowej zmiennej.
 */

const IGNORED = new Set([
  // Dostarczane przez platformę/narzędzia, nie przez operatora Genesis.
  'NODE_ENV', 'CI', 'GITHUB_ACTIONS', 'npm_package_version',
]);

function envVarsReadByCode() {
  const out = execFileSync('git', ['grep', '-hoE', 'process\\.env\\.[A-Z_][A-Z0-9_]*', '--', 'packages/', 'scripts/'], { cwd: REPO, encoding: 'utf8' });
  const names = new Set();
  for (const hit of out.split('\n')) {
    const name = hit.replace('process.env.', '').trim();
    if (name && !IGNORED.has(name)) names.add(name);
  }
  return [...names].sort();
}

function envVarsDocumented() {
  const raw = readFileSync(path.join(REPO, '.env.example'), 'utf8');
  return [...raw.matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)].map((m) => m[1]).sort();
}

test('P0.4 .env.example dokumentuje KAŻDĄ zmienną, którą kod czyta', () => {
  const documented = new Set(envVarsDocumented());
  const missing = envVarsReadByCode().filter((name) => !documented.has(name));
  assert.deepEqual(missing, [],
    `zmienne czytane przez kod i nieudokumentowane w .env.example: ${missing.join(', ')}`);
});

test('P0.4 żaden SEKRET nie ma w .env.example wartości', () => {
  const raw = readFileSync(path.join(REPO, '.env.example'), 'utf8');
  // Wzorzec nazwy, nie lista: nowa zmienna z KEY/TOKEN/SECRET/PASSWORD w nazwie
  // jest objęta tą regułą automatycznie, bez dopisywania jej tutaj.
  const secretish = [...raw.matchAll(/^([A-Z_][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*)=(.*)$/gm)];
  assert.ok(secretish.length >= 3, 'test musi widzieć realne zmienne sekretne, inaczej nic nie sprawdza');
  for (const [, name, value] of secretish) {
    assert.equal(value.trim(), '', `${name} ma wartość w .env.example — sekret nigdy nie trafia do repo, nawet jako przykład`);
  }
});

test('P0.4 w drzewie repo nie ma żadnego materiału wyglądającego na sekret', () => {
  // Ten sam skan, który P0_EVIDENCE udokumentował jako jednorazowy audyt —
  // tu jako stała blokada, żeby wyciek nie wszedł przyszłym commitem.
  const patterns = 'AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|glpat-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|sk-ant-[A-Za-z0-9_-]{20,}';
  let hits = '';
  try {
    hits = execFileSync('git', ['grep', '-nIE', patterns, '--', '.'], { cwd: REPO, encoding: 'utf8' });
  } catch (err) {
    // git grep kończy się kodem 1, gdy NIC nie znalazł — to sukces.
    if (err.status !== 1) throw err;
  }
  assert.equal(hits.trim(), '', `materiał wyglądający na sekret w drzewie repo:\n${hits}`);
});

test('P0.4 .env jest ignorowany przez gita', () => {
  const ignore = readFileSync(path.join(REPO, '.gitignore'), 'utf8');
  assert.match(ignore, /^\.env$/m, '.gitignore musi ignorować .env');
});
