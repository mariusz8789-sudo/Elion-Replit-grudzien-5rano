# Space-Time Lab + Einstein Lab — katalog wiedzy

## Zakres
Szczególna i ogólna teoria względności: dylatacja czasu, geodezyjne, czarne
dziury, metryki, oraz jawnie hipotetyczne rozszerzenia (ER, Alcubierre).

## Modele i wzory

**Szczególna teoria względności** ★★★★★
γ = 1/√(1−β²); transformacja Lorentza; składanie prędkości
u' = (u+v)/(1+uv/c²); Doppler relatywistyczny √((1+β)/(1−β)).
Potwierdzenia bezpośrednie: miony kosmiczne, zegary w samolotach
(Hafele–Keating 1971), akceleratory codziennie. Zegar świetlny z Etapu 0
jest dokładny, nie przybliżony.

**OTW — pole słabe** ★★★★★
Ugięcie α = 4GM/(c²b) (Eddington 1919: 1,75″ przy Słońcu); opóźnienie
Shapiro; dylatacja grawitacyjna √(1−r_s/r); GPS: bilans +45,9 −7,2 ≈ +38 μs/d.

**OTW — pole silne / czarne dziury** ★★★★★ (po 2015 r.)
Metryka Schwarzschilda: r_s = 2GM/c²; sfera fotonowa 1,5 r_s; ISCO 6GM/c².
Kerr: ergosfera, frame-dragging (Gravity Probe B 2011; jety AGN) —
geodezyjne równikowe zaimplementowane (patrz niżej), NIE tylko poglądowo.
Dowody bezpośrednie: fale grawitacyjne (2015), obraz EHT M87* (2019)
i Sgr A* (2022), gwiazda S2 wokół Sgr A* (Nobel 2020).

**Geodezyjne fotonów Schwarzschilda (zaimplementowane, 2D i 3D)**
Równanie geodezyjnej zerowej d²u/dφ² = −u + (3/2)r_s·u² (u=1/r), całkowanie
RK4 (`core/physics.ts`: `stepSchwarzschildGeodesic`, jedna funkcja
współdzielona przez obie wersje). Krytyczny parametr zderzenia
b_c = (3√3/2)·r_s. Wersja 3D (Einstein Lab → „Czarna dziura 3D") losuje
orientację płaszczyzny orbity per foton — fizycznie ścisłe, bo geodezyjne
wokół masy sferycznie symetrycznej ZAWSZE leżą w jednej płaszczyźnie przez
środek. Dysk akrecyjny: poglądowy w obu wersjach (jasność ~ wzmocnienie
Dopplera, nie precyzyjny transfer promieniowania). Render w pełnej metodzie
Luminet 1979 → James et al. 2015 ("Interstellar", CQG 32, 065001, open
access) — z prawdziwym soczewkowaniem obrazu dysku zza horyzontu — pozostaje
w `VISION-BACKLOG.md` jako możliwe dalsze rozszerzenie tej samej fizyki.

**Geodezyjne równikowe Kerra 3D (zaimplementowane)** ★★★★★
Wirująca czarna dziura, płaszczyzna równikowa (θ=π/2, stała Cartera Q=0):
dokładne równania Boyer–Lindquist (Carter 1968), przekształcone do postaci
Bineta (du/dφ)²=F(u) i całkowane RK4 (`core/physics.ts`:
`stepKerrEquatorialGeodesic`). Zweryfikowane: przy spinie a=0 daje
identyczny tor co geodezyjna Schwarzschilda (zgodność do 13 cyfry);
promienie orbit fotonowych prograde/retrograde r̂_±=2M[1+cos((2/3)
arccos(∓a/M))] (Bardeen 1972; Teo 2003, arXiv:0906.4650) odtwarzają znane
granice ekstremalne (r̂_pro→M, r̂_retro→4M przy a→M); krytyczny parametr
zderzenia b_±=±3√(Mr̂_±)−a redukuje się dokładnie do 3√3·M Schwarzschilda
przy a=0. Efekt wleczenia układów inercjalnych (frame-dragging) widoczny
wprost: orbita prograde leży bliżej horyzontu niż retrograde — to
policzalny skutek metryki, nie ilustracja. Horyzont r+=M+√(M²−a²) i
ergosfera r_ergo(θ)=M+√(M²−a²cos²θ) — dokładne wzory, renderowane jako
prawdziwe powierzchnie 3D (nie placeholder). ŚWIADOMIE POZA zakresem:
geodezyjne poza równikiem (Q≠0, precesja w θ — wymaga pełnych równań
Cartera / całek eliptycznych, backlog); prawdziwe ISCO Kerra (zależne od
spinu i kierunku, osobne obliczenie — dysk akrecyjny pozostaje poglądowy).

**Chirp fali grawitacyjnej (zaimplementowane)** ★★★★★
Formuła kwadrupolowa wiodącego rzędu (Abbott i in. 2016, PRL 116, 061102 —
GW150914, Nagroda Nobla 2017 dla Weissa, Thorne'a i Barisha):
ℳ=(m₁m₂)^⅗/(m₁+m₂)^⅕ (masa ćwierkowa); τ(f)=(5/256)(GℳM_sun/c³)^(-5/3)(πf)^(-8/3)
(czas do połączenia); model kończy się na promieniu ISCO r=6GM/c² (ten sam
promień co „Geodezyjne fotonów" wyżej) — samo połączenie i „ringdown"
wymagają pełnej relatywistyki numerycznej, tu POKAZANEJ jako błysk, NIE
symulowanej. Separacja orbitalna liczona z relacji Keplera (ω_orb=πf_GW) —
zweryfikowana testem: separacja przy f_ISCO = dokładnie 6GM/c². Częstotliwości
fal z łączących się czarnych dziur gwiazdowej masy (dziesiątki-setki Hz) leżą
w PRAWDZIWYM ludzkim zakresie słyszalności — opcjonalny dźwięk syntezowany
Web Audio API gra rzeczywistą częstotliwość (Hz), rozciągniętą w czasie
suwakiem spowolnienia, nie przesuniętą wysokością.

## Sprzeczne teorie / otwarte spory

**Osobliwość: rzeczywistość czy granica teorii?** ★★★
OTW przewiduje osobliwość, ale sama tam przestaje obowiązywać. Kandydaci na
rozwiązanie (grawitacja pętlowa, struny, fuzzballe) — wszystkie ★★.
W aplikacji: wnętrze horyzontu zawsze z notą "poza zasięgiem zweryfikowanej
fizyki".

**Paradoks informacyjny czarnych dziur** ★★★ (spór aktywny)
Promieniowanie Hawkinga (★★★ — przewidywanie półklasyczne, niezmierzone)
zdaje się niszczyć informację wbrew MK. Stanowiska: utrata informacji
(Hawking wcześnie), unitarne odzyskanie (holografia/AdS-CFT — większość
teoretyków dziś), firewalle (AMPS 2012), miękkie włosy. Świetny materiał na
moduł "otwarte problemy fizyki" (Etap 2+).

**Modele jawnie hipotetyczne** — w aplikacji zawsze fiolet:
- Most Einsteina–Rosena (1935) ★★ — rozwiązanie równań OTW; klasyczny most
  nieprzechodni (zapada się szybciej, niż da się go przelecieć); wersje
  przechodnie (Morris–Thorne 1988) wymagają egzotycznej materii
- Metryka Alcubierre'a (1994) ★★ — spójna geometria "warp"; wymaga ujemnej
  gęstości energii w astronomicznych ilościach; dodatkowe problemy:
  horyzonty sterowania, promieniowanie Hawkinga bańki
- Dodatkowe wymiary (Kaluza–Klein, ADD, Randall–Sundrum) ★★ — brak sygnatur
  w LHC do ~TeV

## Tunele czasoprzestrzenne — pogłębiony katalog (falsyfikacyjny, nie budowlany)

**Uwaga o źródłach.** Sekcja skompilowana z pamięci treningowej modelu
(Qwen) bez odświeżenia na żywo w tej sesji — traktować cytowania jak
prowizoryczne do czasu weryfikacji wobec arXiv/APS/NASA (dotyczy zwłaszcza
wpisów bez pełnego autor+rok+czasopismo). Zasada nadrzędna: tunel
czasoprzestrzenny to **hipoteza do sfalsyfikowania**, nie cel budowlany —
Genesis nigdy nie twierdzi, że tunele istnieją ani że teleportacja materii
jest możliwa.

**Dlaczego przechodniość wymusza egzotyczną materię (twierdzenie, nie
założenie modelu)** ★★★★
Metryka Morrisa–Thorne'a: ds² = −e^{2Φ(r)}dt² + dr²/(1−b(r)/r) +
r²dΩ². Warunek gardła b(r₀)=r₀, warunek flare-out b'(r₀)<1 — to on
sprawia, że tunel się otwiera zamiast zapadać. Wstawienie do równań pola
przy gardle daje ρ+p_r<0 (złamanie NEC) — to wynika z geometrii, nie jest
wyborem modelowym. Warunki energetyczne klasyczne (NEC/WEC/SEC/DEC)
spełnia cała znana materia klasyczna; pola kwantowe łamią je lokalnie
(efekt Casimira, światło ściśnięte — zmierzone, FAKT), ale podlegają
uśrednionym/skwantowanym granicom (ANEC, QNEC — Faulkner i in. 2016;
dowód ogólny QNEC: Balakrishnan i in. 2017/2019; dowód holograficzny:
Koeller 2016).

**Ford–Roman quantum inequalities** ★★★★ — wielkość × czas trwania ujemnej
energii jest ograniczone (Ford & Roman 1995); analizy półklasyczne (Nandi
2004) sugerują, że tunel utrzymywany wyłącznie znaną fizyką kwantową ma
gardło rzędu kilku rzędów wielkości powyżej długości Plancka, nie
makroskopowe. Efekt Casimira między realnymi płytkami (Lamoreaux 1997) to
FAKT zmierzony, ale o ~20+ rzędów wielkości za słaby, by utrzymać gardło
metrowej skali — **krytyczne rozróżnienie: mały, zmierzony kwantowy efekt
ujemnej energii ≠ możliwość inżynierii makroskopowej geometrii.** Nie
łączyć tych dwóch w narracji.

**Taksonomia (skrót)** — każda pozycja to matematycznie spójna geometria,
żadna nie jest obserwacją:
- Most Einsteina–Rosena — nieprzechodni (już w pliku wyżej)
- Morris–Thorne (1988) ★★ — przechodni z konstrukcji, niestabilny bez
  wsparcia egzotycznego
- Ellis drainhole — źródło typu "duch" (ujemna energia kinetyczna);
  Shinkai–Hayward (2002) numerycznie: **niestabilny** — perturbacja
  prowadzi do zapadnięcia w czarną dziurę albo ekspansji inflacyjnej
- Simpson–Visser (2019+) ★★ — jeden parametr `a` interpoluje ciągle
  między czarną dziurą a tunelem przechodnim; siły pływowe i soczewkowanie
  różnią BH / one-way WH / two-way WH obserwowalnie (konkretny,
  policzalny dyskryminator dla przyszłego pipeline'u falsyfikacyjnego)
- Cienka powłoka (Visser, warunki Israela) ★★ — egzotyka skonfinowana do
  powłoki; zmienne równanie stanu może złagodzić niestabilność, ale
  ujemna gęstość powierzchniowa pozostaje egzotyczna
- Teo (1998) rotujący ★★ — uogólnienie Morrisa–Thorne'a; ryzyko CTC przy
  wysokim spinie

**Holograficzne tunele przechodnie (ER=EPR, Gao–Jafferis–Wall 2016;
Maldacena–Qi 2018)** ★★★ w ramach AdS/CFT — sprzężenie double-trace
między dwoma splątanymi układami wstrzykuje ujemną energię null czyniącą
most ER przechodnim; ilość przesyłanej informacji jest ograniczona przez
odpowiednik CFT (nie jest to kanał makroskopowy). Maldacena–Susskind
(2013) "ER=EPR": splątanie ↔ geometria mostu ER. Status: rygorystyczne w
modelu holograficznym, **brak** znanej płaskoprzestrzennej/makroskopowej
realizacji inżynierskiej; analogi stołowe (SYK-like) są niesprawdzoną
hipotezą.

**Przyczynowość i CTC** ★★★ — tunele z końcami przesuniętymi czasowo
względem siebie (ruch/grawitacja) mogą tworzyć zamknięte krzywe czasowe
(Morris–Thorne–Yurtsever 1988). Hipoteza ochrony chronologii (Hawking
1992): backreaction półklasyczna (rozbieżne ⟨T_μν⟩) prawdopodobnie temu
zapobiega — nieudowodnione w pełnej grawitacji kwantowej. Otwarte.

**Warp Alcubierre'a — spór o znak energii, nierozstrzygnięty** ★★
Klasyczna bańka (już w pliku wyżej) wymaga łamania NEC. Van Den Broeck
(1999) zredukował wymaganą energię drastycznie zmieniając geometrię
bańki. Lentz (2021) zaproponował soliton rzekomo spełniający WEC
("positive energy"); Santiago i in. (2022) kontrargumentują twierdzeniem,
że generyczne warp drives łamią NEC. Spór aktywny — Genesis powinien
traktować obie strony jako konkurujące hipotezy, nigdy nie ogłaszać
zwycięzcy.

**Zasada falsyfikacji obserwacyjnej (do przyszłego pipeline'u, jeśli
zbudowany)** ★★★★ — dla KAŻDEJ kandydatki na sygnaturę tunelu
(soczewkowanie, echa fal grawitacyjnych, kształt cienia EHT) dopasuj
NAJPIERW najprostszy model konkurencyjny w kolejności: (1) czarna dziura
Kerra/Schwarzschilda, (2) zwykła soczewka grawitacyjna, (3) znany zwarty
obiekt, (4) egzotyczny zwarty obiekt (gwiazda bozonowa, gravastar), (5)
plazma/krzywizna, (6) błąd systematyczny/instrumentalny. Tunel wygrywa
tylko gdy (1)–(6) są statystycznie odrzucone. Obecne dane: cień EHT M87*
i Sgr A* zgodny z czarną dziurą Kerra — sygnatury tunelu NIE są dziś
wspierane. Ta reguła (najprostsze wyjaśnienie najpierw) jest bardziej
wartościowa dla Genesis jako metoda niż sam temat tuneli — stosuje się do
każdej anomalii obserwacyjnej, nie tylko wormholi.

**Drabina epistemiczna (kryteria promocji, reużywalne poza tematem)**:
matematyczna możliwość → fizycznie prawdopodobne (wymaga: rozwiązania
równań pola, źródła z realnej teorii pola nie postulowanego na sztywno,
przetrwania granic kwantowych, dowiedzionej stabilności) → wspierane
obserwacyjnie (≥5σ, preferowane nad modelami konkurencyjnymi, powtórzone
niezależnie) → zweryfikowane eksperymentalnie → możliwość inżynierska
(dziś: brak znanej ścieżki, może być nieosiągalna).

**Co byłoby prawdziwym przełomem, nawet negatywnym** ★★★★ — dowód, że
płaskoprzestrzenne przechodnie tunele są niemożliwe pod QNEC, jest
odkryciem wysokiej wartości mimo że "kończy marzenie" — to prawdziwa
nauka, nie porażka.

## Publikacje i książki
- James, von Tunzelmann, Franklin, Thorne 2015 — CQG 32, 065001 (open access) —
  nasza biblia renderingu
- Luminet 1979, A&A 75, 228 (pierwszy obraz dysku)
- EHT 2019, ApJL 875 (M87*); Morris & Thorne 1988, Am. J. Phys. 56, 395
- Alcubierre 1994, CQG 11, L73; Einstein & Rosen 1935, Phys. Rev. 48, 73
- Ford & Roman 1995, Phys. Rev. D 51, 4277 (quantum inequalities); Hawking
  1992, Phys. Rev. D 46, 603 (chronology protection); Morris, Thorne &
  Yurtsever 1988, PRL 61, 1446 (tunel jako wehikuł czasu)
- Shinkai & Hayward 2002, Phys. Rev. D 66, 044005 (niestabilność Ellisa,
  numerycznie); Teo 1998, Phys. Rev. D 58, 024014 (tunele rotujące)
- Gao, Jafferis & Wall 2017, JHEP 12, 151 (tunel przechodni holograficzny);
  Maldacena & Susskind 2013, Fortsch. Phys. 61, 781 (ER=EPR); Maldacena &
  Qi 2018, arXiv:1804.00491 (wieczny tunel przechodni, SYK sprzężone)
- Van Den Broeck 1999, CQG 16, 3973 (redukcja energii warp); Santiago,
  Schuster & Visser 2022, Phys. Rev. D 105, 064038 (generyczne warp drives
  łamią NEC — kontrargument dla Lentz 2021); Simpson & Visser 2019, JCAP
  02, 042 (interpolacja BH↔tunel)
- ★ Uwaga: powyższe cytowania z pamięci treningowej Qwena, nie
  zweryfikowane na żywo w tej sesji — sprawdzić DOI/arXiv przed użyciem
  jako twarde źródło w materiale zewnętrznym (np. wniosek grantowy)
- Podręczniki: Hartle *Gravity* (optymalny poziom dla nas); Taylor & Wheeler
  *Spacetime Physics* (II wyd. darmowe od autorów); Carroll — darmowe notatki
  arXiv:gr-qc/9712019

## Interstellar, wizualizacja i legendy — klasyfikacja epistemiczna

**Czarne dziury jak w _Interstellar_ — co jest nauką** ★★★★★

- Wirująca czarna dziura Kerra, geodezyjne światła, soczewkowanie grawitacyjne,
  przesunięcia Dopplera i grawitacyjne oraz dylatacja czasu są elementami ogólnej
  teorii względności. Zespół filmu użył renderera DNGR do propagacji wiązek promieni
  przez czasoprzestrzeń Kerra (James, von Tunzelmann, Franklin, Thorne 2015).
- Widoczny „dysk nad i pod czarną dziurą” ma fizyczne źródło: światło z dysku po
  przeciwnej stronie może zostać zakrzywione przez silne pole grawitacyjne. NASA
  opisuje analogiczny efekt w obrazie dysku akrecyjnego.
- Ekstremalna różnica upływu czasu w filmie wymaga bardzo szczególnych warunków
  blisko szybko wirującej, supermasywnej czarnej dziury. Jest to obliczeniowo
  umotywowany scenariusz graniczny, nie opis potwierdzonego układu planetarnego.

**Co jest decyzją filmową albo uproszczeniem** ★★★

- Artykuł o DNGR wyjaśnia, że dla czytelności filmu ograniczono część efektów
  Dopplera i przesunięcia grawitacyjnego oraz zmieniono spin użyty w obrazie.
  Obraz filmowy jest inspirowaną równaniami wizualizacją, nie obserwacją.
- Obecny renderer Genesis wykorzystuje ścisłe geodezyjne Schwarzschilda i
  równikowe Kerra, lecz NIE jest pełnym DNGR: nie rozwiązuje pełnego transferu
  promieniowania dysku akrecyjnego, nie całkuje ogólnych geodezyjnych Kerra z
  Q≠0 i nie wyprowadza warunków przeżywalnej orbity planety.

**Tunel czasoprzestrzenny i dodatkowe wymiary** ★★ — hipoteza / dydaktyka

- Mosty Einsteina–Rosena i metryki tuneli są prawidłowymi obiektami
  matematycznymi OTW, ale nie ma znanego mechanizmu tworzenia ani potwierdzenia
  makroskopowego, przechodniego tunelu w naszym Wszechświecie. Przechodnie tunele
  wymagają założeń o egzotycznej energii, a ich stabilność jest nierozstrzygnięta.
- „Piąty wymiar”, podróż przez tunel i manipulowanie przeszłością w _Interstellar_
  należą do fabuły / spekulacji. Mogą być eksplorowane jako jawny eksperyment
  myślowy, lecz bez `REAL_ENGINE` ani predykcji rzeczywistości.

**Eksperyment Filadelfia / Project Rainbow** ★ — legenda historyczna, nie model

- Materiał `xz2iOt3YRq8` nie dotyczy _Interstellar_; opisuje rzekomy Eksperyment
  Filadelfia z USS *Eldridge*. Zasługuje na zapis jako przykład hipotezy i
  narracji kulturowej, NIE jako wynik fizyki.
- Naval History and Heritage Command nie znalazło dokumentu potwierdzającego
  niewidzialność lub teleportację. Dzienniki USS *Eldridge* wskazują, że okręt
  nie przebywał w Filadelfii w opisywanym okresie. Degaussing redukuje sygnaturę
  magnetyczną dla min, ale nie czyni statku niewidzialnym dla oka, radaru ani
  urządzeń nasłuchowych. Genesis nie tworzy dla tej legendy solvera ani eventu.

**Źródła:**
- James, von Tunzelmann, Franklin, Thorne 2015, *Classical and Quantum Gravity*
  32, 065001, DOI 10.1088/0264-9381/32/6/065001.
- NASA, *What Happens When Something Gets ‘Too Close’ to a Black Hole?*.
- Naval History and Heritage Command, *Philadelphia Experiment*.
- Luminet 2015, *The Warped Science of Interstellar*, arXiv:1503.08305.

## Ograniczenia implementacyjne
- Pełny ray-tracing Kerra w czasie rzeczywistym za ciężki na telefon →
  strategia: prekomputowane tablice ugięć + shader WebGL (tak robił zespół
  Interstellar, tylko w wyższej rozdzielczości)
- Zegar świetlny: c przeskalowane do pikseli — fizyka dokładna, skala umowna
- Geodezyjne Kerra zaimplementowane TYLKO w płaszczyźnie równikowej;
  pełne geodezyjne 3D (poza równikiem, precesja) wymagają stałej Cartera
  Q≠0 i pozostają w `VISION-BACKLOG.md`

## Wnioski projektowe dla Genesis OS
1. "Czarna dziura z Interstellar w kieszeni" (geodezyjne + dysk, WebGL) —
   flagowy WOW Etapu 1; metoda opublikowana, open access, wykonalna
2. Dwie perspektywy spadku na horyzont (daleki obserwator vs spadający) —
   nikt nie pokazuje tego dobrze na mobile
3. Paradoks informacyjny = przyszły moduł "nauka się spiera" — zgodny z DNA
   platformy (uczciwość zamiast udawanej pewności)
