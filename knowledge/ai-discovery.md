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

**Warstwa 1 — LLM (Etap 1/2): zasady projektowe**
- Backend proxy trzyma klucz; frontend nigdy go nie widzi
- Prompt = stan symulacji (parametry+statystyki+etykieta uczciwości) +
  pytanie użytkownika; model odpowiada TYLKO w kontekście widocznej symulacji
- Grounding liczbowy: wartości wstrzykuje warstwa 0; LLM je opisuje, nie oblicza
- Zakazy twarde: ogłaszanie „odkryć", przedstawianie hipotez jako faktów,
  odpowiadanie poza kontekstem naukowym platformy
- Każda odpowiedź LLM oznaczona jako AI + poziom pewności

**Warstwa 2 — zależności między laboratoriami (Etap 1)**
Graf powiązań utrzymywany ręcznie (jakość > automatyka), np.:
SEMF (Nuclear) ↔ skąd pierwiastki (Universe: supernowe) ↔ Atom (izotopy);
dylatacja (Space-Time) ↔ miony (Particle); rezonans Hoyle'a (Multiverse) ↔
synteza węgla (Nuclear/Universe).

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
- Koszty → cache odpowiedzi na pytania powtarzalne; limity per user; model
  tani do parafraz, droższy tylko do pytań otwartych
- Prywatność dzieci (EDU) → tryb bez wysyłania czegokolwiek: warstwa 0
  pozostaje pełnowartościowym produktem offline

## Wnioski projektowe
1. Nigdy nie usuwać warstwy 0 — to bezpiecznik naukowy i tryb offline
2. Graf zależności międzylaboratoryjnych budować ręcznie od Etapu 1
3. Pierwsza funkcja LLM: „zapytaj o to, co widzisz" w kontekście symulacji —
   nie ogólny chat
