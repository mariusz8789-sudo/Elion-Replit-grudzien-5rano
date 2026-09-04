import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prawdziwy test HTTP end-to-end: podnosi server.mjs jako osobny proces na
 * porcie efemerycznym (PORT=0) z bazą :memory:, po czym wykonuje pełen obieg po
 * SIECI (parsowanie ciała, nagłówek Authorization, routing, kody stanu). To
 * dowód, że warstwa trwałości działa realnie przez HTTP, a nie tylko w routerze.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(__dirname, 'server.mjs');

let proc;
let base;

before(async () => {
  proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: '0', GENESIS_DB_PATH: ':memory:', ANTHROPIC_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start in time')), 8000);
    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += d.toString();
      for (const line of buf.split('\n')) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line);
          if (j.msg === 'started' && j.port) {
            clearTimeout(timer);
            resolve(j.port);
          }
        } catch { /* not a full JSON line yet */ }
      }
    });
    proc.stderr.on('data', () => { /* swallow experimental sqlite warning */ });
    proc.on('exit', (code) => reject(new Error(`server exited early: ${code}`)));
  });
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  proc?.kill('SIGTERM');
});

async function api(method, pathname, { token, body } = {}) {
  const res = await fetch(base + pathname, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function requestWithDeclaredLength(pathname, declaredLength) {
  const target = new URL(base + pathname);
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method: 'POST',
      agent: false,
      headers: {
        connection: 'close',
        'content-type': 'application/json',
        'content-length': String(declaredLength),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(raw) }));
    });
    request.on('error', reject);
    request.end();
  });
}

describe('server HTTP persistence', () => {
  test('health reports persistence ready', async () => {
    const res = await fetch(base + '/api/health');
    const j = await res.json();
    assert.equal(j.ok, true);
    assert.equal(j.persistence, 'ready');
  });

  test('full round-trip: register → project → trial → list, over HTTP', async () => {
    const reg = await api('POST', '/api/auth/register', { body: { email: 'esa@lab.org', password: 'password123' } });
    assert.equal(reg.status, 201);
    const token = reg.json.token;

    const me = await api('GET', '/api/auth/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.json.user.email, 'esa@lab.org');

    const proj = await api('POST', '/api/projects', { token, body: { name: 'Misja orbitalna' } });
    assert.equal(proj.status, 201);
    const projectId = proj.json.project.id;

    const trial = await api('POST', `/api/projects/${projectId}/trials`, {
      token,
      body: { experimentId: 'universe-orbital', params: { a: 1.0 }, outputs: { period: 1.0 }, status: 'baseline', modelVersion: 'kepler-v1' },
    });
    assert.equal(trial.status, 201);
    assert.equal(trial.json.trial.index, 1);

    const list = await api('GET', `/api/projects/${projectId}/trials`, { token });
    assert.equal(list.status, 200);
    assert.equal(list.json.trials.length, 1);
    assert.equal(list.json.trials[0].modelVersion, 'kepler-v1');
  });

  test('unauthenticated write is rejected over HTTP', async () => {
    const r = await api('POST', '/api/projects', { body: { name: 'X' } });
    assert.equal(r.status, 401);
  });

  test('malformed JSON body is a clean 400', async () => {
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.equal(res.status, 400);
  });

  test('spatial upload rejects an oversized declared payload before parsing', async () => {
    const r = await requestWithDeclaredLength('/api/projects/project-1/spatial-datasets', 7 * 1024 * 1024 + 1);
    assert.equal(r.status, 413);
    assert.equal(r.json.error, 'payload_too_large');
  });
});
