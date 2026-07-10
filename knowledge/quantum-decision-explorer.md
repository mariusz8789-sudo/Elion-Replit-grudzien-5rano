# Quantum Decision Explorer — katalog wiedzy

## Zakres i status — PRZECZYTAJ PRZED KAŻDĄ ODPOWIEDZIĄ
To narzędzie NARRACYJNE/REFLEKSYJNE, wizualnie inspirowane fizyką (galaktyka,
gwiazdy, odgałęzienia), ale NIE jest modelem fizycznym, nie przewiduje
przyszłości i nie odtwarza rzeczywistości. Nie ma związku z interpretacją
wielu światów (Everett) — Multiverse Lab osobno i poprawnie odróżnia tamten
temat jako hipotezę fizyczną (★★ na skali potwierdzenia). Tutaj nie ma
żadnej skali potwierdzenia do cytowania, bo nie ma żadnego twierdzenia
naukowego do zweryfikowania — to notatnik decyzji użytkownika z ładną
wizualizacją, nic więcej.

**Zasada dla Narratora AI**: nigdy nie sugeruj, że aplikacja "wie", co by
się stało, gdyby użytkownik wybrał inaczej. Nigdy nie używaj języka
przepowiadania ("Twoja alternatywna ścieżka pokazuje, że..."). Zawsze
traktuj "gałęzie" jako to, czym są: własne przemyślenia użytkownika o tym,
"co by było, gdyby", zapisane przez niego samego — nie wynik obliczeń.

## Co to narzędzie faktycznie robi
- Użytkownik zapisuje własne, subiektywne decyzje życiowe (tytuł, opis,
  rok, "waga" 1-10, do 4 alternatywnych ścieżek jako tekst + "ton" -5..+5)
- Wizualizacja: każda decyzja to gwiazda w spirali (kąt złoty/phyllotaxis —
  ta sama, prawdziwa technika geometryczna, którą rośliny rozkładają
  liście i którą Civilization Lab już wykorzystuje do węzłów sieci
  energetycznej)
- Suwak przesuwa, która decyzja jest aktywna; aktywna gwiazda pokazuje
  swoje odgałęzienia jako świecące ścieżki, z których KAŻDA niesie teraz
  prawdziwą symulację Monte Carlo (patrz niżej)
- Wszystko lokalnie (localStorage), zero backendu, zero konta, zero
  wysyłania danych osobistych gdziekolwiek

## Symulacja Monte Carlo odgałęzień (zaimplementowane) — REALNA matematyka
`core/decisionMonteCarlo.ts` implementuje dyskretny proces Wienera z
dryfem (schemat Eulera–Maruyamy) — DOKŁADNIE ten sam matematyczny model,
którego używa się do symulowania niepewności w finansach i dyfuzji w
fizyce (błądzenie losowe). To jest prawdziwa, poprawna matematyka — różni
się od reszty Genesis OS tylko tym, że WEJŚCIA do modelu (kierunek/"dryf" i
zmienność) pochodzą z subiektywnych ocen użytkownika ("ton" odgałęzienia
-5..+5, "waga" decyzji 1-10), nie z pomiaru czy stałej fizycznej.
- `driftPerYear = (ton/5) × 0,3` — znak i wielkość "tonu" wybranego przez
  użytkownika sterują kierunkiem symulowanej ścieżki
- `volatilityPerYear = 0,15 + (waga/10) × 0,35` — ważniejsze (dla
  użytkownika) decyzje dostają szerszy rozrzut wyników
- Każda gałąź renderuje ~20 niezależnie zasymulowanych trajektorii jako
  wachlarz świecących linii; jasność samej głównej trajektorii jest wyższa
  (średnia z próby)
- **Kluczowa, uczciwa własność matematyczna pokazywana użytkownikowi**:
  odchylenie standardowe wyniku po czasie t rośnie jak `volatility·√t`, NIE
  liniowo — to prawdziwe twierdzenie o procesach Wienera (zweryfikowane
  testem statystycznym w `decisionMonteCarlo.test.ts`), nie ozdoba. Suwak
  horyzontu (1-100 lat) pokazuje to na żywo: wachlarz widocznie się
  rozszerza z czasem, bo taka jest matematyka dyfuzji, nie dlatego, że
  aplikacja "wie" coś o przyszłości użytkownika
- "Istotny odsetek" (`significantFraction`) pokazywany w Narratorze to
  RZECZYWISTY wynik policzony z próby Monte Carlo (ułamek zasymulowanych
  torów przekraczających 1 teoretyczne odchylenie standardowe) — realna
  statystyka tej konkretnej symulacji, nie prognoza tej konkretnej ścieżki

## Dlaczego to NIE jest fizyka ani przepowiednia (mimo prawdziwej matematyki pod spodem)
- Prawdziwa interpretacja wielu światów (Everett, 1957) dotyczy formalizmu
  mechaniki kwantowej — dekoherencji, superpozycji, pomiaru. Nie ma nic
  wspólnego z ludzkimi decyzjami życiowymi w sensie fizycznym
- Proces Wienera z dryfem JEST prawdziwą, poprawną matematyką (i to samo
  równanie różniczkowe stochastyczne opisuje realne zjawiska fizyczne jak
  ruchy Browna) — ale zastosowanie go tutaj do "kariery" czy "związku" jest
  ILUSTRACJĄ ogólnej własności matematycznej (rosnąca niepewność w czasie),
  NIE zweryfikowanym modelem tego, jak faktycznie rozwijają się ludzkie
  decyzje. Różnica jest fundamentalna: to nie jest twierdzenie "Twoje życie
  zachowuje się jak proces Wienera", tylko "oto jak wygląda matematycznie
  rosnąca niepewność, gdy założysz taki a taki kierunek i zmienność"
- Same wejścia (dryf, zmienność) są w 100% subiektywnymi ocenami
  użytkownika, nie zmierzonymi wielkościami — system nie ocenia, nie
  waliduje ani nie "wie" nic o karierze, zdrowiu czy relacjach użytkownika

## Ograniczenia implementacyjne
- Dryf/zmienność to jawnie nazwane ZAŁOŻENIA MODELOWE (stałe w
  `branchToSimParams`), nie wyprowadzone z żadnych danych empirycznych o
  ludzkim zachowaniu, ekonomii czy psychologii — Narrator MUSI to jasno
  komunikować, gdy pyta o nie użytkownik
- Brak modelowania finansów, zdrowia czy relacji jako osobnych wymiarów —
  jeden ogólny, abstrakcyjny wymiar "skumulowanego odchylenia od status
  quo", świadomie NIE rozbity na kategorie, żeby nie sugerować fałszywej
  precyzji w obszarach (pieniądze, zdrowie), których model nie dotyka
- Brak generowania nowych "gałęzi" przez AI — użytkownik wpisuje własne
  ścieżki i własne oceny tonu; model matematyczny przetwarza je, nie tworzy

## Wnioski projektowe dla Genesis OS
1. Stały, niedomykalny baner z disclaimerem w UI (nie tylko w tym pliku)
   — użytkownik musi go widzieć zawsze, nie tylko przy pierwszym wejściu
2. To narzędzie NIE powinno nigdy dostać `ConfirmationLevel` ani
   `HonestyLevel` sugerującego stopień naukowego poparcia — bo nie ma tu
   żadnego twierdzenia do ocenienia
3. Jeśli w przyszłości dodać AI sugerujące nowe "gałęzie" na podstawie
   opisu decyzji — jasno oznaczyć jako kreatywną sugestię, nigdy jako
   przewidywanie czy analizę
