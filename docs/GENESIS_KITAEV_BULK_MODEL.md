# Genesis Q1 — ograniczony bulk model łańcucha Kitaeva

**Status:** `REAL_ENGINE` dla wyłącznie zdefiniowanego poniżej bezinterakcyjnego modelu bulk BdG. Nie jest silnikiem urządzenia Majorana 1, nanodrutu, materiału InAs–Al ani narzędziem interpretacji danych eksperymentalnych.

## Model

Genesis oblicza minimalny, translacyjnie niezmienny 1D model spinless p-wave. Dla parametrów `μ` (chemical potential), `t` (hopping) i `Δ` (p-wave pairing) korzysta z pasma:

\[
E(k)=\pm\sqrt{(-2t\cos k-\mu)^2+4\Delta^2\sin^2k}.
\]

Silnik minimalizuje `E(k)` analitycznie po `cos(k) ∈ [-1, 1]` i zwraca bulk gap, momentum minimum, krytyczne `μ = ±2|t|`, klasyfikację reżimu oraz indeks `-1 / 0 / +1` stosowany tu tylko jako wskaźnik minimalnego modelu.

| Wynik | Znaczenie |
|---|---|
| `TOPOLOGICAL_REGIME` | `|μ| < 2|t|` przy `Δ ≠ 0` w tym minimalnym bulk modelu. |
| `CRITICAL_BOUNDARY` | `|μ| = 2|t|`; bulk gap się zamyka, więc klasyfikacja jest niestabilna. |
| `TRIVIAL_REGIME` | `|μ| > 2|t|` w tym minimalnym bulk modelu. |

## Co zostało sprawdzone

Model i test kontraktowy sprawdzają analityczną granicę: dla `μ=0`, `t=1`, `Δ=1` obliczany jest reżim topologiczny i gap `2`; dla `μ=2`, `t=1`, `Δ=1` otrzymywany jest gap `0` oraz `CRITICAL_BOUNDARY`. Parser nie uruchamia modelu dla prośby o urządzenie Majorana 1 — utrzymuje właściwy `capability_seam`.

## Granice prawdy

> Skończony otwarty łańcuch może mieć rozszczepione niskoenergetyczne stany brzegowe. Q1 nie deklaruje bezwzględnych zero modes, nie estymuje ich długości lokalizacji i nie dowodzi topologiczności fizycznego urządzenia.

Q1 pomija spin, s-wave proximity pairing, Zeeman field, spin–orbit coupling, disorder, oddziaływania, geometrię kontaktów, kalibrację materiałową oraz pomiary. Te elementy są konieczne w drodze od toy model do realistycznego nanodrutu. [1] [2] [3]

## Q2 — interaktywny widok Quantum Lab

Q2 udostępnia eksperyment **„Łańcuch Kitaeva — bulk BdG”** w Quantum Lab. Canvas rysuje dodatnią i ujemną gałąź `±E(k)` oraz oznacza minimum gapu dla bieżących `μ`, `t` i `Δ`. Nie ma osobnej implementacji równania dla renderera: każdy punkt pasma korzysta z `kitaevBulkEnergyAtMomentum()`, a statystyki i narracja korzystają z tego samego `solveKitaevBulk()` co Q1.

| Element widoku Q2 | Źródło | Czego nie oznacza |
|---|---|---|
| Krzywe `±E(k)` | Bezpośrednie wartości pasma BdG minimalnego modelu. | Dopasowania do pomiarów materiału. |
| Przerywany marker | Obliczone minimum bulk gapu i jego momentum. | Stan brzegowy skończonego przewodu. |
| Reżim topologiczny / krytyczny / trywialny | Klasyfikacja z Q1 dla bieżących parametrów bulk. | Dowód modów Majorany w urządzeniu. |
| Panel narracji | Żywe wyniki solvera i jawne ostrzeżenia o granicach. | Potwierdzony run z provenance — do tego służy Science Chat i etap potwierdzenia. |

Kontrolne E2E dla `μ=0`, `t=1`, `Δ=1` pokazało reżim topologiczny bulk oraz `E_g=2`. Po ustawieniu `μ=2` interfejs pokazał granicę krytyczną oraz numerycznie zerowy gap (`2.449e-16`, w granicy precyzji zmiennoprzecinkowej). Test Q2 porównuje dane żywego Canvasu z wynikiem istniejącego solvera i utrzymuje obligatoryjny disclosure „nie symulacja nanodrutu … ani urządzenia Majorana 1”.

## Provenance i następny etap

Każdy run przechodzi przez kanoniczny `StructuredExperimentRequest → router → executor → ExperimentResult → provenance`. Q1 może być porównywany przez istniejący Counterfactual Evidence Compare i utrwalany przez Scenario Capsule, lecz nie zmienia epistemicznego statusu claimu Majorana 1.

Następny uczciwy krok to niezależnie benchmarkowany adapter QuTiP lub Kwant do zdefiniowanego problemu, po dostępności runtime’u i review eksperta. Nie należy rozszerzać Q1 do claimu o sprzęcie bez danych referencyjnych.

## References

[1] [Kitaev, *Unpaired Majorana fermions in quantum wires*](https://arxiv.org/abs/cond-mat/0010440)

[2] [Topology in Condensed Matter — *Bulk-edge correspondence in the Kitaev chain*](https://topocondmat.org/w1-topointro/d-1)

[3] [Topology in Condensed Matter — *From Kitaev chain to a nanowire*](https://topocondmat.org/w2_majorana/nanowire.html)
