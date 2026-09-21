/**
 * D-086 — supply-chain PROVENANCE checks over the real lockfile.
 *
 * ================== HOW THIS DIFFERS FROM dependencyAudit.mjs =============
 *
 * `security/dependencyAudit.mjs` runs `npm audit` and answers "does anything
 * here have a known CVE". This answers a different question: "did every one of
 * these packages come from where it claims, at a version that cannot move".
 * A package can be perfectly CVE-free and still be fetched from an attacker's
 * registry, so the two are complementary rather than duplicates.
 *
 * ============================ WHAT IS CHECKED ============================
 *
 *   UNTRUSTED_REGISTRY   `resolved` points somewhere other than the allowlist
 *   NON_EXACT_VERSION    a version that is a range, so the bytes can change
 *   MISSING_INTEGRITY    a registry package with no integrity hash to check
 *
 * ========================== WHAT IS NOT CHECKED ==========================
 *
 * This does NOT verify that the integrity hash matches the bytes on disk —
 * npm does that at install time, and re-implementing it here would be a second
 * verifier that can disagree with the first. This checks that a hash is
 * DECLARED and that the source is trusted, which is what the lockfile alone
 * can honestly tell us.
 *
 * Link/workspace entries carry no `resolved` and no `integrity` by design;
 * they are local, so they are reported separately rather than as findings.
 */

import { readFileSync, existsSync } from 'node:fs';
import { canonicalHash } from '../provenance.mjs';

/** Registries this repository accepts packages from. Adding one is a deliberate act. */
export const TRUSTED_REGISTRIES = Object.freeze(['registry.npmjs.org']);

/** An exact semver: no range, no tag, no git ref. */
const EXACT_VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export function verifyLockfileProvenance(lockPath, { trusted = TRUSTED_REGISTRIES } = {}) {
  if (!existsSync(lockPath)) {
    return Object.freeze({ ok: false, code: 'LOCKFILE_MISSING', findings: Object.freeze([]), reason: `${lockPath} does not exist; an unlocked dependency tree has no provenance at all` });
  }
  let lock;
  try {
    lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    return Object.freeze({ ok: false, code: 'LOCKFILE_UNREADABLE', findings: Object.freeze([]), reason: `${lockPath} is not readable JSON` });
  }

  const packages = lock.packages ?? {};
  const findings = [];
  let registryPackages = 0;
  let localPackages = 0;

  for (const [name, entry] of Object.entries(packages)) {
    if (name === '') continue; // the root project itself
    if (entry?.link === true || (!entry?.resolved && !entry?.version)) { localPackages += 1; continue; }
    if (!entry.resolved) { localPackages += 1; continue; } // workspace member

    registryPackages += 1;

    let host;
    try { host = new URL(entry.resolved).hostname; } catch { host = null; }
    if (host === null) {
      findings.push({ event: 'SUPPLYCHAIN_DRIFT', code: 'UNTRUSTED_REGISTRY', pkg: name, detail: `resolved is not a URL: ${String(entry.resolved).slice(0, 80)}` });
    } else if (!trusted.includes(host)) {
      findings.push({ event: 'SUPPLYCHAIN_DRIFT', code: 'UNTRUSTED_REGISTRY', pkg: name, detail: `resolved from ${host}, which is not among ${trusted.join(', ')}` });
    }

    if (typeof entry.version !== 'string' || !EXACT_VERSION_RE.test(entry.version)) {
      findings.push({ event: 'SUPPLYCHAIN_DRIFT', code: 'NON_EXACT_VERSION', pkg: name, detail: `version "${String(entry.version)}" is not an exact semver, so the installed bytes can change without the lockfile changing` });
    }

    if (typeof entry.integrity !== 'string' || entry.integrity.length === 0) {
      findings.push({ event: 'SUPPLYCHAIN_DRIFT', code: 'MISSING_INTEGRITY', pkg: name, detail: 'a registry package with no integrity hash cannot be verified at install time' });
    }
  }

  return Object.freeze({
    ok: findings.length === 0,
    code: findings.length === 0 ? 'PROVENANCE_VERIFIED' : 'PROVENANCE_FINDINGS',
    registryPackages,
    localPackages,
    findings: Object.freeze(findings.map(Object.freeze)),
    lockfileVersion: lock.lockfileVersion ?? null,
    fingerprint: canonicalHash({ n: registryPackages, findings: findings.map((f) => [f.code, f.pkg]) }).slice(0, 16),
  });
}

/** Secrets that must never reach a commit. Patterns are anchored to their real formats. */
export const SECRET_PATTERNS = Object.freeze([
  { id: 'PRIVATE_KEY', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { id: 'AWS_ACCESS_KEY', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'GITHUB_PAT', re: /\bghp_[A-Za-z0-9]{36}\b/ },
  { id: 'GITHUB_FINE_GRAINED', re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { id: 'SLACK_TOKEN', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'ANTHROPIC_KEY', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
]);

/**
 * Scans text for credential shapes. Returns the pattern id and the LINE, never
 * the matched secret itself — a scanner that echoes what it found into a log
 * has moved the secret rather than caught it.
 */
export function scanForSecrets(text, { patterns = SECRET_PATTERNS } = {}) {
  const findings = [];
  const lines = String(text ?? '').split('\n');
  lines.forEach((line, i) => {
    for (const p of patterns) {
      if (p.re.test(line)) findings.push({ event: 'SECRET_FOUND', patternId: p.id, line: i + 1 });
    }
  });
  return Object.freeze({ clean: findings.length === 0, findings: Object.freeze(findings.map(Object.freeze)) });
}
