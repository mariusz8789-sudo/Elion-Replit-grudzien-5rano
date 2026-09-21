import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  classifyDbPath,
  backupFileName,
  selectBackupsToPrune,
  snapshotDatabase,
  restoreDatabase,
} from './dbDurability.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');
const APP_DIR = path.resolve(__dirname, '..');

/**
 * P0.2 — TRWAŁOŚĆ DANYCH.
 *
 * Znaleziony defekt (nie kosmetyka): domyślna ścieżka bazy to
 * `packages/backend/data/genesis.db` — WEWNĄTRZ drzewa aplikacji — a
 * `Dockerfile` nie deklarował ani `VOLUME`, ani `GENESIS_DB_PATH`. Na
 * wdrożeniu kontenerowym warstwa zapisywalna jest wymieniana przy KAŻDYM
 * redeployu, więc wszystkie konta, projekty i Serie Prób ginęły — cicho, bez
 * błędu, przy poprawnie działającej aplikacji.
 *
 * Te testy sprawdzają: klasyfikację ścieżki, backup ZGODNY z WAL, retencję,
 * realny restore drill na plikach i realny cykl „redeploy" (nowy proces z
 * INNEGO katalogu, ta sama ścieżka danych).
 */

test('P0.2 classifyDbPath wykrywa ścieżkę efemeryczną wewnątrz drzewa aplikacji', () => {
  const inTree = classifyDbPath({ dbPath: path.join(APP_DIR, 'data/genesis.db'), appDir: APP_DIR });
  assert.equal(inTree.durability, 'EPHEMERAL_IN_APP_TREE');
  assert.equal(inTree.persistent, false);
  assert.match(inTree.why, /redeploy/i, 'musi nazwać KONSEKWENCJĘ, nie tylko fakt');

  const onVolume = classifyDbPath({ dbPath: '/data/genesis.db', appDir: APP_DIR });
  assert.equal(onVolume.durability, 'PERSISTENT');
  assert.equal(onVolume.persistent, true);

  const memory = classifyDbPath({ dbPath: ':memory:', appDir: APP_DIR });
  assert.equal(memory.durability, 'IN_MEMORY');
  assert.equal(memory.persistent, false);
});

test('P0.2 klasyfikacja działa na ścieżkach relatywnych i nie daje się oszukać prefiksem nazwy', () => {
  // `/app/packages/backend-data` NIE jest wewnątrz `/app/packages/backend`,
  // choć zaczyna się tym samym napisem. Porównanie po segmentach, nie po stringu.
  const sibling = classifyDbPath({ dbPath: '/app/packages/backend-data/genesis.db', appDir: '/app/packages/backend' });
  assert.equal(sibling.durability, 'PERSISTENT');
  // Relatywna ścieżka rozwiązana względem appDir i wciąż wykryta jako w drzewie.
  const relative = classifyDbPath({ dbPath: 'data/genesis.db', appDir: APP_DIR, cwd: APP_DIR });
  assert.equal(relative.durability, 'EPHEMERAL_IN_APP_TREE');
});

test('P0.2 nazwa pliku backupu jest sortowalna leksykograficznie i rozpoznawalna', () => {
  const name = backupFileName('genesis.db', new Date('2026-09-12T14:33:23.000Z'));
  assert.equal(name, 'genesis.db.20260912T143323Z.bak');
  // Sortowanie napisów = sortowanie chronologiczne (warunek działania retencji).
  const a = backupFileName('genesis.db', new Date('2026-09-12T09:00:00Z'));
  const b = backupFileName('genesis.db', new Date('2026-09-12T10:00:00Z'));
  assert.ok(a < b);
});

test('P0.2 retencja zostawia N najnowszych i NIGDY nie tyka plików obcych', () => {
  const files = [
    'genesis.db.20260910T010000Z.bak',
    'genesis.db.20260911T010000Z.bak',
    'genesis.db.20260912T010000Z.bak',
    'genesis.db.20260913T010000Z.bak',
    'README.md',
    'genesis.db',
  ];
  const prune = selectBackupsToPrune(files, { base: 'genesis.db', keep: 2 });
  assert.deepEqual(prune, ['genesis.db.20260910T010000Z.bak', 'genesis.db.20260911T010000Z.bak']);

  // keep >= liczba backupów → nic nie usuwamy.
  assert.deepEqual(selectBackupsToPrune(files, { base: 'genesis.db', keep: 10 }), []);
  // keep = 0 jest ODRZUCONE, nie interpretowane jako „usuń wszystko".
  assert.throws(() => selectBackupsToPrune(files, { base: 'genesis.db', keep: 0 }), /keep/);
});

test('P0.2 RESTORE DRILL — backup jest spójny przy WAL, a odtworzenie zwraca dane', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-drill-'));
  try {
    const live = path.join(dir, 'genesis.db');
    const db = new DatabaseSync(live);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('CREATE TABLE grant_proof (id TEXT PRIMARY KEY, payload TEXT NOT NULL);');
    db.prepare('INSERT INTO grant_proof VALUES (?, ?)').run('anchor-1', 'przed backupem');
    // Celowo NIE zamykamy bazy: przy WAL świeży zapis siedzi w -wal, więc goły
    // `cp genesis.db` dałby backup BEZ tego wiersza. To jest właśnie ten tryb
    // porażki, który ten test ma wykluczyć.
    assert.ok(existsSync(`${live}-wal`), 'WAL musi istnieć, inaczej test nie sprawdza tego, co twierdzi');

    const snapshot = snapshotDatabase({ dbPath: live, dir, now: new Date('2026-09-12T15:00:00Z') });
    assert.ok(existsSync(snapshot.file));
    assert.ok(statSync(snapshot.file).size > 0);

    // Dane zmienione PO backupie — restore musi je cofnąć do stanu snapshotu.
    db.prepare('INSERT INTO grant_proof VALUES (?, ?)').run('anchor-2', 'po backupie');
    db.close();

    const restored = path.join(dir, 'restored.db');
    restoreDatabase({ backupFile: snapshot.file, dbPath: restored });
    const check = new DatabaseSync(restored);
    // `node:sqlite` zwraca obiekty BEZ prototypu, więc porównujemy po spłaszczeniu.
    const rows = check.prepare('SELECT id, payload FROM grant_proof ORDER BY id').all().map((r) => ({ id: r.id, payload: r.payload }));
    check.close();
    assert.deepEqual(rows, [{ id: 'anchor-1', payload: 'przed backupem' }],
      'backup musi zawierać wiersz zapisany do WAL i NIE zawierać wiersza dopisanego po nim');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('P0.2 restore ODMAWIA nadpisania istniejącej bazy bez jawnej zgody', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-drill-'));
  try {
    const live = path.join(dir, 'genesis.db');
    const db = new DatabaseSync(live);
    db.exec('CREATE TABLE t(x);');
    db.close();
    const snapshot = snapshotDatabase({ dbPath: live, dir, now: new Date('2026-09-12T16:00:00Z') });
    assert.throws(() => restoreDatabase({ backupFile: snapshot.file, dbPath: live }), /istnieje|overwrite/i);
    // Z jawną zgodą — wolno.
    restoreDatabase({ backupFile: snapshot.file, dbPath: live, overwrite: true });
    assert.ok(existsSync(live));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('P0.2 Dockerfile kieruje bazę na wolumen POZA drzewem aplikacji', () => {
  const dockerfile = readFileSync(path.join(REPO, 'Dockerfile'), 'utf8');
  const envPath = /ENV GENESIS_DB_PATH=(\S+)/.exec(dockerfile);
  assert.ok(envPath, 'Dockerfile nie ustawia GENESIS_DB_PATH — baza trafi w warstwę zapisywalną kontenera');
  const verdict = classifyDbPath({ dbPath: envPath[1], appDir: '/app/packages/backend' });
  assert.equal(verdict.durability, 'PERSISTENT', `Dockerfile kieruje bazę w ${envPath[1]}, co nie przetrwa redeployu`);
  assert.match(dockerfile, /VOLUME \[/, 'Dockerfile musi deklarować wolumen dla tej ścieżki');
});

/**
 * REALNY CYKL REDEPLOYU. Proces zostaje zabity, a NOWY proces startuje z
 * INNEGO katalogu (kopia źródeł = „nowy obraz"), wskazując tę samą ścieżkę
 * danych. To wyklucza dokładnie ten tryb porażki, który znaleziono: bazę
 * przywiązaną do katalogu wdrożenia.
 */
test('P0.2 REDEPLOY — rekord utworzony przez HTTP przeżywa wymianę procesu i katalogu', async () => {
  // Kopie wdrożeniowe muszą leżeć tam, gdzie rozwiązuje się `@anthropic-ai/sdk`,
  // więc powstają POD `node_modules` repo (rozwiązywanie idzie w górę drzewa).
  // Katalog jest i tak ignorowany przez git, a `finally` go usuwa.
  const root = mkdtempSync(path.join(REPO, 'node_modules', '.genesis-redeploy-'));
  const dataDir = path.join(root, 'volume');
  const dbPath = path.join(dataDir, 'genesis.db');
  const deployA = path.join(root, 'deploy-a');
  const deployB = path.join(root, 'deploy-b');
  cpSync(path.join(REPO, 'packages/backend/src'), path.join(deployA, 'src'), { recursive: true });
  cpSync(path.join(REPO, 'packages/backend/src'), path.join(deployB, 'src'), { recursive: true });
  const procs = [];

  const boot = async (deployDir) => {
    const proc = spawn(process.execPath, [path.join(deployDir, 'src/start.mjs')], {
      env: { ...process.env, PORT: '0', GENESIS_DB_PATH: dbPath, ANTHROPIC_API_KEY: '', GENESIS_STATIC_DIR: path.join(deployDir, 'none') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    procs.push(proc);
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start in time')), 15000);
      let buf = '';
      proc.stdout.on('data', (d) => {
        buf += d.toString();
        for (const line of buf.split('\n')) {
          if (!line.trim()) continue;
          try { const j = JSON.parse(line); if (j.msg === 'started' && j.port) { clearTimeout(timer); resolve(j.port); } } catch { /* partial */ }
        }
      });
      proc.on('exit', (code) => reject(new Error(`server exited early: ${code}`)));
    });
    return `http://127.0.0.1:${port}`;
  };

  try {
    // --- wdrożenie A: utwórz realny rekord przez HTTP
    const baseA = await boot(deployA);
    const reg = await fetch(`${baseA}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'grant@komisja.eu', password: 'password123' }),
    });
    assert.equal(reg.status, 201);
    const token = (await reg.json()).token;
    const proj = await fetch(`${baseA}/api/projects`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Kotwica grantowa' }),
    });
    assert.equal(proj.status, 201);
    const projectId = (await proj.json()).project.id;

    // --- redeploy: proces zabity, katalog wdrożenia WYMIENIONY
    procs[0].kill('SIGTERM');
    await new Promise((r) => procs[0].once('exit', r));
    rmSync(deployA, { recursive: true, force: true });

    // --- wdrożenie B: inny katalog, ta sama ścieżka danych
    const baseB = await boot(deployB);
    const login = await fetch(`${baseB}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'grant@komisja.eu', password: 'password123' }),
    });
    // 201, nie 200: `api.mjs::issueSession` TWORZY sesję, więc login i register
    // dzielą ten sam kod stanu. Pierwsza wersja tej asercji oczekiwała 200 —
    // to był błąd testu, nie produktu, i tak został poprawiony.
    assert.equal(login.status, 201, 'konto utworzone przed redeployem musi istnieć po nim');
    const loginBody = await login.json();
    assert.equal(loginBody.user.email, 'grant@komisja.eu', 'to musi być TO konto, nie świeżo utworzone');
    const tokenB = loginBody.token;
    const list = await fetch(`${baseB}/api/projects`, { headers: { authorization: `Bearer ${tokenB}` } });
    assert.equal(list.status, 200);
    const projects = (await list.json()).projects;
    assert.ok(projects.some((p) => p.id === projectId && p.name === 'Kotwica grantowa'),
      'projekt utworzony przed redeployem musi być czytelny po redeployu');

    // --- i backup zrobiony z żywej bazy po redeployu też się odtwarza
    const snapshot = snapshotDatabase({ dbPath, dir: dataDir });
    const restored = path.join(root, 'restored.db');
    restoreDatabase({ backupFile: snapshot.file, dbPath: restored });
    const check = new DatabaseSync(restored);
    const row = check.prepare('SELECT email FROM users WHERE email = ?').get('grant@komisja.eu');
    check.close();
    assert.equal(row?.email, 'grant@komisja.eu', 'restore z backupu żywej bazy musi zwrócić konto');
  } finally {
    for (const p of procs) p.kill('SIGKILL');
    rmSync(root, { recursive: true, force: true });
  }
});
