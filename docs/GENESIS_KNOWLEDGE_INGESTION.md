# Genesis Knowledge Ingestion

**Status:** zaimplementowany i zwalidowany lokalnie

**Wersja kontraktu ingestu:** `1.0.0`

**Zakres:** materiały naukowe przesyłane przez użytkownika w obrębie prywatnego projektu Genesis.

> Knowledge Ingestion przechowuje i udostępnia źródło użytkownika. Nie uznaje go automatycznie za fakt, nie modyfikuje modelu, nie uruchamia solvera i nie tworzy drugiego Knowledge Registry.

## Cel i granice

Moduł pozwala dodać do projektu plik PDF, TXT, Markdown lub JSON, zachować jego niezmieniony oryginał, utworzyć wersję i hash SHA-256 oraz wyszukać wyekstrahowany tekst w Science Chat. Materiał jest zawsze oznaczony jako `USER_PROVIDED_UNREVIEWED`. Stanowi źródło kontekstowe, a nie wynik eksperymentu i nie jest instrukcją wykonawczą dla silnika naukowego.

| Gwarancja | Realizacja |
|---|---|
| Jeden rejestr wiedzy | Tabele `knowledge_materials` i `knowledge_material_versions` są częścią istniejącego trwałego magazynu projektu. |
| Oryginał artefaktu | Bajty pliku są zapisywane w wersji materiału; endpoint `content` zwraca je wyłącznie członkowi projektu. |
| Integralność | `contentSha256` jest liczony z oryginalnych bajtów SHA-256. |
| Wersjonowanie | Ten sam stabilny klucz tytułu tworzy kolejną, niezmienną wersję, nie nadpisuje źródła. |
| Proweniencja | Zapisywane są: rodzaj źródła, czas ingestu, URL źródłowy, hash, metoda i wynik ekstrakcji oraz `solverEffect: NONE`. |
| Granica epistemiczna | Każdy upload otrzymuje status `USER_PROVIDED_UNREVIEWED`; klient nie może zadeklarować własnego statusu faktu. |
| Granica obliczeniowa | Plik nie zmienia parametrów, modelu, World State, Event Engine ani wyniku solvera. |

## Przepływ danych

```text
Użytkownik
  → CloudProjectsScreen
  → POST /api/projects/:projectId/knowledge-materials
  → prepareKnowledgeUpload()
       ├─ walidacja nazwy, MIME, rozszerzenia i base64
       ├─ weryfikacja sygnatury PDF
       ├─ zachowanie oryginalnych bajtów
       ├─ SHA-256
       └─ ekstrakcja PDF (pdftotext) albo UTF-8
  → ingestKnowledgeMaterial() / SQLite
       ├─ knowledge_materials
       └─ knowledge_material_versions
  → Science Chat
       └─ GET .../knowledge-materials/search?q=...
          → cytowane źródło projektu z epistemicznym ostrzeżeniem
```

Przetwarzanie jest project-scoped. Każde żądanie do projektu przechodzi przez istniejący token sesji oraz RBAC. Rola `viewer` może czytać listę, wyszukiwać i pobrać własne źródło projektu; dopiero `editor` lub rola wyższa może przesłać materiał.

## Obsługiwane typy i limity

| Kategoria | Reguła |
|---|---|
| Obsługiwane formaty | PDF (`application/pdf`), TXT (`text/plain`), Markdown (`text/markdown`), JSON (`application/json`). |
| Zgodność typu | MIME musi odpowiadać dozwolonemu rozszerzeniu pliku. |
| Limit artefaktu | Maksymalnie **5 MiB** oryginalnych bajtów materiału. |
| Limit transportu | Maksymalnie **7 MiB** żądania HTTP dla uploadu, aby uwzględnić kodowanie Base64 i metadane. |
| Limit uploadów | **6 uploadów na minutę na IP**; osobny limiter od zwykłego API. |
| Ekstrakcja PDF | `pdftotext` z limitem czasu 10 sekund; wynik otrzymuje jawny status ekstrakcji. |
| Tekst indeksowany | Maksymalnie 200 000 znaków wyekstrahowanego tekstu. |
| Tematy | Maksymalnie 12 tematów po 64 znaki. |

PDF jest dodatkowo sprawdzany na sygnaturę `%PDF-`; deklaracja MIME bez zgodnej zawartości nie przejdzie walidacji. Nazwa pliku jest kanonizowana do basename, co usuwa ścieżkę przekazaną przez klienta.

## Kontrakt HTTP

Wszystkie endpointy wymagają nagłówka `Authorization: Bearer <token>` i członkostwa w projekcie. Projekt niedostępny dla użytkownika jest zwracany jako `404`, aby nie ujawnić jego istnienia.

| Metoda i ścieżka | Minimalna rola | Odpowiedź | Znaczenie |
|---|---:|---|---|
| `POST /api/projects/:id/knowledge-materials` | `editor` | `201 { material }` | Waliduje, zachowuje oryginał, indeksuje treść i tworzy wersję. |
| `GET /api/projects/:id/knowledge-materials` | `viewer` | `200 { materials }` | Zwraca aktualne wersje materiałów projektu. |
| `GET /api/projects/:id/knowledge-materials/search?q=...` | `viewer` | `200 { materials }` | Wyszukiwanie leksykalne po tytule, tematach i wyekstrahowanym tekście. |
| `GET /api/projects/:id/knowledge-materials/:materialId` | `viewer` | `200 { material }` | Metadane bieżącej wersji materiału. |
| `GET /api/projects/:id/knowledge-materials/:materialId/content` | `viewer` | `200 { material }` | Oryginalne bajty Base64 oraz dane wersji; nie należy wyświetlać ich bezpośrednio bez kontroli typu. |

Wyszukiwanie jest **leksykalne i deterministyczne**, a nie wektorowe ani semantyczne. Dla pytania naturalnego wystarcza trafienie jednego istotnego tokenu w tytule, tematach lub tekście. Jest to celowe: moduł nie twierdzi, że rozumie znaczenie materiału ani że potwierdza jego tezy.

## Zachowanie Science Chat

Po każdym pytaniu Science Chat sprawdza aktywny projekt wiedzy. Jeżeli wyszukiwanie zwróci materiały, do historii rozmowy jest dołączona osobna wiadomość systemowa zawierająca:

- nazwę projektu oraz tytuł i numer wersji materiału;
- `USER_PROVIDED_UNREVIEWED` i status ekstrakcji;
- tematy oraz skrócony SHA-256;
- krótki excerpt źródła;
- jawne stwierdzenie, że materiał **nie jest wynikiem solvera ani instrukcją wykonawczą**.

Zwrócenie źródła nie przesłania istniejącego planu eksperymentu ani nie zmienia jego parametrów. W szczególności pytanie o łańcuch Kitaeva może utworzyć plan dla realnego modelu bulk BdG wyłącznie przez istniejący routing Science Chat, ale uploadowany tekst nie jest jego parametrem ani dowodem wyniku.

## Model danych i wersjonowanie

`knowledge_materials` reprezentuje trwałą tożsamość materiału w projekcie. `knowledge_material_versions` zawiera każdą kolejną wersję, oryginalne bajty, wynik ekstrakcji, hash i metadane provenance. Powtórny upload z tym samym stabilnym kluczem tytułu inkrementuje numer wersji. Aktualny widok materiału odwołuje się do najwyższej wersji.

Nie ma automatycznego scalania ani deduplikacji opartej wyłącznie na podobieństwie semantycznym. SHA-256 pozwala wykryć identyczne bajty w audycie, lecz nie zastępuje wersji ani kontroli redakcyjnej użytkownika.

## Jawne nie-cele

| Nie jest realizowane | Powód |
|---|---|
| Automatyczne uznawanie tekstu za fakt naukowy | Materiał użytkownika może być hipotezą, teorią, scenariuszem lub treścią nierozstrzygniętą. |
| Automatyczna modyfikacja solvera | Dokument nie jest walidowanym kontraktem implementacyjnym ani eksperymentem. |
| Automatyczne generowanie odkrycia | Knowledge Ingestion dostarcza źródła i provenance, nie wyniku obliczeniowego. |
| Drugi Knowledge Registry | Projekt wykorzystuje istniejący trwały store i aktywny kontekst projektu. |
| Semantyczne RAG udające pewność | Obecny retrieval jest jawnie leksykalny, lokalny dla projektu i oznaczony w UI. |

## Dowody walidacji

| Kontrola | Wynik |
|---|---|
| Testy frontendowe | `746/746` PASS. |
| Testy backendu | `23/23` PASS, w tym upload/original/hash/provenance, wersjonowanie, source-bound excerpt, RBAC i spoofing PDF. |
| ESLint | PASS. |
| Build TypeScript + Vite | PASS. |
| `git diff --check` | PASS. |
| E2E przeglądarki | Lokalny użytkownik testowy utworzył projekt, przesłał kontrolowany plik Markdown, zobaczył `v1`, `USER_PROVIDED_UNREVIEWED` i SHA-256, a Science Chat zwrócił oznaczony excerpt bez uruchamiania solvera. |

> Test E2E używał wyłącznie kontrolowanego, lokalnego materiału Markdown stworzonego na potrzeby walidacji. Nie zawierał materiałów użytkownika ani nie uruchamiał modelu naukowego.

## Przyszłe rozszerzenia bez łamania kontraktu

Możliwe kolejne kroki to recenzja materiału z oddzielnym audytem, rozdzielenie uprawnień do pobrania binarnego oryginału, indeks pełnotekstowy SQLite lub zewnętrzny indeks wektorowy oraz polityki retencji plików. Każde z nich musi zachować oryginał, hash, wersje, project-scoped RBAC, jawny status epistemiczny oraz regułę `solverEffect: NONE`, dopóki użytkownik nie utworzy osobnego, zwalidowanego kontraktu modelu lub eksperymentu.
