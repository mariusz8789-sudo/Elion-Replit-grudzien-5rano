# Genesis — konstytucja produktu (Scientific Intelligence OS)

Ten dokument jest długoterminową konstytucją Genesis, przyjętą przez właściciela produktu.
Wiąże każdą kolejną decyzję architektoniczną. Zmiana wymaga decyzji właściciela, nie autora kodu.

## 0. Czym Genesis ma się stać

Genesis nie jest zbiorem paneli, dem 3D ani osobnych aplikacji naukowych. Docelowo jest to
**autonomiczny naukowy system operacyjny**: od pytania człowieka, przez zdobycie wiedzy, hipotezy,
projekt eksperymentu, wykonanie, obserwację, falsyfikację, dowody i powtórkę, aż do następnego
eksperymentu. Z czasem ma obsługiwać silniki obliczeniowe, cyfrowe bliźniaki, zewnętrzne moce
obliczeniowe, komputery kwantowe, wyspecjalizowanych agentów, a po wyraźnej autoryzacji i przy
zabezpieczeniach sprzętowych — prawdziwą aparaturę laboratoryjną.

Użytkownik podaje: **CEL + UPRAWNIENIA + GRANICE BEZPIECZEŃSTWA**. Genesis dobiera drogę naukową
wewnątrz tych granic.

## 1. Pętla kanoniczna (ważniejsza niż jakikolwiek ekran)

```
PYTANIE → WIEDZA → HIPOTEZY → REJESTRACJA KRYTERIÓW → PROJEKT EKSPERYMENTU → WYBÓR SILNIKA
→ WYKONANIE → OBSERWACJA NA ŻYWO → WYNIK → DOWODY/POCHODZENIE → FALSYFIKACJA → PAMIĘĆ
→ POWTÓRKA → NASTĘPNY EKSPERYMENT
```

Wszystko w Genesis ma tej pętli służyć.

## 2. Autonomia w granicach uprawnień

Poziomy, których nie wolno omijać:

| Poziom | Co wolno |
|---|---|
| OBSERVE | czytać dane i stan |
| RESEARCH | pobierać zatwierdzone źródła zewnętrzne |
| SIMULATE | uruchamiać zatwierdzone modele obliczeniowe |
| PROPOSE | proponować eksperymenty i działania |
| EXECUTE DIGITAL | uruchamiać zatwierdzone przepływy obliczeniowe |
| EXECUTE PHYSICAL | sterować sprzętem wyłącznie po wyraźnej autoryzacji i przy blokadach bezpieczeństwa |
| HIGH-RISK PHYSICAL | zawsze wymaga zgody człowieka i niezależnej walidacji bezpieczeństwa |

Dostęp do urządzenia **nigdy** nie oznacza zgody na dowolne działanie. Model językowy nie uruchamia
sprzętu.

## 3. Etykiety epistemiczne — nigdy nie zlewane w jedną „odpowiedź"

`KNOWN`, `INFERRED`, `MODEL_ESTIMATE`, `SIMULATED`, `MEASURED`, `REFERENCE_DATA`, `UNVERIFIED`,
`REAL_ENGINE_OUTPUT`, `DERIVED`. Każde zdobyte twierdzenie zachowuje źródło, czas, wersję,
identyfikator, klasę dowodu i licencję.

## 4. Jeden kanon na jedną odpowiedzialność

Zakaz drugiego: WorldGraph, generatora światów, Experiment Fabric, Pamięci Naukowej, Rejestru
Dowodów, Powtórki, czatu/routera, silnika czasu, magistrali poleceń, stanu laboratorium, systemu
falsyfikacji, rejestru silników, renderera. Rozszerzamy przez **porty i adaptery**, nie przez
równoległe implementacje.

## 5. Laboratorium 3D

Warstwa wizualna nie jest źródłem prawdy:

```
PRAWDZIWY SILNIK / URZĄDZENIE / MODEL → DZIENNIK ZDARZEŃ → KANONICZNY STAN EKSPERYMENTU
→ CYFROWE LABORATORIUM → CZYNNOŚĆ NAUKOWCA → KAMERA → WIDOCZNY WYNIK
```

Nigdy nie wolno tworzyć osobnej, udawanej symulacji tylko po to, by coś ładnie animować.
Astra odpowiada za wierność wizualną (światło, materiały, otoczenie, inscenizacja naukowca, kamery,
przejścia) — na tym samym kanonicznym stanie, bez drugiego renderera.

## 6. Rola modelu językowego

Model interpretuje, planuje, tłumaczy, proponuje hipotezy i dobiera narzędzia. **Nie jest wyrocznią
naukową.** Liczby i twierdzenia naukowe pochodzą z silników, danych, pomiarów i jawnych reguł.
Model nie wymyśla brakujących dowodów.

## 7. Pamięć naukowa i niezmienność dowodów

Pamięć przechowuje pytanie, hipotezę, rejestrację kryteriów, protokół, tożsamość i wersje silników,
wejścia, wyjścia, dowody, porażki, falsyfikacje, tożsamość powtórki, wnioski, pytania otwarte i
propozycje kolejnych eksperymentów. Wyniki bez pochodzenia są odrzucane.

Przeszłe dowody są **niezmienne**. Nowa interpretacja tworzy nowy zapis powiązany ze starym; nigdy
nie nadpisuje historii.

## 8. Droga do prawdziwego laboratorium (projektowana teraz, włączana później)

Czyste interfejsy: `InstrumentPort`, `SensorPort`, `RobotPort`, `SampleTrackingPort`,
`LaboratorySafetyPort`, `ExecutionApprovalPort`, `ComputePort`, `QuantumComputePort`,
`KnowledgePort`. Bez przywiązania do jednego dostawcy.

Wymagania dla sterowania sprzętem: listy dozwolonych poleceń, koperty pracy urządzenia, granice
parametrów, zatrzymanie awaryjne, niezależny watchdog, uwierzytelnienie, autoryzacja operatora, tryb
suchego przebiegu, wycofanie tam, gdzie fizycznie możliwe, pełny dziennik poleceń, tożsamość i stan
kalibracji urządzenia, walidacja czujników, odmowa operacji niebezpiecznych, ręczne przejęcie.

## 9. Kolejność prac (dyscyplina wdrożenia)

1. **Faza 1 — żywa nauka obliczeniowa**: prawdziwy silnik → żywy kanoniczny stan → laboratorium 3D →
   dowody → falsyfikacja → powtórka. Okręt flagowy: odkrywanie leków z dokowaniem do prawdziwego
   białka. To ma być zrobione wzorowo.
2. Faza 2 — ta sama architektura dla chemii, biologii, fizyki.
3. Faza 3 — wierne światy naukowe (CERN, człowiek, miasto).
4. Faza 4 — wiedza zewnętrzna i agenci specjaliści.
5. Faza 5 — orkiestracja mocy obliczeniowej (chmura, HPC, GPU, QPU).
6. Faza 6 — adaptery prawdziwego laboratorium: najpierw odczyt z czujników, potem sterowanie
   aparaturą, na końcu robotyka wyłącznie za bramkami zgody.
7. Faza 7 — zamknięta pętla: przewidywanie → eksperyment fizyczny → pomiar → falsyfikacja →
   kolejna propozycja.

Nie budujemy wszystkiego naraz i nie wstrzymujemy działającego okrętu flagowego na rzecz
spekulacyjnej infrastruktury.

## 10. Zasada akceptacji (nienegocjowalna)

Genesis jest udany dopiero wtedy, gdy o każdym wyniku potrafi powiedzieć:

- wiem, skąd ten wynik pochodzi;
- pokażę, jak powstał;
- odróżniam przewidywanie od pomiaru;
- potrafię to powtórzyć;
- potrafię sprawdzić, czy przetrwa próbę obalenia;
- wiem, jaki eksperyment powinien być następny;

a docelowo: „za Twoją wyraźną zgodą i w zadanych granicach bezpieczeństwa mogę wykonać ten
eksperyment na podłączonej aparaturze i porównać rzeczywistość z przewidywaniem".

Nigdy nie deklarujemy zdolności fizycznych, które nie zostały faktycznie podłączone i zweryfikowane.
