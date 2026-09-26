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

1. Zakończ aktualny E2E **na aktualnym buildzie** i podaj, jakiej wersji dotyczy.
2. Napraw potwierdzone regresje; podaj rzeczywisty zakres PASS.
3. Domknij **widoczne czynności laboratorium** i końcowy protokół.
4. Zgłoś precyzyjnie blokadę modeli retrosyntezy i wymagane zasoby.
5. Pokaż jeden pełny przebieg spełniający bramkę A **oraz** bramkę B.
6. Rozwiń tryb szkolny na tym samym fundamencie.
7. Dopiero potem CodeGen i automatyczne filmy.

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
| Kandydaci widoczni jako rzędy leja | BRAK DOWODU dla bramki B | `data-bench-samples` = liczba kandydatów (kontrola pomocnicza). **Nie dowodzi** widocznych rąk, chwytu fiolki, pracy aparatury ani kadru |
| Retrosynteza | BLOKADA | adapter zintegrowany i zarejestrowany; **pliki modelu nieosiągalne** (zenodo/figshare zablokowane). Przypadek referencyjny **nie został wykonany** |
| Języki: polski / angielski / arabski | BRAK | wymaganie właściciela z 2026-09-26; stan ustalany |
| Tryb szkolny | BRAK | niezaimplementowany |
| Widoczne czynności laboratoryjne (bramka B) | BRAK | ręce, chwyt fiolki, transfer, praca mikroskopu — niezrealizowane |
| Materiał pokazowy (bramka C) | BRAK | nie nagrany |

## 22. Zaległości zapisane, żeby nie zginęły

- **Symulacje jako film, nie wykres.** Most Einsteina–Rosena: 3D, filmowo, **żadnego 2D ani „gumowej
  płachty" z suwakami**; zderzenia materii wiernie.
- Drugi benchmark receptor–ligand jako osobny przepływ opioidowy (5C1M/8EF5 zwendorowane, zaparkowane;
  **nigdy do ketaminy** — konstytucja §11).
- Human Atlas (BodyParts3D), jakość obrazu laboratorium, prosty język w świecie, CERN jako drugi świat
  (`zdarzenie → detektor → rekonstrukcja → analiza → Evidence`, tory opisane jako rekonstrukcja).
