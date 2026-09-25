# Genesis — plan sceny laboratoryjnej dla żywego eksperymentu (drug discovery)

Cel: widz ma zobaczyć **przebieg eksperymentu w laboratorium**, a nie panel z liczbami. Scena ma być
realistyczna wizualnie, ale nigdy nie może sugerować, że wynik obliczeniowy jest pomiarem fizycznym.

## 0. Zasada jednego stanu

```
silnik / model  →  zdarzenia dopisywane w backendzie  →  kanoniczny stan runu (projectDrugRun)
                                                       →  procedura laboratoryjna (labProcedureOf)
                                                       →  naukowiec, aparatura, kamery, monitory, oś czasu
```

`labProcedureOf` jest **czystą projekcją** kanonicznego stanu: nie przechowuje własnego stanu
eksperymentu, nic nie uruchamia i nic nie mierzy. Faza staje się ZROBIONA dopiero wtedy, gdy istnieje
zapis, który ją potwierdza (zdarzenie, pomiar, poza). Dzięki temu scena nie może wyprzedzić silników.

## 1. Etykiety epistemiczne (obowiązkowe przy każdej fazie)

| Etykieta | Znaczenie | Gdzie w tym eksperymencie |
|---|---|---|
| REAL ENGINE OUTPUT | policzył to prawdziwy silnik | RDKit (geometria, przekształcenia), Meeko (przygotowanie), AutoDock Vina (poza i wynik), PySCF |
| MODEL_ESTIMATE | przewidział to wytrenowany model | ADMET-AI (AMES, hERG, DILI…) |
| REFERENCE_DATA | dane z opublikowanego źródła | struktura PDB 1IEP, łańcuch A, i jej kieszeń wiązania |
| SIMULATED | krok laboratoryjny pokazany dla zrozumienia, którego nikt nie wykonał | np. pobranie próbki do fiolki |
| DERIVED | wynik reguł, bez nowego pomiaru | werdykt, dowody, powtórka |

Żaden krok oznaczony SIMULATED nie może pokazywać liczby. Liczby pochodzą wyłącznie z zapisanych
przebiegów silników.

## 2. Mapa: zdarzenie silnika → czynność naukowca → stan aparatu → kamera → widoczny efekt

| Faza | Zdarzenie / zapis, który ją włącza | Czynność naukowca | Aparat | Kamera | Widoczny efekt | Etykieta |
|---|---|---|---|---|---|---|
| PREPARE | kampania zapisała kandydatów (RDKit) | stoi przy stole, układa serię próbek | stół roboczy, statyw z fiolkami | plan ogólny stanowiska | fiolki pojawiają się kolejno: jedna na kandydata, przygaszona gdy odrzucony | REAL ENGINE OUTPUT (przekształcenia obliczeniowe) |
| LOAD | STAGE_RESULT `admet` z wartościami | wkłada wybraną próbkę do analizatora | analizator ADMET z ekranem | zbliżenie na statyw i analizator | szuflada zamyka się, na ekranie wartości AMES/hERG z etykietą MODEL_ESTIMATE | MODEL_ESTIMATE |
| CONFIGURE | STAGE_PROGRESS `RECEPTOR_PREPARED`, potem `LIGAND_PREPARED` | przechodzi do stanowiska dokowania, ustawia parametry | konsola dokowania + hologram receptora | zbliżenie na receptor i ramkę kieszeni | pojawia się białko (reszty kieszeni) i ramka pudełka dokowania z rozmiarem w Å | REFERENCE_DATA (struktura) + REAL ENGINE OUTPUT (przygotowanie) |
| EXECUTE | STAGE_PROGRESS `VINA_STARTED` | zostaje przy konsoli, ręce na pulpicie | konsola pracuje: kontrolka pracy, pasek zajętości | plan średni: naukowiec przy konsoli | widać, że aparat liczy; **żadnego wyniku** dopóki silnik nie skończy | REAL ENGINE OUTPUT |
| OBSERVE | poza z przebiegu (`poseSha256`) | pochyla się nad hologramem | hologram kieszeni | zbliżenie na pozę w kieszeni | ligand wskakuje w kieszeń w prawdziwych współrzędnych | REAL ENGINE OUTPUT |
| MEASURE | wartość dokowania (i QM, jeśli policzone) | odczytuje z monitora | monitor stanowiska | zbliżenie na monitor | liczby z jednostkami i zastrzeżeniem „estymata funkcji oceniającej, nie pomiar" | REAL ENGINE OUTPUT |
| INTERPRET | run zakończony + werdykt z zamrożonych kryteriów | odwraca się do monitora wyników | monitor wyników | zbliżenie na monitor | werdykt i powód (które kryterium zadecydowało) | DERIVED |
| EVIDENCE | zapieczętowana sesja | — | monitor wyników | bez zmian | identyfikatory przebiegów, sumy kontrolne receptora, ligandu i pozy | DERIVED |
| REPLAY | werdykt powtórki | — | monitor wyników | bez zmian | MATCH / różnica | DERIVED |

Kolejność faz jest stała: PREPARE → LOAD → CONFIGURE → EXECUTE → OBSERVE → MEASURE → INTERPRET →
EVIDENCE → REPLAY. Zablokowany etap (BLOCKED_BY_RUNTIME) blokuje swoją fazę i **nie** przepuszcza
dalszych: bez pomiaru nie ma odczytu ani werdyktu.

## 3. Co jest ponownie użyte (bez nowych systemów)

- jedno laboratorium i jeden renderer: `core/three/agentLabScene3D` (praca Astry — nie zmieniana);
- naukowiec i jego automat stanów: `AgentController` (czeka na prawdziwy silnik przez `engineGate`);
- geometria cząsteczek: `moleculeKit` + konformer RDKit z backendu;
- warstwa stanowiska: `DrugBenchLayer` dołączana do grupy `station:st-drug-bench` w tej samej scenie;
- kamera: tryb obserwatora sceny, z chwilowym zbliżeniem nakładanym przez warstwę stanowiska po
  wykonaniu `syncScene` — bez drugiego renderera i bez zmian w plikach Astry;
- dowody, powtórka, następny eksperyment: istniejący `ScientificOutcomePanel`.

## 4. Test akceptacyjny

Widz bez czytania logu ma zobaczyć: hipotezę i plan w czacie → potwierdzenie → naukowca przy stole →
przygotowanie próbek → analizator ADMET → przygotowanie receptora i ligandu → pracującą konsolę →
pozę w kieszeni → odczyt z monitora → werdykt → dowody → powtórkę MATCH → propozycję następnego
eksperymentu. E2E sprawdza, że fazy pojawiają się w tej kolejności i że scena pokazuje dokładnie ten
stan, który zapisał backend (zgodność sum kontrolnych).
