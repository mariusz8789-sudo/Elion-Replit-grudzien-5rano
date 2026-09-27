import { describe, expect, it } from 'vitest';
import {
  createGenesisResearchPacket,
  MAX_RESEARCH_QUERY_LENGTH,
  replayGenesisResearchPacket,
} from '../core/experimentFabric';

describe('Genesis source-bound research packet', () => {
  it('retrieves only existing corpus and supplemental metadata for a science question', () => {
    const packet = createGenesisResearchPacket('Oblicz dylatację czasu w szczególnej względności Einsteina.');

    expect(packet.status).toBe('RETRIEVED');
    expect(packet.corpusSources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: 'corpus:spacetime-einstein.md',
        domainId: 'spacetime-einstein',
        locator: 'knowledge/spacetime-einstein.md',
      }),
    ]));
    expect(packet.supplementalSources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: 'supplemental:einstein-special-relativity',
        epistemicStatus: 'THEORY',
        source: expect.objectContaining({ locator: 'https://einsteinpapers.press.princeton.edu/' }),
      }),
    ]));
    expect(packet.disclaimer).toContain('Nie jest odpowiedzią naukową');
    expect(packet.disclaimer).not.toContain('NIE JEST ODPOWIEDZIĄ NAUKOWĄ');
  });

  it('replays deterministically despite query whitespace and case changes', () => {
    const first = createGenesisResearchPacket('  DYLATACJĘ    CZASU  ');
    const replay = replayGenesisResearchPacket('dylatację czasu');

    expect(first.normalizedQuery).toBe('dylatację czasu');
    expect(replay.normalizedQuery).toBe(first.normalizedQuery);
    expect(replay.packetFingerprint).toBe(first.packetFingerprint);
    expect(replay.corpusSources).toEqual(first.corpusSources);
    expect(replay.supplementalSources).toEqual(first.supplementalSources);
  });

  it('preserves knowledge-only capability rather than presenting a missing solver as runnable', () => {
    const packet = createGenesisResearchPacket('Tesla i silnik indukcyjny prądu przemiennego');
    const tesla = packet.supplementalSources.find((source) => source.sourceId === 'supplemental:tesla-polyphase-ac-history');

    expect(tesla).toMatchObject({
      capability: 'KNOWLEDGE_ONLY',
      registeredModelIds: [],
      requiredSolver: expect.stringContaining('solver elektromagnetyczny'),
    });
    expect(tesla?.limitation).toContain('nie stanowi dowodu');
  });

  it('returns an explicit no-match packet rather than an invented answer and rejects oversized queries', () => {
    const empty = createGenesisResearchPacket('niewystępująca-fraza-genesis-unikalna');

    expect(empty.status).toBe('NO_MATCH');
    expect(empty.corpusSources).toEqual([]);
    expect(empty.supplementalSources).toEqual([]);
    expect(() => createGenesisResearchPacket('x'.repeat(MAX_RESEARCH_QUERY_LENGTH + 1))).toThrow('must not exceed');
  });
});
