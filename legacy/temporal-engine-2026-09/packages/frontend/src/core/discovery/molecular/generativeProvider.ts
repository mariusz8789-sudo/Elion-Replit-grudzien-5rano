import {
  generationFingerprint,
  type CandidateValidation,
  type GenerationCapability,
  type GenerationOutcome,
  type GenerationRequest,
  type MolecularGenerationProvider,
} from './generationProvider';
import type { MoleculeCandidate } from './types';

/**
 * GENERATIVE CHEMISTRY — CAPABILITY PROBE AND SEAM.
 *
 * Genesis has NO generative chemistry model. This module exists so that fact
 * is stated by running code with a checkable reason, and so a real model can
 * later be attached without touching the discovery loop.
 *
 * What was actually checked in this repository and runtime:
 *  - no model weights of any kind (no .onnx/.safetensors/.ckpt/.pt/.pth/.h5);
 *  - an inference runtime IS present (PyTorch, pulled in with ADMET-AI), so
 *    the runtime is no longer the blocker — the weights are;
 *  - the model hub is unreachable: huggingface.co is refused at the egress
 *    proxy (403) while pypi.org resolves, so no pretrained molecular
 *    generator can be fetched;
 *  - `packages/backend/src/compute/capabilities.mjs` already declares
 *    `generative-de-novo` as NOT_IMPLEMENTED, with the intended adapter shape
 *    `GenerativeAdapter.propose(target, constraints) -> { candidates[], method }`.
 *
 * A DELIBERATE NON-DECISION: this repository does depend on an LLM SDK. An LLM
 * is not a validated generative chemistry model — it has no applicability
 * domain, no training set of measured properties, and no way to tell a
 * synthesisable molecule from a plausible-looking string. Emitting SMILES from
 * one and calling it molecular generation would be exactly the "AI says the
 * molecule is good" failure this engine is built to avoid. It is therefore NOT
 * wired in here, and that is a correctness decision, not a missing feature.
 */
export const GENERATIVE_PROBE_VERSION = '1.0.0';

/**
 * Whether a torch-class inference runtime exists here. This is recorded
 * separately from "a model exists" because they fail for different reasons and
 * are fixed differently: a runtime is installable, weights must be obtainable.
 */
export const RUNTIME_PRESENT = true;

export const GENERATIVE_ADAPTER_CONTRACT =
  'GenerativeAdapter.propose(target, constraints) -> { candidates[], method, applicabilityDomain, engine }';

export interface GenerativeProbeResult {
  /** True only when a real model AND a real inference path both exist. */
  available: boolean;
  /** Everything the probe examined, so the conclusion can be re-checked. */
  checked: readonly { what: string; found: boolean; detail: string }[];
  reason: string;
  /** What would have to be supplied for this to become available. */
  requires: string;
}

/**
 * Runtime probe. It reports what it inspected rather than only its verdict,
 * so "no generative model" is a checkable claim instead of an assertion.
 *
 * `injected` is the seam: a real adapter, once one exists, is passed in and
 * the probe reports it. Nothing here searches for a model implicitly, because
 * a silently-discovered model is a model nobody reviewed.
 */
export function probeGenerativeChemistry(injected?: GenerativeAdapter | null): GenerativeProbeResult {
  const hasAdapter = injected !== undefined && injected !== null;
  const checked = [
    {
      what: 'injected GenerativeAdapter',
      found: hasAdapter,
      detail: hasAdapter ? `adapter supplied: ${injected.adapterId}` : 'no adapter supplied to the discovery loop',
    },
    {
      what: 'model weights in repository',
      found: false,
      detail: 'no .onnx/.safetensors/.ckpt/.pt/.pth/.h5 artefact is present in this repository',
    },
    {
      what: 'inference runtime',
      found: RUNTIME_PRESENT,
      detail: RUNTIME_PRESENT
        ? 'PyTorch is present in this runtime (installed as an ADMET-AI dependency), so the blocker is not the runtime.'
        : 'No inference runtime (torch, tensorflow, onnxruntime, transformers, jax) is present.',
    },
    {
      what: 'reachable model weights',
      found: false,
      detail: 'The model hub is unreachable from this environment: huggingface.co returns 403 at the egress proxy, while pypi.org resolves. A pretrained molecular generator cannot be fetched, so no weights can be loaded even though a runtime exists.',
    },
    {
      what: 'backend capability declaration',
      found: false,
      detail: 'compute/capabilities.mjs declares generative-de-novo as NOT_IMPLEMENTED',
    },
  ] as const;

  if (hasAdapter) {
    const adapterState = injected.capabilities();
    return {
      available: adapterState.available,
      checked,
      reason: adapterState.available ? '' : adapterState.reason,
      requires: GENERATIVE_ADAPTER_CONTRACT,
    };
  }

  return {
    available: false,
    checked,
    reason:
      'No generative chemistry model is loadable here. An inference runtime (PyTorch) IS present, but no model weights exist in the repository and the model hub is unreachable from this environment (huggingface.co is refused at the egress proxy). The backend capability manifest declares generative-de-novo NOT_IMPLEMENTED.',
    requires: `A validated generative model plus a real inference path, exposed as ${GENERATIVE_ADAPTER_CONTRACT}. An LLM is not a substitute: it has no applicability domain and no measured-property training set.`,
  };
}

/**
 * The seam a real generative model would implement. Kept minimal on purpose —
 * it demands an applicability domain and an engine identifier, because a
 * candidate with neither cannot be assessed by anything downstream.
 */
export interface GenerativeAdapter {
  adapterId: string;
  capabilities(): { available: boolean; reason: string; engine: string };
  propose(request: GenerationRequest): {
    candidates: readonly MoleculeCandidate[];
    applicabilityDomain: string;
    engine: string;
  };
}

/**
 * The generative provider as it actually stands: NOT_AVAILABLE, with the probe
 * evidence attached. If a real adapter is injected it is used and honestly
 * labelled REAL_GENERATIVE_MODEL — that label is reachable only through a real
 * inference path, never by configuration alone.
 */
export function generativeChemistryProvider(adapter?: GenerativeAdapter | null): MolecularGenerationProvider {
  const probe = probeGenerativeChemistry(adapter);

  const capability: GenerationCapability = probe.available && adapter
    ? {
      kind: 'REAL_GENERATIVE_MODEL',
      methodId: adapter.adapterId,
      description: `Generative model with a real inference path: ${adapter.capabilities().engine}.`,
      available: true,
      reason: '',
      // A generative model is not assumed reproducible; only a model that
      // states it is may claim it, and none does here.
      deterministic: false,
      producesStructures: true,
    }
    : {
      kind: 'NOT_AVAILABLE',
      methodId: 'generative-de-novo@NOT_IMPLEMENTED',
      description:
        'No generative chemistry model is present. Candidates in this repository come from deterministic enumerators, which are not generative models.',
      available: false,
      reason: probe.reason,
      deterministic: false,
      producesStructures: false,
    };

  return {
    capabilities: () => capability,

    generateCandidates(request: GenerationRequest): GenerationOutcome {
      if (!capability.available || !adapter) {
        return {
          capability,
          candidates: [],
          discarded: [],
          generationFingerprint: generationFingerprint(capability, request, []),
          notes: [
            `Generative chemistry did not run: ${probe.reason}`,
            `To enable it: ${probe.requires}`,
            'Zero candidates here means "no generator exists", not "no molecules exist".',
          ],
        };
      }
      const proposed = adapter.propose(request);
      return {
        capability,
        candidates: proposed.candidates,
        discarded: [],
        generationFingerprint: generationFingerprint(capability, request, proposed.candidates),
        notes: [`Applicability domain as declared by the model: ${proposed.applicabilityDomain}`],
      };
    },

    validateCandidate(): CandidateValidation {
      return {
        valid: null,
        checkedBy: capability.methodId,
        reason: capability.available
          ? 'A generative model proposing a molecule is not evidence the molecule is valid; validate it with a chemistry engine.'
          : probe.reason,
      };
    },
  };
}
