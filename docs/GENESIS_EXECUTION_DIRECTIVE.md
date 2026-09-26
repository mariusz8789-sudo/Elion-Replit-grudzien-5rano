# Genesis — dyrektywa wykonawcza (rozkaz na teraz)

`docs/GENESIS_CONSTITUTION.md` jest konstytucją i długoterminowym źródłem prawdy: wizja na lata.
**Ten dokument to rozkaz operacyjny na teraz.** Konstytucji nie reinterpretujemy i nie budujemy
konkurencyjnej architektury; nie próbujemy też budować całej przyszłej wizji jednocześnie.

Przyjęte 2026-09-26. Zmiana wymaga decyzji właściciela.

## Cel nadrzędny

Doprowadzić Genesis do stanu, w którym można pokazać inwestorowi, grantodawcy lub partnerowi **jeden
kompletny, wiarygodny naukowo workflow** i powiedzieć:

> „Genesis przyjął pytanie, zarejestrował hipotezę, wykonał prawdziwe obliczenia, pokazał eksperyment na
> żywo, zachował dowody, sfalsyfikował hipotezę, ponownie uruchomił silnik i odtworzył wynik."

## Kolejność prac (obowiązkowa)

1. **DOMKNIJ FAZĘ 1** — prawdziwy docking do białka; **powtórka prawdziwego silnika**, nie tylko
   projekcji; MATCH / DRIFT / BLOCKED; **trwała Pamięć Naukowa po odświeżeniu i restarcie**;
   rejestracja kryteriów **po stronie serwera, z odciskiem zapisanym przed wykonaniem**;
   dowody i pochodzenie; deterministyczny werdykt; pełny E2E:
   `Science Chat → rejestracja → żywy eksperyment → prawdziwy silnik → żywe 3D → wynik → Dowody →
   falsyfikacja → powtórka silnika → MATCH → trwała Pamięć → następny eksperyment`.
2. **ŻYWE LABORATORIUM** — proceduralnie jak prawdziwa praca laboratoryjna. Nie „spinner → tabela →
   wynik", ale `PREPARE → LOAD → CONFIGURE → EXECUTE → OBSERVE → MEASURE → INTERPRET → EVIDENCE →
   REPLAY`. Naukowiec, aparatura, stanowiska i kamera czytają **ten sam** kanoniczny stan eksperymentu.
   Etap, który jest tylko komputerową reprezentacją pracy wet-lab, nosi etykietę **SIMULATED LAB STEP** —
   nigdy nie udajemy pomiaru fizycznego.
3. **OKRĘT FLAGOWY: ODKRYWANIE LEKÓW** — prawdziwe białko; realne RDKit / Meeko / Vina / ADMET / PySCF
   tam, gdzie są właściwe; prawdziwa cząsteczka i prawdziwa poza dokowania; generowanie i porównywanie
   kandydatów; **odrzucanie według prerejestrowanych kryteriów**; jawny rozdział
   `REAL_ENGINE_OUTPUT / MODEL_ESTIMATE / REFERENCE_DATA / SIMULATED / UNRESOLVED`; wskazanie
   obliczeniowo obiecującego kandydata — **nigdy** deklaracja „bezpieczniejszego leku" bez walidacji
   w mokrym laboratorium.
4. **PORTFOLIO / FILM** — dopiero po technicznym domknięciu jednego workflow. Wejście do Genesis,
   Science Chat, hipoteza i plan, wejście do laboratorium, eksperyment na żywo, cząsteczka, receptor
   i docking, ADMET/QM, decyzja o kandydacie, Dowody, Replay MATCH, następny eksperyment, Human
   Biology, CERN jako drugi przykład. **Runtime i render offline muszą być jawnie rozróżnione.**
5. **ASTRA / JAKOŚĆ WIZUALNA** — najpierw **audyt tego, co Astra faktycznie zrobiła**, potem użycie
   tego. Jej warstwa poprawia HDRI/otoczenie, PBR, metal, szkło, beton, podłogi, aparaturę, światło,
   inscenizację naukowca, kamery, przejścia, kompozycję. **Astra nie ma własnego stanu eksperymentu,
   własnego świata ani drugiego renderera.**
6. **CERN** — wierny naukowo digital twin / środowisko badawczo-edukacyjne, docelowo
   `beam → collision → detector interaction → hits → reconstruction → tracks/calorimeter →
   event selection → analysis → Evidence/Replay`. Wierność opieramy na publicznych danych
   i dokumentacji CERN/CMS. **Nie deklarujemy „1:1", dopóki nie umiemy tego dowieść** — celem jest
   maksymalna *zwalidowana* wierność.
7. **ZAPOTRZEBOWANIE NA ZASOBY** — `docs/GENESIS_REQUIRED_RESOURCES.md` jest utrzymywany na bieżąco.
   Braku **nie obchodzimy atrapą**: każdy brak trafia tam z klasyfikacją
   `ALREADY HAVE / GET NOW / GET LATER / BLOCKED` oraz wpływem, kosztem, trudnością, ryzykiem
   licencyjnym i wartością naukową.
8. **PRZYSZŁOŚĆ** — architektura pozostaje zgodna z docelowym łańcuchem: zdobywanie wiedzy → generowanie
   hipotez → autonomiczna eksperymentacja cyfrowa → zewnętrzne moce obliczeniowe (HPC/QPU) → adaptery
   prawdziwego laboratorium → dane zmierzone → falsyfikacja → następny eksperyment. **Nie implementujemy
   dziś portów do urządzeń fizycznych ani QPU bez realnej potrzeby.** Wykonanie fizyczne zawsze za
   bramkami uprawnień, blokadami bezpieczeństwa i zgodą człowieka.
9. **ZERO DUPLIKATÓW** — nigdy drugi: Experiment Fabric, Rejestr Dowodów, Replay, Pamięć Naukowa,
   WorldGraph, renderer, Science Chat, system falsyfikacji, rejestr silników, stan laboratorium. Gdy
   audyt wykryje konkurencyjne implementacje: wybieramy kanon i przygotowujemy migrację — nie dodajemy
   piątej.
10. **BRAMKA JAKOŚCI** — każdy ważny krok kończy się: testami celowanymi, suitą backendu, suitą frontu,
    TypeScriptem, lintem, buildem produkcyjnym, realnym E2E oraz weryfikacją Dowodów/Powtórki.
    **Nie nazywamy czegoś „gotowym", jeśli testuje tylko atrapę, projekcję albo UI.**

Priorytet bez dyskusji: *prawdziwy silnik naukowy → kanoniczny żywy stan → eksperyment widoczny na żywo
→ Dowody → powtórka prawdziwego silnika → trwała Pamięć Naukowa.* Dopiero potem rozszerzamy zakres.

Commity lokalne **nie są wypychane**, dopóki właściciel nie napisze dokładnie: „wypchnij".

## Czym Genesis ma być (kierunek, nie dzisiejsza deklaracja)

**Scientific Intelligence Operating System** — naukowy umysł, nie chatbot. Sam zdobywa wiedzę, wykrywa
jej braki, generuje hipotezy, wybiera silniki i narzędzia, projektuje eksperyment, wykonuje go,
obserwuje wynik, falsyfikuje, zapamiętuje, robi Replay i proponuje następny eksperyment. Autonomia rośnie
w granicach `OBSERVE → RESEARCH → SIMULATE → PROPOSE → EXECUTE DIGITAL → EXECUTE PHYSICAL`.
Docelowo zarządza HPC, GPU, QPU, agentami i bazami wiedzy, a później prawdziwym laboratorium.
Ma sprawiać wrażenie **jednego bytu naukowego**, nie pięćdziesięciu modułów. Docelowe UX: kontakt
z wysoko autonomiczną inteligencją naukową, która dostaje `CEL + UPRAWNIENIA + GRANICE BEZPIECZEŃSTWA`
i sama ustala najlepszą drogę naukową.

**Granica uczciwości:** nie wolno twierdzić, że Genesis *już jest* AGI ani „wszechwiedzącym bytem",
dopóki kod tego nie potwierdza. Wizja to kierunek ewolucji, nie opis stanu obecnego.

## Zaległości do domknięcia (zapisane, żeby nie zginęły)

Właściciel poleca pamiętać i **dopiąć później** — nie są to rzeczy do zrobienia przed domknięciem Fazy 1,
ale są funkcjami Genesis, nie pomysłami do zapomnienia:

- **Symulacje jako film, nie wykres.** Most Einsteina–Rosena ma wyglądać jak symulacja filmowa
  w 3D: **żadnego 2D, żadnej „gumowej płachty" z suwakami**. Zderzenia materii — wiernie, jak
  w rzeczywistości, nie jako ilustracja.
- Pozostałe otwarte pozycje z poprzednich sprintów (m.in. drugi benchmark receptor–ligand na osobnym
  przepływie opioidowym, Human Atlas z BodyParts3D, jakość obrazu laboratorium, prosty język w świecie)
  zostają w backlogu i są dopinane po Fazie 1 — w kolejności z tej dyrektywy.
