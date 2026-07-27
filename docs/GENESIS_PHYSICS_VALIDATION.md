# Genesis — Pakiet Weryfikacyjny (fizyka)

**Dla recenzenta z wykształceniem fizycznym. Czas potrzebny: ok. 10 minut.**

Ten dokument nie jest prezentacją produktu. Jest **zaproszeniem do falsyfikacji**.
Poniżej są liczby, które Genesis wylicza, zestawione z wartościami opublikowanymi
(NASA Planetary Fact Sheets, ocena mas atomowych AME). Wszystkie pochodzą
z jednego uruchomienia automatycznego testu — nie zostały przepisane ręcznie.

Odtworzenie u siebie:

```bash
cd packages/frontend
npm install
npm run validate:physics
```

Źródło: [`src/__tests__/referenceValidation.test.ts`](../packages/frontend/src/__tests__/referenceValidation.test.ts).
Test przechodzi **tą samą ścieżką co interfejs użytkownika**
(`evaluateCandidate` → wykonywalny Graf Modeli → `core/physics.ts`), więc zielony
wynik jest stwierdzeniem o produkcie, a nie o atrapie testowej.

---

## 1. Temperatura równowagowa planety

Model: `T_eq = 278,5 · ((1−A)·L⋆/a²)^¼` — bilans promienisty, albedo Bonda.
Odniesienie: *black-body temperature* z kart NASA.

| Ciało   | Genesis [K] | NASA [K] | Δ [K]  |
|---------|-------------|----------|--------|
| Merkury | 439,9       | 440,1    | −0,23  |
| Wenus   | 226,8       | 226,6    | +0,22  |
| Ziemia  | 254,2       | 254,0    | +0,19  |
| Księżyc | 270,5       | 270,6    | −0,10  |
| Mars    | 209,9       | 209,8    | +0,14  |
| Jowisz  | 109,9       | 110,0    | −0,09  |

**Maksymalne odchylenie: 0,23 K w zakresie 110–440 K.** Test wymusza < 0,5 K.
Sprawdzana jest też zależność skalująca `T ∝ a^(−1/2)` (czterokrotne oddalenie
orbity musi dokładnie połowić temperaturę).

## 2. Prędkość ucieczki

Model: `v_esc = √(2GM/R)`.

| Ciało   | Genesis [km/s] | Publikowana [km/s] | Błąd    |
|---------|----------------|--------------------|---------|
| Merkury | 4,25           | 4,30               | −1,14 % |
| Wenus   | 10,36          | 10,36              | +0,01 % |
| Ziemia  | 11,19          | 11,19              | −0,04 % |
| Księżyc | 2,38           | 2,38               | −0,18 % |
| Mars    | 5,02           | 5,03               | −0,27 % |
| Jowisz  | 59,56          | 59,50              | +0,10 % |

Najgorszy przypadek (Merkury) wynika z zaokrąglenia wartości odniesienia do
dwóch cyfr znaczących, nie z modelu.

## 3. Energia wiązania na nukleon (SEMF vs eksperyment)

Model: półempiryczny wzór masowy Weizsäckera,
`B = a_V·A − a_S·A^⅔ − a_C·Z(Z−1)/A^⅓ − a_A·(A−2Z)²/A ± δ`,
ze współczynnikami `a_V=15,8 · a_S=17,8 · a_C=0,711 · a_A=23,7 · δ=11,18` MeV.

| Nuklid | A   | Genesis [MeV] | Eksperyment [MeV] | Δ [MeV] |
|--------|-----|---------------|-------------------|---------|
| He-4   | 4   | 5,760         | 7,074             | −1,314  |
| C-12   | 12  | 7,518         | 7,680             | −0,162  |
| O-16   | 16  | 7,923         | 7,976             | −0,053  |
| Ca-40  | 40  | 8,664         | 8,551             | +0,113  |
| Fe-56  | 56  | 8,896         | 8,790             | +0,106  |
| Ni-62  | 62  | 8,913         | 8,795             | +0,118  |
| Zr-90  | 90  | 8,799         | 8,710             | +0,089  |
| Sn-120 | 120 | 8,598         | 8,504             | +0,094  |
| Pb-208 | 208 | 7,907         | 7,867             | +0,040  |
| U-238  | 238 | 7,675         | 7,570             | +0,105  |

**Dla A ≥ 40 maksymalne odchylenie wynosi 0,118 MeV/nukleon (≈ 1,4 %)** — test
wymusza < 0,15 MeV. Skanowanie doliny stabilności lokalizuje maksimum krzywej
wiązania przy **A = 58 (8,915 MeV)**; eksperymentalnie jest ono przy Ni-62
(8,795 MeV). To znane przesunięcie modelu kroplowego, nie błąd implementacji.

---

## 4. Gdzie ten model jest JAWNIE zły

To jest najważniejsza sekcja dokumentu. Każde z poniższych odchyleń jest
**zapisane w kodzie jako asercja testowa** — jeżeli ktoś w przyszłości „naprawi"
je bez dołożenia brakującej fizyki, zestaw testów się wywali. Model uproszczony,
który myli się po cichu, jest bezwartościowy; model, którego koperta błędu jest
zmierzona i wymuszona, jest użyteczny.

**a) SEMF nie widzi struktury powłokowej.**
He-4 odchyla się o **1,314 MeV/nukleon (19 %)** — jądro podwójnie magiczne
z klasteryzacją α. Model kroplowy nie ma powłok, więc *musi* tu zawieść.
Test wymaga, żeby to odchylenie pozostało widoczne (> 0,5 MeV).

**b) Kryterium Jeansa liczone w T_eq, a nie w temperaturze egzobazy.**
Ziemia + H₂ daje **λ = 59,2**, więc model orzeka „atmosfera utrzymana". W
rzeczywistości Ziemia traci wodór — przy egzobazie ~1000 K jest λ ≈ 7 (< 15).
Model jest systematycznie **optymistyczny** dla lekkich gazów.

**c) Kryterium termiczne jest konieczne, ale nie wystarczające.**
Księżyc + N₂ daje **λ = 35,1** → model orzeka „utrzymana". Księżyc nie ma
atmosfery: brakuje źródła, a dominują procesy nietermiczne (wiatr słoneczny,
brak pola magnetycznego). Adapter deklaruje to wprost w `honestyNote`, a paszport
kandydata nigdy nie mówi „odkrycie" — mówi „spełnia podane progi w ramach
ważności modelu".

---

## 5. Co to dowodzi, a czego NIE dowodzi

**Dowodzi:**
- Warstwa fizyczna liczy realne, zamkniętoformułowe modele i odtwarza wartości
  z literatury w zadeklarowanych granicach dokładności.
- System zna i publikuje własne granice ważności — a granice te są egzekwowane
  automatycznie, nie deklaratywnie.
- Wynik jest odtwarzalny jednym poleceniem przez osobę z zewnątrz.

**NIE dowodzi:**
- Nie mówi nic o warstwie chemicznej (RDKit) — ta ma osobną weryfikację
  (deterministyczne hashe SHA-256 i proweniencja per-deskryptor).
- Nie mówi nic o jakichkolwiek zdolnościach „AI" ani predykcyjnych.
- Nie stanowi walidacji naukowej całego systemu. Objęte są **dwa** adaptery
  dziedzinowe i sześć wielkości fizycznych. To dokładnie tyle, ile tu napisano —
  ani grama więcej.

## 6. Czego szukam u recenzenta

Trzy konkretne pytania, na które przydałaby się odpowiedź specjalisty:

1. Czy współczynniki SEMF w `core/physics.ts` to zestaw, którego byś użył, czy
   wolałbyś inny (np. dopasowanie z parametryzacją powłokową)?
2. Czy warto przenieść kryterium Jeansa na temperaturę egzobazy jako parametr
   wejściowy — czy to już przekracza granicę, gdzie model uproszczony przestaje
   być uczciwy i trzeba sięgnąć po ucieczkę hydrodynamiczną?
3. Który **trzeci** adapter dziedzinowy miałby realną wartość naukową i dałby się
   oprzeć o zamkniętoformułowy model o znanej kopercie błędu?
