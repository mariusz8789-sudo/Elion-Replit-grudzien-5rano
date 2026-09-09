/**
 * Data provenance — SKĄD pochodzi konkretna liczba, jako osobna oś od dwóch
 * już istniejących:
 *
 *  - `ConfirmationLevel` (`citation.ts`) ocenia, jak dobrze ugruntowana jest
 *    NAUKA stojąca za twierdzeniem (gwiazdki: potwierdzona…fikcja).
 *  - `ExperimentProvenance['resultOrigin']` (`experimentFabric/types.ts`)
 *    opisuje, JAK dany Fabric run został wykonany w obrębie istniejącej
 *    infrastruktury (prawdziwy silnik vs. wiedza statyczna vs. brak
 *    zdolności) — nie zmienia się przez to rozszerzenie.
 *
 * `DataProvenance` odpowiada na inne pytanie: czy ta konkretna wartość jest
 * wynikiem własnego modelu/solvera Genesis, zewnętrznym źródłem
 * referencyjnym, czy prawdziwym pomiarem laboratoryjnym. To rozróżnienie
 * musi przetrwać całą ścieżkę:
 *
 *   ExperimentFabric → ExperimentRun → Evidence → Memory → UI/Replay
 *
 * i nigdy nie może zostać pomylone: prawdziwe dane laboratoryjne nie mogą
 * zostać oznaczone jako SIMULATED ani zmieszane z danymi syntetycznymi w
 * jednym nieoznaczonym polu.
 */

export type DataProvenance = 'SIMULATED' | 'REFERENCE' | 'REAL_EXPERIMENTAL';

export const DATA_PROVENANCE_LABELS: Record<DataProvenance, string> = {
  SIMULATED: 'Wynik modelu/solvera Genesis',
  REFERENCE: 'Zewnętrzne dane referencyjne/literaturowe',
  REAL_EXPERIMENTAL: 'Wynik rzeczywistego eksperymentu laboratoryjnego',
};
