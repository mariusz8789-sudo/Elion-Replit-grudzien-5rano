import { describe, expect, it } from 'vitest';
import { getKnowledgeDomain, validateKnowledgeRegistry } from '../core/knowledge/registry';
import { createSpatialWorldOverlay } from '../core/simulationRenderer/spatialOverlay';
import {
  parseScienceChatMessage,
  runExperiment,
  validateStructuredExperimentRequest,
  listExternalEngineAdapters,
  createExternalSolverJobManifest,
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
  confirmEarthquakeEvidenceGuidedExperiment,
  capsuleFromConfirmedExperiment,
  createMajorana1QuantumEvidenceCard,
  createScenarioCapsule,
  replayScenarioCapsule,
  serializeScenarioCapsule,
  normalizeOsmMapXml,
  OSM_ATTRIBUTION,
  OSM_LICENSE,
  planCrossDomainOrchestration,
  planAtmosphericTemperatureToArrhenius,
  confirmCrossDomainOrchestration,
  createAgingModelDataRequirement,
  rankAgingEvidenceCandidates,
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

  it('registers one data-verified DepMap model in the Aging Lab without upgrading absent biological engines', () => {
    const aging = getKnowledgeDomain('biology-aging-lab');
    expect(aging?.capability).toBe('BACKEND_REAL_ENGINE');
    expect(aging?.realModels).toEqual(['biology-depmap-crispr-senescence-panel']);
    expect(aging?.sourceFile).toBe('biology-aging-senescence-cancer.md');
    expect(aging?.requiredSolver).toContain('DepMap 24Q2');
    expect(aging?.assumptions.join(' ').toLowerCase()).toContain('nie jest modelem pacjenta');

    const depmap = parseScienceChatMessage('Uruchom DepMap CRISPR panel p53 i p21.');
    expect(depmap.domainId).toBe('biology-aging-lab');
    expect(depmap.modelId).toBe('biology-depmap-crispr-senescence-panel');
    expect(depmap.parameters).toEqual({});

    const [row] = rankAgingEvidenceCandidates([{
      candidateId: 'evidence-only', label: 'Evidence-only record', knowledgeSources: [],
      evidenceQuality: 0.8, declaredLimitations: ['No biological data supplied.'],
    }]);
    expect(row.disposition).toBe('DATA_REQUIRED');
    expect(row.evidenceReadinessScore).toBeNull();
    expect(createAgingModelDataRequirement('cell-state dynamics').status).toBe('DATA_REQUIRED');
  });

  it('registers the bounded Kitaev bulk model without upgrading absent quantum hardware', () => {
    const quantum = getKnowledgeDomain('quantum');
    expect(quantum?.capability).toBe('CAPABILITY_SEAM');
    expect(quantum?.realModels).toContain('quantum-kitaev-bulk');
    expect(quantum?.parameters).toEqual(expect.arrayContaining(['chemicalPotential', 'hopping', 'pairing']));
    expect(quantum?.assumptions.join(' ')).toContain('bulk model Kitaeva');
    expect(quantum?.requiredSolver).toContain('Schrödinger solver required');
  });

  it('records a future external solver job as a non-executable provenance manifest', () => {
    const manifest = createExternalSolverJobManifest({
      adapterId: 'openfoam-cfd',
      containerImageDigest: `sha256:${'a'.repeat(64)}`,
      inputArtifacts: [{ role: 'case-files', sha256: 'b'.repeat(64), mediaType: 'application/x-tar', byteLength: 2048 }],
      resourceLimits: { cpuCores: 4, memoryMiB: 4096, wallTimeSeconds: 3600 },
    });
    expect(manifest.status).toBe('AWAITING_RUNTIME');
    expect(manifest.adapterId).toBe('openfoam-cfd');
    expect(manifest.backend).toBe('local-container');
    expect(manifest.requiredProvenance).toContain('solver log hash');
    expect(manifest.executionProhibitedReason).toContain('does not execute a solver');
    expect(manifest).not.toHaveProperty('outputs');
    expect(() => createExternalSolverJobManifest({
      adapterId: 'openfoam-cfd', containerImageDigest: 'latest', inputArtifacts: [],
      resourceLimits: { cpuCores: 0, memoryMiB: 0, wallTimeSeconds: 0 },
    })).toThrow('containerImageDigest');
  });

  it('declares solver and GIS integrations as explicit seams with runtime-specific availability', () => {
    const engines = listExternalEngineAdapters();
    expect(engines.map((entry) => entry.id)).toEqual([
      'pymeep-maxwell-fdtd', 'rdkit-molecular-descriptors', 'openmm-hiv-10e8-long-md', 'openfoam-cfd', 'fenicsx-pde', 'einstein-toolkit-nr', 'openmc-radiation', 'quantum-schrodinger',
    ]);
    for (const entry of engines) {
      expect(entry.status).toBe(['pymeep-maxwell-fdtd', 'rdkit-molecular-descriptors'].includes(entry.id) ? 'REQUIRES_VALIDATION' : 'ENGINE_NOT_AVAILABLE');
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
    const confirmed = confirmCrossDomainOrchestration(plan, source);
    expect(confirmed.sourceRunId).toBe(source.runId);
    expect(confirmed.sourceRunFingerprint).toBe(source.provenance.runFingerprint);
    expect(confirmed.targetRun.result.status).toBe('completed');
    expect(confirmed.targetRun.provenance.parameterSnapshot.temperatureK).toBe(source.result.outputs.equilibriumTempK);
    expect(() => confirmCrossDomainOrchestration({ ...plan, reason: 'zmieniony plan' }, source)).toThrow('modified after review');
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
    const datasetBeforeOverlay = JSON.stringify(dataset.layers);
    const overlay = createSpatialWorldOverlay(dataset, 1000, 800);
    expect(overlay.kind).toBe('read-only-spatial-overlay');
    expect(overlay.datasetId).toBe(dataset.datasetId);
    expect(overlay.layers.buildings[0]?.geometry.coordinates[0]).toEqual([0, 800]);
    expect(JSON.stringify(dataset.layers)).toBe(datasetBeforeOverlay);
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
    const capsule = capsuleFromConfirmedExperiment(confirmed);
    expect(capsule.status).toBe('CONFIRMED_REAL_RUN');
    expect(capsule.modelId).toBe('einstein-schwarzschild');
    expect(capsule.runFingerprint).toBe(confirmed.run.provenance.runFingerprint);
    expect(capsule.outputs.radiusKm).toBe(confirmed.run.result.outputs.radiusKm);
    expect(capsule.evidencePack).toEqual(confirmed.handoff.evidencePack);
    expect(capsule.counterfactual).toEqual(confirmed.handoff.counterfactual);
  });

  it('routes the Philadelphia Experiment only as a confirmed historical-legend hypothetical visualization', () => {
    const legendRequest = parseScienceChatMessage('Pokaż wersję według legendy Eksperymentu Filadelfia z USS Eldridge.');
    expect(legendRequest.domainId).toBe('historical-legends');
    expect(legendRequest.modelId).toBe('historical-philadelphia-legend');
    expect(legendRequest.parameters.viewMode).toBe('legend');

    const reviewed = planEvidenceGuidedExperiment(legendRequest);
    expect(reviewed.status).toBe('READY_FOR_HYPOTHETICAL_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('HYPOTHETICAL_VISUALIZATION');
    expect(reviewed.disclosure.resultWillComeFromRealRun).toBe(false);
    expect(reviewed.disclosure.knowledgeSources).toContain('historical-legends-philadelphia.md');

    const confirmed = confirmEvidenceGuidedExperiment(reviewed);
    expect(confirmed.run.result.status).toBe('hypothetical_visualization');
    expect(confirmed.run.provenance.resultOrigin).toBe('hypothetical-visualization');
    expect(confirmed.run.result.outputs).toMatchObject({ classification: 'HISTORICAL_LEGEND', viewMode: 'legend', realEngineAvailable: false });
    expect(confirmed.run.result.route).toEqual({ kind: 'hypothetical-visualization', scenarioId: 'philadelphia-legend', hash: '#/hf-slice?scenario=philadelphia' });
    expect(confirmed.run.result.warnings.join(' ')).toContain('REAL_ENGINE: brak');
    expect(() => capsuleFromConfirmedExperiment(confirmed)).toThrow('completed real-engine run');

    const physicsRequest = parseScienceChatMessage('Pokaż, co jest zgodne ze znaną fizyką w legendzie Filadelfii.');
    expect(physicsRequest.parameters.viewMode).toBe('physics');
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

  it('runs bounded hydrogen orbital through Fabric without treating a renderer cloud as a measurement', () => {
    const command = 'Oblicz orbital atomowy wodoru.';
    const run = runExperiment(parseScienceChatMessage(command));
    const repeated = runExperiment(parseScienceChatMessage(command));
    const atom = getKnowledgeDomain('atom');
    expect(run.request.modelId).toBe('atom-hydrogen-orbital');
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'atom', experimentId: 'orbital-3d' });
    expect(Number(run.result.outputs.relativeDensity)).toBeGreaterThanOrEqual(0);
    expect(run.result.validity).toContain('wieloelektronowej');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(atom?.realModels).toContain('atom-hydrogen-orbital');
  });

  it('runs the Drake ModelGraph through Fabric as conditional interpretation, not prediction', () => {
    const command = 'Przelicz równanie Drake’a.';
    const run = runExperiment(parseScienceChatMessage(command));
    const repeated = runExperiment(parseScienceChatMessage(command));
    const civilization = getKnowledgeDomain('civilization');
    expect(run.request.modelId).toBe('civilization-drake-equation');
    expect(run.result.status).toBe('completed');
    expect(Number(run.result.outputs.civilizationCount)).toBeCloseTo(13.5, 12);
    expect(run.result.validity).toContain('interpretacyjna');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(civilization?.realModels).toContain('civilization-drake-equation');
  });

  it('runs bounded B-DNA and Wallace observables through Fabric without claiming full thermodynamics', () => {
    const command = 'Pokaż helisę DNA.';
    const run = runExperiment(parseScienceChatMessage(command));
    const repeated = runExperiment(parseScienceChatMessage(command));
    const biology = getKnowledgeDomain('biology');
    expect(run.request.modelId).toBe('biology-dna-helix');
    expect(run.result.status).toBe('completed');
    expect(run.result.outputs).toMatchObject({ sequence: 'mixed', basePairs: 20, radiusNm: 1, risePerBasePairNm: 0.34 });
    expect(run.result.validity).toContain('Bez metody najbliższego sąsiada');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(biology?.realModels).toContain('biology-dna-helix');
  });

  it('plans the bounded tokamak Lawson criterion for backend Fabric without claiming reactor prediction', () => {
    const command = 'Sprawdź kryterium Lawsona tokamak.';
    const request = parseScienceChatMessage(command);
    const reviewed = planEvidenceGuidedExperiment(request);
    const nuclear = getKnowledgeDomain('nuclear');

    expect(request.modelId).toBe('nuclear-tokamak-lawson');
    expect(request.parameters).toEqual({});
    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(reviewed.plan.modelVersion).toBe('1.1.0');
    expect(reviewed.plan.route).toEqual({ kind: 'none' });
    expect(reviewed.disclosure.rationale).toContain('Nie jest MHD');
    expect(nuclear?.realModels).toContain('nuclear-tokamak-lawson');
  });

  it('runs all bounded quantum-teleportation branches through Fabric without claiming hardware', () => {
    const command = 'Zweryfikuj teleportację kwantową stan = plusI.';
    const run = runExperiment(parseScienceChatMessage(command));
    const repeated = runExperiment(parseScienceChatMessage(command));
    const quantum = getKnowledgeDomain('quantum');

    expect(run.request.modelId).toBe('quantum-teleportation');
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'quantum', experimentId: 'teleport' });
    expect(run.result.outputs).toMatchObject({ state: 'plusI', branchCount: 4, allRecovered: true });
    expect(Number(run.result.outputs.minFidelity)).toBeCloseTo(1, 12);
    expect(JSON.parse(String(run.result.outputs.branches))).toHaveLength(4);
    expect(run.result.validity).toContain('Nie obejmuje szumu');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(quantum?.realModels).toContain('quantum-teleportation');
  });

  it('runs bounded Kerr equatorial observables through Fabric without claiming full ray tracing', () => {
    const command = 'Oblicz Kerr dla spin = 0,7.';
    const run = runExperiment(parseScienceChatMessage(command));
    const repeated = runExperiment(parseScienceChatMessage(command));
    const spacetime = getKnowledgeDomain('spacetime-einstein');

    expect(run.request.modelId).toBe('einstein-kerr-equatorial');
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'einstein', experimentId: 'kerr-3d' });
    expect(Number(run.result.outputs.rPro)).toBeLessThan(Number(run.result.outputs.rRetro));
    expect(Number(run.result.outputs.frameDraggingGap)).toBeGreaterThan(0);
    expect(run.result.validity).toContain('Brak geodezyjnych poza równikiem');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(spacetime?.realModels).toContain('einstein-kerr-equatorial');
  });

  it('plans the bounded nuclide chart for backend Fabric while separating SEMF from measured catalog data', () => {
    const command = 'Pokaż mapę nuklidów dla protony = 26 neutrony = 30.';
    const request = parseScienceChatMessage(command);
    const reviewed = planEvidenceGuidedExperiment(request);
    const nuclear = getKnowledgeDomain('nuclear');

    expect(request.modelId).toBe('nuclear-nuclide-chart');
    expect(request.parameters).toEqual({ protonNumber: 26, neutronNumber: 30 });
    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(reviewed.plan.modelVersion).toBe('1.1.0');
    expect(reviewed.plan.route).toEqual({ kind: 'none' });
    expect(reviewed.disclosure.rationale).toContain('Brak wpisu katalogowego nie jest twierdzeniem o nieistnieniu');
    expect(nuclear?.realModels).toContain('nuclear-nuclide-chart');
  });

  it('runs bounded solar-system Kepler positions through Fabric without claiming a live ephemeris', () => {
    const command = 'Pokaż Układ Słoneczny przez 365,256 dni.';
    const run = runExperiment(parseScienceChatMessage(command));
    const repeated = runExperiment(parseScienceChatMessage(command));
    const universe = getKnowledgeDomain('universe');

    expect(run.request.modelId).toBe('universe-solar-system');
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'solar-system' });
    expect(Number(run.result.outputs.planetCount)).toBe(8);
    expect(Number(run.result.outputs.earthOrbits)).toBeCloseTo(1, 3);
    expect(JSON.parse(String(run.result.outputs.positions))).toHaveLength(8);
    expect(run.result.validity).toContain('efemerydalne');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(universe?.realModels).toContain('universe-solar-system');
  });

  it('runs bounded Minkowski 1+1D through Fabric without claiming acceleration or gravity', () => {
    const command = 'Pokaż diagram Minkowskiego przy beta = 0,5.';
    const run = runExperiment(parseScienceChatMessage(command));
    const repeated = runExperiment(parseScienceChatMessage(command));
    const spacetime = getKnowledgeDomain('spacetime-einstein');

    expect(run.request.modelId).toBe('spacetime-minkowski');
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'spacetime', experimentId: 'minkowski' });
    expect(Number(run.result.outputs.gamma)).toBeCloseTo(1 / Math.sqrt(1 - 0.5 ** 2), 12);
    expect(run.result.outputs.ordering).toBe('b-before-a');
    expect(Number(run.result.outputs.intervalSquared)).toBeLessThan(0);
    expect(run.result.validity).toContain('Bez przyspieszenia');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(spacetime?.realModels).toContain('spacetime-minkowski');
  });

  it('plans bounded VSEPR geometry for backend Fabric without claiming quantum chemistry', () => {
    const command = 'Pokaż geometrię cząsteczki VSEPR.';
    const request = parseScienceChatMessage(command);
    const reviewed = planEvidenceGuidedExperiment(request);
    const chemistry = getKnowledgeDomain('chemistry');

    expect(request.modelId).toBe('chem-vsepr');
    expect(request.parameters).toEqual({});
    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(reviewed.plan.modelVersion).toBe('1.1.0');
    expect(reviewed.plan.route).toEqual({ kind: 'none' });
    expect(reviewed.disclosure.rationale).toContain('Nie jest to obliczenie struktury elektronowej');
    expect(chemistry?.realModels).toContain('chem-vsepr');
  });

  it('runs bounded Minkowski light cone through Fabric without claiming acceleration dynamics', () => {
    const command = 'Pokaż stożek świetlny i paradoks bliźniąt.';
    const run = runExperiment(parseScienceChatMessage(command));
    const repeated = runExperiment(parseScienceChatMessage(command));
    const spacetime = getKnowledgeDomain('spacetime-einstein');

    expect(run.request.modelId).toBe('spacetime-light-cone');
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'spacetime', experimentId: 'lightcone-3d' });
    expect(Number(run.result.outputs.gamma)).toBeGreaterThan(1);
    expect(Number(run.result.outputs.travelerYears)).toBeLessThan(Number(run.result.outputs.tripYears));
    expect(run.result.validity).toContain('Brak dynamiki napędu');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(spacetime?.realModels).toContain('spacetime-light-cone');
  });

  it('runs bounded point gravitational lens through Fabric without claiming observational inference', () => {
    const command = 'Oblicz soczewkowanie grawitacyjne i pierścień Einsteina.';
    const run = runExperiment(parseScienceChatMessage(command));
    const repeated = runExperiment(parseScienceChatMessage(command));
    const spacetime = getKnowledgeDomain('spacetime-einstein');

    expect(run.request.modelId).toBe('einstein-point-lens');
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'einstein', experimentId: 'lensing' });
    expect(Number(run.result.outputs.totalMagnification)).toBeGreaterThan(1);
    expect(Number(run.result.outputs.thetaPlus)).toBeGreaterThan(0);
    expect(Number(run.result.outputs.thetaMinus)).toBeLessThan(0);
    expect(run.result.validity).toContain('Brak rozciągłej masy');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(spacetime?.realModels).toContain('einstein-point-lens');
  });

  it('plans bounded acid-base titration for backend Fabric without claiming a sample measurement', () => {
    const command = 'Oblicz miareczkowanie kwasowo-zasadowe NaOH.';
    const request = parseScienceChatMessage(command);
    const reviewed = planEvidenceGuidedExperiment(request);
    const chemistry = getKnowledgeDomain('chemistry');

    expect(request.modelId).toBe('chemistry-titration');
    expect(request.parameters).toEqual({});
    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(reviewed.plan.modelVersion).toBe('1.1.0');
    expect(reviewed.plan.route).toEqual({ kind: 'none' });
    expect(reviewed.disclosure.rationale).toContain('nie danymi jednego pomiaru');
    expect(chemistry?.realModels).toContain('chemistry-titration');
  });

  it('runs bounded Schwarzschild photon geodesic through Fabric without claiming Kerr or ray tracing', () => {
    const command = 'Zintegruj geodezyjną fotonu wokół czarnej dziury Schwarzschilda.';
    const run = runExperiment(parseScienceChatMessage(command));
    const repeated = runExperiment(parseScienceChatMessage(command));
    const spacetime = getKnowledgeDomain('spacetime-einstein');

    expect(run.request.modelId).toBe('einstein-schwarzschild-geodesic');
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'einstein', experimentId: 'geodesics' });
    expect(run.result.outputs.outcome).toBeTypeOf('string');
    expect(Number(run.result.outputs.criticalImpact)).toBeCloseTo((3 * Math.sqrt(3) / 2) * 26, 12);
    expect(run.result.validity).toContain('Brak Kerra');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(spacetime?.realModels).toContain('einstein-schwarzschild-geodesic');
  });

  it('plans analytic CHSH singlet correlation for backend Fabric without claiming a detector experiment', () => {
    const command = 'Oblicz korelację CHSH dla nierówności Bella.';
    const request = parseScienceChatMessage(command);
    const reviewed = planEvidenceGuidedExperiment(request);
    const quantum = getKnowledgeDomain('quantum');

    expect(request.modelId).toBe('quantum-chsh-correlation');
    expect(request.parameters).toEqual({});
    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(reviewed.plan.modelVersion).toBe('1.1.0');
    expect(reviewed.plan.route).toEqual({ kind: 'none' });
    expect(reviewed.disclosure.rationale).toContain('Nie są to dane z detektorów');
    expect(quantum?.realModels).toContain('quantum-chsh-correlation');
  });

  it('plans photon energy for the canonical backend ModelGraph without claiming material interaction', () => {
    const request = parseScienceChatMessage('Oblicz energię fotonu o długości fali 500 nm.');
    const reviewed = planEvidenceGuidedExperiment(request);

    expect(request.modelId).toBe('photon-energy');
    expect(request.parameters).toEqual({ wavelengthNm: 500 });
    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(reviewed.plan.modelVersion).toBe('1.1.0');
    expect(reviewed.plan.route).toEqual({ kind: 'none' });
    expect(reviewed.disclosure.rationale).toContain('nie jest pełnym solverem pola Maxwella');
  });

  it('runs bounded 1D split-step tunneling through Fabric without claiming a general Schrödinger solver', () => {
    const run = runExperiment(parseScienceChatMessage('Zasymuluj tunelowanie kwantowe.'));
    expect(run.request.modelId).toBe('quantum-tunneling-1d');
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'quantum', experimentId: 'tunneling' });
    expect(Number(run.result.outputs.transmission)).toBeGreaterThanOrEqual(0);
    expect(Number(run.result.outputs.reflection)).toBeGreaterThanOrEqual(0);
    expect(run.result.validity).toContain('nie jest ogólnym solverem Schrödingera');
  });

  it('plans a single-qubit Bloch circuit for the canonical backend Fabric without claiming hardware or entanglement', () => {
    const command = 'Wykonaj obwód kubitowy: H X.';
    const request = parseScienceChatMessage(command);
    const reviewed = planEvidenceGuidedExperiment(request);
    const quantum = getKnowledgeDomain('quantum');

    expect(quantum?.capability).toBe('CAPABILITY_SEAM');
    expect(quantum?.realModels).toContain('quantum-bloch-circuit');
    expect(quantum?.assumptions.join(' ')).toContain('nie losuje pomiaru');
    expect(request.modelId).toBe('quantum-bloch-circuit');
    expect(request.parameters).toEqual({ circuit: 'H X' });
    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(reviewed.plan.modelVersion).toBe('1.1.0');
    expect(reviewed.plan.route).toEqual({ kind: 'none' });
    expect(reviewed.disclosure.rationale).toContain('nie symuluje splątania');
  });

  it('plans the bounded Kitaev bulk model for canonical backend execution but never routes a Majorana 1 device to it', () => {
    const topological = planEvidenceGuidedExperiment(parseScienceChatMessage('Zasymuluj łańcuch Kitaeva mu=0 t=1 delta=1.'));
    const critical = planEvidenceGuidedExperiment(parseScienceChatMessage('Zasymuluj łańcuch Kitaeva mu=2 t=1 delta=1.'));
    const majoranaDevice = runExperiment(parseScienceChatMessage('Zasymuluj urządzenie Majorana 1.'));

    expect(topological.request.modelId).toBe('quantum-kitaev-bulk');
    expect(topological.request.parameters).toEqual({ chemicalPotential: 0, hopping: 1, pairing: 1 });
    expect(topological.status).toBe('READY_FOR_CONFIRMATION');
    expect(topological.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(topological.plan.modelVersion).toBe('1.1.0');
    expect(topological.plan.route).toEqual({ kind: 'none' });
    expect(topological.disclosure.rationale).toContain('nie jest symulacją nanodrutu');

    expect(critical.request.parameters).toEqual({ chemicalPotential: 2, hopping: 1, pairing: 1 });
    expect(critical.status).toBe('READY_FOR_CONFIRMATION');
    expect(critical.disclosure.rationale).toContain('urządzenia Majorana 1');

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

  it('runs the existing galaxy rotation-curve model through Fabric without claiming a CDM versus MOND verdict', () => {
    const command = 'Porównaj krzywą rotacji galaktyki MOND.';
    const run = runExperiment(parseScienceChatMessage(command));
    const repeated = runExperiment(parseScienceChatMessage(command));
    const rejected = runExperiment(parseScienceChatMessage('Oblicz krzywą rotacji z halo=300 km/s.'));
    const universe = getKnowledgeDomain('universe');

    expect(universe?.realModels).toContain('universe-rotation-curve');
    expect(universe?.assumptions.join(' ')).toContain('halo pseudo-izotermicznym');
    expect(run.request.modelId).toBe('universe-rotation-curve');
    expect(run.request.parameters).toEqual({ altGravity: true });
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'rotationcurve' });
    expect(run.result.outputs.altGravity).toBe(true);
    expect(Number(run.result.outputs.modeledVelocityKmS)).toBeGreaterThan(0);
    expect(run.result.validity).toContain('Brak dopasowania danych');
    expect(run.result.warnings[0]).toContain('nie rozstrzyga CDM kontra MOND');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(rejected.result.status).toBe('rejected');
    expect(rejected.result.summary).toContain('poza zakresem 0–220 km/s');
  });

  it('runs the existing reproducible galaxy-collision model through Fabric without claiming a full N-body merger', () => {
    const command = 'Zasymuluj zderzenie galaktyk: stosunek mas=1.25, przeciwbieżne, 24 mln lat.';
    const run = runExperiment(parseScienceChatMessage(command));
    const repeated = runExperiment(parseScienceChatMessage(command));
    const rejected = runExperiment(parseScienceChatMessage('Zasymuluj zderzenie galaktyk: stosunek mas=3, 24 mln lat.'));
    const universe = getKnowledgeDomain('universe');

    expect(universe?.realModels).toContain('universe-galaxy-collision');
    expect(universe?.assumptions.join(' ')).toContain('Toomre–Toomre');
    expect(run.request.modelId).toBe('universe-galaxy-collision');
    expect(run.request.parameters).toEqual({ ratio: 1.25, retro: true, horizonMyr: 24 });
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'collision' });
    expect(Number(run.result.outputs.starCount)).toBe(900 + Math.round(900 * 1.25));
    expect(Number(run.result.outputs.minCoreSeparationSceneUnits)).toBeGreaterThan(0);
    expect(run.result.validity).toContain('Nie jest to pełny N-body');
    expect(run.result.warnings[0]).toContain('nie modeluje gazu');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(rejected.result.status).toBe('rejected');
    expect(rejected.result.summary).toContain('poza zakresem 0.25–2');
  });

  it('runs the existing stellar-scaling model through Fabric without claiming a full stellar-evolution solver', () => {
    const command = 'Pokaż życie gwiazdy o masie 10 masy Słońca.';
    const run = runExperiment(parseScienceChatMessage(command));
    const repeated = runExperiment(parseScienceChatMessage(command));
    const rejected = runExperiment(parseScienceChatMessage('Pokaż życie gwiazdy o masie 60 masy Słońca.'));
    const universe = getKnowledgeDomain('universe');

    expect(universe?.realModels).toContain('universe-starlife');
    expect(universe?.assumptions.join(' ')).toContain('t_MS ∝ M⁻²·⁵');
    expect(run.request.modelId).toBe('universe-starlife');
    expect(run.request.parameters).toEqual({ massSolar: 10 });
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'starlife' });
    expect(Number(run.result.outputs.relativeLuminositySolar)).toBeCloseTo(Math.pow(10, 3.5));
    expect(Number(run.result.outputs.mainSequenceLifetimeGyr)).toBeCloseTo(10 * Math.pow(10, -2.5));
    expect(run.result.outputs.finalFate).toBe('neutron-star');
    expect(run.result.validity).toContain('bez integracji wnętrza');
    expect(run.result.warnings[0]).toContain('uproszczonych progów');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(rejected.result.status).toBe('rejected');
    expect(rejected.result.summary).toContain('poza zakresem 0.2–40 M☉');
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

  it('extends the existing chirp adapter with bounded early-inspiral observables', () => {
    const command = 'Oblicz falę grawitacyjną chirp: m1=36, m2=29.';
    const request = parseScienceChatMessage(command);
    const run = runExperiment(request);
    const repeated = runExperiment(parseScienceChatMessage(command));
    const rejected = runExperiment(parseScienceChatMessage('Oblicz falę grawitacyjną chirp: m1=1000, m2=1000.'));

    expect(request.modelId).toBe('einstein-chirp-mass');
    expect(request.parameters).toEqual({ m1Solar: 36, m2Solar: 29 });
    expect(run.result.status).toBe('completed');
    expect(Number(run.result.outputs.timeToIscoSeconds)).toBeGreaterThan(0);
    expect(Number(run.result.outputs.midInspiralFrequencyHz)).toBeGreaterThan(Number(run.result.outputs.startFrequencyHz));
    expect(Number(run.result.outputs.midInspiralFrequencyHz)).toBeLessThan(Number(run.result.outputs.iscoFrequencyHz));
    expect(Number(run.result.outputs.iscoSeparationMeters)).toBeLessThan(Number(run.result.outputs.startSeparationMeters));
    expect(run.result.validity).toContain('Nie jest dopasowaniem danych LIGO');
    expect(run.provenance.resultOrigin).toBe('real-engine');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(rejected.result.status).toBe('rejected');
    expect(rejected.result.summary).toContain('poza zakresem wczesnego inspiralu');
  });

  it('routes a bounded c-Slider thought experiment through the real graph with provenance', () => {
    const command = 'Uruchom c-Slider: v=240000000 m/s, c=300000000 m/s, dystans=300000 km.';
    const request = parseScienceChatMessage(command);
    const run = runExperiment(request);
    const repeated = runExperiment(parseScienceChatMessage(command));
    const rejected = runExperiment(parseScienceChatMessage('Uruchom c-Slider: v=300000000 m/s, c=200000000 m/s.'));
    const spacetime = getKnowledgeDomain('spacetime-einstein');

    expect(request.modelId).toBe('spacetime-c-slider');
    expect(request.parameters).toEqual({ velocityMs: 240000000, lightSpeedMs: 300000000, distanceKm: 300000 });
    expect(run.result.status).toBe('completed');
    expect(run.result.outputs.betaFraction).toBeCloseTo(0.8, 12);
    expect(run.result.outputs.lightTravelTimeSeconds).toBeCloseTo(1, 12);
    expect(run.result.validity).toContain('hipotetycznej wartości c');
    expect(run.provenance.resultOrigin).toBe('real-engine');
    expect(run.provenance.knowledgeSources).toContain('spacetime-einstein.md');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(spacetime?.realModels).toContain('spacetime-c-slider');
    expect(spacetime?.assumptions.join(' ')).toContain('eksperymentem myślowym');
    expect(rejected.result.status).toBe('rejected');
    expect(rejected.result.summary).toContain('v≥c');
  });

  it('routes exact tesseract geometry without claiming physical extra dimensions', () => {
    const command = 'Obróć tesserakt: XW=45, YZ=30, podwójna rotacja.';
    const request = parseScienceChatMessage(command);
    const run = runExperiment(request);
    const repeated = runExperiment(parseScienceChatMessage(command));
    const mathematics = getKnowledgeDomain('mathematics');

    expect(request.modelId).toBe('math-tesseract-4d');
    expect(request.parameters).toEqual({ angleXWDeg: 45, angleYZDeg: 30, doubleRotation: true });
    expect(run.result.status).toBe('completed');
    expect(run.result.outputs.vertexCount).toBe(16);
    expect(run.result.outputs.edgeCount).toBe(32);
    expect(JSON.parse(String(run.result.outputs.projectedVerticesJson))).toHaveLength(16);
    expect(run.result.validity).toContain('nie opisuje obiektu fizycznego');
    expect(run.provenance.resultOrigin).toBe('real-engine');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(mathematics?.realModels).toContain('math-tesseract-4d');
    expect(mathematics?.assumptions.join(' ')).toContain('nie stanowi twierdzenia');
  });

  it('routes the bounded seeded HP folding model through Fabric without claiming a real protein structure', () => {
    const command = 'Uruchom model HP fałdowania białka: temperatura=0.5, kroki MC=20000, seed=99.';
    const request = parseScienceChatMessage(command);
    const run = runExperiment(request);
    const repeated = runExperiment(parseScienceChatMessage(command));
    const rejected = runExperiment(parseScienceChatMessage('Uruchom model HP fałdowania białka: kroki MC=99999, seed=99.'));
    const biology = getKnowledgeDomain('biology');

    expect(request.modelId).toBe('biology-protein-folding-hp');
    expect(request.parameters).toEqual({ temperature: 0.5, steps: 20000, seed: 99 });
    expect(run.result.status).toBe('completed');
    expect(run.result.outputs.initialEnergy).toBe(0);
    expect(Number(run.result.outputs.bestEnergy)).toBeLessThanOrEqual(0);
    expect(Number(run.result.outputs.acceptanceRate)).toBeGreaterThanOrEqual(0);
    expect(run.result.validity).toContain('nie jest predykcją struktury');
    expect(run.provenance.resultOrigin).toBe('real-engine');
    expect(run.provenance.knowledgeSources).toContain('biology.md');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(biology?.realModels).toContain('biology-protein-folding-hp');
    expect(biology?.assumptions.join(' ')).toContain('minimum lokalnym');
    expect(rejected.result.status).toBe('rejected');
    expect(rejected.result.summary).toContain('poza zakresem');
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
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'engineering', experimentId: 'pump-pipe' });
    expect(run.provenance.engine).toBe('genesis-engineering-graph@1.0.0');
  });

  it('plans molecular weight for canonical backend Fabric without claiming a structural chemistry parser', () => {
    const request = parseScienceChatMessage('Oblicz masę molową wzór H2O.');
    const reviewed = planEvidenceGuidedExperiment(request);

    expect(request.modelId).toBe('chem-molecular-weight');
    expect(request.parameters).toEqual({ formula: 'H2O' });
    expect(reviewed.status).toBe('READY_FOR_CONFIRMATION');
    expect(reviewed.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(reviewed.plan.modelVersion).toBe('1.0.0');
    expect(reviewed.plan.route).toEqual({ kind: 'none' });
    expect(reviewed.disclosure.rationale).toContain('nie jest pełnym parserem struktury chemicznej');
  });

  it.each([
    ['Oblicz energię wiązania jądra protony=26 neutrony=30.', 'nuclear-semf', 'bindingEnergy'],
    ['Oblicz dylatację czasu dla beta=0.8.', 'sr-lorentz', 'lorentzGammaFactor'],
    ['Oblicz ucieczkę atmosfery planety.', 'universe-atmospheric-escape', 'jeansParameter'],
    ['Oblicz energię relatywistyczną cząstki beta=0.8.', 'particle-relativistic-energy', 'totalEnergyMeV'],
    ['Oblicz kinetykę Arrheniusa przy 350 K i 60 kJ/mol.', 'chemistry-arrhenius', 'rateConstant'],
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

  it('runs the existing seeded Ising Metropolis model through Fabric without claiming thermodynamic convergence', () => {
    const command = 'Uruchom model Isinga T=1.8, seed=42.';
    const run = runExperiment(parseScienceChatMessage(command));
    const repeated = runExperiment(parseScienceChatMessage(command));
    const rejected = runExperiment(parseScienceChatMessage('Uruchom model Isinga T=6.'));
    const chemistry = getKnowledgeDomain('chemistry');

    expect(chemistry?.realModels).toContain('chemistry-ising');
    expect(chemistry?.assumptions.join(' ')).toContain('seedowanego Metropolisa');
    expect(run.request.modelId).toBe('chemistry-ising');
    expect(run.request.parameters).toEqual({ seed: 42, temperature: 1.8 });
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'lab', labId: 'chemistry', experimentId: 'ising' });
    expect(run.result.outputs.seed).toBe(42);
    expect(run.result.outputs.latticeSize).toBe(42);
    expect(Number(run.result.outputs.exactMagnetization)).toBeGreaterThan(0);
    expect(run.result.validity).toContain('granicy termodynamicznej');
    expect(run.result.warnings[0]).toContain('nie są oszacowaniem niepewności');
    expect(run.provenance.runFingerprint).toBe(repeated.provenance.runFingerprint);
    expect(rejected.result.status).toBe('rejected');
    expect(rejected.result.summary).toContain('poza zakresem 0.5–5');
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

    it('runs bounded tunnelling but never fabricates an urban hazard cascade', () => {
    const quantum = runExperiment(parseScienceChatMessage('Zasymuluj tunelowanie kwantowe.'));
    expect(quantum.result.status).toBe('completed');
    expect(quantum.result.outputs.transmission).toBeTypeOf('number');
    expect(quantum.result.validity).toContain('nie jest ogólnym solverem Schrödingera');
    const flood = runExperiment(parseScienceChatMessage('Zasymuluj kaskadę: powódź → infrastruktura → epidemia.'));
    expect(flood.result.status).toBe('engine_not_available');
    expect(flood.result.outputs).toEqual({});
    expect(flood.result.summary).toContain('Wymagany solver');
  });
  it('routes a bounded RDKit descriptor request to a confirmable real backend plan without fabricating a local molecular result', () => {
    const request = parseScienceChatMessage('Uruchom RDKit deskryptory SMILES: CCO.');
    const planned = planEvidenceGuidedExperiment(request);
    expect(request.modelId).toBe('chem-rdkit-descriptors');
    expect(request.domainId).toBe('chemistry');
    expect(request.parameters).toEqual({ smiles: 'CCO.' });
    expect(planned.plan.engine).toBe('rdkit@2026.03.5');
    expect(planned.plan.runnable).toBe(true);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(planned.disclosure.resultWillComeFromRealRun).toBe(true);
    expect(planned.disclosure.limitations.join(' ')).toContain('Nie jest to QSAR');
    const localAttempt = runExperiment(request);
    expect(localAttempt.result.status).not.toBe('completed');
    expect(localAttempt.result.outputs).toEqual({});
  });

  it('routes an explicit PySCF H2 RHF request to a confirmable real backend plan without fabricating a local quantum result', () => {
    const request = parseScienceChatMessage('Uruchom PySCF RHF dla H2; długość wiązania 0.74 Å.');
    const planned = planEvidenceGuidedExperiment(request);
    expect(request.modelId).toBe('quantum-chemistry-pyscf-h2-rhf');
    expect(request.domainId).toBe('quantum-chemistry');
    expect(request.parameters).toEqual({ bondLengthAngstrom: 0.74 });
    expect(planned.plan.engine).toBe('pyscf@2.13.0');
    expect(planned.plan.runnable).toBe(true);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(planned.disclosure.resultWillComeFromRealRun).toBe(true);
    expect(planned.disclosure.limitations.join(' ')).toContain('Nie jest to optymalizacja geometrii');
    const localAttempt = runExperiment(request);
    expect(localAttempt.result.status).not.toBe('completed');
    expect(localAttempt.result.outputs).toEqual({});
  });

  it('confirms Epidemic through the existing model and hands the same world reference to the high-fidelity 3D renderer', () => {
    clearExperimentWorldHandoffs();
    const request = parseScienceChatMessage('Zasymuluj epidemię z R0=5 przez 10 dni seed=12.');
    const planned = planEvidenceGuidedExperiment(request);
    expect(request.modelId).toBe('epidemic-city');
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.plan.route).toEqual({ kind: 'live-world', target: 'epidemic-city', hash: '#/city3d' });
    const confirmed = confirmEvidenceGuidedExperiment(planned);
    expect(confirmed.run.result.status).toBe('completed');
    expect(confirmed.run.result.route).toEqual(planned.plan.route);
    expect(confirmed.run.result.outputs).toMatchObject({ S: expect.any(Number), I: expect.any(Number), R: expect.any(Number) });
    expect(confirmed.handoff.evidencePack.status).toBe('PROTOCOL_REQUIRED');
    expect(confirmed.handoff.counterfactual.status).toBe('VARIANT_REQUIRED');
    expect(setPendingExperimentWorld(confirmed.run.runId)).toBe(true);
    const handoff = consumePendingExperimentWorld();
    expect(handoff?.runId).toBe(confirmed.run.runId);
    expect(handoff?.modelId).toBe('epidemic-city');
    expect(handoff?.simulation.stats()).toEqual(confirmed.run.result.outputs);
    expect(consumePendingExperimentWorld()).toBeNull();
    clearExperimentWorldHandoffs();
  });

  it('keeps unsupported time-travel claims outside the real solver path', () => {
    const request = parseScienceChatMessage('Zbuduj fizyczny wehikuł czasu do podróży w przeszłość.');
    expect(request.modelId).toBeUndefined();
    expect(request.domainId).toBe('unknown');
    const run = runExperiment(request);
    expect(run.result.status).not.toBe('completed');
    expect(run.result.outputs).toEqual({});
  });

  it('routes a bounded Minkowski request through Science Chat and the existing deterministic Fabric executor', () => {
    const request = parseScienceChatMessage('Pokaż diagram Minkowskiego beta=0.5.');
    expect(request.domainId).toBe('spacetime-einstein');
    expect(request.modelId).toBe('spacetime-minkowski');
    expect(request.parameters).toEqual({ beta: 0.5 });
    const planned = planEvidenceGuidedExperiment(request);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.plan.route).toEqual({ kind: 'lab', labId: 'spacetime', experimentId: 'minkowski' });
    const run = runExperiment(request);
    expect(run.result.status).toBe('completed');
    expect(run.result.outputs.beta).toBe(0.5);
    expect(run.result.outputs.gamma).toBeCloseTo(1.154700538, 8);
    expect(run.result.outputs.ordering).toBe('b-before-a');
    expect(run.result.warnings.join(' ')).toContain('dwóch ustalonych zdarzeń');
  });

  it('routes and confirms bounded galaxy rotation curve through the existing guided lab flow', () => {
    const request = parseScienceChatMessage('Porównaj krzywą rotacji galaktyki MOND.');
    const planned = planEvidenceGuidedExperiment(request);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.disclosure.capability).toBe('REAL_ENGINE');
    expect(planned.plan.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'rotationcurve' });
    const confirmed = confirmEvidenceGuidedExperiment(planned);
    expect(confirmed.run.result.status).toBe('completed');
    expect(confirmed.run.result.outputs.altGravity).toBe(true);
    expect(Number(confirmed.run.result.outputs.modeledVelocityKmS)).toBeGreaterThan(0);
    expect(confirmed.run.result.validity).toContain('Brak dopasowania danych');
    const capsule = capsuleFromConfirmedExperiment(confirmed);
    expect(capsule.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'rotationcurve' });
    expect(capsule.evidencePack.status).toBe('PROTOCOL_REQUIRED');
    expect(capsule.counterfactual.status).toBe('VARIANT_REQUIRED');
  });

  it('routes and confirms bounded galaxy collision through the existing guided lab flow', () => {
    const request = parseScienceChatMessage('Pokaż zderzenie galaktyk: stosunek mas=1.25, 24 mln lat.');
    const planned = planEvidenceGuidedExperiment(request);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.disclosure.capability).toBe('REAL_ENGINE');
    expect(planned.plan.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'collision' });
    const confirmed = confirmEvidenceGuidedExperiment(planned);
    expect(confirmed.run.result.status).toBe('completed');
    expect(Number(confirmed.run.result.outputs.starCount)).toBe(900 + Math.round(900 * 1.25));
    expect(confirmed.run.result.validity).toContain('Nie jest to pełny N-body');
    const capsule = capsuleFromConfirmedExperiment(confirmed);
    expect(capsule.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'collision' });
    expect(capsule.evidencePack.status).toBe('PROTOCOL_REQUIRED');
    expect(capsule.counterfactual.status).toBe('VARIANT_REQUIRED');
  });

  it('routes and confirms bounded tesseract geometry through the existing guided lab flow', () => {
    const request = parseScienceChatMessage('Obróć tesserakt: XW=45, YZ=30, podwójna rotacja.');
    const planned = planEvidenceGuidedExperiment(request);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.disclosure.capability).toBe('REAL_ENGINE');
    expect(planned.plan.route).toEqual({ kind: 'lab', labId: 'multiverse', experimentId: 'tesseract' });
    const confirmed = confirmEvidenceGuidedExperiment(planned);
    expect(confirmed.run.result.status).toBe('completed');
    expect(confirmed.run.result.outputs.vertexCount).toBe(16);
    expect(confirmed.run.result.outputs.edgeCount).toBe(32);
    expect(confirmed.run.result.validity).toContain('nie opisuje obiektu fizycznego');
    const capsule = capsuleFromConfirmedExperiment(confirmed);
    expect(capsule.route).toEqual({ kind: 'lab', labId: 'multiverse', experimentId: 'tesseract' });
    expect(capsule.evidencePack.status).toBe('PROTOCOL_REQUIRED');
    expect(capsule.counterfactual.status).toBe('VARIANT_REQUIRED');
  });

  it('routes and confirms bounded stellar scaling through the existing guided lab flow', () => {
    const request = parseScienceChatMessage('Pokaż życie gwiazdy o masie 10 masy Słońca.');
    const planned = planEvidenceGuidedExperiment(request);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.disclosure.capability).toBe('REAL_ENGINE');
    expect(planned.plan.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'starlife' });
    const confirmed = confirmEvidenceGuidedExperiment(planned);
    expect(confirmed.run.result.status).toBe('completed');
    expect(Number(confirmed.run.result.outputs.relativeLuminositySolar)).toBeCloseTo(Math.pow(10, 3.5));
    expect(confirmed.run.result.validity).toContain('bez integracji wnętrza');
    const capsule = capsuleFromConfirmedExperiment(confirmed);
    expect(capsule.route).toEqual({ kind: 'lab', labId: 'universe', experimentId: 'starlife' });
    expect(capsule.evidencePack.status).toBe('PROTOCOL_REQUIRED');
    expect(capsule.counterfactual.status).toBe('VARIANT_REQUIRED');
  });

  it('routes and confirms bounded particle energy through the existing guided lab flow', () => {
    const request = parseScienceChatMessage('Oblicz energię relatywistyczną cząstki beta=0.8.');
    const planned = planEvidenceGuidedExperiment(request);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.disclosure.capability).toBe('REAL_ENGINE');
    expect(planned.plan.route).toEqual({ kind: 'lab', labId: 'particle' });
    const confirmed = confirmEvidenceGuidedExperiment(planned);
    expect(confirmed.run.result.status).toBe('completed');
    expect(Number(confirmed.run.result.outputs.lorentzGammaFactor)).toBeCloseTo(1 / Math.sqrt(1 - 0.8 ** 2), 12);
    expect(Number(confirmed.run.result.outputs.totalEnergyMeV)).toBeGreaterThan(0);
    expect(confirmed.run.result.validity).toContain('Cząstka swobodna w próżni');
    const capsule = capsuleFromConfirmedExperiment(confirmed);
    expect(capsule.route).toEqual({ kind: 'lab', labId: 'particle' });
    expect(capsule.evidencePack.status).toBe('PROTOCOL_REQUIRED');
    expect(capsule.counterfactual.status).toBe('VARIANT_REQUIRED');
  });

  it('routes and confirms the bounded c-Slider through the existing guided lab flow', () => {
    const request = parseScienceChatMessage('Uruchom c-Slider: v=240000000 m/s, c=300000000 m/s, dystans=300000 km.');
    const planned = planEvidenceGuidedExperiment(request);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.disclosure.capability).toBe('REAL_ENGINE');
    expect(planned.plan.route).toEqual({ kind: 'lab', labId: 'spacetime', experimentId: 'c-slider' });
    const confirmed = confirmEvidenceGuidedExperiment(planned);
    expect(confirmed.run.result.status).toBe('completed');
    expect(Number(confirmed.run.result.outputs.betaFraction)).toBeCloseTo(0.8, 12);
    expect(Number(confirmed.run.result.outputs.lightTravelTimeSeconds)).toBeCloseTo(1, 12);
    expect(confirmed.run.result.validity).toContain('hipotetycznej wartości c');
    const capsule = capsuleFromConfirmedExperiment(confirmed);
    expect(capsule.route).toEqual({ kind: 'lab', labId: 'spacetime', experimentId: 'c-slider' });
    expect(capsule.evidencePack.status).toBe('PROTOCOL_REQUIRED');
    expect(capsule.counterfactual.status).toBe('VARIANT_REQUIRED');
  });

  it('routes and confirms the analytical Schwarzschild radius through the existing guided lab flow', () => {
    const request = parseScienceChatMessage('Oblicz promień Schwarzschilda dla 2 masy Słońca.');
    const planned = planEvidenceGuidedExperiment(request);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.disclosure.capability).toBe('REAL_ENGINE');
    expect(planned.plan.route).toEqual({ kind: 'lab', labId: 'einstein' });
    const confirmed = confirmEvidenceGuidedExperiment(planned);
    expect(confirmed.run.result.status).toBe('completed');
    expect(Number(confirmed.run.result.outputs.radiusKm)).toBeCloseTo(5.94, 1);
    expect(confirmed.run.result.validity).toContain('Metryka Schwarzschilda');
    const capsule = capsuleFromConfirmedExperiment(confirmed);
    expect(capsule.route).toEqual({ kind: 'lab', labId: 'einstein' });
    expect(capsule.evidencePack.status).toBe('PROTOCOL_REQUIRED');
    expect(capsule.counterfactual.status).toBe('VARIANT_REQUIRED');
  });

  it('routes and confirms the bounded Schwarzschild geodesic through the existing guided lab flow', () => {
    const request = parseScienceChatMessage('Zintegruj geodezyjną fotonu wokół czarnej dziury Schwarzschilda.');
    const planned = planEvidenceGuidedExperiment(request);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.disclosure.capability).toBe('REAL_ENGINE');
    expect(planned.plan.route).toEqual({ kind: 'lab', labId: 'einstein', experimentId: 'geodesics' });
    const confirmed = confirmEvidenceGuidedExperiment(planned);
    expect(confirmed.run.result.status).toBe('completed');
    expect(confirmed.run.result.outputs.outcome).toBeTypeOf('string');
    expect(Number(confirmed.run.result.outputs.criticalImpact)).toBeCloseTo((3 * Math.sqrt(3) / 2) * 26, 12);
    expect(confirmed.run.result.validity).toContain('Brak Kerra');
    const capsule = capsuleFromConfirmedExperiment(confirmed);
    expect(capsule.route).toEqual({ kind: 'lab', labId: 'einstein', experimentId: 'geodesics' });
    expect(capsule.evidencePack.status).toBe('PROTOCOL_REQUIRED');
    expect(capsule.counterfactual.status).toBe('VARIANT_REQUIRED');
  });

  it('routes and confirms the Earthquake Chat request through the existing envelope with honest replay and damage limits', async () => {
    const request = parseScienceChatMessage('Uruchom trzęsienie ziemi magnitude=5.4 depth=12 km seed=42.');
    expect(request.domainId).toBe('hazard-earthquake');
    expect(request.modelId).toBe('earthquake-scenario');
    const planned = planEvidenceGuidedExperiment(request);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.plan.route).toEqual({ kind: 'live-world', target: 'epidemic-city', hash: '#/city3d' });
    const confirmed = await confirmEarthquakeEvidenceGuidedExperiment(planned);
    expect(confirmed.run.result.status).toBe('completed');
    expect(confirmed.run.result.outputs.replayStatus).toBe('MATCH');
    expect(confirmed.run.result.outputs.datasetStatus).toBe('SCENARIO');
    expect(confirmed.run.result.outputs.structuralDamage).toBe('NOT_MODELED');
    expect(confirmed.run.result.outputs.impactCount).toBeGreaterThan(0);
    expect(confirmed.run.result.outputs.damageAssessmentCount).toBeGreaterThan(0);
  });
  it('routes a Maxwell/FDTD dielectric-interface request to a confirmable real backend PyMeep plan without fabricating local browser output', () => {
    const request = parseScienceChatMessage('Uruchom Meep FDTD dla granicy dielektrycznej n1=1 n2=2.');
    const planned = planEvidenceGuidedExperiment(request);
    expect(request.modelId).toBe('electrodynamics-maxwell-fdtd');
    expect(request.domainId).toBe('electrodynamics');
    expect(planned.plan.engine).toBe('pymeep-fdtd@1.34.0');
    expect(planned.plan.runnable).toBe(true);
    expect(planned.status).toBe('READY_FOR_CONFIRMATION');
    expect(planned.disclosure.capability).toBe('BACKEND_REAL_ENGINE');
    expect(planned.disclosure.resultWillComeFromRealRun).toBe(true);
    expect(planned.disclosure.limitations.join(' ')).toContain('backendowy adapter PyMeep');
  });
});
