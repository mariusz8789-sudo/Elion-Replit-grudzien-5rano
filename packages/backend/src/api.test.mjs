import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';

/**
 * Testy routera API na żywej bazie (in-memory). Symulują pełny przepływ:
 * rejestracja → token → projekt → próby → RBAC (viewer/editor/admin) — dokładnie
 * tak, jak zadziała przez HTTP, ale bez gniazd. To dowód, że warstwa „wykonuje
 * się naprawdę", a nie jest atrapą.
 */

let db;
beforeEach(() => {
  db = openDatabase();
});

function call(method, pathname, { token, body, query } = {}) {
  return handleApi(db, { method, pathname, token, body, query });
}

function registerUser(email = 'owner@lab.org', password = 'password123') {
  const r = call('POST', '/api/auth/register', { body: { email, password } });
  assert.equal(r.status, 201, `register ${email}: ${JSON.stringify(r.body)}`);
  return r.body; // { token, user }
}

describe('auth flow', () => {
  test('register issues a token and a user', () => {
    const r = registerUser();
    assert.match(r.token, /^[0-9a-f]{64}$/);
    assert.equal(r.user.email, 'owner@lab.org');
    assert.equal(r.user.passwordHash, undefined);
  });

  test('duplicate email is rejected with 409', () => {
    registerUser();
    const r = call('POST', '/api/auth/register', { body: { email: 'owner@lab.org', password: 'password123' } });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'email_taken');
  });

  test('short password is rejected with 400', () => {
    const r = call('POST', '/api/auth/register', { body: { email: 'x@y.co', password: 'short' } });
    assert.equal(r.status, 400);
  });

  test('login succeeds with correct password, fails with wrong', () => {
    registerUser();
    const good = call('POST', '/api/auth/login', { body: { email: 'owner@lab.org', password: 'password123' } });
    assert.equal(good.status, 201);
    assert.match(good.body.token, /^[0-9a-f]{64}$/);

    const bad = call('POST', '/api/auth/login', { body: { email: 'owner@lab.org', password: 'wrong' } });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error, 'invalid_credentials');
  });

  test('login for unknown user gives the same 401 (no account enumeration)', () => {
    const r = call('POST', '/api/auth/login', { body: { email: 'ghost@lab.org', password: 'whatever12' } });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'invalid_credentials');
  });

  test('me requires a valid token; logout invalidates it', () => {
    const { token } = registerUser();
    assert.equal(call('GET', '/api/auth/me', { token }).status, 200);
    assert.equal(call('GET', '/api/auth/me').status, 401);
    call('POST', '/api/auth/logout', { token });
    assert.equal(call('GET', '/api/auth/me', { token }).status, 401);
  });
});

describe('projects require auth', () => {
  test('unauthenticated project access is 401', () => {
    assert.equal(call('GET', '/api/projects').status, 401);
    assert.equal(call('POST', '/api/projects', { body: { name: 'X' } }).status, 401);
  });

  test('owner can create and list projects', () => {
    const { token } = registerUser();
    const created = call('POST', '/api/projects', { token, body: { name: 'Reaktor termojądrowy' } });
    assert.equal(created.status, 201);
    assert.equal(created.body.project.role, 'owner');

    const list = call('GET', '/api/projects', { token });
    assert.equal(list.status, 200);
    assert.equal(list.body.projects.length, 1);
    assert.equal(list.body.projects[0].name, 'Reaktor termojądrowy');
  });

  test('project name is required', () => {
    const { token } = registerUser();
    assert.equal(call('POST', '/api/projects', { token, body: { name: '  ' } }).status, 400);
  });

  test('non-member gets 404 for someone else project (no existence leak)', () => {
    const owner = registerUser('owner@lab.org');
    const stranger = registerUser('stranger@lab.org');
    const p = call('POST', '/api/projects', { token: owner.token, body: { name: 'Prywatny' } }).body.project;
    assert.equal(call('GET', `/api/projects/${p.id}`, { token: stranger.token }).status, 404);
  });
});

describe('persistent reproducible trials + RBAC', () => {
  function setupProject() {
    const owner = registerUser('owner@lab.org');
    const p = call('POST', '/api/projects', { token: owner.token, body: { name: 'Seria prób' } }).body.project;
    return { owner, p };
  }

  test('editor+ can create a trial; it freezes provenance and auto-numbers', () => {
    const { owner, p } = setupProject();
    const r = call('POST', `/api/projects/${p.id}/trials`, {
      token: owner.token,
      body: {
        experimentId: 'nuclear-semf',
        label: 'Żelazo-56',
        params: { Z: 26, A: 56 },
        outputs: { bindingPerNucleon: 8.79 },
        status: 'baseline',
        modelVersion: 'semf-v1',
      },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.trial.index, 1);
    assert.deepEqual(r.body.trial.params, { Z: 26, A: 56 });
    assert.equal(r.body.trial.modelVersion, 'semf-v1');
    assert.equal(r.body.trial.authorId, owner.user.id);
  });

  test('trials round-trip through GET, scoped by experiment', () => {
    const { owner, p } = setupProject();
    const mk = (experimentId) =>
      call('POST', `/api/projects/${p.id}/trials`, { token: owner.token, body: { experimentId, params: { x: 1 }, outputs: { y: 2 } } });
    mk('e1');
    mk('e1');
    mk('e2');
    assert.equal(call('GET', `/api/projects/${p.id}/trials`, { token: owner.token }).body.trials.length, 3);
    assert.equal(
      call('GET', `/api/projects/${p.id}/trials`, { token: owner.token, query: { experimentId: 'e1' } }).body.trials.length,
      2,
    );
  });

  test('invalid numeric params are stripped (no NaN/nested leaks into the datastore)', () => {
    const { owner, p } = setupProject();
    const r = call('POST', `/api/projects/${p.id}/trials`, {
      token: owner.token,
      body: { experimentId: 'e', params: { good: 1, bad: NaN, str: 'x', nested: { a: 1 } }, outputs: {} },
    });
    assert.deepEqual(r.body.trial.params, { good: 1 });
  });

  test('missing experimentId is 400', () => {
    const { owner, p } = setupProject();
    assert.equal(call('POST', `/api/projects/${p.id}/trials`, { token: owner.token, body: { params: {}, outputs: {} } }).status, 400);
  });

  test('viewer can read but NOT write trials (403)', () => {
    const { owner, p } = setupProject();
    const viewer = registerUser('viewer@lab.org');
    // owner adds viewer
    const added = call('POST', `/api/projects/${p.id}/members`, {
      token: owner.token,
      body: { email: 'viewer@lab.org', role: 'viewer' },
    });
    assert.equal(added.status, 200);

    assert.equal(call('GET', `/api/projects/${p.id}/trials`, { token: viewer.token }).status, 200);
    const write = call('POST', `/api/projects/${p.id}/trials`, { token: viewer.token, body: { experimentId: 'e', params: {}, outputs: {} } });
    assert.equal(write.status, 403);
  });

  test('editor can write; update changes only descriptive fields', () => {
    const { owner, p } = setupProject();
    const editor = registerUser('editor@lab.org');
    call('POST', `/api/projects/${p.id}/members`, { token: owner.token, body: { email: 'editor@lab.org', role: 'editor' } });
    const trial = call('POST', `/api/projects/${p.id}/trials`, {
      token: editor.token,
      body: { experimentId: 'e', params: { x: 1 }, outputs: { y: 2 }, status: 'draft' },
    }).body.trial;

    const upd = call('PATCH', `/api/projects/${p.id}/trials/${trial.id}`, {
      token: editor.token,
      body: { status: 'promising', note: 'ciekawe', params: { x: 999 } /* ignored */ },
    });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.trial.status, 'promising');
    assert.equal(upd.body.trial.note, 'ciekawe');
    assert.deepEqual(upd.body.trial.params, { x: 1 }); // frozen
  });

  test('only admin+ can manage members; editor cannot', () => {
    const { owner, p } = setupProject();
    const editor = registerUser('editor@lab.org');
    call('POST', `/api/projects/${p.id}/members`, { token: owner.token, body: { email: 'editor@lab.org', role: 'editor' } });
    const third = registerUser('third@lab.org');
    const attempt = call('POST', `/api/projects/${p.id}/members`, {
      token: editor.token,
      body: { email: 'third@lab.org', role: 'viewer' },
    });
    assert.equal(attempt.status, 403);
    assert.ok(third); // used
  });

  test('only owner can grant the owner role', () => {
    const { owner, p } = setupProject();
    const admin = registerUser('admin@lab.org');
    call('POST', `/api/projects/${p.id}/members`, { token: owner.token, body: { email: 'admin@lab.org', role: 'admin' } });
    const target = registerUser('target@lab.org');
    const attempt = call('POST', `/api/projects/${p.id}/members`, {
      token: admin.token,
      body: { email: 'target@lab.org', role: 'owner' },
    });
    assert.equal(attempt.status, 403);
    assert.ok(target);
  });

  test('deleting a trial in another project is 404 (cross-project isolation)', () => {
    const { owner, p } = setupProject();
    const trial = call('POST', `/api/projects/${p.id}/trials`, {
      token: owner.token, body: { experimentId: 'e', params: {}, outputs: {} },
    }).body.trial;
    const other = registerUser('other@lab.org');
    const op = call('POST', '/api/projects', { token: other.token, body: { name: 'Inny' } }).body.project;
    assert.equal(call('DELETE', `/api/projects/${op.id}/trials/${trial.id}`, { token: other.token }).status, 404);
  });
});


describe('knowledge ingestion', () => {
  function setupKnowledgeProject() {
    const owner = registerUser('owner@knowledge.org');
    const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'Quantum sources' } }).body.project;
    return { owner, project };
  }

  function uploadBody(text, overrides = {}) {
    return {
      fileName: 'majorana-notes.md',
      mimeType: 'text/markdown',
      title: 'Majorana evidence notes',
      topics: ['quantum', 'Majorana', 'topological matter'],
      sourceUrl: 'https://example.org/source',
      contentBase64: Buffer.from(text, 'utf8').toString('base64'),
      ...overrides,
    };
  }

  function spatialRawFingerprint(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return `osm_raw_${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function spatialUploadBody(overrides = {}) {
    const original = '<?xml version="1.0"?><osm version="0.6"><node id="1" lat="35.8885" lon="-5.3240"/><node id="2" lat="35.8886" lon="-5.3238"/><way id="101"><nd ref="1"/><nd ref="2"/><tag k="highway" v="residential"/></way></osm>';
    const layers = { buildings: [], roads: [{ sourceId: 'way/101', layer: 'roads', geometry: { kind: 'line', coordinates: [[-5.3240, 35.8885], [-5.3238, 35.8886]] }, tags: { highway: 'residential' } }], rail: [], water: [], boundaries: [] };
    return {
      label: 'Ceuta source slice',
      originalBase64: Buffer.from(original, 'utf8').toString('base64'),
      dataset: {
        contractVersion: '1.0.0', datasetId: 'osm_normalized_ab12cd34', source: 'openstreetmap-api',
        bbox: [-5.3240, 35.8885, -5.3235, 35.8890], crs: 'EPSG:4326',
        sourceUrl: 'https://example.invalid/osm', sourceQuery: 'bbox=-5.324,35.8885,-5.3235,35.889',
        sourceTimestamp: '2026-08-19T00:00:00.000Z', license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors',
        provenance: { rawArtifactFingerprint: spatialRawFingerprint(original), normalizationFingerprint: 'osm_normalized_ab12cd34', featureCount: 1, sourceMetadata: { generator: 'test' } },
        layers, worldIntegration: 'NOT_WIRED', limitation: 'Test source data only.',
      },
      ...overrides,
    };
  }

  test('editor upload preserves original, hashes it, extracts text and never declares a solver', () => {
    const { owner, project } = setupKnowledgeProject();
    const response = call('POST', `/api/projects/${project.id}/knowledge-materials`, {
      token: owner.token,
      body: uploadBody('# Majorana\nTopological evidence requires careful verification.'),
    });
    assert.equal(response.status, 201);
    const material = response.body.material;
    assert.equal(material.currentVersion, 1);
    assert.equal(material.version, 1);
    assert.equal(material.extractionStatus, 'EXTRACTED');
    assert.equal(material.epistemicStatus, 'USER_PROVIDED_UNREVIEWED');
    assert.match(material.contentSha256, /^[0-9a-f]{64}$/);
    assert.equal(material.provenance.kind, 'USER_UPLOAD');
    assert.equal(material.provenance.solverEffect, 'NONE');
    assert.match(material.extractedText, /Topological evidence/);

    const original = call('GET', `/api/projects/${project.id}/knowledge-materials/${material.id}/content`, { token: owner.token });
    assert.equal(original.status, 200);
    assert.equal(Buffer.from(original.body.material.originalBase64, 'base64').toString('utf8'), '# Majorana\nTopological evidence requires careful verification.');
  });

  test('same material key creates immutable next version and lexical search returns source-bound excerpt', () => {
    const { owner, project } = setupKnowledgeProject();
    const first = call('POST', `/api/projects/${project.id}/knowledge-materials`, {
      token: owner.token, body: uploadBody('Majorana measurement one.'),
    }).body.material;
    const second = call('POST', `/api/projects/${project.id}/knowledge-materials`, {
      token: owner.token, body: uploadBody('Majorana measurement two with topological warning for łańcuch Kitaeva.'),
    }).body.material;
    assert.equal(first.id, second.id);
    assert.equal(second.currentVersion, 2);
    assert.equal(second.version, 2);
    assert.notEqual(first.contentSha256, second.contentSha256);

    const listed = call('GET', `/api/projects/${project.id}/knowledge-materials`, { token: owner.token });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.materials.length, 1);
    assert.equal(listed.body.materials[0].currentVersion, 2);

    const found = call('GET', `/api/projects/${project.id}/knowledge-materials/search`, {
      token: owner.token, query: { q: 'topological' },
    });
    assert.equal(found.status, 200);
    assert.equal(found.body.materials.length, 1);
    assert.match(found.body.materials[0].excerpt, /topological warning/);
    assert.equal(found.body.materials[0].extractedText, undefined);

    const naturalQuestion = call('GET', `/api/projects/${project.id}/knowledge-materials/search`, {
      token: owner.token, query: { q: 'Co zawiera materiał o łańcuchu Kitaeva w bibliotece projektu?' },
    });
    assert.equal(naturalQuestion.status, 200);
    assert.equal(naturalQuestion.body.materials.length, 1);
    assert.match(naturalQuestion.body.materials[0].excerpt, /Kitaeva/);
  });

  test('builds a deterministic, source-bound Project Research Packet without a solver effect', () => {
    const { owner, project } = setupKnowledgeProject();
    const viewer = registerUser('packet-viewer@knowledge.org');
    const outsider = registerUser('packet-outsider@knowledge.org');
    call('POST', `/api/projects/${project.id}/members`, {
      token: owner.token, body: { email: viewer.user.email, role: 'viewer' },
    });
    call('POST', `/api/projects/${project.id}/knowledge-materials`, {
      token: owner.token,
      body: uploadBody('Topological Kitaev-chain evidence remains USER_PROVIDED_UNREVIEWED and has no solver effect.'),
    });

    const first = call('GET', `/api/projects/${project.id}/research-packet`, {
      token: owner.token, query: { q: 'Kitaev topological evidence' },
    });
    const second = call('GET', `/api/projects/${project.id}/research-packet`, {
      token: owner.token, query: { q: 'Kitaev topological evidence' },
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.packet.status, 'RETRIEVED');
    assert.equal(first.body.packet.solverEffect, 'NONE');
    assert.equal(first.body.packet.packetFingerprint, second.body.packet.packetFingerprint);
    assert.equal(first.body.packet.sources.length, 1);
    const [source] = first.body.packet.sources;
    assert.match(source.referenceId, new RegExp(`^project:${project.id}:knowledge:`));
    assert.match(source.contentSha256, /^[0-9a-f]{64}$/);
    assert.equal(source.epistemicStatus, 'USER_PROVIDED_UNREVIEWED');
    assert.equal(source.solverEffect, 'NONE');
    assert.match(source.excerpt, /Kitaev-chain/);
    assert.equal(source.originalBase64, undefined);

    const versionTwo = call('POST', `/api/projects/${project.id}/knowledge-materials`, {
      token: owner.token,
      body: uploadBody('Topological Kitaev-chain evidence v2 remains USER_PROVIDED_UNREVIEWED and has no solver effect.'),
    });
    assert.equal(versionTwo.status, 201);
    assert.equal(versionTwo.body.material.version, 2);
    const current = call('GET', `/api/projects/${project.id}/research-packet`, {
      token: owner.token, query: { q: 'Kitaev topological evidence' },
    });
    assert.notEqual(current.body.packet.packetFingerprint, first.body.packet.packetFingerprint);
    const historicalReplay = call('POST', `/api/projects/${project.id}/research-packet`, {
      token: owner.token, body: { packet: first.body.packet },
    });
    assert.equal(historicalReplay.status, 200);
    assert.equal(historicalReplay.body.replay.status, 'MATCH');
    assert.equal(historicalReplay.body.replay.packet.packetFingerprint, first.body.packet.packetFingerprint);
    assert.equal(historicalReplay.body.replay.packet.sources[0].materialVersion, 1);
    assert.equal(historicalReplay.body.replay.packet.sources[0].contentSha256, source.contentSha256);

    assert.equal(call('GET', `/api/projects/${project.id}/research-packet`, {
      token: viewer.token, query: { q: 'Kitaev' },
    }).status, 200);
    assert.equal(call('GET', `/api/projects/${project.id}/research-packet`, {
      token: outsider.token, query: { q: 'Kitaev' },
    }).status, 404);
    const empty = call('GET', `/api/projects/${project.id}/research-packet`, {
      token: owner.token, query: { q: 'nieistniejący termin' },
    });
    assert.equal(empty.body.packet.status, 'NO_MATCH');
    assert.equal(empty.body.packet.sources.length, 0);
  });

  test('viewer can read project knowledge but cannot upload; outsider gets 404', () => {
    const { owner, project } = setupKnowledgeProject();
    const viewer = registerUser('viewer@knowledge.org');
    const outsider = registerUser('outsider@knowledge.org');
    call('POST', `/api/projects/${project.id}/members`, {
      token: owner.token, body: { email: viewer.user.email, role: 'viewer' },
    });
    const created = call('POST', `/api/projects/${project.id}/knowledge-materials`, {
      token: owner.token, body: uploadBody('Public within project.'),
    }).body.material;
    assert.equal(call('GET', `/api/projects/${project.id}/knowledge-materials`, { token: viewer.token }).status, 200);
    assert.equal(call('POST', `/api/projects/${project.id}/knowledge-materials`, { token: viewer.token, body: uploadBody('no write') }).status, 403);
    assert.equal(call('GET', `/api/projects/${project.id}/knowledge-materials/${created.id}`, { token: outsider.token }).status, 404);
  });

  test('project GIS artifact preserves original source and enforces viewer/editor RBAC without a World State', () => {
    const { owner, project } = setupKnowledgeProject();
    const viewer = registerUser('viewer@spatial.org');
    const outsider = registerUser('outsider@spatial.org');
    call('POST', `/api/projects/${project.id}/members`, { token: owner.token, body: { email: viewer.user.email, role: 'viewer' } });

    const created = call('POST', `/api/projects/${project.id}/spatial-datasets`, { token: owner.token, body: spatialUploadBody() });
    assert.equal(created.status, 201);
    assert.equal(created.body.dataset.dataset.datasetId, 'osm_normalized_ab12cd34');
    assert.match(created.body.dataset.originalSha256, /^[0-9a-f]{64}$/);
    assert.equal(created.body.dataset.dataset.worldIntegration, 'NOT_WIRED');
    assert.equal(call('GET', `/api/projects/${project.id}/spatial-datasets`, { token: viewer.token }).body.datasets.length, 1);
    assert.equal(call('POST', `/api/projects/${project.id}/spatial-datasets`, { token: viewer.token, body: spatialUploadBody() }).status, 403);
    assert.equal(call('GET', `/api/projects/${project.id}/spatial-datasets/${created.body.dataset.id}`, { token: outsider.token }).status, 404);
    const original = call('GET', `/api/projects/${project.id}/spatial-datasets/${created.body.dataset.id}/content`, { token: owner.token });
    assert.match(Buffer.from(original.body.dataset.originalBase64, 'base64').toString('utf8'), /<osm/);

    const mismatched = call('POST', `/api/projects/${project.id}/spatial-datasets`, {
      token: owner.token,
      body: spatialUploadBody({ originalBase64: Buffer.from('<osm version="0.6"><note/></osm>', 'utf8').toString('base64') }),
    });
    assert.equal(mismatched.status, 400);
    assert.equal(mismatched.body.error, 'raw_fingerprint_mismatch');
  });

  test('rejects media-type spoofing and malformed PDF before persistence', () => {
    const { owner, project } = setupKnowledgeProject();
    const wrongExtension = call('POST', `/api/projects/${project.id}/knowledge-materials`, {
      token: owner.token,
      body: uploadBody('x', { fileName: 'wrong.pdf', mimeType: 'text/markdown' }),
    });
    assert.equal(wrongExtension.status, 400);
    assert.equal(wrongExtension.body.error, 'extension_mismatch');

    const fakePdf = call('POST', `/api/projects/${project.id}/knowledge-materials`, {
      token: owner.token,
      body: uploadBody('not a PDF', { fileName: 'fake.pdf', mimeType: 'application/pdf', contentBase64: Buffer.from('not a PDF').toString('base64') }),
    });
    assert.equal(fakePdf.status, 400);
    assert.equal(fakePdf.body.error, 'invalid_pdf_signature');
  });
});
