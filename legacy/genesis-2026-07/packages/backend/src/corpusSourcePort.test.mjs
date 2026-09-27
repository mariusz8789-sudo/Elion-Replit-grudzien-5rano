/**
 * Scientific Corpus Factory — canonical source PORT + taxonomy (Corpus Mandate Phases 3, 6, 7).
 * The ingestion router must route by mode to the correct adapter, FAIL CLOSED (CAPABILITY_BLOCKED)
 * when no adapter serves a mode, and never silently collapse the orthogonal provenance dimensions
 * (ingestion mode vs evidence origin vs rights). These are the invariants the domain relies on.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCE_SERVICE,
  ENTITY_TYPE,
  INGESTION_MODE,
  EVIDENCE_ORIGIN,
  RIGHTS,
  HASH_ALGO,
  PORT_STATUS,
  defaultOrigin,
  createIngestionRouter,
} from './corpus/sourcePort.mjs';

/** A spy adapter that records every call and returns a tagged OK result. */
function spyAdapter(tag) {
  const calls = [];
  return {
    calls,
    getById(sourceService, sourceId) {
      calls.push({ fn: 'getById', sourceService, sourceId });
      return { status: PORT_STATUS.OK, entity: { tag, sourceService, sourceId } };
    },
    query(sourceService, plan) {
      calls.push({ fn: 'query', sourceService, plan });
      return { status: PORT_STATUS.OK, entities: [{ tag, sourceService }] };
    },
  };
}

describe('corpus source port — taxonomy invariants', () => {
  test('the four provenance enums are frozen (cannot be mutated at runtime)', () => {
    for (const e of [SOURCE_SERVICE, ENTITY_TYPE, INGESTION_MODE, EVIDENCE_ORIGIN, RIGHTS, PORT_STATUS]) {
      assert.equal(Object.isFrozen(e), true);
    }
  });

  test('ingestion mode and evidence origin are ORTHOGONAL — neither is a subset of the other', () => {
    // HOW-it-arrived must never collapse into WHAT-kind-of-thing. VERIFIED_BUNDLE (a mode) must not
    // be an evidence origin, and PUBLISHER_REPORTED (an origin) must not be an ingestion mode.
    assert.equal(Object.values(EVIDENCE_ORIGIN).includes(INGESTION_MODE.VERIFIED_BUNDLE), false);
    assert.equal(Object.values(EVIDENCE_ORIGIN).includes(INGESTION_MODE.LIVE_API), false);
    assert.equal(Object.values(INGESTION_MODE).includes(EVIDENCE_ORIGIN.PUBLISHER_REPORTED), false);
    assert.equal(Object.values(INGESTION_MODE).includes(EVIDENCE_ORIGIN.DATABASE_REPORTED), false);
  });

  test('rights/license values are legal-reuse labels, distinct from any evidence-origin value', () => {
    for (const r of Object.values(RIGHTS)) {
      assert.equal(Object.values(EVIDENCE_ORIGIN).includes(r), false, `${r} must not double as an evidence origin`);
    }
  });

  test('hash algorithm is sha256 (bundle integrity contract)', () => {
    assert.equal(HASH_ALGO, 'sha256');
  });
});

describe('corpus source port — defaultOrigin', () => {
  test('Europe PMC records default to PUBLISHER_REPORTED (a publisher stated them)', () => {
    assert.equal(defaultOrigin(SOURCE_SERVICE.EUROPE_PMC), EVIDENCE_ORIGIN.PUBLISHER_REPORTED);
  });

  test('database services (ChEMBL/PubChem/UniProt/RCSB) default to DATABASE_REPORTED', () => {
    for (const svc of [SOURCE_SERVICE.CHEMBL, SOURCE_SERVICE.PUBCHEM, SOURCE_SERVICE.UNIPROT, SOURCE_SERVICE.RCSB_PDB]) {
      assert.equal(defaultOrigin(svc), EVIDENCE_ORIGIN.DATABASE_REPORTED);
    }
  });

  test('an unknown service still yields DATABASE_REPORTED (never PUBLISHER_REPORTED by accident)', () => {
    assert.equal(defaultOrigin('SOMETHING_ELSE'), EVIDENCE_ORIGIN.DATABASE_REPORTED);
  });
});

describe('corpus ingestion router — routing by mode', () => {
  test('VERIFIED_BUNDLE and TEST_FIXTURE both route to the SAME bundle adapter', () => {
    const bundle = spyAdapter('bundle');
    const router = createIngestionRouter({ bundleAdapter: bundle });

    const a = router.getById({ mode: INGESTION_MODE.VERIFIED_BUNDLE, sourceService: SOURCE_SERVICE.CHEMBL, sourceId: 'X1' });
    const b = router.getById({ mode: INGESTION_MODE.TEST_FIXTURE, sourceService: SOURCE_SERVICE.CHEMBL, sourceId: 'X2' });

    assert.equal(a.status, PORT_STATUS.OK);
    assert.equal(b.status, PORT_STATUS.OK);
    assert.equal(bundle.calls.length, 2);
    assert.deepEqual(bundle.calls.map((c) => c.sourceId), ['X1', 'X2']);
  });

  test('LIVE_API routes to the live adapter and forwards the query plan verbatim', () => {
    const live = spyAdapter('live');
    const router = createIngestionRouter({ liveAdapter: live });
    const plan = { terms: ['BRAF'], limit: 5 };

    const r = router.query({ mode: INGESTION_MODE.LIVE_API, sourceService: SOURCE_SERVICE.EUROPE_PMC, plan });

    assert.equal(r.status, PORT_STATUS.OK);
    assert.equal(live.calls.length, 1);
    assert.equal(live.calls[0].fn, 'query');
    assert.deepEqual(live.calls[0].plan, plan);
  });

  test('USER_SUPPLIED routes to the user adapter, not the bundle adapter', () => {
    const bundle = spyAdapter('bundle');
    const user = spyAdapter('user');
    const router = createIngestionRouter({ bundleAdapter: bundle, userAdapter: user });

    const r = router.getById({ mode: INGESTION_MODE.USER_SUPPLIED, sourceService: SOURCE_SERVICE.PUBCHEM, sourceId: 'U1' });

    assert.equal(r.entity.tag, 'user');
    assert.equal(bundle.calls.length, 0);
    assert.equal(user.calls.length, 1);
  });
});

describe('corpus ingestion router — fail closed', () => {
  test('a mode with no adapter yields CAPABILITY_BLOCKED (never a fabricated OK) for getById', () => {
    const router = createIngestionRouter({ bundleAdapter: spyAdapter('bundle') });
    const r = router.getById({ mode: INGESTION_MODE.LIVE_API, sourceService: SOURCE_SERVICE.CHEMBL, sourceId: 'Z' });
    assert.equal(r.status, PORT_STATUS.CAPABILITY_BLOCKED);
    assert.match(r.reason, /no adapter/i);
    assert.equal(r.entity, undefined);
  });

  test('a mode with no adapter yields CAPABILITY_BLOCKED for query too', () => {
    const router = createIngestionRouter({});
    const r = router.query({ mode: INGESTION_MODE.LIVE_API, sourceService: SOURCE_SERVICE.CHEMBL, plan: {} });
    assert.equal(r.status, PORT_STATUS.CAPABILITY_BLOCKED);
    assert.equal(r.entities, undefined);
  });

  test('an unknown ingestion mode is CAPABILITY_BLOCKED, not routed anywhere', () => {
    const bundle = spyAdapter('bundle');
    const router = createIngestionRouter({ bundleAdapter: bundle });
    const r = router.getById({ mode: 'TELEPORT', sourceService: SOURCE_SERVICE.CHEMBL, sourceId: 'Z' });
    assert.equal(r.status, PORT_STATUS.CAPABILITY_BLOCKED);
    assert.equal(bundle.calls.length, 0);
  });
});

describe('corpus ingestion router — capabilities', () => {
  test('capabilities() reports only modes that actually have an adapter', () => {
    const router = createIngestionRouter({ bundleAdapter: spyAdapter('bundle') });
    const caps = router.capabilities();
    // bundle adapter serves both VERIFIED_BUNDLE and TEST_FIXTURE; live/user absent.
    assert.deepEqual([...caps.modes].sort(), [INGESTION_MODE.TEST_FIXTURE, INGESTION_MODE.VERIFIED_BUNDLE].sort());
    assert.equal(caps.modes.includes(INGESTION_MODE.LIVE_API), false);
    assert.equal(caps.modes.includes(INGESTION_MODE.USER_SUPPLIED), false);
  });

  test('capabilities() advertises every known source service regardless of adapters', () => {
    const router = createIngestionRouter({ liveAdapter: spyAdapter('live') });
    const caps = router.capabilities();
    assert.deepEqual([...caps.services].sort(), Object.values(SOURCE_SERVICE).sort());
  });

  test('an empty router advertises no modes (honest zero-capability), still lists services', () => {
    const caps = createIngestionRouter().capabilities();
    assert.deepEqual(caps.modes, []);
    assert.equal(caps.services.length, Object.values(SOURCE_SERVICE).length);
  });
});
