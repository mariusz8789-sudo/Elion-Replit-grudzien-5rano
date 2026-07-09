# Współpraca przy Genesis OS

## Konwencje projektu

- **Język UI: polski.** Kod, komentarze i commity mogą być po angielsku;
  wszystko, co widzi użytkownik, jest po polsku.
- **Uczciwość naukowa to twarda zasada, nie sugestia.** Każdy nowy
  eksperyment MUSI mieć etykietę `honesty` (`exact | simplified |
  educational | theoretical`, patrz `core/types.ts`) i `honestyNote`
  wyjaśniający, co dokładnie jest uproszczone. Hipotezy (multiwersum, rój
  Dysona, napęd Alcubierre'a) nigdy nie są przedstawiane jako fakty.
- **Projektuj od Genesis Knowledge Base.** Zanim dodasz fizykę do
  laboratorium, sprawdź `knowledge/<lab>.md`. Jeśli źródło się zmienia lub
  brakuje go, zaktualizuj plik wiedzy w TYM SAMYM commicie co kod —
  `RESEARCH.md` opisuje zasady cytowania (nigdy nie kopiuj treści źródeł
  dosłownie, zawsze oznaczaj poziom potwierdzenia naukowego).
- **Zero nowych zależności runtime bez wyraźnego powodu.** Frontend ma
  tylko React; backend tylko `@anthropic-ai/sdk`. Zanim dodasz pakiet,
  sprawdź, czy da się to zrobić w ~30 liniach czystego TypeScriptu/JS.

## Dodawanie laboratorium

1. Nowy plik w `packages/frontend/src/labs/<id>.ts` (lub `.tsx` dla
   niestandardowego widoku) implementujący `LabDefinition`.
2. Jedna linia `registerLab(...)` w `src/labs/index.ts`.
3. Katalog wiedzy `knowledge/<id>.md` ze źródłami i skalą pewności
   naukowej.
4. `honesty` + `honestyNote` na laboratorium i na KAŻDYM eksperymencie.
5. Test w `__tests__/sims.test.ts` odpali się automatycznie (iteruje
   `getLabs()`) — upewnij się, że 120 kroków `update()` nie rzuca i
   wszystkie statystyki są skończone.

Zero zmian w rdzeniu aplikacji jest oczekiwane — jeśli dodanie
laboratorium wymaga edycji `App.tsx`/`LabShell.tsx`/`registry.ts`, to
prawdopodobnie kontrakt `LabDefinition` czegoś nie obsługuje i warto to
przedyskutować zamiast obchodzić.

## Dodawanie funkcji lokalnej (bez backendu)

Wzorzec: `core/storage.ts` (bezpieczny wrapper) → moduł domenowy (np.
`core/settings.ts`) z własnym kluczem i walidacją pole-po-polu przy
odczycie → hook `useXxx()` dla komponentów React. Zobacz
`core/discoveryLog.ts` jako referencyjny przykład: żadnych nowych obliczeń
fizycznych, tylko obserwacja wartości, które sim już liczy i tak
(`getStats()`).

## Dodawanie języka (i18n)

`core/i18n.ts` to gotowy szkielet: `t(key)`, `setLocale()`/`getLocale()`,
subskrypcja zmian. Dziś aktywny jest wyłącznie `pl` — słownik `en` jest
świadomie pusty, nie automatycznie "przetłumaczony", bo:

1. **Treść naukowa labów (formuły, narracja, nazwy eksperymentów) NIE jest
   dziś objęta `t()`** — to setki stringów rozsianych po `src/labs/`,
   wymagających przeglądu native speakera/fizyka pod kątem terminologii,
   nie mechanicznego tłumaczenia. Migrować lab po labie, nie hurtowo.
2. **Chrom aplikacji JEST już objęty** (`App.tsx` nawigacja, skip link w
   `main.tsx`) jako dowód, że mechanizm działa — nowe klucze UI dodawaj
   tym samym wzorcem: klucz w `pl` w `core/i18n.ts`, `t('klucz')` w JSX.
3. Żeby dodać nowy język: wypełnij słownik w `core/i18n.ts`, dodaj go do
   `Locale` i `DICTIONARIES`. Selektor języka w UI (Ustawienia) celowo NIE
   istnieje, dopóki jest tylko jeden kompletny język — pusty przełącznik
   byłby swoim własnym martwym kodem.

## Przed commitem

```bash
npm run lint    # ESLint (flat config), zero warningów tolerowanych
npm test        # 86 vitest (frontend) + 21 node:test (backend)
npm run build   # tsc -b && vite build — musi przejść bez błędów typów
```

Dla zmian UI: uruchom `npm run dev`, sprawdź w przeglądarce (złota ścieżka
+ przypadki brzegowe), sprawdź czy działa z klawiatury (Tab, Esc, skróty
Space/R/`/`/`?`). Automatyczne testy weryfikują poprawność fizyki i
logiki, nie wygląd ani UX.

## Styl commitów

Zwięzłe podsumowanie w trybie rozkazującym + „dlaczego" w treści, nie
„co" (diff już to pokazuje). Nie commituj bez wyraźnej prośby — sesje
agenta pracują na gałęzi roboczej i pytają przed pushem, jeśli coś jest
niejednoznaczne.
