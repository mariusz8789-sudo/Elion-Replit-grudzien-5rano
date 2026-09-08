import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  FINDING_STATUS, runDependencyAudit, mapAuditReportToFindings, summarizeFindings,
} from './security/dependencyAudit.mjs';

const FIXTURE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'npmAuditSample.json');
const sampleReport = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));

describe('mapAuditReportToFindings (pure parser — real npm audit v2 report shape)', () => {
  test('maps every vulnerable package to one finding, starting SUSPECTED', () => {
    const findings = mapAuditReportToFindings(sampleReport);
    assert.equal(findings.length, 3);
    for (const finding of findings) assert.equal(finding.status, FINDING_STATUS.SUSPECTED);
  });

  test('never re-derives severity — copies npm audit\'s own classification verbatim', () => {
    const findings = mapAuditReportToFindings(sampleReport);
    const semver = findings.find((f) => f.affectedComponent === 'semver');
    const leftPad = findings.find((f) => f.affectedComponent === 'left-pad');
    assert.equal(semver.severity, 'moderate');
    assert.equal(leftPad.severity, 'critical');
  });

  test('surfaces the real advisory title and URL as evidence, not invented text', () => {
    const findings = mapAuditReportToFindings(sampleReport);
    const semver = findings.find((f) => f.affectedComponent === 'semver');
    assert.ok(semver.evidence.advisoryTitles.includes('semver vulnerable to Regular Expression Denial of Service'));
    assert.ok(semver.evidence.advisoryUrls.includes('https://github.com/advisories/GHSA-c2qf-rxjj-qqgw'));
    assert.match(semver.hypothesis, /semver vulnerable to Regular Expression Denial of Service/);
  });

  test('falls back to a transitive-advisory hypothesis when `via` names no advisory object', () => {
    // "example-major-bump"'s own via array is a bare string (a transitive package name),
    // the real npm audit shape when the advisory itself lives on a sub-dependency.
    const findings = mapAuditReportToFindings(sampleReport);
    const transitive = findings.find((f) => f.affectedComponent === 'example-major-bump');
    assert.deepEqual(transitive.evidence.advisoryTitles, []);
    assert.match(transitive.hypothesis, /transitively affected/);
  });

  test('remediation reflects fixAvailable honestly in all three real shapes (true/false/object)', () => {
    const findings = mapAuditReportToFindings(sampleReport);
    const semver = findings.find((f) => f.affectedComponent === 'semver'); // fixAvailable: true
    const leftPad = findings.find((f) => f.affectedComponent === 'left-pad'); // fixAvailable: false
    const majorBump = findings.find((f) => f.affectedComponent === 'example-major-bump'); // fixAvailable: {...}

    assert.match(semver.remediation, /npm audit fix/);
    assert.match(leftPad.remediation, /NOT_AVAILABLE/);
    assert.match(majorBump.remediation, /example-major-bump@3\.0\.0/);
    assert.match(majorBump.remediation, /semver-major/);
  });

  test('is direct vs transitive is copied honestly from isDirect, never guessed', () => {
    const findings = mapAuditReportToFindings(sampleReport);
    assert.equal(findings.find((f) => f.affectedComponent === 'semver').isDirect, false);
    assert.equal(findings.find((f) => f.affectedComponent === 'left-pad').isDirect, true);
  });

  test('an empty report (no vulnerabilities) maps to an empty finding list, not an error', () => {
    const findings = mapAuditReportToFindings({ vulnerabilities: {}, metadata: {} });
    assert.deepEqual(findings, []);
  });

  test('tolerates a malformed/missing vulnerabilities key rather than throwing', () => {
    assert.deepEqual(mapAuditReportToFindings({}), []);
  });
});

describe('summarizeFindings', () => {
  test('counts findings by their own real severity, no invented weighting', () => {
    const findings = mapAuditReportToFindings(sampleReport);
    const summary = summarizeFindings(findings);
    assert.equal(summary.total, 3);
    assert.deepEqual(summary.bySeverity, { moderate: 1, critical: 1, high: 1 });
  });

  test('an empty finding list summarizes to zero, not a crash', () => {
    assert.deepEqual(summarizeFindings([]), { total: 0, bySeverity: {} });
  });
});

describe('runDependencyAudit (real subprocess — exercises the actual installed npm against this real repo)', () => {
  test('runs real `npm audit --json` against this monorepo and returns a well-formed, honest result', () => {
    const result = runDependencyAudit({ cwd: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..') });
    assert.equal(result.ok, true);
    assert.ok(Array.isArray(result.findings));
    // Not asserting a specific count/severity here on purpose: the real advisory
    // database changes over time, and asserting "this repo has exactly N real CVEs
    // today" would make this test fail the moment a genuinely new one is published —
    // exactly the kind of test that would tempt someone to loosen a real security
    // signal later. The shape and honesty of the mapping are what this suite covers;
    // the fixture-based tests above already exercise every real npm audit shape.
    for (const finding of result.findings) assert.equal(finding.status, FINDING_STATUS.SUSPECTED);
  });

  test('a broken npm invocation reports ok:false with a real error, never a fabricated empty success', () => {
    const result = runDependencyAudit({ cwd: '/nonexistent-path-for-this-test', timeoutMs: 5_000 });
    assert.equal(result.ok, false);
    assert.match(result.error, /npm_audit_unavailable|npm_audit_unparseable/);
    assert.deepEqual(result.findings, []);
  });
});
