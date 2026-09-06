import type { GeographySpec, PopulationSpec, ScientificDomainRequest, WorldSpecification, WorldTemplateId } from '../specification/worldSpecification';
import { WORLD_MODEL_PROPOSAL_SCHEMA_VERSION, type WorldModelProposal } from './worldModelProposal';

/**
 * REAL LLM WORLD PROPOSER (Genesis Scientific World Model 3.0, section 3).
 *
 * `requestLLMWorldProposal` is the `WorldProposalModel` for `source: 'LLM'`
 * — it mirrors `narrator/askAI.ts`'s EXACT client pattern (the one existing,
 * working LLM integration in this codebase): POST to a backend endpoint,
 * never touch an API key, treat every non-2xx status as a distinct,
 * honestly-reported outcome. It calls `POST /api/world-proposal`
 * (packages/backend/src/server.mjs::handleWorldProposal), which itself
 * calls Anthropic with a `propose_world` TOOL (structured output) —
 * configuration (model, key) lives entirely server-side via
 * `ANTHROPIC_API_KEY`/`GENESIS_AI_MODEL`, never hardcoded here.
 *
 * This adapter know NOTHING about C2 (rendering) and NEVER touches a
 * `WorldGraph` or runs a solver — it only ever proposes a `WorldSpecification`
 * fragment, wrapped into a full `WorldModelProposal`, which the caller must
 * still push through `validateProposal`/`realizeProposal`
 * (generation/worldModelProposal.ts) exactly like any other proposal. A
 * malformed or missing tool response from the model is REJECTED here — this
 * adapter never invents a plausible-looking specification to paper over a
 * bad response.
 */
export type LLMWorldProposalResult =
  | { ok: true; proposal: WorldModelProposal }
  | { ok: false; reason: 'offline' | 'no-key' | 'rate-limited' | 'malformed' | 'error'; message: string };

export interface RequestLLMWorldProposalOptions {
  /** Caller-controlled — NEVER derived from the LLM's own output, so "same seed + same specification => same world" holds regardless of any LLM non-determinism across calls. */
  worldId: string;
  seed: number;
  /** Per-attempt timeout. Defaults to 20s — a tool-use call with reasoning can legitimately take several seconds. */
  timeoutMs?: number;
  /** Additional attempts after the first, only for transient (network/upstream) failures — never for a deterministic rejection (no-key, malformed, rate-limited). Defaults to 1 (i.e. up to 2 attempts total). */
  retries?: number;
}

const KNOWN_TEMPLATES = new Set<string>(['CITY', 'LABORATORY', 'WATER_SYSTEM', 'EPIDEMIOLOGY', 'INDUSTRIAL_SITE']);
const KNOWN_DOMAINS = new Set<string>(['chemistry', 'epidemiology', 'hydraulics', 'kinematics']);
const KNOWN_SCALES = new Set<string>(['PLANET', 'REGION', 'MACRO_CITY', 'BUILDING', 'ROOM', 'MESO_LAB', 'MICRO_MOLECULAR', 'NANO_ATOMIC']);

interface RawProposalInput {
  worldType?: unknown;
  scale?: unknown;
  geography?: unknown;
  population?: unknown;
  scientificDomains?: unknown;
  levelOfDetail?: unknown;
  rationale?: unknown;
}

/**
 * Converts the tool's raw JSON input into a real `WorldSpecification` —
 * re-validating shape independently of whatever the backend's own
 * `parseWorldProposalToolResponse` already checked, since this adapter must
 * not assume its only caller is that one backend (never trust a network
 * boundary twice with the same trust). Returns `undefined` for anything
 * that doesn't parse as a well-formed specification fragment; the caller
 * treats that as `reason: 'malformed'`.
 */
function toWorldSpecification(worldId: string, seed: number, raw: RawProposalInput): WorldSpecification | undefined {
  if (!Array.isArray(raw.worldType) || raw.worldType.length === 0) return undefined;
  const worldType = raw.worldType.filter((t): t is WorldTemplateId => typeof t === 'string' && KNOWN_TEMPLATES.has(t));
  if (worldType.length !== raw.worldType.length || worldType.length === 0) return undefined;
  if (typeof raw.rationale !== 'string' || raw.rationale.trim().length === 0) return undefined;

  const scale = typeof raw.scale === 'string' && KNOWN_SCALES.has(raw.scale) ? (raw.scale as WorldSpecification['scale']) : undefined;

  let geography: GeographySpec | undefined;
  if (raw.geography && typeof raw.geography === 'object') {
    const g = raw.geography as Record<string, unknown>;
    geography = {
      hasRiver: typeof g.hasRiver === 'boolean' ? g.hasRiver : undefined,
      coastal: typeof g.coastal === 'boolean' ? g.coastal : undefined,
      regionCount: typeof g.regionCount === 'number' ? g.regionCount : undefined,
      districtCount: typeof g.districtCount === 'number' ? g.districtCount : undefined,
      buildingsPerDistrict: typeof g.buildingsPerDistrict === 'number' ? g.buildingsPerDistrict : undefined,
    };
  }

  let population: PopulationSpec | undefined;
  if (raw.population && typeof raw.population === 'object') {
    const count = (raw.population as Record<string, unknown>).count;
    if (typeof count === 'number' && count > 0) population = { count };
  }

  let scientificDomains: ScientificDomainRequest[] | undefined;
  if (Array.isArray(raw.scientificDomains)) {
    scientificDomains = raw.scientificDomains
      .filter((d): d is { domain: string; required: boolean } => !!d && typeof d === 'object' && KNOWN_DOMAINS.has((d as Record<string, unknown>).domain as string))
      .map((d) => ({ domain: d.domain as ScientificDomainRequest['domain'], required: Boolean(d.required) }));
  }

  const levelOfDetail = raw.levelOfDetail === 'LOW' || raw.levelOfDetail === 'MEDIUM' || raw.levelOfDetail === 'HIGH' ? raw.levelOfDetail : undefined;

  return {
    worldId,
    seed,
    worldType,
    scale,
    geography,
    population,
    scientificDomains,
    levelOfDetail,
    provenanceNote: `LLM-proposed: ${raw.rationale}`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One HTTP attempt — never retried internally; `requestLLMWorldProposal` owns the retry loop. */
async function attemptOnce(prompt: string, options: RequestLLMWorldProposalOptions): Promise<LLMWorldProposalResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const res = await fetch('/api/world-proposal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    if (res.status === 429) {
      return { ok: false, reason: 'rate-limited', message: 'Limit propozycji świata na minutę — odczekaj chwilę.' };
    }
    if (res.status === 503) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, reason: 'no-key', message: data?.message ?? 'Generator świata AI nie jest skonfigurowany w tym wdrożeniu.' };
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, reason: res.status === 502 ? 'malformed' : 'error', message: data?.message ?? 'Serwis AI chwilowo niedostępny — spróbuj ponownie.' };
    }
    const data = (await res.json()) as { proposal?: RawProposalInput; model?: string };
    const specification = data.proposal ? toWorldSpecification(options.worldId, options.seed, data.proposal) : undefined;
    if (!specification) {
      return { ok: false, reason: 'malformed', message: 'Model zwrócił niekompletną lub nieprawidłową propozycję świata.' };
    }
    const proposal: WorldModelProposal = {
      schemaVersion: WORLD_MODEL_PROPOSAL_SCHEMA_VERSION,
      proposalId: `proposal:${options.worldId}:${options.seed}:llm`,
      source: 'LLM',
      specification,
      rationale: typeof data.proposal?.rationale === 'string' ? data.proposal.rationale : undefined,
      provenance: { createdAt: new Date().toISOString(), model: data.model, requestText: prompt },
    };
    return { ok: true, proposal };
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      return { ok: false, reason: 'offline', message: 'Przekroczono limit czasu żądania do generatora świata AI.' };
    }
    return {
      ok: false,
      reason: 'offline',
      message: 'Brak połączenia z backendem AI. Skrypt deterministyczny (proposeWorldDeterministically) działa dalej w pełni offline.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Requests a real, LLM-proposed `WorldModelProposal` for `prompt`. Retries
 * only transient failures (`'offline'`/`'error'`) up to `options.retries`
 * additional times with a short backoff; a deterministic rejection
 * (`'no-key'`, `'rate-limited'`, `'malformed'`) is returned immediately —
 * retrying those would not change the outcome.
 */
export async function requestLLMWorldProposal(prompt: string, options: RequestLLMWorldProposalOptions): Promise<LLMWorldProposalResult> {
  const maxAttempts = 1 + Math.max(0, options.retries ?? 1);
  let last: LLMWorldProposalResult = { ok: false, reason: 'error', message: 'No attempt was made.' };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    last = await attemptOnce(prompt, options);
    if (last.ok || (last.reason !== 'offline' && last.reason !== 'error')) return last;
    if (attempt < maxAttempts - 1) await sleep(300 * (attempt + 1));
  }
  return last;
}
