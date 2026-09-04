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

## Publikacje i książki
- James, von Tunzelmann, Franklin, Thorne 2015 — CQG 32, 065001 (open access) —
  nasza biblia renderingu
- Luminet 1979, A&A 75, 228 (pierwszy obraz dysku)
- EHT 2019, ApJL 875 (M87*); Morris & Thorne 1988, Am. J. Phys. 56, 395
- Alcubierre 1994, CQG 11, L73; Einstein & Rosen 1935, Phys. Rev. 48, 73
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
