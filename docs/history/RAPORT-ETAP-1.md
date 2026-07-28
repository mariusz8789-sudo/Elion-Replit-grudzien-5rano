# Genesis OS — Raport Etapu 1

Data: 2026-07-08
Zasada etapu: **zero nowych laboratoriów — wyłącznie pogłębienie istniejących.**

## Co zostało dodane

**Architektura:** laboratorium przestało być pojedynczą symulacją — jest kolekcją
**eksperymentów** (`ExperimentDef` w `core/types.ts`, przełącznik zakładek w
`LabShell`). Każdy eksperyment ma własną fizykę, parametry, etykietę uczciwości
i narrację. Dodanie eksperymentu nie dotyka rdzenia — architektura pluginowa
zachowana na poziomie niżej.

**13 nowych eksperymentów** (każdy zaprojektowany z `knowledge/`):

| Laboratorium | Eksperyment | Fizyka |
|---|---|---|
| Quantum | **Tunelowanie** | równanie Schrödingera liczone NA ŻYWO (split-step Fourier, FFT 512 pkt) — transmisja/odbicie z prawdziwego \|ψ\|² |
| Quantum | **Sfera Blocha** | pełny stan kwantowy, bramki H/X/Y/Z/S/T jako dokładne macierze unitarne, pomiar z kolapsem, dekoherencja |
| Einstein | **Geodezyjne + dysk** | pełne równanie geodezyjnej zerowej Schwarzschilda (RK4), b_c = 2,598 r_s, dysk akrecyjny z asymetrią Dopplera |
| Einstein | **Soczewkowanie** | dokładne wzory soczewki punktowej: dwa obrazy, pierścień Einsteina, krzywa mikrosoczewkowania |
| Space-Time | **Stożki świetlne** | diagram Minkowskiego z transformacją Lorentza; względność kolejności zdarzeń na żywo |
| Universe | **Zderzenie galaktyk** | metoda Toomre & Toomre 1972 (1800 gwiazd, ogony pływowe), orbity pro/retrogradowe |
| Universe | **Życie gwiazdy** | L ∝ M³·⁵, t ∝ M⁻²·⁵, losy wg progów mas (BK/GN/CzD), supernowa |
| Nuclear | **Reakcja łańcuchowa** | neutrony + pręty kontrolne + wzbogacenie; k liczone ze zdarzeń symulacji |
| Nuclear | **Tokamak** | kryterium Lawsona n·T·τ_E z werdyktem zapłonu; parametry vs ITER |
| Particle | **Odkryj cząstkę** | histogram masy niezmienniczej: piki J/ψ, ψ(2S), Υ, Z⁰ wyrastają z szumu (masy z PDG) |
| Civilization | **Kolonizacja** | model perkolacyjny ekspansji międzygwiezdnej z ekstrapolacją na Galaktykę |
| Atom | **Orbitale \|ψ\|²** | dokładne rozwiązania analityczne wodoru (1s–3d), widoczne węzły radialne i płaty |
| Multiverse | **Scenariusze** | presety: „bez węgla", „wybuchowe gwiazdy", „ciężka grawitacja" z audytem konsekwencji |

## Co poprawiono
- LabShell przepisany pod eksperymenty (wstecznie kompatybilny — Etap 0 działa bez zmian)
- Narracje wiążą laboratoria (tokamak → tunelowanie; kolonizacja → paradoks Fermiego)
- Weryfikacja: build zielony (89 kB gzip), smoke-test przeglądarkowy 13 nowych
  ekranów na viewporcie 390×844 — zero błędów konsoli

## Największe ograniczenia (stan uczciwie)
1. **AI Discovery wciąż bez LLM** — pytania otwarte wymagają backendu z kluczem
   API; interfejs gotowy, decyzja o wdrożeniu (koszty!) należy do Ciebie
2. Rendering czarnej dziury to widok "z góry" — pełne soczewkowanie dysku
   (widok Interstellar) wymaga shaderów WebGL (Etap 2)
3. Dane cząstek syntetyczne (choć masy prawdziwe) — realne CSV z CERN Open Data
   (CC0) to najlepszy następny krok wiarygodności
4. Splątanie/CHSH i teleportacja — zaprojektowane w knowledge/quantum.md,
   nie zaimplementowane (świadomy wybór: tunelowanie + Bloch miały wyższy
   stosunek wartości do ryzyka)
5. Wciąż brak testów jednostkowych fizyki (sims są czystym TS — łatwe do
   otestowania; dług rośnie z każdym modelem)

## Następny krok (propozycja Etapu 2, w kolejności)
1. **Testy fizyki** (transmisja tunelowania vs wzór analityczny, k reaktora,
   pozycje obrazów soczewki) — zanim baza modeli urośnie
2. **PWA offline** (manifest + service worker) — tanio, a odblokowuje "działa
   w samolocie" jako feature
3. **Splątanie + gra CHSH** (knowledge/quantum.md ma pełny projekt)
4. **Realne dane CERN** w "Odkryj cząstkę" (pakiet CSV, CC0)
5. **Decyzja produktowa:** backend LLM (koszty/klucz) albo pilot EDU z tym,
   co jest — rekomendacja: najpierw pilot, LLM po pierwszym feedbacku
