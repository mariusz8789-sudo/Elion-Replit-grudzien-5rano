import { describe, expect, it } from 'vitest';
import { getKnowledgeDomain, validateKnowledgeRegistry } from '../core/knowledge/registry';
import {
  parseScienceChatMessage,
  runExperiment,
  validateStructuredExperimentRequest,
  listExternalEngineAdapters,
  listSpatialImportAdapters,
  analyseExperimentSeries,
  createScientificEvidencePack,
  designScientificExperiment,
  executeScientificExperiment,
  serializeScientificEvidencePack,
  exportEvidencePackRoCrate,
  serializeEvidencePackRoCrate,
  RO_CRATE_EVIDENCE_PACK_VERSION,
  compareCounterfactual,
  serializeCounterfactualComparison,
  planEvidenceGuidedExperiment,
  confirmEvidenceGuidedExperiment,
  createMajorana1QuantumEvidenceCard,
  createScenarioCapsule,
  replayScenarioCapsule,
  serializeScenarioCapsule,
  normalizeOsmMapXml,
  OSM_ATTRIBUTION,
  OSM_LICENSE,
  planCrossDomainOrchestration,
  planAtmosphericTemperatureToArrhenius,
} from '../core/experimentFabric';
import {
  clearExperimentWorldHandoffs,
  consumePendingExperimentWorld,
  setPendingExperimentWorld,
} from '../core/experimentFabric/worldHandoff';

describe('Genesis Experiment Fabric', () => {
  it('indexes each of the 20 authoritative knowledge files exactly once', () => {
    expect(validateKnowledgeRegistry()).toEqual({ ok: true, missing: [], duplicateFiles: [] });
  });

  it('registers the bounded Kitaev bulk model without upgrading absent quantum hardware', () => {
    const quantum = getKnowledgeDomain('quantum');
    expect(quantum?.capability).toBe('CAPABILITY_SEAM');
    expect(quantum?.realModels).toContain('quantum-kitaev-bulk');
    expect(quantum?.parameters).toEqual(expect.arrayContaining(['chemicalPotential', 'hopping', 'pairing']));
    expect(quantum?.assumptions.join(' ')).toContain('bulk model Kitaeva');
    expect(quantum?.requiredSolver).toContain('Schrödinger solver required');
  });

  it('declares mature solver and GIS integrations as explicit seams, never active engines', () => {
    const engines = listExternalEngineAdapters();
    expect(engines.map((entry) => entry.id)).toEqual([
      'openfoam-cfd', 'fenicsx-pde', 'einstein-toolkit-nr', 'openmc-radiation', 'quantum-schrodinger',
    ]);
    for (const entry of engines) {
      expect(entry.status).toBe('ENGINE_NOT_AVAILABLE');
      expect(entry.inputSchema.length).toBeGreaterThan(0);
      expect(entry.outputSchema.length).toBeGreaterThan(0);
      expect(entry.requiredProvenance.length).toBeGreaterThan(0);
    }
    for (const source of listSpatialImportAdapters()) {
      expect(source.status).toBe(source.id === 'osm-overpass' ? 'REQUIRES_VALIDATION' : 'NOT_CONFIGURED');
      expect(source.requiredRequestFields).toContain('bbox');
      expect(source.requiredProvenance).toContain('CRS');
    }
  });

  it('preserves supplemental theory and video provenance while routing only the butterfly effect to its real bounded solver', () => {
    const butterfly = runExperiment(parseScienceChatMessage('Zbadaj efekt motyla w układzie chaotycznym.'));
    expect(butterfly.result.status).toBe('completed');
    expect(butterfly.request.modelId).toBe('universe-three-body');
    expect(butterfly.result.outputs.preset).toBe('pythagorean');
    expect(butterfly.intent.supplementalKnowledgeIds).toContain('chaos-sensitive-initial-conditions');
    expect(butterfly.provenance.supplementalKnowledgeIds).toEqual(butterfly.intent.supplementalKnowledgeIds);

    const relativity = runExperiment(parseScienceChatMessage('Oblicz dylatację czasu dla beta=0.8.'));
    expect(relativity.result.status).toBe('completed');
    expect(relativity.intent.supplementalKnowledgeIds).toContain('einstein-special-relativity');

    const tesla = runExperiment(parseScienceChatMessage('Wyjaśnij działanie silnika indukcyjnego Tesli.'));
    expect(tesla.result.status).toBe('engine_not_available');
    expect(tesla.intent.supplementalKnowledgeIds).toContain('tesla-polyphase-ac-history');

    const observer = runExperiment(parseScienceChatMessage('Wyjaśnij psychologiczny efekt obserwatora.'));
    expect(observer.result.status).toBe('engine_not_available');
    expect(observer.intent.supplementalKnowledgeIds).toContain('video-n-psychological-observer');
  });

  it('prepares a reviewed real Universe-to-Chemistry hand-off only for matching Kelvin units', () => {
    const source = runExperiment(parseScienceChatMessage('Oblicz ucieczkę atmosfery planety.'));
    const target = parseScienceChatMessage('Oblicz kinetykę Arrheniusa przy 350 K i 60 kJ/mol.');
    const plan = planAtmosphericTemperatureToArrhenius(source, target);

    expect(plan.status).toBe('READY_FOR_REAL_EXECUTION');
    expect(plan.derivedRequest?.parameters.temperatureK).toBe(source.result.outputs.equilibriumTempK);
    expect(plan.reason).toContain('Wykonanie docelowego modelu wymaga osobnego wywołania');
    const executedTarget = runExperiment(plan.derivedRequest!);
    expect(executedTarget.result.status).toBe('completed');
    expect(executedTarget.provenance.parameterSnapshot.temperatureK).toBe(source.result.outputs.equilibriumTempK);
  });

  it('blocks incompatible multi-domain transfers rather than fabricating a cascade', () => {
    const source = runExperiment(parseScienceChatMessage('Oblicz promień Schwarzschilda dla 2 masy Słońca.'));
    const target = parseScienceChatMessage('Oblicz dylatację czasu dla beta=0.8.');
    const plan = planCrossDomainOrchestration({
      fromDomainId: 'spacetime-einstein', toDomainId: 'spacetime-einstein', outputKey: 'radiusKm', targetParameter: 'velocityFraction',
      transform: 'identity-only', status: 'NOT_WIRED', reason: 'Test zgodności jednostek.',
    }, source, target);
    expect(plan.status).toBe('BLOCKED_UNITS');
    expect(plan.derivedRequest).toBeUndefined();
  });

  it('normalizes bounded OSM base geometry with ODbL attribution and full source provenance', () => {
    const xml = `<?xml version="1.0"?><osm version="0.6" generator="osm-test" copyright="OpenStreetMap and contributors"><node id="1" lat="35.8885" lon="-5.3240"/><node id="2" lat="35.8886" lon="-5.3238"/><node id="3" lat="35.8887" lon="-5.3238"/><node id="4" lat="35.8885" lon="-5.3240"/><way id="101"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><tag k="building" v="yes"/></way><way id="102"><nd ref="1"/><nd ref="2"/><tag k="highway" v="residential"/></way></osm>`;
    const dataset = normalizeOsmMapXml(xml, { bbox: [-5.3240, 35.8885, -5.3235, 35.8890], sourceTimestamp: '2026-08-18T00:00:00.000Z' });
    expect(dataset.source).toBe('openstreetmap-api');
    expect(dataset.license).toBe(OSM_LICENSE);
    expect(dataset.attribution).toBe(OSM_ATTRIBUTION);
    expect(dataset.layers.buildings).toHaveLength(1);
    expect(dataset.layers.roads).toHaveLength(1);
    expect(dataset.provenance.featureCount).toBe(2);
    expect(dataset.worldIntegration).toBe('NOT_WIRED');
    expect(normalizeOsmMapXml(xml, { bbox: [-5.3240, 35.8885, -5.3235, 35.8890], sourceTimestamp: '2026-08-18T00:00:00.000Z' }).datasetId).toBe(dataset.datasetId);
    expect(() => normalizeOsmMapXml(xml, { bbox: [-5.3240, 35.8885, -5.3235, 35.8890], sourceTimestamp: '' })).toThrow('sourceTimestamp');
  });

  it('turns only real comparable runs into reviewable observations, not discoveries', () => {
    const runs = [1, 2, 3].map((mass) => runExperiment(parseScienceChatMessage(`Oblicz promień Schwarzschilda dla ${mass} masy Słońca.`)));
    const analysis = analyseExperimentSeries(runs, 'massSolar', 'radiusKm');
    expect(analysis.modelId).toBe('einstein-schwarzschild');
    expect(analysis.findings[0]?.kind).toBe('observed-correlation');
    expect(analysis.findings[0]?.verdict).toBe('REQUIRES_SCIENTIFIC_REVIEW');
    expect(analysis.disclaimer).toContain('nie jest odkryciem');

    const insufficient = analyseExperimentSeries(runs.slice(0, 2), 'massSolar', 'radiusKm');
    expect(insufficient.findings[0]?.verdict).toBe('INSUFFICIENT_DATA');
  });

  it('preregisters and executes a real Lorenz sensitivity protocol after registry-based model admission', () => {
    const baselineRequest = parseScienceChatMessage('Uruchom atraktor Lorenza: rho=20, horyzont=2, drugi start.');
    const design = designScientificExperiment({
      hypothesis: {
        statement: 'W granicach modelu Lorenza z drugim startem rozjazd końcowy pozostaje dodatni dla prerejestrowanego zakresu ρ.',
        domainId: 'classical-mechanics', modelId: 'universe-lorenz-attractor', declaredAssumptions: [],
        falsification: { metric: 'finalSeparation', relation: 'greater-than', expectedValue: 0, rationale: 'Każdy wariant musi pokazać obliczony, dodatni rozjazd dwóch startów.' },
      },
      baselineRequest,
      sweep: { parameter: 'rho', values: [20, 28, 30], label: 'ρ' },
      repetitionsPerArm: 2,
    });
    const evidence = executeScientificExperiment(design);

    expect(design.hypothesis.assessment).toBe('CANDIDATE');
    expect(evidence.createdFromRealRunsOnly).toBe(true);
    expect(evidence.arms.every((arm) => arm.reproduction === 'MATCH')).toBe(true);
    expect(evidence.assessment.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(evidence.assessment.message).toContain('nie jest odkrycie');
    expect(evidence.allRuns.every((run) => run.provenance.modelId === 'universe-lorenz-attractor')).toBe(true);
  });

  it('builds an auditable What-if protocol and Evidence Pack from real Schwarzschild runs only', () => {
    const baselineRequest = parseScienceChatMessage('Oblicz promień Schwarzschilda dla 1 masy Słońca.');
    const design = designScientificExperiment({
      hypothesis: {
        statement: 'W granicach modelu Schwarzschilda promień horyzontu rośnie monotonicznie wraz z masą.',
        domainId: 'spacetime-einstein', modelId: 'einstein-schwarzschild', declaredAssumptions: [],
        falsification: { metric: 'radiusKm', relation: 'monotonic-increase', rationale: 'Sprawdzenie prerejestrowanej relacji dla kolejnych mas.' },
      },
      baselineRequest,
      sweep: { parameter: 'massSolar', values: [1, 2, 3], label: 'Masa M☉' },
      repetitionsPerArm: 2,
      positiveControl: {
        label: 'Kontrola dodatnia: 4 M☉', request: parseScienceChatMessage('Oblicz promień Schwarzschilda dla 4 masy Słońca.'),
        expectedRole: 'Dodatkowy obliczony punkt referencyjny tego samego realnego modelu.',
      },
    });
    const evidence = executeScientificExperiment(design);
    expect(evidence.createdFromRealRunsOnly).toBe(true);
    expect(evidence.arms.some((arm) => arm.kind === 'positive-control')).toBe(true);
    expect(evidence.arms.every((arm) => arm.reproduction === 'MATCH')).toBe(true);
    expect(evidence.assessment.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(evidence.assessment.message).toContain('nie jest odkrycie');
    const pack = createScientificEvidencePack(evidence);
    expect(pack.runCount).toBe(evidence.allRuns.length);
    expect(pack.reproducibility.allArmsMatched).toBe(true);
    expect(pack.runs.every((run) => run.provenance.resultOrigin === 'real-engine')).toBe(true);
    expect(JSON.parse(serializeScientificEvidencePack(pack)).evidencePackId).toBe(pack.evidencePackId);
  });

  it('exports only a real Evidence Pack as deterministic RO-Crate JSON-LD with PROV relations', () => {
    const baselineRequest = parseScienceChatMessage('Oblicz promień Schwarzschilda dla 1 masy Słońca.');
    const design = designScientificExperiment({
      hypothesis: {
        statement: 'W granicach modelu Schwarzschilda promień horyzontu rośnie wraz z masą.',
        domainId: 'spacetime-einstein', modelId: 'einstein-schwarzschild', declaredAssumptions: [],
        falsification: { metric: 'radiusKm', relation: 'monotonic-increase', rationale: 'Kontrola eksportu provenance dla realnych runów.' },
      },
      baselineRequest,
      sweep: { parameter: 'massSolar', values: [1, 2], label: 'Masa M☉' },
      repetitionsPerArm: 1,
    });
    const pack = createScientificEvidencePack(executeScientificExperiment(design));
    const crate = exportEvidencePackRoCrate(pack);
    const graph = crate['@graph'];
    const packNode = graph.find((node) => node.identifier === pack.evidencePackId);
    const protocolNode = graph.find((node) => node.identifier === pack.protocol.designId);
    const activities = graph.filter((node) => node['@type'] === 'prov:Activity');
    const results = graph.filter((node) => Array.isArray(node['@type']) && (node['@type'] as readonly string[]).includes('prov:Entity') && node['prov:wasGeneratedBy'] !== undefined);

    expect(crate['@context'][0]).toContain('ro/crate');
    expect(packNode?.['genesis:roCrateProfileVersion']).toBeUndefined();
    expect(protocolNode?.['genesis:protocolFingerprint']).toBe(pack.protocol.protocolFingerprint);
    expect(activities).toHaveLength(pack.runCount);
    expect(results).toHaveLength(pack.runCount);
    expect(activities.every((activity) => activity['prov:used'] !== undefined)).toBe(true);
    expect(results.every((result) => result['prov:wasGeneratedBy'] !== undefined)).toBe(true);
    expect(results.every((result) => result['genesis:status'] === 'completed')).toBe(true);
    expect(activities.every((activity) => activity['genesis:resultOrigin'] === 'real-engine')).toBe(true);
    expect(graph.some((node) => Array.isArray(node['@type']) && (node['@type'] as readonly string[]).includes('prov:SoftwareAgent'))).toBe(true);
    expect(serializeEvidencePackRoCrate(pack)).toBe(serializeEvidencePackRoCrate(pack));
    expect(JSON.parse(serializeEvidencePackRoCrate(pack))['@graph'].some((node: Record<string, unknown>) => node['genesis:roCrateProfileVersion'] === RO_CRATE_EVIDENCE_PACK_VERSION)).toBe(true);
    expect(packNode?.['genesis:disclaimer']).toContain('nie stanowi odkrycia');
  });

  it('creates an evidence-guided plan before a real run and executes only after confirmation', () => {
    const request = parseScienceChatMessage('Oblicz promień Schwarzschilda dla 2 masy Słońca.');
    const reviewed = planEvidenceGuidedExperiment(request);

    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.modelId).toBe('einstein-schwarzschild');
    expect(reviewed.disclosure.engine).toContain('genesis-physics');
    expect(reviewed.disclosure.resultWillComeFromRealRun).toBe(true);
    expect(reviewed.disclosure.requestedParameters.massSolar).toBe(2);
    expect(reviewed.disclosure.limitations.join(' ')).toContain('granicach modelu');

    const confirmed = confirmEvidenceGuidedExperiment(reviewed);
    expect(confirmed.run.result.status).toBe('completed');
    expect(confirmed.run.provenance.resultOrigin).toBe('real-engine');
    expect(confirmed.handoff.evidencePack.status).toBe('PROTOCOL_REQUIRED');
    expect(confirmed.handoff.counterfactual.status).toBe('VARIANT_REQUIRED');
  });

  it('rejects an evidence-guided plan modified after review before executing it', () => {
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Oblicz promień Schwarzschilda dla 1 masy Słońca.'));
    const modified = {
      ...reviewed,
      disclosure: { ...reviewed.disclosure, engine: 'invented-solver@9.9.9' },
    };

    expect(() => confirmEvidenceGuidedExperiment(modified)).toThrow('modified after review');
  });

  it('discloses ENGINE_NOT_AVAILABLE and never confirms an absent quantum solver', () => {
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Rozwiąż równanie Schrödingera dla tunelowania.'));

    expect(reviewed.status).toBe('ENGINE_NOT_AVAILABLE');
    expect(reviewed.disclosure.resultWillComeFromRealRun).toBe(false);
    expect(reviewed.disclosure.requiredSolver).toBeTruthy();
    expect(() => confirmEvidenceGuidedExperiment(reviewed)).toThrow('ENGINE_NOT_AVAILABLE');
  });

  it('discloses Majorana evidence as measurement, claim under review and fiction without fabricating a solver', () => {
    const card = createMajorana1QuantumEvidenceCard();
    const reviewed = planEvidenceGuidedExperiment(parseScienceChatMessage('Wyjaśnij Majorana 1 i topologiczny kubit.'));
    const entries = reviewed.disclosure.quantumEvidenceCards[0]?.entries;

    expect(card?.entries.map((entry) => entry.status)).toEqual([
      'PEER_REVIEWED_MEASUREMENT', 'CLAIM_UNDER_REVIEW', 'FICTIONAL_REFERENCE',
    ]);
    expect(entries?.map((entry) => entry.knowledgeId)).toEqual(card?.entries.map((entry) => entry.knowledgeId));
    expect(entries?.find((entry) => entry.status === 'PEER_REVIEWED_MEASUREMENT')?.epistemicStatus).toBe('FACT');
    expect(entries?.find((entry) => entry.status === 'CLAIM_UNDER_REVIEW')?.epistemicStatus).toBe('HYPOTHESIS');
    expect(entries?.find((entry) => entry.status === 'FICTIONAL_REFERENCE')?.epistemicStatus).toBe('FICTIONAL_REFERENCE');
    expect(entries?.every((entry) => entry.runnableModelIds.length === 0)).toBe(true);
    expect(reviewed.status).toBe('ENGINE_NOT_AVAILABLE');
    expect(() => confirmEvidenceGuidedExperiment(reviewed)).toThrow('ENGINE_NOT_AVAILABLE');
  });

  it('runs the bounded Kitaev bulk model with reference phases but never as Majorana 1 hardware', () => {
    const topological = runExperiment(parseScienceChatMessage('Zasymuluj łańcuch Kitaeva mu=0 t=1 delta=1.'));
    const critical = runExperiment(parseScienceChatMessage('Zasymuluj łańcuch Kitaeva mu=2 t=1 delta=1.'));
    const majoranaDevice = runExperiment(parseScienceChatMessage('Zasymuluj urządzenie Majorana 1.'));

    expect(topological.request.modelId).toBe('quantum-kitaev-bulk');
    expect(topological.result.status).toBe('completed');
    expect(topological.result.outputs.phaseClass).toBe('TOPOLOGICAL_REGIME');
    expect(topological.result.outputs.topologicalInvariant).toBe(-1);
    expect(topological.result.route).toEqual({ kind: 'none' });
    expect(topological.result.visualization).toEqual(['numeric']);
    expect(Number(topological.result.outputs.bulkGap)).toBeCloseTo(2, 10);
    expect(topological.result.validity).toContain('nie jest modelem nanodrutu');

    expect(critical.result.status).toBe('completed');
    expect(critical.result.outputs.phaseClass).toBe('CRITICAL_BOUNDARY');
    expect(Number(critical.result.outputs.bulkGap)).toBeCloseTo(0, 10);
    expect(critical.result.warnings[0]).toContain('Bulk gap zamyka się');

    expect(majoranaDevice.request.modelId).toBeUndefined();
    expect(majoranaDevice.result.status).toBe('capability_seam');
    expect(majoranaDevice.result.outputs).toEqual({});
  });

  it('runs the existing planet-stability N-body integrator through Fabric without claiming a full ephemeris', () => {
    const command = 'Zbadaj stabilność planet przez 2 lat, bez Jowisza, bez Saturna.';
    const run = runExperiment(parseScienceChatMessage(command));
    const repeated = runExperiment(parseScienceChatMessage(command));

    expect(run.request.modelId).toBe('universe-planet-stability');
    expect(run.request.parameters).toEqual({ years: 2, jupiter: false, saturn: false });
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'planet-stability' });
    expect(Number(run.result.outputs.earthEccentricity)).toBeGreaterThanOrEqual(0);
    expect(Number(run.result.outputs.marsEccentricity)).toBeGreaterThanOrEqual(0);
    expect(run.result.validity).toContain('nie obejmuje ośmiu planet');
    expect(run.result.warnings[0]).toContain('nie efemerydą');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
  });

  it('runs the existing Lorenz attractor through Fabric without claiming a weather forecast', () => {
    const run = runExperiment(parseScienceChatMessage('Uruchom atraktor Lorenza: rho=28, horyzont=2, drugi start.'));
    const repeated = runExperiment(parseScienceChatMessage('Uruchom atraktor Lorenza: rho=28, horyzont=2, drugi start.'));

    expect(run.request.modelId).toBe('universe-lorenz-attractor');
    expect(run.request.parameters).toEqual({ rho: 28, horizonTime: 2, divergence: true });
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'lorenz' });
    expect(Number(run.result.outputs.chaosThreshold)).toBeGreaterThan(24);
    expect(Number(run.result.outputs.finalSeparation)).toBeGreaterThan(0);
    expect(run.result.validity).toContain('nie zawiera danych meteorologicznych');
    expect(run.result.warnings[0]).toContain('nie jest prognozą pogody');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
  });

  it('runs the fixed Hubble-tension comparison through Fabric without claiming a cosmological prediction', () => {
    const run = runExperiment(parseScienceChatMessage('Porównaj napięcie Hubble’a: dodatkowa systematyka=1.5, bez TRGB.'));
    const repeated = runExperiment(parseScienceChatMessage('Porównaj napięcie Hubble’a: dodatkowa systematyka=1.5, bez TRGB.'));

    expect(run.request.modelId).toBe('universe-hubble-tension');
    expect(run.request.parameters).toEqual({ extraSystematic: 1.5, showTrgb: false });
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'hubbletension' });
    expect(Number(run.result.outputs.tensionSigma)).toBeGreaterThan(0);
    expect(run.result.outputs.trgbH0).toBeUndefined();
    expect(run.result.validity).toContain('nie jest fitowaniem ΛCDM');
    expect(run.result.warnings[0]).toContain('nie ustala');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
  });

  it('runs the existing deterministic double-pendulum solver through Fabric without replacing its RK4 stepper', () => {
    const run = runExperiment(parseScienceChatMessage('Zasymuluj podwójne wahadło: kąt=150, horyzont=2, drugi start.'));
    const repeated = runExperiment(parseScienceChatMessage('Zasymuluj podwójne wahadło: kąt=150, horyzont=2, drugi start.'));

    expect(run.request.modelId).toBe('universe-double-pendulum');
    expect(run.request.parameters).toEqual({ angleDeg: 150, horizonSeconds: 2, divergence: true });
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'doublependulum' });
    expect(Number(run.result.outputs.relativeEnergyDrift)).toBeGreaterThanOrEqual(0);
    expect(Number(run.result.outputs.finalAngularSeparation)).toBeGreaterThan(0);
    expect(run.result.validity).toContain('RK4 nie jest symplektyczny');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
  });

  it('runs the existing deterministic three-body integrator through Fabric without replacing its solver', () => {
    const figureEight = runExperiment(parseScienceChatMessage('Zasymuluj problem trzech ciał: orbita ósemkowa, horyzont=1.5.'));
    const pythagorean = runExperiment(parseScienceChatMessage('Zasymuluj układ pitagorejski problemu trzech ciał, horyzont=2, drugi start.'));
    const repeated = runExperiment(parseScienceChatMessage('Zasymuluj problem trzech ciał: orbita ósemkowa, horyzont=1.5.'));

    expect(figureEight.request.modelId).toBe('universe-three-body');
    expect(figureEight.result.status).toBe('completed');
    expect(figureEight.result.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'threebody' });
    expect(figureEight.result.outputs.preset).toBe('figure8');
    expect(Number(figureEight.result.outputs.relativeEnergyDrift)).toBeLessThan(0.01);
    expect(Number(figureEight.result.outputs.finalMinPairDistance)).toBeGreaterThan(0);
    expect(figureEight.result.validity).toContain('nie jest prognozą konkretnego układu astronomicznego');
    expect(figureEight.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);

    expect(pythagorean.result.status).toBe('completed');
    expect(pythagorean.result.outputs.preset).toBe('pythagorean');
    expect(Number(pythagorean.result.outputs.finalSeparation)).toBeGreaterThan(0);
    expect(pythagorean.result.assumptions.some((assumption) => assumption.includes('10⁻⁶'))).toBe(true);
  });

  it('maps the butterfly-effect request only to the real perturbed three-body scenario', () => {
    const request = parseScienceChatMessage('Pokaż efekt motyla dla warunków początkowych, horyzont=2.');
    const run = runExperiment(request);

    expect(request.modelId).toBe('universe-three-body');
    expect(request.parameters).toEqual({ preset: 'pythagorean', horizonTime: 2, divergence: true });
    expect(run.result.status).toBe('completed');
    expect(run.result.outputs.preset).toBe('pythagorean');
    expect(Number(run.result.outputs.finalSeparation)).toBeGreaterThan(0);
    expect(run.result.validity).toContain('nie jest prognozą konkretnego układu astronomicznego');
  });

  it('creates and replays a reproducible scenario capsule from real A/B runs only', () => {
    const comparison = compareCounterfactual({
      baseline: parseScienceChatMessage('Oblicz promień Schwarzschilda dla 1 masy Słońca.'),
      variant: parseScienceChatMessage('Oblicz promień Schwarzschilda dla 2 masy Słońca.'),
    });
    const capsule = createScenarioCapsule({
      title: 'Schwarzschild 1 M☉ vs 2 M☉',
      baselineRun: comparison.baseline!,
      variantRun: comparison.variant!,
      comparison,
    });
    const replay = replayScenarioCapsule(capsule);

    expect(capsule.references.baselineRunFingerprint).toBe(comparison.evidence?.baselineRunFingerprint);
    expect(capsule.references.variantRunFingerprint).toBe(comparison.evidence?.variantRunFingerprint);
    expect(capsule.comparison?.comparisonId).toBe(comparison.comparisonId);
    expect(replay.status).toBe('MATCH');
    expect(replay.checks.every((check) => check.matched)).toBe(true);
    expect(serializeScenarioCapsule(capsule)).toBe(serializeScenarioCapsule(capsule));
  });

  it('retains a real OSM dataset as static provenance in a reproducible scenario capsule', () => {
    const comparison = compareCounterfactual({
      baseline: parseScienceChatMessage('Oblicz promień Schwarzschilda dla 1 masy Słońca.'),
      variant: parseScienceChatMessage('Oblicz promień Schwarzschilda dla 2 masy Słońca.'),
    });
    const xml = `<?xml version="1.0"?><osm version="0.6" generator="osm-test"><node id="1" lat="35.8885" lon="-5.3240"/><node id="2" lat="35.8886" lon="-5.3238"/><way id="102"><nd ref="1"/><nd ref="2"/><tag k="highway" v="residential"/></way></osm>`;
    const spatialDataset = normalizeOsmMapXml(xml, { bbox: [-5.3240, 35.8885, -5.3235, 35.8890], sourceTimestamp: '2026-08-18T00:00:00.000Z' });
    const capsule = createScenarioCapsule({
      title: 'Realny kontekst OSM dla A/B Schwarzschilda',
      baselineRun: comparison.baseline!,
      variantRun: comparison.variant!,
      comparison,
      spatialDataset,
    });
    const replay = replayScenarioCapsule(capsule);

    expect(capsule.references.spatialDatasetId).toBe(spatialDataset.datasetId);
    expect(capsule.references.spatialNormalizationFingerprint).toBe(spatialDataset.provenance.normalizationFingerprint);
    expect(capsule.spatial?.status).toBe('RETAINED_STATIC_ARTIFACT');
    expect(capsule.spatial?.dataset.worldIntegration).toBe('NOT_WIRED');
    expect(replay.status).toBe('MATCH');
    expect(replay.spatial?.datasetId).toBe(spatialDataset.datasetId);
    expect(replay.spatial?.license).toBe(OSM_LICENSE);

    const invalidAttribution = { ...spatialDataset, attribution: 'no attribution' } as unknown as typeof spatialDataset;
    expect(() => createScenarioCapsule({
      title: 'Nieważny artefakt OSM', baselineRun: comparison.baseline!, variantRun: comparison.variant!, comparison, spatialDataset: invalidAttribution,
    })).toThrow('ODbL license');
  });

  it('rejects Scenario Capsules from absent engines or mismatched A/B provenance', () => {
    const unavailable = runExperiment(parseScienceChatMessage('Rozwiąż równanie Schrödingera dla tunelowania.'));
    expect(() => createScenarioCapsule({ title: 'Brak silnika', baselineRun: unavailable })).toThrow('completed real-engine');

    const comparison = compareCounterfactual({
      baseline: parseScienceChatMessage('Oblicz promień Schwarzschilda dla 1 masy Słońca.'),
      variant: parseScienceChatMessage('Oblicz promień Schwarzschilda dla 2 masy Słońca.'),
    });
    const unrelatedVariant = runExperiment(parseScienceChatMessage('Oblicz promień Schwarzschilda dla 3 masy Słońca.'));
    expect(() => createScenarioCapsule({
      title: 'Niespójny wariant',
      baselineRun: comparison.baseline!,
      variantRun: unrelatedVariant,
      comparison,
    })).toThrow('fingerprints do not match');
  });

  it('compares two real Schwarzschild runs as a deterministic evidence-backed counterfactual', () => {
    const comparison = compareCounterfactual({
      baseline: parseScienceChatMessage('Oblicz promień Schwarzschilda dla 1 masy Słońca.'),
      variant: parseScienceChatMessage('Oblicz promień Schwarzschilda dla 2 masy Słońca.'),
      labels: { baseline: 'Masa 1 M☉', variant: 'Masa 2 M☉' },
    });
    const radius = comparison.metrics.find((metric) => metric.key === 'radiusKm');

    expect(comparison.status).toBe('COMPLETED');
    expect(comparison.model?.modelId).toBe('einstein-schwarzschild');
    expect(comparison.seedControl.status).toBe('DETERMINISTIC_NO_SEED');
    expect(comparison.parameterDifferences.find((parameter) => parameter.key === 'massSolar')?.changed).toBe(true);
    expect(radius?.baseline).toBeCloseTo(2.95, 1);
    expect(radius?.variant).toBeCloseTo(5.91, 1);
    expect(radius?.absoluteDelta).toBeGreaterThan(0);
    expect(comparison.evidence?.baselineResultOrigin).toBe('real-engine');
    expect(comparison.evidence?.variantResultOrigin).toBe('real-engine');
    expect(serializeCounterfactualComparison(comparison)).toBe(serializeCounterfactualComparison(comparison));
    expect(comparison.disclaimer).toMatch(/nie jest predykcją świata rzeczywistego/i);
  });

  it('compares seeded epidemic scenarios through the original EpidemicCitySimulation', () => {
    const comparison = compareCounterfactual({
      baseline: parseScienceChatMessage('Zasymuluj epidemię z R0=2 przez 14 dni seed=909.'),
      variant: parseScienceChatMessage('Zasymuluj epidemię z R0=6 przez 14 dni seed=909.'),
    });

    expect(comparison.status).toBe('COMPLETED');
    expect(comparison.model?.modelId).toBe('epidemic-city');
    expect(comparison.seedControl).toEqual({ status: 'MATCHED', baselineSeed: 909, variantSeed: 909 });
    expect(comparison.baseline?.provenance.seed).toBe(909);
    expect(comparison.variant?.provenance.seed).toBe(909);
    expect(comparison.evidence?.baselineResultOrigin).toBe('real-engine');
    expect(comparison.metrics.length).toBeGreaterThan(0);
  });

  it('blocks model mismatch before executing a counterfactual comparison', () => {
    const comparison = compareCounterfactual({
      baseline: parseScienceChatMessage('Oblicz promień Schwarzschilda dla 1 masy Słońca.'),
      variant: parseScienceChatMessage('Oblicz dylatację czasu dla beta=0.8.'),
    });

    expect(comparison.status).toBe('BLOCKED_MODEL_MISMATCH');
    expect(comparison.baseline).toBeUndefined();
    expect(comparison.variant).toBeUndefined();
    expect(comparison.metrics).toEqual([]);
    expect(comparison.validationErrors[0]).toContain('identycznej domeny i modelId');
  });

  it('runs a real Schwarzschild calculation from natural language with provenance', () => {
    const request = parseScienceChatMessage('Oblicz promień Schwarzschilda dla 2 masy Słońca.');
    expect(request.modelId).toBe('einstein-schwarzschild');
    expect(validateStructuredExperimentRequest(request).ok).toBe(true);
    const run = runExperiment(request);
    expect(run.result.status).toBe('completed');
    expect(run.result.outputs.radiusKm).toBeCloseTo(5.94, 1);
    expect(run.provenance.modelId).toBe('einstein-schwarzschild');
    expect(run.provenance.resultOrigin).toBe('real-engine');
    expect(run.provenance.knowledgeSources).toContain('spacetime-einstein.md');
  });

  it('runs the existing Kepler ModelGraph deterministically from natural language', () => {
    const request = parseScienceChatMessage('Oblicz orbitę planety przy 2 AU i 1 masie Słońca.');
    const a = runExperiment(request);
    const b = runExperiment(request);
    expect(a.result.status).toBe('completed');
    expect(a.result.outputs.orbitalPeriodYears).toBeCloseTo(Math.sqrt(8), 8);
    expect(a.result.outputs).toEqual(b.result.outputs);
    expect(a.runId).toBe(b.runId);
    expect(a.provenance.knowledgeSources).toContain('universe.md');
  });

  it('runs the existing pump-pipe engineering graph rather than a water stub', () => {
    const run = runExperiment(parseScienceChatMessage('Zasymuluj przepływ wody w pompie i rurociągu.'));
    expect(run.request.modelId).toBe('water-pump-pipe');
    expect(run.result.status).toBe('completed');
    expect(Number(run.result.outputs.flowVelocity)).toBeGreaterThan(0);
    expect(Number(run.result.outputs.shaftPower)).toBeGreaterThan(0);
    expect(run.result.validity).toContain('nie jest CFD');
  });

  it.each([
    ['Oblicz energię wiązania jądra protony=26 neutrony=30.', 'nuclear-semf', 'bindingEnergy'],
    ['Oblicz dylatację czasu dla beta=0.8.', 'sr-lorentz', 'lorentzGammaFactor'],
    ['Oblicz ucieczkę atmosfery planety.', 'universe-atmospheric-escape', 'jeansParameter'],
    ['Oblicz energię relatywistyczną cząstki beta=0.8.', 'particle-relativistic-energy', 'totalEnergyMeV'],
    ['Oblicz kinetykę Arrheniusa przy 350 K i 60 kJ/mol.', 'chemistry-arrhenius', 'rateConstant'],
    ['Oblicz masę molową wzór H2O.', 'chem-molecular-weight', 'molarMassGmol'],
    ['Oblicz rozkład normalny.', 'math-gaussian', 'pdfValue'],
    ['Oblicz wzrost logistyczny populacji.', 'biology-logistic', 'populationAtT'],
    ['Oblicz Kardaszew typ K=1.', 'civilization-kardashev', 'powerWatts'],
  ])('routes Chat through real local model %s', (prompt, modelId, outputKey) => {
    const run = runExperiment(parseScienceChatMessage(prompt));
    expect(run.request.modelId).toBe(modelId);
    expect(run.result.status).toBe('completed');
    expect(run.provenance.resultOrigin).toBe('real-engine');
    expect(typeof run.result.outputs[outputKey]).toBe('number');
  });

  it('runs one deterministic EpidemicCitySimulation and exposes only real event summaries', () => {
    const request = parseScienceChatMessage('Zasymuluj epidemię z R0=8 przez 90 dni seed=20260817.');
    const a = runExperiment(request);
    const b = runExperiment(request);
    expect(a.result.status).toBe('completed');
    expect(a.result.outputs.dzien).toBe(90);
    expect(a.result.eventSummary?.types).toEqual(['infection.transmission']);
    expect(a.result.eventSummary?.count).toBeGreaterThan(0);
    expect(a.result.outputs).toEqual(b.result.outputs);
    expect(a.result.eventSummary).toEqual(b.result.eventSummary);
    expect(a.runId).toBe(b.runId);
    expect(a.provenance.modelId).toBe('epidemic-city');
  });

  it('hands the original epidemic world reference to the renderer exactly once', () => {
    clearExperimentWorldHandoffs();
    const run = runExperiment(parseScienceChatMessage('Zasymuluj epidemię z R0=5 przez 10 dni seed=12.'));
    expect(run.result.status).toBe('completed');
    expect(setPendingExperimentWorld(run.runId)).toBe(true);
    const handoff = consumePendingExperimentWorld();
    expect(handoff?.simulation.stats()).toEqual(run.result.outputs);
    expect(consumePendingExperimentWorld()).toBeNull();
    clearExperimentWorldHandoffs();
  });

  it('never fabricates a tunnelling solver or an urban hazard cascade', () => {
    const quantum = runExperiment(parseScienceChatMessage('Zasymuluj tunelowanie kwantowe.'));
    expect(quantum.result.status).toBe('capability_seam');
    expect(quantum.result.outputs).toEqual({});
    expect(quantum.result.summary).toContain('Wymagany solver');

    const flood = runExperiment(parseScienceChatMessage('Zasymuluj kaskadę: powódź → infrastruktura → epidemia.'));
    expect(flood.result.status).toBe('engine_not_available');
    expect(flood.result.outputs).toEqual({});
    expect(flood.result.summary).toContain('Wymagany solver');
  });
});
