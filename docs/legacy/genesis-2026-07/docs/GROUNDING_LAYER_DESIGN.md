# Grounding Layer — projekt architektury

**Status:** zaakceptowany projekt (Etap 1). Implementacja: `packages/backend/src/cognitive/groundingLayer.mjs`.
**Cel:** architektonicznie uniemożliwić „molecular hallucination" w AI Chat — żadne
zdanie odpowiedzi AI zawierające konkretną wartość liczbową lub twierdzenie o
właściwości cząsteczki nie trafi do użytkownika, jeśli nie ma pokrycia w REALNYM
wywołaniu RDKit wykonanym w tej samej rozmowie.

To nie jest prompt engineering ("proszę, nie zmyślaj") — to deterministyczny
strażnik na wyjściu, który **weryfikuje** każde twierdzenie liczbowe przeciw
policzonym faktom i **fail-closed** usuwa/oznacza to, czego nie da się potwierdzić.

Warstwa **rozszerza**, nie zastępuje, istniejący kontrakt uczciwości
(`computed_by: "RDKit"`, `BLOCKED_BY_RUNTIME`, stan „AI niedostępny"). Gdy AI jest
niedostępne, warstwa jest bezczynna (nie ma czego weryfikować).

---

## 1. Gdzie w przepływie danych — przed czy po wysłaniu?

**Decyzja: interceptor PO wygenerowaniu odpowiedzi przez model, ale PRZED
dostarczeniem jej do użytkownika** (output guardrail / post-generation filter).

```
użytkownik → pytanie → [model LLM] → surowa odpowiedź
                                          │
                                          ▼
                          ┌───────────────────────────────┐
                          │  GROUNDING LAYER (ten moduł)   │
                          │  1. wyodrębnij twierdzenia     │
                          │  2. zweryfikuj przeciw         │
                          │     rejestrowi obliczeń        │
                          │  3. polityka: pass/redact/block│
                          └───────────────────────────────┘
                                          │
                                          ▼
                        odpowiedź ugruntowana → użytkownik
```

**Uzasadnienie:** twierdzenia da się weryfikować dopiero gdy istnieją — czyli po
generacji. „Przed" nie ma sensu (nie ma czego sprawdzać). Umieszczenie warstwy w
`server.mjs → handleAsk`, opakowującej wynik modelu tuż przed `res.json`, daje
jeden, obowiązkowy punkt kontroli, którego nie da się obejść z frontendu.

Warstwa jest **czysta i synchroniczna względem tekstu** (poza opcjonalnym
compute-on-demand, patrz §5), więc nie zmienia kształtu API czatu.

---

## 2. Reprezentacja „co realnie policzono w tej rozmowie" — rejestr sesyjny

**Decyzja: sesyjny rejestr faktów, kluczowany kanonicznym SMILES.**

```
GroundingRegistry = Map<canonicalSmiles, {
  properties: Map<propertyKey, { value, source, at }>,   // np. molWt → {180.159, 'RDKit.descriptors', t}
  recordedAt
}>
```

- **Klucz = kanoniczny SMILES** (przez RDKit `canonicalSmiles`), więc `OCC` i
  `CCO` trafiają w ten sam wpis — nie da się oszukać wariantem zapisu.
- **Wartość = mapa policzonych właściwości** z prowieniencją (które wywołanie je
  dało). To jedyne źródło prawdy dla weryfikacji.
- Rejestr zasilają DWA źródła:
  1. **Pasywnie** — każde realne obliczenie, które sesja już wykonała (np.
     użytkownik policzył aspirynę w Laboratory Readiness → wpis dla aspiryny).
  2. **Aktywnie (compute-on-demand)** — gdy weryfikacja natrafi na twierdzenie o
     molekule o znanym SMILES, której jeszcze nie policzono, warstwa sama woła
     `rdkitAdapter.descriptors/inchi` i zapisuje wynik do rejestru (cache).
- Zakres v1: rejestr trzyma **skalarne deskryptory RDKit** (`molWt`, `crippenLogP`,
  `tpsa`, `hbd`, `hba`, `rotatableBonds`, `aromaticRings`, `lipinskiViolations`,
  …) + `inchiKey` + `molecularFormula`. Właściwości, których RDKit NIE liczy
  (toksyczność, reaktywność, powinowactwo) są **niegruntowalne przez RDKit** —
  patrz §4 (domyślnie: niepotwierdzone, chyba że w rejestrze jest realny wynik
  ADMET/dokowania — interfejs rejestru jest na to otwarty).
- Zakres życia: **jedna rozmowa** (in-memory). To wystarcza do wymogu „w tej
  samej rozmowie" i jest trywialnie tanie.

---

## 3. Wykrywanie twierdzeń — parsowanie tekstu vs strukturalne wymuszenie

Rozważono oba:

### (A) Parsowanie swobodnego tekstu (regex/NLP)
- **Zalety:** działa nawet gdy model nie współpracuje; nie wymaga zmiany modelu.
- **Wady:** (a) nie wiąże niezawodnie liczby z właściwą molekułą, (b) nie wie
  pewnie o którą właściwość chodzi, (c) PL+EN i nieskończoność sformułowań, (d)
  fałszywe trafienia („w 2020 roku", „pH 7", „3 pierścienie"). Recall i precision
  słabe. Poleganie WYŁĄCZNIE na tym daje **złudne** poczucie bezpieczeństwa.

### (B) Strukturalne wymuszenie formatu odpowiedzi
Model zwraca, obok prozy, maszynowo-czytelny blok twierdzeń:
```genesis-claims
[{ "smiles": "CC(=O)Oc1ccccc1C(=O)O", "property": "molWt", "value": 180.16, "unit": "g/mol" }]
```
- **Zalety:** każde twierdzenie jest jawne, z molekułą i właściwością → weryfikacja
  deterministyczna 1:1 przeciw rejestrowi. To wzorzec „attributed / constrained
  generation" (cytowanie wyniku narzędzia). Blok jest **wewnętrzny** — warstwa go
  usuwa z tekstu dla użytkownika.
- **Wady:** wymaga, by model współpracował; model MOŻE przeciec liczbę do prozy bez
  zadeklarowania jej.

### Decyzja: **(B) jako mechanizm główny + (A) jako siatka bezpieczeństwa (defense-in-depth).**

Uzasadnienie: strukturalne twierdzenia dają pewną, jednoznaczną weryfikację i są
architektonicznie właściwym rozwiązaniem. Ale ponieważ nie możemy w 100% ufać, że
model NIGDY nie przeciecze liczby do prozy, **zawsze** dokładamy skan tekstu, który
wykrywa „gołe" liczby przy słowach-kluczach właściwości (masa/MW, LogP, TPSA,
HBD/HBA…) i sprawdza, czy są pokryte zweryfikowanym twierdzeniem. Liczba w prozie
bez pokrycia → traktowana jak niepotwierdzona (§4). Dwa mechanizmy łapią różne
klasy błędów; razem dają fail-closed.

Dziś (brak klucza modelu) moduł i tak jest gotowy: przyjmuje `claims` gdy są, a
skan tekstu działa zawsze. Po podłączeniu modelu system-prompt poinstruuje go, by
emitował blok `genesis-claims`.

---

## 4. Twierdzenie bez pokrycia — zablokować całość czy oznaczyć fragment?

Rozważono oba, plus wariant trzeci:

| Polityka | Zachowanie | Ryzyko fabrykacji | Użyteczność | Latencja |
|---|---|---|---|---|
| `block` (zablokuj całość + poproś o poprawkę) | cała odpowiedź → uczciwa odmowa + lista niezweryfikowanych | zero | niska (traci dobrą treść), może pętlić | +runda do modelu |
| `redact` (**domyślna**) | usuń KONKRETNĄ niepotwierdzoną wartość, wstaw jawny znacznik, zostaw resztę | zero (liczba nie dociera) | wysoka (reszta odpowiedzi zostaje) | brak |
| `annotate` | pokaż wartość z tagiem „niepotwierdzone" | **niezerowe** (wiarygodna liczba wciąż widoczna) | wysoka | brak |

**Decyzja: domyślnie `redact` (fail-closed redakcja); `block` jako opcja
wysokiego rygoru; `annotate` tylko do debugowania.**

Uzasadnienie „bezpieczniejsze dla uczciwości": kluczowe kryterium to *„użytkownik
nigdy nie zobaczy niezweryfikowanej wartości molekularnej jako faktu"*. Zarówno
`block`, jak i `redact` spełniają to w 100% (żadna nieugruntowana liczba nie
dociera). `redact` jest przy tym równie bezpieczny na osi „brak fabrykacji", a
BARDZIEJ użyteczny (nie wyrzuca całej, często poprawnej reszty) i bez dodatkowej
latencji. `annotate` odrzucony jako domyślny, bo oznaczona-ale-widoczna wiarygodna
liczba wciąż może zmylić.

**Sprzeczność (contradiction) traktowana ostrzej niż brak danych:** jeśli podana
wartość *jest policzona* w rejestrze, ale różni się od niej poza tolerancją (§ niżej)
— to twardy sygnał halucynacji. Taka wartość jest **zawsze** redagowana (nigdy nie
pokazujemy liczby, o której WIEMY, że jest błędna), niezależnie od trybu, i
oznaczana wyraźniej niż zwykły brak pokrycia.

### Tolerancje dopasowania (podana wartość vs policzona)
Weryfikujemy, czy AI **cytuje NASZ policzony wynik** (nie własne zgadywanie), więc
tolerancje są na poziomie zaokrąglenia:

| Właściwość | Tolerancja |
|---|---|
| `molWt`, `exactMolWt` | ±0.5 g/mol |
| `crippenLogP` | ±0.2 |
| `tpsa` | ±1.0 Å² |
| `hbd`, `hba`, `rotatableBonds`, `aromaticRings`, `ringCount`, `lipinskiViolations`, `heavyAtomCount`, `formalCharge` | dokładnie (int) |
| `inchiKey`, `molecularFormula` | dokładnie (string) |

W tolerancji → **verified**; poza → **contradicted**; brak w rejestrze i brak
compute-on-demand → **unverified**.

---

## 5. Wydajność — brak zauważalnego opóźnienia

- **Rejestr:** lookup O(1) (hash po SMILES). Skan tekstu: regex po krótkiej
  odpowiedzi = mikrosekundy.
- **Jedyny realny koszt = compute-on-demand RDKit** (~50–200 ms/subproces). Minimalizacja:
  - `descriptors` liczy WSZYSTKIE skalary naraz → **jedno** wywołanie gruntuje
    MW/LogP/TPSA/HBD/HBA/… dla danej molekuły.
  - wynik trafia do **cache** rejestru → kolejne twierdzenia o tej samej molekule
    są darmowe (także w następnych turach rozmowy).
  - liczba wywołań ograniczona liczbą RÓŻNYCH molekuł w odpowiedzi (zwykle 1–2) i
    twardym **capem per odpowiedź** (`maxOnDemand`, domyślnie 4); nadmiar → fail-closed.
  - compute-on-demand jest **wstrzykiwalny** (`compute`), więc w trybie „tekst-only"
    (bez zgody na dodatkowe wywołania) można go wyłączyć i polegać wyłącznie na
    rejestrze — wtedy zerowy narzut.
- **Flaga włącz/wyłącz** (`enabled`): gdy wyłączona lub gdy AI niedostępne, warstwa
  to czysty pass-through — istniejące działanie czatu nietknięte.
- Dziś, przy braku klucza modelu, warstwa nie dotyka realnego ruchu (nie ma
  odpowiedzi AI do weryfikacji) — koszt produkcyjny = 0.

---

## Kontrakt modułu (Etap 2)

```
createRegistry() → registry
registry.record(smiles, propertiesObj, source?)   // pasywne zasilenie
registry.lookupCanonical(canonicalSmiles) → factMap | null

groundAnswer(answerText, {
  registry,
  claims?,            // strukturalne twierdzenia z modelu (opcjonalne)
  activeSmiles?,      // molekuła kontekstowa dla gołych liczb w prozie
  compute?,           // (smiles) → { descriptors, inchi }  — compute-on-demand
  canonicalize?,      // (smiles) → canonicalSmiles         — RDKit
  policy = 'redact',  // 'redact' | 'block' | 'annotate'
  maxOnDemand = 4,
  enabled = true,
}) → {
  status: 'grounded' | 'redacted' | 'blocked' | 'disabled',
  text,               // tekst dostarczony użytkownikowi (bez bloku claims)
  verifications: [{ property, smiles, stated, computed, verdict }],
  redactions: [...],  // co usunięto/oznaczono
}
```

Moduł jest **niezależny** od AI Chat i włączany jednym flagiem; domyślnie
wstrzykuje realny `rdkitAdapter`, ale w testach dostaje atrapy (deterministycznie,
bez subprocesów).

---

## Otwarte pytania (świadomie nierozstrzygnięte)

1. **Referencja międzycząsteczkowa w prozie** („to", „ten związek") gdy w grze jest
   wiele molekuł — którego SMILES dotyczy goła liczba? v1: heurystyka „aktywna
   molekuła" (`activeSmiles`, ostatnio policzona/wspomniana); przypadki
   niejednoznaczne → fail-closed (niepotwierdzone). Do dopracowania.
2. **Twierdzenia jakościowe** („silnie lipofilowy", „słabo rozpuszczalny") — nie są
   konkretną liczbą; v1 poza zakresem (skupiamy się na liczbach + InChIKey).
3. **Twierdzenia zakresowe** („MW 150–200") — v1 traktuje jako niepotwierdzone,
   dopóki nie rozszerzymy dopasowania o przedziały.
4. **Kompletność leksykonu właściwości (PL/EN)** — lista słów-kluczy jest
   utrzymywalna, ale nie wyczerpująca; do rozbudowy wraz z realnym ruchem.
5. **Właściwości spoza RDKit** (toksyczność/ADMET, dokowanie) — interfejs rejestru
   je dopuszcza, ale v1 nie liczy ich on-demand; taki wynik musi wcześniej trafić
   do rejestru z realnego modułu (ADMET-AI/Vina), inaczej twierdzenie = niepotwierdzone.
