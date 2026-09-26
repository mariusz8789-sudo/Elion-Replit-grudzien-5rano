#!/usr/bin/env node
/**
 * Read-only Railway staging verifier.
 *
 * It proves that the deployed release is identifiable and durable, that the
 * canonical health surface is safe, and that two real CPU paths execute:
 * RDKit (computed descriptors) and the checksum-pinned CMS Open Data adapter.
 * It creates no accounts, projects, campaigns, Evidence, or external calls.
 */

const baseInput = process.argv[2] ?? process.env.GENESIS_STAGING_BASE_URL ?? '';
if (!baseInput) {
  console.error('Usage: node scripts/verify-railway-staging.mjs https://<staging-domain>');
  process.exit(2);
}

let base;
try {
  base = new URL(baseInput);
} catch {
  console.error('GENESIS_STAGING_BASE_URL must be an absolute URL.');
  process.exit(2);
}
if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) {
  console.error('Remote staging verification requires HTTPS.');
  process.exit(2);
}
const basePath = base.pathname === '/' ? '' : base.pathname.replace(/\/$/, '');

const timeoutMs = 180_000;
async function request(pathname, init = {}) {
  const controller = new globalThis.AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(basePath + pathname, base.origin), {
      ...init,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { throw new Error(`${pathname}: non-JSON response (${response.status})`); }
    if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
    return body;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoPathLeak(value, label) {
  const serialized = JSON.stringify(value);
  invariant(!/(?:[A-Za-z]:\\|\/(?:app|home|root|Users)\/)/.test(serialized), `${label} exposes an absolute host/container path`);
}

try {
  const health = await request('/api/health');
  invariant(health.ok === true, 'health.ok is not true');
  invariant(health.static === true, 'frontend production build is not being served');
  invariant(health.db?.ok === true && health.db?.persistent === true, 'SQLite is not healthy on durable storage');
  invariant(/^[0-9a-f]{40}$/.test(health.commit), 'deployed Git commit identity is unavailable');
  const rdkitHealth = health.toolchain?.find((entry) => entry.id === 'rdkit');
  invariant(rdkitHealth?.status === 'AVAILABLE', `RDKit health status is ${rdkitHealth?.status ?? 'missing'}`);
  assertNoPathLeak(health, '/api/health');

  const toolchain = await request('/api/compute/toolchain');
  const rdkitTool = toolchain.toolchain?.find((entry) => entry.toolId === 'rdkit');
  invariant(rdkitTool?.status === 'AVAILABLE', 'canonical toolchain did not validate RDKit reference cases');
  invariant(rdkitTool.executionStatus === 'VALIDATED_REFERENCE_CASE', 'RDKit has no validated reference execution');
  invariant(/^[0-9a-f]{16}$/.test(rdkitTool.fingerprint), 'RDKit runtime fingerprint is missing');
  assertNoPathLeak(toolchain, '/api/compute/toolchain');

  const rdkit = await request('/api/compute/run', {
    method: 'POST',
    body: JSON.stringify({ modelId: 'chem-rdkit-descriptors', inputs: { smiles: 'CC(=O)Oc1ccccc1C(=O)O' } }),
  });
  invariant(rdkit.run?.status === 'ok', 'RDKit compute run did not complete');
  invariant(Math.abs(rdkit.run.outputs?.molWt - 180.16) < 0.2, 'RDKit aspirin molecular weight is outside the reference tolerance');
  invariant(/RDKit/i.test(JSON.stringify(rdkit.run.provenance)), 'RDKit provenance is missing');

  const cms = await request('/api/compute/run', {
    method: 'POST',
    body: JSON.stringify({ modelId: 'particle-cern-cms-zmumu-invariant-mass', inputs: {} }),
  });
  invariant(cms.run?.status === 'ok', 'CMS Open Data run did not complete');
  invariant(cms.run.outputs?.eventCount > 0, 'CMS Open Data run returned no source events');
  invariant(/CMS|CERN|5208/i.test(JSON.stringify(cms.run.provenance)), 'CMS source provenance is missing');

  console.log(JSON.stringify({
    ok: true,
    baseUrl: base.origin + basePath,
    release: { commit: health.commit, builtAt: health.builtAt ?? null },
    persistence: health.db,
    rdkit: { status: rdkitTool.status, version: rdkitTool.version, fingerprint: rdkitTool.fingerprint, aspirinMolWt: rdkit.run.outputs.molWt },
    cmsOpenData: { status: 'EXECUTED', eventCount: cms.run.outputs.eventCount, massMeanGeV: cms.run.outputs.massMeanGeV },
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    cause: error instanceof Error && error.cause ? String(error.cause) : null,
  }, null, 2));
  process.exit(1);
}
