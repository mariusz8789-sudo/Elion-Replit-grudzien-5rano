# Genesis — pakiet aplikacyjny: Hub71 (Abu Zabi) i Katar

Stan na 2026-09-26. Dwie rzeczy w tym dokumencie są rozdzielone i nie wolno ich mieszać:
**co jest zmierzone** (mogę to pokazać na żywo i mam odcisk wejścia) i **co jest zbudowane, ale
nieudowodnione**. Do aplikacji idzie tylko pierwsza kategoria. Druga idzie do rubryki „roadmap".

## 1. Gdzie są pieniądze — i gdzie jest 1,1 mln USD

Kwota 1,1 mln USD, o którą pytasz, **nie jest z Hub71**. To kategoria START programu
**Startup Qatar Investment Program** (Qatar Development Bank + Invest Qatar).

| Program | Kwota | Forma | Dla kogo |
|---|---|---|---|
| **Startup Qatar Investment Program — START** | **do 1,1 mln USD** | equity/inwestycja | tech-startup z PoC lub MVP, wchodzący na rynek katarski |
| Hub71 Access Programme (Abu Zabi) | AED 250 tys. gotówki (SAFE) + AED 250 tys. w usługach, +AED 250 tys. top-up dla najlepszych | SAFE + świadczenia | pre-seed do Series A, technologiczny |
| QSTP Incubation (Qatar Foundation) | program 16-tygodniowy, 3 fazy (Sprint → Incubation → Funding), bez gotówki wprost | inkubacja + dostęp do inwestorów | startup z technologią i komponentem badawczym |

Wniosek strategiczny: **Katar jest celem po pieniądze, Hub71 i QSTP są drogą po wiarygodność
i miękkie lądowanie.** Genesis pasuje do QSTP lepiej niż typowy startup, bo QSTP wprost wymaga, żeby
biznes „advance science, technology, research or innovation" — a nie tylko sprzedawał aplikację.

**Uwaga o terminie, którą musisz zweryfikować sam:** wyszukiwarka podaje dla Hub71 Cohort 20 termin
**21 sierpnia 2026** i start programu w lutym 2027. Dziś jest 26 września 2026, czyli **ten termin już
minął** — realnym celem jest kolejny nabór. Nie mogłem tego potwierdzić bezpośrednio, bo `hub71.com`
i `startupqatar.qa` są zablokowane przez politykę sieci tego środowiska. **Sprawdź daty na ich
stronach, zanim cokolwiek wyślesz.**

## 2. Czego oni wymagają — dosłownie

**Hub71, formularz + ocena.** Formularz: przegląd startupu, problem, rozwiązanie, produkt, model
biznesowy, rynek, trakcja, zespół, oraz **jak startup wesprze ambicje Hub71 i dywersyfikację
gospodarki Abu Zabi**. Pitch deck w PDF: problem, rozwiązanie, propozycja wartości, model biznesowy,
konkurencja, rynek, trakcja, zebrane środki, założyciele, plany wobec Hub71 i Abu Zabi.
Ocena w 4 rundach: przegląd aplikacji → spotkanie z zespołem Hub71 → spotkanie z partnerami →
komitet finalny. Kryteria: **zespół, rynek, trakcja, potencjał wzrostu, plany wobec Abu Zabi**.
Twardy warunek: **co najmniej jeden founder przenosi się na stałe** i buduje zespół w Abu Zabi.

**QSTP.** Wymaga: innowacyjnego pomysłu technologicznego z wykazanym potencjałem wzrostu, **co
najmniej jednego founder w pełnym zaangażowaniu**, pozostali współzałożyciele w pełnym wymiarze
z min. 20% udziałów. Trzeba wyjaśnić, **co firma rozwija, czym się różni od istniejących rozwiązań
i jak wspiera katarski ekosystem R&D**.

**Startup Qatar START.** PoC albo MVP + plan wejścia na rynek katarski. Otwarte także dla firm
zagranicznych rozszerzających działalność na Katar.

Wspólny mianownik wszystkich trzech: **trakcja, zespół, i konkretny wkład w lokalną gospodarkę.**
Dwie z tych trzech rzeczy są Twoją słabą stroną i mówię to wprost w §6.

## 3. Co Genesis ma ZMIERZONE — to jest Twoja amunicja

Poniższa tabela to **wynik uruchomienia narzędzia audytowego w repo** (`scripts/engine-readiness-report.mjs`)
w tym kontenerze, 2026-09-26, nie deklaracja. Każdy silnik „READY/PASSED" przeszedł własny przypadek
referencyjny z zapisanym odciskiem wejścia.

| Silnik | Wersja (zmierzona) | Stan | Przypadek referencyjny |
|---|---|---|---|
| RDKit | 2026.03.6 | **READY** | PASSED |
| PySCF (chemia kwantowa) | 2.14.0 | **READY** | PASSED |
| OpenMM (dynamika molekularna) | 8.6.1 | **READY** | PASSED |
| AutoDock Vina + Meeko (dokowanie) | 1.2.7 / 0.8.0 | **READY** | PASSED |
| Biopython | 1.88 | **READY** | PASSED |
| ADMET-AI (Chemprop D-MPNN) | 2.0.1 | **READY** | PASSED |
| ADMET-AI — toksyczność | 2.0.1 | **READY** | PASSED |
| AiZynthFinder (retrosynteza) | — | BLOCKED | pliki modelu (~1 GB) niedostarczone |
| PyMeep (fotonika) | — | BLOCKED | biblioteka wymaga conda-forge |

**7 z 9 silników naukowych działa i ma zdany przypadek referencyjny.**

Do tego rzeczy udowodnione osobno, w prawdziwej przeglądarce i na prawdziwych danych:

- **Redock imatinibu na 1IEP, RMSD 0,584 Å.** To jest benchmark, który rozumie każdy chemik
  obliczeniowy: poniżej 2 Å uznaje się za odtworzenie pozy krystalograficznej. Twój wynik jest
  czterokrotnie lepszy od progu. **To jest najmocniejsza pojedyncza liczba, jaką masz.**
- **CMS Open Data z CERN** — 10 000 zdarzeń Z→μμ, zweryfikowane sumą kontrolną, analizowane offline.
- **Pełny przebieg E2E w przeglądarce** (8 minut, zielony): pytanie → prerejestracja → kandydaci →
  żywe laboratorium → wynik → Evidence → Replay → protokół końcowy w trzech częściach, którego odcisk
  zgadza się z backendem po ponownym odtworzeniu.
- **Append-only, hash-chained rejestr dowodów** z wyzwalaczami na poziomie bazy.

## 4. Czym Genesis naprawdę się różni — i to jest Twoja teza inwestorska

Nie sprzedawaj „AI do odkrywania leków". Tego sprzedają setki firm i w Abu Zabi je znają.

**Sprzedawaj to: Genesis nie może skłamać o wyniku.**

Konkretnie, i to jest wbudowane w architekturę, nie w slajd:

1. **Prerejestracja.** Kryteria sukcesu są zamrażane *przed* uruchomieniem obliczeń i sprawdzane
   *po*. Nie da się dopasować kryteriów do wyniku.
2. **Etykiety epistemiczne.** Każda liczba niesie swoją klasę: REAL_ENGINE_OUTPUT, MODEL_ESTIMATE,
   REFERENCE_DATA, SIMULATED. Model nigdy nie jest pokazywany jako pomiar.
3. **Replay.** Każdy przebieg da się odtworzyć i porównać: werdykt MATCH albo DRIFT. Odcisk
   protokołu musi się zgadzać z backendem — i to jest sprawdzane testem.
4. **Bramki blokujące.** Peptyd trafia na BLOCKED_MODALITY zamiast dostać zmyślony wynik. Brak
   plików modelu daje BLOKADĘ, a nie wymyśloną trasę syntezy.

To jest produkt dla **regulatora, ministerstwa i funduszu suwerennego** — czyli dokładnie dla tych,
którzy dają pieniądze w Zatoce. Rządy nie kupują „szybszego AI". Rządy kupują **audytowalność**.

Zdanie do wyuczenia na pamięć:

> „Każda liczba, którą Genesis pokazuje, niesie swoje pochodzenie i da się ją odtworzyć. Jeśli silnik
> czegoś nie policzył, Genesis pisze, że nie policzył — zamiast zgadywać. To jest system, który da się
> postawić przed audytem."

## 5. Dopasowanie do agendy lokalnej — sekcja, którą oceniają najsurowiej

Hub71 pyta wprost o wkład w **dywersyfikację gospodarki Abu Zabi**, QSTP o wkład w **katarski
ekosystem R&D**. Nie improwizuj tego na spotkaniu. Propozycja treści:

- **Suwerenność obliczeniowa.** Genesis działa na własnej infrastrukturze, z silnikami open-source
  o zweryfikowanych licencjach. Żadne dane badawcze nie muszą opuszczać kraju. Dla państwa
  budującego własne AI to jest argument pierwszego rzędu.
- **Transfer kompetencji.** Genesis jest środowiskiem szkoleniowym: uniwersytet (KU, Khalifa,
  HBKU, Qatar University) dostaje laboratorium, w którym student przechodzi pełny cykl badawczy
  z dowodami i odtwarzalnością.
- **Zdrowie publiczne.** Pipeline lekowy z audytowalnym śladem to narzędzie dla ministerstwa zdrowia,
  nie tylko dla firmy farmaceutycznej.
- **Konkret, nie deklaracja:** zaproponuj **jeden wspólny przypadek referencyjny** z lokalną
  instytucją — cel białkowy istotny dla regionu (np. choroby metaboliczne, na które region ma jedne
  z najwyższych wskaźników na świecie), przeliczony w Genesis od pytania do protokołu.
  To zamienia rozmowę z „dajcie pieniądze" na „zróbmy razem jeden eksperyment".

## 6. Czego NIE masz — i co z tym zrobić

Mówię to teraz, żeby nie usłyszeć tego na czwartej rundzie.

| Luka | Waga | Co można zrobić przed aplikacją |
|---|---|---|
| **Brak trakcji** — brak klientów, przychodu, listu intencyjnego | **Krytyczna.** Trakcja jest jawnym kryterium oceny Hub71 | Jeden list intencyjny z uczelni lub instytutu. Nie musi być płatny. „Zgadzamy się przetestować" wystarczy, żeby rubryka nie była pusta |
| **Zespół jednoosobowy** | **Krytyczna.** Oceniają „team", QSTP wymaga współzałożycieli z min. 20% | Doradca naukowy z afiliacją akademicką z imienia i nazwiska. Albo współzałożyciel techniczny |
| **Brak walidacji zewnętrznej** | Wysoka | Redock 0,584 Å opisany jako benchmark odtwarzalny przez każdego — to jest namiastka |
| **Warstwa wizualna** | Średnia | Pokazuj **dane i dowody**, nie scenę 3D. Scena idzie do filmu dopiero po dostawie assetów |
| **Brak podmiotu prawnego w regionie** | Średnia | To jest właśnie to, co te programy finansują — nie ukrywaj, ale miej plan |
| **Retrosynteza zablokowana** | Niska | Powiedz wprost: silnik zintegrowany, czeka na pliki modelu. To brzmi lepiej niż cisza |

**Najtrudniejsze pytanie, jakie usłyszysz:** „Kto tego używa?" Jeśli odpowiedź brzmi „nikt", cała
reszta traci moc. Jeden podpisany list intencyjny zmienia tę rozmowę bardziej niż pół roku kodu.

## 7. Struktura pitch decku — 12 slajdów, dokładnie wg ich listy

Hub71 wymienia sekcje wprost; ten układ je pokrywa i nie dodaje nic zbędnego.

1. **Tytuł + jedno zdanie.** „Genesis — audytowalny system badawczy: od pytania do odtwarzalnego protokołu."
2. **Problem.** Wyniki obliczeniowe w nauce i farmacji są nieodtwarzalne i nieaudytowalne. Kryteria
   sukcesu dopasowuje się po fakcie. Regulator nie ma jak zweryfikować.
3. **Rozwiązanie.** Prerejestracja → obliczenia na prawdziwych silnikach → Evidence → Replay → protokół.
4. **Demo / produkt.** Zrzuty z prawdziwego przebiegu, nie rendery. Protokół A/B/C z odciskiem.
5. **Dowód, że to działa.** Tabela z §3 + redock 0,584 Å. **To jest najważniejszy slajd w decku.**
6. **Co nas wyróżnia.** Cztery mechanizmy z §4. Jedna kolumna: „inni", druga: „Genesis".
7. **Rynek.** Farmacja obliczeniowa + sektor publiczny + uczelnie. Podaj źródło każdej liczby albo jej nie podawaj.
8. **Model biznesowy.** Licencja instytucjonalna, wdrożenie on-premise, kontrakt R&D z sektorem publicznym.
9. **Trakcja i roadmapa.** Uczciwie: co działa, co jest w toku, co zablokowane i czym.
10. **Zespół.** Ty + doradcy. Jeśli szukasz współzałożyciela — napisz to. Oni to szanują.
11. **Plan wobec Abu Zabi / Kataru.** Sekcja z §5. Relokacja, partner lokalny, wspólny przypadek referencyjny.
12. **Prośba.** Konkretna kwota, na co konkretnie, na ile miesięcy.

## 8. Przygotowane odpowiedzi na trudne pytania

**„Czym to się różni od Schrödingera / AlphaFold / Iktos?"**
> Oni liczą lepiej w wąskich domenach i nie zamierzam z nimi konkurować na jakości solvera. Genesis
> używa tych samych otwartych silników, co reszta świata. Różnica jest w warstwie dowodowej:
> zamrożone kryteria przed obliczeniem, klasa epistemiczna przy każdej liczbie, i odtworzenie
> przebiegu z werdyktem zgodności. To jest warstwa, której tamte narzędzia nie mają, bo nie były
> budowane pod audyt.

**„To tylko opakowanie na open source."**
> Silniki są otwarte i mówię to wprost — to jest zaleta, bo są weryfikowalne przez trzecią stronę.
> Wartość jest w tym, czego nie ma w żadnym z nich: kanoniczny stan eksperymentu, łańcuch dowodowy
> z hashem, prerejestracja i odtwarzanie. Zintegrowanie dziewięciu silników tak, żeby jeden przebieg
> dał odtwarzalny protokół, zajęło więcej niż napisanie któregokolwiek z nich od nowa.

**„Kto to kupi?"**
> Pierwszy klient to nie firma farmaceutyczna, tylko instytucja, która musi się wytłumaczyć z wyniku:
> agencja rządowa, uczelnia, regulator. Dlatego zaczynam od sektora publicznego w regionie, gdzie
> audytowalność jest wymogiem, a nie luksusem.

**„Ile masz przychodu?"**
> Zero. Jestem przed pierwszym wdrożeniem i dlatego tu jestem. To, co mam, to działający system
> z siedmioma zweryfikowanymi silnikami i odtwarzalnym przebiegiem end-to-end. Szukam pierwszego
> wdrożenia, nie kapitału na budowę produktu od zera.

**„Dlaczego Abu Zabi / Katar?"**
> Bo audytowalna nauka jest tu potrzebna wcześniej niż gdzie indziej: budujecie własne zdolności
> badawcze i AI od podstaw, więc możecie od razu postawić je na systemie, który zapisuje dowody —
> zamiast dokładać audyt do czegoś, co go nie przewidywało.

## 9. Czego pod żadnym pozorem nie wolno powiedzieć

To nie jest ostrożność — to jest ochrona przed jedynym błędem, którego nie da się cofnąć. Ci ludzie
mają doradców naukowych i sprawdzą.

- **Nie mów, że Genesis „odkrył lek".** Nie odkrył. Genesis policzył kandydatów i zapisał dowody.
- **Nie mów o „zamienniku Mounjaro".** Tirzepatyd jest peptydem, Genesis go świadomie blokuje jako
  BLOCKED_MODALITY. Opowieść o doustnym agoniście GLP-1R jest legalna, ale wymaga struktury
  receptora, której jeszcze nie ma w repo.
- **Nie mów, że retrosynteza działa.** Jest zintegrowana i zablokowana brakiem plików modelu.
- **Nie pokazuj renderów jako zrzutów z produktu.** Jeśli pokazujesz render — podpisz go jako render.
- **Nie podawaj liczby rynku bez źródła.** Jedno niepodparte „rynek wart X miliardów" kosztuje
  wiarygodność całej reszty.

Każda z tych rzeczy da się opowiedzieć uczciwie i nadal robi wrażenie. Wersja przesadzona wygląda
lepiej przez dziesięć minut i przegrywa w rundzie trzeciej, gdy rozmawiasz z kimś z doktoratem.

## 10. Co zrobić w tej kolejności

1. **Zweryfikuj terminy naborów** na hub71.com, qstp.qa i startupqatar.qa — nie mogłem ich dosięgnąć.
2. **Zdobądź jeden list intencyjny.** Uczelnia, instytut, ktokolwiek. To jest pojedyncza rzecz
   o największym wpływie na wynik aplikacji.
3. **Zbuduj deck wg §7**, ze slajdem 5 jako centrum ciężkości.
4. Dostarcz pliki AiZynthFinder → odblokowana retrosynteza → slajd 9 wygląda lepiej.
5. Dostarcz assety graficzne → film demo (dopiero wtedy ma sens).
6. Aplikuj: **QSTP i Startup Qatar równolegle** (Katar = pieniądze), Hub71 w kolejnym naborze.

---

**Źródła** (dostęp 2026-09-26; stron Hub71, Startup Qatar i QSTP nie dało się pobrać bezpośrednio —
polityka sieci tego środowiska je blokuje, więc poniższe pochodzą z wyszukiwarki i **wymagają
potwierdzenia u źródła przed wysłaniem aplikacji**):

- Hub71 Access Programme — https://www.hub71.com/program/access-programme
- Hub71 FAQ — https://www.hub71.com/faqs
- Startup Qatar Investment Program (QDB) — https://www.qdb.qa/Financing-And-Funding/Equity-And-Investment/Startup-Qatar-Investment-Program
- Startup Qatar — https://startupqatar.qa/en/investment-program
- QSTP Incubation, nabór Fall 2026 — https://qstp.qa/qstp-launches-revamped-incubation-program-with-fall-2026-cohort/
- QSTP Programs — https://qstp.qa/programs/
