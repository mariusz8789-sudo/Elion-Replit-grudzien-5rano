import type { ConfirmationLevel, Citation } from '../core/citation';

/**
 * Discovery Timeline Engine — 15 epok od Wielkiego Wybuchu po dalekę
 * przyszłość Wszechświata. Każda epoka ma: wiek (sekundy od Wielkiego
 * Wybuchu, skala logarytmiczna — jak w data/scaleMilestones.ts, tylko oś to
 * czas), charakterystyczną skalę przestrzenną (dla soczewki zoomu) i poziom
 * potwierdzenia naukowego (ConfirmationLevel, core/citation.ts) — DOKŁADNIE
 * ta sama dyscyplina uczciwości co reszta platformy, tylko na dłuższej osi.
 *
 * Wiek Wszechświata: 13,8 mld lat (Planck 2018). Rok juliański = 365,25 dnia
 * = 31 557 600 s — użyty do wszystkich przeliczeń lat→sekundy poniżej.
 */

const YEAR_S = 31_557_600;

export interface TimelineEpoch {
  id: string;
  name: string;
  /** Sekundy od Wielkiego Wybuchu (skala logarytmiczna do renderowania). */
  ageSeconds: number;
  /** Charakterystyczny rozmiar przestrzenny tej epoki (metry) — punkt startowy soczewki skali. */
  scaleMeters: number;
  confirmation: ConfirmationLevel;
  /** Krótki teaser (1 zdanie) na chip/przełącznik epoki. */
  teaser: string;
  /** Pełny opis (2–4 zdania) w panelu Narratora. */
  summary: string;
  color: string;
  citation?: Citation;
  /** Most do istniejącego laboratorium — core/scenarioBridge.ts. Tylko gdzie naprawdę pasuje. */
  linkedLab?: { labId: string; experimentId?: string; params?: Record<string, number | boolean | string> };
}

export const TIMELINE_EPOCHS: TimelineEpoch[] = [
  {
    id: 'big-bang',
    name: 'Wielki Wybuch',
    ageSeconds: 5.39e-44, // czas Plancka
    scaleMeters: 1.6e-35, // długość Plancka
    confirmation: 'confirmed-consensus',
    teaser: 'Gorący, gęsty początek — nie punkt w przestrzeni, tylko początek samej czasoprzestrzeni.',
    summary:
      'Model gorącego Wielkiego Wybuchu jest silnie potwierdzony przez trzy niezależne obserwacje: ucieczkę galaktyk (Hubble 1929), promieniowanie tła (CMB, 1965) i obfitość lekkich pierwiastków (nukleosynteza pierwotna). Sam "moment zero" — czas Plancka, 5,39×10⁻⁴⁴ s — leży poza zasięgiem znanej fizyki: potrzeba tam teorii kwantowej grawitacji, której jeszcze nie mamy.',
    color: '#f8d9a0',
    citation: {
      source: 'Planck Collaboration 2018 — Cosmological Parameters',
      confirmation: 'confirmed-consensus',
      url: 'https://arxiv.org/abs/1807.06209',
    },
    linkedLab: { labId: 'universe', params: { omegaLambda: 0.69, speed: 0.3 } },
  },
  {
    id: 'inflation',
    name: 'Inflacja kosmiczna',
    ageSeconds: 1e-32,
    scaleMeters: 1e-30, // ilustracyjne: podpróg, mniejszy niż proton
    confirmation: 'partial',
    teaser: 'Wszechświat rozdął się ~10²⁶ razy w ułamku sekundy — cała dzisiejsza obserwowalna przestrzeń zmieściłaby się w atomie.',
    summary:
      'Inflacja rozwiązuje zagadki płaskości i horyzontu (dlaczego Wszechświat wygląda tak samo we wszystkich kierunkach) i przewiduje dokładnie takie fluktuacje gęstości, jakie widzimy w CMB — to mocny pośredni dowód. Ale żaden konkretny model inflacji (jest ich dziesiątki) nie jest jeszcze potwierdzony wprost, a fale grawitacyjne z tej epoki wciąż nie zostały wykryte.',
    color: '#e879f9',
  },
  {
    id: 'first-atoms',
    name: 'Pierwsze atomy',
    ageSeconds: 380_000 * YEAR_S,
    scaleMeters: 1e-10, // atom wodoru
    confirmation: 'confirmed',
    teaser: 'Rekombinacja: plazma staje się przezroczysta. Światło z tej chwili wciąż do nas leci — to CMB.',
    summary:
      'Przez 380 000 lat Wszechświat był nieprzezroczystą plazmą — fotony rozpraszały się na wolnych elektronach. Gdy ostygł do ~3000 K, elektrony związały się z protonami w neutralne atomy wodoru, a światło mogło wreszcie polecieć swobodnie. To światło, dziś schłodzone do 2,7 K, obserwujemy jako mikrofalowe promieniowanie tła (CMB) — najstarszy bezpośredni obraz Wszechświata, jaki mamy.',
    color: '#5cd6e8',
    citation: {
      source: 'COBE/WMAP/Planck — pomiary CMB',
      confirmation: 'confirmed',
      url: 'https://arxiv.org/abs/1807.06209',
    },
  },
  {
    id: 'first-stars',
    name: 'Pierwsze gwiazdy',
    ageSeconds: 2e8 * YEAR_S,
    scaleMeters: 3e9, // gwiazda populacji III, kilka promieni Słońca
    confirmation: 'confirmed-consensus',
    teaser: 'Gwiazdy populacji III: setki mas Słońca, czystego wodoru i helu — pierwsze źródła światła od 380 000 lat.',
    summary:
      'Przez "Wieki Ciemne" grawitacja powoli spiętrzała wodór i hel w gęstsze obłoki, aż zapłonęły pierwsze gwiazdy — masywne, gorące, krótkotrwałe, zbudowane z materii bez cięższych pierwiastków (bo te jeszcze nie istniały). Żadnej nie zaobserwowano bezpośrednio: wniosek pochodzi z modeli i pośrednich śladów (JWST znajduje coraz wcześniejsze galaktyki, zbliżając się do tej epoki).',
    color: '#e6eaf5',
    linkedLab: { labId: 'universe', experimentId: 'starlife', params: { mass: 40 } },
  },
  {
    id: 'first-galaxies',
    name: 'Pierwsze galaktyki',
    ageSeconds: 4e8 * YEAR_S,
    scaleMeters: 1e21, // mała protogalaktyka
    confirmation: 'confirmed-consensus',
    teaser: 'Grawitacja spina gromady gwiazd w pierwsze galaktyki karłowate — JWST już je fotografuje.',
    summary:
      'Gwiazdy i gaz zaczęły się zbierać w grawitacyjnie związane struktury — pierwsze, niewielkie galaktyki karłowate. Teleskop Webba (JWST) znalazł kandydatów na galaktyki z tej epoki, wcześniejszych niż ktokolwiek się spodziewał — aktywny obszar badań, wciąż weryfikowany.',
    color: '#a78bfa',
  },
  {
    id: 'milky-way',
    name: 'Droga Mleczna',
    ageSeconds: 1e9 * YEAR_S,
    scaleMeters: 9.5e20, // średnica Drogi Mlecznej
    confirmation: 'confirmed-consensus',
    teaser: 'Nasza galaktyka zaczyna się formować — proces trwający miliardy lat, nie pojedyncza chwila.',
    summary:
      'Najstarsze gwiazdy Drogi Mlecznej mają ~13,6 mld lat — powstały niemal zaraz po pierwszych galaktykach. Ale "uformowanie się" Drogi Mlecznej to proces, nie moment: dysk, ramiona spiralne i większość gwiazd (w tym Słońce) powstały miliardy lat później. Ten punkt na osi czasu to uproszczenie — pierwsze zalążki, nie gotowa galaktyka.',
    color: '#a78bfa',
  },
  {
    id: 'solar-system',
    name: 'Układ Słoneczny',
    ageSeconds: 9.2e9 * YEAR_S,
    scaleMeters: 9e12, // do orbity Neptuna
    confirmation: 'confirmed',
    teaser: 'Obłok molekularny zapada się pod własną grawitacją — rodzi się Słońce i dysk protoplanetarny.',
    summary:
      'Datowanie radiometryczne najstarszych meteorytów (chondrytów węglistych) daje wiek Układu Słonecznego z dokładnością do kilku milionów lat: 4,567 mld lat. Słońce zapłonęło w centrum zapadającego się obłoku molekularnego, a pozostały dysk gazu i pyłu zlepił się w planety — dokładnie ten proces widać dziś wokół młodych gwiazd (np. HL Tauri, ALMA 2014).',
    color: '#f0b35c',
    citation: {
      source: 'Amelin i in. 2002, Science 297 — datowanie Pb-Pb chondrytów',
      confirmation: 'confirmed',
    },
    linkedLab: { labId: 'universe', experimentId: 'solar-system' },
  },
  {
    id: 'earth',
    name: 'Ziemia',
    ageSeconds: 9.26e9 * YEAR_S,
    scaleMeters: 1.27e7, // średnica Ziemi
    confirmation: 'confirmed',
    teaser: 'Akrecja planetozymali formuje Ziemię — wciąż roztopioną, bombardowaną, bez atmosfery zdatnej do życia.',
    summary:
      'Ziemia uformowała się niemal równocześnie ze Słońcem (4,54 mld lat temu) z akrecji planetozymali. Wczesna Ziemia była oceanem magmy; Księżyc powstał wkrótce potem z zderzenia z obiektem wielkości Marsa (hipoteza Wielkiego Zderzenia — najlepiej wspierany dziś model, choć szczegóły wciąż badane).',
    color: '#5cd6e8',
    citation: {
      source: 'Wydatowanie cyrkonów z Jack Hills (Australia) — najstarsze znane minerały ziemskie',
      confirmation: 'confirmed',
    },
    linkedLab: { labId: 'universe', experimentId: 'solar-system' },
  },
  {
    id: 'first-life',
    name: 'Pierwsze życie',
    ageSeconds: 1.0e10 * YEAR_S,
    scaleMeters: 1e-5, // komórka
    confirmation: 'confirmed-consensus',
    teaser: 'Samoreplikujące się cząsteczki w oceanie — najstarsze ślady życia sprzed ~3,7–4,1 mld lat.',
    summary:
      'Najstarsze przekonujące ślady życia (biosygnatury izotopowe, mikroskamieniałości) mają 3,7–4,1 mld lat — Ziemia miała wtedy zaledwie kilkaset milionów lat. JAK dokładnie powstało życie (abiogeneza) pozostaje otwartym pytaniem badawczym: mamy konkurencyjne hipotezy (świat RNA, kominy hydrotermalne), żadna nie jest jeszcze rozstrzygnięta.',
    color: '#6ee7a0',
  },
  {
    id: 'evolution',
    name: 'Eksplozja kambryjska',
    ageSeconds: 1.3259e10 * YEAR_S,
    scaleMeters: 1e-2, // drobne zwierzę morskie, skala cm
    confirmation: 'confirmed',
    teaser: '541 mln lat temu: w ~20 mln lat (mgnienie oka geologicznie) pojawia się większość dzisiejszych planów budowy zwierząt.',
    summary:
      'Przez ponad 3 miliardy lat życie było niemal wyłącznie mikroskopijne. W eksplozji kambryjskiej, udokumentowanej w formacjach takich jak łupki z Burgess, w ciągu geologicznie krótkiego czasu pojawiły się przodkowie niemal wszystkich dzisiejszych typów zwierząt — od stawonogów po strunowce (nasza własna linia).',
    color: '#6ee7a0',
    citation: {
      source: 'Formacja Burgess Shale (Kanada) — kluczowe stanowisko skamieniałości kambryjskich',
      confirmation: 'confirmed',
    },
  },
  {
    id: 'dinosaurs',
    name: 'Dinozaury',
    ageSeconds: 1.365e10 * YEAR_S,
    scaleMeters: 2e1, // duży zauropod, ~20 m
    confirmation: 'confirmed',
    teaser: 'Panują na Ziemi przez 165 mln lat — dłużej niż ssaki istnieją do dziś.',
    summary:
      'Dinozaury zdominowały ekosystemy lądowe od ~230 do 66 mln lat temu — 165 mln lat, ponad 30× dłużej niż istnieje rodzaj Homo. Wyginęły w masowym wymieraniu na granicy kredy i paleogenu, wywołanym uderzeniem asteroidy (krater Chicxulub, Meksyk) — jedna z najlepiej udokumentowanych katastrof w historii Ziemi.',
    color: '#f47c7c',
    citation: {
      source: 'Alvarez i in. 1980, Science 208 — hipoteza uderzenia; potwierdzona kraterem Chicxulub',
      confirmation: 'confirmed',
    },
  },
  {
    id: 'humans',
    name: 'Ludzie',
    ageSeconds: 1.37997e10 * YEAR_S,
    scaleMeters: 1.7, // wzrost człowieka
    confirmation: 'confirmed',
    teaser: 'Homo sapiens: ~300 000 lat temu. Na skali kosmicznej dosłownie właśnie się pojawiliśmy.',
    summary:
      'Najstarsze znane skamieniałości Homo sapiens (Jebel Irhoud, Maroko) mają ~300 000 lat. Zestaw to z 13,8 miliardami lat wieku Wszechświata: cała historia naszego gatunku to ~0,002% kosmicznego zegara. Gdybyśmy skompresowali dzieje Wszechświata do jednego roku, ludzie pojawiliby się kilka minut przed północą 31 grudnia.',
    color: '#e6eaf5',
    citation: {
      source: 'Hublin i in. 2017, Nature 546 — datowanie Jebel Irhoud',
      confirmation: 'confirmed',
    },
  },
  {
    id: 'present',
    name: 'Teraz',
    ageSeconds: 13.8e9 * YEAR_S,
    scaleMeters: 1.27e7, // Ziemia — "jesteś tutaj"
    confirmation: 'confirmed',
    teaser: 'Wszechświat ma dziś 13,8 mld lat — Ty czytasz to zdanie w tym dokładnym momencie tej osi.',
    summary:
      'Wiek Wszechświata (13,8 mld lat) wyznaczono z precyzją ~0,1% z pomiarów CMB przez satelitę Planck — jeden z najdokładniejszych pomiarów w kosmologii. Ekspansja wciąż trwa i przyspiesza (ciemna energia, patrz Universe Lab) — Ty i wszystko, co znasz, istniejecie w jednej klatce tej znacznie dłuższej historii.',
    color: '#f0b35c',
    citation: {
      source: 'Planck Collaboration 2018 — Cosmological Parameters',
      confirmation: 'confirmed',
      url: 'https://arxiv.org/abs/1807.06209',
    },
    linkedLab: { labId: 'universe', params: { omegaLambda: 0.69, speed: 1 } },
  },
  {
    id: 'near-future',
    name: 'Bliska przyszłość',
    ageSeconds: 18.8e9 * YEAR_S,
    scaleMeters: 9e12, // skala Układu Słonecznego
    confirmation: 'confirmed-consensus',
    teaser: 'Za ~5 mld lat Słońce spuchnie do czerwonego olbrzyma; Droga Mleczna i Andromeda już się zderzają.',
    summary:
      'Modele ewolucji gwiazd (dobrze zweryfikowane na milionach obserwowanych gwiazd) przewidują, że za ~5 mld lat Słońce wyczerpie wodór w jądrze, spuchnie do czerwonego olbrzyma i prawdopodobnie pochłonie Merkurego i Wenus, może Ziemię. Niemal równocześnie (w skali kosmicznej) Droga Mleczna zderzy się z galaktyką Andromedy — jej prędkość zbliżania mierzymy dziś bezpośrednio.',
    color: '#f47c7c',
    linkedLab: { labId: 'universe', experimentId: 'starlife', params: { mass: 1 } },
  },
  {
    id: 'far-future',
    name: 'Daleka przyszłość',
    ageSeconds: 3.16e107, // ~10^100 lat — rząd wielkości "śmierci cieplnej"
    scaleMeters: 8.8e26, // obserwowalny Wszechświat, maksymalnie rozciągnięty
    confirmation: 'hypothesis',
    teaser: 'Gwiazdy gasną, czarne dziury parują, entropia rośnie ku maksimum — jeśli ciemna energia pozostanie stała.',
    summary:
      'To ekstrapolacja, nie obserwacja: przy stałej ciemnej energii ostatnie gwiazdy zgasną za ~10¹⁴ lat, czarne dziury wyparują przez promieniowanie Hawkinga w skali do 10¹⁰⁰ lat, a Wszechświat zbliży się do stanu maksymalnej entropii ("śmierć cieplna"). Alternatywne scenariusze (Wielkie Rozdarcie, jeśli ciemna energia rośnie; Wielki Kolaps, jeśli maleje) są dziś czystą spekulacją — nie wiemy, czy Ω_Λ jest naprawdę stałe.',
    color: '#8d97b4',
  },
];
