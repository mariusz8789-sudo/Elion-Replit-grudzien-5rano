# OPS RUNBOOK — Genesis OS

Konfiguracja operacyjna: alerty niedostępności, retencja logów, backup i
restore. **Status całego dokumentu: PRZYGOTOWANE, NIE ZASTOSOWANE** — zastosowanie
wymaga (a) wyboru platformy hostingu i (b) pisemnej zgody na wdrożenie. Oba są
świadomie wstrzymane; patrz `DECISIONS.md` D-008.

Wszystko poniżej, co jest KODEM, jest zweryfikowane wykonaniem (patrz
`P0_EVIDENCE.md`). Wszystko, co jest KONFIGURACJĄ HOSTA, jest gotowe do
wklejenia i oznaczone jako niezastosowane — nie twierdzę, że alerty działają,
bo nie ma jeszcze gdzie ich włączyć.

---

## 1. Sonda zdrowia — co naprawdę raportuje

`GET /api/health` (nieuwierzytelniony, bez ujawniania ścieżek hosta):

```json
{
  "ok": true,
  "version": "1.0.0",
  "commit": "0847ab78ed5a7feb7b4f34ad43741f2c0ec42d06",
  "commitShort": "0847ab7",
  "commitSource": "git",
  "builtAt": null,
  "uptimeSec": 0,
  "ai": "no-key",
  "static": true,
  "knowledgeLabs": 15,
  "db": { "state": "ready", "ok": true, "durability": "PERSISTENT", "persistent": true },
  "persistence": "ready",
  "toolchain": [ { "id": "rdkit", "status": "...", "version": null }, ... ]
}
```

Pola, na których warto budować alerty, i dlaczego akurat one:

| Pole | Alert gdy | Dlaczego to jest realny sygnał |
|---|---|---|
| brak odpowiedzi / HTTP != 200 | 2 kolejne próby | proces nie żyje albo nie przyjmuje ruchu |
| `db.ok` | `false` | **wykonane** zapytanie kontrolne nie przeszło; poprzednia wersja endpointu nie potrafiła tego zobaczyć (sprawdzała tylko, czy obiekt bazy nie jest nullem) |
| `db.persistent` | `false` na produkcji | dane NIE przeżyją redeployu (P0.2); poprawne dla demo, nigdy dla instancji z kontami |
| `commitSource` | `unavailable` | obraz zbudowany bez `--build-arg GENESIS_COMMIT` — nie da się powiedzieć, który kod stoi na produkcji |
| `commit` | zmiana nieoczekiwana | wdrożenie, którego nikt nie zlecił |
| `toolchain[].status` | przejście na `BLOCKED_BY_RUNTIME` | silnik naukowy przestał być dostępny — wyniki z tej domeny znikną, a nie „się pogorszą" |

Obraz ma już wbudowany `HEALTHCHECK` odpytujący ten endpoint co 30 s
(`Dockerfile`), więc orchestrator kontenerów restartuje proces sam. To NIE jest
alert: restart bez powiadomienia ukrywa incydent zamiast go zgłosić.

## 2. Alerty niedostępności — gotowa konfiguracja (NIE ZASTOSOWANA)

Zewnętrzna sonda jest wymagana: healthcheck wewnątrz kontenera nie zauważy, że
cały kontener/host nie odpowiada.

Niezależnie od dostawcy, minimalny zestaw:

- **Sonda HTTP** `GET https://<host>/api/health` co 60 s z ≥2 lokalizacji.
- **Warunek alarmu**: 2 kolejne porażki (jedna = szum sieciowy).
- **Asercja treści**, nie tylko kodu: `ok == true` ORAZ `db.ok == true`. Bez
  drugiego warunku instancja z martwą bazą raportuje 200 i wygląda zdrowo.
- **Kanał**: e-mail + jeden kanał natychmiastowy. Przy bus factor = 1 (patrz
  `docs/RISKS.md`) alert idący tylko na e-mail bywa zauważony po dniach.

Warianty do wklejenia po wyborze platformy:

```yaml
# Uptime Kuma / Healthchecks.io (self-host lub SaaS, niezależne od hostingu app)
monitor:
  type: http
  url: https://HOST/api/health
  interval: 60
  retries: 2
  accepted_statuscodes: ["200"]
  keyword: '"db":{"state":"ready"'   # treść, nie tylko status
```

```yaml
# Fly.io — fly.toml (sonda platformy; alerty i tak przez zewnętrzny monitor)
[[http_service.checks]]
  interval  = "30s"
  timeout   = "3s"
  method    = "GET"
  path      = "/api/health"
```

```yaml
# Railway / Render — healthcheckPath w konfiguracji usługi
healthcheckPath: /api/health
healthcheckTimeout: 5
```

## 3. Retencja logów — decyzja i konfiguracja (NIE ZASTOSOWANA)

Backend loguje JSON-liniami na stdout (`server.mjs::log`) — więc retencja jest
w całości sprawą hosta i nie wymaga zmiany kodu. To celowe: aplikacja, która
sama rotuje pliki logów, dubluje mechanizm, który każda platforma ma lepszy.

- **Minimum**: 30 dni. Uzasadnienie: cykl recenzji grantowej i typowy czas
  między „coś było nie tak w zeszłym miesiącu" a pytaniem o dowód.
- **Zalecane**: 90 dni dla linii `level: "error"` i `level: "warn"`.
- **Czego NIE logujemy i co to znaczy dla retencji**: logi nie zawierają
  treści pytań do AI ani haseł; zawierają e-mail tylko tam, gdzie jest częścią
  błędu walidacji. Przy 30–90 dniach nie powstaje więc długoterminowy zbiór
  danych osobowych.

```bash
# Docker (jeśli host nie ma własnego agregatora)
--log-driver json-file --log-opt max-size=20m --log-opt max-file=5
```

## 4. Backup i restore — zweryfikowane wykonaniem

Kod: `scripts/db-backup.mjs`, `scripts/db-restore.mjs`,
`packages/backend/src/dbDurability.mjs`. Dowody: `P0_EVIDENCE.md` P0.2.

```bash
# Snapshot + retencja (cron/scheduled job hostingu). Exit 1 = snapshot NIE powstał.
GENESIS_DB_PATH=/data/genesis.db GENESIS_BACKUP_DIR=/data/backups \
  node scripts/db-backup.mjs --keep 14

# Restore. Bez --overwrite ODMAWIA nadpisania żywej bazy.
node scripts/db-restore.mjs --from /data/backups/genesis.db.20260912T144053Z.bak \
                            --to /data/genesis.db --overwrite
```

Zalecany harmonogram: co 6 h, `--keep 28` (7 dni historii). `VACUUM INTO`
blokuje bazę na czas snapshotu — przy 471 kB to milisekundy, ale przy bazie
instytucjonalnej rzędu GB trzeba to przeliczyć, zanim harmonogram się zagęści.

### Pliki backupu są materiałem WRAŻLIWYM — i to jest ustalenie, nie ostrożność

`store.mjs::createSession` zapisuje **token sesji w postaci jawnej** w tabeli
`sessions`. Snapshot bazy zawiera więc żywe tokeny, których można użyć
bezpośrednio do końca ich TTL. Skutki dla operacji:

- katalog backupów: prawa `700`, właściciel = użytkownik procesu,
- backupy poza woluminem: wyłącznie zaszyfrowane w spoczynku,
- po restore z kopii starszej niż incydent: wyczyścić tabelę `sessions`
  (wszyscy się przelogują) — inaczej odtwarza się także tokeny sprzed incydentu.

Właściwa naprawa (hash tokenów w spoczynku) jest zgłoszona jako OPEN w
`docs/RISKS.md`, nie ukryta tutaj jako procedura obejściowa.

## 5. Drill przywracania — jak go powtórzyć

Restore drill jest częścią suite'u, więc nie zależy od tego, czy ktoś pamięta o
jego wykonaniu:

```bash
npm run test --workspace=packages/backend   # zawiera dbDurability.test.mjs
```

Dwa testy, które są tym drillem: `P0.2 RESTORE DRILL` (backup spójny przy WAL,
celowo bez zamykania bazy przed snapshotem) oraz `P0.2 REDEPLOY` (rekord
utworzony przez HTTP przeżywa wymianę procesu ORAZ katalogu wdrożenia).

**NOT VERIFIED**: redeploy na poziomie kontenera z zamontowanym woluminem — w
tym środowisku nie ma dostępu do demona Dockera. Zweryfikowana jest wymiana
procesu i katalogu; zachowanie montowania woluminu przez platformę nie.
