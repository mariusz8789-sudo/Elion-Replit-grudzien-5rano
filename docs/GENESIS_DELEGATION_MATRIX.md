# Genesis — macierz delegowania

Wymagana przez `docs/GENESIS_EXECUTION_DIRECTIVE.md` §18. Krótka i operacyjna: kto co może wziąć, co
musi zostać u prowadzącego, i co realnie da się dziś wywołać.

## 1. Co da się wywołać z tej sesji (stan faktyczny, nie życzenie)

| Wykonawca | Wywoływalny stąd? | Uwaga |
|---|---|---|
| Podagenci Claude (Explore / general-purpose / Plan) | **TAK** | Używane realnie w tej sesji (audyt architektury, audyt protokołu/retrosyntezy, szukanie języków) |
| Codex | **NIE** z tej sesji | Zadanie przygotowuję jako gotowy pakiet dla właściciela |
| Qwen | **NIE** z tej sesji | Jw. |
| Astra | **NIE** (właściciel: „ja jednak nie mam astry") | Warstwę wizualną robię sam; najpierw audyt `docs/ASTRA_VISUAL_AUDIT.md` |

**Zasada:** nie piszę „oddelegowałem", jeśli nikt nie dostał zadania. Jeśli wykonawca jest
niedostępny — dostarczam pakiet zadania i mówię to wprost.

## 2. Co wolno delegować

Zadania z **zamkniętym kontraktem**, nietykające źródła prawdy:

- izolowany adapter (parser, konwerter, klient formatu) z podanym we/wy;
- komponent prezentacji bez własnego stanu naukowego;
- narzędzie zasobów (pobranie, sprawdzenie sumy kontrolnej, rejestr licencji);
- testy do istniejącego, zamrożonego kontraktu;
- powtarzalne przepisanie/uzupełnienie tłumaczeń przy istniejącym słowniku.

## 3. Czego NIE wolno delegować bez prowadzącego przeglądu i niezależnej kontroli

- Evidence, Replay, Scientific Memory, prerejestracja, reguły werdyktu;
- uprawnienia, bramki bezpieczeństwa, migracje danych;
- **sandbox do wykonywania niezaufanego kodu** — to nie jest „łatwy boilerplate" i nie jest niskiego
  ryzyka tylko dlatego, że da się go wydzielić do paczki;
- cokolwiek dotykającego sterowania aparaturą.

## 4. Pakiet zadania — wymagane pola (bez tego nie deleguję)

`cel` · `bazowy commit` · `pliki dozwolone` · `pliki zabronione` · `kontrakt we/wy` · `zależności` ·
`kryteria odbioru` · `testy do zielonego` · `ograniczenia architektury (zero duplikatów kanonu)` ·
`sposób integracji (branch/worktree, kto scala)` · `budżet`.

## 5. Integracja

Każda zmiana: `diff → przegląd → testy → kontrola architektury → integracja → regresje → właściwy E2E`.
Wykonawcy w osobnych gałęziach lub worktree; **nie edytują równocześnie tych samych plików**. Całych
paczek nie integruję w ciemno.

## 6. Koszt

Oszczędność liczę **łącznie z kosztem integracji i poprawek**, nie liczbą wygenerowanych linii.
Zadanie źle opisane wraca jako dług integracyjny droższy niż samodzielne napisanie.

## 7. Gotowe pakiety do przekazania (aktualne)

| # | Zadanie | Dla kogo | Dlaczego nadaje się do delegacji |
|---|---|---|---|
| D-1 | Pobranie i weryfikacja plików modelu AiZynthFinder (3 wymagane + 3 opcjonalne), sumy kontrolne, układ katalogu pod `GENESIS_RETRO_MODEL_DIR` | właściciel lub środowisko z dostępem do zenodo/figshare | wymaga sieci niedostępnej tutaj; zero decyzji architektonicznych |
| D-2 | Zasoby wizualne CC0 (HDRI, PBR: metal, szkło, beton, podłoga) + rejestr licencji per plik | wykonawca z dostępem do sieci | zamknięty kontrakt, rejestr już istnieje (`assetGovernance`) |
| D-3 | Uzupełnienie tłumaczeń po ustaleniu słownika i kluczy | Codex/Qwen | powtarzalne, gdy kontrakt kluczy jest zamrożony; **nie** zanim on powstanie |

Pakiety D-1 i D-2 to blokady zasobowe opisane w `docs/GENESIS_REQUIRED_RESOURCES.md`.
