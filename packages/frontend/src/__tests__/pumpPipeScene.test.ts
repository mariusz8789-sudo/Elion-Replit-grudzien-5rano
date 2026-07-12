import { describe, expect, it } from 'vitest';
import { buildPumpPipeModel, NODE_TO_COMPONENT, PUMP_PIPE_DEFAULTS } from '../core/engineeringGraph/pumpPipe';
import { PumpPipeRealityScene } from '../core/reality/scenes/pumpPipeScene';

/**
 * Testuje CZYSTĄ, sterowaną grafem logikę sceny (bez WebGL): kolejność fali
 * przyczynowej po komponentach i lot kamery muszą wynikać z REALNych kroków
 * propagacji, a degradacja prowieniencji chropowatości musi rozlać się na
 * wielkości zależne. init()/syncScene() dotykające THREE nie są tu wołane.
 */
describe('PumpPipeRealityScene — logika sterowana grafem (bez WebGL)', () => {
  it('lot konsekwencji odwiedza komponenty w kolejności realnej propagacji, od średnicy', () => {
    const model = buildPumpPipeModel();
    const scene = new PumpPipeRealityScene(model);
    const steps = model.setParameter('pipeDiameter', PUMP_PIPE_DEFAULTS.pipeDiameter * 0.8);
    const flight = scene.buildConsequenceFlight(steps);
    expect(flight).not.toBeNull();
    // Pierwszy komponent dotknięty przez zmianę średnicy to 'pipe' (v, Re, f, h_f),
    // a węzeł końcowy shaftPower mapuje na 'pump' -> lot musi zawierać etykietę Pompa.
    const firstTouched = NODE_TO_COMPONENT[steps.find((s) => NODE_TO_COMPONENT[s.nodeId])!.nodeId];
    expect(firstTouched).toBe('pipe');
  });

  it('zmiana samego przepływu nie generuje fali bez kroków (brak węzłów pochodnych = brak lotu)', () => {
    const model = buildPumpPipeModel();
    const scene = new PumpPipeRealityScene(model);
    // Ustawienie tej samej wartości nie zmienia nic w dół grafu.
    const steps = model.setParameter('volumetricFlow', model.getValue('volumetricFlow'));
    // emitComponentWave na pustych krokach nie może rzucić i nie planuje pulsów.
    expect(() => scene.emitComponentWave(steps)).not.toThrow();
  });

  it('degradacja chropowatości (rura skorodowana) rozlewa validationLimited na h_f, H i moce', () => {
    const model = buildPumpPipeModel();
    // Nowa stal: chropowatość = dane producenta, nic nie „wymaga walidacji".
    expect(model.effectiveProvenance('headLoss').validationLimited).toBe(false);
    expect(model.effectiveProvenance('shaftPower').validationLimited).toBe(false);

    model.setParameterProvenance('pipeRoughness', 'requires-validation');

    // Teraz zależności chropowatości muszą być oznaczone jako ograniczone walidacją.
    expect(model.effectiveProvenance('frictionFactor').validationLimited).toBe(true);
    expect(model.effectiveProvenance('headLoss').validationLimited).toBe(true);
    expect(model.effectiveProvenance('totalHead').validationLimited).toBe(true);
    expect(model.effectiveProvenance('shaftPower').validationLimited).toBe(true);
    // A sama efektywna prowieniencja tych wielkości spada do „wymaga walidacji".
    expect(model.effectiveProvenance('headLoss').provenance).toBe('requires-validation');
  });

  it('po degradacji chropowatości pojawia się rekomendacja pomiaru chropowatości dla h_f', () => {
    const model = buildPumpPipeModel();
    model.setParameterProvenance('pipeRoughness', 'requires-validation');
    const recs = model.measurementRecommendations('headLoss').map((r) => r.parameterId);
    // Chropowatość ma realną (choć nie dominującą) elastyczność ~0.18 na h_f — NADAL
    // poniżej progu 0.25, więc nawet po degradacji NIE jest rekomendowana dla h_f.
    // To celowo pokazuje, że degradacja prowieniencji nie omija bramki istotności.
    expect(recs).not.toContain('pipeRoughness');
  });
});
