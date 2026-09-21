/**
 * D-110 — the pure (no network I/O) ClinicalTrials.gov API v2 study ->
 * narrow A2TrialRecord transform, extracted out of
 * `fetch-a2-ozempic-substitute-fixture.mjs` so it has exactly ONE
 * implementation. `fetch-a2-ozempic-substitute-fixture.mjs` (the original
 * live full-refetch) and `ingest-a2-trial-evidence.mjs` (D-110's
 * single-record external-evidence path) both call `narrowTrialDetail`
 * instead of each carrying their own copy — the same "no second engine"
 * discipline this repo applies everywhere else (see `activityQsarV2.mjs`'s
 * header, D-088).
 */

export function narrowOutcome(o) {
  return {
    title: o.title,
    type: o.type,
    paramType: o.paramType ?? null,
    dispersionType: o.dispersionType ?? null,
    unitOfMeasure: o.unitOfMeasure ?? null,
    groups: (o.groups ?? []).map((g) => ({ id: g.id, title: g.title })),
    denoms: o.denoms ?? [],
    classes: (o.classes ?? []).slice(0, 1),
  };
}

export function narrowEvent(e) {
  return {
    term: e.term,
    organSystem: e.organSystem ?? null,
    stats: (e.stats ?? []).map((s) => ({ groupId: s.groupId, numEvents: s.numEvents ?? null, numAffected: s.numAffected ?? null, numAtRisk: s.numAtRisk ?? null })),
  };
}

/** Narrows one already-fetched ClinicalTrials.gov API v2 study JSON object into the exact shape `a2OzempicSubstitute.ts`'s `A2TrialRecord` expects. No network access, no side effects. */
export function narrowTrialDetail(json) {
  const identification = json.protocolSection?.identificationModule ?? {};
  const arms = json.protocolSection?.armsInterventionsModule?.armGroups ?? [];
  const outcomes = json.resultsSection?.outcomeMeasuresModule?.outcomeMeasures ?? [];
  const hba1cOutcomes = outcomes.filter((o) => /hba1c|glycated haemoglobin|glycosylated hemoglobin/i.test(o.title ?? ''));
  const weightOutcomes = outcomes.filter((o) => /body weight|weight loss|change in weight/i.test(o.title ?? ''));
  const aem = json.resultsSection?.adverseEventsModule;
  return {
    nctId: identification.nctId,
    briefTitle: identification.briefTitle,
    arms: arms.map((a) => ({ label: a.label, type: a.type })),
    hba1cOutcomes: hba1cOutcomes.map(narrowOutcome),
    weightOutcomes: weightOutcomes.map(narrowOutcome),
    adverseEvents: aem === undefined ? null : {
      frequencyThreshold: aem.frequencyThreshold ?? null,
      eventGroups: (aem.eventGroups ?? []).map((g) => ({ id: g.id, title: g.title, deathsNumAffected: g.deathsNumAffected ?? null, seriousNumAffected: g.seriousNumAffected ?? null, seriousNumAtRisk: g.seriousNumAtRisk ?? null, otherNumAffected: g.otherNumAffected ?? null, otherNumAtRisk: g.otherNumAtRisk ?? null })),
      seriousEvents: (aem.seriousEvents ?? []).map(narrowEvent),
      otherEvents: (aem.otherEvents ?? []).map(narrowEvent),
    },
  };
}
