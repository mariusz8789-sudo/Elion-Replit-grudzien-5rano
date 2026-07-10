# Chemistry Lab — katalog wiedzy

## Zakres
Elektroujemność, polarność wiązań chemicznych, geometria molekularna
(VSEPR), miareczkowanie kwasowo-zasadowe. Reakcje, kinetyka, stechiometria
— poza obecnym zakresem, patrz VISION-BACKLOG.md.

## Modele i wzory

**Elektroujemność Paulinga (χ)** ★★★★★
Tabelaryczna wielkość (CRC Handbook of Chemistry and Physics), zdefiniowana
przez Linusa Paulinga w 1932 r. z energii wiązań: wiązanie A–B silniejsze
niż średnia geometryczna energii A–A i B–B zdradza nierówny podział pary
elektronowej. Skala 0,7 (Fr) – 3,98 (F); gazy szlachetne i większość
pierwiastków superciężkich bez ustalonej wartości.

**Klasyfikacja polarności wiązania** ★★★ (konwencja dydaktyczna)
Δχ = |χA − χB|: <0,4 kowalencyjne niespolaryzowane, 0,4–1,7 kowalencyjne
spolaryzowane, ≥1,7 jonowe. To orientacyjna, powszechnie uczona konwencja —
NIE ostra granica fizyczna. Rzeczywiste wiązania tworzą continuum.

**Wzór Hanney–Smitha (1946)** ★★★ (klasyczne przybliżenie)
Procent charakteru jonowego: f ≈ 1 − exp(−Δχ²/4). Wciąż cytowane w
podręcznikach jako orientacyjne oszacowanie; nie jest zmierzoną wielkością
fizyczną i nie zgadza się dokładnie z bardziej wyrafinowanymi metodami
(np. analiza NBO/AIM daje inne liczby dla tego samego wiązania).

**VSEPR — geometria molekularna (zaimplementowane)** ★★★★★
Teoria Gillespiego i Nyholma (1957): domeny elektronowe (wiążące i wolne
pary) wokół atomu centralnego maksymalizują wzajemne odległości na sferze.
13 standardowych geometrii (AX₂ do AX₆E₂) zaimplementowanych w
`labs/experiments/chemistry-vsepr.ts` jako model 3D (Sim3D, Three.js).
Geometrie BEZ wolnych par to dokładna geometria bryły/rozkładu na okręgu
(np. tetraedr: 109,47° dokładnie). Dla NH₃ i H₂O kąty wiązań są PRAWDZIWYMI
zmierzonymi wartościami (106,8° i 104,5° — NIST/CCCBDB), nie idealizacją —
geometria jest dopasowana WSTECZ do zmierzonego kąta (funkcja `bentCone`).
Pozostałe geometrie z wolnymi parami (SF₄, ClF₃, XeF₂, BrF₅, XeF₄) pokazują
pozycje idealne bryły-rodzica (bipiramida trygonalna / oktaedr); realne
kąty odbiegają o kilka stopni z tego samego powodu (wolna para odpycha
silniej niż para wiążąca) — jawnie zaznaczone w honestyNote, nie ukryte.

**Miareczkowanie kwasowo-zasadowe (zaimplementowane)** ★★★★★
Słaby kwas + mocna zasada (NaOH), krzywa liczona DOKŁADNYM równaniem
bilansu ładunku [Na⁺]+[H⁺]=[A⁻]+[OH⁻] (z uwzględnieniem autodysocjacji
wody, Kw=10⁻¹⁴), rozwiązywanym numerycznie bisekcją w skali logarytmicznej
[H⁺] — NIE tylko przybliżeniem Hendersona–Hasselbalcha, które jest dokładne
tylko w jednym punkcie (półrównoważnikowym). 4 realne słabe kwasy z Ka
tabelarycznym (CRC Handbook): octowy (1,8×10⁻⁵), mrówkowy (1,8×10⁻⁴),
benzoesowy (6,3×10⁻⁵), cyjanowodorowy (6,2×10⁻¹⁰ — świadomie bardzo słaby,
pokazuje skrajny przypadek). Punkt równoważnikowy słabego kwasu jest
ZASADOWY (pH>7, hydroliza sprzężonej zasady A⁻) — jawnie wyjaśnione jako
naprawienie częstego błędu popularnonaukowego "punkt równoważnikowy = pH 7"
(prawdziwe tylko dla mocny kwas + mocna zasada, którego ten eksperyment
nie modeluje).

## Sprzeczne teorie / otwarte spory
- Skale elektroujemności różnią się metodą (Pauling z energii wiązań,
  Mulliken ze średniej energii jonizacji i powinowactwa elektronowego,
  Allred–Rochow z ładunku efektywnego) — dają zbliżone, ale nie identyczne
  liczby. Genesis OS używa wyłącznie skali Paulinga (najbardziej
  rozpowszechnionej w dydaktyce) i jasno to nazywa.
- "Procent charakteru jonowego" nie ma jednej uzgodnionej definicji
  kwantowo-chemicznej — różne metody (Hanney–Smith, analiza populacji
  Mullikena, NBO) dają różne liczby dla tego samego wiązania. Traktować
  jako poglądowe, nie jako zmierzoną obserwablę.

## Publikacje i książki
- Pauling, L. *The Nature of the Chemical Bond* (1932/1960) — definicja
  oryginalnej skali
- Hannay, N. B.; Smith, C. P. *J. Am. Chem. Soc.* 68, 171 (1946) —
  wzór na charakter jonowy
- CRC Handbook of Chemistry and Physics — tablice χ (źródło danych w tym labie)

## Dane — strategiczne dla tego laba
Elektroujemności Paulinga dla ~70 pierwiastków głównych grup i pierwszych
dwóch serii przejściowych (`data/electronegativity.ts`) — realne, tabelaryczne
liczby, nie synteza. Gazy szlachetne i superciężkie pierwiastki świadomie
pominięte zamiast zmyślone.

## Ograniczenia implementacyjne
- Rozmiary atomów na wizualizacji wiązań (2D) są symboliczne (log Z), nie
  do skali promienia atomowego/kowalencyjnego
- Kolory atomów w modelu VSEPR (3D) są schematyczne (niebieski=wiążący,
  bursztyn=centralny, fiolet=wolna para), nie prawdziwymi kolorami CPK
- Brak reakcji, kinetyki, stechiometrii (poza miareczkowaniem) —
  osobne, większe moduły do rozważenia później
- Miareczkowanie modeluje TYLKO słaby kwas + mocna zasada (najczęstszy
  przypadek dydaktyczny) — mocny kwas, słaba zasada i kwasy wieloprotonowe
  wymagałyby osobnych równań bilansu, świadomie poza zakresem tej wersji

## Wnioski projektowe dla Genesis OS
1. Wiązania chemiczne jako pierwszy eksperyment: continuum kowalencyjne
   → jonowe sterowane jedną realną liczbą (Δχ) najlepiej oddaje "emergent,
   not decorative" — chmura elektronowa dosłownie przesuwa się według wzoru
2. VSEPR jako drugi eksperyment: kompletny, zamknięty zbiór (13 geometrii
   AX₂…AX₆E₂) — dobry kandydat na pełne pokrycie w jednej sesji, bo liczba
   przypadków jest skończona i znana z góry, nie otwarta jak np. reakcje.
3. Miareczkowanie jako trzeci eksperyment: dokładne równanie bilansu ładunku
   zamiast tylko Hendersona–Hasselbalcha — ten sam standard "prawdziwy wzór,
   nie przybliżenie tam gdzie się da" co reszta platformy (Kepler, geodezyjne)
4. Domyślna para Na–Cl (sól kuchenna) jako natychmiast rozpoznawalny,
   podręcznikowy przykład wiązania jonowego
