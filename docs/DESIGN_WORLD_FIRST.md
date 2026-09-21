# GENESIS — KONTRAKT PROJEKTOWY: WORLD FIRST → OBJECT SECOND → RESEARCH THIRD

Status: **KONTRAKT PRZYJĘTY, IMPLEMENTACJA WSTRZYMANA.**
Etap wg Master Promptu: AUDIT → **CONTRACT (ten dokument)** → MOCKUP → `AKCEPTUJĘ DESIGN` → IMPLEMENT.

Ten dokument nie zmienia ani jednej linii produktu. Jest zapisem tego, co zostało
ustalone, żeby ustalenie nie zginęło między iteracjami — i żeby dało się później
sprawdzić, czy implementacja dotrzymała słowa. Dopóki użytkownik nie napisze
dokładnie `AKCEPTUJĘ DESIGN`, nic z poniższego nie trafia do kodu.

---

## 1. MATRIX — GDZIE TAK, GDZIE NIE

To jest **zawężenie** wcześniejszego kierunku, nie jego kontynuacja. Wcześniejsze
iteracje (D-123 „2040 visuals", V3 „Matrix Premium") rozlewały jedną stylistykę na
cały system. Od teraz:

**Matrix JEST motywem:**
- Genesis Home / Main Dashboard — pełna estetyka: zielony kod, cyfrowe tło, postacie, cyberprzestrzeń;
- ekranu wejściowego;
- przejścia między światami (transition, nie dekoracja docelowa);
- subtelnych elementów globalnej identyfikacji Genesis (logo, sygnatura, loader).

**Matrix NIE JEST motywem żadnego świata po wejściu.** Zielone UI nie wchodzi do
środka świata. Po wejściu dominuje środowisko własne świata:

| Świat | Tożsamość wizualna | Dominująca temperatura |
|---|---|---|
| Human Biology | futurystyczne laboratorium biologiczne, komora bliźniaka | zimne białe światło, czysty clean-room |
| CERN | collider / laboratorium fizyczne, detektor | stal, pomarańcz ostrzegawczy, głęboki cień |
| Cosmos | środowisko kosmiczne | czerń, głębia, punktowe światło gwiazd |
| Molecular Biology | laboratorium molekularne | szkło, ciecz, chłodny fiolet |
| Physics | laboratorium fizyczne | beton, metal, neutralne światło |
| Hyperscope | środowisko badawcze / mikroskopia | ciemne pole, świecąca próbka |

Zasada rozstrzygająca spór: **jeżeli element wygląda tak samo w dwóch różnych
światach, to prawdopodobnie jest błędem** — chyba że należy do globalnej
identyfikacji Genesis (logo, przycisk Science AI, badge epistemiczny).

---

## 2. TRZY WARSTWY INTERAKCJI

Stan domyślny to **WORLD VIEW**. Nie dashboard.

```
WORLD VIEW            świat 3D wypełnia ekran; wąski toolbar; funkcje ukryte
    ↓ hover/tap       podświetlenie obiektu + jego nazwa
    ↓ klik            CONTEXTUAL POPUP — mały panel przy obiekcie, 4-6 akcji
    ↓ wybór „BADAJ"   RESEARCH DRAWER — dopiero teraz duży panel
    ↓ zamknięcie      panel znika, świat wraca na pierwszy plan
```

Przykład kanoniczny (Human Biology):

```
LABORATORIUM + CZŁOWIEK
  → najazd na serce
  → podświetlenie + „SERCE"
  → klik
  → panel: 3D | PRZEKRÓJ | NACZYNIA | HISTOLOGIA | BADAJ
  → BADAJ
  → Research Drawer
  → zamknij → laboratorium znów na pierwszym planie
```

**Żadna funkcja nie znika.** Wszystko, co dziś jest na ekranie, ma swoje miejsce w
jednej z warstw. To przeniesienie, nie usunięcie. Ten sam mechanizm obowiązuje w
każdym świecie; zmienia się tylko jego skóra.

---

## 3. BUDŻET HUD

W WORLD VIEW: **maksymalnie 5 trwale widocznych, znaczących elementów.**

Proponowany podział dla każdego świata:
1. tożsamość świata (nazwa + powrót),
2. stan agenta/sceny (jedna linia),
3. badge epistemiczny bieżącego obiektu,
4. wąski toolbar narzędzi świata,
5. Science AI (zwinięty przycisk).

Nie liczą się do budżetu: kursor, podświetlenie obiektu, chwilowy tooltip.

---

## 4. BADGE EPISTEMICZNY — NIENARUSZALNY

Każdy poziom macro→micro (CZŁOWIEK → UKŁAD → NARZĄD → TKANKA → KOMÓRKA →
ORGANELLUM → CZĄSTECZKA → DNA → ATOM) niesie jawną etykietę:
`REAL_IMAGE`, `REAL_DATASET`, `MODEL`, `SCHEMATIC`, `RECONSTRUCTED`, `SIMULATED`,
`HYPOTHESIS`, `UNKNOWN`.

**Realizm wizualny nigdy nie podnosi statusu epistemicznego.** Ładniejsze światło,
lepsza tekstura, płynniejsze przejście — żadne z nich nie zmienia etykiety. Ta
zasada jest ważniejsza od każdego punktu wizualnego w tym dokumencie i w razie
konfliktu wygrywa.

Konsekwencja, którą trzeba wypowiedzieć wprost: **referencje wizualne pokazują
fotorealistyczną anatomię i zdjęcia mikroskopowe (histologia, SEM, fluorescencja),
których Genesis NIE POSIADA jako realnych danych.** Układ, interakcję, kadrowanie i
jakość światła da się odtworzyć. Obrazów nie — pozostaną `MODEL`/`SCHEMATIC`,
dopóki nie wejdzie prawdziwy, licencjonowany zbiór. Mockup, który pokaże te kafelki
jako zdjęcia, byłby kłamstwem o produkcie.

---

## 5. MOBILE

Bottom sheet i akcje kontekstowe — **nie zmniejszony desktop**. Popup kontekstowy
staje się arkuszem u dołu; Research Drawer wchodzi na pełną wysokość z uchwytem;
obiekt 3D pozostaje widoczny nad arkuszem w stanie częściowo rozwiniętym.

---

## 6. AUDYT STANU OBECNEGO (uczciwie, na dowodach)

Zmierzone na zrzutach z przebiegu E2E `human biology lab` z 2026-09-19
(`artifacts/human-biology-lab-*.png`), czyli na realnie działającej aplikacji, nie z pamięci:

| Wymaganie | Stan | Dowód |
|---|---|---|
| WORLD VIEW domyślnie | **NARUSZONE** | panele zajmują dolne ~55% i prawy ~45% kadru |
| HUD ≤ 5 elementów | **NARUSZONE** — ok. 12 trwałych | 5 badge'ów statusu + dowody + polecenia + dok Explorera + pasek makro→mikro + ciekawość + Science Chat + lewa szyna |
| Research kontekstowy | **NARUSZONE** | dok Explorera jest przyklejony, nie wywoływany |
| hover → highlight → klik | **BRAK** | nie ma raycastingu po organach; wybór idzie tylko przez chipy/komendy |
| Badge epistemiczny | **SPEŁNIONE** | `ANATOMIA: MODEL` + `NOT_A_MEDICAL_DEVICE` + etykiety poziomów |
| Tożsamość świata ≠ Matrix | **CZĘŚCIOWO** | laboratorium biologiczne ma własny charakter, ale chrome/typografia są wspólne z Matrix |
| Mobile bottom sheet | **BRAK** | breakpoint 900px rozciąga panele na 100vw — to zmniejszony desktop |

Jedyny element, który już dziś spełnia docelową zasadę: **kamera BLIŹNIAK z D-131** —
włączenie jej chowa transkrypt, zwija dok i oddaje ekran obiektowi. To jest
mikro-dowód, że „world first" da się zrobić w tej architekturze bez przepisywania
renderera.

---

## 7. CZEGO TA ZMIANA NIE DOTYKA

Preregistracja, progi, wagi, reguły dowodowe, Winner Gate, fingerprinty,
`NO_WINNER`, EvidenceLedger, ExperimentSession, replay, kernel providers,
polityka jednego jądra (D-124). To jest warstwa prezentacji. Jeżeli jakikolwiek
krok implementacji wymagałby dotknięcia któregokolwiek z powyższych — krok jest
błędny i zostaje zgłoszony, a nie wykonany.

---

## 8. BRAMKA

Mockupy powstają jako osobne, statyczne makiety. **Nie modyfikują produktu, nie są
commitowane do ścieżek runtime i nie wchodzą do buildu.** Implementacja zaczyna się
wyłącznie po tym, jak użytkownik napisze dokładnie:

```
AKCEPTUJĘ DESIGN
```
