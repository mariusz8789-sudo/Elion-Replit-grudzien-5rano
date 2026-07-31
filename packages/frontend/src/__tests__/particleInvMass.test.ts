import { describe, expect, it } from 'vitest';
import { particleInvMass } from '../labs/experiments/particle-invmass';
import { getDataSource } from '../core/dataSource';

/**
 * Uczciwość naukowa Particle Lab → "Odkryj cząstkę": w tym środowisku
 * budowania nigdy nie pobrano prawdziwych danych CERN Open Data (sieć
 * zablokowana, patrz README „Znane ograniczenia") — źródło musi więc
 * być jawnie oznaczone jako syntetyczne, a nota widoczna w UI musi to
 * odzwierciedlać, bez fałszywych/przestarzałych obietnic ("plan Etapu 2").
 */
describe('Particle Lab → Odkryj cząstkę: przejrzystość danych syntetycznych vs realnych', () => {
  it('rejestruje źródło danych dimionowych z jawną flagą isSynthetic', () => {
    const src = getDataSource<number[] | null>('particle.dimuon-masses');
    expect(src).toBeDefined();
    expect(typeof src?.isSynthetic).toBe('boolean');
  });

  it('honestyNote jest spójna ze stanem isSynthetic tego źródła (jedno źródło prawdy)', () => {
    const src = getDataSource<number[] | null>('particle.dimuon-masses');
    if (src?.isSynthetic) {
      expect(particleInvMass.honestyNote).toMatch(/SYNTETYCZNE|syntetyczne/);
      expect(particleInvMass.honestyNote).not.toMatch(/prawdziwe pomiary CERN Open Data/);
    } else {
      expect(particleInvMass.honestyNote).toMatch(/prawdziwe pomiary CERN Open Data/);
    }
  });

  it('nie zawiera przestarzałej/fałszywej obietnicy odnośnie przyszłego etapu', () => {
    expect(particleInvMass.honestyNote).not.toMatch(/plan Etapu/i);
  });

  it('masy i szerokości rezonansów cytowane są jako potwierdzone (PDG), niezależnie od źródła zdarzeń', () => {
    expect(particleInvMass.honestyNote).toMatch(/PDG/);
    expect(particleInvMass.honesty).toBe('educational');
  });
});
