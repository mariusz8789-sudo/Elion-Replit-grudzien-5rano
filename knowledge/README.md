# Genesis Knowledge Base

Baza wiedzy projektowej Genesis OS. **Każdy nowy moduł platformy powstaje
w oparciu o odpowiedni katalog tej bazy** — projektowanie funkcji zaczyna się
tutaj, nie od kodu.

## Zasady

1. **Nie kopiujemy treści** — wszystkie opisy są własnymi streszczeniami
   i syntezami. Wzory, prawa fizyki i fakty nie podlegają prawu autorskiemu;
   cudzy tekst, rysunki i kod — tak (szczegóły licencyjne: `../RESEARCH.md`).
2. **Sprzeczne teorie opisujemy wszystkie** i oznaczamy poziomem potwierdzenia.
   Nie rozstrzygamy sporów, których nie rozstrzygnęła nauka.
3. **Aktualizacja w tym samym commicie co kod** — nowa funkcja laboratorium
   dopisuje swoje źródła, modele i ograniczenia do odpowiedniego pliku.
4. Status implementacji poszczególnych modeli śledzą raporty etapów
   (`../RAPORT-ETAP-*.md`); baza wiedzy opisuje naukę, nie stan kodu.

## Skala potwierdzenia naukowego

Używana we wszystkich plikach bazy:

| Symbol | Poziom | Znaczenie |
|---|---|---|
| ★★★★★ | ugruntowane | wielokrotnie potwierdzone eksperymentalnie; podstawa inżynierii |
| ★★★★ | silny konsensus | zgoda środowiska, otwarte szczegóły |
| ★★★ | aktywna debata | konkurujące modele, rozstrzygną dane |
| ★★ | hipoteza umotywowana | matematycznie spójna, brak potwierdzenia |
| ★ | spekulacja | idea badawcza / inżynieryjna fantazja |

Mapowanie na etykiety w aplikacji: ★★★★–★★★★★ → `exact`/`simplified`;
★★★ → `simplified` z notą o sporze; ★–★★ → `theoretical` (fiolet).

## Katalogi

| Plik | Laboratorium |
|---|---|
| [universe.md](universe.md) | Universe Lab — kosmologia, galaktyki, ciemny sektor |
| [spacetime-einstein.md](spacetime-einstein.md) | Space-Time + Einstein Lab — STW i OTW |
| [quantum.md](quantum.md) | Quantum Lab — mechanika kwantowa i informacja |
| [atom.md](atom.md) | Atom Lab — struktura atomowa, widma |
| [nuclear.md](nuclear.md) | Nuclear Lab — jądra, rozpady, energia |
| [particle.md](particle.md) | Particle Lab — Model Standardowy, dane LHC |
| [multiverse.md](multiverse.md) | Multiverse Lab — fine-tuning, hipotezy |
| [civilization.md](civilization.md) | Civilization Lab — Kardaszew, SETI |
| [ai-discovery.md](ai-discovery.md) | Warstwa AI — korpus, grounding, architektura |
| [scale-journey.md](scale-journey.md) | Scale Journey — dane rozmiarów, narracja skal |
