import { describe, expect, it } from 'vitest';
import {
  WORLD_ENGINE_INTERFACE_VERSION,
  WORLD_ENGINE_FIELD_CONTRACT,
  REQUIRED_LOCATION_TYPES,
  CAPABILITY_REQUIREMENTS,
  AVAILABLE_EXPERIMENTS,
  OTHER_REFINEMENT,
  REPLAY_REQUIREMENTS,
  INTERFACE_NOT_MODELED,
  capabilityFor,
  isCapabilityUnlocked,
  validateWorldPayload,
} from '../core/world/worldEngineInterface';
import { runScenario, replayScenario } from '../core/simulation/scenarioEngine';
import { analyseTransmissionClusters } from '../core/contacts/clusterAnalysis';
import { CONTACT_TYPES } from '../core/contacts/contactNetwork';

const RUN = { days: 60, stepsPerDay: 4, baseParams: { nAgents: 260, initialInfected: 5, seed: 4242, severeRate: 0.2 } };

describe('World Engine contract — every field declares who owns it', () => {
  it('assigns a provenance to each field and explains what it means', () => {
    expect(WORLD_ENGINE_FIELD_CONTRACT.length).toBeGreaterThan(15);
    for (const f of WORLD_ENGINE_FIELD_CONTRACT) {
      expect(['MODEL_DERIVED', 'WORLD_DERIVED', 'NOT_MODELED']).toContain(f.provenance);
      expect(f.meaning.length).toBeGreaterThan(12);
      expect(f.entity).toBeTruthy();
      expect(f.field).toBeTruthy();
    }
  });

  it('covers every entity the brief asks for', () => {
    const entities = new Set(WORLD_ENGINE_FIELD_CONTRACT.map((f) => f.entity));
    for (const entity of ['AgentPosition', 'AgentMovement', 'Location', 'Route', 'ContactEvent', 'TransmissionEvent']) {
      expect(entities).toContain(entity);
    }
  });

  it('covers every minimum field named in the brief', () => {
    const fields = new Set(WORLD_ENGINE_FIELD_CONTRACT.map((f) => f.field));
    for (const field of ['agentId', 'source', 'target', 'position', 'locationId', 'locationType',
      'contactType', 'timestamp', 'duration', 'distance', 'transmissionProbability', 'transmissionOccurred']) {
      expect(fields).toContain(field);
    }
  });

  it('keeps the decision fields on the scientific side', () => {
    const modelOwned = WORLD_ENGINE_FIELD_CONTRACT.filter((f) => f.provenance === 'MODEL_DERIVED').map((f) => f.field);
    // World Engine nigdy nie rozstrzyga, czy doszło do zakażenia.
    expect(modelOwned).toContain('transmissionOccurred');
    expect(modelOwned).toContain('transmissionProbability');
    expect(modelOwned).toContain('contactType');
  });

  it('marks contact duration NOT_MODELED and says why', () => {
    const duration = WORLD_ENGINE_FIELD_CONTRACT.find((f) => f.entity === 'ContactEvent' && f.field === 'duration')!;
    expect(duration.provenance).toBe('NOT_MODELED');
    expect(duration.meaning).toContain('stepDurationDays');
  });

  it('asks the world for exactly the fields that unlock something', () => {
    for (const f of WORLD_ENGINE_FIELD_CONTRACT) {
      if (!f.unlocks) continue;
      expect(f.provenance).toBe('WORLD_DERIVED');
      for (const capability of f.unlocks) {
        expect(CAPABILITY_REQUIREMENTS.map((c) => String(c.capability))).toContain(capability);
      }
    }
  });
});

describe('World Engine contract — location and movement requirements', () => {
  it('lists every location type the brief names', () => {
    const types = REQUIRED_LOCATION_TYPES.map((r) => r.locationType);
    for (const t of ['ROAD', 'SIDEWALK', 'CROSSING', 'BUILDING', 'SCHOOL', 'WORK', 'SHOP', 'HOSPITAL', 'PARK', 'TRANSPORT']) {
      expect(types).toContain(t);
    }
  });

  it('separates what exists today from what the world still has to deliver', () => {
    const today = REQUIRED_LOCATION_TYPES.filter((r) => r.availableToday).map((r) => r.locationType);
    const pending = REQUIRED_LOCATION_TYPES.filter((r) => !r.availableToday).map((r) => r.locationType);
    expect(today).toEqual(expect.arrayContaining(['SCHOOL', 'SHOP', 'HOSPITAL', 'PARK', 'BUILDING']));
    expect(today).toEqual(expect.arrayContaining(['ROAD', 'SIDEWALK', 'CROSSING']));
    expect(pending).toEqual(expect.arrayContaining(['WORK', 'TRANSPORT']));
    for (const r of REQUIRED_LOCATION_TYPES) expect(r.requires.length).toBeGreaterThan(25);
  });

  it('maps every location type onto a contact type the core already knows', () => {
    for (const r of REQUIRED_LOCATION_TYPES) expect(CONTACT_TYPES).toContain(r.mapsToContactType);
  });

  it('warns that today place attribution is unreliable for the venues that do exist', () => {
    for (const type of ['SCHOOL', 'SHOP', 'PARK'] as const) {
      expect(REQUIRED_LOCATION_TYPES.find((r) => r.locationType === type)!.requires).toMatch(/tranzy|przechodzą/);
    }
  });
});

describe('World Engine contract — OTHER is not split without data', () => {
  it('keeps OTHER intact and names what a split would require', () => {
    expect(OTHER_REFINEMENT.currentCategory).toBe('OTHER');
    expect(OTHER_REFINEMENT.proposedCategories).toContain('UNKNOWN');
    expect(OTHER_REFINEMENT.requiredField).toBe('Route.segmentType');
    expect(OTHER_REFINEMENT.ruleWhenUnavailable).toBe('UNKNOWN_CONTACT_TYPE');
  });

  it('the split stays locked until the world supplies segment types', () => {
    expect(isCapabilityUnlocked('STREET_SIDEWALK_SPLIT', [])).toBe(false);
    expect(isCapabilityUnlocked('STREET_SIDEWALK_SPLIT', ['Route.segmentType'])).toBe(false);
    expect(isCapabilityUnlocked('STREET_SIDEWALK_SPLIT', ['Route.segmentType', 'AgentMovement.routeSegmentId'])).toBe(true);
  });

  it('OTHER still exists as a real category in real runs', () => {
    const analysis = analyseTransmissionClusters(runScenario('BASELINE', RUN).transmissionGraph);
    expect(analysis.attribution.find((a) => a.contactType === 'OTHER')!.transmissions).toBeGreaterThan(0);
  });
});

describe('World Engine contract — blocked capabilities stay blocked', () => {
  it('every capability that still lacks a complete payload is blocked with a concrete reason', () => {
    for (const c of CAPABILITY_REQUIREMENTS.filter((capability) => !capability.availableToday)) {
      expect(c.availableToday).toBe(false);
      expect(c.requiredFields.length).toBeGreaterThan(0);
      expect(c.blockedReason.length).toBeGreaterThan(40);
      expect(c.unlocksExperiment.length).toBeGreaterThan(5);
    }
  });

  it('work and transport are blocked on missing world data, not on effort', () => {
    expect(capabilityFor('WORKPLACE_CONTACTS').blockedReason).toContain('miejsc pracy');
    expect(capabilityFor('TRANSPORT_CONTACTS').blockedReason).toContain('pojazdów');
    expect(capabilityFor('ROAD_NETWORK_VS_STRAIGHT_LINE').blockedReason).toContain('odcinkach prostych');
  });

  it('the experiments that need no new world data are listed as already available', () => {
    expect(AVAILABLE_EXPERIMENTS.join(' ')).toContain('SCHOOL_CLOSURE');
    expect(AVAILABLE_EXPERIMENTS.join(' ')).toContain('HOUSEHOLD_PROTECTION');
  });

  it('nothing is unlocked by an empty payload', () => {
    expect(validateWorldPayload({ contractVersion: WORLD_ENGINE_INTERFACE_VERSION }).unlockedCapabilities).toEqual([]);
  });
});

describe('World Engine contract — the validator rejects, it never fills in', () => {
  const ok = { contractVersion: WORLD_ENGINE_INTERFACE_VERSION };

  it('accepts a minimal well-formed payload', () => {
    const result = validateWorldPayload(ok);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.severity === 'ERROR')).toEqual([]);
  });

  it('rejects a payload declaring the wrong contract version', () => {
    const result = validateWorldPayload({ contractVersion: '0.1.0' });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'contract-version')).toBe(true);
  });

  it('rejects a payload that claims to supply a NOT_MODELED field', () => {
    const result = validateWorldPayload({ ...ok, providedFields: ['ContactEvent.duration'] });
    expect(result.valid).toBe(false);
    const issue = result.issues.find((i) => i.rule === 'not-modeled-must-stay-empty')!;
    expect(issue.message).toContain('ContactEvent.duration');
  });

  it('warns, without rejecting, when the world tries to supply a model-owned field', () => {
    const result = validateWorldPayload({ ...ok, providedFields: ['TransmissionEvent.transmissionOccurred'] });
    expect(result.valid).toBe(true);
    const issue = result.issues.find((i) => i.rule === 'model-derived-not-supplied-by-world')!;
    expect(issue.severity).toBe('WARNING');
    expect(issue.message).toContain('zignorowana');
  });

  it('rejects locations without a stable id or with an unknown type', () => {
    const result = validateWorldPayload({ ...ok, locations: [{ locationType: 'SCHOOL' }, { locationId: 'x', locationType: 'CASINO' }] });
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.rule)).toEqual(expect.arrayContaining(['location-id-required', 'location-type-known']));
  });

  it('rejects route segments that are unusable', () => {
    const result = validateWorldPayload({
      ...ok,
      routeSegments: [{ segmentType: 'ROAD' }, { segmentId: 's2', segmentType: 'RIVER' }, { segmentId: 's3', segmentType: 'ROAD', length: 0 }],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.rule)).toEqual(expect.arrayContaining(['segment-id-required', 'segment-type-known', 'segment-length-positive']));
  });

  it('unlocks a capability only from fields the payload really declares', () => {
    const partial = validateWorldPayload({ ...ok, providedFields: ['Route.segments'] });
    expect(partial.unlockedCapabilities).not.toContain('ROAD_NETWORK_VS_STRAIGHT_LINE');
    const complete = validateWorldPayload({ ...ok, providedFields: ['Route.segments', 'AgentMovement.route'] });
    expect(complete.unlockedCapabilities).toContain('ROAD_NETWORK_VS_STRAIGHT_LINE');
  });
});

describe('World Engine contract — replay requirements are stated and already hold', () => {
  it('states what replay must preserve when the world changes', () => {
    expect(REPLAY_REQUIREMENTS.length).toBeGreaterThan(4);
    expect(REPLAY_REQUIREMENTS.join(' ')).toContain('DRIFT');
    expect(REPLAY_REQUIREMENTS.join(' ')).toContain('nie może mutować');
  });

  it('today the model already replays movement, location, contact type and transmission', () => {
    const run = runScenario('BASELINE', RUN);
    expect(replayScenario(run).status).toBe('MATCH');
    const again = runScenario('BASELINE', RUN);
    // Trasa, miejsce, typ kontaktu i transmisja odtwarzają się w całości.
    expect(again.transmissionGraph).toEqual(run.transmissionGraph);
    expect(again.households).toEqual(run.households);
  });

  it('declares the interface gaps rather than hiding them', () => {
    for (const gap of ['contact-duration', 'agent-route-assignment', 'workplace-assignment', 'vehicle-occupancy']) {
      expect(INTERFACE_NOT_MODELED).toContain(gap);
    }
  });
});

describe('World Engine contract — the measured reason this contract exists', () => {
  const analysis = analyseTransmissionClusters(runScenario('BASELINE', RUN).transmissionGraph);

  it('reports how much of the run happened while agents were in transit', () => {
    const quality = analysis.locationAttribution;
    expect(quality.transitShare).toBeGreaterThan(0.5);
    expect(quality.confidence).toBe('LOW');
    expect(quality.caveat).toContain('liniach prostych');
  });

  it('every OTHER transmission happens in transit — it is a movement artefact', () => {
    const other = analysis.attribution.find((a) => a.contactType === 'OTHER')!;
    expect(other.transmissions).toBeGreaterThan(0);
    expect(other.dwellTransmissions).toBe(0);
    expect(other.transitTransmissions).toBe(other.transmissions);
  });

  it('even in-building attribution is mostly transit, so venue claims are not safe', () => {
    const quality = analysis.locationAttribution;
    expect(quality.transitInsideBuildings).toBeGreaterThan(quality.dwellInsideBuildings);
  });

  it('the dwell and transit split accounts for every transmission of every type', () => {
    for (const a of analysis.attribution) {
      expect(a.dwellTransmissions + a.transitTransmissions).toBe(a.transmissions);
    }
  });
});
