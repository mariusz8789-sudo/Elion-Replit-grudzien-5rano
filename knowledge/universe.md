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

**Fale grawitacyjne** ★★★★★
Chirp: f rośnie do złączenia; amplituda i faza z masy ćwierkowej
ℳ = (m₁m₂)^⅗/(m₁+m₂)^⅕. GW150914 zgodny z OTW; dane surowe otwarte (GWOSC).

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
W aplikacji: pokazujemy CDM jako konsensus, MOND jako uczciwie opisaną
alternatywę mniejszościową (przyszła funkcja: przełącznik CDM/MOND na
krzywej rotacji — świetna dydaktyka sporu).

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
- JPL Horizons (domena publiczna, bez klucza) — ephemerydy Układu Słonecznego
- GWOSC (gwosc.org) — surowe dane fal grawitacyjnych
- ESA Gaia — pozycje 2 mld gwiazd (CC BY-SA 3.0 IGO dla materiałów)
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
1. Zderzenia galaktyk Barnes–Hut = najlepszy stosunek WOW/koszt w tym labie
2. Chirp GW z dźwiękiem z realnych danych GWOSC — unikalne na mobile
3. Napięcie Hubble'a i spór o DM to gotowe, uczciwe narracje "nauka żywa,
   nie zamknięta" — wyróżnik wobec konkurencji, która udaje pewność
