# PROMPTS — zadania rozdzielone między sesje

Prompty są tu, a nie w czacie, bo czat ginie, a zadanie zostaje. Każdy jest
SAMOWYSTARCZALNY: podaje gałąź, stan wejściowy z hashem commita, zasady twarde
i definicję DONE, więc sesja przyjmująca nie musi rekonstruować kontekstu.

| Plik | Dla | Pakiet | Stan wejściowy |
|---|---|---|---|
| `C2-P1-higiena-testow-i-danych.md` | C2 | P1.1–P1.3 (+ R-001 jako bonus) | P0 zamknięte na `5f88c8f` |
| `C3-P2.1-tautology-gate.md` | C3 | P2.1 — **zaczyna od blokera** | spec nie istnieje w repo |
| `QWEN-P2.3-kotwica-zewnetrzna.md` | Qwen | P2.3 + P2.2 (pakiet badawczy) | R-005 w `RISKS.md` |
| `QWEN-QE4-QE7-obserwable.md` | Qwen | QE4–QE7 (pakiet badawczy) | QE1–QE3 zamknięte na `43a6a8e` |
| `C3-P2.3-kepler-anchor-i-P2.2-solar-ingestion.md` | C3 | druga kotwica (Kepler) + ingestion Solar Mind | Qwen dostarczył pakiet (trafił do C3 przez pomyłkę); P2.3 (PubChem) już DONE na `c181668`/`14312f8` |

Co zostaje u C1: P2.3 (implementacja po pakiecie Qwena) i P3 (pakiet grantowy).

## Dwa wspólne warunki odbioru dla KAŻDEGO z tych zadań

1. **Dowód albo `NOT VERIFIED`.** Twierdzenie „naprawione/zweryfikowane" bez
   komendy, wyjścia i hasha commita nie jest raportem, jest deklaracją.
2. **Brak wejścia = BLOCKED, nie improwizacja.** Jeśli zadanie odwołuje się do
   pliku/danych, których nie ma (jak spec Tautology Gate), właściwą odpowiedzią
   jest zgłoszenie tego, a nie wymyślenie treści i podpisanie jej jako cudzą.
