import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// server.mjs starts listening on import, so both files are read as text: every top-level API family
// handleApi routes must be admitted by the HTTP layer, or it 404s in production while its unit tests
// (which call handleApi directly) stay green — the /api/physics/cms-z bug.
const api = readFileSync(new URL('./api.mjs', import.meta.url), 'utf8');
const server = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');

test('every API family routed by api.mjs is admitted by server.mjs', () => {
  const routed = [...new Set([...api.matchAll(/seg\[0\] === '([a-z-]+)'/g)].map((m) => m[1]))].sort();
  const listed = server.match(/PERSIST_API_SEGMENTS = Object\.freeze\(\[([^\]]*)\]\)/);
  assert.ok(listed, 'PERSIST_API_SEGMENTS not found in server.mjs');
  const admitted = [...listed[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(admitted, routed);
  assert.ok(admitted.includes('physics'));
});
