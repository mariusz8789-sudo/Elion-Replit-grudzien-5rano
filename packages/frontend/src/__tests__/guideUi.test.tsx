import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GuideOverlay } from '../components/guide/GuideOverlay';
import { DEFAULT_VOICE_SETTINGS } from '../core/guide/voiceEngine';
import { INITIAL_SESSION } from '../core/guide/guideMachine';
import { followEvidenceSteps } from '../core/guide/followEvidence';
import { factsFromRun } from '../core/guide/narrationModel';
import type { LowerHarmRunDetail, LowerHarmWinnerRecord } from '../core/orchestrator/winnerRecord';
import type { RunResult } from '../core/orchestrator/govLowerHarmDiscovery';

const ARTIFACT_DIR = new URL('../../../../artifacts/lower-harm/', import.meta.url);
const readJson = <T,>(name: string): T => JSON.parse(readFileSync(new URL(name, ARTIFACT_DIR), 'utf8')) as T;
const detail = readJson<LowerHarmRunDetail>('run-detail.json');
const record = readJson<LowerHarmWinnerRecord>('winner-record.json');
const replayArtifact = readJson<{ runA: { auditFingerprint: string }; stages: RunResult['stages']; evidenceCustody: { sourceId: string; hash: string } }>('replay-verification.json');

const noop = (): void => {};

describe('GuideOverlay', () => {
  it('renders the caption, transport, level and language controls, and the voice toggle', () => {
    const html = renderToStaticMarkup(
      <GuideOverlay session={{ ...INITIAL_SESSION, state: 'GATE' }} caption="Dopiero teraz wynik przechodzi przez końcową bramkę." voiceState="SPEAKING" settings={DEFAULT_VOICE_SETTINGS}
        level="EXPLORER" plain={false} canNext canBack nextLabel="Dalej ▶" voiceSource="browser"
        onNext={noop} onBack={noop} onRepeat={noop} onPauseResume={noop} onTogglePlain={noop} onLevel={noop} onLang={noop} onVolume={noop} onToggleVoice={noop} onClose={noop} />,
    );
    expect(html).toContain('data-testid="guide-overlay"');
    expect(html).toContain('Dopiero teraz wynik przechodzi');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Wyjaśnij prościej');
    expect(html).toContain('Odkrywca'); expect(html).toContain('Naukowiec'); expect(html).toContain('Audytor');
    expect(html).toContain('Głos włączony');
    expect(html).toContain('głos: przeglądarka');
  });

  it('keeps the caption region when the voice is off (captions are the accessible fallback)', () => {
    const html = renderToStaticMarkup(
      <GuideOverlay session={{ ...INITIAL_SESSION, state: 'INTRO' }} caption="Witaj w Genesis." voiceState="OFF" settings={{ ...DEFAULT_VOICE_SETTINGS, enabled: false, lang: 'en' }}
        level="SCIENTIST" plain canNext={false} canBack={false} nextLabel="Next ▶" voiceSource={null}
        onNext={noop} onBack={noop} onRepeat={noop} onPauseResume={noop} onTogglePlain={noop} onLevel={noop} onLang={noop} onVolume={noop} onToggleVoice={noop} onClose={noop} />,
    );
    expect(html).toContain('Witaj w Genesis.');
    expect(html).toContain('Voice off');
    expect(html).toContain('guide-caption-plain');
  });
});

describe('followEvidenceSteps', () => {
  const facts = factsFromRun({
    kind: 'RUN', verdict: 'WINNER', mode: 'PRODUCTION', auditFingerprint: replayArtifact.runA.auditFingerprint, recipeFingerprint: 'r',
    stages: replayArtifact.stages, detail, winnerRecord: record,
    evidenceCustody: { ok: true, sourceId: replayArtifact.evidenceCustody.sourceId, record: { artifact: { hash: replayArtifact.evidenceCustody.hash, hashPolicy: 'sha256' } } },
  } as unknown as RunResult, { ok: true } as never);

  it('walks RESULT → gate → experiment → observations → source → hash → artifact over real provenance nodes', () => {
    const steps = followEvidenceSteps(facts, 'pl');
    expect(steps.map((s) => s.id)).toEqual(['result', 'score', 'experiment', 'observation', 'source', 'hash', 'artifact']);
    expect(steps.find((s) => s.id === 'hash')!.text).toContain(replayArtifact.evidenceCustody.hash.slice(0, 12));
    expect(steps.find((s) => s.id === 'observation')!.text).toContain(`${detail.evidence.length}`);
    for (const s of steps) expect(s.selector.startsWith('[data-testid')).toBe(true);
  });

  it('leaves out every step whose fact is missing', () => {
    const steps = followEvidenceSteps({ ...facts, custodyHash: null, custodyStatus: null, g2Observable: null }, 'en');
    expect(steps.map((s) => s.id)).toEqual(['result', 'score', 'observation', 'artifact']);
  });
});
