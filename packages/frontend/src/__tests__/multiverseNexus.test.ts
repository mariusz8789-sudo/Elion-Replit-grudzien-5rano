import { describe, expect, it } from 'vitest';
import '../labs/index';
import { getLab } from '../core/registry';
import { PORTALS } from '../labs/experiments/multiverse-nexus';

/**
 * Portale-tunele Multiverse Nexus muszą naprawdę prowadzić gdzieś, gdzie
 * użytkownik dostanie działającą symulację — te same reguły co
 * whatIfScenarios.test.ts (który sprawdza źródło tych samych parametrów).
 */
describe('Multiverse Nexus — portale', () => {
  it('ma unikalne id portali', () => {
    const ids = PORTALS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('każdy portal-tunel wskazuje istniejące laboratorium', () => {
    for (const p of PORTALS) {
      if (p.kind === 'wormhole') {
        expect(getLab(p.targetLabId), `portal "${p.id}" → nieznane lab "${p.targetLabId}"`).toBeDefined();
      }
    }
  });

  it('każdy nadpisany klucz parametru portalu-tunelu istnieje w docelowym laboratorium', () => {
    for (const p of PORTALS) {
      if (p.kind !== 'wormhole') continue;
      const lab = getLab(p.targetLabId)!;
      const validKeys = new Set(lab.params.map((d) => d.key));
      for (const key of Object.keys(p.targetParams)) {
        expect(validKeys.has(key), `portal "${p.id}": klucz "${key}" nie istnieje w ${p.targetLabId}.params`).toBe(true);
      }
    }
  });

  it('portale lokalne mają dodatnie stałe fizyczne (g, alpha, strong)', () => {
    for (const p of PORTALS) {
      if (p.kind !== 'local') continue;
      expect(p.g).toBeGreaterThan(0);
      expect(p.alpha).toBeGreaterThan(0);
      expect(p.strong).toBeGreaterThan(0);
    }
  });

  it('zawiera co najmniej jeden portal lokalny i jeden tunel', () => {
    expect(PORTALS.some((p) => p.kind === 'local')).toBe(true);
    expect(PORTALS.some((p) => p.kind === 'wormhole')).toBe(true);
  });
});
