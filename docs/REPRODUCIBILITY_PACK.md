# REPRODUCIBILITY PACK — Genesis OS (P3.2)

## Jedno polecenie

```bash
npm ci
node scripts/repro-demo.mjs          # albo: npm run repro
```

Bez kluczy. Bez sieci. Bez stanu z poprzednich uruchomień. Wymaga wyłącznie
Node ≥ 22.5.0 (skrypt sam to sprawdza jako pierwszy krok i mówi, co zrobić,
jeśli runtime jest za stary).

**Kod wyjścia 0** = wszystkie dwanaście wyników zgodne z wartościami
oczekiwanymi zapisanymi w repo. **Kod wyjścia 1** = rozbieżność, z nazwą
każdego rozjechanego sprawdzenia.

## Dlaczego to nie jest „demo"

Demo pokazuje, że coś się uruchomiło. Ten skrypt **porównuje każdy wynik z
wartością oczekiwaną zapisaną w kodzie** (`EXPECTED` w
`scripts/repro-demo.mjs`) i kończy się błędem, gdy cokolwiek się zmieniło.
Recenzent nie musi wierzyć w wynik — uruchamia i patrzy na kod wyjścia.

Dowód, że potrafi zawieść (bez tego „12/12" nic nie znaczy): po cichej edycji
przypiętego payloadu PubChem (`MolecularWeight: "194.19"` → `"999.99"`)

```
$ node scripts/repro-demo.mjs ; echo $?
Error: Kotwica odmówiła: Odcisk przypiętego payloadu kotwicy
"pubchem-cid-2519-molecular-weight" nie zgadza się z zadeklarowanym
(470de276 → 494e168b). Payload został zmieniony po przypięciu, więc obserwacja
nie jest już tą, którą zadeklarowano. Odmawiam użycia jej jako dowodu.
1
```

## Oczekiwane wyjście (commit `c181668`, Node v22.22.2)

```
GENESIS OS — PAKIET ODTWARZALNOŚCI
commit c181668664b3b610cf396ce9e17103a3e51ed7a4 (git) · node v22.22.2

  OK    P0.1 runtime                       v22.22.2 (wymagane >= 22.5.0), node:sqlite dostępny
  OK    P0.2 trwałość                      ścieżka /data/genesis.db → PERSISTENT
  OK    P0.2 drill backup→restore          snapshot 12288 B; po restore wiersze=[anchor-1]
  OK    P0.3 tożsamość wydania             commit c181668 (źródło: git)
  OK    P0.4 kontrakt .env                 27 zmiennych w kodzie, 29 udokumentowanych, brakuje 0
  OK    P2.3 kotwica: werdykt              SUPPORTED_WITHIN_PROTOCOL
  OK    P2.3 kotwica: obserwacja zewnętrzna 194.19 g/mol, pochodzenie REFERENCE
  OK    P2.3 kotwica: predykcja Genesis    194.194 g/mol
  OK    P2.3 kotwica: odcisk i replay      prediction-verification_c5c0af94 / MATCH
  OK    QE3 dochodzenie: przebieg          2 rundy, sondy whiteNoise=[1, 0]
  OK    QE3 dochodzenie: falsyfikacja      ocalała [h:a-0.4], sfalsyfikowane [h:a-0.2, h:a-0.6, h:a-0.8]
  OK    QE3 dochodzenie: prowieniencja     SIMULATED

  WYNIK: 12/12 zgodne z wartościami oczekiwanymi w repo.
```

`commit` będzie inny przy nowszym HEAD — to jedyne pole, które ma się zmieniać,
i dlatego skrypt sprawdza jego ŹRÓDŁO (`git`/`env`), a nie wartość.

## Co dokładnie jest sprawdzane i dlaczego akurat to

| # | Sprawdzenie | Dowodzi |
|---|---|---|
| 1 | Bramka runtime | Bez Node ≥ 22.5.0 `node:sqlite` nie istnieje i cała trwałość umiera przy rozwiązywaniu modułu (P0.1) |
| 2 | Klasyfikacja trwałości | `/data/genesis.db` jest POZA drzewem aplikacji, więc przeżyje redeploy (P0.2) |
| 3 | Drill backup→restore | Snapshot robiony na OTWARTEJ bazie w trybie WAL zawiera wiersz z `-wal` i **nie** zawiera wiersza dopisanego po nim — czyli `VACUUM INTO` naprawdę daje spójną kopię, a `cp` by nie dał |
| 4 | Tożsamość wydania | Da się powiedzieć, KTÓRY kod to jest (P0.3) |
| 5 | Kontrakt `.env` | Deklaracja pokrywa każdą zmienną, którą kod czyta (P0.4) |
| 6–9 | Kotwica zewnętrzna | Obserwacja pochodzi z przypiętego, sumowanego, cytowanego zbioru zewnętrznego; werdykt, odcisk i replay MATCH są odtwarzalne (P2.3) |
| 10–12 | Dochodzenie QE3 | Autonomiczna pętla wybiera sondy, falsyfikuje 3 z 4 hipotez i odzyskuje ukryty parametr; prowieniencja jest oznaczona jako SIMULATED, bo nią jest |

## Trzy rzeczy, których ten pakiet NIE dowodzi

1. **Kotwica nie jest pomiarem przyrody.** PubChem swojej masy molowej też nie
   mierzy — liczy ją z wzoru. To jest weryfikacja wobec niezależnego ŹRÓDŁA,
   nie test empiryczny. Skrypt wypisuje to zdanie przy każdym uruchomieniu, a
   nie tylko tutaj.
2. **QE3 nie testuje fizyki.** Kryterium PPT i CCNR są twierdzeniami algebry,
   którą model liczy dokładnie. Dochodzenie testuje, czy pętla potrafi wybrać
   rozstrzygający pomiar i odzyskać ukryty parametr — nie czy mechanika
   kwantowa jest prawdziwa. Dlatego prowieniencja to `SIMULATED`.
3. **Nie dowodzi wdrożenia.** To jest odtworzenie wyników, nie test hostingu.
   Redeploy kontenerowy z woluminem pozostaje `NOT VERIFIED` (patrz
   `RISKS.md` R-006).

## Gdy zbiór zewnętrzny zostanie ŚWIADOMIE zaktualizowany

Odcisk jest literałem w źródle (`externalAnchor.ts`), a nie wyliczeniem — to
było celowe i wynikło z realnego błędu opisanego w tym pliku i w `DECISIONS.md`
D-014. Po podmianie payloadu:

```bash
node scripts/repro-demo.mjs --update    # wypisze nowe wartości
# → wstaw nowy payloadDigest do externalAnchor.ts, nowe EXPECTED do repro-demo.mjs
# → zaktualizuj asercję literału w externalObservationAnchor.test.ts
```

Trzy miejsca, celowo. Aktualizacja obserwacji zewnętrznej ma być decyzją, nie
efektem ubocznym edycji pliku.
