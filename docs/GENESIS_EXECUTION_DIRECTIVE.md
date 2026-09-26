# Genesis — dyrektywa wykonawcza (rozkaz na teraz)

`docs/GENESIS_CONSTITUTION.md` jest konstytucją i długoterminowym źródłem prawdy. **Ten dokument to
jedyny obowiązujący rozkaz operacyjny** — zastępuje wcześniejsze dodatki, nie konstytucję. Nie
tworzymy drugiej konstytucji ani konkurencyjnej architektury i nie powielamy starych promptów
w nowych plikach.

Przyjęte 2026-09-25, scalone i rozszerzone 2026-09-26. Zmiana wymaga decyzji właściciela.

**Rozdział, który obowiązuje w całym dokumencie:** *wymaganie właściciela* ≠ *stan potwierdzony
w kodzie i testach*. Sekcje 1–20 to wymagania. Sekcja 21 to jedyna lista stanu — z dowodem albo
z jawnym brakiem dowodu.

---

## Cel nadrzędny

Jeden kompletny, wiarygodny naukowo przepływ, który można pokazać inwestorowi, grantodawcy lub
partnerowi i powiedzieć:

> „Genesis przyjął pytanie, zarejestrował hipotezę, wykonał prawdziwe obliczenia, pokazał eksperyment
> na żywo, zachował dowody, sfalsyfikował hipotezę, ponownie uruchomił silnik i odtworzył wynik."

**Warunek odbioru:** użytkownik widzi eksperyment, rozumie swoje działania, obserwuje ich wynik,
dostaje uczciwy protokół i może sprawdzić oraz odtworzyć to, co Genesis rzeczywiście wykonał.

---

## 1. Eksperyment jest interfejsem

Laboratorium jest **podstawowym** interfejsem; dashboard, logi i tabele są warstwą pomocniczą.

Nie wystarcza: `spinner → licznik → tabela → przycisk Replay`.
Nie wystarcza też: `naukowiec stoi nieruchomo → obok stoją fiolki → zmienia się napis`.

## 2. Co znaczy „na żywo"

Scena pokazuje **czynności i obserwacje**, zależnie od rzeczywistego protokołu: przygotowanie
stanowiska, wybór oznaczonej próbki, uchwycenie fiolki lub narzędzia, przeniesienie, umieszczenie
w urządzeniu, ustawienie obsługiwanych parametrów, pracę urządzenia, obserwację, odczyt, przejście do
kolejnego etapu, porównanie, protokół i dowody.

Przy doświadczeniu **obliczeniowym** pokazujemy prawdziwą pracę komputerowego stanowiska badawczego —
docking nie jest reakcją w probówce. Fiolki reprezentujące kandydatów obliczeniowych są oznaczone jako
**reprezentacje wirtualne**; nie sugerujemy, że związek wytworzono. Procedury fizyczne wolno pokazywać
wyłącznie jako jawnie oznaczone **SIMULATED LAB STEP**, nigdy z przypisanym pomiarem.

## 3. Kamera

Kamera ma pozwolić zrozumieć eksperyment bez czytania logu: stanowisko i ręce → próbka i urządzenie →
elementy sterujące → pracująca aparatura → miejsce obserwowanej zmiany → preparat i widok mikroskopowy
(tylko gdy uzasadniony) → struktura i rzeczywista poza obliczeniowa → wynik na właściwym przyrządzie →
porównanie → zakończenie z ograniczeniami i dowodami.

Użytkownik może wyłączyć kamerę automatyczną, sam oglądać scenę, ograniczyć ruch i pominąć powtarzalne
animacje. Zatrzymanie prezentacji **nie** zatrzymuje backendu — to musi być widoczne.

## 4. Próbki, mikroskop, biologia

Każdy obiekt reprezentujący próbkę/kandydata ma identyfikator, etap, pochodzenie i dostępne wyniki.
Obraz spod mikroskopu pochodzi z konkretnego materiału referencyjnego, podłączonego urządzenia albo
jawnego modelu — nigdy z generowania „na oko". Powiększenie nie tworzy nowych szczegółów pomiarowych;
przy zmianie skali mówimy, czy to ten sam materiał, inny zbiór, rekonstrukcja czy symulacja.
„1:1" oznacza cel wierności w określonym zakresie, nie deklarację pełnej zgodności biologicznej.

## 5. Jeden stan naukowy, wiele sposobów obserwacji

`silnik/model/pomiar → zapisane zdarzenia → kanoniczny stan → prezentacja → wynik, Evidence, Memory,
Replay`. Drugiego solvera dla animacji nie ma.

**Dozwolony jest lokalny stan prezentacji** (pozycja kamery, ruch ręki, otwarcie urządzenia,
interpolacja) — nie wolno mu zmieniać wyników, statusów kandydatów ani dowodów. Brak drugiego stanu
naukowego **nie** oznacza zakazu animacji. Nie tworzymy pozornej trajektorii cząsteczki, gdy silnik
zwrócił tylko wynik końcowy.

## 6. Trzy zegary: rzeczywisty, symulacji, filmu

Pokazujemy rzeczywisty stan etapu; nie wymyślamy procentu z upływu czasu. Gdy silnik nie udostępnia
postępu — „obliczanie, brak szczegółowego postępu". Etapu nie spowalniamy dla efektu. Film może
przyspieszać, ale musi to komunikować.

## 7. Kandydaci: widoczna praca, nie wyreżyserowany zwycięzca

Każdy analizowany kandydat jest identyfikowalny w laboratorium. Przejście kolejka → analiza → etapy →
finaliści/odrzuceni wynika z danych przebiegu. **Nie ma sztywnego „100 → 20 → 2"**, nie wymuszamy
dwóch finalistów ani jednego zwycięzcy. Poprawnym wynikiem bywa brak kandydata, kilku
nieporównywalnych finalistów, wynik nierozstrzygnięty albo brak danych. Test sześciu kandydatów nie
dowodzi obsługi stu.

## 8. Interakcja: parametry, które model naprawdę obsługuje

Każda kontrolka ma znaczenie, jednostkę, zakres, walidację i udokumentowane przełożenie na wejście
modelu. Żadnych suwaków objętości dla obliczeń, które objętości nie używają. Zmiana zatwierdzonych
warunków tworzy **nowy wariant** z odniesieniem do rodzica i nową rejestracją; historii wariantu
pierwotnego nie przepisujemy.

## 9. Zakończenie: konkretny protokół

Artefakt powstaje z zapisanych danych serwera, nie z narracji modelu językowego. Rozdzielamy:

- **A. Protokół obliczeniowy** — co wykonano i jak to powtórzyć.
- **B. Proponowana trasa syntezy** — wyłącznie wynik uruchomionego silnika retrosyntezy.
- **C. Protokół doświadczenia fizycznego** — osobny zakres, którego **nie wolno dopowiadać** z trasy.

Brakujący etap zostaje jawnie brakujący.

## 10. Domknięcie bieżącej pracy i blokada modeli

Odróżniamy **„adapter zintegrowany"** od **„model dostępny i wykonany"**. Brak plików modelu jest
rzeczywistą blokadą uruchomienia; test poprawnej obsługi blokady **nie jest** testem wyznaczenia trasy.
Lista potrzebnych plików (nazwa, źródło, wersja, licencja, rozmiar, suma kontrolna, miejsce instalacji)
jest w `docs/GENESIS_REQUIRED_RESOURCES.md`. Nie obchodzimy ograniczeń sieci ani licencji.

## 11. Tryb szkolny: nauka przez działanie

Pętla: pytanie → własne przewidywanie → działanie → obserwacja → porównanie → wyjaśnienie → kolejna
próba. Poziomy SZKOŁA / STUDIA / BADANIA różnią się językiem, szczegółowością, zakresem kontrolek
i uprawnieniami — **nie prawdą o wyniku**. Bez drugiego silnika „dla szkoły". Nagradzamy trafną
obserwację i rozpoznanie niepewności, nie „pozytywny wynik". Tryb ucznia: bez sterowania sprzętem,
zakupów, wykonywania kodu i procedur niebezpiecznych; minimum danych osobowych. Założenia „dzieciom się
spodoba" nie uznajemy za dowiedzione — potrzebny pilotaż z nauczycielem.

## 12. Wygląd i praca Astry

Najpierw audyt tego, co Astra faktycznie zrobiła (`docs/ASTRA_VISUAL_AUDIT.md`), potem użycie tego.
Poprawiamy realne braki: chwyt fiolki, kontakt dłoni z przedmiotem, ustawienie aparatury, czytelność
próbki, materiały, kadrowanie — **nie korektę jasności**. Licencję sprawdzamy per plik, nie per
repozytorium. Jakość dobieramy do **zmierzonej** wydajności; liczby klatek bez pomiaru nie obiecujemy.
Wierności nie porównujemy ze zdjęciami referencyjnymi, których nie mamy w danej sesji — wtedy prosimy
o materiał.

## 13. Trzy niezależne bramki odbioru

| Bramka | Co dowodzi | Czym NIE jest |
|---|---|---|
| **A — naukowo-techniczna** | prawdziwe wykonanie silników, wejścia, trwała rejestracja, werdykt serwera, protokół, Evidence, odtworzenie, obsługa błędów | dowodem, że cokolwiek widać |
| **B — żywe laboratorium** | widoczne czynności, próbki, stanowiska, obserwacje, kamery, powiązanie z konkretnym przebiegiem | dowodem jakości nagrania |
| **C — materiał pokazowy** | nagranie rzeczywistej aplikacji z pełną historią eksperymentu | zamiennikiem A i B |

**Zaliczenie A nie oznacza zaliczenia B ani C.** `data-bench-samples` i zgodność hashy są kontrolami
pomocniczymi — nie dowodzą, że widać ręce, fiolki, pracę urządzenia i poprawny kadr.

## 14. Poprawność testów, Replay i statusów

Build i testy kończą się błędem, gdy wcześniejszy krok zawiódł; filtrowanie logu nie może maskować kodu
wyjścia. Przed E2E potwierdzamy, **jaka wersja frontendu i backendu naprawdę działa**. Asercji nie
osłabiamy dla zielonego wyniku. Rozdzielamy: powtórkę zapisanych zdarzeń / ponowne wykonanie
konkretnego silnika / ponowne wykonanie całego potoku — powtórki samej Viny nie nazywamy powtórką
wszystkich silników. Kryteria zgodności i tolerancje ustalamy **przed** testem. Testujemy też: brak
silnika lub wag, błąd wykonania, odświeżenie, restart serwera, brak finalistów, hipotezę
nierozstrzygniętą, próbę zmiany prerejestracji, niezgodność wyniku i dowodów.

## 15–17. CodeGen, sandbox, filmy (dopiero po domknięciu laboratorium)

Pętla docelowa: `cel → plan → graf zadań → sprawdzenie zdolności → UŻYJ PONOWNIE → DOSTOSUJ →
WYGENERUJ (ostateczność) → testy → zatwierdzone wykonanie → wizualizacja/film → Evidence → Replay`.
Pierwsze generowane narzędzie to **mały adapter analizy lub prezentacji istniejących wyników**, nie
solver. Wygenerowany kod jest niezaufany: izolacja z limitami czasu, pamięci, CPU i dysku, bez
sekretów, zapisu do rdzenia, nieograniczonej sieci, uprawnień administracyjnych i sterowania
urządzeniami. Sam osobny proces **nie jest** dowodem izolacji. Kod nie może zmieniać własnych reguł
bezpieczeństwa, konstytucji ani historycznych dowodów. Kompilacja nie oznacza wiarygodności naukowej.
Film powstaje z tej samej osi eksperymentu; render offline oznaczamy jako render offline.

## 18. Podział pracy

Claude odpowiada za plan integracji i ochronę architektury; nie musi pisać każdej linii. Przed
delegacją: cel, bazowy commit, dozwolone i zabronione pliki, kontrakt we/wy, zależności, kryteria
odbioru, testy, ograniczenia architektury, sposób integracji. Wykonawcy pracują w osobnych gałęziach
lub worktree. **Jeżeli nie ma technicznej możliwości wywołania wykonawcy — przygotowujemy pakiet
zadania dla właściciela i nie piszemy „oddelegowałem".** Szczegóły: `docs/GENESIS_DELEGATION_MATRIX.md`.

## 19. Przyszłość

Kierunek: wiedza → hipotezy → projekt eksperymentu → wykonanie cyfrowe → obserwacja → falsyfikacja →
pamięć → następny eksperyment. Autonomia rośnie w granicach uprawnień, budżetu i warunków zatrzymania;
**brak rozwiązania jest dopuszczalnym wynikiem**. HPC/GPU/QPU i aparaturę podłączamy przez istniejące
interfejsy, bez zmiany źródła prawdy; przewagi kwantowej nie obiecujemy bez porównania z metodą
klasyczną. Nie przedstawiamy Genesis jako świadomości, wszechwiedzy ani AGI.

## 20. Kolejność prac (obowiązkowa)

Kolejność ustalona przez właściciela (2026-09-26) i obowiązująca do odwołania:

1. Domknięcie E2E **na aktualnym buildzie** — z podaniem, jakiej wersji kodu dotyczy wynik.
2. **Żywe laboratorium:** ręce, fiolki, próbki, właściwa aparatura, obserwacja, wynik (bramka B).
3. Końcowy protokół + Replay + Evidence.
4. Retrosynteza — **po dostarczeniu plików modelu** (blokada D-1), nie wcześniej.
5. Film / demo.
6. CodeGen, Task Graph, autonomiczne tworzenie narzędzi (po laboratorium, w piaskownicy).
7. Pozostałe rozszerzenia (tryb szkolny, jakość obrazu, kolejne światy).
8. **Pełne PL/EN/AR + RTL — na samym końcu**, jako zadanie po demie.

Punkt 8 jest wyraźnie zdjęty z bieżącego sprintu: nie robimy teraz portu i18n ani RTL, nie wydajemy na
tłumaczenia czasu ani kredytów. Stan i znane źródła zapisane są w §22, żeby dało się do tego wrócić bez
powtarzania śledztwa. Naprawa potwierdzonych regresji nie ma numeru — wchodzi przed wszystkim innym,
kiedy się pojawi.

Nie rozszerzamy prac na kolejne światy, żeby ominąć niedokończone laboratorium. Gałąź, HEAD i zakres
zmian podajemy z wyniku poleceń, nie z pamięci. **Push, merge do main, force-push i przepisywanie
historii — wyłącznie po jednoznacznym „wypchnij".**

---

## 21. Stan potwierdzony (jedyna lista prawdy o wykonaniu)

Legenda: **DOWÓD** = potwierdzone uruchomionym testem/pomiarem · **BRAK DOWODU** = zbudowane, ale
nieudowodnione w wymagany sposób · **BLOKADA** = nie da się wykonać w tym środowisku.

| Wymaganie | Status | Dowód / czego brakuje |
|---|---|---|
| Docking do prawdziwego białka | DOWÓD | PDB 1IEP łańcuch A; redock imatynibu RMSD 0,584 Å; przebieg akceptacyjny: −12,834 kcal/mol, pudełko [15.19, 53.903, 16.917]/20³ Å, ziarno 42 |
| Powtórka **silnika** (nie projekcji) | DOWÓD (zakres: Vina) | `science_run_verifications`: MATCH, hashe identyczne. **Nie jest** powtórką wszystkich silników — ADMET/QM/RDKit nie były powtarzane w tym przebiegu |
| MATCH / DRIFT / BLOCKED | DOWÓD | `campaign/verify.mjs`, tolerancje ustalone przed testem, w tym 0 dla dockingu |
| Prerejestracja po stronie serwera | DOWÓD | rekord seq 1, odcisk `43fa8a30`, serwer odmawia rejestracji po starcie kampanii |
| Werdykt wyprowadzony przez serwer | DOWÓD | WEAKENED (hERG 0,98 NOT_MET) — serwer wyprowadził go sam, `verdictCheck MATCH` |
| Trwała Pamięć Naukowa | DOWÓD częściowy | rekordy w bazie, łańcuch hashy, triggery odmawiają UPDATE/DELETE. **Brak dowodu** dla: restart backendu, ponowne wejście, uprawnienia odczytu |
| Końcowy protokół | DOWÓD | `GET …/protocol`, 10/10 testów; w przebiegu akceptacyjnym pełny zestaw pól |
| Kandydaci widoczni jako rzędy leja | DOWÓD | każdy kandydat stoi w rzędzie etapu, który osiągnął; suma stref = liczba kandydatów; finaliści z **zmierzonym** wynikiem; powody odrzucenia widoczne |
| Pełny E2E akceptacyjny (potok obliczeniowy **i** widoczny przebieg) | DOWÓD | `liveDrugBench.e2e.spec.ts`, 1 passed, 8,0 min, exit 0, build z commita `44a91b32`; „states seen: 5, states rendered by the scene: 5"; 3 rekordy: prerejestracja `43fa8a30` + 2 sesje (`preregCheck MATCH`, `verdictCheck MATCH`, serwerowy werdykt WEAKENED), druga z `engineReplay MATCH 065e53317e731f7d → 065e53317e731f7d`; 6 kandydatów (1 zachowany, 5 odrzuconych z zapisanymi powodami: `constraint:mw-max` ×3, `constraint:mw-max,logp-range-hi` ×2) |
| Retrosynteza | BLOKADA | adapter zintegrowany i zarejestrowany; **pliki modelu nieosiągalne** (zenodo/figshare zablokowane). Przypadek referencyjny **nie został wykonany** |
| Języki: polski / angielski / arabski | ZAPARKOWANE | decyzja właściciela z 2026-09-26: ostatnie w kolejności (§20 pkt 8). Stan zmierzony i źródła: §22.1. Nie realizujemy teraz |
| Tryb szkolny | BRAK | niezaimplementowany |
| Widoczne czynności laboratoryjne (bramka B) | DOWÓD | w przeglądarce scena wykonała `REACH → GRIP → CARRY → PLACE → OPERATE`; naukowiec obecny; fiolka podpięta do punktu chwytu (zmierzona odległość ≤ 20 mm w wyrenderowanej scenie); praca przy analizatorze **i** stanowisku dokowania; każda próbka z tożsamością molekularną; gest oznaczony `SYMULOWANY KROK LABORATORYJNY` + etykieta reprezentowanego etapu. Testy: `benchHandling.test.ts` (8), `drugBenchHands.test.ts` (7, prawdziwa scena three.js, w tym reguła „180 s pętli renderu nie domyka etapu") |
| Protokół końcowy widoczny w laboratorium | DOWÓD | sekcja `drug-protocol` z trzema częściami (A obliczeniowa / B droga syntezy / C walidacja fizyczna, każdy krok `NOT_EXECUTED` + `NOT_CONNECTED`); odcisk zgodny z artefaktem backendu **po** powtórce silnika (test odpytuje aż do zgodności) |
| Obserwacja oznaczona uczciwie | DOWÓD | tabliczka w scenie nad kieszenią: „MODEL OBLICZENIOWY · poza z AutoDock Vina · to NIE jest obraz z mikroskopu"; żadna stacja nie udaje mikroskopu |
| Materiał pokazowy (bramka C) | BRAK | nie nagrany |
| Jakość obrazu jak na screenach właściciela | BRAK | scena ma światło kluczowe z cieniami, praktyczne lampy, smugi i pył, tone mapping oraz przebiegi Bloom/GTAO/Bokeh/SSR/SMAA, ale materiały są **proceduralne**: brak IBL/HDRI w tej scenie, brak map PBR (blokada D-2), postać to rig proceduralny, nie model ze skinningiem |

## 22. Zaległości zapisane, żeby nie zginęły

- **Symulacje jako film, nie wykres.** Most Einsteina–Rosena: 3D, filmowo, **żadnego 2D ani „gumowej
  płachty" z suwakami**; zderzenia materii wiernie.
- Drugi benchmark receptor–ligand jako osobny przepływ opioidowy (5C1M/8EF5 zwendorowane, zaparkowane;
  **nigdy do ketaminy** — konstytucja §11).
- Human Atlas (BodyParts3D), jakość obrazu laboratorium, prosty język w świecie, CERN jako drugi świat
  (`zdarzenie → detektor → rekonstrukcja → analiza → Evidence`, tory opisane jako rekonstrukcja).

### 22.1. PL / EN / AR + RTL — zadanie po demie (ostatnie w kolejności, §20 pkt 8)

Decyzja właściciela z 2026-09-26: **nie ruszamy teraz i18n ani RTL.** Poniżej stan zmierzony
(`git show`, `grep` — nie z pamięci), żeby powrót nie wymagał powtarzania śledztwa.

**Co jest w HEAD (`packages/frontend/src/core/i18n.ts`, 110 linii):** działający seam — `t()` z
fallbackiem na `pl`, `setLocale`/`subscribeLocale`, `Locale = 'pl' | 'en' | 'es' | 'ar'`,
`LOCALE_DIRECTION` z `ar: 'rtl'`, `LOCALE_NATIVE_NAME`, `setLocale` ustawia
`document.documentElement.dir`/`lang`. Słowniki obejmują **tylko** wokabularz Human Explorer +
Evidence (pl ma dodatkowo `nav.*` i `skipLink`); `en` = wyłącznie `EXPLORER_EN`. Seam używany w 6
plikach (`App.tsx`, `main.tsx`, `HumanExplorerPanel.tsx` + testy). **W `styles.css` zero reguł
`[dir=…]`/RTL** — kierunek dokumentu się przełączy, ale layout nie jest na to przygotowany.

**Skąd wziąć szerszy słownik:** `5e5c15fa` (linia `origin/genesis/main`) ma
`core/locales/en.ts` (140 linii, ~109 kluczy), `core/locales/pl.ts` (144 linie, ~117 kluczy),
`components/product/LanguageSwitcher.tsx`, własny `core/i18n.ts` (90 linii, `Locale = 'pl' | 'en'`,
`Intl.PluralRules`) i `__tests__/i18n.test.ts`. **Arabskiego tam nie ma.** Punkt rozejścia z HEAD:
`868c01aa` (2026-07-14) — port jest przeniesieniem przez dywergencję, nie `git checkout`.

**Realny zakres, gdy wrócimy:** (1) scalić dwa seamy w jeden kanoniczny (dziś HEAD ma nowszy typ
`Locale` i RTL, gałąź ma większy słownik i plurals) — bez drugiego systemu tłumaczeń; (2) jeden
selektor języka; (3) CSS dla `[dir="rtl"]` (lustrzane marginesy/paddingi, kolejność flex, ikony
kierunkowe); (4) tłumaczenie tekstów laboratorium i protokołu — praca terminologiczna, nie
generowanie; (5) reguła twarda: **identyfikatory, hashe, jednostki, SMILES i etykiety epistemiczne
nigdy nie są tłumaczone**, a brak klucza musi być widoczny (dziś `t()` zwraca sam klucz — dobrze).
