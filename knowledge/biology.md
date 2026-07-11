# Biology Lab — katalog wiedzy

## Zakres
Pierwsze laboratorium Genesis OS spoza fizyki. Błona komórkowa i
transport, struktura podwójnej helisy DNA. Fałdowanie białek, pochodzenie
życia — poza obecnym zakresem, patrz VISION-BACKLOG.md.

## Modele i wzory

**Model płynnej mozaiki i transport błonowy (zaimplementowane)** ★★★★★
Singer & Nicolson 1972 (Science 175, 720): błona to dwuwarstwa lipidowa z
osadzonymi białkami. Trzy jakościowo poprawne mechanizmy transportu w
`labs/biology.ts`:
- dyfuzja prosta — małe niepolarne cząsteczki (O₂, CO₂) przechodzą
  bezpośrednio przez dwuwarstwę, zawsze Z gradientem stężenia
- dyfuzja wspomagana — naładowane/polarne cząsteczki (jony, glukoza)
  wymagają kanału białkowego; wciąż Z gradientem, ale NASYCALNA (liczba
  kanałów ogranicza tempo — jak kinetyka Michaelisa–Menten)
- transport aktywny — pompa Na⁺/K⁺-ATPaza, jedyny mechanizm PRZECIW
  gradientowi, kosztem ATP. Stechiometria 3 Na⁺ na zewnątrz : 2 K⁺ do
  wewnątrz na 1 ATP to zmierzony fakt biochemiczny (odkrycie: Jens Skou,
  Nagroda Nobla 1997), nie liczba dobrana dla wygody symulacji.
Świadome uproszczenie: liczby cząstek i tempo są ILUSTRACYJNE, nie
prawdziwe stężenia molowe ani zmierzone stałe kinetyczne pompy.

**Podwójna helisa DNA (zaimplementowane, 3D)** ★★★★★
Struktura Watson–Crick (1953, Nature 171, 737), potwierdzona
krystalografią rentgenowską włókien (Franklin & Gosling 1953). Parametry
B-DNA: promień ~1,0 nm, wzniesienie 0,34 nm/parę zasad, ~10,5 pary zasad
na skręt (Wang 1979, dokładniejsze pomiary skrętu). Dwie nici przesunięte
o ~120° (nie 180°) wokół osi — realna, jakościowa przyczyna asymetrii
rowka większego i mniejszego; dokładne szerokości rowków w angstremach
świadomie pominięte jako nadmiarowa precyzja. Parowanie zasad Watsona–
Cricka: A=T (2 wiązania wodorowe), G≡C (3 wiązania wodorowe, silniejsze).
Sekwencje 20 par zasad (~2 skręty) — długość dobrana, żeby (a) skręt
spirali był widoczny wielokrotnie, (b) pozostać w udokumentowanym
zakresie ważności reguły Wallace'a poniżej.

**Temperatura topnienia DNA — reguła Wallace'a (zaimplementowane)** ★★★★
Tm = 2°C·(A+T) + 4°C·(G+C) (Wallace i in. 1979, Nucleic Acids Res. 6,
3543) — empiryczne przybliżenie dla krótkich oligonukleotydów (<~20-25
zasad), wciąż używane przy projektowaniu starterów PCR. Krzywa
rozdzielania nici w wizualizacji jest logistyczna wokół Tm — jakościowo
poprawne kooperatywne przejście (prawdziwe topnienie DNA JEST ostrym,
kooperatywnym przejściem, koncepcyjnie podobnym do przejścia fazowego —
porównaj z modelem Isinga w Chemistry Lab), ale szerokość przejścia jest
ILUSTRACYJNA, nie zmierzoną stałą termodynamiczną konkretnej sekwencji.
Dokładniejsza metoda (najbliższy sąsiad, nearest-neighbor) wymaga tablic
termodynamicznych dla wszystkich 10 możliwych par sąsiadujących zasad —
świadomie pominięta.

## Sprzeczne teorie / otwarte spory

**Fałdowanie białek** ★★★ (aktywny obszar badań)
AlphaFold (DeepMind) to uczenie maszynowe, nie fizyka analityczna z
pierwszych zasad — problem fałdowania białek z samej sekwencji wciąż nie
ma pełnego rozwiązania analitycznego (paradoks Levinthala: przestrzeń
konformacyjna jest zbyt wielka na przeszukanie brute-force, a mimo to
białka fałdują się w milisekundy–sekundy). Ewentualny przyszły model w
Genesis OS musiałby być jawnie dydaktyczny (np. uproszczony model
sieciowy HP — hydrofobowy/polarny), nie prawdziwą symulacją fałdowania.

**Pochodzenie życia (abiogeneza)** ★★ (wysoka niepewność)
Konkurencyjne hipotezy (świat RNA, kominy hydrotermalne, panspermia) —
żadna nie jest ugruntowanym konsensusem naukowym. Ewentualny przyszły
moduł musiałby być uczciwym przeglądem statusu każdej hipotezy, NIE
symulacją "jak powstało życie" (nikt tego nie wie z pewnością).

## Publikacje i książki
- Watson & Crick 1953, Nature 171, 737 (struktura podwójnej helisy)
- Franklin & Gosling 1953, Nature 171, 740 (dane krystalograficzne "Zdjęcie 51")
- Singer & Nicolson 1972, Science 175, 720 (model płynnej mozaiki)
- Skou 1957, Biochim. Biophys. Acta 23, 394 (odkrycie Na⁺/K⁺-ATPazy);
  Nagroda Nobla w dziedzinie chemii 1997
- Wallace i in. 1979, Nucleic Acids Res. 6, 3543 (reguła "2+4" Tm)
- Podręcznik: Alberts i in., *Molecular Biology of the Cell* (standardowy
  podręcznik akademicki, rozdziały o błonie komórkowej i DNA)

## Ograniczenia implementacyjne
- Transport błonowy: model jakościowy (kierunek, nasycalność, stechiometria
  pompy realne), NIE ilościowy (stężenia i stałe kinetyczne ilustracyjne)
- DNA: tylko B-DNA (najczęstsza forma fizjologiczna) — formy A-DNA i
  Z-DNA (rzadsze, inne warunki) świadomie pominięte
- Sekwencje ograniczone do 20 par zasad — dłuższe wymagałyby metody
  najbliższego sąsiada zamiast reguły Wallace'a dla realistycznej Tm

## Wnioski projektowe dla Genesis OS
1. DNA jako flagowy eksperyment 3D dla widzów spoza fizyki — bardzo
   wysoki potencjał WOW (biologia/medycyna), a jednocześnie w pełni
   zgodny z DNA platformy: prawdziwa geometria krystalograficzna, nie
   artystyczna ilustracja
2. Transport błonowy jako baza laboratorium: pokazuje, że "uczciwość
   naukowa" (jakościowo poprawne, ilościowo ilustracyjne) działa równie
   dobrze poza fizyką co w niej
3. Temperatura topnienia DNA jako most koncepcyjny do modelu Isinga
   (Chemistry Lab) — oba to kooperatywne przejścia porządek/nieporządek,
   dobry materiał na przyszłe połączenie tematyczne "przejścia fazowe
   wszędzie" w Genesis OS
