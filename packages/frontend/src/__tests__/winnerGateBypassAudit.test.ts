/**
 * D-109 — WINNER GATE BYPASS AUDIT. A structural, repo-wide sweep (not unit
 * tests of `canPromoteToWinnerRecord`'s logic — `winnerGate.test.ts` already
 * covers that) for exactly the failure modes named in the mandate: stale
 * artifacts, orphan modules, alternate code paths, direct DB writes, legacy
 * APIs, test-only bypasses, missing provenance, identity mismatch.
 *
 * Every assertion here corresponds to something actually read and verified in
 * the live repo while writing this file, not a hypothetical. Where the audit
 * found the property already held, the test PINS it so a future change that
 * quietly breaks it fails loudly instead of shipping.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, FRONTEND_SRC } from './fixtures/repoPaths';

const BACKEND_SRC = resolve(REPO_ROOT, 'packages', 'backend', 'src');

function allFiles(dir: string, exts: readonly string[]): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) return allFiles(full, exts);
    return exts.some((e) => full.endsWith(e)) ? [full] : [];
  });
}

const isTestFile = (f: string): boolean => f.includes('.test.') || /[\\/]__tests__[\\/]/.test(f);

const ALL_SOURCE = [
  ...allFiles(FRONTEND_SRC, ['.ts', '.tsx']),
  ...allFiles(BACKEND_SRC, ['.mjs']),
].filter((f) => !isTestFile(f));

describe('no hardcoded WINNER verdict or PROMOTE outcome outside the real gate and its tests', () => {
  it('adjudicationVerdict is never assigned the literal WINNER outside a test file', () => {
    const offenders: string[] = [];
    for (const file of ALL_SOURCE) {
      const src = readFileSync(file, 'utf8');
      if (/adjudicationVerdict\s*:\s*['"]WINNER['"]/.test(src)) offenders.push(file);
    }
    expect(offenders, 'a non-test file assigns adjudicationVerdict the literal WINNER — every WINNER verdict must come from a real adjudicator, never a hardcoded literal').toEqual([]);
  });

  it('outcome is never assigned the literal PROMOTE outside canPromoteToWinnerRecord itself', () => {
    const offenders: string[] = [];
    for (const file of ALL_SOURCE) {
      if (file.endsWith('winnerGate.ts')) continue; // the gate's own return value construction
      const src = readFileSync(file, 'utf8');
      // Matches an ASSIGNMENT (`outcome: 'PROMOTE'`), not the type union
      // (`outcome: 'PROMOTE' | 'NO_PROMOTION'`) — the latter has a pipe after
      // the closing quote within a few characters, the former does not.
      const assignments = [...src.matchAll(/outcome\s*:\s*['"]PROMOTE['"]/g)]
        .filter((m) => !src.slice(m.index!, m.index! + 60).includes('|'));
      if (assignments.length > 0) offenders.push(file);
    }
    expect(offenders, 'a file outside winnerGate.ts assigns outcome the literal PROMOTE — every PROMOTE must be COMPUTED by canPromoteToWinnerRecord, never asserted').toEqual([]);
  });

  it('canPromoteToWinnerRecord is defined in exactly one file — no shadow or duplicate gate', () => {
    const definers = ALL_SOURCE.filter((f) => /export function canPromoteToWinnerRecord/.test(readFileSync(f, 'utf8')));
    expect(definers).toHaveLength(1);
    expect(definers[0]).toContain(join('orchestrator', 'winnerGate.ts'));
  });
});

describe('no server-side route or legacy API can serve a recipe or winner record', () => {
  it('backend server.mjs declares no route path mentioning recipe or winner', () => {
    const serverPath = join(BACKEND_SRC, 'server.mjs');
    const src = readFileSync(serverPath, 'utf8');
    expect(/recipe|winner/i.test(src), 'server.mjs must not expose any HTTP surface for recipes or winners — the only legitimate path is buildMounjaroResearchRecipe() called in-process').toBe(false);
  });
});

describe('the molecular mission verdict ceiling is structurally incapable of WINNER', () => {
  it("molecularMission.mjs::decide() has exactly two literal outcome strings, and neither is WINNER", () => {
    const path = join(BACKEND_SRC, 'campaign', 'molecularMission.mjs');
    const src = readFileSync(path, 'utf8');
    const fnStart = src.indexOf('export function decide(');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = src.slice(fnStart, src.indexOf('\n}', fnStart));
    const literals = [...fnBody.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    const outcomeLiterals = [...new Set(literals)].filter((l) => l === 'COMPUTATIONAL_CANDIDATE' || l === 'NO_WINNER' || l === 'WINNER');
    expect(outcomeLiterals.sort()).toEqual(['COMPUTATIONAL_CANDIDATE', 'NO_WINNER']);
  });
});

describe('the evidence-strength threshold winnerGate.ts uses is the frozen table, not an injectable one', () => {
  it('winnerGate.ts imports DEFAULT_EVIDENCE_CLASS_RANK directly and does not accept a caller-supplied ranking', () => {
    const path = join(FRONTEND_SRC, 'core', 'orchestrator', 'winnerGate.ts');
    const src = readFileSync(path, 'utf8');
    expect(src).toContain("import { DEFAULT_EVIDENCE_CLASS_RANK");
    // PromotionInput has no `ranking` field — the strength table is not a parameter.
    const inputBlockStart = src.indexOf('export interface PromotionInput');
    const inputBlock = src.slice(inputBlockStart, src.indexOf('}', inputBlockStart));
    expect(inputBlock).not.toMatch(/ranking/i);
  });

  it('COMPUTATIONAL and UNVERIFIED both rank below the STRONG threshold (INDIRECT_RANDOMISED)', async () => {
    const { DEFAULT_EVIDENCE_CLASS_RANK } = await import('../core/agent/evidenceProvenance');
    expect(DEFAULT_EVIDENCE_CLASS_RANK.COMPUTATIONAL).toBeLessThan(DEFAULT_EVIDENCE_CLASS_RANK.INDIRECT_RANDOMISED);
    expect(DEFAULT_EVIDENCE_CLASS_RANK.UNVERIFIED).toBeLessThan(DEFAULT_EVIDENCE_CLASS_RANK.INDIRECT_RANDOMISED);
    // The two lowest ranks in the whole table, by construction.
    const ranks = Object.values(DEFAULT_EVIDENCE_CLASS_RANK);
    expect(DEFAULT_EVIDENCE_CLASS_RANK.UNVERIFIED).toBe(Math.min(...ranks));
  });
});

describe('the SYNTHETIC_TEST_ONLY winner fixture cannot reach the real Mounjaro/GLP-1R path', () => {
  it('syntheticWinnerFixture.ts is imported only by tests, the demo script, and its own clearly-named factory', () => {
    const importers = ALL_SOURCE.filter((f) => /from ['"].*syntheticWinnerFixture['"]/.test(readFileSync(f, 'utf8')));
    for (const f of importers) {
      const isAllowed = f.endsWith('govLowerHarmAdapters.ts') || f.includes('genesis-winner-recipe-e2e-demo');
      expect(isAllowed, `unexpected importer of the synthetic fixture: ${f}`).toBe(true);
    }
  });

  it('createProductionLowerHarmAdapters and createSyntheticWinnerLowerHarmAdapters are separate named exports — no shared default that could silently pick the synthetic one', () => {
    const path = join(FRONTEND_SRC, 'core', 'orchestrator', 'govLowerHarmAdapters.ts');
    const src = readFileSync(path, 'utf8');
    expect(src).toContain('export function createProductionLowerHarmAdapters(');
    expect(src).toContain('export function createSyntheticWinnerLowerHarmAdapters(');
  });

  it('mounjaroResearchRecipe.ts (the actual Mounjaro/GLP-1R/GIPR recipe builder) never imports the synthetic fixture', () => {
    const path = join(FRONTEND_SRC, 'core', 'discovery', 'molecular', 'mounjaroResearchRecipe.ts');
    const src = readFileSync(path, 'utf8');
    expect(src).not.toContain('syntheticWinnerFixture');
  });
});

describe('the recipe lock is structural: the LOCKED branch of MounjaroRecipeOutcome carries no recipe field', () => {
  it('MounjaroRecipeOutcome is a discriminated union, and the RECIPE_LOCKED member has no `recipe` key', () => {
    const path = join(FRONTEND_SRC, 'core', 'discovery', 'molecular', 'mounjaroResearchRecipe.ts');
    const src = readFileSync(path, 'utf8');
    const unionStart = src.indexOf('export type MounjaroRecipeOutcome');
    // Union members are object type literals whose OWN fields are `;`-separated
    // (`{ readonly status: 'X'; readonly recipe: Y }`), so the first `;` is
    // inside the first member, not the end of the type statement. The real
    // end is the blank line before the next top-level export.
    const unionBoundary = /\r?\n\r?\nexport const NON_CLINICAL_DISCLAIMER/g;
    unionBoundary.lastIndex = unionStart;
    const unionEnd = unionBoundary.exec(src)?.index ?? -1;
    expect(unionEnd).toBeGreaterThan(unionStart);
    const unionBlock = src.slice(unionStart, unionEnd);
    // Each union member is one `{ ... }` object literal on its own `|` line.
    const members = [...unionBlock.matchAll(/\{[^{}]*\}/g)].map((m) => m[0]);
    expect(members.length).toBeGreaterThanOrEqual(2);
    const lockedMember = members.find((m) => m.includes('RECIPE_LOCKED'));
    expect(lockedMember, 'no RECIPE_LOCKED member found in the union').toBeTruthy();
    expect(lockedMember).not.toMatch(/readonly recipe\s*:/);
    // And the issued branch DOES carry one, proving the union is real (both
    // branches reachable in principle), not a lock that's vacuous because
    // neither branch ever had the field.
    const issuedMember = members.find((m) => m.includes('RECIPE_ISSUED'));
    expect(issuedMember).toMatch(/readonly recipe\s*:/);
  });
});
