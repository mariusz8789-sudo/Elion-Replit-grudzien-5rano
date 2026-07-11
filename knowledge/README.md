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

Sześć poziomów, używanych we wszystkich plikach bazy. Poziomy 1–2 to
„potwierdzona eksperymentalnie" w dwóch odcieniach (pełna vs z otwartymi
szczegółami inżynieryjnymi); rest to opadająca drabina pewności aż do
poziomu, na którym teoria przestaje być nauką i staje się fikcją narracyjną.

| Symbol | Poziom | Znaczenie |
|---|---|---|
| ★★★★★ | potwierdzona eksperymentalnie (ugruntowana) | wielokrotnie zmierzona; podstawa inżynierii; nie ma sensownej alternatywy |
| ★★★★ | potwierdzona eksperymentalnie (silny konsensus) | zgoda środowiska co do rdzenia teorii, otwarte szczegóły techniczne |
| ★★★ | częściowo potwierdzona | konkurujące modele zgodne z dzisiejszymi danymi; rozstrzygną przyszłe pomiary |
| ★★ | hipoteza | matematycznie spójna, wyprowadzona z ugruntowanej teorii, ale bez potwierdzenia eksperymentalnego |
| ★ | spekulacja | aktywny program badawczy lub inżynieryjny, lecz bez spójnej teorii ani testu — idea, nie przewidywanie |
| ☆ | science fiction | fizycznie niesprzeczna jako myślowy eksperyment, ale bez żadnego realnego programu badawczego czy ścieżki inżynieryjnej (np. praktyczny napęd warp, podróże w czasie dla ludzi) — oznaczana wprost, żeby nie mylić z ★ |

Mapowanie na etykiety w aplikacji: ★★★★–★★★★★ → `exact`/`simplified`;
★★★ → `simplified` z notą o sporze; ★★–★ → `theoretical` (fiolet);
☆ → `theoretical` z jawną notą „scenariusz fabularny, nie hipoteza badawcza".

## Katalogi

| Plik | Laboratorium |
|---|---|
| [universe.md](universe.md) | Universe Lab — kosmologia, galaktyki, ciemny sektor |
| [spacetime-einstein.md](spacetime-einstein.md) | Space-Time + Einstein Lab — STW i OTW |
| [quantum.md](quantum.md) | Quantum Lab — mechanika kwantowa i informacja |
| [atom.md](atom.md) | Atom Lab — struktura atomowa, widma |
| [nuclear.md](nuclear.md) | Nuclear Lab — jądra, rozpady, energia |
| [particle.md](particle.md) | Particle Lab — Model Standardowy, dane LHC |
| [chemistry.md](chemistry.md) | Chemistry Lab — elektroujemność, wiązania chemiczne |
| [multiverse.md](multiverse.md) | Multiverse Lab — fine-tuning, hipotezy |
| [civilization.md](civilization.md) | Civilization Lab — Kardaszew, SETI |
| [biology.md](biology.md) | Biology Lab — błona komórkowa, DNA |
| [ai-discovery.md](ai-discovery.md) | Warstwa AI — korpus, grounding, architektura |
| [scale-journey.md](scale-journey.md) | Scale Journey — dane rozmiarów, narracja skal |
| [discovery-timeline.md](discovery-timeline.md) | Discovery Timeline Engine — 15 epok, Wielki Wybuch → daleka przyszłość |
| [quantum-decision-explorer.md](quantum-decision-explorer.md) | Quantum Decision Explorer — narzędzie narracyjne (NIE fizyka) |
| [classical-mechanics.md](classical-mechanics.md) | Fundament pod Universe/Civilization (bez własnego laba) |
| [electrodynamics.md](electrodynamics.md) | Fundament pod Atom/Particle (bez własnego laba) |
| [thermodynamics.md](thermodynamics.md) | Fundament pod Nuclear/Einstein (bez własnego laba) |
| [scientists.md](scientists.md) | Dossier 13 naukowców — jeden plik, nie rozproszone po katalogach domenowych |

## Poza zakresem dzisiejszej bazy (uczciwie, nie ukrywamy braków)

Brief poprosił o 14 działów. Osiem ma dziś katalogi (bezpośrednio powyżej
+ trzy nowe fundamentowe). Świadomie NIE rozwinięte jeszcze, żeby nie
tworzyć płytkich, niesprawdzonych 20-liniowych zaślepek pod hasłem
„gotowe": **chemia, chemia kwantowa, matematyka (jako odrębny dział, nie
tylko narzędzie fizyki), astronomia obserwacyjna (odrębnie od kosmologii w
`universe.md`), inżynieria kosmiczna.** Każdy z nich zasługuje na ten sam
poziom rzetelności (realne cytowania, oznaczone spory) co pliki istniejące
— to praca na kolejne sesje, nie akapit doklejony na siłę do tej.
