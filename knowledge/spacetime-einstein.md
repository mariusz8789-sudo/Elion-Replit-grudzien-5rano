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
Kerr: ergosfera, frame-dragging (Gravity Probe B 2011; jety AGN).
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

## Ograniczenia implementacyjne
- Pełny ray-tracing Kerra w czasie rzeczywistym za ciężki na telefon →
  strategia: prekomputowane tablice ugięć + shader WebGL (tak robił zespół
  Interstellar, tylko w wyższej rozdzielczości)
- Zegar świetlny: c przeskalowane do pikseli — fizyka dokładna, skala umowna
- Frame-dragging w Etapie 0 poglądowy; pełne geodezyjne Kerra → Etap 1/2

## Wnioski projektowe dla Genesis OS
1. "Czarna dziura z Interstellar w kieszeni" (geodezyjne + dysk, WebGL) —
   flagowy WOW Etapu 1; metoda opublikowana, open access, wykonalna
2. Dwie perspektywy spadku na horyzont (daleki obserwator vs spadający) —
   nikt nie pokazuje tego dobrze na mobile
3. Paradoks informacyjny = przyszły moduł "nauka się spiera" — zgodny z DNA
   platformy (uczciwość zamiast udawanej pewności)
