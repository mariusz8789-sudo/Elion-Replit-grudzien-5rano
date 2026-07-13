import { describe, expect, it } from 'vitest';
import '../labs/index';
import { getLabs } from '../core/registry';
import { customStageMode } from '../components/CustomExperimentTab';

/**
 * Regresja błędu runtime „TypeError: t.createSim is not a function".
 *
 * Zakładka „Stwórz eksperyment" (CustomExperimentTab) dawniej zakładała
 * `lab.createSim!()`. Laboratoria z bazą WYŁĄCZNIE 3D (Chemia, Biologia) nie
 * mają `createSim`, więc otwarcie ich zakładki „Stwórz eksperyment" wywalało
 * całą aplikację do ErrorBoundary. Ten test pilnuje, że KAŻDE laboratorium
 * dostępne przez LabShell (bez własnego CustomView) ma dającą się wyrenderować
 * scenę bazową — 2D albo 3D — i nigdy nie trafia w gałąź „none".
 */

describe('customStageMode', () => {
  it('wybiera 2D dla createSim, 3D dla createSim3D, none dla braku', () => {
    expect(customStageMode({ createSim: () => ({}) as never })).toBe('2d');
    expect(customStageMode({ createSim3D: () => ({}) as never })).toBe('3d');
    expect(customStageMode({})).toBe('none');
  });

  it('preferuje 2D, gdy są obie sceny (spójne z LabShell)', () => {
    expect(customStageMode({ createSim: () => ({}) as never, createSim3D: () => ({}) as never })).toBe('2d');
  });

  it('każde laboratorium LabShell (bez CustomView) ma bazową scenę 2D lub 3D', () => {
    const labShellLabs = getLabs().filter((l) => !l.CustomView);
    expect(labShellLabs.length).toBeGreaterThan(0);
    for (const lab of labShellLabs) {
      // Kluczowa asercja regresji: Chemia i Biologia (baza 3D) NIE mogą dać 'none'.
      expect(customStageMode(lab), `Laboratorium „${lab.id}" nie ma bazowej sceny — zakładka „Stwórz eksperyment" by się wywaliła`).not.toBe('none');
    }
  });

  it('Chemia i Biologia rozwiązują się do sceny 3D (dawny crash)', () => {
    const byId = new Map(getLabs().map((l) => [l.id, l]));
    for (const id of ['chemistry', 'biology']) {
      const lab = byId.get(id);
      expect(lab, `brak laboratorium ${id}`).toBeDefined();
      expect(customStageMode(lab!)).toBe('3d');
    }
  });
});
