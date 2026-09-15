/**
 * D-084 — extension manifests for datasets that do NOT exist yet.
 *
 * The honest output of this harvest round is a list of datasets that are
 * REACHABLE IN PRINCIPLE and UNREACHABLE FROM HERE. Recording them costs
 * nothing and is worth a great deal: the next run knows exactly what is
 * missing, why, and where it physically lives.
 *
 * ========================= NO FABRICATED HASHES =========================
 *
 * Every manifest below carries `rawSha256: null` and `normalizedSha256: null`.
 * A hash is a claim that specific bytes were seen. No bytes were seen — egress
 * is refused by proxy policy in this runtime (403 on CONNECT, measured against
 * rest.uniprot.org, pubchem.ncbi.nlm.nih.gov and www.ebi.ac.uk). Writing a
 * plausible-looking digest for data that was never retrieved would be the
 * purest form of the fabrication this repository exists to refuse, and a
 * manifest with a null hash is trivially distinguishable from one with a real
 * one, which is the entire point.
 *
 * ============================ STATUS MEANINGS ===========================
 *   BLOCKED_EGRESS  the source exists; this runtime cannot reach it
 *   HOLD            the data is reachable but may NOT feed the current gate
 *                   without a separate scientific decision
 *   READY           bytes retrieved, hashed and verified
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHash } from '../provenance.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const EXTENSION_STATUS = Object.freeze(['BLOCKED_EGRESS', 'HOLD', 'READY']);

/**
 * Reads the CURRENT sha256 of a base pin from its own meta file.
 *
 * Deliberately NOT a hardcoded constant. The reviewed candidate package froze
 * the two base-pin digests as literals in a new module; that is a second
 * source of truth which drifts silently the moment a pin is legitimately
 * re-ingested, and which tells you nothing if someone edits both. Reading the
 * meta file means this function reports what is actually on disk, and the
 * comparison against an expected value is the CALLER's explicit act.
 */
export function readBasePinDigest(metaPath) {
  if (!existsSync(metaPath)) return { ok: false, code: 'PIN_MISSING', reason: `${metaPath} does not exist` };
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    if (typeof meta.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(meta.sha256)) {
      return { ok: false, code: 'PIN_PROVENANCE_INCOMPLETE', reason: `${metaPath} carries no usable sha256` };
    }
    return { ok: true, sha256: meta.sha256, rows: meta.n ?? null, targets: meta.resolvedTargetIds ?? [] };
  } catch {
    return { ok: false, code: 'PIN_UNREADABLE', reason: `${metaPath} is not readable JSON` };
  }
}

export const BASE_PIN_META = Object.freeze({
  GLP1R: path.join(HERE, 'glp1rActivity.meta.json'),
  GIPR: path.join(HERE, 'giprActivity.meta.json'),
});

/**
 * Asserts that no extension work has modified a base pin. An extension that
 * rewrites the dataset the frozen gate was sealed against is not an extension;
 * it is a re-freeze wearing a disguise.
 */
export function assertBasePinsUntouched(expected, metaPaths = BASE_PIN_META) {
  const events = [];
  for (const [label, metaPath] of Object.entries(metaPaths)) {
    const cur = readBasePinDigest(metaPath);
    if (!cur.ok) { events.push(Object.freeze({ event: 'PIN_MISSING', pin: label, reason: cur.reason })); continue; }
    if (expected?.[label] && cur.sha256 !== expected[label]) {
      events.push(Object.freeze({ event: 'PIN_DRIFT', pin: label, expected: expected[label], actual: cur.sha256 }));
    }
  }
  return Object.freeze({ ok: events.length === 0, events: Object.freeze(events) });
}

/** One manifest entry. A non-READY manifest may not carry a hash at all. */
export function extensionManifest({ id, status, rows = 0, rawSha256 = null, normalizedSha256 = null, source, blockedReason = null, holdReason = null }) {
  if (!EXTENSION_STATUS.includes(status)) throw new Error(`FAIL_CLOSED[UNKNOWN_EXTENSION_STATUS]: ${status}`);
  if (status !== 'READY' && (rawSha256 !== null || normalizedSha256 !== null)) {
    throw new Error(`FAIL_CLOSED[HASH_WITHOUT_BYTES]: manifest "${id}" is ${status} but carries a digest; a hash asserts that specific bytes were seen`);
  }
  if (status === 'READY' && (typeof normalizedSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(normalizedSha256))) {
    throw new Error(`FAIL_CLOSED[READY_WITHOUT_DIGEST]: manifest "${id}" claims READY without a verifiable normalized digest`);
  }
  return Object.freeze({
    id, status, rows, rawSha256, normalizedSha256,
    source: String(source ?? ''),
    blockedReason, holdReason,
    basePinsUntouched: true,
    fingerprint: canonicalHash({ id, status, rows, source }).slice(0, 16),
  });
}

/**
 * The state of the world as this round actually measured it. Every entry is a
 * dataset that does not exist in this repository, with the exact reason.
 */
export function currentExtensionManifests() {
  return Object.freeze([
    extensionManifest({
      id: 'GIPR_EXTENSION_V1',
      status: 'BLOCKED_EGRESS',
      source: 'BindingDB bulk export for the declared GIPR accession (manual download)',
      blockedReason: 'outbound HTTPS is refused by proxy policy in this runtime (403 on CONNECT); BindingDB bulk files additionally require a manual download, so no automated path exists from here',
    }),
    extensionManifest({
      id: 'GIPR_PUBCHEM_INDEPENDENT_V1',
      status: 'BLOCKED_EGRESS',
      source: 'PubChem BioAssay, restricted to assays whose aid_source.db is NOT a database already pinned',
      blockedReason: 'egress refused. An upstream probe additionally reported that the principal human GIPR cAMP assay (AID 2240461) is itself a ChEMBL deposit, so the independent yield may be zero — that claim could NOT be verified here and is recorded as an unverified upstream claim, not as a finding',
    }),
    extensionManifest({
      id: 'GLP1R_POTENCY_FAMILY_V1',
      status: 'HOLD',
      source: 'ChEMBL activities for the GLP-1R target with standard_type POTENCY',
      holdReason: 'a different endpoint family from the one the frozen gate was sealed against (see endpointFamily.mjs). It may become its own pin with its own gate; it may NOT be concatenated into the pActivity dataset to clear a row count. Merging it would enlarge the dataset while changing what is being measured',
    }),
    extensionManifest({
      id: 'SURECHEMBL_PRIOR_ART_V1',
      status: 'BLOCKED_EGRESS',
      source: 'SureChEMBL patent chemistry, for the novelty axis',
      blockedReason: 'egress refused; the novelty axis therefore remains UNVERIFIABLE rather than assumed, which is why the E2E reports PRIOR_ART_NO_ACCESS instead of treating an absent hit as evidence of novelty',
    }),
    extensionManifest({
      id: 'IUPHAR_PHARMACOLOGY_V1',
      status: 'BLOCKED_EGRESS',
      source: 'IUPHAR/BPS Guide to PHARMACOLOGY',
      blockedReason: 'egress refused',
    }),
  ]);
}

/** Aggregate view for a report: what is missing, and what it would unblock. */
export function extensionSummary(manifests = currentExtensionManifests()) {
  const byStatus = {};
  for (const m of manifests) (byStatus[m.status] ??= []).push(m.id);
  return Object.freeze({
    total: manifests.length,
    byStatus: Object.freeze(byStatus),
    anyReady: manifests.some((m) => m.status === 'READY'),
    fabricatedHashes: manifests.filter((m) => m.status !== 'READY' && (m.rawSha256 || m.normalizedSha256)).length,
  });
}
