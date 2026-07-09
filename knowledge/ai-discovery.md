# AI Discovery / Narrator — katalog wiedzy

## Zakres
Architektura warstwy AI: narracja z symulacji, pytania otwarte, propozycje
eksperymentów, zależności między laboratoriami, przyszłe raporty badawcze.

## Architektura (stan + plan)

**Warstwa 0 — narrator deterministyczny (działa, zostaje na zawsze)**
Liczy realne wielkości z parametrów/statystyk symulacji (γ, r_s, aktywność,
k) i składa tekst. Zero halucynacji, offline, zerowy koszt. To warstwa
odpowiedzialna za wszystkie LICZBY pokazywane użytkownikowi — LLM nigdy nie
liczy fizyki.

**Warstwa 1 — LLM: zasady projektowe (zaimplementowane)**
- Backend proxy trzyma klucz; frontend nigdy go nie widzi
- Prompt = stan symulacji (parametry+statystyki+etykieta uczciwości) +
  **wyciąg z knowledge/<lab>.md dla laboratorium, którego dotyczy pytanie**
  (`buildKnowledgeIndex`/`knowledgeExcerptFor` w `packages/backend/src/lib.mjs`,
  ładowane raz przy starcie serwera, mapowanie lab→plik jak w tabeli
  „Katalogi" wyżej w README) + pytanie użytkownika
- Grounding liczbowy: wartości wstrzykuje warstwa 0; LLM je opisuje, nie oblicza
- Grounding faktograficzny: SYSTEM_PROMPT zabrania modelowi sięgać po wiedzę
  ogólną dla twierdzeń wykraczających poza stan symulacji — jedyne dozwolone
  źródło to przekazany wyciąg bazy wiedzy; brak odpowiedzi w wyciągu = model
  ma powiedzieć to wprost zamiast zgadywać
- Zakazy twarde: ogłaszanie „odkryć", przedstawianie hipotez jako faktów,
  odpowiadanie poza kontekstem naukowym platformy
- Każda odpowiedź LLM oznaczona poziomem pewności z sześciostopniowej skali
  (identycznej jak w tym pliku) — wymuszone instrukcją w SYSTEM_PROMPT, nie
  weryfikowane automatycznie (LLM może się pomylić — patrz Ryzyka niżej)

**Warstwa 2 — zależności między laboratoriami (Etap 1)**
Graf powiązań utrzymywany ręcznie (jakość > automatyka), np.:
SEMF (Nuclear) ↔ skąd pierwiastki (Universe: supernowe) ↔ Atom (izotopy);
dylatacja (Space-Time) ↔ miony (Particle); rezonans Hoyle'a (Multiverse) ↔
synteza węgla (Nuclear/Universe).

**Warstwa 3 — analiza przebiegu użytkownika ("Stwórz eksperyment", zaimplementowana)**
Dostępna na każdym laboratorium. Bezpieczna przez konstrukcję: użytkownik
dobiera WYŁĄCZNIE wartości `lab.params` już zdefiniowanych przez laboratorium
— zero wykonywania własnego kodu, zero nowej powierzchni ataku. Nagrywa się
`RunSample[]` (`core/experimentRun.ts`, bufor kołowy 300 próbek ≈ 5 minut),
a `core/experimentAnalysis.ts` liczy trend (regresja liniowa), płaskość,
skoki i korelację Pearsona między dwiema najbardziej dynamicznymi
wielkościami — CZYSTA analiza danych, nie zgadywanie modelu. Wynik ma
dokładnie kształt `NarrationBlock[]`, więc trafia do TEGO SAMEGO
`NarratorPanel` i `askAI()`/backendu z groundingiem w `knowledge/<lab>.md`,
co reszta platformy — zero równoległej infrastruktury AI, jedna spójna
architektura. Presety parametrów zapisywane lokalnie
(`core/customExperiment.ts`, wzorzec identyczny z `discoveryLog.ts`).

## Korpus wiedzy pod RAG — ranking wg legalności
1. **OpenStax University Physics t. 1–3 — CC BY 4.0** — wolno komercyjnie
   z atrybucją; podstawowy korpus tekstowy
2. Dane NIST / NASA / PDG / CERN (domena publiczna / CC0) — grounding liczbowy
3. Wikipedia — CC BY-SA, uzupełniająco (share-alike!)
4. ⚠️ NIE wbudowywać: Feynman Lectures (tylko czytanie online), MIT OCW
   (klauzula NC), HyperPhysics (©), Wolfram (©/NC)

## Ryzyka i mitygacje
- Halucynacje → grounding + warstwa 0 liczy wszystko + testy regresyjne
  odpowiedzi na złotym zestawie pytań
- **Oznaczenie poziomu pewności jest wymuszone instrukcją w prompcie, nie
  zweryfikowane programowo** — model teoretycznie może przypisać złą gwiazdkę
  albo pominąć oznaczenie. Nie ma dziś automatycznego testu sprawdzającego
  TREŚĆ prawdziwej odpowiedzi LLM (wymagałby klucza API + oceny jakościowej,
  nie tylko strukturalnej). Uczciwie: to słabszy poziom gwarancji niż warstwa
  0 (tam liczby są matematycznie wymuszone, nie tylko wyinstruowane)
- Koszty → cache odpowiedzi na pytania powtarzalne; limity per user; model
  tani do parafraz, droższy tylko do pytań otwartych
- Prywatność dzieci (EDU) → tryb bez wysyłania czegokolwiek: warstwa 0
  pozostaje pełnowartościowym produktem offline

## Wnioski projektowe
1. Nigdy nie usuwać warstwy 0 — to bezpiecznik naukowy i tryb offline
2. Graf zależności międzylaboratoryjnych budować ręcznie od Etapu 1
3. Pierwsza funkcja LLM: „zapytaj o to, co widzisz" w kontekście symulacji —
   nie ogólny chat
