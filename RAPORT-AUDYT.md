# Genesis OS — Raport audytu produkcyjnego

Data: 2026-07-09 · Branch: `claude/quantum-forge-p845ux`
Zakres: wyłącznie jakość, architektura, bezpieczeństwo i gotowość produkcyjna —
zero nowych laboratoriów i funkcji użytkowych.

## Lista zmian z uzasadnieniami

### Infrastruktura uruchomieniowa
| Zmiana | Uzasadnienie |
|---|---|
| `.replit`: `deployment.run` → `node packages/backend/src/server.mjs` | Poprzedni wpis wskazywał nieistniejący plik — Deploy w Replit kończył się błędem. Run działał i działa (vite, port 5000). |
| `.replit`: usunięta integracja `javascript_openai` | Relikt poprzedniego projektu (ELION); martwa konfiguracja myli środowisko agenta Replit. |
| Backend = serwer produkcyjny (statyczny dist + /api) | Jeden proces obsługuje całość na autoscale: fallback SPA, poprawne MIME, `immutable` cache dla hashowanych assetów Vite, `nosniff`. |
| Graceful shutdown (SIGTERM/SIGINT) | Autoscale i kontenery ubijają procesy sygnałem — bez obsługi żądania w locie giną twardo. |
| `Dockerfile` (multi-stage) + `.dockerignore` + `docker-compose.yml` | Wdrożenie poza Replit jednym poleceniem; obraz slim bez devDependencies, proces bez roota, HEALTHCHECK. Stary compose (Postgres ELION-a bez aplikacji) usunięty jako relikt. |
| `.env.example` | Dokumentuje wszystkie zmienne środowiskowe; koniec zgadywania nazw. |

### CI/CD i automatyzacja
| Zmiana | Uzasadnienie |
|---|---|
| `.github/workflows/ci.yml` | Każdy push/PR: lint → testy fizyki → typecheck+build → artefakt dist. To jest sieć wykrywania regresji — 37 testów z asercjami naukowymi (Bell, Parseval, soczewka) łapie zepsutą fizykę, nie tylko zepsuty kod. |
| ESLint (flat config, typescript-eslint) + `npm run lint` | Wyłapał 12 realnych problemów w istniejącym kodzie (patrz niżej). Reguły dobrane pod bugi (no-explicit-any, eqeqeq, no-unused-vars), nie pod styl. |
| Prettier + `.prettierrc.json` + `npm run format` + `.editorconfig` | Jednolity format niezależnie od edytora; eliminuje szum w diffach. |

### Jakość kodu (naprawy z lintu)
| Zmiana | Uzasadnienie |
|---|---|
| 9× wzorzec `cond ? ctx.moveTo() : ctx.lineTo()` → `if/else` | Ternary jako instrukcja to antywzorzec maskujący intencję; w dwóch miejscach przy okazji usunięty martwy kod (`- h * 0.0`). |
| 3× zbędne `Boolean(x)` w warunkach | Redundantne rzutowania sugerują niezrozumienie truthiness — uproszczone. |
| `tsconfig`: `types: ["vite/client"]` | Poprawne typowanie `import.meta.env` zamiast błędu kompilacji. |

### Niezawodność i monitoring
| Zmiana | Uzasadnienie |
|---|---|
| `ErrorBoundary` wokół aplikacji | Wyjątek w jednej symulacji nie może wywalić całej platformy na biały ekran — użytkownik dostaje czytelny komunikat i powrót do laboratoriów; szczegóły w konsoli. |
| Logowanie strukturalne JSON w backendzie (czas, poziom, latencja AI, stop_reason) | Podstawa monitoringu: logi parsowalne przez dowolny agregator bez zmian w kodzie. |
| `/api/health` z wersją, uptime, statusem AI i statyki | Endpoint dla healthchecków (Docker HEALTHCHECK z niego korzysta) i szybkiej diagnozy "co działa". |
| Rate limiter: okresowe sprzątanie wygasłych wpisów | Wcześniej mapa IP rosła bez ograniczeń — powolny wyciek pamięci na długo żyjącym procesie. |

### Bezpieczeństwo
| Zmiana | Uzasadnienie |
|---|---|
| `sanitizeFlat()` — walidacja typów kontekstu AI | Frontend deklaruje kształt danych, ale backend nie może mu ufać: tylko płaskie wartości, limity liczby kluczy i długości stringów. |
| Ochrona path traversal + test wektorów `/../` i `..%2f` | Serwer statyczny to klasyczne miejsce wycieku plików; kanonizacja + prefix check, zweryfikowane kodami odpowiedzi (fallback SPA / 403). |
| `SECURITY.md` | Jawny model zagrożeń, proces zgłaszania podatności i lista świadomych ograniczeń (rate limit per-proces, CSP na edge, RODO przy przyszłych kontach). Uczciwe "czego nie ma" jest częścią bezpieczeństwa. |

### Metadane, licencja, SEO, dostępność
| Zmiana | Uzasadnienie |
|---|---|
| `LICENSE` (wszystkie prawa zastrzeżone) + `license: UNLICENSED` | Produkt komercyjny wg wizji projektu: domyślne "brak licencji = niejasność" zastąpione jawną decyzją (z notą o danych CC0/domenie publicznej i zależnościach MIT). Otwarcie części kodu pozostaje możliwą świadomą decyzją. |
| `package.json`: wersja 0.2.0, `engines.node>=18` | Wersja zgodna z raportami etapów; engines ucina niezrozumiałe błędy na starym Node. |
| OG/Twitter meta + favicon + `robots.txt` (Disallow: /api/) | Udostępnienie linku pokazuje kartę z opisem zamiast pustki; roboty nie indeksują API. |
| `role="img"` + opisowe `aria-label` na canvasach symulacji | Canvas jest niewidzialny dla czytników ekranu; etykiety kierują do panelu Narratora, który tekstowo opisuje te same wartości (WCAG 1.1.1). Uzupełnia istniejące: focus-visible, aria na kontrolkach, prefers-reduced-motion. |

## Weryfikacja końcowa
`npm run lint` — 0 błędów · `npm test` — 37/37 · `npm run build` — zielony (92 kB gzip)
Serwer produkcyjny przetestowany: health, SPA, MIME, traversal.

---

## Propozycja innowacji: „Genesis Compass" — korepetytor fizyki dla miliarda uczniów

*(propozycja do decyzji — zgodnie z zasadą audytu NIE implementowana)*

**Problem z pierwszych zasad.** Na świecie jest ~600 mln uczniów szkół średnich;
większość przechodzi przez fizykę pamięciowo i bez intuicji, bo (1) brakuje
~44 mln nauczycieli (UNESCO 2030), (2) korepetycje — jedyny skuteczny plaster —
kosztują 20–60 USD/h i są niedostępne dla rodzin, które najbardziej ich
potrzebują, (3) rozwiązania AI-edu wymagają stałego internetu i drogich
subskrypcji, więc omijają dokładnie te setki milionów uczniów z Azji Południowej,
Afryki i Ameryki Łacińskiej, gdzie problem jest największy.

**Wgląd (moment „Tesli").** Wszyscy budują korepetytora jako czat z LLM — czyli
koszt za każde pytanie, internet zawsze, halucynacje w materiale egzaminacyjnym.
My mamy odwrotny fundament, którego nie da się szybko skopiować: **fizyka liczona
deterministycznie na urządzeniu, offline, za darmo, bez halucynacji** — a LLM
tylko jako opcjonalna warstwa. Korepetytor nie musi być czatem. Może być
**diagnostą patrzącym, jak uczeń manipuluje symulacją**: kto ustawia kąty CHSH
losowo, nie rozumie korelacji; kto nie umie doprowadzić reaktora do k=1,
nie rozumie sprzężenia zwrotnego. To dane diagnostyczne, których czat nigdy nie zobaczy.

**Co to jest.** Nakładka na istniejące laboratoria (zero nowych symulacji):
1. **Mapy programowe** — te same eksperymenty otagowane wymaganiami egzaminów
   (matura, IB, A-levels, JEE, NEET…): plik danych, nie kod.
2. **Diagnoza przez manipulację** — deterministyczny silnik (rozszerzenie
   istniejącego Narratora) ocenia serie interakcji i wskazuje luki pojęciowe.
3. **Ścieżka „napraw lukę"** — sekwencje istniejących eksperymentów z celami
   („doprowadź do zapłonu przy minimalnym T") zamiast zadań z podręcznika.
4. **Offline-first** — całość działa bez internetu na telefonie za 50 USD;
   LLM dodaje wyjaśnienia otwarte tylko, gdy jest sieć i klucz.

**Dlaczego my wygrywamy.** Koszt krańcowy ucznia ≈ 0 (statyczna PWA, 92 kB);
konkurencja płaci za każde zapytanie do modelu. Dystrybucja przez szkoły i NGO
nie wymaga infrastruktury. Etykiety uczciwości naukowej to gotowa wiarygodność
dla ministerstw edukacji.

**Model biznesowy.** B2C freemium (diagnoza darmowa, ścieżki premium tanie
lokalnie), B2B: licencje szkolne i rządowe/NGO (przetargi na cyfryzację edukacji),
biały label dla wydawnictw egzaminacyjnych.

**Pierwszy krok (gdy zdecydujesz):** mapa programowa dla JEDNEGO egzaminu
(matura, poziom rozszerzony — znany rynek, język już gotowy) + diagnoza dla
3 laboratoriów o największej wartości egzaminacyjnej. Wykonalne w ~15–25 sesji,
w całości na istniejącym silniku.

**Ryzyka, nazwane wprost:** walidacja pedagogiczna wymaga pilotażu z prawdziwymi
uczniami (nie da się jej zakodować); mapowanie programów to praca ekspercka;
"diagnoza" musi być komunikowana jako wsparcie nauki, nigdy jako ocena ucznia.
