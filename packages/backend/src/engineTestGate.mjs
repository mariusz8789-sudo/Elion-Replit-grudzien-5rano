import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';

/**
 * ENGINE_UNAVAILABLE vs CODE FAILURE, for tests that need a real scientific
 * engine. A test gated here is SKIPPED (never passed) when its engine is
 * absent, with the reason printed as ENGINE_UNAVAILABLE / BLOCKED_BY_RUNTIME,
 * so a runtime without RDKit reports a classified missing engine instead of
 * a wall of assertion failures that look like broken code.
 *
 * The skip can never hide the engine where it is required:
 * GENESIS_REQUIRE_ENGINES (comma-separated, e.g. `rdkit`) turns the skip off,
 * so the test runs and fails loudly if the engine is missing. CI sets it for
 * every engine it installs.
 */
const REQUIRED = new Set(
  String(process.env.GENESIS_REQUIRE_ENGINES ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean),
);

/** `false` (run the test) or the skip reason. */
export function engineUnavailable(engine, detection) {
  if (detection?.available === true) return false;
  if (REQUIRED.has(engine)) return false;
  return `ENGINE_UNAVAILABLE (BLOCKED_BY_RUNTIME): ${engine} is not installed in this runtime (${detection?.reason ?? 'not detected'}); a missing engine, not a code failure. GENESIS_REQUIRE_ENGINES=${engine} makes its absence a failure.`;
}

export const RDKIT_SKIP = engineUnavailable('rdkit', rdkitDetect());
