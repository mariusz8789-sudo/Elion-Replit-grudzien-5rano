import { FailClosedError, type BackendAvailability, type BackendKind, type ExperimentDefinition, type ModelCard } from './contracts';

/**
 * Backend availability detection — fail-closed by construction (item 7 of
 * the mandate: "Nie implementuj jeszcze PYTHIA/Geant4 — mają pozostać
 * fail-closed adapter contracts, dopóki nie ma realnych backendów").
 *
 * PYTHIA_ADAPTER / GEANT4_ADAPTER / EXTERNAL_MATTER are ALWAYS reported
 * unavailable here. There is no subprocess detection, no environment probe,
 * and no code path that could ever report one of them available — wiring a
 * real detector (e.g. `pythia8-config --version`) is future work, explicitly
 * out of scope for this integration pass. Until that exists, any experiment
 * that needs one of these backends fails closed with ADAPTER_UNAVAILABLE.
 */
export function detectBackends(): Readonly<Record<BackendKind, BackendAvailability>> {
  return {
    NATIVE_TOY: {
      kind: 'NATIVE_TOY',
      available: true,
      reason: 'toy models: pipeline-validation only, never production physics evidence',
    },
    PYTHIA_ADAPTER: {
      kind: 'PYTHIA_ADAPTER',
      available: false,
      reason: 'NOT_IMPLEMENTED: no PYTHIA adapter exists in this repo — fail-closed contract only',
    },
    GEANT4_ADAPTER: {
      kind: 'GEANT4_ADAPTER',
      available: false,
      reason: 'NOT_IMPLEMENTED: no Geant4 adapter exists in this repo — fail-closed contract only',
    },
    EXTERNAL_MATTER: {
      kind: 'EXTERNAL_MATTER',
      available: false,
      reason: 'NOT_IMPLEMENTED: no external matter-engine adapter exists in this repo — fail-closed contract only',
    },
  };
}

/**
 * Throws (never falls back to the toy model) unless the experiment's
 * backend requirement is genuinely satisfied:
 *  - an explicit `backendRequest` for an unavailable backend ⇒ ADAPTER_UNAVAILABLE, no toy substitute.
 *  - a toy `ModelCard` without `def.toyAccepted === true` ⇒ TOY_NOT_ACCEPTED (pipeline-validation must be opted into explicitly).
 *  - a non-toy card whose own declared backend is unavailable ⇒ ADAPTER_UNAVAILABLE.
 */
export function requireBackend(card: ModelCard, def: ExperimentDefinition): void {
  const avail = detectBackends();

  if (def.backendRequest !== undefined) {
    const a = avail[def.backendRequest];
    if (!a.available) {
      throw new FailClosedError(`requested backend '${def.backendRequest}' unavailable: ${a.reason} — NO fallback to toy`, 'ADAPTER_UNAVAILABLE');
    }
    return;
  }

  if (card.toy) {
    if (def.toyAccepted !== true) {
      throw new FailClosedError(`toy model '${card.modelId}' requires explicit def.toyAccepted=true (pipeline-validation ONLY)`, 'TOY_NOT_ACCEPTED');
    }
    return;
  }

  const a = avail[card.backend];
  if (!a.available) {
    throw new FailClosedError(`backend '${card.backend}' unavailable: ${a.reason}`, 'ADAPTER_UNAVAILABLE');
  }
}
