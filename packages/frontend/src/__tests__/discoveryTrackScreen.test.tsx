import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeDiscoveryTrack, DiscoveryTrackView, NO_ACCESS_LITERATURE_CLIENT } from '../components/DiscoveryTrackScreen';
import { ALL_SELF_FALSIFICATION_PROBES } from '../core/agent/discoveryContracts';
import { resetFalsifiedModelRegistryForTests } from '../core/agent/falsifiedModelRegistry';
import { resetNoveltyGateRegistryForTests } from '../core/agent/noveltyGate';

/**
 * #/discovery-track — static-markup test (this repo's component-test pattern,
 * see mirrorStatusScreen.test.tsx: no jsdom). The screen must render exactly
 * what `runGenuineDiscoveryPipeline` returned on the two bundled records:
 * nothing here pins an outcome the pipeline did not compute — the QE4
 * assertion compares the markup against the record itself and only adds the
 * one invariant Phase F exists for (never DISCOVERY without external L5/L6).
 */

beforeEach(() => {
  resetFalsifiedModelRegistryForTests();
  resetNoveltyGateRegistryForTests();
});

describe('DiscoveryTrackScreen — the tested discovery layer is visible, on real campaign records', () => {
  it('renders both records, the 13 probes each, the NO_ACCESS caveat, and the status the pipeline computed', async () => {
    const result = await computeDiscoveryTrack();
    const kepler = result.entries.find((e) => e.id === 'kepler')!;
    const qe4 = result.entries.find((e) => e.id === 'qe4')!;
    expect(kepler.record).not.toBeNull();
    expect(qe4.record).not.toBeNull();

    const markup = renderToStaticMarkup(<DiscoveryTrackView result={result} />);

    // Both bundled records are on the page.
    expect(markup).toContain('data-testid="discovery-track-kepler"');
    expect(markup).toContain('data-testid="discovery-track-qe4"');

    // QE4: whatever the pipeline returned is what is shown — and it is not DISCOVERY.
    expect(qe4.record!.status).not.toBe('DISCOVERY');
    expect(markup).toContain(`data-testid="discovery-track-qe4" data-status="${qe4.record!.status}"`);
    expect(markup).toContain(`<strong data-testid="status-code-qe4">${qe4.record!.status}</strong>`);
    expect(markup).toContain(`<strong data-testid="status-code-kepler">${kepler.record!.status}</strong>`);
    expect(markup).toContain(`data-testid="fingerprint-qe4">${qe4.record!.outcomeFingerprint}<`);

    // 13 probe rows per record, in the contract's own order, with the verdict the battery produced.
    const rows = markup.match(/data-testid="probe-row"/g) ?? [];
    expect(rows.length).toBe(2 * ALL_SELF_FALSIFICATION_PROBES.length);
    for (const probe of qe4.record!.selfFalsification.probes) {
      expect(markup).toContain(`data-probe="${probe.name}" data-verdict="${probe.result}"`);
    }

    // The literature caveat and the epistemic caveat are visible, in Polish.
    expect(markup).toContain('Literatura (OpenAlex/Crossref): NO_ACCESS w tym środowisku — dlatego status nie może przekroczyć UNKNOWN.');
    expect(markup).toContain('Ścieżka deterministyczna, bez LLM; status końcowy nigdy nie jest promowany powyżej tego, co dowody pozwalają.');
    expect(markup).toContain('data-testid="discovery-track-caveat"');
  });

  it('the injected literature client never performs a network call — it reports NO_ACCESS by construction', async () => {
    await expect(NO_ACCESS_LITERATURE_CLIENT.search({ text: 'anything' })).rejects.toThrow(/NO_ACCESS/);
    const result = await computeDiscoveryTrack();
    const qe4 = result.entries.find((e) => e.id === 'qe4')!.record!;
    expect(qe4.noveltyEvidence.l5ExternalLiteratureSearch).toBe('NO_ACCESS');
    expect(qe4.noveltyEvidence.l6PostDiscoveryRecheck).toBe('NO_ACCESS');
  });

  it('is deterministic — two computations render identical markup', async () => {
    const a = renderToStaticMarkup(<DiscoveryTrackView result={await computeDiscoveryTrack()} />);
    resetFalsifiedModelRegistryForTests();
    resetNoveltyGateRegistryForTests();
    const b = renderToStaticMarkup(<DiscoveryTrackView result={await computeDiscoveryTrack()} />);
    expect(a).toBe(b);
  });
});
