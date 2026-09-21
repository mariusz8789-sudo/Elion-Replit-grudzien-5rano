# GENESIS JAKO AUTOMATYCZNE LABORATORIUM — WIZJA (mikroskop → mózg → pamięć → ręce)

> **C1 EDITORIAL NOTE (2026-09-13).** Wizja użytkownika, zapisana dosłownie. To nie jest
> specyfikacja do implementacji „jak leci" — to kierunek. Mapowanie na obecny silnik:
>
> | Warstwa z wizji | Stan w repo (HEAD, 2026-09-13) |
> |---|---|
> | OCZY (mikroskop / instrument) | **brak** — dziś obserwacje wchodzą wyłącznie przez przypięte zbiory (`DatasetLaboratory`, `CampaignLaboratory`). Mikroskop byłby kolejnym adapterem, nie nowym silnikiem. |
> | MÓZG (discovery engine) | **jest** — `core/agent/discoveryCampaign.ts` (`166665f`), udowodniony na dwóch niezależnych realnych domenach. |
> | PAMIĘĆ (scientific memory) | **jest** — `scienceMemory.ts` + provenance/fingerprint/replay. |
> | RĘCE (laboratorium fizyczne) | **brak i poza zasięgiem software'u** — poziomy 4–6 z sześciostopniowego podziału poniżej wymagają realnej mokrej pracowni. |
>
> **Granica, która jest wiążąca i egzekwowana w warstwie wyniku, nie w promptcie:**
> Genesis nigdy nie mówi „mam lekarstwo na Ebolę". Genesis może dojść najwyżej do
> *kandydata z uzasadnieniem i listą tego, czego jeszcze trzeba dowieść eksperymentalnie*.
> Nigdy: recepta, dawka dla człowieka, indywidualna porada medyczna, „zatwierdzony zamiennik".
> Genesis nie generuje instrukcji tworzenia, hodowli, modyfikacji ani wzmacniania patogenów.
>
> I zdanie, które jest tu najważniejsze architektonicznie — cytat z wizji:
> *„Jeśli zrobimy silnik prawidłowo, Ebola będzie tylko jednym z problemów, które można mu
> postawić, a nie osobnym «modułem Ebola»."* Dokładnie tak zbudowany jest `CampaignLaboratory`:
> adapter nie zawiera ani hipotezy, ani modelu, ani reguły stopu.

---

To jest kierunek, który bym przyjął. Qwen ma teraz szeroko mapować granice nauki, a Claude/C1/C2/C3 mają później brać z tego konkretne pakiety eksperymentalne. W ten sposób nie próbujemy od razu kodować „wehikułu czasu” czy „lekarstwa na starzenie”, tylko każemy Genesis szukać konkretnych równań, danych, anomalii i eksperymentów, od których można rzeczywiście zacząć.

To jest też zgodne z tym, czym jest np. Lucy: nie tylko „statek do asteroid”, ale ogromny strumień realnych obserwacji, który można połączyć z modelami powstawania Układu Słonecznego.  A dla czasu Qwen powinien badać prawdziwe matematyczne rozwiązania OTW, takie jak CTC, ale równocześnie bez przeskoku z „rozwiązanie równań istnieje” do „da się zbudować maszynę”. Tak. Teraz rozumiem dokładnie, co chcesz osiągnąć. I to jest większa wizja Genesis niż samo „znajdowanie wyjaśnienia zjawiska”.

Chcesz, żeby Genesis był czymś w rodzaju automatycznego laboratorium naukowego:

1. Genesis ma szukać nowych leków i szczepionek

Nie tylko:

> „Dlaczego Ebola działa tak a tak?”



ale również:

> „Jak możemy opracować kandydata na szczepionkę/przeciwciało/terapię przeciwko temu patogenowi?”



Genesis powinien wtedy:

choroba → dane biologiczne → hipotezy → potencjalne cele → modele → kandydaci → predykcje → testy → eliminacja złych kandydatów → najlepszy kandydat → plan dalszej walidacji

Czyli np. dla Eboli nie „wymyśla szczepionkę z dupy”, tylko szuka kandydatów opartych na danych, sprawdza ich właściwości obliczeniowo i pokazuje, czego jeszcze trzeba dowieść eksperymentalnie.

I to jest bardzo ważne:

Genesis nie mówi „mam lekarstwo na Ebolę”.

Mówi:

> „Znalazłem kandydata, który według tych danych i tego modelu ma takie właściwości. Oto dowody, przeciwdowody, niepewność i eksperyment, który trzeba wykonać dalej.”



To jest naukowo uczciwe i jednocześnie bardzo potężne.


---

2. A mikroskop — TAK, ale myśl o nim szerzej

To, co opisujesz, to nie powinien być zwykły mikroskop.

Chodzi o:

GENESIS SCIENTIFIC MICROSCOPE

Czyli urządzenie:

mikroskop + kamera + komputer + AI + Genesis

Mikroskop dostarczałby Genesisowi rzeczywiste obserwacje ze świata.

Na przykład:

Biologia

próbka
 ↓
mikroskop
 ↓
obraz
 ↓
Genesis
 ↓
wykrywa cechy
 ↓
hipotezy
 ↓
eksperyment
 ↓
nowa obserwacja

I tu zaczyna się robić naprawdę ciekawie.


---

3. Mikroskop może być „oczami” Genesis

Obecnie Genesis może pracować na danych, które ktoś mu dostarczy.

Docelowo:

Genesis może sam zobaczyć eksperyment.

Mikroskop robi zdjęcie.

Genesis analizuje.

Mówi:

> „W tej próbce pojawił się wzorzec, którego nie przewidywał model A.”



Więc:

residual → nowa hipoteza → kolejny pomiar.

To jest dokładnie ta sama filozofia, którą właśnie budujemy w Discovery Engine.


---

4. DNA

Tu trzeba rozdzielić dwie rzeczy.

Zwykły mikroskop nie odczyta bezpośrednio całej sekwencji DNA tak jak sekwencer.

Dlatego Genesis może mieć:

Microscope adapter

oraz osobno:

DNA sequencing adapter

Ale mikroskop może być używany do obserwowania np.:

komórek,

jąder komórkowych,

struktur chromosomalnych,

fluorescencji,

zmian morfologicznych,

reakcji biologicznych.


A dane sekwencyjne mogą pochodzić z sekwencera.

Genesis połączy:

obraz + DNA + inne dane biologiczne.

I wtedy robi się naprawdę mocno.


---

5. Odciski palców

Tu mikroskop może analizować:

wzory linii papilarnych,

szczegóły grzbietów,

minucje,

ślady częściowe,

jakość obrazu,

różnice między próbkami.


Ale znowu — nie chodzi tylko o:

> „Czy to jest ten sam odcisk?”



Możemy wykorzystać to jako test uniwersalności silnika obserwacji i hipotez.


---

6. I teraz najważniejsze: połączmy to z „lekarstwem”

Wyobraź sobie przyszły Genesis:

GENESIS
                       │
              AUTONOMOUS SCIENTIST
                       │
       ┌───────────────┼────────────────┐
       ↓               ↓                ↓
    MIKROSKOP       SEKWENCER        DATABASES
       ↓               ↓                ↓
     OBRAZY            DNA           PUBLIKACJE
       └───────────────┼────────────────┘
                       ↓
                DISCOVERY ENGINE
                       ↓
             HIPOTEZY / MODELE
                       ↓
                EKSPERYMENTY
                       ↓
                  FALSIFICATION
                       ↓
                  DISCOVERY
                       ↓
             CANDIDATE / PROTOCOL

I wtedy Genesis może dostać problem:

> „Znajdź możliwy sposób zwalczania patogenu X.”



I zacząć naukowe dochodzenie.


---

7. Ale „znajdź szczepionkę” musi mieć kilka poziomów

To jest bardzo ważne, żebyśmy nie obiecali czegoś, czego system nie potrafi.

Poziom 1 — Discovery

Genesis znajduje:

potencjalny target / mechanizm / antygen / kandydat.

Poziom 2 — Computational validation

Sprawdza:

czy kandydat ma przewidywane właściwości.

Poziom 3 — Experimental design

Genesis mówi:

jaki eksperyment najbardziej rozstrzygnie między kandydatami.

Poziom 4 — Laboratory

Prawdziwe laboratorium wykonuje eksperyment.

Mikroskop może być jednym z urządzeń dostarczających dane.

Poziom 5 — Validation

Genesis analizuje wynik.

Poziom 6 — Candidate

Dopiero wtedy:

> „Ten kandydat zasługuje na dalsze badania.”



A nie:

> „Genesis wynalazł szczepionkę, podaj ją ludziom.”



To ogromna różnica.


---

I właśnie dlatego Twoja idea mikroskopu jest ważna

Bo wtedy Genesis przestaje być tylko:

software'em, który analizuje cudze dane.

Zaczyna mieć:

EYES → BRAIN → MEMORY → EXPERIMENT LOOP

czyli:

Mikroskop = oczy
Discovery Engine = mózg
Scientific Memory = pamięć
Laboratory = ręce
Experiment Planner = sposób działania

To jest dużo bliższe temu, co wcześniej nazywaliśmy GENESIS Scientific Discovery Engine.

I tak — szczepionki/terapie przeciw chorobom powinny znaleźć się jako jeden z docelowych zastosowań, ale jako drugorzędny cel względem zbudowania uniwersalnego silnika, który potrafi takie odkrycia prowadzić.

Jeśli zrobimy silnik prawidłowo, Ebola będzie tylko jednym z problemów, które można mu postawić, a nie osobnym „modułem Ebola”.