# Candidate Dossier browser checkpoint

- Frontend: `http://localhost:5000/` responds successfully.
- Initial route requested: `#/drug?reference=caffeine&target=A1`.
- Local onboarding was active; after one `Dalej` click it is on the slider step `Przesuwaj — wszystko reaguje na żywo`.
- No external or sensitive action was performed.
- Next: finish onboarding, run the source-backed natural discovery request, verify automatic `#/dossier` navigation and key sections.

Po dwóch kolejnych kliknięciach onboarding przeszedł przez suwak i Narrator AI do ekranu końcowego „Gotowy?”. Następny bezpieczny krok to wybranie „Może innym razem — pokaż laboratoria”, aby zachować trasę Drug Discovery zamiast uruchamiać Discovery Timeline.

Onboarding zakończony przez „pokaż laboratoria”. Command Center załadował się poprawnie, a Science Chat został otwarty. Formularz wiadomości jest dostępny; żaden request biotech nie został jeszcze wysłany.

Pierwszy browser request „Znajdź naturalnych kandydatów dla targetu A1: kofeina.” zakończył się jawnie jako `NATURAL DISCOVERY — BLOCKED`: brak kompatybilnego pinned reference profile, 0 raportów, brak wyszukiwania i predykcji. To potwierdza bezpieczną granicę parsera; następnie testuję canonical reference `caffeine`, który jest zapisany w source-backed katalogu.

Po poprawce regexu odświeżona sesja browsera ponownie otworzyła Drug Discovery i Science Chat. Formularz jest dostępny, a lokalna aplikacja działa; poprzedni artifact był widoczny pod `#/dossier`, lecz nie zawierał jeszcze zachowanych conformerów 3D.

Po poprawce parsera request w przeglądarce przeszedł z Science Chat do `#/dossier` i utworzył nowy artifact (nowy timestamp Memory). Odświeżenie trasy wróciło do Drug Discovery; Science Chat jest dostępny do końcowego ponowienia z aktualnym bundle.

Końcowy browser request po poprawce regexu zakończył się `NATURAL DISCOVERY — RESOLVED`: 8 realnych rekordów PubChem, 39 activity records ChEMBL, 8 cheap computes i 12 raportów. Parser poprawnie odczytał `targetu A1`; nie wystąpiła wcześniejsza blokada `target = u`. UI pozostał na Science Chat po pokazaniu wyniku, więc osobno weryfikuję aktualny artifact i trasę dossier.

Diagnostyka localStorage po RESOLVED: klucz `genesis-os:science-memory/v1` nadal ma stary artifact fingerprint `2ed6a101`, `hasActivityRecords=false`, `hasAtoms3d=false`. Konsola nie pokazała wyjątku po sprawdzeniu, ale UI nie wykonał przejścia do dossier; trzeba prześledzić callback zapisu i warunek `result.reports.length`.

Finalny browser E2E przeszedł end-to-end: kliknięcie „Wyślij” otworzyło `#/dossier`, artifact fingerprint zmienił się na `7feebbe5`, dossier pokazuje 39 saved activity IDs, target IDs z live ChEMBL oraz konkretne Ki records z assay quality MODERATE. Source 3D pozostaje `NOT_AVAILABLE` w tym browser artifact, mimo że code path zachowuje 3D, jeśli PubChem zwróci poprawny conformer; nie sfabrykowano współrzędnych.
