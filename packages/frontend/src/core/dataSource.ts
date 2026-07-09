/**
 * Rejestr źródeł danych — ten sam wzorzec co core/registry.ts dla laboratoriów,
 * świadomie: jedna sprawdzona architektura pluginowa zamiast dwóch różnych.
 *
 * Cel: każdy zestaw danych używany przez symulację (rezonanse cząstek,
 * przyszłe efemerydy planet, katalogi gwiazd) deklaruje SKĄD pochodzi i
 * czy jest realny czy syntetyczny — zamiast chować tę informację w
 * komentarzu w kodzie (tak jak robił to dotąd particle-invmass.ts).
 *
 * Podmiana syntetyczne → realne nie wymaga przebudowy aplikacji: loader
 * źródła sprawdza czy plik z realnymi danymi istnieje (import.meta.glob)
 * i przełącza się automatycznie — mechanizm już sprawdzony w praktyce
 * (dimuon-real.ts), tu tylko sformalizowany i ujednolicony.
 */

import type { ConfirmationLevel } from './citation';

export interface DataSourceCitation {
  /** Skąd dane pochodzą lub pochodziłyby, gdyby były realne — np. "CERN Open Data". */
  label: string;
  url?: string;
  doi?: string;
  confirmation: ConfirmationLevel;
}

export interface DataSource<T> {
  id: string;
  /** Krótki opis po polsku, np. "Masy rezonansów dimionowych". */
  label: string;
  citation: DataSourceCitation;
  /** false = realne dane załadowane; true = generator/próbka syntetyczna. */
  isSynthetic: boolean;
  load: () => T;
}

const sources = new Map<string, DataSource<unknown>>();

export function registerDataSource<T>(source: DataSource<T>): void {
  if (sources.has(source.id)) {
    throw new Error(`Źródło danych "${source.id}" jest już zarejestrowane`);
  }
  sources.set(source.id, source as DataSource<unknown>);
}

export function getDataSource<T>(id: string): DataSource<T> | undefined {
  return sources.get(id) as DataSource<T> | undefined;
}

export function getDataSources(): readonly DataSource<unknown>[] {
  return Array.from(sources.values());
}
