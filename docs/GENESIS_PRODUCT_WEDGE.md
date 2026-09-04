# Genesis Product Wedge — jeden problem, za który ktoś zapłaci

**Data:** 21 sierpnia 2026
**Status:** hipoteza produktowa do zweryfikowania pilotem, NIE decyzja biznesowa, NIE wycena spółki.

> Ten dokument nie deklaruje gotowości enterprise, nie obiecuje przychodów i nie
> zastępuje rozmowy z prawdziwymi użytkownikami. Jego jedynym celem jest wybrać
> **jedną** klinową ofertę i powiedzieć uczciwie, czego brakuje, zanim ktokolwiek
> zapłaci.

## 0. Punkt wyjścia — czego NIE trzeba już ustalać

Dwa istniejące dokumenty już odpowiadają na część pytań i nie są tu powielane:

- `docs/GENESIS_COMPETITIVE_USP_DECISION.md` (18 sierpnia 2026) już porównał
  Genesis z AnyLogic, Ansys Twin Builder, SimScale, Esri i GAMA na poziomie
  **technicznej** różnicy (Counterfactual Evidence Compare jako wybrany
  milestone architektoniczny). Ten dokument nie powtarza tamtej analizy —
  rozszerza ją o segment **użytkownika i modelu przychodu**, którego tamten
  dokument świadomie nie zawiera.
- `docs/GENESIS_SAAS_ENTERPRISE_READINESS.md` już uczciwie stwierdza: Genesis
  ma działający backend produktu (auth, projekty, RBAC, trwałe runy,
  `Experiment Fabric` API), ale **nie** ma billingu, API keys, SSO ani
  enterprise governance. To ogranicza, jaki pilot jest w ogóle możliwy dziś
  (patrz sekcja 5) — nie da się sprzedać niczego wymagającego enterprise
  procurement.

## 1. Pięć hipotez: segment × problem

| Segment użytkownika | Konkretny problem / job-to-be-done | Obecna alternatywa i jej koszt | Co Genesis daje wyjątkowego | Stan techniczny dziś | Dowód potrzebny przed sprzedażą | Ryzyko / ograniczenie |
|---|---|---|---|---|---|---|
| **1. Edukacja STEM — kursy metod obliczeniowych/badawczych na uczelni** | Prowadzący chce, by studenci przeszli PEŁNY cykl: pytanie → plan → realny model → wynik → ograniczenia → odtwarzalność — nie luźny czat i slajdy, i chce to ocenić. | PhET (darmowe, gotowe symulacje, ale bez provenance/replay/oceniania metody) [1]; AnyLogic Educational (~$1500–1750/os. szkolenie, wymaga Javy, stroma krzywa uczenia) [2][3]. | Jedyna z tych trzech, która daje **odtwarzalny dowód metody** (Scenario Capsule + Evidence Pack) zamiast tylko obrazka wyniku — bez wymogu programowania. | `experimentFabric` + `scenarioCapsule.ts` + `evidencePack*.ts` już działają end-to-end w testach (864/864 frontend). Brak UI do oceniania/eksportu dla prowadzącego. | Jeden prowadzący, jeden kurs, jeden semestr: czy studenci faktycznie rozumieją różnicę FAKT/MODEL/HIPOTEZA lepiej niż z PhET+Excel. | Rynek edukacyjny ma długi cykl decyzyjny (semestr/rok akademicki); budżety kursowe są małe. |
| **2. Analitycy scenariuszowi miast / zdrowia publicznego** | „What if?" dla polityki (np. restrykcje, izolacja) z jawnym provenance i porównaniem A/B, zrozumiałe dla nietechnicznego decydenta. | Esri ArcGIS Urban/GeoPlanner — dojrzały, ale drogi i licencyjnie złożony ($2–$700+/plan, użytkownicy skarżą się na koszt i skomplikowane licencjonowanie) [4][5]; AnyLogic (jw.). | Krótsza pętla „porównaj A vs B" bez konieczności budowy modelu od zera — ale **tylko** dla modeli, które Genesis już ma (epidemia miejska), nie ogólny GIS. | `EpidemicCitySimulation` + `counterfactualCompare.ts` realne; **produkcyjny GIS/dane rzeczywiste to P3, świadomie niezaczęte** (patrz `GENESIS_EXTERNAL_SOLVER_AND_GIS_SEAMS.md`). | Walidacja danych wejściowych i ostrożność wobec decyzji wysokiego ryzyka — bez tego segment jest niebezpieczny do sprzedaży. | Wysokie ryzyko: błędna interpretacja modelu edukacyjnego jako podstawy decyzji publicznej. Wymaga silnych disclaimerów, nie jest gotowe na realnych klientów instytucjonalnych. |
| **3. Laboratoria obliczeniowe / bioinformatyka edukacyjna** | Prosty przepływ PDB/SMILES → porównanie → provenance → replay, bez twierdzenia że to pełna platforma drug discovery. | Notebooki Jupyter + ręczny RDKit/Biopython (darmowe, ale bez zautomatyzowanego provenance); QIIME 2 Provenance Replay pokazuje, że automatyczne śledzenie provenance jest **uznanym, realnym problemem** w bioinformatyce, nie wymysłem [6]; szerszy kryzys odtwarzalności symulacji jest udokumentowany w literaturze 2026 [7]. | RDKit/PySCF/Biopython już podłączone przez `Experiment Fabric` z automatycznym `provenance` (SHA-256 struktur, silnik, wersja) bez ręcznego skryptowania. | **Najbardziej dojrzały segment technicznie**: 269/269 testów backendowych zielonych po tym audycie, realne silniki (RDKit, PySCF, Biopython, PyMeep, OpenMM CPU-seam). | Porównanie z ręcznym workflow Jupyter na tym samym zadaniu — czy Genesis realnie oszczędza czas, nie tylko ładniej wygląda. | Ciężkie silniki (OpenMM 5GHW, AutoDock Vina) zablokowane budżetem CPU — `ENGINE_NOT_AVAILABLE` musi zostać jawny, nie ukryty. |
| **4. Inżynierowie / analitycy infrastruktury** | Zrozumiały front-end do zweryfikowanych modeli fizycznych (CFD/FEM/GR) bez pełnej złożoności Ansys/SimScale. | Ansys — potężny, ale „dosłownie kilkanaście programów w jednym płaszczu", bardzo stroma krzywa uczenia [8]; SimScale celowo prostszy UI jako swoją przewagę konkurencyjną [8][9]. | Potencjalnie prostszy punkt wejścia — ale **CFD/FEM/GR/neutrony w Genesis to dziś w większości `ENGINE_NOT_AVAILABLE`**, nie działający produkt. | Najsłabszy stan techniczny z całej piątki — prawidłowy seam istnieje, silnik nie. | Nie da się sprzedać czegoś, co jeszcze nie liczy. Dowód wymagałby najpierw P1 (prawdziwy solver). | Odrzucić jako **pierwszy** wedge — przedwczesne wobec stanu technicznego. Zostaje kandydatem na P1+. |
| **5. Firmy szkoleniowe i muzea nauki** | Wiarygodne, interaktywne demonstratory z jawnym odróżnieniem wzoru/modelu/hipotezy. | Custom-built exhibity: $20K–$150K+ na instalację, 8–24 tygodnie realizacji, wysokie koszty utrzymania sprzętu [10]; NVIDIA Omniverse jako alternatywa cyfrowa — $4500/GPU/rok enterprise + sprzęt RTX rzędu $11K, bariera dla mniejszych zespołów [11]. | Web-based, bez sprzętu VR/GPU dedykowanego, z tą samą uczciwością epistemiczną. | Visual P1.2 (jedna ulica, realni agenci) w toku, nie domknięte. | Wymaga fizycznej instalacji/integracji na miejscu — **długi cykl sprzedaży, niepasujący do software-only zespołu**. | Najgorsze dopasowanie do dzisiejszych możliwości zespołu (fabrykacja fizyczna, integracja na miejscu) — odrzucić jako pierwszy wedge. |
| *(6. Genesis Verify)* | *Wykrywanie podróbek/manipulacji.* | — | — | — | **Nie oceniane tutaj** — wymaga osobnego benchmarku reprezentatywnych danych i niezależnej ewaluacji, zanim jakakolwiek skuteczność zostanie zakomunikowana. | Traktować jako możliwe rozszerzenie, nigdy jako wedge startowy. |

## 2. Ranking ICE — heurystyka, nie wyrocznia

Założenia (jawne, dyskusyjne): **Impact** = jak duży i pilny jest problem dla segmentu; **Confidence** = ile mam dowodu z publicznych źródeł + stanu kodu (nie z opinii); **Ease** = ile trzeba dobudować, licząc od dzisiejszego stanu technicznego. Skala 1–5 każda, ICE = iloczyn/125 jako procent.

| Kandydat | Impact | Confidence | Ease | ICE (%) | Uzasadnienie Ease |
|---|---:|---:|---:|---:|---|
| **3. Bioinformatyka edukacyjna** | 3 | 4 | 5 | **48%** | Silniki już działają i przeszły pełny audyt w tej sesji (269/269). Brakuje tylko warstwy „kurs/ocena", nie silnika. |
| **1. STEM metody obliczeniowe** | 4 | 3 | 4 | 38% | `scenarioCapsule`/`evidencePack` gotowe; brakuje UI dla prowadzącego i materiałów kursowych. |
| **2. Scenariusze miast/zdrowia** | 4 | 3 | 2 | 19% | Model epidemii gotowy, ale P3 (GIS/dane realne) świadomie niezaczęty — bez tego segment jest niebezpieczny do sprzedaży decydentom. |
| **4. Infrastruktura inżynierska** | 3 | 2 | 1 | 5% | Solvery w większości `ENGINE_NOT_AVAILABLE` — nie ma czego sprzedawać. |
| **5. Szkolenia/muzea** | 2 | 3 | 1 | 5% | Wymaga fizycznej fabrykacji i integracji na miejscu — złe dopasowanie do zespołu software-only. |

ICE jest tu **wyłącznie porządkującą heurystyką** z jawnymi założeniami wyżej —
nie dowodem, że segment 3 „wygrywa" w sensie biznesowym. Rozstrzyga o
**kolejności pilotów**, nie o ostatecznym rynku.

## 3. Rekomendowany pierwszy wedge

> **Reprodukowalne eksperymenty obliczeniowe dla akademickich kursów metod
> badawczych** — połączenie segmentu 1 i 3: kurs, w którym studenci wykonują
> realne, prowadzone komputerowo mini-badania (epidemiologia agentowa,
> cheminformatyka, prosta fizyka kwantowa) i muszą wykazać metodę, nie tylko
> wynik.

Dlaczego to, a nie czysty segment 3 (profesjonalna bioinformatyka) czy czysty
segment 1 (ogólna edukacja STEM):

- Segment 3 w czystej postaci (profesjonalne laby) wymagałby enterprise
  compliance, którego `GENESIS_SAAS_ENTERPRISE_READINESS.md` uczciwie mówi, że
  nie ma (brak SSO, audytu regulacyjnego, SLA).
- Segment 1 w czystej postaci (ogólna edukacja STEM) konkuruje wprost z
  darmowym, dopracowanym PhET na poziomie „ładna symulacja" — przegrywa, jeśli
  różnicą jest tylko wizualizacja.
- Przecięcie obu — **metoda i odtwarzalność jako przedmiot oceny**, nie sama
  animacja — to jedyne miejsce, gdzie istniejąca przewaga Genesis
  (Evidence Pack, Scenario Capsule, prawdziwe silniki z provenance) jest
  różnicą, której ani PhET, ani ręczny Jupyter, ani AnyLogic nie oferują w
  jednym pakiecie bez programowania.

USP do zweryfikowania pilotem, nie do ogłaszania:

> **„Pytanie → zatwierdzalny eksperyment → prawdziwy model → wynik z
> ograniczeniami → provenance → A/B → replay → czytelny świat 3D."**

## 4. Minimalny, realny pilot

| Element | Zakres |
|---|---|
| Użytkownik | Jeden prowadzący kursu metod obliczeniowych/badawczych (biologia, fizyka lub chemia obliczeniowa) na poziomie licencjackim/magisterskim; 10–30 studentów. |
| Zadanie | Studenci porównują dwa warianty jednego modelu (np. R₀ niski vs wysoki w `epidemic.city`, lub dwie struktury PDB w porównaniu 10E8) i muszą oddać krótki raport metody. |
| Artefakt wejściowy | `StructuredExperimentRequest` wypełniony przez studenta w istniejącym Science Chat / formularzu — bez potrzeby pisania kodu. |
| Oczekiwany wynik | `ExperimentResult` + `ScenarioCapsule` (baseline, wariant, porównanie, provenance) — eksportowalny jako dowód metody do oddania. |
| Kryterium sukcesu | (a) prowadzący ocenia, że raport metody jest **łatwiejszy do zweryfikowania** niż zrzut ekranu z Excela/PhET; (b) ≥70% studentów kończy zadanie bez pomocy techniczne. |
| Ograniczenia jawne studentom | Wyłącznie modele już oznaczone `BACKEND_REAL_ENGINE`/`live-world`; żadnej predykcji poza zakresem modelu; brak oceny merytorycznej odpowiedzi — tylko narzędzie. |
| Czas pilotu | Jeden semestr lub jeden moduł (2–4 tygodnie) — nie cały rok akademicki, żeby dowód przyszedł szybko. |

## 5. Co trzeba zbudować, zanim można pobrać pierwsze pieniądze

Z `GENESIS_SAAS_ENTERPRISE_READINESS.md`, przefiltrowane do tego, czego
**faktycznie wymaga pilot per-kurs** (nie pełny enterprise SaaS):

- Widok/eksport dla prowadzącego: lista runów studentów w projekcie +
  `ScenarioCapsule` do pobrania jako dowód (rozszerza istniejące
  `GET /api/projects/:id/runs`, nie nowy system).
- Prosty limit/quota per projekt kursowy, żeby jeden student nie zużył
  całego budżetu compute (P0 z tabeli bramki w tamtym dokumencie: rate
  limiting per konto).
- Jasna instrukcja instalacji/dostępu dla prowadzącego (nie wymaga SSO/MFA na
  poziomie pojedynczego kursu — to może być zwykłe konto + hasło, jak dziś).
- **Nie wymaga jeszcze**: billingu, API keys enterprise, SOC2/ISO, SSO/SCIM —
  pierwszy pilot może być bezpłatny lub fakturowany ręcznie poza systemem.

## 6. Czego nie wolno obiecywać klientowi

- Że wynik modelu to prognoza kliniczna, epidemiologiczna albo polityczna
  rekomendacja — to pozostaje `EDUCATIONAL`/`COMPUTATIONAL_RESULT`, nigdy
  `REAL_ENGINE` predykcja świata.
- Że Genesis ma status enterprise SaaS, SOC2, SLA lub wsparcie 24/7 — nie ma.
- Że każdy model naukowy jest dostępny — CFD/FEM/GR/OpenMM 5GHW/AutoDock Vina
  są dziś `ENGINE_NOT_AVAILABLE` i pozostają takie, dopóki realny runtime nie
  będzie podłączony.
- Że ocena/grading jest zautomatyzowana lub że Genesis ocenia poprawność
  merytoryczną odpowiedzi studenta — narzędzie dostarcza dowód metody, nie
  ocenę wiedzy.
- Że dane/parametry są kalibrowane do świata rzeczywistego (digital twin) —
  modele są edukacyjne/uproszczone, co jest już wymogiem architektonicznym
  Genesis (`HonestyLevel`).

## 7. Proponowany model przychodu — hipoteza, nie gwarancja

- **Faza pilotu:** bezpłatny lub symboliczny, jeden kurs, jeden semestr —
  celem jest dowód wartości, nie przychód.
- **Po walidacji pilotu:** licencja edukacyjna per kurs/instytucja (roczna,
  ograniczona liczba studentów) — najniższe tarcie sprzedażowe, zgodne z
  cyklem budżetowym uczelni.
- **Później, jeśli segment 2 dojrzeje (P3 GIS):** płatny pilot analityczny
  dla pojedynczego zespołu miejskiego/zdrowia publicznego — dopiero po
  walidacji danych i disclaimerach wysokiego ryzyka.
- **Najdalej:** licencja zespołowa dla laboratoriów obliczeniowych +
  obliczenia HPC usage-based, gdy P4 (realny GPU/HPC runtime) przestanie być
  `ENGINE_NOT_AVAILABLE`.

Żadna z tych faz nie jest zatwierdzona biznesowo — to kolejność hipotez do
testowania, nie plan sprzedaży.

## 8. Kryterium „stop"

Nie budować dalej w tym kierunku, jeśli którekolwiek z poniższych się
potwierdzi w pilocie:

- Prowadzący/studenci uznają istniejący workflow (PhET + Excel/Jupyter) za
  **wystarczający** — różnica w odtwarzalności nie jest odczuwalną wartością
  dla tego segmentu.
- Czas potrzebny prowadzącemu na wdrożenie Genesis w kursie przewyższa czas
  zaoszczędzony przez studentów — narzędzie dodaje tarcie zamiast je
  usuwać.
- Instytucje edukacyjne wymagają zgodności (FERPA/RODO, SSO) na etapie
  pilotu, nie dopiero po nim — oznacza to, że segment wymaga enterprise
  readiness wcześniej, niż zakładano, i wedge trzeba przesunąć na segment o
  niższych wymaganiach compliance.
- Segment 3 (bioinformatyka) w praktyce też oczekuje ciężkich silników
  (`OpenMM`/`AutoDock Vina`), które są dziś zablokowane budżetem CPU — jeśli
  to się okaże barierą krytyczną, priorytet przesuwa się na P4 przed dalszą
  sprzedażą tego segmentu.

## Źródła

[1]: https://phet.colorado.edu/ "PhET Interactive Simulations — University of Colorado Boulder"
[2]: https://www.softwaresuggest.com/anylogic/pricing "AnyLogic Pricing (2026)"
[3]: https://www.researchgate.net/post/How-do-I-start-the-Agent-based-modeling-learning-regarding-its-concepts-and-methodology-and-also-the-related-software-like-AnyLogic "AnyLogic learning curve discussion — ResearchGate"
[4]: https://www.saasworthy.com/product/esri-arcgis/pricing "Esri ArcGIS Pricing — SaaSWorthy"
[5]: https://flypix.ai/arcgis-urban-tool-review/ "ArcGIS Urban Review: Features, Pricing & Analysis (2026)"
[6]: https://journals.plos.org/ploscompbiol/article?id=10.1371%2Fjournal.pcbi.1011676 "Facilitating bioinformatics reproducibility with QIIME 2 Provenance Replay — PLOS Computational Biology"
[7]: https://doi.org/10.1177/00375497261444678 "Advancing reproducibility and replicability in simulation: Challenges and opportunities — Huang & Cetinkaya, 2026"
[8]: https://dl.iir.edu.ua/iir-news/simscale-vs-ansys-which-is-best-for-simulation-1764798728 "SimScale vs. Ansys: Which Is Best For Simulation?"
[9]: https://www.g2.com/compare/ansys-fluent-vs-simscale "Compare Ansys Fluent and SimScale — G2"
[10]: https://www.utsubo.com/blog/interactive-museum-installations-benefits-guide "Interactive Museum Installations: ROI, Costs & Real Examples (2026)"
[11]: https://docs.nvidia.com/ai-enterprise/planning-resource/licensing-guide/latest/pricing.html "NVIDIA Enterprise Licensing Guide — Pricing"

Wewnętrzne (nie duplikowane tutaj):
[I1]: docs/GENESIS_COMPETITIVE_USP_DECISION.md "Genesis Competitive R&D — decyzja o milestone'ie USP"
[I2]: docs/GENESIS_SAAS_ENTERPRISE_READINESS.md "Genesis — SaaS i Enterprise Readiness"
