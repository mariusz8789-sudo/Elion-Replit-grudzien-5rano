# Genesis — runbook demo grantowego

Do odpalenia i pokazania. Wszystko poniżej zostało uruchomione i zweryfikowane 2026-09-26 w nocy na
aktualnym kodzie gałęzi `claude/genesis-total-consolidation`. Liczby są zmierzone, nie przepisane.

## 0. Uruchomienie (2 komendy, ~40 s)

```bash
# 1. backend + statyki
PORT=8080 GENESIS_DB_PATH=/tmp/genesis-demo.db \
  node packages/backend/src/start.mjs

# 2. sprawdzenie, że żyje
curl -s http://127.0.0.1:8080/api/health
```

Przeglądarka: `http://127.0.0.1:8080`.

Jeśli trzeba przebudować front: `npm run build` w katalogu głównym (~10 s).

## 1. Co pokazać, w tej kolejności

Całość zajmuje **12–15 minut**. Nie improwizuj kolejności — ona prowadzi od „co to jest" do
„dlaczego nie da się tego podrobić".

### Akt 1 · Silniki są prawdziwe (2 min)

Otwórz w drugiej karcie:

```
http://127.0.0.1:8080/api/compute/toolchain
```

**Co mówisz:** „To nie jest opis, to jest rejestr uruchomionych silników. Każdy ma wersję zmierzoną
na tej maszynie i własny przypadek referencyjny."

Liczby do wypowiedzenia:
- RDKit **2026.03.6**, PySCF **2.14.0**, OpenMM **8.6.1**, AutoDock Vina **1.2.7** + Meeko **0.8.0**,
  Biopython **1.88**, ADMET-AI **2.0.1**.
- **7 z 9** silników naukowych ma zdany przypadek referencyjny.
- Do tego **11 własnych kerneli rozumowania** Genesis, każdy z własnym rejestrem dowodów.

### Akt 2 · Prawdziwe dane pomiarowe, nie model (2 min)

```
http://127.0.0.1:8080/api/physics/cms-z
```

**Co mówisz:** „To są prawdziwe dane z CERN, nie symulacja. 10 000 zdarzeń Z→μμ, licencja CC0, suma
kontrolna SHA-256 pliku źródłowego. **8259 zdarzeń wpada w okno 80–100 GeV** — to jest pik bozonu Z."

**Tu jest najmocniejszy moment całego demo.** Pokaż palcem pole `dataLimit` w odpowiedzi:

> „Not suitable for a full physics analysis; no detector reconstruction or discovery claim."

I powiedz: **„System sam z siebie mówi, czego nie wolno z tych danych wywnioskować. Nikt go o to nie
pytał. Tego się nie da dopisać do slajdu po fakcie — to jest w kodzie."**

### Akt 3 · Żywy eksperyment (6 min) — HERO

Otwórz laboratorium i uruchom kampanię odkrywania leku na prawdziwym celu białkowym.

**Co się dzieje naprawdę:** RDKit liczy deskryptory → ADMET-AI ocenia farmakokinetykę
i toksyczność → AutoDock Vina dokuje do **PDB 1IEP, łańcuch A** (kinaza ABL1) → PySCF liczy
chemię kwantową tam, gdzie to uzasadnione → kandydaci odpadają z podanym powodem → finalista
trafia do protokołu.

**Liczba, którą musisz umieć powiedzieć z pamięci:**

> **Redock imatinibu na 1IEP: RMSD 0,584 Å.**
> Próg uznania za odtworzenie pozy krystalograficznej to 2 Å. Jesteśmy czterokrotnie poniżej progu.

To jest benchmark, który rozumie każdy chemik obliczeniowy w komisji. Jeśli masz powiedzieć tylko
jedną liczbę w całym spotkaniu — powiedz tę.

### Akt 4 · Dowód i odtworzenie (3 min)

Po zapieczętowaniu przebiegu pokaż trzy rzeczy:

1. **Protokół końcowy** w trzech częściach (A/B/C) — z odciskiem.
2. **Evidence** — łańcuch dowodowy zabezpieczony hashem, append-only, z wyzwalaczami na poziomie
   bazy danych. Nie da się zmienić wpisu wstecz.
3. **Replay** — ponowne odtworzenie tego samego przebiegu z werdyktem **MATCH** albo **DRIFT**.

**Co mówisz:** „Odcisk protokołu na ekranie i odcisk w bazie to ta sama wartość. Sprawdza to test
automatyczny, nie człowiek."

### Akt 5 · Czego Genesis odmawia (2 min) — zamknięcie

To jest puenta, nie dodatek.

**Co mówisz:** „Zapytajcie o zamiennik Mounjaro."

Genesis odpowiada **BLOCKED_MODALITY**: tirzepatyd jest peptydem, a ten pipeline liczy małe
cząsteczki. **Nie zgaduje, nie podstawia czegoś podobnego, nie wypluwa liczby.** Odmawia i mówi
dlaczego.

To samo z retrosyntezą: silnik jest zintegrowany, ale brakuje plików modelu, więc zdolność zgłasza
**BLOKADĘ**, a nie wymyśloną trasę syntezy.

**Zdanie zamykające:**

> „Każdy system AI umie dać odpowiedź. Nasz umie odmówić — i to jest ta cecha, za którą płaci
> regulator, ministerstwo i fundusz, a nie za szybkość."

## 2. Zrzuty z prawdziwego przebiegu

W `artifacts/demo/` leżą klatki z **rzeczywistego** uruchomienia (nie rendery, nie makiety):

| Plik | Moment |
|---|---|
| `01-laboratory.png` | laboratorium jako miejsce, przed otwarciem paneli |
| `02-live-state.png` | ten sam przebieg z nazwanym stanem i silnikami |
| `03-engines-running.png` | silniki liczą, scena pokazuje stan utrwalony w backendzie |
| `04-result-sealed.png` | werdykt i kandydaci po zapieczętowaniu |
| `05-final-protocol.png` | protokół końcowy w kontekście ekranu |
| `06-protocol-detail.png` | sam protokół, do wklejenia na slajd |

Odtworzenie zrzutów w każdej chwili:

```bash
CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  npx playwright test packages/e2e/src/grantDemoCapture.e2e.spec.ts
```

## 3. Dowód, że to nie jest demo na sznurkach

Jedna komenda, ~8 minut, przy komisji:

```bash
CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  npx playwright test packages/e2e/src/liveDrugBench.e2e.spec.ts
```

Sprawdza w prawdziwej przeglądarce: pełny gest laboratoryjny
(REACH → GRIP → CARRY → PLACE → OPERATE), tożsamość próbki na każdym kroku, stan sceny równy stanowi
backendu, protokół zgodny odciskiem z bazą po odtworzeniu.

**Zweryfikowane 2026-09-26, 8,3 minuty, wynik zielony, na tym samym kodzie, który pokazujesz.**

Dodatkowo: `node scripts/engine-readiness-report.mjs` wypisuje stan każdego silnika z wersją
i przypadkiem referencyjnym. Też można puścić przy komisji.

## 4. Czego NIE pokazywać

- **Sceny CERN i scen 3D poza laboratorium.** Grafika nie jest na poziomie reszty produktu
  i przeniesie uwagę na niewłaściwy temat. Laboratorium pokaż, resztę zostaw na później.
- **Niczego, co wygląda jak render.** Jeśli pokazujesz obraz offline — powiedz, że to render.
- **Modułów o statusie PROTOTYPE** (`genesis-9d`) i `NOT_IMPLEMENTED` (`virtual-animals`).

## 5. Pytania, które padną — i odpowiedzi

**„Czy to działa na waszych serwerach, czy to nagranie?"**
> Działa tutaj. Mogę teraz puścić pełny test akceptacyjny w przeglądarce, trwa osiem minut
> i kończy się protokołem z odciskiem zgodnym z bazą.

**„To tylko nakładka na open source."**
> Silniki są otwarte i mówię to wprost — dzięki temu każdy może je zweryfikować. Wartość jest
> w warstwie, której żaden z nich nie ma: zamrożone kryteria przed obliczeniem, klasa epistemiczna
> przy każdej liczbie, łańcuch dowodowy z hashem i odtworzenie z werdyktem.

**„Ilu macie klientów?"**
> Zero. Jestem przed pierwszym wdrożeniem i po to tu jestem. Mam działający system z siedmioma
> zweryfikowanymi silnikami i odtwarzalnym przebiegiem end-to-end — szukam pierwszego wdrożenia,
> nie kapitału na zbudowanie produktu od zera.

**„Czy odkryliście lek?"**
> Nie. Genesis wskazał finalistę obliczeniowego przy zamrożonych wcześniej kryteriach i wyprodukował
> odtwarzalną ścieżkę walidacji. Od leku dzieli to chemia mokra i badania kliniczne — i Genesis pisze
> to wprost w protokole.

## 6. Stan, który trzeba znać, zanim ktoś zapyta

| Rzecz | Stan |
|---|---|
| Silniki naukowe | 7 z 9 READY z przypadkiem referencyjnym |
| Kernele rozumowania Genesis | 11, wszystkie rozwiązują się w runtime |
| Zdolności produktowe | 27, z tego 21 AVAILABLE |
| Endpointy ADMET | 52, z metrykami TDC (Huang 2021 / Swanson 2024) |
| Dane CMS Open Data | 10 000 zdarzeń, CC0, SHA-256, 8259 w piku Z |
| Retrosynteza | ZABLOKOWANA — brak plików modelu (~1 GB, Zenodo niedostępne z tego środowiska) |
| PyMeep (fotonika) | ZABLOKOWANY — wymaga conda-forge |
| Grafika 3D poza laboratorium | słaba, świadomie poza demem |
| Trakcja | **zero klientów** — to jest największa luka, nie technologia |
