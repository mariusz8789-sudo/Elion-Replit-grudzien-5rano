# Mockupy — WORLD FIRST → OBJECT SECOND → RESEARCH THIRD

Makiety do etapu MOCKUP z Master Promptu. **Nie są produktem, nie wchodzą do buildu,
nie są importowane przez żaden moduł runtime.** Kontrakt, który realizują:
[`docs/DESIGN_WORLD_FIRST.md`](../docs/DESIGN_WORLD_FIRST.md).

## Co tu jest

- `project/*.dc.html` — 19 artboardów (desktop 1440×900, mobile 390×844).
- `project/canvas.json` — układ płótna.
- `generate.py` — generator tych plików. Zmiana makiety = zmiana generatora i ponowne uruchomienie.
- `assets/` — „plates": czyste klatki 3D **z realnie działającej aplikacji**, bez HUD-u,
  zdejmowane przez `scripts/capture-mockup-plates.mjs`. Nie są w gicie (duże, odtwarzalne).

## Dlaczego tło jest prawdziwe

Tłem makiet Human Biology jest zrzut z faktycznego rendera Genesis po D-131 — z licencjonowanym
ciałem CC0, nie grafika koncepcyjna. Skrypt czeka, aż HUD zgłosi `data-tier="LICENSED_CC0_ASSET"`,
więc plate nigdy nie pokazuje proxy udającego licencjonowany model.

Światy, których jeszcze nie renderujemy w docelowej formie (CERN, Cosmos), są w makietach
zbudowane z CSS i przedstawiają **układ i mechanikę**, nie obiecany render.

## Czego makiety NIE obiecują

Referencje wizualne pokazują fotorealistyczną anatomię i zdjęcia mikroskopowe.
Genesis nie ma takich danych. W makietach każdy taki kafelek nosi etykietę
`MODEL` / `SIMULATED` / `SCHEMATIC` i podpis mówiący wprost, że to nie jest obserwacja.

## Bramka

Implementacja zaczyna się dopiero po tym, jak użytkownik napisze `AKCEPTUJĘ DESIGN`.
