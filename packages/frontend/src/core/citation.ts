/**
 * Skala potwierdzenia naukowego + typ cytowania — jedno miejsce prawdy,
 * współdzielone przez dataSource.ts (skąd dane) i narrator (co Narrator
 * twierdzi). Sześć poziomów dokładnie odpowiada `knowledge/README.md` —
 * ten plik jest kodowym odbiciem tamtej tabeli, nie osobną decyzją.
 */

export type ConfirmationLevel =
  | 'confirmed' // ★★★★★ potwierdzona eksperymentalnie (ugruntowana)
  | 'confirmed-consensus' // ★★★★ potwierdzona eksperymentalnie (silny konsensus)
  | 'partial' // ★★★ częściowo potwierdzona
  | 'hypothesis' // ★★ hipoteza
  | 'speculation' // ★ spekulacja
  | 'fiction'; // ☆ science fiction

export const CONFIRMATION_LABELS: Record<ConfirmationLevel, string> = {
  confirmed: '★★★★★ potwierdzona eksperymentalnie',
  'confirmed-consensus': '★★★★ potwierdzona (silny konsensus)',
  partial: '★★★ częściowo potwierdzona',
  hypothesis: '★★ hipoteza',
  speculation: '★ spekulacja',
  fiction: '☆ science fiction',
};

export interface Citation {
  /** Instytucja/publikacja, np. "Particle Data Group (PDG)". */
  source: string;
  confirmation: ConfirmationLevel;
  url?: string;
  doi?: string;
  /** Krótka nota — np. "J.J. Thomson 1897, Phil. Mag. 44, 293". */
  note?: string;
}
