# Quantum Lab — katalog wiedzy

## Zakres
Superpozycja, interferencja, pomiar, splątanie, tunelowanie, kubity, bramki,
dekoherencja, teleportacja.

## Modele i wzory

**Interferencja dwuszczelinowa** ★★★★★
I(θ) ∝ cos²(πd sinθ/λ)·sinc²(πa sinθ/λ). Pojedyncze elektrony: Tonomura 1989;
cząsteczki >25 kDa: Fein 2019. Etap 0 losuje trafienia z dokładnego |ψ|².

**Równanie Schrödingera 1D — split-step Fourier (plan Etapu 1)** ★★★★★
ψ(t+dt) = F⁻¹[e^{−iħk²dt/2m}·F[e^{−iV dt/ħ}ψ]]. Siatka 1024–4096 punktów
działa w 60 fps na telefonie (FFT w JS/WASM). Odblokowuje: tunelowanie,
rozpraszanie na barierze, stany związane.

**Kubity i bramki (jednokubitowe zaimplementowane)** ★★★★★
|ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩ (sfera Blocha). Macierze H, X, Y, Z,
S, T — dokładne, zaimplementowane w `quantum-bloch.ts` z prawdziwym
diagramem obwodu (sekwencja zastosowanych bramek, konwencja IBM Quantum
Composer) i testami unitarności.

**Wektor stanu wielu kubitów, CNOT, teleportacja (zaimplementowane)** ★★★★★
`core/quantumState.ts`: pełny wektor stanu 2ⁿ amplitud zespolonych,
bramki jednokubitowe (dowolna macierz 2×2) i CNOT działające na dowolnym
kubicie w n-kubitowym rejestrze — dokładna mechanika kwantowa, nie
przybliżenie. Zaimplementowana **teleportacja kwantowa** (Bennett i in.
1993, PRL 70, 1895; pierwsza realizacja: Bouwmeester i in. 1997, Nature
390, 575) na 3 kubitach w `quantum-teleport.ts`: Alicja i Bob dzielą parę
Bell, Alicja splata swój nieznany kubit z połową pary i mierzy oba swoje
kubity, przesyła 2 bity klasyczne, Bob stosuje jedną z 4 korekt (I/X/Z/XZ).
Wierność (fidelity) odtworzonego stanu = 1 DOKŁADNIE w każdej z 4 gałęzi
pomiaru, dla dowolnego zespolonego stanu wejściowego — zweryfikowane
numerycznie (ręczna symulacja poza aplikacją) PRZED napisaniem testów, a
mapowanie wyników pomiaru na korektę wyprowadzone algebraicznie krok po
kroku, nie zgadnięte. Symulacja pełnego stanu do ~10 kubitów trywialna
(wektor 2ⁿ) — większe rejestry (algorytmy Shora/Grovera na realnych
rozmiarach) pozostają backlogiem jako osobny, znacznie większy temat.

**Nierówności Bella / CHSH** ★★★★★
Lokalny realizm: S ≤ 2; MK: S ≤ 2√2 ≈ 2,83; korelacja E(a,b) = −cos(a−b).
Testy bez luk: 2015 (Delft, Wiedeń, NIST); Nobel 2022.

**Dekoherencja** ★★★★
Utrata koherencji przez splątanie z otoczeniem wyjaśnia, czemu makroświat
wygląda klasycznie. Nie rozwiązuje sama problemu pomiaru (patrz spory).

**Twierdzenie o zakazie klonowania (no-cloning)** ★★★★★ — brak liniowej,
unitarnej operacji kopiującej dowolny nieznany stan kwantowy (Wootters &
Zurek 1982; Dieks 1982). Konsekwencja liniowości MK, nie ograniczenie
techniczne. To dlaczego teleportacja (wyżej) *przenosi* stan, niszcząc go
u nadawcy, zamiast go kopiować — i dlaczego "teleportacja makroskopowego
obiektu" (~10²⁸ stopni swobody, jak w SF) jest wykluczona strukturalnie,
nie tylko technicznie trudna.

**Twierdzenie o braku sygnalizacji (no-communication)** ★★★★★ — mimo
nielokalnych korelacji Bella, splątanie samo w sobie nie pozwala przesłać
informacji szybciej niż c: zredukowana macierz gęstości odbiorcy nie
zależy od wyboru pomiaru nadawcy, dopóki nie dotrze kanał klasyczny
(stąd 2 bity klasyczne na kubit w protokole teleportacji, wyżej). To
formalny powód, dla którego żaden efekt kwantowy — teleportacja, ER=EPR
(patrz Space-Time Lab) — nie daje sygnalizacji nadświetlnej.

## Sprzeczne teorie / otwarte spory

**Interpretacje MK — wszystkie dają identyczne przewidywania pomiarowe:**
- Kopenhaska/operacyjna ★★★★ jako praktyka („licz i przewiduj") — domyślny
  język aplikacji
- Wielu światów (Everett 1957) ★★ — bez kolapsu; cena: mnożenie gałęzi;
  opisana w Multiverse Lab
- Fala pilotująca (de Broglie–Bohm) ★★ — trajektorie istnieją, ale nielokalne
- Obiektywny kolaps (GRW/Penrose) ★★ — jedyna FALSYFIKOWALNA klasa
  (przewiduje odstępstwa dla dużych mas — eksperymenty trwają)
- QBism ★★ — funkcja falowa jako stan wiedzy agenta

Stanowisko aplikacji: uczymy formalizmu (bezsporny), interpretacje
prezentujemy jako oznaczoną mapę sporu — to jedyne uczciwe podejście
i zarazem ciekawsze niż dogmat.

**Granica kwantowo-klasyczna** ★★★
Czy istnieje maksymalny rozmiar superpozycji? Dekoherencja tłumaczy praktykę,
ale eksperymenty z coraz większymi obiektami (nanocząstki w pułapkach,
projekt MAQRO) testują, czy nie ma nowej fizyki. Otwarte.

## Publikacje i książki
- Tonomura et al. 1989, Am. J. Phys. 57, 117 (nasz wzorzec z Etapu 0)
- Aspect et al. 1982, PRL 49, 1804; Hensen et al. 2015, Nature 526 (Bell bez luk)
- Bouwmeester et al. 1997, Nature 390, 575 (teleportacja)
- Fein et al. 2019, Nature Physics 15, 1242 (interferencja 25 kDa)
- Zurek 2003, Rev. Mod. Phys. 75, 715 (dekoherencja — przegląd)
- Podręczniki: Griffiths *Introduction to QM*; Nielsen & Chuang (informacja
  kwantowa); Feynman Lectures III — czytać online, nie kopiować
- Wzorce open source: Qiskit Textbook (dydaktyka bramek), QuTiP (dynamika)

## Ograniczenia implementacyjne
- Pełna symulacja stanu: 2ⁿ amplitud → praktyczny sufit ~20 kubitów na
  telefonie; dla dydaktyki wystarczy 2–5
- Split-step 2D możliwy w niskiej rozdzielczości; 3D — nie na mobile
- „Pomiar" w aplikacji = próbkowanie rozkładu — opisać w nocie modelu

## Wnioski projektowe dla Genesis OS
1. Tunelujący pakiet falowy 1D na żywo — realna fizyka obliczana na
   urządzeniu, unikat na mobile; priorytet nr 1 Etapu 1
2. Gra CHSH („pokonaj lokalny realizm") — dydaktyka Bella przez porażkę gracza
3. ✅ Teleportacja krok po kroku na 3 kubitach — pełna, dokładna symulacja
   (zaimplementowane: `quantum-teleport.ts`, patrz wyżej)
4. Mapa interpretacji MK jako pierwszy moduł „nauka się spiera"

---

## Splątanie i informacja kwantowa — pakiet wiedzy (ingest 2026-09-12)

**UWAGA O CYTOWANIACH.** Równania i twierdzenia poniżej są standardową,
podręcznikową treścią i dają się sprawdzić rachunkiem. Natomiast **wartości
liczbowe z eksperymentów i przypisy `[[n]]` pochodzą z wklejonego pakietu i NIE
zostały odświeżone na żywo w tej sesji** — traktować je jak cytowania do
weryfikacji przed użyciem w materiale zewnętrznym (ta sama dyscyplina co w
`spacetime-einstein.md`). Wzory oznaczone [ESTABLISHED THEORY] są weryfikowalne
lokalnie: policzeniem, nie zaufaniem.

### Fundament (weryfikowalny rachunkiem)

- Przestrzeń złożona: `H = H_A ⊗ H_B`, `dim H = d_A·d_B`.
- Separowalność stanu czystego: `|ψ⟩` separowalny ⇔ `|ψ⟩ = |ψ_A⟩ ⊗ |ψ_B⟩`.
- Dekompozycja Schmidta: `|ψ⟩ = Σ_k √λ_k |u_k⟩|v_k⟩`, `λ_k > 0`, `Σ λ_k = 1`,
  ranga Schmidta `r = rank(C)`. **Splątany ⇔ r ≥ 2** — to jest kryterium
  rozstrzygalne numerycznie (SVD macierzy współczynników).
- Ślad częściowy: `ρ_A = Tr_B(|ψ⟩⟨ψ|) = Σ_k λ_k |u_k⟩⟨u_k|`.
- Entropia von Neumanna: `S(ρ) = −Tr(ρ ln ρ) = −Σ_k λ_k ln λ_k`; dla stanu
  czystego `E(|ψ⟩) = S(ρ_A) = S(ρ_B)`, maksimum `ln d` (1 e-bit dla d=2).
- Entropie Rényiego: `S_α = (1/(1−α)) ln Tr(ρ^α)`; `α→1` → von Neumann,
  `α→∞` → `−ln λ_max`, `α→0` → `ln rank(ρ)`.
- Stan mieszany separowalny: `ρ = Σ_i p_i ρ_A^{(i)} ⊗ ρ_B^{(i)}`, `p_i ≥ 0`,
  `Σ p_i = 1`. (W źródłowym pakiecie w tym wzorze wypadło `ρ` przy drugim
  czynniku — tu poprawione.)

### Stany Bella i CHSH

- `|Φ±⟩ = (|00⟩ ± |11⟩)/√2`, `|Ψ±⟩ = (|01⟩ ± |10⟩)/√2`.
- Korelator singletu: `⟨(a·σ) ⊗ (b·σ)⟩ = −a·b`. **To już jest w repo** —
  `core/physics.ts::singletCorrelation`, użyte przez `quantum-chsh.ts`.
- CHSH: `S = E(a,b) − E(a,b′) + E(a′,b) + E(a′,b′)`; lokalny realizm `|S| ≤ 2`;
  kąty `a=0, a′=π/2, b=π/4, b′=−π/4` dają w QM `S = 2√2`.
- **Granica Tsirelsona**: `‖B‖ ≤ 2√2` dla operatora CHSH, więc `|S| ≤ 2√2`
  w KAŻDEJ teorii kwantowej. Boksy PR osiągają `S = 4` zachowując
  no-signalling — QM leży pomiędzy w politopie no-signalling.
  [MATHEMATICAL POSSIBILITY, nie zaobserwowane]

### Nierówności entropowe

`S(AB) ≤ S(A) + S(B)` (subaddytywność) · `|S(A) − S(B)| ≤ S(AB)` (Araki–Lieb) ·
`S(ABC) + S(B) ≤ S(AB) + S(BC)` (silna subaddytywność, SSA) ·
`I(A:B|E) = S(AE) + S(BE) − S(E) − S(ABE) ≥ 0` (równoważne SSA) ·
Page: dla losowego stanu czystego `⟨S_A⟩ ≈ ln d_A − d_A/(2 d_B)` przy `d_A ≤ d_B`.

### Miary splątania

- **Concurrence (2 kubity, Wootters 1998):** `C(ρ) = max{0, √λ_1 − √λ_2 − √λ_3 − √λ_4}`,
  gdzie `λ_i` malejąco to wartości własne `R = ρ (σ_y⊗σ_y) ρ* (σ_y⊗σ_y)`.
- **Entropia formowania:** `E_F(ρ) = h((1+√(1−C²))/2)`, `h(x) = −x log₂x − (1−x)log₂(1−x)`.
- **Negatywność:** `N(ρ) = (‖ρ^{T_A}‖₁ − 1)/2 = Σ_i max(0, −μ_i)`;
  log-negatywność `E_N = log₂‖ρ^{T_A}‖₁`.
- **Względna entropia splątania:** `E_R(ρ) = min_{σ∈SEP} S(ρ‖σ)`.
- **Squashed:** `E_sq(ρ_AB) = ½ inf_{ρ_ABE} I(A:B|E)`.
- `E_D(ρ) ≤ E_C(ρ)`; dla stanów czystych oba równe `E(|ψ⟩)`.
- **Świadek:** `Tr(W σ_sep) ≥ 0` dla separowalnych; `W = ½·I − |Φ+⟩⟨Φ+|`;
  `Tr(Wρ) < 0` DOWODZI splątania.
- **Monogamia CKW (2000):** `τ = C²`; `τ_{A|B} + τ_{A|C} ≤ τ_{A|(BC)}`.

### Separowalność i konwersja LOCC

- **PPT (Peres–Horodecki):** separowalny ⇒ `ρ^{T_A} ≥ 0`. Odwrotność zachodzi
  **tylko** dla `2⊗2` i `2⊗3`; wyżej istnieją stany związane (PPT, a splątane).
- **Kryterium zakresu:** jeśli `ρ` separowalny, istnieją wektory produktowe
  rozpinające `range(ρ)`, których sprzężenia rozpinają `range(ρ^{T_A})`.
- **Majoryzacja (Nielsen 1999):** `|ψ⟩ →_LOCC |φ⟩` ⇔ `λ_ψ ≺ λ_φ`.

### Protokoły

- **Teleportacja** (Bennett 1993) — rozwinięcie w bazie Bella daje 4 gałęzie,
  korekta `σ_μ ∈ {I, X, Z, ZX}`. **Zaimplementowane w repo** (`quantum-teleport.ts`,
  `core/quantumState.ts::teleport`), fidelity = 1 dokładnie w każdej gałęzi.
- **Superdense coding** (Bennett–Wiesner 1992): `{I, X, Z, ZX}` na połowie
  `|Φ+⟩` daje 4 ortogonalne stany Bella → 1 kubit + 1 e-bit = 2 bity klasyczne.
- **Swapping splątania:** pomiar Bella na kubitach 2,3 z `|Ψ−⟩_12 ⊗ |Ψ−⟩_34`
  rzutuje 1,4 na stan Bella — splątanie bez wspólnego źródła.
- **E91 (Ekert 1991):** `S > 2` jest świadkiem bezpieczeństwa klucza.
- **Granica PLOB:** `K ≤ −log₂(1−η)` — uzasadnia repeatery kwantowe.
- **Brak komunikacji:** `Tr_A[(U_A ⊗ I_B) ρ (U_A† ⊗ I_B)] = Tr_A(ρ)`.

### Splątanie w wielu ciałach i QFT

Prawo powierzchni `S_A ≤ c·|∂A|` · CFT 1D (Calabrese–Cardy):
`S = (c/3) ln(ℓ/a) + c₁`, na pierścieniu `S = (c/3) ln[(L/(πa))·sin(πℓ/L)] + c₁` ·
Topologiczna entropia `S = α·L_∂ − γ`, `γ = ln 𝒟` (Kitaev–Preskill / Levin–Wen 2006) ·
Ryu–Takayanagi `S_A = Area(γ_A)/(4G_N)`, kwantowo z wyspami
`S(R) = min ext_I [Area(∂I)/(4G_N) + S_bulk(R ∪ I)]` [ESTABLISHED w AdS/CFT;
SEARCHING jako ogólna zasada QG].

### Czasoprzestrzeń i metrologia

Unruh `T_U = aℏ/(2πck_B)` · Hawking `T_H = ℏc³/(8πGMk_B)` ·
ER=EPR [SUPPORTED SPECULATION, patrz pakiet wormhole w `spacetime-einstein.md`] ·
Metrologia: shot-noise `Δθ = 1/√N` vs Heisenberg `Δθ = 1/N` dla stanów NOON.

### Eksperymenty (wartości DO WERYFIKACJI — patrz uwaga na górze sekcji)

| Wynik | Wartość | Przypis pakietu |
|---|---|---|
| Bell bez luk, Delft (spiny e⁻, 1,3 km) | S = 2,42 ± 0,20 | [[8]] |
| Delft, wynik łączny | S = 2,38 ± 0,14 | [[1]] |
| Bell bez luk, Vienna (fotony) | zamknięcie locality+detection | [[2]] |
| Bell bez luk, Boulder/NIST (fotony) | zamknięcie locality+detection | [[10]] |
| Bell bez luk w obwodach nadprzewodzących (2023) | — | [[7]] |
| Micius, dystrybucja splątania 1200 km | S = 2,37 ± 0,09 | [[12]] |
| Splątanie membran makro (~70 pg) | deterministyczne | [[21]] |
| Splątane masywne oscylatory mechaniczne | pierwszy bezpośredni dowód | [[27]] |
| Pomiar `S_2` przez interferencję dwóch kopii | — | [[33]] |
| Rényi przez randomizowane pomiary | — | [[32]] |
| Sieć 3-węzłowa ze swappingiem (Delft 2021) | — | [[44]] |
| Heralded splątanie w skali miasta (10 km, 2024) | — | [[42]] |
| Rozproszony GHZ na 3 węzłach (2026) | — | [[43]] |

Trzy niezależne testy loophole-free opublikowano w 2015 w ciągu trzech
miesięcy (Delft, Vienna, Boulder) [[5]].

### Hipotezy QE1–QE7 (z falsyfikatorami)

| ID | Hipoteza | Falsyfikator | Status wg pakietu |
|---|---|---|---|
| QE1 | `S ≤ 2√2` we wszystkich testach | istotne statystycznie `S > 2√2` | ESTABLISHED (dotąd) |
| QE2 | Monogamia CKW dla 3 kubitów | zmierzona violacja | ESTABLISHED |
| QE3 | PPT wystarczające tylko w `2⊗2`/`2⊗3` | destylacja stanu PPT | ESTABLISHED |
| QE4 | Prawo powierzchni + log-CFT w symulatorze 1D | odchylenie poza błąd | SEARCHING |
| QE5 | PLOB ogranicza QKD bez repeaterów | rate powyżej granicy | ESTABLISHED |
| QE6 | Formuła wysp odtwarza krzywą Page'a | niezgodność w JT gravity | SUPPORTED WITHIN MODEL |
| QE7 | Splątanie makro nie łamie monogamii/SSA | violacja SSA w stanie makro | SEARCHING |

#### Co z tego Genesis NAPRAWDĘ uruchomił (2026-09-12)

Kolumna „status wg pakietu" jest cudzą oceną literatury, nie wynikiem Genesis.
QE1, QE2 i QE3 przeszły natomiast pełny cykl w prawdziwym `StrategyRun`
(strategia PARAMETER → `inquiryLoop` → model Fabric
`quantum-entanglement-measures`), jako dochodzenia o ukrytym parametrze, i to
jest jedyne, co Genesis może o nich powiedzieć z własnego wykonania:

| ID | Co Genesis uruchomił | Wynik przebiegu | Czego to NIE dowodzi |
|---|---|---|---|
| QE1 | widzialność źródła Wernera, sonda: szum biały, metryka `maxCHSH` | ZAWĘŻONE, NIEROZSTRZYGNIĘTE — padły p = 0,72 i p = 0,50; szum biały nie potrafi oddzielić p = 1,00 od p = 0,92 przy żadnym ustawieniu | **nie testuje granicy Tsirelsona** — 2√2 jest analitycznym sufitem liczonej tu algebry, więc brak przekroczenia jest tautologią, nie dowodem; hipoteza o źródle nadkwantowym jest NIEROZSTRZYGALNA na tym podłożu |
| QE2 | rodzina cos α·(cos θ\|000⟩ + sin θ\|111⟩) + sin α\|W⟩, sonda: kąt domieszki, metryka `ckwResidual` | ODZYSKANE θ = 70° w trzech rundach; czysty GHZ zostawił degenerację θ ↔ 90°−θ, złamał ją dopiero pomiar poza osią | nierówność CKW jest twierdzeniem tej algebry — ujemna reszta falsyfikowałaby implementację, nie twierdzenie |
| QE3 | rodzina Horodeckich 3⊗3, sonda: szum biały, metryka `boundEntanglementMargin` | ODZYSKANE a = 0,4; wszyscy czterej kandydaci są PPT (negatywność 0), więc rozstrzygnęło wyłącznie drugie kryterium (CCNR) | margines 0 NIE znaczy separowalność — CCNR działa w jedną stronę |

Zmierzony efekt uboczny, który jest realnym wynikiem QE3: margines splątania
związanego spada do zera już przy **0,5% szumu białego**. Stany splątane
związanie leżą tuż przy brzegu zbioru separowalnego, więc jedyne ustawienie
sondy, które cokolwiek mówi, to preparatyka bezszumowa.

QE4 nie było uruchamiane w tej sesji (osobne zadanie C2, realny zbiór
Brydgesa z Zenodo — `docs/QE4_REAL_DATASET_AND_EXPERIMENT.md`).

**QE5, QE6, QE7 zostały ZBADANE (nie pominięte) i wyszły `BLOCKED`, każde z
innego, nazwanego powodu** (pełne uzasadnienie:
`packages/frontend/src/core/agent/entanglementInquiry.ts`, stałe
`QE5_BLOCKED`/`QE6_BLOCKED`/`QE7_BLOCKED` +
`*_BLOCKED_MISSING_COMPONENT`; dowód wykonania w
`docs/MASTER_PRIORITY_GENESIS.md`):

| ID | Co sprawdzono | Werdykt | Brakujący komponent / powód |
|---|---|---|---|
| QE5 | czy granicę PLOB (przepustowość kanału na sekretny klucz) da się wyrazić jako funkcję negatywności stanu Wernera już policzonej przez `entanglementMeasures.ts` | `BLOCKED` | PLOB dotyczy KANAŁU bozonowego/gaussowskiego (transmitancja η); Genesis liczy dokładną algebrę na zadeklarowanych stanach qubitowych — nie ma kanału, nie ma η, nie ma tempa klucza. Brak zweryfikowanej tożsamości sprowadzającej jedno do drugiego; wymyślenie jej byłoby dokładnie tym, czego zadanie zabrania |
| QE6 | czy formułę Page'a (średnia entropia podukładu losowego stanu Haara) da się policzyć NA MAŁYCH N bez fizyki czarnych dziur | `BLOCKED` (dostępne w zasadzie, niedostępne w tym zakresie plików) | `inquiryLoop.ts::runAt` dociera wyłącznie do `quantum-entanglement-measures` przez zadeklarowaną listę presetów w `entanglementStateRunner.ts` — nie ma tam (ani w kontrakcie parametrów) sposobu wyrazić „świeży losowy stan Haara". Dodanie tego wymaga dotknięcia `entanglementStateRunner.ts`/`router.ts`/`executor.ts`, poza dozwolonym zakresem tego zadania (`entanglementInquiry.ts`, `entanglementMeasures.ts`) |
| QE7 | czy da się zbudować dochodzenie odrębne od QE2, testujące implementację monogamii/SSA | `BLOCKED` (odpowiedź już istnieje — w QE2) | Jedyna nie-NaN obserwabla trójkubitowa na tym podłożu to `ckwResidual`, zdefiniowana tylko przy `whiteNoise=0`, na rodzinie `ghz-w-family` sondowanej przez `mixingAngleDeg` — to jest dokładnie `qe2System`. Osobne dochodzenie z tych samych składników byłoby QE2 pod inną nazwą. Pytanie o implementację („czy CKW residual jest nieujemny w realnych przebiegach") jest już odpowiedziane przez rzeczywistą, wykonaną historię QE2 wyżej w tej tabeli |

### Otwarte problemy

Addytywność `E_F` złamana (Hastings 2009), pełna struktura nieznana ·
destylowalność stanów NPT w wyższych wymiarach · operacyjne znaczenie `E_sq` ·
klasyfikacja SLOCC wielu ciał · entropia splątania w teoriach cechowania ·
wnętrza czarnych dziur · splątanie w kosmologii · detekcja splątania jest
NP-trudna w ogólności.

### Literatura pierwotna

EPR 1935 · Schrödinger 1935 · Bell 1964 · CHSH 1969 · Tsirelson 1980 ·
Peres 1996 · Horodecki 1996 · Wootters 1998 · Bennett i in. 1993 ·
Bennett–Wiesner 1992 · Ekert 1991 · Nielsen 1999 · CKW 2000 ·
Calabrese–Cardy 2004 · Kitaev–Preskill 2006 · Levin–Wen 2006 ·
Ryu–Takayanagi 2006 · HRT 2007 · Hastings 2009 · Penington / Almheiri 2019.

### DYSCYPLINA — czego Genesis o splątaniu NIE mówi

1. **Nigdy** „splątanie umożliwia przekaz informacji szybciej niż światło" —
   wyklucza to twierdzenie o braku komunikacji (wzór wyżej).
2. **Nigdy** „teleportacja przenosi materię" — przenoszony jest STAN, nie
   substrat; oryginał jest przy tym niszczony przez pomiar.
3. Każdy artefakt wizualny/symulacyjny dotyczący splątania nosi tag
   SIMULATION/MODEL, nigdy OBSERVED.

### CO Z TEGO JUŻ ISTNIEJE W REPO (audyt przed budową, 2026-09-12)

- `core/physics.ts`: `singletCorrelation`, `chshS`, `sampleSingletPair`,
  `sampleLocalHiddenPair` — korelacje CHSH i lokalny realizm.
- `labs/experiments/quantum-chsh.ts`: pełne laboratorium CHSH w 3D (647 linii),
  wartość wizualna = wartość solvera.
- `core/quantumState.ts`: pełny wektor stanu 2ⁿ, bramki, CNOT, pomiar,
  teleportacja z fidelity = 1.
- `labs/experiments/quantum-teleport.ts`, `quantum-bloch{,-3d}.ts`,
  `quantum-tunneling.ts`, `quantum-kitaev-bulk.ts`.

**Wniosek: osobne „Entanglement Lab" byłoby DUPLIKATEM `quantum-chsh.ts`.**
Realna luka to nie wizualizacja, tylko BRAK MIAR: nie ma śladu częściowego,
entropii von Neumanna, dekompozycji Schmidta, concurrence, negatywności, PPT
ani monogamii CKW. Bez nich hipotezy QE2 i QE3 nie mają czym być
falsyfikowane. To jest właściwy następny krok.
