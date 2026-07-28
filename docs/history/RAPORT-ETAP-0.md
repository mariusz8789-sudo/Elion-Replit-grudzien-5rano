# Genesis OS — Raport Etapu 0

Data: 2026-07-07

## Co zostało wykonane

**Wszystkie 10 laboratoriów działa** — każde ma ekran, architekturę pluginową,
działającą symulację i Narratora AI reagującego na żywe parametry:

| Laboratorium | Pierwsza symulacja | Poziom wierności |
|---|---|---|
| Universe Lab | Ekspansja Friedmanna: H₀, Ω_Λ, redshift | model uproszczony |
| Space-Time Lab | Zegary świetlne — dylatacja czasu + paradoks bliźniąt | dokładne wzory STW |
| Einstein Lab | Ugięcie fotonów przy czarnej dziurze; metryki Schwarzschilda/Kerra/Alcubierre'a | uproszczony / hipoteza oznaczona |
| Quantum Lab | Dwie szczeliny: pojedyncze cząstki → prążki; pomiar niszczy interferencję | dokładny rozkład \|ψ\|² |
| Atom Lab | Układ okresowy 118 pierwiastków + model powłokowy | model edukacyjny |
| Nuclear Lab | Rozpad promieniotwórczy 308 jąder, 4 izotopy, symulacja vs teoria | dokładne prawo rozpadu |
| Particle Lab | Detektor zderzeń: krzywizna torów ∝ p/qB | model edukacyjny |
| Multiverse Lab | Alternatywne stałe: G, α, siła silna → konsekwencje | model teoretyczny |
| Civilization Lab | Skala Kardaszewa ze wzorem Sagana; planeta → rój Dysona → galaktyka | teoria + hipotezy oznaczone |
| AI Discovery Lab | Centrum warstwy AI: propozycje eksperymentów, Q&A, status providera | — |

Ponadto:
- **Scale Journey** (ekran główny): płynny zoom 10⁻¹⁸ → 8,8×10²⁶ m z rzeczywistymi
  rozmiarami 17 obiektów-kamieni milowych + tryb automatycznej podróży
- **Architektura pluginowa**: rejestr `core/registry.ts`, kontrakty `core/types.ts`;
  nowe laboratorium nie wymaga zmian w rdzeniu
- **Narrator AI v0**: deterministyczny silnik liczący realne wielkości (γ, r_s,
  aktywność izotopu…) z parametrów symulacji; interfejs providera gotowy pod LLM
- **System uczciwości naukowej**: 4-poziomowe etykiety + noty "co upraszczamy"
  na każdym module
- Zweryfikowano: build produkcyjny zielony (69 KB gzip), smoke-test w przeglądarce
  mobilnej (390×844) — zero błędów konsoli na wszystkich 11 ekranach

## Czego nie udało się zrobić (świadomie odłożone)

- **Backend + LLM w Narratorze** — wymaga klucza API i proxy; interfejs gotowy,
  podpięcie w Etapie 1
- **WebGL/3D** — Etap 0 renderuje w Canvas 2D; wystarcza dla obecnych symulacji,
  ale mgławice i orbitale 3D będą potrzebowały WebGL (Etap 1–2)
- **PWA offline (manifest + service worker)** — drobne, dopisać na początku Etapu 1
- **Zapis stanów, konta, społeczność** — zgodnie z roadmapą Etap 3
- Z briefu: fale grawitacyjne, soczewkowanie, tokamak, bramki kwantowe, splątanie,
  dżety kwarkowe — rozpisane w polach `roadmap` poszczególnych laboratoriów

## Co należy poprawić

1. Układ okresowy na telefonie wymaga przewijania poziomego — do rozważenia
   widok kompaktowy (grupy zwinięte)
2. Universe Lab: przy dużym czynniku skali galaktyki opuszczają ekran — kamera
   powinna się oddalać (komowanie skali ekranu)
3. Narrator odświeża się skokowo przy szybkim przesuwaniu suwaków — dodać debounce
4. Brak testów jednostkowych fizyki — silniki symulacji są czystym TS, więc łatwo
   je otestować; zrobić to w Etapie 1 zanim urośnie liczba modeli

## Największe ryzyka

1. **Głębia vs szerokość**: 10 płytkich laboratoriów nie zrobi retencji — Etap 1
   musi pogłębić 2–3 najmocniejsze (Quantum, Einstein, Universe), nie dodawać nowych
2. **Canvas 2D się skończy**: przy mgławicach/orbitalach potrzebny WebGL; kontrakt
   Sim ma metodę render jako adapter, więc wymiana jest lokalna, ale to realna praca
3. **Warstwa LLM = koszty i halucynacje**: wymaga backendu, limitów i twardego
   groundingu w parametrach symulacji (architektura już to wymusza)
4. **Brak zdefiniowanego pierwszego płacącego klienta** — rekomendacja z memo
   strategicznego (EDU/planetaria) pozostaje w mocy

## Propozycja Etapu 1 (kolejność uzasadniona)

1. **PWA offline + testy fizyki** (fundament, tanio, od razu)
2. **Pogłębienie Quantum Lab**: splątanie/Bell, tunelowanie (pakiet falowy 1D),
   sfera Blocha — najmocniejszy kandydat na "WOW, którego nikt nie ma na telefonie"
3. **Einstein Lab**: pełne geodezyjne Schwarzschilda + dysk akrecyjny (drugi WOW)
4. **LLM w Narratorze** przez backend proxy (pytania otwarte w kontekście symulacji)
5. **Zapis/odtwarzanie eksperymentów** (przygotowanie pod społeczność w Etapie 3)

Zmiana wobec briefu: NIE dodajemy nowych laboratoriów w Etapie 1 — pogłębiamy
istniejące. Uzasadnienie: ryzyko nr 1.
