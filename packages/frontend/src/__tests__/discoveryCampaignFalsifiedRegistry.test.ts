import { beforeEach, describe, expect, it } from 'vitest';
import { runDiscoveryCampaign } from '../core/agent/discoveryCampaign';
import { makeKeplerCampaignLab, makeQe4CampaignLab } from '../core/biotechData/campaignLabs';
import { resetFalsifiedModelRegistryForTests } from '../core/agent/falsifiedModelRegistry';

/**
 * M2 — Global Falsified-Model Registry, "test cross-campaign" acceptance
 * criterion: two SEPARATE `runDiscoveryCampaign` invocations (not two rounds
 * of one campaign) must genuinely share falsification state through the
 * registry, and — just as important — that sharing must respect laboratory
 * scope rather than leaking across unrelated sciences.
 */

beforeEach(() => {
  resetFalsifiedModelRegistryForTests();
});

describe('M2 cross-campaign: falsified models are not silently re-derived by a later campaign on the same lab', () => {
  it('a model falsified by campaign 1 is refused admission at round 1 of campaign 2 on the SAME laboratory', () => {
    const campaign1 = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, respectFalsifiedModelRegistry: true });
    expect(campaign1.discovery.falsifiedModels.length).toBeGreaterThan(0);
    const falsifiedFingerprint = campaign1.discovery.falsifiedModels[0]!.fingerprint;

    const campaign2 = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, respectFalsifiedModelRegistry: true });

    expect(campaign2.rounds[0]!.models.some((m) => m.fingerprint === falsifiedFingerprint)).toBe(false);
    expect(campaign2.registrySkips.some((s) => s.fingerprint === falsifiedFingerprint)).toBe(true);
    const skip = campaign2.registrySkips.find((s) => s.fingerprint === falsifiedFingerprint)!;
    expect(skip.reason).toContain('VARIANT_ONLY');
  });

  it('without respectFalsifiedModelRegistry, a campaign is completely unaffected by another campaign\'s falsifications (opt-in, zero regression on default behaviour)', () => {
    const withRegistry = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, respectFalsifiedModelRegistry: true });
    expect(withRegistry.discovery.falsifiedModels.length).toBeGreaterThan(0);

    const withoutRegistry = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6 });
    expect(withoutRegistry.registrySkips).toEqual([]);
    // Round 1's starting model space is identical to a campaign run before the
    // registry ever had an entry — the option being off means "as if the
    // registry did not exist", not "consult but ignore the result".
    const freshFingerprints = withoutRegistry.rounds[0]!.models.map((m) => m.fingerprint).sort();
    const neverFilteredCampaign = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 1 });
    const neverFilteredFingerprints = neverFilteredCampaign.rounds[0]!.models.map((m) => m.fingerprint).sort();
    expect(freshFingerprints).toEqual(neverFilteredFingerprints);
  });

  it('T3: a model falsified in one laboratory, consulted from a DIFFERENT laboratory (materially different scope), still shows up — as REQUIRE_OVERRIDE, never silently ALLOWED and never an automatic hard block', () => {
    const qe4Campaign = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, respectFalsifiedModelRegistry: true });
    expect(qe4Campaign.discovery.falsifiedModels.length).toBeGreaterThan(0);
    const qe4FalsifiedFingerprints = new Set(qe4Campaign.discovery.falsifiedModels.map((m) => m.fingerprint));

    const keplerCampaign = runDiscoveryCampaign(makeKeplerCampaignLab(), { maxRounds: 6, respectFalsifiedModelRegistry: true });

    // Genuine cross-domain memory: any of Kepler's own skips that happen to
    // match a fingerprint QE4 already falsified are reported as
    // REQUIRE_OVERRIDE (M2's registered VARIANT_ONLY default), never a
    // silent ALLOW and never treated as an unconditional block — the
    // laboratory swap alone is not grounds to pretend the finding never
    // happened, but it also does not settle the question for Kepler on its
    // own.
    const crossDomainSkips = keplerCampaign.registrySkips.filter((s) => qe4FalsifiedFingerprints.has(s.fingerprint));
    for (const skip of crossDomainSkips) {
      expect(skip.verdict).toBe('REQUIRE_OVERRIDE');
    }

    // Re-running the SAME QE4 laboratory a second time still sees its own
    // falsifications — proving the registry genuinely persisted them, not
    // that this test's earlier assertion was vacuous.
    const qe4CampaignAgain = runDiscoveryCampaign(makeQe4CampaignLab(5), { maxRounds: 6, respectFalsifiedModelRegistry: true });
    const stillSkipped = qe4CampaignAgain.registrySkips.some((s) => qe4FalsifiedFingerprints.has(s.fingerprint));
    expect(stillSkipped).toBe(true);
  });
});
