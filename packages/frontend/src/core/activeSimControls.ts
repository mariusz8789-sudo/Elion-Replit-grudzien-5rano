/**
 * Rejestr sterowania AKTYWNEGO eksperymentu — most między globalnymi
 * skrótami klawiszowymi (App.tsx, poza drzewem laboratorium) a lokalnym
 * stanem pauzy/resetu wewnątrz LabShell. Bez tego globalny handler nie
 * miałby dostępu do `setRunning`/`sim.reset` konkretnego, aktualnie
 * otwartego eksperymentu.
 */

export interface ActiveSimControls {
  toggleRunning: () => void;
  reset?: () => void;
}

let active: ActiveSimControls | null = null;

/** Wywoływane przez ExperimentView przy montażu; zwraca funkcję wyrejestrowującą. */
export function registerActiveSimControls(controls: ActiveSimControls): () => void {
  active = controls;
  return () => {
    if (active === controls) active = null;
  };
}

export function toggleActiveSimRunning(): void {
  active?.toggleRunning();
}

export function resetActiveSim(): void {
  active?.reset?.();
}

export function hasActiveSim(): boolean {
  return active !== null;
}
