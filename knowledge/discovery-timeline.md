# Discovery Timeline Engine — katalog wiedzy

## Zakres
Chronologia Wszechświata: 15 epok od Wielkiego Wybuchu (czas Plancka,
5,39×10⁻⁴⁴ s) po spekulacyjną daleką przyszłość (~10¹⁰⁰ lat). Nie jest to
osobne laboratorium fizyki jednego zjawiska — to drugi, obok siatki
laboratoriów, tryb wejścia do Genesis OS: oś czasu + soczewka skali
przestrzennej (kwark → obserwowalny Wszechświat) w jednym, ciągłym
doświadczeniu.

## Modele i wzory

**Model gorącego Wielkiego Wybuchu** ★★★★ (silny konsensus)
Trzy niezależne filary dowodowe: ucieczka galaktyk (Hubble 1929),
promieniowanie tła CMB (odkryte 1965, sklasyfikowane precyzyjnie przez
COBE/WMAP/Planck), obfitość lekkich pierwiastków (nukleosynteza pierwotna).
Sam czas Plancka leży poza znaną fizyką — potrzeba kwantowej grawitacji.

**Inflacja kosmiczna** ★★★ (częściowo potwierdzona)
Rozwiązuje problemy płaskości i horyzontu, przewiduje obserwowane widmo
fluktuacji CMB. Żaden konkretny model inflacji nie jest jeszcze wyróżniony;
fale grawitacyjne z tej epoki (przewidywane przez wiele modeli) nie zostały
jeszcze wykryte.

**Rekombinacja / CMB** ★★★★★ (potwierdzona bezpośrednio)
380 000 lat po Wielkim Wybuchu: elektrony wiążą się z jądrami, Wszechświat
staje się przezroczysty. CMB to dosłownie zdjęcie tej chwili.

**Gwiazdy populacji III** ★★★★ (silny konsensus, brak bezpośredniej obserwacji)
Pierwsze gwiazdy z czystego wodoru/helu — model dobrze uzasadniony teorią
formowania gwiazd, ale żadnej nie zaobserwowano wprost. JWST znajduje coraz
wcześniejsze galaktyki, zbliżając się do tej granicy.

**Datowanie radiometryczne (Układ Słoneczny, Ziemia)** ★★★★★
Wiek 4,567 mld lat z rozpadu Pb-Pb w chondrytach węglistych — jedna z
najdokładniejszych dat w naukach o Ziemi.

**Eksplozja kambryjska** ★★★★★ (bogaty zapis kopalny)
541 mln lat temu, ~20 mln lat: pojawienie się większości dzisiejszych typów
zwierząt. Formacja Burgess Shale (Kanada) to kluczowe stanowisko.

**Wymieranie K-Pg (dinozaury)** ★★★★★
Hipoteza uderzenia asteroidy (Alvarez i in. 1980) potwierdzona odkryciem
krateru Chicxulub — jeden z najlepiej udokumentowanych przypadków w historii
Ziemi.

**Ewolucja gwiazd (bliska przyszłość Słońca)** ★★★★ (silny konsensus)
Modele ewolucji gwiazd, zweryfikowane na milionach obserwowanych gwiazd w
różnych fazach życia, przewidują fazę czerwonego olbrzyma Słońca za ~5 mld
lat. Kolizja Drogi Mlecznej z Andromedą — mierzona bezpośrednio prędkość
zbliżania.

**Daleka przyszłość (śmierć cieplna, rozpad protonu)** ★★/★ (hipoteza/spekulacja)
Ekstrapolacja obecnych praw fizyki na bardzo długie skale czasu, przy
ZAŁOŻENIU stałej ciemnej energii. Alternatywy (Wielkie Rozdarcie, Wielki
Kolaps) zależą od tego, czy Ω_Λ jest naprawdę stałe — nie wiemy.

## Sprzeczne teorie / otwarte spory
- Który model inflacji (jeśli którykolwiek) jest poprawny — aktywne
  poszukiwania sygnatur w polaryzacji CMB (fale grawitacyjne pierwotne)
- Dokładny mechanizm abiogenezy (świat RNA vs kominy hydrotermalne vs inne)
  — otwarte pytanie badawcze, nie rozstrzygnięte
- Czy ciemna energia jest naprawdę stałą kosmologiczną, czy zmienia się w
  czasie — determinuje CAŁY scenariusz dalekiej przyszłości
- Czy proton się rozpada — przewidywane przez niektóre Wielkie Unifikacje,
  nigdy nie zaobserwowane (dolne ograniczenie na czas życia: >10³⁴ lat)

## Publikacje i książki
- Planck Collaboration 2018, *Cosmological Parameters* (arXiv:1807.06209)
- Weinberg, S. *The First Three Minutes* — klasyka popularnonaukowa o
  wczesnym Wszechświecie
- Amelin i in. 2002, *Science* 297 — datowanie Pb-Pb chondrytów
- Alvarez i in. 1980, *Science* 208 — hipoteza uderzenia K-Pg
- Hublin i in. 2017, *Nature* 546 — Jebel Irhoud, najstarszy Homo sapiens
- Adams & Laughlin, *The Five Ages of the Universe* — przystępny przegląd
  dalekiej przyszłości kosmologicznej

## Dane — strategiczne dla tego trybu
15 epok w `data/timeline.ts` z realnymi wiekami (sekundy od Wielkiego
Wybuchu, rok juliański = 31 557 600 s) i charakterystycznymi skalami
przestrzennymi. Kamienie milowe soczewki skali współdzielone z
ScaleJourney (`data/scaleMilestones.ts`) — jedno miejsce prawdy o
rozmiarach fizycznych obiektów.

## Ograniczenia implementacyjne
- Sceny Canvas 2D per epoka (`components/discoveryTimelineScenes.ts`) są
  SYMBOLICZNE, nie fizycznie dokładnymi rekonstrukcjami (np. sylwetka
  dinozaura, spirala Drogi Mlecznej) — jak w każdym innym laboratorium
- Cross-fade między sąsiednimi epokami (`core/timelineMath.ts::epochBlend`)
  to płynne przenikanie dwóch sąsiadujących scen, nie fizyczna symulacja
  ciągłej ewolucji — to rozwiązanie UX "bez ekranów ładowania", nie model
- Soczewka skali pokazuje kamienie milowe niezależnie od epoki (rozmiar
  protonu jest stały w czasie) — epoka ustawia PUNKT STARTOWY zoomu, nie
  ogranicza dostępnego zakresu

## Wnioski projektowe dla Genesis OS
1. Flagowe doświadczenie: jedna ciągła oś czasu + niezależna soczewka
   skali, obie reużywające dokładnie tę samą technikę suwaka
   logarytmicznego (`core/logSlider.ts`) co istniejący Scale Journey
2. Most do laboratoriów (`core/scenarioBridge.ts`, rozszerzony o
   `experimentId` żeby trafiać w konkretny eksperyment, nie tylko bazowy)
   — trzeci niezależny konsument tego mostu po "Co by było, gdyby?" i
   Multiverse Nexus
3. Backlog (NIE budowane teraz): sceny 3D dla wybranych epok (np.
   formowanie pierwszych gwiazd przez `Sim3D`), zapisywanie/udostępnianie
   własnej "podróży" przez oś czasu
