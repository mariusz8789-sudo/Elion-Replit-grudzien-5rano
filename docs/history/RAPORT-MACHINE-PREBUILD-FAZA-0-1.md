# Machine Pre-Build Simulator — Raport Founder (Faza 0 + Faza 1)

**Zakres autoryzowany:** wyłącznie Faza 0 (fundament grafu inżynierskiego) i Faza 1
(uczciwy MVP pre-build jednej maszyny). Bez CFD/FEA/DEM, bez solverów pól, bez
ingestii szkiców, bez generowania grafu przez AI. Poniżej raport w 15 punktach.

---

## 1. Pliki dodane / zmienione

**Nowe — rdzeń inżynierski (Faza 0):**
- `packages/frontend/src/core/engineeringGraph/valueModel.ts` — typowany model wartości.
- `packages/frontend/src/core/engineeringGraph/provenance.ts` — oś prowieniencji + propagacja.
- `packages/frontend/src/core/engineeringGraph/sensitivity.ts` — analiza wrażliwości + rekomendacje pomiarowe.
- `packages/frontend/src/core/engineeringGraph/EngineeringModel.ts` — nadbudowa nad `ModelGraph`.
- `packages/frontend/src/core/engineeringGraph/pumpPipe.ts` — demonstrator pompa–rurociąg (Faza 1).

**Nowe — warstwa wizualna / UI (Faza 1):**
- `packages/frontend/src/core/reality/scenes/pumpPipeScene.ts` — schematyczna scena maszyny 3D.
- `packages/frontend/src/components/EngineeringNavigator.tsx` — UI pre-build.

**Nowe — testy:**
- `packages/frontend/src/__tests__/engineeringGraph.test.ts`
- `packages/frontend/src/__tests__/pumpPipe.test.ts`
- `packages/frontend/src/__tests__/pumpPipeScene.test.ts`

**Zmienione (addytywnie, wstecznie zgodne):**
- `packages/frontend/src/core/reality/RealityEngine.ts` — dodany getter `viewportAspect` (kadrowanie zależne od aspektu). Bez zmian zachowania istniejących scen.
- `packages/frontend/src/App.tsx` — trasa `#/prebuild`, kafelek na ekranie głównym, aktywacja persystentnego canvasu dla nowej trasy.
- `packages/frontend/src/styles.css` — klasy `.prebuild-*` (nadbudowa nad istniejącymi `.reality-*`).

**Nie tknięto:** 13 zweryfikowanych laboratoriów, 3 istniejące grafy fizyczne
(`orbitalGraph`, SEMF, astrofizyka relatywistyczna), Reality Navigator (`#/reality`),
`core/modelGraph/graph.ts` (poza wcześniej scommitowaną, wspólną infrastrukturą
`derivation`/`causedBy`/`applyParameterSnapshot`).

---

## 2. Zmiany architektoniczne

Warstwa inżynierska jest **czysto addytywną nadbudową** nad niezmienionym,
wykonywalnym `ModelGraph`. Kluczowa decyzja: **`ModelGraph` pozostaje skalarny.**
Distribution / time-series / field-ref w `valueModel.ts` to **typowane placeholdery
oznaczone `computed: false`** — bo ich propagacja wymagałaby solvera, którego Faza 1
zabrania. `EngineeringModel` owija JEDNĄ instancję grafu i dokłada trzy rzeczy, których
warstwa naukowa nie miała: prowieniencję, rodzaj wartości, wrażliwość+rekomendacje.

Dzięki temu 3 grafy fizyczne i cały Reality System działają bez zmian, a nowy symulator
korzysta z tej samej, wcześniej zweryfikowanej maszynerii propagacji.

**Trzy osie epistemiczne (teraz):**
1. `HonestyLevel` (exact→cinematic) — jak wiarygodny jest cały model.
2. `NodeDerivation` (direct/approximate/interpretive) — jak węzeł wiąże się z wejściami.
3. **`Provenance` (7 stanów, NOWE)** — SKĄD wzięła się liczba.

---

## 3. Wybrana maszyna i uzasadnienie

**Układ POMPA–RUROCIĄG** (pompowanie cieczy przez rurę na wysokość statyczną).
Wybrany świadomie, bo:
- **Cała fizyka jest zamkniętoformułowa i podręcznikowa** — żadnego równania nie
  trzeba „wymyślać", nic nie wymaga solvera numerycznego.
- **Wrażliwość jest spektakularna i pouczająca:** strata ciśnienia ∝ D⁻⁵. Zmiana
  średnicy rury dominuje wynik w sposób, który idealnie demonstruje sens rankingu
  wrażliwości i rekomendacji pomiarowych — dokładnie to, po co istnieje pre-build.
- Zawiera **dokładnie jeden model empiryczny** (Swamee–Jain dla współczynnika tarcia),
  co pozwala czysto pokazać oddzielenie „obliczone dokładnie" od „korelacja empiryczna".

---

## 4. Kompletny łańcuch przyczynowy

8 parametrów → 7 wielkości pochodnych, w kolejności zależności:

```
Q, D                → v   = Q/(πD²/4)                     [dokładne]
ρ, v, D, μ          → Re  = ρvD/μ                          [dokładne]
Re, ε, D            → f   = Swamee–Jain(Re, ε/D)           [MODEL EMPIRYCZNY]
f, L, D, v          → h_f = f·(L/D)·v²/(2g)                [dokładne z f]
h_f, H_stat         → H   = H_stat + h_f                   [dokładne]
ρ, Q, H             → P_h = ρgQH                           [dokładne]
P_h, η              → P_wał = P_h/η                        [dokładne, ograniczone przez η]
```

Każdy krok propagacji zapisuje `causedBy` (które wejścia się zmieniły) — UI pokazuje to
dosłownie: „← bo zmieniło się: Prędkość przepływu v, Średnica rury D".

---

## 5. Równania i ich prowieniencja (wszystkie cytowane, żadne „wymyślone przez AI")

| Wielkość | Równanie | Źródło | Prowieniencja modelu |
|---|---|---|---|
| Prędkość v | v = Q/(πD²/4) | definicja przepływu przez przekrój | obliczone |
| Reynolds Re | Re = ρvD/μ | definicja bezwymiarowa | obliczone |
| Wsp. tarcia f | f = 0,25/[log₁₀(ε/(3,7D)+5,74/Re⁰·⁹)]² | Swamee–Jain (1976), przybliżenie Colebrooka–White'a | **model empiryczny** |
| (laminar) | f = 64/Re | Hagen–Poiseuille (dokładne) | obliczone |
| Strata h_f | h_f = f·(L/D)·v²/(2g) | Darcy–Weisbach | obliczone (dziedziczy sufit z f) |
| Wysokość H | H = H_stat + h_f | suma | obliczone |
| Moc P_h | P_h = ρgQH | definicja mocy hydraulicznej | obliczone |
| Moc P_wał | P_wał = P_h/η | bilans sprawności | obliczone (ograniczone przez η) |

**Prowieniencja parametrów** (scenariusz „nowa stal handlowa, woda 20°C"): Q, D, L, H_stat
= podane przez użytkownika; ρ, μ = dane producenta/tablicowe; ε = dane producenta dla
nowej stali (degraduje się do „wymaga walidacji" dla rury starej/skorodowanej — przełącznik
w UI); η = oszacowanie inżynierskie (z krzywej pompy, ale punkt pracy przesuwa η).

---

## 6. Metodologia wrażliwości

Prawdziwa **różnica centralna** na wykonywalnym grafie. Dla wyjścia O i parametru p:
elastyczność E = (ΔO/O)/(Δp/p), krok względny 0,1%, graf przywracany do stanu wyjściowego
po każdym zaburzeniu (bez efektów ubocznych na współdzielonym grafie). Elastyczność jest
bezwymiarowa (procent na procent), więc porównywalna między parametrami o różnych
jednostkach — dlatego rankinguje po |E|, a nie po surowej pochodnej.

**Zweryfikowane liczbowo w punkcie bazowym:**
- strata h_f: E(D)≈−5,13 (dominuje), E(Q)≈1,95, E(ε)≈0,18
- moc na wale: E(η)=−1,00 (dokładnie), E(D)≈−4,01, E(ε)≈0,14

Sygnatura D⁻⁵ jest odtworzona dokładnie przez graf, nie zaszyta ręcznie.

---

## 7. Przykłady ostrzeżeń pomiarowych

Rekomendacja powstaje TYLKO, gdy parametr JEDNOCZEŚNIE: (a) ma słabą prowieniencję
(oszacowanie inżynierskie LUB wymaga walidacji) ORAZ (b) ma |elastyczność| ≥ 0,25 na
wybrane wyjście. Wynikają ze stanu grafu, nie z generowanego tekstu.

- **Moc na wale:** „Wynik „Moc na wale P_wał" jest silnie zależny od „Sprawność pompy η"
  (elastyczność −1,00), a ten parametr ma status „oszacowanie inżynierskie". Zmierz
  „Sprawność pompy η", zanim oprzesz decyzję na tym wyniku." → **wyzwala się.**
- **Strata h_f, chropowatość:** przy nowej stali E(ε)≈0,18 < 0,25 → **NIE wyzwala się.**
  Tool celowo NIE fabrykuje ostrzeżenia dla parametru, który realnie nie dominuje —
  nawet po degradacji jego prowieniencji do „wymaga walidacji". Uczciwość > teatralność.
- **Średnica D:** dominuje wszystko, ale jest „podane przez użytkownika" (decyzja projektowa,
  nie niewiadoma) → **NIE jest rekomendacją pomiarową.**

---

## 8. Co jest fizycznie obronne vs przybliżone vs wymaga walidacji

- **Fizycznie obronne (dokładne):** v, Re, h_f (przy danym f), H, P_h, P_wał — to definicje
  i bilanse, dokładne dla przyjętych założeń (przepływ ustalony, ciecz nieściśliwa, rura
  pełna, pojedyncza gałąź).
- **Przybliżone (empiryczne):** współczynnik tarcia f (Swamee–Jain) — korelacja dopasowana
  do danych, ważna dla 5000<Re<10⁸; poza tym zakresem oznaczona jako mniej wiarygodna.
- **Wymaga walidacji fizycznej:** chropowatość rury starej/skorodowanej (pomiar in situ);
  sprawność pompy w rzeczywistym punkcie pracy. Gdy któreś jest „wymaga walidacji",
  propagacja `validationLimited` oznacza WSZYSTKIE zależne wielkości znacznikiem ⚠, więc
  wynik nigdy nie jest prezentowany jako fakt pewniejszy niż jego najsłabsze wejście.

---

## 9. Liczby testów

- **Frontend (Vitest):** 48 plików, **532 testy** — wszystkie zielone (było 505; +27 nowych:
  15 w engineeringGraph, 8 w pumpPipe, 4 w pumpPipeScene).
- **Backend (node:test):** 30 testów — zielone.
- **tsc `-b --noEmit`:** czysto. **ESLint:** czysto. **Build produkcyjny:** OK.

---

## 10. Wykryte i naprawione defekty wizualne

- **Maszyna niewidoczna (czarny ekran nad panelem):** kamera centrowała maszynę na środku
  viewportu, który jest zasłonięty dolnym panelem (~2/3 ekranu). Naprawa: `getDefaultFraming`
  celuje PONIŻEJ maszyny, żeby jej środek wypadł w widocznym górnym pasie.
- **Przycięcie na wąskim ekranie (portret/telefon):** szeroki układ (~13 j.) nie mieścił się
  w wąskim poziomym polu widzenia. Naprawa: kadrowanie zależne od aspektu (nowy getter
  `RealityEngine.viewportAspect`) — kamera cofa się na portrecie, żeby zbiornik i wylot
  były widoczne.

---

## 11. Pozostałe ograniczenia (świadome, w zakresie Fazy 0/1)

- Model jest **jednogałęziowy, ustalony, nieściśliwy** — brak sieci rur, uderzenia wodnego,
  kawitacji, charakterystyki pompy (krzywa H–Q), strat lokalnych (kolana/zawory).
- Scena 3D to **SCHEMAT**, nie CFD — brak pola prędkości/ciśnienia; cząstki oddają jedną
  liczbę (v), a nie przepływ 3D. Jest to jawnie oznaczone w UI.
- `Distribution`/`time-series`/`field-ref` istnieją jako **typy**, ale nie są policzone
  (wymagałyby solvera — poza zakresem).
- Prowieniencja parametrów jest przypisana ręcznie w konfiguracji modelu (świadomie — Faza 1
  nie generuje jej automatycznie).

---

## 12. Czego NIE zrobiono (zgodnie z zakazami)

Nie zbudowano CFD/FEA/DEM/multibody/CAD/virtual-commissioning. Nie zadeklarowano żadnej
walidacji, której nie ma. Nie wygenerowano żadnego niecytowanego równania. Żadna relacja
zaproponowana przez AI nie jest oznaczona „direct/exact". Nie udawano, że symulacja
koncepcyjna zastępuje badania fizyczne (odwrotnie — UI to explicite komunikuje). Nie
rozpoczęto Fazy 2/3, integracji solvera, ingestii szkiców ani generowania grafu przez AI.

---

## 13. Warstwa kinowa — jawnie oznaczona

Trasa lotu kamery, fala rozświetlająca komponenty i tunel Reality Transit noszą etykietę
`cinematic`. Pokazują KOLEJNOŚĆ obliczeń przez maszynę (kolejność pochodzi z realnych
kroków propagacji grafu), nigdy nie zmieniają wartości fizycznych. Scena jest oznaczona
jako SCHEMAT, nie symulacja przepływu.

---

## 14. Weryfikacja interaktywna (Playwright, desktop 1440×900 + mobile 390×844)

Potwierdzone: renderowanie sceny (canvas widoczny), 8 parametrów, 7 wyjść z chipami
prowieniencji, 5 wierszy wrażliwości, łańcuch konsekwencji (8 wierszy) po zmianie średnicy,
degradacja chropowatości → 5 wielkości oznaczonych ⚠ „wymaga walidacji", 1 rekomendacja
pomiarowa dla mocy na wale (η), tworzenie wariantu (A→B), **trwałość stanu po opuszczeniu i
powrocie na trasę** (2 warianty przetrwały re-entry — persystentny silnik działa). Jedyny
błąd konsoli to 500 z `/api/health` (brak backendu pod `vite preview`) — niezwiązany z tym
ekranem.

---

## 15. Oceny (0–10)

| Wymiar | Ocena | Uzasadnienie |
|---|---:|---|
| **Użyteczność inżynierska** | 7/10 | Realny łańcuch przyczynowy + wrażliwość + rekomendacje pomiarowe na prawdziwych wzorach. Ograniczone do jednej, prostej maszyny bez strat lokalnych/krzywej pompy. |
| **Obronność naukowa** | 9/10 | Wszystkie równania cytowane; prowieniencja egzekwuje „wynik nie pewniejszy niż najsłabsze wejście"; empiryczne oddzielone od dokładnego; zero fałszywej walidacji. Odejmuję za ręcznie przypisaną prowieniencję. |
| **Immersja kinowa** | 7/10 | Ciągły lot kamery po komponentach w kolejności propagacji, fala rozświetlająca, tunel transitu. Schemat świadomie powściągliwy (uczciwość > efekt). |
| **Jakość wizualna** | 7/10 | Czytelny, kolorowany schemat (zbiornik/pompa/rura/wylot), cząstki przepływu, geometria reagująca na parametry (D, H). Nie fotorealizm — celowo. |
| **Gotowość produktowa** | 7/10 | Trasa, persystencja, responsywność desktop+mobile, pełne testy i build zielone. Do produktu brakuje większej biblioteki maszyn i eksportu raportu. |

---

**Status:** Faza 0 i Faza 1 ukończone czysto. Zatrzymuję się do przeglądu founderskiego
przed jakąkolwiek Fazą 2/3.
