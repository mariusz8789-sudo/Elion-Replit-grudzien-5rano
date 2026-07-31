# Genesis OS — RESEARCH.md (baza wiedzy projektu)

Ostatnia aktualizacja: 2026-07-07 · Weryfikacja licencji: lipiec 2026

Cel dokumentu: dla każdego laboratorium — źródła naukowe, wzory, publikacje,
książki, pomysły na rozwój i ograniczenia modeli. Jedno miejsce, do którego
wraca się przy budowie każdego kolejnego modułu.

**Pogłębiona baza wiedzy (osobny katalog na laboratorium, skala potwierdzenia
naukowego, sprzeczne teorie): [`knowledge/`](knowledge/README.md).** Ten plik
pozostaje indeksem prawno-licencyjnym i listą priorytetów; katalogi `knowledge/`
są źródłem projektowym każdego nowego modułu.

---

## 0. Zasady prawne (przeczytaj przed implementacją czegokolwiek)

**Fundament:** równania, prawa fizyki, stałe i fakty naukowe NIE podlegają
prawu autorskiemu. Implementacja dowolnego wzoru z dowolnego podręcznika jest
legalna. Ochronie podlegają: tekst, rysunki, zdjęcia, kod źródłowy i design
cudzych aplikacji — tych nie kopiujemy nigdy.

| Źródło | Licencja | Co wolno w Genesis OS |
|---|---|---|
| NASA / JPL (dane, ephemerydy, większość zdjęć) | domena publiczna (US gov) | używać, modyfikować, komercyjnie; nie sugerować, że NASA nas promuje; logo NASA zakazane |
| CERN Open Data | **CC0** | pełna swoboda, także komercyjnie; cytować przez DOI rekordu |
| ESA (zdjęcia, wizualizacje) | CC BY-SA 3.0 IGO | używać z atrybucją ("ESA/…, CC BY-SA 3.0 IGO"); pochodne na tej samej licencji — uwaga przy miksowaniu z naszym contentem |
| NIST (ASD, CODATA), NNDC | domena publiczna (US gov) | pełna swoboda; cytować grzecznościowo |
| Particle Data Group (PDG) | wolny dostęp | używać danych z cytowaniem "R.L. Workman et al. (PDG)" |
| Feynman Lectures (feynmanlectures.caltech.edu) | © Caltech — **tylko czytanie online** | czytać, linkować, uczyć się; NIE kopiować tekstu/rysunków do aplikacji |
| MIT OpenCourseWare | CC BY-NC-**SA** | ⚠️ NC = zakaz użycia komercyjnego treści; dobre do nauki zespołu, nie do wbudowania w płatny produkt |
| OpenStax "University Physics" | **CC BY 4.0** | ✅ najlepszy legalny korpus tekstowy pod RAG/Narratora — wolno komercyjnie z atrybucją |
| Wikipedia | CC BY-SA 4.0 | używać z atrybucją + share-alike; ostrożnie przy wbudowywaniu |
| Wolfram (Demonstrations, MathWorld) | © / CC BY-NC-SA | ⚠️ tylko jako inspiracja i referencja matematyczna; nie kopiować kodu |
| arXiv | licencja per-artykuł | czytać wszystko; wzory i wyniki — wolno; figury — sprawdzić licencję artykułu |
| Stanford (Susskind, "Theoretical Minimum") | wykłady free na YT; książki © | oglądać, uczyć się; nie kopiować |
| Perimeter Institute (PIRSA, materiały outreach) | free dostęp; terms per-materiał | oglądać; materiały dla nauczycieli często darmowe — sprawdzić przy EDU |

Reguła praktyczna: **dane i wzory z NASA/CERN/NIST — wbudowujemy; teksty
z Feynmana/MIT/Wolframa — tylko czytamy i piszemy własnymi słowami.**

---

## 1. Universe Lab

**Wzory (zaimplementowane / do implementacji):**
- Równanie Friedmanna: H²(a) = H₀²(Ω_m a⁻³ + Ω_r a⁻⁴ + Ω_Λ) — w Etapie 0 bez Ω_r
- Redshift: 1 + z = 1/a; prawo Hubble'a v = H₀·d
- Parametry ΛCDM (Planck 2018): H₀ = 67,4 km/s/Mpc, Ω_m = 0,315, Ω_Λ = 0,685
- Soczewkowanie (Etap 2): równanie soczewki punktowej β = θ − θ_E²/θ; promień Einsteina
- Fale grawitacyjne (Etap 2): chirp — f i amplituda z masy ćwierkowej (wzory kwadrupolowe)

**Publikacje:**
- Planck 2018 results VI: parametry kosmologiczne — arXiv:1807.06209
- Riess et al. 1998 / Perlmutter et al. 1999 — przyspieszenie ekspansji (SN Ia)
- Toomre & Toomre 1972 — klasyka symulacji zderzeń galaktyk (ApJ 178, 623)
- LIGO GW150914 — arXiv:1602.03837 (pierwsza detekcja fal grawitacyjnych)
- Rubin & Ford 1970 — krzywe rotacji → ciemna materia (ApJ 159, 379)

**Książki:** B. Ryden, *Introduction to Cosmology* (standard dydaktyczny);
S. Dodelson, *Modern Cosmology*; darmowe notatki: S. Carroll — arXiv:astro-ph/0004075.

**Dane/API:**
- **JPL Horizons** (ssd-api.jpl.nasa.gov) — ephemerydy całego Układu Słonecznego,
  bez klucza, domena publiczna → fundament trybu "prawdziwy Układ Słoneczny"
- NASA Exoplanet Archive — katalog >5900 egzoplanet z parametrami orbit
- ESA Gaia Archive — pozycje/paralaksy ~2 mld gwiazd (do mapy 3D nieba)
- LIGO/Virgo GWOSC (gwosc.org) — otwarte dane fal grawitacyjnych z realnych detekcji

**Pomysły na rozwój:**
1. Zderzenia galaktyk N-ciał z drzewem Barnes–Hut (O(N log N), ~5–10 tys. cząstek
   realnie na telefonie w WebGL) — wzorzec: Toomre & Toomre
2. Prawdziwy Układ Słoneczny z Horizons + "co jeśli usunę Jowisza?"
3. Chirp GW150914 z dźwiękiem — realne dane z GWOSC (WOW: "posłuchaj zderzenia
   czarnych dziur")
4. Krzywa rotacji galaktyki: suwak ciemnej materii vs dane obserwacyjne

**Ograniczenia modeli:** pomijamy erę promieniowania i formowanie struktur
(wymaga N-ciał kosmologicznych klasy superkomputera); nasze zderzenia galaktyk
będą bezkolizyjne (gwiazdy nie zderzają się fizycznie — to akurat zgodne z
rzeczywistością); hydrodynamika gazu (SPH) poza zasięgiem mobile w czasie
rzeczywistym.

---

## 2. Space-Time Lab + Einstein Lab

**Wzory:**
- STW (dokładne): γ = 1/√(1−v²/c²); transformacja Lorentza; relatywistyczne
  składanie prędkości u' = (u+v)/(1+uv/c²); efekt Dopplera √((1+β)/(1−β))
- Metryka Schwarzschilda; r_s = 2GM/c²; sfera fotonowa 1,5 r_s; ISCO 6GM/c²
- Dylatacja grawitacyjna: √(1−r_s/r); GPS: +45,9 μs/d (grawitacja) − 7,2 μs/d
  (prędkość) ≈ +38 μs/d
- Ugięcie światła α = 4GM/(c²b); opóźnienie Shapiro
- Geodezyjne Schwarzschilda przez potencjał efektywny (Etap 1 — całkowanie RK4)
- Metryka Kerra: ergosfera, frame-dragging (Lense–Thirring)
- Alcubierre 1994 (Class. Quantum Grav. 11, L73) — HIPOTEZA, wymaga ujemnej
  gęstości energii; Einstein–Rosen 1935 (Phys. Rev. 48, 73) — most ER, HIPOTEZA

**Publikacje:**
- James, von Tunzelmann, Franklin & Thorne 2015 — *Gravitational lensing by
  spinning black holes…* (Class. Quantum Grav. 32, 065001, **open access**) —
  jak renderowano czarną dziurę w "Interstellar"; nasza mapa drogowa renderingu
- Luminet 1979 — pierwszy obraz dysku akrecyjnego (A&A 75, 228)
- Event Horizon Telescope 2019 (M87*) — ApJL 875 — porównanie wizualne
- Gravity Probe B 2011 — pomiar frame-draggingu (PRL 106, 221101)

**Książki:** J. Hartle, *Gravity* (najlepszy poziom "fizyka bez pełnej geometrii
różniczkowej"); Taylor & Wheeler, *Spacetime Physics* (STW — II wyd. darmowe
online od autorów); S. Carroll, notatki OTW — arXiv:gr-qc/9712019 (darmowe);
MTW *Gravitation* (referencja).

**Pomysły na rozwój:**
1. Pełne geodezyjne fotonów Schwarzschilda (RK4) + cienki dysk akrecyjny =
   "Interstellar na telefonie" — flagowy WOW Etapu 1 (WebGL shader)
2. Spadek na czarną dziurę z dwóch perspektyw (obserwator daleki vs spadający)
3. Diagramy Minkowskiego z interaktywnym boostem
4. Wizualne porównanie naszego renderu z obrazem EHT M87*

**Ograniczenia modeli:** pełny ray-tracing Kerra w czasie rzeczywistym jest
ciężki na mobile — strategia: precompute tablic ugięć + shader; wnętrze
horyzontu pokazujemy wyłącznie jako model matematyczny (brak fizyki do
weryfikacji); ER i Alcubierre zawsze z fioletową etykietą hipotezy.

---

## 3. Quantum Lab

**Wzory:**
- Interferencja 2 szczelin: I(θ) ∝ cos²(πd·sinθ/λ)·sinc²(πa·sinθ/λ) — zaimplementowane
- Równanie Schrödingera 1D — metoda split-step Fourier (Etap 1: tunelowanie
  pakietu falowego; wykonalne w 60 fps na telefonie dla siatki 1024 punktów)
- Kubit: sfera Blocha |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩; bramki H, X, Y, Z,
  CNOT jako macierze; do ~10 kubitów symulacja stanu pełnego jest trywialna
- CHSH: klasycznie S ≤ 2, kwantowo do 2√2 (granica Cirel'sona); E(a,b) = −cos(a−b)
- Rozpad koherencji: model dephasingu eksponencjalnego

**Publikacje:**
- Tonomura et al. 1989 — pojedyncze elektrony budują prążki (Am. J. Phys. 57, 117)
  — dokładnie to symulujemy w Etapie 0
- Aspect et al. 1982 — łamanie nierówności Bella (PRL 49, 1804)
- Bouwmeester/Zeilinger et al. 1997 — teleportacja kwantowa (Nature 390, 575)
- Fein et al. 2019 — interferencja cząsteczek 25 kDa (Nature Physics 15, 1242)
- Nobel 2022 (Aspect, Clauser, Zeilinger) — kontekst popularyzatorski

**Książki/kursy:** Feynman Lectures **Vol. III** (czytać online — kanoniczne
wyjaśnienie dwóch szczelin; NIE kopiować); Nielsen & Chuang, *Quantum
Computation and Quantum Information*; Griffiths, *Introduction to QM*;
**Qiskit Textbook** (open source — wzorzec dydaktyki bramek); QuTiP (open
source, BSD — referencyjna implementacja dynamiki kwantowej).

**Pomysły na rozwój:**
1. Tunelowanie: żywy pakiet falowy 1D uderzający w barierę (split-step) —
   nikt nie ma tego dobrze na telefonie
2. Gra CHSH: użytkownik "gra przeciwko lokalnemu realizmowi" i przegrywa
3. Sfera Blocha z gestami + kompozytor obwodów (5 bramek, 2–3 kubity)
4. Teleportacja krok po kroku na 3 kubitach (pełna symulacja stanu)

**Ograniczenia modeli:** pełna symulacja >30 kubitów niemożliwa (2^n);
dekoherencję pokazujemy fenomenologicznie; nasze "pomiary" to próbkowanie
rozkładu — uczciwie opisane w nocie modelu.

---

## 4. Atom Lab

**Wzory:**
- Atom wodoru — jedyny rozwiązany analitycznie: E_n = −13,6 eV/n²;
  ψ_nlm = R_nl(r)·Y_lm(θ,φ) (Laguerre × harmoniki sferyczne) → orbitale 3D
  do próbkowania punktowego |ψ|² (Etap 1)
- Wzór Rydberga: 1/λ = R(1/n₁² − 1/n₂²); serie Lymana/Balmera/Paschena
- Reguła Aufbau (zaimplementowana; odstępstwa: Cr, Cu, Nb, Mo, Ru, Rh, Pd, Ag,
  Pt, Au — do poprawienia tabelą wyjątków)

**Dane:**
- **NIST Atomic Spectra Database** — linie widmowe wszystkich pierwiastków,
  domena publiczna → widma emisyjne per pierwiastek (Etap 2)
- CODATA 2022 (NIST) — stałe fizyczne; IUPAC — masy atomowe
- NIST Elemental Data Index — energie jonizacji, konfiguracje (nasze wyjątki
  od Aufbau stąd)

**Książki:** Griffiths, *Introduction to QM* (rozdz. 4 — atom wodoru);
Feynman Vol. III (czytać online).

**Pomysły na rozwój:**
1. Orbitale 3D jako chmury punktów próbkowane z |ψ|² (WebGL points — tanie
   i spektakularne)
2. Widmo emisyjne: wybierasz pierwiastek → jego realne linie z NIST + kolory
3. Mapa nuklidów (wspólna z Nuclear Lab)
4. "Zbuduj atom": przeciągasz p/n/e⁻ i sprawdzasz stabilność

**Ograniczenia modeli:** atomy wieloelektronowe nie mają rozwiązań analitycznych
(Hartree–Fock/DFT poza zasięgiem mobile) — dla Z>1 pokazujemy dane zmierzone
(NIST), nie "obliczone przez nas"; to uczciwsze i dokładniejsze.

---

## 5. Nuclear Lab

**Wzory:**
- Prawo rozpadu N(t) = N₀·2^(−t/T½) (zaimplementowane); aktywność A = λN
- Równania Batemana — łańcuchy rozpadów (Etap 2: pełny łańcuch U-238 → Pb-206)
- Formuła Weizsäckera (SEMF): B(A,Z) = a_V·A − a_S·A^⅔ − a_C·Z²/A^⅓ −
  a_A·(A−2Z)²/A ± δ → "dolina stabilności" 3D
- Rozszczepienie: mnożnik neutronów k (k<1 podkrytyczny, k=1 krytyczny);
  energia ~200 MeV/rozszczepienie U-235
- Fuzja: przekrój D-T (maksimum ~100 keV), kryterium Lawsona nτT >
  3×10²¹ keV·s/m³ (tokamak)

**Dane:**
- **NNDC NuDat 3** (Brookhaven, US gov — domena publiczna) — T½, mody rozpadu,
  energie dla ~3400 nuklidów → mapa nuklidów
- IAEA Live Chart of Nuclides — wygodna referencja wizualna (licencję na
  re-użycie danych sprawdzić przed Etapem 2; alternatywa: NNDC wystarcza)
- Parametry ITER — publiczne (iter.org)

**Książki:** K. Krane, *Introductory Nuclear Physics* (standard).

**Pomysły na rozwój:**
1. Interaktywna mapa nuklidów N–Z kolorowana modem rozpadu (dane NNDC) —
   "układ okresowy 2.0", mało kto ma to na telefonie
2. Reakcja łańcuchowa: neutrony odbijają się w siatce U-235 z prętami
   kontrolnymi — suwak k i moment krytyczności
3. Tokamak: bilans mocy z kryterium Lawsona; suwaki n, τ, T → "czy zapłon?"
4. Łańcuch U-238 z równaniami Batemana — 14 pokoleń na jednej osi czasu (log)

**Ograniczenia modeli:** prawdziwa neutronika reaktora to transport Monte Carlo
(MCNP/OpenMC — nie na telefon); nasz model k jest dydaktyczny; przekroje
czynne bierzemy z danych, nie liczymy z QCD.

---

## 6. Particle Lab

**Wzory:**
- Krzywizna toru: p_T [GeV/c] = 0,3·B[T]·r[m] (zaimplementowane jakościowo)
- Masa niezmiennicza: M² c⁴ = (ΣE)² − (Σp c)² — fundament Etapu 1
- Relatywistyczna kinematyka rozpadów 2-ciałowych

**Dane — tu jest złoto:**
- **CERN Open Data (opendata.cern.ch) — CC0.** Edukacyjne zestawy CMS/ATLAS:
  realne zdarzenia dimionowe w prostych CSV → histogram masy niezmienniczej
  z pikami J/ψ (3,1 GeV), Υ (9,5 GeV), **Z (91 GeV)** na telefonie użytkownika.
  "Odkryj bozon Z z prawdziwych danych LHC" — killer feature Etapu 1/2,
  w pełni legalna
- **PDG** (pdg.lbl.gov) — masy, czasy życia, mody rozpadów wszystkich cząstek
  (cytować PDG)

**Publikacje:**
- ATLAS & CMS 2012 — odkrycie Higgsa (Phys. Lett. B 716, 1 i 30 — open access)
- PDG Review of Particle Physics — coroczna biblia dziedziny

**Książki:** Griffiths, *Introduction to Elementary Particles*; M. Thomson,
*Modern Particle Physics*.

**Pomysły na rozwój:**
1. **"Odkryj Z⁰ sam"**: histogram mas z realnych dimionów CMS (CC0) — użytkownik
   widzi pik wyrastający z prawdziwych danych
2. Interaktywna mapa Modelu Standardowego (dane PDG)
3. Dżety: stylizowana fragmentacja kwarków z wyjaśnieniem uwięzienia koloru
4. Rekonstrukcja H→γγ na uproszczonych danych edukacyjnych ATLAS

**Ograniczenia modeli:** nie symulujemy QCD ani pełnego detektora (Geant4);
krotności i typy cząstek w Etapie 0 są losowane — uczciwie opisane; realne
rozkłady wchodzą dopiero z danymi CERN.

---

## 7. Multiverse Lab (całość: modele teoretyczne)

**Modele/wzory:**
- Skalowania fine-tuningu: czas życia gwiazd ~ G⁻² (rząd wielkości); progi
  siły silnej ±~9% (diproton/deuter); czułość rezonansu Hoyle'a (7,65 MeV
  w ¹²C) na poziomie ~%
- Klasyfikacja multiwersów Tegmarka (poziomy I–IV)

**Publikacje:**
- L. Barnes 2012 — *The Fine-Tuning of the Universe for Intelligent Life* —
  arXiv:1112.4647 (najlepszy przegląd naukowy tematu)
- Tegmark 2003 — arXiv:astro-ph/0302131 (klasyfikacja multiwersów)
- Everett 1957 — interpretacja wielu światów (Rev. Mod. Phys. 29, 454)
- Hoyle 1954 — przewidzenie rezonansu ¹²C

**Książki:** M. Rees, *Just Six Numbers* (popularne, rzetelne); Barrow &
Tipler, *The Anthropic Cosmological Principle* (referencja).

**Pomysły na rozwój:**
1. Galeria nazwanych wszechświatów ("bez chemii", "wiecznych gwiazd",
   "wielkiego chłodu") z pełnym audytem konsekwencji
2. Porównywarka dwóch wszechświatów side-by-side
3. Rezonans Hoyle'a jako osobna mini-symulacja progu syntezy węgla

**Ograniczenia modeli:** wszystkie skalowania są szacunkami rzędów wielkości;
części konsekwencji nie da się policzyć bez pełnej symulacji gwiazd; status
epistemiczny (hipoteza) musi być widoczny na każdym ekranie — to warunek
wiarygodności całej platformy.

---

## 8. Civilization Lab

**Wzory/modele:**
- Kardashev 1964 (oryginał: *Transmission of Information by Extraterrestrial
  Civilizations*, Soviet Astronomy 8, 217); interpolacja Sagana
  K = (log₁₀P − 6)/10 (zaimplementowane)
- Dyson 1960 — *Search for Artificial Stellar Sources of Infrared Radiation*
  (Science 131, 1667)
- Równanie Drake'a; model kolonizacji Hart 1975; tempo ekspansji ~0,01c →
  Galaktyka w ~10⁷ lat
- Limit Landauera (minimalna energia obliczeń) — most do "cywilizacji jako
  komputera"

**Publikacje:**
- Wright et al. 2014 — Ĝ survey (szukanie sygnatur IR cywilizacji II/III typu,
  ApJ 792) — wynik negatywny, ważny dla uczciwości
- Sandberg, Drexler & Ord 2018 — *Dissolving the Fermi Paradox* —
  arXiv:1806.02404

**Pomysły na rozwój:**
1. Percolacyjny symulator kolonizacji Galaktyki (mapa gwiazd z Gaia!)
2. Kalkulator równania Drake'a z suwakami niepewności — pokazuje, czemu
   odpowiedzi różnią się o 10 rzędów wielkości
3. Katalog megastruktur z bilansami energii (rój Dysona, pierścień Nivena —
   z fizyką stabilności)

**Ograniczenia modeli:** wszystko powyżej K≈0,73 jest spekulacją; utrzymujemy
rozdział "co jest zmierzone" (zużycie energii ludzkości, wynik Ĝ) od "co jest
hipotezą" (wszystko inne).

---

## 9. AI Discovery Lab / Narrator

**Korpus wiedzy pod RAG (Etap 1–2), wg legalności:**
1. **OpenStax University Physics t. 1–3 (CC BY 4.0)** — pełnoprawny podręcznik
   akademicki, wolno wbudować komercyjnie z atrybucją → podstawowy korpus
2. Dane NIST/NASA/PDG/CERN (domena publiczna / CC0) — grounding liczbowy
3. Wikipedia (CC BY-SA) — uzupełniająco, z atrybucją
4. ⚠️ NIE do korpusu: Feynman Lectures (tylko czytanie), MIT OCW (NC),
   HyperPhysics (©)

**Architektura (zaprojektowana w Etapie 0):**
- Provider lokalny: deterministyczna narracja z parametrów symulacji — zostaje
  na zawsze jako warstwa "zero halucynacji"
- Provider LLM (Etap 1): backend proxy; prompt zawiera stan symulacji
  (parametry + statystyki) → model odpowiada TYLKO w kontekście tego, co
  użytkownik widzi; cytuje źródła z korpusu
- Twarda zasada: LLM nigdy nie ogłasza "odkryć"; proponuje i wyjaśnia

**Pomysły na rozwój:**
1. Raporty z eksperymentów: użytkownik zapisuje przebieg → AI generuje
   raport z wykresami (Etap 2)
2. Porównywanie scenariuszy ("mój wszechświat A vs B")
3. Tryb nauczyciela: AI układa sekwencję eksperymentów pod temat lekcji (EDU)

**Ograniczenia:** koszty LLM rosną z użyciem → limity per user; halucynacje
kontrolujemy groundingiem w stanie symulacji + korpusem; odpowiedzi fizyczne
zawsze z poziomem pewności.

---

## 10. Scale Journey (ekran główny)

**Dane rozmiarów:** CODATA (promień protonu 0,84 fm), IAU/NASA (ciała Układu
Słonecznego), Gaia (odległości gwiazd), Planck (rozmiar obserwowalnego
Wszechświata 8,8×10²⁶ m). Inspiracja: *Powers of Ten* (Eames, 1977) — koncepcja
podróży przez skale nie podlega ochronie, film tak.

**Pomysły:** przejście z abstrakcyjnych okręgów na realne obiekty (zdjęcia
NASA — domena publiczna); przystanki narracyjne ("jesteś teraz wewnątrz
komórki"); tryb VR w Etapie 4+.

---

## 11. Priorytety badawcze przed Etapem 1 (kolejność czytania)

1. James et al. 2015 (CQG 32, 065001, open access) — rendering czarnej dziury
2. CERN Open Data: edukacyjne zestawy dimionowe CMS — pobrać, obejrzeć format
3. Metoda split-step Fourier dla Schrödingera 1D (dowolny podręcznik metod
   numerycznych; wzorzec open source: QuTiP)
4. JPL Horizons API — dokumentacja zapytań (ssd-api.jpl.nasa.gov/doc/horizons.html)
5. OpenStax University Physics — struktura rozdziałów pod korpus Narratora
6. NNDC NuDat — format eksportu danych nuklidów

---

*Konwencja aktualizacji: każda nowa funkcja laboratorium dopisuje tu swoje
źródła i ograniczenia w tym samym commicie, w którym wchodzi kod.*
