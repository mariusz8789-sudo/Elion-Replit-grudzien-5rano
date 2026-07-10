# Universe Lab — katalog wiedzy

## Zakres
Ekspansja Wszechświata, formowanie i zderzenia galaktyk, ciemna materia,
ciemna energia, fale grawitacyjne, soczewkowanie.

## Modele i wzory

**ΛCDM — model standardowy kosmologii** ★★★★
Równanie Friedmanna H²(a) = H₀²(Ω_m a⁻³ + Ω_r a⁻⁴ + Ω_k a⁻² + Ω_Λ).
Parametry (Planck 2018): H₀ = 67,4 ± 0,5 km/s/Mpc; Ω_m = 0,315; Ω_Λ = 0,685;
wiek 13,8 mld lat. Redshift: 1+z = 1/a. Etap 0 implementuje wersję płaską
bez Ω_r — poprawną od ~50 tys. lat po Wielkim Wybuchu.

**Przyspieszenie ekspansji** ★★★★★ (samo zjawisko)
SN Ia (Riess 1998, Perlmutter 1999; Nobel 2011) + CMB + BAO — trzy niezależne
linie dowodowe. Natura ciemnej energii: patrz spory niżej.

**Dynamika zderzeń galaktyk** ★★★★★
Zderzenia bezkolizyjne (gwiazdy praktycznie nigdy się nie zderzają — odległości
międzygwiezdne ~10⁷ średnic gwiazd). Ogony pływowe odtworzone już przez
Toomre & Toomre 1972 na 120 cząstkach — dobra wiadomość dla mobile: efekt
jest jakościowo odporny na małe N.

**Fale grawitacyjne — chirp (zaimplementowane, patrz Einstein Lab)** ★★★★★
Chirp: f rośnie do złączenia; amplituda i faza z masy ćwierkowej
ℳ = (m₁m₂)^⅗/(m₁+m₂)^⅕. GW150914 zgodny z OTW; dane surowe otwarte (GWOSC).
Dedykowany eksperyment (`einstein-chirp.ts`, dźwięk+wykres) opisany w
`knowledge/spacetime-einstein.md`, żeby nie duplikować treści między labami.

**Problem trzech ciał (zaimplementowane)** ★★★★★
Grawitacja Newtona bez przybliżeń, jednostki bezwymiarowe (G=1), integracja
velocity-Verlet (symplektyczna — zachowuje energię długoterminowo, w
przeciwieństwie do zwykłego Eulera). Poincaré (1887, praca dla nagrody króla
Oskara II Szwecji) udowodnił brak ogólnego rozwiązania analitycznego dla N≥3
ciał — to właśnie ta praca zapoczątkowała współczesną teorię chaosu. Dwa
realne, udokumentowane układy startowe: ósemka (figure-eight choreography,
odkryta numerycznie przez C. Moore'a 1993, dowód istnienia Chenciner &
Montgomery 2000, Annals of Mathematics 152) — rzadki przykład STABILNEJ,
okresowej orbity trzech równych mas; problem pitagorejski (Burrau 1913,
masy 3:4:5 z wierzchołków trójkąta 3-4-5, start z spoczynku) — klasyczny
przykład chaotycznej ewolucji z bliskimi przejściami. Tryb "dwa niemal
identyczne starty" (różnica 10⁻⁶ jednostki w jednym ciele) demonstruje
czułość na warunki początkowe: w problemie pitagorejskim odległość między
kopiami rośnie wykładniczo po pierwszym bliskim przejściu (dodatni
wykładnik Lapunowa) — namacalny „efekt motyla"; w ósemce rośnie znacznie
wolniej (orbita jest strukturalnie stabilna). Implementacja: krok
integracji jest ADAPTACYJNY (maleje przy bliskich przejściach ciał, kryterium
zbliżone do Aarsetha) — bez tego stałokrokowy integrator traci energię przy
zbliżeniu w problemie pitagorejskim, mimo że sam schemat jest symplektyczny.

**Podwójne wahadło (zaimplementowane)** ★★★★★
Drugi eksperyment "chaos deterministyczny" w Universe Lab, obok problemu
trzech ciał — celowo najprostszy fizycznie możliwy układ z chaosem (2
stopnie swobody). Dokładne równania Lagrange'a dla dwóch sztywnych prętów
bez tarcia (standardowy wynik podręcznikowy), integrowane RK4 — CELOWO NIE
symplektycznie, w kontraście z problemem trzech ciał: energia powoli
dryfuje w czasie, co jest jawnie pokazane w odczycie liczbowym, nie ukryte.
Przy małym kącie startowym (<~35°) ruch jest niemal okresowy; powyżej tego
progu (empirycznie) staje się chaotyczny — suwak kąta pozwala przejść
między obydwoma reżimami na żywo. Ten sam tryb "dwa niemal identyczne
starty" (10⁻⁶ rad) co w problemie trzech ciał.

**Prawdziwy Układ Słoneczny (zaimplementowane)** ★★★★★
Elementy orbitalne 8 planet (półoś wielka, mimośród, okres) z NASA
Planetary Fact Sheet — publiczne, stabilne stałe. Pozycja liczona
dokładnym rozwiązaniem równania Keplera M = E − e·sinE (Newton, 8
iteracji). Zweryfikowane testami: odległość peryhelium/aphelium
a·(1∓e) dokładna dla wszystkich 8 planet, trzecie prawo Keplera
T²∝a³ zgodne z rzeczywistymi okresami NASA w granicach 1%. Świadome
uproszczenie: kąty startowe dowolne (nie żywa efemeryda — to wymaga
NASA JPL Horizons, patrz niżej), skala odległości skompresowana (√a).
Od redesignu wizualnego: druga, 3D wersja tego samego eksperymentu
(Three.js/WebGL, `core/three/`) — DOKŁADNIE ta sama fizyka, dodatkowe
uproszczenie względem 2D: orbity współpłaszczyznowe (brak inklinacji w
źródle danych, patrz honestyNote eksperymentu).

## Sprzeczne teorie / otwarte spory

**Napięcie Hubble'a** ★★★ (spór realny, nierozstrzygnięty)
Pomiar lokalny (cefeidy+SN, zespół SH0ES): H₀ ≈ 73 km/s/Mpc. Pomiar z CMB
(Planck, przy założeniu ΛCDM): 67,4. Rozbieżność ~5σ. Interpretacje:
(a) nieznana systematyka pomiarowa; (b) nowa fizyka (wczesna ciemna energia,
dodatkowe neutrina). W aplikacji: suwak H₀ 50–100 celowo obejmuje obie
wartości — do dodania nota "dwa obozy pomiarowe".

**Ciemna materia: cząstki vs zmodyfikowana grawitacja** — asymetryczny spór
- Zimna ciemna materia (CDM): ★★★★ — krzywe rotacji, soczewkowanie, gromada
  Pocisk (rozdzielenie masy i gazu), widmo CMB. Ale: cząstki nie wykryto
  bezpośrednio (LZ/XENON — wyniki negatywne).
- MOND/zmodyfikowana dynamika: ★★ — dobrze dopasowuje krzywe rotacji
  pojedynczych galaktyk, zawodzi na gromadach i CMB bez dodatkowej materii.
W aplikacji: dedykowany eksperyment „Krzywa rotacji galaktyki" (Universe
Lab, `universe-rotationcurve.ts`) pokazuje CDM jako domyślny model (suwak
masy halo) z przełącznikiem na MOND — obie strony tego samego zjawiska
(płaska krzywa) osiągnięte zupełnie inną drogą, obie uczciwie oznaczone.

**Natura ciemnej energii** ★★★ 
Stała kosmologiczna (w = −1) vs kwintesencja (w zmienne). Wyniki DESI
(2024–2025) zasugerowały możliwą ewolucję w czasie — niepotwierdzone
rozstrzygająco na moment zapisu. Obserwować przed Etapem 2.

## Publikacje i książki
- Planck 2018 VI — arXiv:1807.06209 (parametry)
- Toomre & Toomre 1972, ApJ 178, 623 (zderzenia)
- LIGO — arXiv:1602.03837 (GW150914)
- Clowe et al. 2006, ApJ 648, L109 (gromada Pocisk — dowód na DM)
- Podręczniki: Ryden *Introduction to Cosmology*; Dodelson *Modern Cosmology*;
  darmowe: Carroll arXiv:astro-ph/0004075

## Dane i inspiracje
- JPL Horizons (domena publiczna, bez klucza) — statyczne elementy orbitalne
  już wpięte (`data/solarSystem.ts`); ŻYWA efemeryda (prawdziwe pozycje
  planet "dzisiaj", nie tylko kształt orbit) czeka na `scripts/fetch-real-data.mjs
  jpl` z sieci bez blokady — patrz README „Znane ograniczenia"
- GWOSC (gwosc.org) — surowe dane fal grawitacyjnych
- ESA Gaia — pozycje 2 mld gwiazd (CC BY-SA 3.0 IGO dla materiałów);
  fetcher gotowy (`scripts/fetch-real-data.mjs gaia`), brak jeszcze
  konsumenta w UI — naturalne miejsce: panel "najbliższe gwiazdy" w tym
  labie, tym samym wzorcem co Prawdziwy Układ Słoneczny
- Inspiracje formy (nie kopiować): Universe Sandbox (dramaturgia katastrof),
  NASA Eyes (nawigacja czasem), Space Engine (skala)

## Ograniczenia implementacyjne
- N-ciał na mobile: Barnes–Hut O(N log N), realnie 5–20 tys. cząstek w WebGL;
  hydrodynamika gazu (SPH) — poza zasięgiem czasu rzeczywistego
- Formowanie struktur od fluktuacji pierwotnych — tylko jako prerenderowane
  sekwencje (dane z publicznych symulacji typu Millennium/IllustrisTNG —
  sprawdzić licencje wizualizacji)
- Era promieniowania pominięta w Etapie 0 (błąd istotny tylko dla t < 50 tys. lat)

## Wnioski projektowe dla Genesis OS

**Universe Lab jako laboratorium flagowe (decyzja produktowa).** Kolejność
eksperymentów zaczyna się dziś od Prawdziwego Układu Słonecznego — to
jedyny eksperyment w całej aplikacji oparty w 100% na realnych, cytowanych
stałych NASA zamiast modelu poglądowego. Naturalny kierunek rozwoju:
1. Zderzenia galaktyk Barnes–Hut = najlepszy stosunek WOW/koszt w tym labie
2. ✅ Chirp GW z dźwiękiem — zbudowany w Einstein Lab (`einstein-chirp.ts`),
   dźwięk syntezowany z formuły kwadrupolowej (Web Audio API), nie z
   surowych danych GWOSC (te pozostają w backlogu jako opcjonalne
   wzbogacenie realnym przebiegiem zamiast modelu analitycznego)
3. Napięcie Hubble'a i spór o DM to gotowe, uczciwe narracje "nauka żywa,
   nie zamknięta" — wyróżnik wobec konkurencji, która udaje pewność
4. Żywa efemeryda JPL Horizons (gdy sieć dostępna) zamieniłaby dowolne
   kąty startowe na realne "gdzie jest Mars dzisiaj" — najwyższy priorytet
   następnego kroku danych w tym labie
5. Panel najbliższych gwiazd z ESA Gaia — drugi krok, ten sam wzorzec
   (`core/dataSource.ts`) co Układ Słoneczny, gdy dane będą pobrane
