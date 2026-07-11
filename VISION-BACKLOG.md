# Vision Backlog

Duży katalog pomysłów na przyszłość Genesis OS — **NIE lista zadań do
wykonania po kolei**. Zgodnie z zasadą „wielka wizja, mała, zdyscyplinowana
realizacja": ten dokument istnieje, żeby żaden dobry pomysł się nie zgubił,
ale w każdej sesji wdraża się 1–2 pozycje, nie próbuje się wszystkiego
naraz. Priorytet wybiera się na podstawie testu WOW (`Czy użytkownik pokaże
to znajomym? Czy nauczyciel poprowadzi na tym lekcję?`), realizmu
naukowego i tego, ile PRAWDZIWEJ, już istniejącej architektury (`Sim`,
`Sim3D`, `DataSource`, `Citation`, `NarrationBlock`) można ponownie użyć —
nie na podstawie tego, co jest najbardziej efektowne na papierze.

Każda pozycja ma tag pewności naukowej (skala z `knowledge/README.md`) i
orientacyjny koszt/wartość. ✅ = zaimplementowane w Genesis OS. Pozycje bez
✅ to WYŁĄCZNIE pomysły — patrz „Zasada" w `README.md`/`CLAUDE.md`: nie
buduje się atrap.

Legenda pewności: ★★★★★ potwierdzona · ★★★★ potwierdzona (konsensus) ·
★★★ częściowo potwierdzona · ★★ hipoteza · ★ spekulacja · ☆ science fiction.

---

## Genesis OS 2.x / 3.0 — Dynamic Scientific Simulation Generator (wielka wizja architektoniczna)

**NIE BUDOWAĆ TERAZ.** Warunek wstępny jest twardy i identyczny jak dla
Collaborative Science niżej: Genesis OS v1.0 musi być najpierw w pełni
ukończony, dopracowany, przetestowany, wizualnie dopieszczony i gotowy
produkcyjnie. Ten rozdział istnieje wyłącznie po to, żeby udokumentować
wizję w poważnym architektonicznym szczególe, na wypadek gdyby stała się
głównym kierunkiem technologicznym Genesis OS — nie po to, żeby cokolwiek
z niego zacząć budować dzisiaj. 13 istniejących laboratoriów to fundament,
środowisko walidacyjne i naukowe cegiełki tej wizji, nie coś, co ona
zastępuje.

### Wizja główna

Genesis OS ma docelowo wyjść poza stały zestaw ręcznie zaprogramowanych
laboratoriów. Użytkownik powinien móc opisać pytanie naukowe, hipotezę,
scenariusz teoretyczny lub system w języku naturalnym — bez wybierania
laboratorium i bez wiedzy, jaka metoda numeryczna, układ równań czy
architektura symulacji jest potrzebna. Genesis analizuje żądanie i
próbuje zbudować odpowiednią interaktywną symulację naukową.

Przykłady docelowych zapytań: „Zasymuluj hipotetyczną epidemię dróg
oddechowych rozprzestrzeniającą się w Madrycie przez 180 dni", „Pokaż co
się stanie z układem planetarnym, gdyby Jowisz miał dwukrotnie większą
masę", „Zbuduj model jeziora tracącego tlen podczas długiej fali upałów",
„Zasymuluj hipotetyczną zamkniętą kolonię marsjańską na 10 000 osób przez
20 lat", „Pokaż jak mutacja mogłaby zmienić uproszczony model fałdowania
białka", „Stwórz model natężenia ruchu w mieście po zamknięciu trzech
głównych dróg", „Porównaj dwa konkurujące matematyczne modele wzrostu
populacji", „Stwórz uproszczony ekosystem i sprawdź, co się stanie, gdy
zniknie jeden gatunek".

Docelowy przepływ: PYTANIE → ANALIZA INTENCJI NAUKOWEJ → IDENTYFIKACJA
DZIEDZINY → WYBÓR LUB KOMPOZYCJA MODELU → GENEROWANIE ZAŁOŻEŃ → UKŁAD
RÓWNAŃ/REGUŁ → WYBÓR METODY NUMERYCZNEJ → DEFINICJA PARAMETRÓW → BUDOWA
SYMULACJI → WALIDACJA → INTERAKTYWNA WIZUALIZACJA → NAUKOWA INTERPRETACJA
AI → NOWE HIPOTEZY I EKSPERYMENTY POCHODNE. Użytkownik zadaje pytanie,
Genesis buduje eksperyment — to jest fundamentalna wizja.

### To NIE jest fałszywy „generator AI"

Świadome ograniczenie architektoniczne: to nie ma być LLM generujący
losowy JavaScript/HTML i natychmiast go wykonujący — taka architektura
byłaby naukowo niewiarygodna, trudna do zwalidowania i potencjalnie
niebezpieczna. System ma używać kontrolowanej architektury symulacji
naukowej: AI pełni rolę orkiestratora i warstwy rozumowania naukowego,
składając symulacje z zaufanych, typowanych i zwalidowanych prymitywów
naukowych (przykładowe rodziny: układy ODE/PDE, N-body, Monte Carlo,
automaty komórkowe, modele agentowe, modele przedziałowe/reakcyjne,
dyfuzja/transport, optymalizacja, modele grafowe i stochastyczne, układy
dynamiczne, modele populacyjne/ekosystemowe, termodynamika, mechanika
orbitalna, modele pól, uproszczone modele molekularne).

Istniejące laboratoria Genesis OS mają stopniowo stać się reużywalnymi
silnikami i prymitywami: `labs/universe.ts` mógłby udostępniać prymitywy
grawitacji i mechaniki orbitalnej, `labs/mathematics.tsx` — parsowanie
równań, różniczkowanie, całkowanie, szukanie miejsc zerowych i solver
ODE, `labs/biology.ts` — modele populacyjne, transport błonowy i
uproszczone prymitywy biologiczne, `labs/chemistry.ts` — reakcje, energię
i modele fazowe, `labs/quantum.ts` — kontrolowane wektory stanu i obwody
kwantowe. Dynamic Simulation Generator docelowo komponuje te zaufane
silniki zamiast programować ręcznie kolejne pojedyncze eksperymenty.

### Scientific Intent Engine

Przyszły komponent odpowiedzialny za zrozumienie, o co naprawdę pyta
użytkownik: dziedzina naukowa, badany system, istotne obiekty, zmienne,
warunki początkowe i brzegowe, żądana skala czasowa i przestrzenna, znane
stałe, nieznane parametry, żądane wyniki, scenariusze porównawcze,
niepewność, wymagana wierność symulacji.

Przykład: „Zasymuluj utratę tlenu w jeziorze podczas 14-dniowej fali
upałów" → dziedzina: nauka o środowisku wodnym; system: jezioro; zmienne:
temperatura wody, tlen rozpuszczony, zużycie tlenu, wymiana atmosferyczna,
mieszanie, biochemiczne zapotrzebowanie na tlen; skala czasowa: 14 dni;
możliwy model: sprzężony układ ODE lub uproszczony model warstwowy
jeziora; wyniki: tlen rozpuszczony w czasie, próg hipoksji, porównanie
scenariusza bazowego z falą upałów.

System musi jawnie rozróżniać: FAKTY PODANE PRZEZ UŻYTKOWNIKA · ZNANE
STAŁE NAUKOWE · ZAŁOŻENIA MODELU · PARAMETRY SZACOWANE · PARAMETRY
NIEZNANE — to rozróżnienie musi być widoczne dla użytkownika. Genesis OS
nigdy nie wolno cicho wymyślać naukowej pewności (to samo DNA co dzisiejsza
zasada „nie buduje się atrap" i taksonomia `ConfirmationLevel`).

### Model Composer

Przyszły komponent budujący symulacje z reużywalnych modułów naukowych
zamiast ręcznego programowania każdego możliwego eksperymentu. Przykłady
kompozycji: symulacja pandemii = model populacji + sieć kontaktów + model
przedziałowy + założenia mobilności + stochastyczna transmisja +
scenariusze interwencji; kolonia marsjańska = dynamika populacji + zużycie
tlenu + recykling wody + produkcja energii i żywności + prawdopodobieństwa
awarii sprzętu + magazynowanie zasobów; jezioro = temperatura + transport
tlenu + biochemiczne zapotrzebowanie na tlen + mieszanie + wymiana
atmosferyczna. Celem NIE jest stworzenie milionów zakodowanych na sztywno
laboratoriów, tylko reużywalnych cegiełek naukowych zdolnych generować
miliony konfiguracji symulacji.

### Simulation IR (reprezentacja pośrednia)

Przyszła typowana, inspekcjonowalna reprezentacja pośrednia eksperymentu
naukowego. Język naturalny NIGDY nie staje się bezpośrednio wykonywalnym
kodem: język naturalny → intencja naukowa → Simulation IR → walidacja →
runtime symulacji. Simulation IR opisuje: obiekty, zmienne, jednostki,
parametry, równania, interakcje, ograniczenia, warunki początkowe i
brzegowe, wymagania solvera, wymagania wizualizacji, zakresy niepewności,
proweniencję, założenia — konceptualnie zbliżone do deklaratywnego
schematu (nazwa systemu, zmienne z jednostkami, parametry, przedział
czasu, typ solvera, lista wyjść). Musi być walidowane przed wykonaniem, a
docelowa architektura ma pozwalać je zapisywać, inspekcjonować, klonować,
wersjonować, porównywać, publikować, odtwarzać i remiksować — naturalne
połączenie z roadmapą Collaborative Science powyżej.

### Scientific Primitive Registry

Przyszły rejestr, w którym każda zaufana zdolność symulacyjna jest
zarejestrowana z metadanymi: dziedzina naukowa, wejścia, wyjścia,
obsługiwane jednostki, założenia, ograniczenia, metoda numeryczna, testy
walidacyjne, znane przypadki referencyjne, koszt obliczeniowy, kompatybilne
prymitywy. Przykładowe nazwy prymitywów w stylu przestrzeni nazw:
`gravity.nbody`, `orbit.kepler`, `math.ode.rk4`, `math.root.bisection`,
`math.integral.simpson`, `biology.population.logistic`,
`epidemiology.seir`, `environment.oxygen.balance`, `physics.diffusion`,
`chemistry.reaction.network`, `stochastic.monte_carlo`. AI musi wybierać
z zarejestrowanych prymitywów zawsze, gdy to możliwe — zweryfikowane
komponenty naukowe mają pierwszeństwo przed generowanymi algorytmami.

### Automatyczny wybór metody numerycznej (solver)

Genesis docelowo analizuje Simulation IR i rekomenduje odpowiednią metodę
numeryczną (układ ODE → RK4 lub przyszły solver adaptacyjny; układ
stochastyczny → Monte Carlo; populacja agentów → symulacja agentowa;
dyfuzja przestrzenna → różnice skończone; układ orbitalny → całkowanie
N-body; optymalizacja → odpowiedni silnik optymalizacyjny). Wybrana
metoda musi być widoczna, a Genesis ma wyjaśniać DLACZEGO ją wybrano, JAKIE
ma ograniczenia, JAKIE błędy numeryczne mogą wystąpić i CZY istnieje
metoda o wyższej wierności. Użytkownicy powinni docelowo móc porównywać
solvery („uruchom z RK4", „porównaj z całkowaniem adaptacyjnym", „zwiększ
precyzję", „pokaż rozbieżność numeryczną") — potencjalna funkcja
edukacyjna i badawcza jednocześnie.

### Automatyczne generowanie interfejsu symulacji

Generator ma tworzyć nie tylko model matematyczny, ale też interaktywny
interfejs eksperymentu na podstawie Simulation IR: suwaki, pola liczbowe,
przełączniki, selektory scenariuszy, osie czasu, wykresy, wizualizacje 2D
i 3D, mapy cieplne, pola wektorowe, widoki sieciowe, widoki cząstek,
panele porównawcze — dobierane wg reguł (parametr z zakresem liczbowym →
suwak; wiele scenariuszy → zakładki porównawcze; współrzędne przestrzenne
→ wizualizacja 2D/3D; wynik jako szereg czasowy → wykres i oś czasu;
obecna niepewność → widoczne zakresy niepewności). Wygenerowany interfejs
musi trzymać się języka wizualnego Genesis OS i wyglądać jak natywne
laboratorium Genesis, nie jak losowo wygenerowany HTML.

### AI Scientific Collaborator

Dzisiejszy AI Narrator ma docelowo ewoluować w aktywnego naukowego
współpracownika, który podczas wygenerowanych symulacji: wyjaśnia
zaobserwowane zachowanie, identyfikuje przejścia fazowe, wykrywa
nieoczekiwane wyniki i niestabilne regiony parametrów, porównuje
scenariusze, proponuje zmiany parametrów i eksperymenty kontrolne,
identyfikuje możliwe artefakty numeryczne, odróżnia zachowanie modelu od
twierdzeń o świecie rzeczywistym, sugeruje powiązane symulacje i generuje
nowe hipotezy. Przykład: „Zauważyłem, że tlen rozpuszczony zapada się po
9. dniu tylko wtedy, gdy temperatura przekracza 28°C, a mieszanie
pozostaje poniżej obecnego progu" → propozycja: „Uruchom ten sam
eksperyment ze zwiększoną o 20% wymianą atmosferyczną." AI ma rozumować o
eksperymencie, nie tylko opisywać wykresy.

### Hypothesis Engine

Przyszły komponent zamieniający zdanie użytkownika w rodzaju „Moja
hipoteza: zwiększenie mieszania w jeziorze opóźni hipoksję" w
przetestowalną strukturę: hipoteza, zmienna niezależna (tempo mieszania),
zmienna zależna (czas do progu hipoksji), kontrola (mieszanie bazowe),
eksperyment (seria symulacji w wybranym zakresie parametru), wynik
(wspiera / nie wspiera / nierozstrzygające w ramach modelu). Kluczowa
zasada uczciwości naukowej: Genesis nigdy nie może twierdzić, że symulacja
„dowodzi" prawdziwej teorii naukowej — wolno mu powiedzieć wyłącznie
„wspierane w ramach tego modelu i tych założeń" albo „niewspierane przez tę
konfigurację symulacji". Ma integrować się z historią eksperymentów i
Collaborative Science.

### Pipeline walidacji

Wygenerowane symulacje muszą przejść pipeline walidacyjny, zanim zostaną
zaprezentowane jako naukowo znaczące — możliwe etapy: walidacja składni,
spójność jednostek, walidacja zakresów parametrów, sprawdzenie stabilności
numerycznej, sprawdzenia zachowania wielkości zachowanych (tam gdzie
dotyczy), porównanie ze znanym przypadkiem referencyjnym, sanity-check
solvera, walidacja warunków brzegowych, przegląd założeń, klasyfikacja
uczciwości naukowej. Każda symulacja ma otrzymywać widoczny status
walidacji, np.: ZWERYFIKOWANE WZGLĘDEM PRZYPADKU REFERENCYJNEGO ·
ZWALIDOWANE NUMERYCZNIE · MODEL EDUKACYJNY · MODEL EKSPLORACYJNY · MODEL
HIPOTETYCZNY · NIEWYSTARCZAJĄCE DANE · WALIDACJA NIEUDANA. Dzisiejsza
filozofia uczciwości naukowej Genesis OS pozostaje fundamentalnym
wymaganiem architektonicznym tego systemu, nie dodatkiem.

### Proweniencja i źródła naukowe

Przyszłe symulacje mają śledzić proweniencję: użyte równania, użyte
prymitywy naukowe, stałe, źródła parametrów, założenia, metody
numeryczne, publikacje referencyjne (tam gdzie dotyczy), wprowadzone
modyfikacje. Użytkownik powinien móc zapytać „Skąd wzięło się to
równanie?", „Dlaczego użyto tego parametru?", „Która część jest
hipotetyczna?", „Co poprawiłoby dokładność modelu?" — a Genesis ma
odpowiadać transparentnie.

### Przykład wysokiego ryzyka: epidemiologia i granice bezpieczeństwa

Jedną z możliwych dziedzin jest epidemiologia: np. „Stwórz hipotetyczną
symulację epidemii dla miasta 3 milionów mieszkańców" mogłaby użyć
zaufanych prymitywów typu SIR/SEIR z parametrami (populacja, początkowo
zakażeni, tempo transmisji, okres inkubacji, tempo zdrowienia, założenia
mobilności, scenariusze interwencji) i wynikami (podatni/eksponowani/
zakażeni/ozdrowieńcy, szczyt epidemii, czas do szczytu, porównanie
scenariuszy). System musi jawnie stwierdzać, że to model, i odróżniać
hipotetyczne patogeny od prawdziwych czynników biologicznych. Cel to
edukacja epidemiologiczna, zdrowie publiczne, przygotowanie i symulacja
matematyczna — **NIE WOLNO** to stać się generatorem protokołów
biologicznych ani dostarczać instrukcji tworzenia, modyfikowania czy
optymalizowania patogenów. Ta sama zasada bezpieczeństwa dotyczy KAŻDEJ
dziedziny wysokiego ryzyka w całym systemie: Genesis może symulować
konsekwencje i układy matematyczne, ale nigdy nie dostarcza operacyjnych
instrukcji powodowania realnej krzywdy. To twarde ograniczenie
architektoniczne, nie sugestia.

### Przykład wysokiego ryzyka: obliczeniowe odkrywanie leków

Druga, równie ważna przyszła dziedzina wysokiego ryzyka (obok
epidemiologii wyżej, ten sam twardy standard bezpieczeństwa). Genesis OS
NIE twierdzi dziś i nie będzie docelowo twierdzić „stworzyliśmy lek" —
wynik obliczeniowy nie jest dowodem klinicznym. Docelowy, uczciwy
pipeline (kompozycja przyszłych prymitywów naukowych, ten sam wzorzec co
Model Composer wyżej): cel biologiczny → hipoteza mechanizmu → generowanie
lub import kandydata molekularnego → reprezentacja molekularna →
eksploracja miejsca wiązania → przewidywanie dokowania/interakcji →
dynamika molekularna tam, gdzie technicznie uzasadniona → analiza
stabilności wiązania → przewidywanie właściwości → przewidywanie
obliczeniowe związane z ADMET → analiza niepewności → porównanie
kandydatów → hipoteza AI Scientific Collaboratora → ranking kandydatów
obliczeniowych → raport badawczy → walidacja w zewnętrznym laboratorium.

Dozwolony słownik produktowy: „kandydat obliczeniowy", „przewidywana
interakcja", „hipoteza wywiedziona z modelu", „wymaga walidacji
eksperymentalnej", „pewność ograniczona przez model X", „wynik nie został
zwalidowany klinicznie". Zakazany słownik (bez realnego, przywołanego
dowodu naukowego/klinicznego): „wyleczyliśmy X", „stworzyliśmy lek", „to
działa jako terapia". Celem NIE jest fałszywe odkrycie AI, tylko
infrastruktura mogąca pomóc ludziom szybciej eksplorować kandydujące
hipotezy — dokładnie ta sama różnica co między Hypothesis Engine
(„wspierane w ramach tego modelu i tych założeń", nigdy „udowodnione")
a fałszywym twierdzeniem o świecie rzeczywistym, opisana wyżej.

**Nie budować teraz.** Zero generowania molekuł, zero dokowania, zero
funkcjonalności klinicznej, zero automatyzacji laboratoryjnej, zero
instrukcji syntezy w Genesis OS dzisiaj — ten podrozdział istnieje
wyłącznie po to, żeby przyszła implementacja (jeśli i kiedy do niej
dojdzie) miała już rozstrzygnięty słownik uczciwości i miejsce w
architekturze (patrz `ARCHITECTURE.md` §„Wizja założycielska"), zamiast
improwizować go pod presją.

### Symulacje międzydziedzinowe (cross-domain)

Jeden z najambitniejszych celów: kompozycja wielu dziedzin naraz, np.
„Co się stanie z kolonią marsjańską, gdy burza pyłowa zredukuje energię
słoneczną o 70% przez 90 dni?" (astronomia + energia + środowisko +
inżynieria + zarządzanie zasobami + przetrwanie populacji) albo „Zasymuluj
falę upałów wpływającą na miasto, jego zapotrzebowanie na energię i
zużycie wody" (klimat + termodynamika + energia + populacja +
infrastruktura). To punkt, w którym Genesis OS mógłby stać się
fundamentalnie czymś innym niż zbiorem edukacyjnych symulacji — platformą
łączącą dziedziny naukowe.

### Discovery Loop

Docelowe doświadczenie użytkownika jako pętla: PYTANIE → SYMULACJA →
OBSERWACJA → PYTANIE → MODYFIKACJA → PORÓWNANIE → SFORMUŁOWANIE HIPOTEZY →
TEST → ZAPISANIE ODKRYCIA → UDOSTĘPNIENIE LUB REMIKS. Koniec jednej
symulacji ma naturalnie tworzyć początek następnej — AI Scientific
Collaborator ciągle sugeruje sensowne naukowe odgałęzienia (np. po zmianie
masy Jowisza i destabilizacji pasa asteroid: „Co jeśli masa Saturna też
się zmieni?", „Które populacje asteroid destabilizują się pierwsze?",
„Porównaj 10 milionów lat ewolucji", „Przetestuj ten sam układ bez
Jowisza") — tworząc pętle naukowej ciekawości.

### Integracja z Collaborative Science i grafem publicznych eksperymentów

Dynamic Scientific Simulation Generator i Collaborative Science (sekcja
niżej) mają się docelowo wzajemnie wzmacniać: użytkownik tworzy
wygenerowany eksperyment, zaprasza innych, grupa zmienia parametry i
tworzy konkurujące hipotezy, uruchamia scenariusze, AI Scientific
Collaborator obserwuje, historia eksperymentu jest zapisywana, wynik
zostaje opublikowany, inna grupa klonuje eksperyment, modyfikuje model,
tworzy nową wersję. Docelowo eksperymenty mają tworzyć graf (eksperyment A
→ sklonowany jako B → zmodyfikowany w C; hipoteza X testowana przez
eksperymenty A, D, F) z możliwością eksploracji „eksperymenty wywiedzione
z tego modelu", „alternatywne hipotezy", „najczęściej remiksowane
symulacje", „sprzeczne wyniki", „powiązane odkrycia" — docelowo unikalna
sieć eksploracji naukowej. Całość ma się poczuć jak: silnik symulacji
naukowej + AI-naukowiec + wersjonowanie eksperymentów w stylu Git +
przestrzeń współpracy w czasie rzeczywistym + publiczna sieć odkryć.

### Fazowa mapa drogowa

**Faza 0 — Genesis OS v1.0.** NIE BUDOWAĆ generatora. Dokończyć istniejący
produkt: dokończyć bieżącą roadmapę, usunąć tarcie UX, dopracować
pierwsze dwie minuty doświadczenia, zweryfikować każde laboratorium,
dopieścić UI mobilne, ustabilizować AI Narratora, dokończyć wdrożenie
produkcyjne, poprawić onboarding, zapewnić natychmiastowy efekt WOW.
Istniejące laboratoria to naukowy fundament.

**Faza 1 — Ekstrakcja prymitywów.** Analiza istniejących laboratoriów,
identyfikacja reużywalnych silników symulacji, ekstrakcja zaufanych
prymitywów naukowych z istniejącego kodu, pierwszy Scientific Primitive
Registry. Jeszcze bez generowania symulacji — cel: Genesis rozumie
wewnętrznie, jakie zdolności naukowe już posiada.

**Faza 2 — Simulation IR.** Projekt typowanej reprezentacji pośredniej:
schemat, walidatory, jednostki, parametry, równania, założenia, wyjścia,
definicje solvera. Ręcznie napisane przykładowe Simulation IR, weryfikacja
że istniejące eksperymenty Genesis dają się nią wyrazić.

**Faza 3 — Prototyp Model Composera.** Kontrolowany composer wspierający
początkowo tylko kilka dziedzin (proponowane pierwsze: matematyczne układy
dynamiczne, układy orbitalne, modele populacyjne, modele bilansu
środowiskowego). Composer może używać WYŁĄCZNIE zarejestrowanych
prymitywów — zero dowolnie generowanego wykonywalnego kodu.

**Faza 4 — Scientific Intent Engine.** Zapytania w języku naturalnym
zamieniane w ustrukturyzowaną intencję naukową. System ma dopytywać, gdy
brakuje krytycznej informacji (np. „Jaka jest przybliżona głębokość
jeziora?", „Jaki okres czasu zasymulować?") zamiast cicho wymyślać
krytyczne parametry — dopytywanie ma pierwszeństwo przed zgadywaniem.

**Faza 5 — Automatyczne UI symulacji.** Generowanie natywnych interfejsów
eksperymentów Genesis z Simulation IR (kontrolki, wykresy, osie czasu,
porównania, dobrane wizualizacje) — wszystkie wygenerowane eksperymenty
muszą wizualnie pasować do Genesis OS.

**Faza 6 — Silnik walidacji.** Budowa pipeline'u walidacji naukowej,
wprowadzenie widocznych klasyfikacji modelu i statusów walidacji.
Wygenerowane symulacje muszą wyjaśniać własne ograniczenia.

**Faza 7 — AI Scientific Collaborator.** Rozbudowa AI Narratora tak, żeby
rozumował na podstawie intencji, Simulation IR, parametrów, wyników i
historii, proponując naukowo sensowne eksperymenty pochodne.

**Faza 8 — Hypothesis Engine.** Możliwość definiowania hipotez przez
użytkownika, automatyczna budowa kontrolowanych porównań eksperymentów
tam, gdzie technicznie możliwe, śledzenie wyników — nigdy bez mylenia
dowodu symulacyjnego z dowodem na temat świata rzeczywistego.

**Faza 9 — Współpracujące wygenerowane eksperymenty.** Integracja z
Collaborative Science: wspólne operowanie wygenerowanymi symulacjami,
historia eksperymentu, wersjonowanie, klonowanie, remiksowanie.

**Faza 10 — Kompozycja międzydziedzinowa.** Umożliwienie działania
wielu rodzin prymitywów naukowych wewnątrz jednej symulacji — poważny
kamień milowy badawczo-architektoniczny. Nie obiecywać uniwersalnej
symulacji naukowej — zacząć od jawnie wspieranych kombinacji.

**Faza 11 — Sieć odkryć.** Publiczna linia rodowodowa eksperymentów:
odkrywanie publicznych eksperymentów, remiksów, odgałęzień hipotez,
powiązanych modeli, alternatywnych założeń.

### Wymaganie architektoniczne na przyszłość

Gdy implementacja faktycznie się kiedyś zacznie (nie wcześniej), system
ma być projektowany pod długoterminową skalowalność: modularne silniki
naukowe, niezależnie wersjonowane prymitywy, skalowanie horyzontalne,
izolowani workerzy symulacji, kolejki zadań obliczeniowych, cache'owanie
symulacji, deterministyczne odtwarzanie tam, gdzie możliwe, kontrola
wersji eksperymentów, śledzenie proweniencji, w przyszłości rozproszone
wykonanie oraz workery GPU/specjalizowanego obliczania. Wygenerowana
logika symulacji NIE MOŻE być ciasno sprzężona z UI React — modele
naukowe, runtime symulacji, wizualizacja i rozumowanie AI mają być
osobnymi warstwami architektonicznymi. System ma docelowo obsłużyć
tysiące wygenerowanych eksperymentów i pokoi kolaboracyjnych bez
konieczności całkowitego przeprojektowania architektury — dokładnie ta
sama zasada skalowalności co w sekcji Collaborative Science powyżej/niżej.

### Zasada końcowa produktu

Genesis OS nie ma dążyć do ręcznego zbudowania laboratorium dla każdego
możliwego pytania naukowego — to się nie skaluje. Istniejące laboratoria
to fundament. Docelowy cel: zbudować prymitywy naukowe, zbudować
kompozytor naukowy, zbudować system walidacji, pozwolić użytkownikom
zadawać pytania, pozwolić Genesis budować kontrolowane eksperymenty.
Docelowe doświadczenie: „Mam pytanie naukowe." → Genesis OS: „Zbudujmy
symulację i sprawdźmy to."

Nie implementować tej funkcji teraz. To udokumentowany, poważny,
przyszły kierunek platformy — warunkiem jest wcześniejsze dokończenie
Genesis OS v1.0.

## Flagowe pomysły — najwyższy potencjał, wymagają wielu sesji

Dwie pozycje wyróżnione z reszty listy: nie są "kolejną funkcją do
dorzucenia", tylko wieloetapowymi projektami, które same w sobie mogłyby
stać się rozpoznawalnym elementem Genesis OS. Rozpisane szerzej niż reszta
backlogu celowo — żeby następna sesja, która się za nie weźmie, miała
gotowy plan fazowania, a nie tylko hasło.

### Discovery Timeline Engine — ✅ ZBUDOWANE (Fazy 1+2+3; Faza 4 w backlogu)

Jedna, ciągła podróż przez 15 epok od Wielkiego Wybuchu do dalekiej
przyszłości Wszechświata (`data/timeline.ts`), z niezależną soczewką skali
(kwark → obserwowalny Wszechświat), bez przeładowań ekranu — drugi, obok
siatki kart, tryb wejścia do Genesis OS, pod `#/timeline`. Zbudowane w
całości w jednej sesji, po tym jak wszystkie 9 istniejących laboratoriów
osiągnęło poziom "world-class" (governing rule tej sesji).

Uczciwość naukowa: każda epoka niesie jawny `ConfirmationLevel` (ta sama
6-stopniowa skala co cytowania wszędzie indziej) — rekombinacja/CMB
★★★★★, daleka przyszłość ★★ (hipoteza). Zero nowej taksonomii.

**Co zbudowano** (okazało się szybsze niż pierwotne fazowanie zakładało):
1. ✅ Oś czasu (suwak logarytmiczny + Narrator per epoka, pełne sterowanie:
   pauza/przewijanie/przyspieszanie/skok do dowolnej z 15 epok) —
   `core/logSlider.ts` (wydzielone ze ScaleJourney), `core/timelineMath.ts`
   (cross-fade między sąsiednimi epokami, zero ekranów ładowania).
2. ✅ Most do laboratoriów — `core/scenarioBridge.ts` ROZSZERZONY o
   opcjonalny `experimentId` (trzeci konsument po „Co by było, gdyby?" i
   Multiverse Nexus), trafia teraz w KONKRETNY eksperyment (np. epoka
   „Układ Słoneczny" → zakładka „Prawdziwy Układ Słoneczny", nie bazowa).
3. ✅ Płynny zoom międzyskalowy — okazał się BEZPOŚREDNIO reużywalny z
   istniejącego mechanizmu Scale Journey (`data/scaleMilestones.ts`,
   wydzielone i współdzielone), nie wymagał osobnego systemu LOD/kamery
   jak pierwotnie zakładano. Niezależna oś, zawsze dostępna, punkt
   startowy ustawiany przez charakterystyczną skalę bieżącej epoki.
4. **Backlog (NIE zbudowane)**: sceny 3D dla wybranych epok (dziś: 15
   ręcznie zaprojektowanych scen Canvas 2D w
   `components/discoveryTimelineScenes.ts`) — kolejny konsument `Sim3D`,
   analogicznie do Układu Słonecznego 3D czy Czarnej dziury 3D. Zapisywanie
   /udostępnianie własnej „podróży" przez oś czasu.

Zweryfikowane: typecheck, lint, 219 testów (19 nowych: `logSlider.test.ts`,
`timelineMath.test.ts` — w tym integralność 15 epok, i 2 nowe testy
`scenarioBridge.test.ts` dla `experimentId`), build, Playwright (skoki
między 7 epokami, autoodtwarzanie, ręczny zoom, pełny most do laboratorium
z potwierdzeniem właściwej zakładki) — zero błędów konsoli.

### Frontier Science Lab (nowa kategoria — zagadki i granice wiedzy)

Jedenaste laboratorium (dziś: Universe, Space-Time, Einstein, Quantum, Atom,
Nuclear, Particle, Multiverse, Civilization, AI Discovery), celowo
zaplanowane na PO osiągnięciu przez istniejące laby światowego poziomu
wykonania — nie teraz. Silniejsza koncepcja niż pojedynczy kontrowersyjny
temat: całe laboratorium poświęcone granicy między nauką ugruntowaną,
aktywnymi badaniami, historycznymi zagadkami i inspiracją fikcyjną,
eksplorowane przez dowody i konkurujące hipotezy — NIE przez przekonywanie.

Scenariusze (każdy jako osobny eksperyment w tym labie, ten sam wzorzec co
`ExperimentDef` wszędzie indziej): Eksperyment Filadelfia (legenda i jej
udokumentowane pochodzenie — USS Eldridge, badania Townsenda Browna nad
efektem Biefelda-Browna, brak jakichkolwiek akt marynarki potwierdzających
wydarzenie), Paradoks Fermiego, sygnał WOW!, ciemna materia, ciemna energia
(obie już częściowo pokryte w Universe/Multiverse Lab — tu: pogłębione,
zestawienie konkurencyjnych modeli), mosty Einsteina-Rosena, napęd
Alcubierre'a (oba już wspomniane w Einstein Lab jako hipotezy — tu:
rozwinięte studium przypadku), rój Dysona (już w Civilization Lab —
tu: historia pomysłu Dysona 1960 + przegląd wyników poszukiwań),
Oumuamua, Zdarzenie Tunguskie, kwantowy eksperyment z opóźnionym wyborem
(rozszerzenie Quantum Lab), nierówności Bella (już zaimplementowane jako
CHSH w Quantum Lab — tu: kontekst historyczny/filozoficzny), kot
Schrödingera (eksperyment myślowy, nie symulacja fizyczna), problem trzech
ciał (patrz osobna pozycja niżej — może żyć w obu miejscach: fizyka w
laboratorium fizyki, kontekst "dlaczego to fascynuje ludzi" tutaj),
hipoteza symulacji (jako filozofia, jawnie NIE jako twierdzenie fizyczne).

**Kluczowa decyzja projektowa do rozstrzygnięcia PRZED implementacją:**
użytkownik poprosił o pięć kategorii scenariusza (Established Science /
Active Scientific Research / Theoretical Physics / Historical Mystery /
Fictional Inspiration) — to inna oś niż istniejący sześciostopniowy
`ConfirmationLevel` (core/citation.ts), który mierzy STOPIEŃ potwierdzenia,
nie RODZAJ twierdzenia. Rekomendacja: nie budować równoległej taksonomii.
Dodać jedno nowe, opcjonalne pole `ScenarioKind` obok istniejącego
`ConfirmationLevel` (scenariusz może być jednocześnie np. "Historical
Mystery" I "★★ hipoteza" — te dwie osie się nie wykluczają, opisują różne
rzeczy). Prościej niż wygląda: to dokładnie ten sam wzorzec co dodanie
`HonestyLevel` obok `ConfirmationLevel` wcześniej w projekcie — dwie
uzupełniające się skale, nie konkurencyjne.

Reużywalna architektura (zero nowego systemu): `ExperimentDef.narrate()` z
`citation` na każdym bloku (już wspiera "link do prawdziwej publikacji, gdy
dostępny" — dokładnie to, o co poproszono), `HonestyBadge`/`ConfirmationLevel`
dla wskaźnika pewności, `askAI()` ugruntowany w nowym
`knowledge/frontier-science.md` dla „AI Mentor wyjaśniającego wiele punktów
widzenia" (to już jest dokładnie to, do czego służy warstwa 1 Narratora —
żaden nowy mechanizm AI). Wizualizacja: `Sim` (2D) domyślnie, `Sim3D` tam,
gdzie uzasadnione (np. Oumuamua — prawdziwa, ekscentryczna trajektoria
hiperboliczna, dokładna fizyka orbitalna już mamy w `core/physics.ts`).

Ryzyko do zarządzania: to lab, w którym najłatwiej o utratę wiarygodności
całej platformy, jeśli granica model/hipoteza/legenda się zatrze choćby raz.
Każdy pojedynczy scenariusz wymaga tego samego poziomu researchu co
`knowledge/*.md` dla istniejących labów — nie da się tego zrobić płytko.

### Trzy Ciała — od wykresu do laboratorium (★★★★★ chaos deterministyczny) — ✅ ZBUDOWANY PIERWSZY KROK

**Status: zbudowany "realistyczny pierwszy krok" opisany niżej** —
`labs/experiments/universe-threebody.ts`, Universe Lab. Integrator
velocity-Verlet symplektyczny z ADAPTACYJNYM krokiem (maleje przy bliskich
przejściach — bez tego stałokrokowy integrator traci energię w problemie
pitagorejskim), dwa realne układy startowe (ósemka Moore/Chenciner–Montgomery,
problem pitagorejski Burrau 1913), tryb "dwa niemal identyczne starty" (10⁻⁶
przesunięcia) pokazujący dywergencję na żywo z liczbowym odczytem odległości.
10 nowych testów (`universeThreeBody.test.ts`): zachowanie energii
długoterminowo dla obu układów (w tym przez bliskie przejście w problemie
pitagorejskim), powrót ósemki do startu po jednym okresie T≈6.326, wykładniczy
wzrost separacji >1000× po mikroskopijnym przesunięciu. Zweryfikowane
Playwrightem: oba presety, przełączanie, tryb dywergencji z rosnącym
odczytem — zero błędów konsoli.

Backlog na przyszłość (NIE zbudowane, patrz punkty niżej): tysiące cząstek
z GPU instancingiem, zapis/udostępnianie własnego układu, AI analizujące
punkty chaosu (rozszerzenie `core/experimentAnalysis.ts`).

Pełny oryginalny opis (rozszerzenie prostego "pokaż orbity trzech ciał" w
pełne, interaktywne laboratorium dynamiki chaotycznej z tysiącami cząstek):
- Tysiące cząstek / świecące trajektorie — wydajnościowo wymaga
  `THREE.Points` z GPU instancingiem, nie osobnych obiektów per cząstka
  (patrz „Performance" niżej).
- Użytkownik komponuje własny układ (masy, prędkości początkowe) —
  reużywa dokładnie wzorca `core/customExperiment.ts` (zapis presetu
  parametrów), nie nowego systemu.
- Zapisywanie i udostępnianie innym — wymaga backendu z kontem (patrz
  `ARCHITECTURE.md` „Przyszły backend"), świadomie odłożone do tego czasu.
- AI analizuje stabilność i wskazuje punkty chaosu — naturalne rozszerzenie
  `core/experimentAnalysis.ts` (już wykrywa skoki/korelacje w przebiegu;
  "wykładniczy rozjazd dwóch niemal identycznych startów" to kolejna,
  policzalna metryka w tym samym module, nie nowy silnik AI).

Realistyczny pierwszy krok (osiągalny w jednej sesji): 2D silnik N-ciał z
integracją symplektyczną (zachowuje energię długoterminowo, w
przeciwieństwie do zwykłego Eulera) + tryb "dwa niemal identyczne starty"
pokazujący dywergencję na żywo — to samo dydaktyczne jądro, bez czekania na
tysiące cząstek czy współdzielenie.

### Quantum Decision Explorer — ✅ ZBUDOWANE (dawniej: "osobisty multiwersum decyzji") — narzędzie narracyjne, NIE fizyka

Pomysł oceniony (przez użytkownika, po przejrzeniu pierwotnej koncepcji):
warstwa wizualna jest bardzo mocna, ale pierwotne sformułowania ("portal do
Akaszy", "świat optymalny, gdyby zawsze słuchał intuicji", liczby 111/444
jako podstawa działania) przedstawiają nauko-podobne twierdzenia bez
pokrycia — dokładnie to, przed czym cała reszta Genesis OS się broni. Jeśli
platforma ma budować wiarygodność na poziomie NASA/uczelni, ten moduł NIE
może brzmieć jak przepowiadanie przyszłości ani ezoteryka.

**Co zostaje (świetne, zachować):**
- Galaktyka zbudowana z decyzji użytkownika — każda gwiazda to jeden ważny
  wybór życiowy, wizualnie spektakularne, naturalny konsument techniki
  cząstek/gwiazd już dopracowanej w tej sesji (universe.ts, civilization.ts)
- Suwak "zmień decyzję → obserwuj, jak zmienia się cała struktura" — świetna
  interakcja, koncepcyjnie bliska suwakowi Discovery Timeline (zmiana jednej
  zmiennej przegenerowuje całą wizualizację na żywo)
- Spersonalizowany film/zwiastun 4K jako element marketingowy — osobny
  temat produkcyjny (rendering offline, nie runtime), do rozważenia niezależnie

**Co się zmienia (wymagane PRZED jakąkolwiek implementacją):**
- Nazwa: "Quantum Decision Explorer" (albo podobna, jawnie neutralna) —
  nie "multiwersum" bez przymiotnika, żeby nie sugerować związku z
  interpretacją wielu światów Everetta (Multiverse Lab już to poprawnie
  odróżnia — ten moduł musi trzymać tę samą granicę)
- Zero numerologii (111, 444 itp.) jako "mechanizmu działania" — to nie ma
  żadnego pokrycia naukowego, w Genesis OS nie ma dla tego miejsca
  jako rzekomej podstawy jakiegokolwiek algorytmu
- Zero języka duchowego/ezoterycznego ("Akasza", "intuicja jako źródło
  optymalnej ścieżki") przedstawianego jako mechanizm, nie metafora
- Obowiązkowy, stały komunikat AI/UI (wzorem `honestyNote` każdego innego
  modułu): *"To interaktywna symulacja alternatywnych scenariuszy oparta na
  modelowaniu decyzji i wizualnych inspiracjach z fizyki. Nie przewiduje
  przyszłości ani nie odtwarza rzeczywistości."* — analogicznie do
  `honesty: 'theoretical'` używanego już w Multiverse/Civilization Lab,
  tylko tu jeszcze wyraźniej: to narzędzie narracyjne/refleksyjne, nie
  model fizyczny nawet w przybliżeniu

**Architektura (reużywalna, zero nowego systemu):**
- Struktura danych "decyzja → gałąź" to ten sam wzorzec co
  `core/customExperiment.ts` (zapis presetu parametrów użytkownika) +
  drzewo/graf, nie nowy silnik
- Wizualizacja gwiazd/galaktyki: `Sim` (Canvas 2D) z technikami już
  sprawdzonymi w tej sesji (starfield, gradient, glow sterowany realnymi
  danymi — tu: "waga" decyzji, nie ozdoba)
- Suwak zmiany decyzji: dokładnie `core/logSlider.ts`-owy wzorzec
  target/current lerp, tylko oś to indeks/waga decyzji, nie skala czy czas
- `HonestyBadge`/nowy jawny disclaimer zamiast `ConfirmationLevel` — to
  jedyny moduł w Genesis OS, który nie twierdzi NIC naukowego, więc
  potrzebuje własnej, jeszcze prostszej etykiety ("narzędzie refleksyjne",
  nie punkt na skali potwierdzenia)

**Status: zbudowane** (`components/QuantumDecisionExplorer.tsx`,
`core/decisionExplorer.ts`, `#/decision-explorer`). Wszystkie punkty z
"co się zmienia" zrealizowane dosłownie: nazwa neutralna, zero numerologii,
zero języka duchowego, stały niedomykalny baner z dokładnie tym tekstem,
jaki użytkownik podał. Architektura zgodna z powyższym planem: dane w
localStorage (`core/storage.ts`), geometria spirali oparta na kącie złotym
(phyllotaxis — ta sama technika co węzły sieci energetycznej w
`civilization.ts`), suwak liniowy po indeksie decyzji z płynnym
podświetleniem aktywnej gwiazdy, `NarratorPanel`/`askAI` ugruntowany w
nowym `knowledge/quantum-decision-explorer.md` (jawnie instruuje AI, by
nigdy nie sugerowało przewidywania). 12 nowych testów
(`decisionExplorer.test.ts`: sanityzacja, CRUD, sortowanie chronologiczne,
geometria `galaxyPosition`). Zweryfikowane Playwrightem: dodawanie,
edycja, usuwanie decyzji i przewijanie osi czasu — struktura galaktyki i
widoczne odgałęzienia zmieniają się na żywo, zero błędów konsoli.

**Rozszerzenie: symulacja Monte Carlo odgałęzień — ✅ ZBUDOWANE.** Na
wyraźną prośbę użytkownika ("Zbuduj najbardziej realistyczny... symulator
alternatywnych scenariuszy... oparty na AI, matematyce, teorii decyzji,
symulacjach Monte Carlo") rozbudowano moduł o PRAWDZIWĄ matematykę:
- `core/decisionMonteCarlo.ts` — dyskretny proces Wienera z dryfem
  (schemat Eulera–Maruyamy, transformacja Boxa–Mullera dla N(0,1)),
  dokładnie ten sam model co dyfuzja/ruchy Browna w fizyce
- `Branch` rozszerzony o pole `tone` (-5..+5, ocena użytkownika) —
  steruje dryfem symulacji; `Decision.weight` steruje zmiennością
  (`branchToSimParams`). Migracja starego formatu (goły string) wbudowana
  w `sanitizeBranch`, więc dane sprzed tej zmiany nadal się wczytują
- Suwak horyzontu czasowego (1/3/5/10/20/50/100 lat) — każde odgałęzienie
  renderuje wachlarz ~20 niezależnie zasymulowanych trajektorii, których
  rozrzut WIDOCZNIE rośnie jak √czas (zweryfikowane Playwrightem: fan przy
  100 latach wyraźnie szerszy niż przy 1 roku) — realna własność procesu
  Wienera, nie ozdoba
- Narrator raportuje `significantFraction` (realny wynik statystyczny z
  próby Monte Carlo) z jawnym zastrzeżeniem "to NIE prognoza tej
  konkretnej ścieżki — demonstracja własności matematycznej"
- Ze spisu życzeń użytkownika ŚWIADOMIE NIE zbudowano (bo wymagałoby
  fabrykowania fałszywej precyzji albo osobnej, dużej infrastruktury):
  AI generujące "dziesiątki/setki ścieżek" (brak podstawy do twierdzenia,
  że LLM potrafi to zrobić wiarygodnie), symulacja finansów/zdrowia/relacji
  jako osobnych, "przewidywanych" wymiarów (patrz honestyNote — to
  wymagałoby modelu ekonomicznego/medycznego, którego nie mamy i nie
  udajemy że mamy), sieci Bayesa / Markov Decision Process / Reinforcement
  Learning (żadne z nich nie ma tu jeszcze zdefiniowanego, uczciwego
  zastosowania — dodanie by było cargo-cultem nazw, nie realną wartością),
  tryb filmowy 4K (osobny temat produkcyjny, rendering offline)
- 12 nowych testów (`decisionMonteCarlo.test.ts`): Box-Muller daje
  N(0,1) na dużej próbie, czysty dryf bez szumu daje v(T)=drift·T
  dokładnie, std(4 lata)/std(1 rok)≈√4=2 (zweryfikowane empirycznie),
  zgodność std z formułą teoretyczną volatility·√T w granicach 10%,
  znak dryfu zgodny ze znakiem tonu. Plus zaktualizowane testy migracji
  danych w `decisionExplorer.test.ts`. Zweryfikowane: typecheck, lint,
  275 testów vitest, build, Playwright (wachlarz Monte Carlo, edycja
  odgałęzień z suwakiem tonu, przełączanie horyzontu) — zero błędów
  konsoli.

Backlog na przyszłość (NIE zbudowane): spersonalizowany film/zwiastun 4K
(osobny temat produkcyjny, rendering offline); ewentualne AI sugerujące
nowe gałęzie (jawnie jako kreatywna sugestia, nigdy jako predykcja).

---

## Quantum Reality

- ✅ Superpozycja i interferencja — Quantum Lab, dwie szczeliny (★★★★★)
- ✅ Splątanie kwantowe + test Bella (CHSH) — Quantum Lab (★★★★★, Nobel 2022)
- ✅ Sfera Blocha (stan kubitu) — Quantum Lab → `quantum-bloch.ts` (★★★★★)
- ✅ Tunelowanie kwantowe — Quantum Lab, silnik FFT równania Schrödingera (★★★★★)
- ✅ Dekoherencja — narracja w double-slit (pomiar niszczy interferencję) (★★★★★)
- ✅ **Bramki kwantowe (jednokubitowe) / diagram obwodu** — rozszerzenie
  `quantum-bloch.ts`: prawdziwa sekwencja zastosowanych bramek (H, X, Y, Z,
  S, T, pomiar) renderowana jako diagram obwodu (konwencja IBM Quantum
  Composer), eksportowane czyste funkcje `applyGate`/`applyCircuit` do
  testów. Narrator tłumaczy nieprzemienność bramek (kolejność X,Z ≠ Z,X)
  jako realną własność matematyczną, nie ciekawostkę. 9 nowych testów:
  unitarność każdej bramki (zachowanie normy), H∘H=X∘X=tożsamość,
  nieprzemienność X,Z vs Z,X na stanie w superpozycji.
  **Wciąż w backlogu przy pojedynczej sferze Blocha**: nie dotyczy —
  patrz niżej, pełny wektor stanu wielu kubitów już zaimplementowany.
- ✅ **Wektor stanu wielu kubitów + CNOT + teleportacja kwantowa** —
  `core/quantumState.ts` + `quantum-teleport.ts`, Quantum Lab. Pełny
  wektor stanu 2ⁿ amplitud, bramki jednokubitowe i CNOT na dowolnym
  kubicie n-kubitowego rejestru. Protokół teleportacji (Bennett i in.
  1993; pierwsza realizacja: Bouwmeester i in. 1997) na 3 kubitach:
  wierność odtworzonego stanu = 1 DOKŁADNIE w każdej z 4 gałęzi pomiaru,
  dla dowolnego zespolonego stanu wejściowego — zweryfikowane numerycznie
  poza aplikacją PRZED napisaniem testów, mapowanie (m₀,m₁)→korekta
  (I/X/Z/XZ) wyprowadzone algebraicznie krok po kroku. Jawnie wyjaśnione:
  to NIE transmisja informacji szybszej niż światło (Bob potrzebuje 2
  bitów klasycznych) i NIE kopiowanie (oryginalny stan niszczony
  pomiarem — zakaz klonowania). 12 nowych testów (`quantumState.test.ts`):
  unitarność bramek, dokładna para Bell, korelacja pomiaru pary Bell,
  fidelity=1 dla stanów rzeczywistych i zespolonych, wszystkie 4 gałęzie
  korekty realnie występują, rozkład wyników pomiaru ~25%/gałąź.
- **Eksperyment myślowy Schrödingera (kot)** (★★★★★ jako ilustracja
  problemu pomiaru, ☆ jeśli przedstawiony dosłownie) — NIE symulacja
  fizyczna kota, tylko interaktywne wyjaśnienie problemu pomiaru/interpretacji
  kwantowej, powiązane z istniejącym CHSH i dekoherencją.
- **Funkcja falowa 2D/3D w czasie rzeczywistym** (★★★★★) — silnik FFT z
  `quantum-tunneling.ts` już istnieje; rozszerzenie do 2D (cząstka w studni
  potencjału, oscylator harmoniczny) to głównie koszt UI, nie nowej fizyki.

## Multiverse / nawigacja (nowa kategoria, poza pierwotną listą)

- ✅ **Multiverse Nexus** — Multiverse Lab → `multiverse-nexus.ts`, sala
  portali w 3D (oryginalna metafora, nie kopia żadnego filmu/serialu):
  portale „lokalne" (inne stałe fizyczne) i portale-tunele, które NAPRAWDĘ
  przenoszą do innego laboratorium przez `core/scenarioBridge.ts` — ten sam
  most co „Co by było, gdyby?" (dwa wejścia UI, jeden mechanizm).
- **Więcej tuneli w Nexusie** (tani przyrost) — każdy nowy wpis w
  `WHAT_IF_SCENARIOS` może natychmiast stać się kolejnym portalem-tunelem
  bez nowego kodu silnika, tylko nowy obiekt `WormholePortal`.
- **Nexus jako uniwersalny hub startowy** (większa decyzja produktowa) —
  dziś portal-hub istnieje wyłącznie wewnątrz Multiverse Lab; docelowo
  mógłby zastąpić/uzupełnić siatkę kart na ekranie głównym jako
  alternatywny, przestrzenny sposób nawigacji po WSZYSTKICH laboratoriach.
  Świadomie nie robić tego pochopnie — siatka kart jest dziś dostępna i
  szybka (SEO, dostępność, czas ładowania); hub 3D jako JEDYNA nawigacja
  byłby regresją dla części użytkowników.

## Higher Dimensions

- ✅ **Tesserakt 4D** — Multiverse Lab → `multiverse-tesseract.ts`,
  obrót w płaszczyźnie 4D + rzut perspektywiczny (★★★★★ matematyka
  dokładna; jednoznacznie odróżnione od spekulacji fizycznej o
  dodatkowych wymiarach)
- **5-komórka / inne politopy regularne 4D** (★★★★★) — ten sam silnik
  (`rotate4D`/`project4Dto3D`) co tesserakt, inny zestaw wierzchołków/krawędzi.
  Bardzo tani przyrostowo.
- **Przekroje 4D→3D (nie tylko rzut)** (★★★★★) — pokazanie tesseraktu jako
  serii przekrojów 3D w miarę „przesuwania" hiperpłaszczyzny wzdłuż w —
  inna, komplementarna technika wizualizacji do rzutu.
- **11-wymiarowa teoria strun jako KONTEKST, nie symulacja** (★ spekulacja,
  wyraźnie oznaczona) — krótki, uczciwy tekst w Narratorze przy okazji
  tesseraktu: czym różni się matematyczna zabawa z 4D od fizycznej hipotezy
  dodatkowych wymiarów zwiniętych w skali Plancka. Zero nowego kodu.

## Space-Time

- ✅ Dylatacja czasu, paradoks bliźniąt — Space-Time Lab (★★★★★)
- ✅ Soczewkowanie grawitacyjne — Einstein Lab → `einstein-lensing.ts` (★★★★★)
- ✅ Czarna dziura Schwarzschilda: geodezyjne fotonów + dysk akrecyjny —
  Einstein Lab → `einstein-geodesics.ts` (★★★★★, pełne równanie geodezyjnej)
- ✅ Metryka Kerra (wirująca czarna dziura) — Einstein Lab, poglądowo (★★★★)
- ✅ Fale grawitacyjne — opisane w `knowledge/universe.md` (GW150914), brak
  jeszcze dedykowanej symulacji chirp — dobry kandydat na osobny eksperyment
- **Most Einsteina–Rosena (tunel czasoprzestrzenny)** (★★ hipoteza — matematycznie
  dopuszczalne rozwiązanie równań Einsteina, ale wymaga egzotycznej materii
  o ujemnej gęstości energii, nieznanej eksperymentalnie; NIGDY nie
  przedstawiać jako działającą technologię, tylko jako geometrię) —
  naturalne rozszerzenie Einstein Lab, reużywa `Sim3D` z Układu Słonecznego
  3D (osadzenie Fleminga: powierzchnia w 3D reprezentująca zakrzywienie 2D
  przestrzeni — klasyczna, uczciwie oznaczona wizualizacja podręcznikowa).
- ✅ **Geodezyjne równikowe Kerra w 3D** — `einstein-kerr3d.ts`, Einstein
  Lab. Dokładne równania Boyer–Lindquist (Carter 1968) w płaszczyźnie
  równikowej (θ=π/2, Q=0), przekształcone do postaci Bineta i całkowane
  RK4 (`stepKerrEquatorialGeodesic`). Zweryfikowane 20 testami: zgodność
  z geodezyjną Schwarzschilda przy a=0 co do 13 cyfry, promienie orbit
  fotonowych prograde/retrograde odtwarzają znane granice ekstremalne
  (r̂→M i r̂→4M przy a→M, Bardeen 1972/Teo 2003), krytyczny parametr
  zderzenia redukuje się dokładnie do 3√3·M Schwarzschilda przy a=0.
  Efekt wleczenia układów inercjalnych (frame-dragging) widoczny wprost:
  orbita prograde bliżej horyzontu niż retrograde, horyzont i ergosfera
  renderowane jako dokładne powierzchnie 3D (nie placeholdery). **Świadomie
  NIE zbudowane**: geodezyjne poza równikiem (precesja, stała Cartera Q≠0
  — całki eliptyczne, backlog), prawdziwe ISCO Kerra zależne od spinu
  (dysk pozostaje poglądowy), pełne soczewkowanie obrazu dysku zza
  horyzontu metodą Jamesa i in. 2015 (nadal backlog, patrz Space-Time niżej).
- ✅ **Chirp fali grawitacyjnej (dźwięk + wykres)** — `einstein-chirp.ts`,
  Einstein Lab. Formuła kwadrupolowa wiodącego rzędu (masa ćwierkowa,
  czas do połączenia, granica ISCO), dźwięk syntezowany Web Audio API z
  PRAWDZIWEJ, żywo liczonej częstotliwości fali (nie plik audio GW150914 —
  to zostaje w backlogu jako wzbogacenie). 7 nowych testów fizyki: masa
  ćwierkowa dla równych mas (relacja dokładna ℳ=m/2^0,2), odwracalność
  chirpFrequency/timeToMerger, separacja orbitalna przy ISCO = dokładnie
  6GM/c² (ten sam promień co geodezyjne Schwarzschilda).

## Cosmology

- ✅ Ekspansja Wszechświata (równanie Friedmanna) — Universe Lab (★★★★★)
- ✅ Ciemna energia (Ω_Λ), teraz też jako scenariusz „Co by było, gdyby" (★★★★)
- ✅ Śmierć/życie gwiazd — Universe Lab → `universe-starlife.ts` (★★★★★)
- ✅ Zderzenia galaktyk — Universe Lab → `universe-collision.ts` (★★★★, model N-ciał uproszczony)
- **Wielki Wybuch i inflacja kosmiczna jako oś czasu** (★★★★ model standardowy,
  ★★★ szczegóły inflacji) — interaktywna oś czasu Wszechświata (10⁻⁴³s →
  dziś) z Narratorem tłumaczącym każdą epokę; dane/skale z Planck 2018.
- ✅ **Ciemna materia — krzywa rotacji galaktyki** — `universe-rotationcurve.ts`,
  Universe Lab. Suwak masy halo (model pseudo-izotermiczny, Begeman 1989)
  vs krzywa Newtona z samej widocznej masy (dysk wykładniczy, Freeman 1970).
  BONUS ponad pierwotny zakres: przełącznik MOND (Milgrom 1983) — ta sama
  płaska krzywa bez żadnej ciemnej materii, tylko modyfikacją prawa
  grawitacji przy małych przyspieszeniach (relacja Tully'ego–Fishera,
  v∞=(GMa0)^¼). Obie strony realnego, nierozstrzygniętego sporu
  kosmologicznego pokazane uczciwie w jednym eksperymencie. 6 nowych testów
  fizyki (`physics.test.ts`): monotoniczność masy dysku, spadek Keplerowski
  bez halo, spłaszczenie z halo izotermicznym, granice MOND (słabe/silne
  pole), zbieżność do relacji Tully'ego–Fishera.
- ✅ **Napięcie Hubble'a (Hubble tension)** — `universe-hubbletension.ts`,
  Universe Lab. Trzy prawdziwe, opublikowane pomiary H₀ (SH0ES 73,04±1,04;
  Planck 67,4±0,5; TRGB 69,8±1,7) jako rozkłady normalne obok siebie,
  suwak hipotetycznej dodatkowej systematyki pokazujący na żywo, ile
  "ukrytej" niepewności rozwiązałoby spór bez nowej fizyki. 7 nowych
  testów: napięcie odtwarza publikowane ~4,9σ, symetria, gaussianPdf
  całkuje się do 1, dodanie systematyki zawsze zmniejsza napięcie.

## Nanotechnology

- **Grafen / nanorurki / fulereny 3D** (★★★★★ struktury zmierzone) —
  modele siatki heksagonalnej węgla przez `Sim3D` (analogiczne do
  cząsteczek w sekcji Biologia niżej); realne stałe sieci krystalicznej.
- **Samoorganizacja materiałów** (★★★★ zjawisko potwierdzone, model uproszczony)
  — symulacja cząstek z regułami przyciągania/odpychania układających się
  w strukturę (podobny silnik do `nuclear-chain.ts`, inny zestaw reguł).
- **Właściwości materiału ze struktury** (★★★★★) — np. dlaczego grafen
  przewodzi (struktura pasmowa uproszczona) — bardziej treść Narratora niż
  nowa symulacja.

## Chemistry (nowe laboratorium — pierwszy eksperyment zbudowany)

- ✅ **Wiązania chemiczne** — Chemistry Lab → `labs/chemistry.ts` +
  `core/physics.ts::bondPolarity`. Elektroujemność Paulinga (dane
  tabelaryczne, CRC Handbook) steruje CIĄGŁĄ wizualizacją chmury
  elektronowej od kowalencyjnej po jonową (wzór Hanney–Smitha) — nie
  przełącznikiem trzech stanów. Domyślna para Na–Cl.
- ✅ **Geometria molekularna VSEPR w 3D** — `chemistry-vsepr.ts`, Chemistry
  Lab. Model kulki-i-pałeczki (`Sim3D`), 13 standardowych geometrii AX₂
  do AX₆E₂. Geometrie bez wolnych par: dokładna geometria bryły
  (np. tetraedr 109,47°). NH₃/H₂O: kąty PRAWDZIWE zmierzone (106,8°/104,5°,
  NIST/CCCBDB), geometria dopasowana wstecz do pomiaru. 10 nowych testów:
  spójność liczby wektorów, wektory jednostkowe, dokładne kąty (tetraedr,
  oktaedr 90°/180°, NH₃, H₂O<NH₃), funkcja `bentCone` dla dowolnego kąta.
- ✅ **Krzywe miareczkowania kwas–zasada (pH)** — `chemistry-titration.ts`,
  Chemistry Lab. Krzywa liczona DOKŁADNYM równaniem bilansu ładunku
  (bisekcja, nie tylko przybliżeniem Hendersona–Hasselbalcha), 4 realne
  słabe kwasy (CRC Handbook: octowy, mrówkowy, benzoesowy, cyjanowodorowy).
  Punkt równoważnikowy oznaczony jako zasadowy (pH>7), nie pH=7 — częsty
  błąd popularnonaukowy naprawiony. 7 nowych testów fizyki: pH=pKa dokładnie
  w punkcie półrównoważnikowym, monotoniczność, zasadowość równoważnika,
  słabszy kwas → bardziej zasadowy równoważnik.
- ✅ **Trendy okresowe** (promień atomowy, energia jonizacji) — zbudowane
  w Atom Lab (`data/periodicTrends.ts`, nowa zakładka „Trendy okresowe"),
  jako mapa cieplna na reużytej siatce `.ptable` — nie osobny wykres.
  Okresy 1–4 (Z=1–36), CRC Handbook / NIST ASD / Slater (1964). 10 nowych
  testów: spójność danych, trend Z_eff wzdłuż okresu 2, trend w dół grupy 1,
  anomalie IE (gazy szlachetne > sąsiedzi).

## Biology & Molecular Science

✅ **Biology Lab — pierwsze laboratorium spoza fizyki, ZBUDOWANE**
(`labs/biology.ts` + `labs/experiments/biology-dnahelix.ts` +
`labs/experiments/biology-proteinfolding.ts`). Trzy eksperymenty:
- Baza (2D): transport błonowy — model płynnej mozaiki (Singer &
  Nicolson 1972), trzy jakościowo poprawne mechanizmy (dyfuzja prosta,
  dyfuzja wspomagana nasycalna, transport aktywny — pompa Na⁺/K⁺-ATPaza
  ze zmierzoną stechiometrią 3:2:1 ATP, Skou/Nagroda Nobla 1997).
- ✅ **DNA — podwójna helisa 3D** (struktura Watson-Crick 1953,
  parametry rzeczywiste: promień 1,0 nm, wzniesienie 0,34 nm/parę zasad,
  10,5 pary zasad/skręt, asymetria rowka większego/mniejszego z
  przesunięcia nici ~120°). Temperatura topnienia liczona regułą
  Wallace'a (1979); krzywa rozdzielania nici logistyczna wokół Tm
  (kooperatywne przejście, koncepcyjny most do modelu Isinga w
  Chemistry Lab). Sekwencje 20 par zasad (~2 skręty) — 32 pz próbowane
  najpierw, ale wyszło poza udokumentowany zakres ważności reguły
  Wallace'a, świadomie skrócone. 3 testy reguły Wallace'a w
  `physics.test.ts`.
- ✅ **Fałdowanie białka — model HP** (`core/proteinFolding.ts`, Dill
  1985; Lau & Dill 1989) — sekwencja H/P, samounikający spacer na
  siatce 2D, energia = −1 za kontakt H–H poza szkieletem (dokładny wzór
  Lau & Dill). Symulacja Monte Carlo (algorytm Metropolisa — ta sama
  metoda co model Isinga), ruchy końca łańcucha i narożnikowe,
  temperatura steruje eksploracją vs. zachłannością. Zweryfikowane
  ręcznie: konformacja typu spinki (hairpin, 6 reszt) ma dokładnie 2
  geometryczne kontakty. 8 testów: energia łańcucha prostego = 0,
  dokładna energia hairpin dla 3 sekwencji, niezmienniki samounikania/
  spójności po 5000 krokach MC, zachłanne zejście przy T→0, symulacja
  znajduje energię ujemną (prawdziwy kontakt hydrofobowy) w 20000
  krokach. honestyNote jawnie cytuje NP-trudność problemu (Crescenzi i
  in. 1998) — symulacja może utknąć w minimum lokalnym, jak prawdziwe
  błędne fałdowanie.

Backlog na przyszłość:
- **Pochodzenie życia (abiogeneza)** (★★ aktywny obszar badań, wysoka
  niepewność) — NIE symulacja „jak powstało życie" (nikt tego nie wie), ale
  uczciwy przegląd konkurencyjnych hipotez (świat RNA, kominy hydrotermalne,
  panspermia) z jasnym oznaczeniem statusu każdej.

## Mathematics (sandbox równań użytkownika) — ✅ ZBUDOWANE

✅ **Mathematics Lab, 13. laboratorium** (`labs/mathematics.tsx` +
`core/mathExpr.ts`) — bezpieczny parser wyrażeń (tokenizer → AST →
ewaluator z jawną białą listą funkcji, ZERO `eval()`/`Function()`, jak
zaplanowano). Dwa tryby:
- **Wykres, pochodna, całka**: użytkownik wpisuje f(x); różniczkowanie
  symboliczne DOKŁADNE (standardowe reguły — suma, iloczyn, iloraz,
  potęga, łańcuchowa, różniczkowanie logarytmiczne dla f(x)^g(x)),
  zweryfikowane przeciw znanym pochodnym I niezależną kontrolą różnicy
  centralnej dla 5 wyrażeń; krok po kroku (`differentiateWithSteps`)
  pokazuje zastosowane reguły. Całka oznaczona NUMERYCZNIE (metoda
  Simpsona, zweryfikowana przeciw ∫x²dx=1/3 i ∫sin(x)dx=2 na [0,π]) —
  jawnie odróżniona od dokładnej pochodnej, nie ukryta. Szukanie
  pierwiastków próbkowaniem+bisekcją.
- **Równania różniczkowe**: dy/dx=f(x,y), pole kierunkowe + rozwiązanie
  RK4 (ta sama metoda co atraktor Lorenza/problem trzech ciał/geodezyjne
  w tym Genesis OS), zweryfikowane przeciw 3 znanym rozwiązaniom
  analitycznym (e^x, e^−x, x²).
- AI Narrator: deterministyczne bloki tłumaczące każdą regułę
  różniczkowania i każdy wynik, plus integracja „Zapytaj AI" (ten sam
  `buildContext`/`askAI` co reszta platformy).
- 41 nowych testów fizyczno-matematycznych (`mathExpr.test.ts`).
  Zbudowane jako `CustomView` (jak Atom Lab) zamiast rozszerzenia
  `core/customExperiment.ts` — potrzebne pole tekstowe na wyrażenie,
  którego `ParamDef` (slider/toggle/select) nie obsługuje.
- **Współpraca wielu użytkowników nad modelem** — wymaga kont/backendu
  (patrz `ARCHITECTURE.md` „Przyszły backend"), świadomie odłożone.

## Grand Challenges

- ✅ **Problem trzech ciał** — patrz sekcja „Flagowe pomysły" wyżej,
  `universe-threebody.ts`. Zbudowany realistyczny pierwszy krok (symplektyczny
  integrator + tryb dywergencji); tysiące cząstek/GPU/zapis nadal w backlogu.
- ✅ **Stabilność układów planetarnych** — `universe-planetstability.ts`,
  Universe Lab. Prawdziwa grawitacja N-ciał (Słońce+Jowisz+Saturn+Ziemia+
  Mars, velocity-Verlet, jednostki AU/rok/M_słońca, G=4π² dokładnie) —
  NIE niezależne elipsy Keplera jak "Prawdziwy Układ Słoneczny". Toggle
  Jowisz/Saturn usuwa ich grawitację; mimośród Ziemi/Marsa liczony na
  żywo z chwilowego stanu (energia+moment pędu, zweryfikowane testem
  odwracalności) pokazuje PRAWDZIWY dryf orbitalny. Playwright
  potwierdził: dryf mimośrodu Marsa ~15× mniejszy bez gigantów niż z
  nimi po 12 latach symulacji. Świadome uproszczenie: 4 planety zamiast
  8, start w peryhelium (nie efemeryda na datę). 6 nowych testów fizyki
  (vis-viva, elementy oskulacyjne, jednostki G=4π²).
- ✅ **Chaos deterministyczny: podwójne wahadło** — `universe-doublependulum.ts`,
  Universe Lab. Dokładne równania Lagrange'a, integracja RK4 (celowo NIE
  symplektyczna — kontrast uczciwie nazwany wobec problemu trzech ciał).
  Suwak kąta startowego pokazuje przejście z ruchu regularnego (<~35°) do
  chaotycznego; tryb dywergencji (10⁻⁶ rad) jak w problemie trzech ciał.
  6 nowych testów: energia w spoczynku, zachowanie energii przy małym
  kącie, determinizm RK4, szybszy rozjazd przy dużym kącie niż małym.
- ✅ **Atraktor Lorenza** — `universe-lorenz3d.ts` (Sim3D), Universe Lab.
  Trzeci przykład chaosu deterministycznego, obok problemu trzech ciał i
  podwójnego wahadła — klasyczne równania Lorenza (1963), σ=10, β=8/3
  stałe, suwak ρ pokazuje przejście od stabilnych punktów stałych do
  chaotycznego atraktora przez dokładny próg homokliniczny
  ρ_h=σ(σ+β+3)/(σ−β−1)≈24,74 (Sparrow 1982). Ten sam tryb "dwa niemal
  identyczne starty" co w pozostałych dwóch eksperymentach chaosu — 5
  nowych testów: wartość i wewnętrzna spójność progu chaosu, symetria
  równań f(−x,−y,z)=(−f_x,−f_y,f_z), zbieganie do początku układu poniżej
  ρ=1, ograniczoność atraktora przy ρ=28, wykładniczy rozjazd dwóch
  bliskich trajektorii (efekt motyla).
- ✅ **Przejścia fazowe i łamanie symetrii — model Isinga 2D** —
  `core/isingModel.ts` + `chemistry-ising.ts`, Chemistry Lab. Jedyny
  nietrywialny model przejścia fazowego z pełnym rozwiązaniem
  analitycznym w 2D (Onsager 1944): siatka 42×42, periodyczne warunki
  brzegowe, algorytm Metropolisa. Dokładna T_c=2/ln(1+√2)≈2,269 i
  dokładna spontaniczna magnetyzacja Onsagera/Yanga poniżej T_c —
  zweryfikowane algebraicznie (sinh(2/T_c)=1 dokładnie) i 14 testami
  statystycznymi z ziarnem RNG (porządkowanie w niskiej T, rozpad
  porządku w wysokiej T, energia stanu podstawowego = −2/spin dokładnie).
  Świadomie nazwane w Narratorze zjawisko "critical slowing down" —
  głęboko poniżej T_c symulowana magnetyzacja realnie potrzebuje czasu,
  żeby dogonić wartość Onsagera (dyfuzja ścian domen), nie jest to ukryte.
- ✅ (częściowo) Ewolucja Wszechświata — Universe Lab; kosmiczna oś czasu
  (patrz Cosmology wyżej) dopełniłaby to od strony chronologicznej.

## Genesis OS 2.0 — Collaborative Science (flagowa funkcja przyszłości)

**NIE BUDOWAĆ TERAZ.** Ten rozdział to świadomie odległy punkt na mapie
drogowej, nie zadanie do podjęcia. Warunek wstępny jest twardy: Genesis OS
v1.0 musi być najpierw w pełni ukończony, dopracowany, przetestowany,
zoptymalizowany, udokumentowany i gotowy produkcyjnie na światowym
poziomie. Dopóki v1.0 nie osiągnie tej jakości, cały wysiłek inżynierski
zostaje przy dopracowywaniu, optymalizacji, stabilności, wydajności,
użyteczności, testach, dokumentacji i ogólnym doświadczeniu użytkownika —
**jakość światowej klasy jest warunkiem ekspansji platformy, nie
odwrotnie.**

Po spełnieniu tego warunku, Collaborative Science ma stać się jedną z
definiujących, flagowych funkcji Genesis OS 2.0: wielu użytkowników
wchodzi jednocześnie do tego samego laboratorium naukowego w czasie
rzeczywistym. W pokoju mogą:
- wspólnie uruchamiać symulacje,
- wspólnie zmieniać parametry,
- jednocześnie obserwować wyniki,
- budować hipotezy,
- porównywać teorie,
- zapisywać historię eksperymentu,
- odtwarzać eksperymenty,
- publikować odkrycia,
- klonować i ulepszać publiczne eksperymenty innych.

AI Mentor w tym trybie przestaje być tylko narratorem i staje się aktywnym
naukowym współpracownikiem: wyjaśnia obserwacje, wykrywa błędy, sugeruje
nowe eksperymenty, rekomenduje powiązane laboratoria, proponuje nowe
hipotezy i łączy odkrycia między różnymi dziedzinami nauki.

Możliwe rozszerzenia w dalszej przyszłości (jeszcze dalej niż sama
funkcja bazowa): współpraca głosowa, tablice naukowe (whiteboards),
równania LaTeX, tryb klasowy (classroom mode), tryb badacza (researcher
mode), publiczny marketplace eksperymentów, odkrycia społeczności,
historia wersji eksperymentu.

**Wymaganie architektoniczne na przyszłość** (obowiązuje dopiero w
momencie, gdy implementacja faktycznie się zacznie — nie projektować
szczegółowo wcześniej): fundament musi być od początku modularny,
rozproszony i cloud-native, tak żeby docelowo — bez przeprojektowywania
architektury — dało się obsłużyć tysiące jednoczesnych użytkowników i
tysiące równoległych pokoi kolaboracyjnych, synchronizację w czasie
rzeczywistym, kolaborację wspomaganą AI, trwałą historię eksperymentów,
skalowanie horyzontalne, przyszłe klienty mobilne i desktopowe, publiczne
API oraz wdrożenia enterprise, edukacyjne i badawcze — przy zachowaniu
tej samej wydajności, responsywności i jakości doświadczenia użytkownika
niezależnie od skali. Fundamentem, od którego to wszystko zależy, jest
warstwa kont i bazy danych opisana w `ARCHITECTURE.md` „Przyszły backend
— punkty rozszerzenia" — dziś świadomie nieistniejąca; warstwa
realtime/WebSocket dla współdzielonych pokoi nadbudowuje się nad nią, nie
odwrotnie.

## Creator Platform / Marketplace / Founder Mode

Wszystko poniżej wymaga kont i bazy danych — fundamentu opisanego w
`ARCHITECTURE.md` „Przyszły backend — punkty rozszerzenia", którego dziś
świadomie nie ma. Kolejność zależności, nie wybór priorytetów:

- **Publikowanie eksperymentów** — rozszerzenie `core/customExperiment.ts`
  o zdalny zapis (`{ labId, params }`, ten sam kształt co lokalnie).
- **Ocenianie/ranking** — prosta tabela `experiment_ratings` nad tym samym
  modelem danych.
- **Publikowanie własnych laboratoriów/światów** — NAJPOWAŻNIEJSZA pozycja
  na całej liście z punktu widzenia bezpieczeństwa: wymaga wykonywania
  kodu użytkownika (albo bardzo ograniczonego DSL). Świadomie nierozwiązane
  architektonicznie tutaj — wymaga osobnej analizy zagrożeń (sandboxing,
  poziom uprawnień, przegląd przed publikacją) PRZED jakąkolwiek linią kodu.
- **Marketplace z prowizją** — decyzja biznesowa (płatności, podatki,
  regulaminy) w pierwszej kolejności, architektura w drugiej.
- **Founder Mode (panel administracyjny)** — osobna rola nad kontami;
  konkretne funkcje (edycja `knowledge/*.md` bez redeployu, agregowane
  statystyki, feature flagi nad `registerLab()`) już naszkicowane w
  `ARCHITECTURE.md`.

## Premium Experience / Living Universe / Długoterminowo

- ✅ Design system v2, sceny 3D, „Co by było, gdyby?" — patrz `CHANGELOG.md`
- **Subtelna, żywa ambient-animacja tła** (gwiazdy migoczące, mgławice na
  ekranie głównym) — czysto kosmetyczne, ale tanie (rozszerzenie
  `ScaleJourney.tsx`, które już ma starfield); pilnować testu „każdy efekt
  ma pomagać zrozumieć fizykę, nie tylko ładnie wyglądać" — migoczące
  gwiazdy w tle ekranu głównego są OK jako nastrój, nie jako substytut
  prawdziwej treści.
- **VR/AR/XR** (★★★★★ technicznie osiągalne, brak dziś sprzętu do testów)
  — `Sim3D`/Three.js to WŁAŚNIWY fundament (WebXR API rozszerza
  `WebGLRenderer`, nie wymaga nowej architektury symulacji) — ale realna
  implementacja wymaga sprzętu do weryfikacji, nie tylko kodu za biurkiem.
- **AI Agents / AI Professor** — patrz `ARCHITECTURE.md` „Wizja platformy".
- **Wielu użytkowników jednocześnie / wspólne laboratoria** — patrz
  „Genesis OS 2.0 — Collaborative Science" wyżej: pełna specyfikacja
  funkcji i wymagań architektonicznych, świadomie odłożona do czasu, gdy
  v1.0 osiągnie jakość światowej klasy.
- **Integracje z publicznymi bazami danych naukowych** — `core/dataSource.ts`
  już jest dokładnie tym punktem podpięcia (patrz `scripts/fetch-real-data.mjs`
  dla JPL/Gaia/CERN); rozszerzenie na PubChem/CCCBDB (chemia) czy GWOSC
  (fale grawitacyjne) to ten sam wzorzec, nowe źródła.

---

## Jak korzystać z tego dokumentu

1. Na początku sesji poświęconej nowym funkcjom: przejrzyj tę listę,
   wybierz 1–2 pozycje o najwyższym stosunku (efekt WOW × realizm naukowy
   × ponowne użycie istniejącej architektury) / (koszt implementacji).
2. Zaimplementuj w pełni (kod + testy + Playwright + dokumentacja),
   zamiast zaczynać wiele rzeczy naraz.
3. Oznacz ✅ i przenieś szczegóły do `CHANGELOG.md`/`ARCHITECTURE.md`.
4. Dopisz nowe pomysły tutaj, gdy się pojawią — backlog ma rosnąć wolniej
   niż lista ukończonych funkcji, nie szybciej.
