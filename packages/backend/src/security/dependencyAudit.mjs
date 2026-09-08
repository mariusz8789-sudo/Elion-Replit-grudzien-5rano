/**
 * Real dependency-vulnerability audit — the first honest slice of "Genesis Cyber."
 *
 * The autonomous-cyber-agent brief (Matrix cyber-range, attack-path correlation,
 * attacker/defender loop, codebase-structural indexing, agent task orchestration)
 * needs infrastructure that genuinely does not exist anywhere in this repo yet — no
 * generic agent/task framework, no RAG/memory, no security-analysis tooling, no
 * agent permission model (see this session's own repo audit). Building that whole
 * stack in one sitting would mean inventing a fake "autonomous security agent"
 * with no substance behind it — the "capability honesty" rule this project runs on
 * everywhere else.
 *
 * This module is the one piece of that vision buildable RIGHT NOW with a real,
 * already-installed tool and zero invented data: `npm audit`'s own advisory
 * database, mapped onto the SUSPECTED -> INVESTIGATING -> VALIDATED -> REJECTED ->
 * FIXED -> VERIFIED finding lifecycle the brief itself specifies. Every finding's
 * severity, advisory title, and fix-availability come straight from npm's real
 * audit report; nothing here re-derives or upgrades that classification. Every
 * finding starts at SUSPECTED — a real advisory match against an installed
 * version range is real evidence, but this module performs no reachability or
 * exploitability analysis, so calling it anything past SUSPECTED would overclaim
 * confidence this code does not have.
 */
import { execFileSync } from 'node:child_process';

export const FINDING_STATUS = Object.freeze({
  SUSPECTED: 'SUSPECTED',
  INVESTIGATING: 'INVESTIGATING',
  VALIDATED: 'VALIDATED',
  REJECTED: 'REJECTED',
  FIXED: 'FIXED',
  VERIFIED: 'VERIFIED',
});

/**
 * Runs the real `npm audit --json` in `cwd` and maps its report into
 * SecurityFinding[]. `npm audit` exits non-zero the moment it finds ANY
 * vulnerability — that is still real, well-formed JSON on stdout, not a probe
 * failure, so a non-zero exit is only treated as an error when stdout itself
 * did not parse.
 */
export function runDependencyAudit({ cwd = process.cwd(), timeoutMs = 60_000 } = {}) {
  let raw;
  try {
    raw = execFileSync('npm', ['audit', '--json'], {
      cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    raw = err?.stdout;
    if (!raw) {
      return { ok: false, error: `npm_audit_unavailable: ${String(err?.message ?? err).slice(0, 200)}`, findings: [] };
    }
  }
  let report;
  try {
    report = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `npm_audit_unparseable: ${String(err?.message ?? err).slice(0, 200)}`, findings: [] };
  }
  return { ok: true, findings: mapAuditReportToFindings(report) };
}

/**
 * Pure parser (no subprocess) — exported so it is testable against a fixture
 * without actually invoking npm, not for its own sake.
 */
export function mapAuditReportToFindings(report) {
  const vulnerabilities = report?.vulnerabilities ?? {};
  const findings = [];
  for (const [packageName, entry] of Object.entries(vulnerabilities)) {
    const advisories = (entry.via ?? []).filter((v) => v && typeof v === 'object');
    const advisoryTitles = advisories.map((v) => v.title).filter(Boolean);
    const advisoryUrls = advisories.map((v) => v.url).filter(Boolean);
    findings.push({
      id: `npm-audit:${packageName}`,
      status: FINDING_STATUS.SUSPECTED,
      severity: entry.severity ?? 'unknown', // real npm classification, never re-derived here
      affectedComponent: packageName,
      range: entry.range ?? null,
      isDirect: entry.isDirect === true,
      evidence: { advisoryTitles, advisoryUrls, via: entry.via ?? [] },
      hypothesis: advisoryTitles.length > 0
        ? `${packageName} (${entry.range ?? 'unknown range'}) matches a known advisory: ${advisoryTitles.join('; ')}`
        : `${packageName} (${entry.range ?? 'unknown range'}) is transitively affected by a dependency's own advisory.`,
      remediation: describeRemediation(entry.fixAvailable),
      regressionStatus: 'NOT_YET_RETESTED',
    });
  }
  return findings;
}

function describeRemediation(fixAvailable) {
  if (fixAvailable === false) return 'NOT_AVAILABLE — npm reports no fix currently resolves this advisory.';
  if (fixAvailable === true) return 'A fix is available via `npm audit fix` (may include a semver-major update).';
  if (fixAvailable && typeof fixAvailable === 'object') {
    const major = fixAvailable.isSemVerMajor ? ', a semver-major update' : '';
    return `A fix is available via \`npm audit fix\` (installs ${fixAvailable.name}@${fixAvailable.version}${major}).`;
  }
  return 'UNKNOWN — npm audit did not report fix availability for this advisory.';
}

/** Real counts by severity, straight from the mapped findings — no invented weighting. */
export function summarizeFindings(findings) {
  const bySeverity = {};
  for (const finding of findings) bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
  return { total: findings.length, bySeverity };
}
