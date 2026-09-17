# Genesis OS V16 — Pitch Deck i audyt gotowości

**Status dokumentu:** wewnętrzny materiał R&D/VC. Wartości komercyjne są hipotezami do walidacji, nie ofertą inwestycyjną ani wyceną niezależną.

## Executive summary

Genesis OS łączy deterministyczne silniki symulacyjne, laboratoria naukowe, interfejsy WebGL oraz warstwę audytowalnych fingerprintów. Wersja V16 rozszerza pakiet Genesis 9D o **Interactive Entity Engine** i **Genealogical Tree Engine**. Moduły są oznaczone jako syntetyczne i nie przedstawiają prawdziwych osób, danych genetycznych ani rejestrów historycznych.

Najsilniejszą przewagą produktu jest połączenie trzech cech: powtarzalnych przebiegów opartych na seedach i kontrolowanym zegarze, jawnego oznaczania ograniczeń epistemicznych oraz łańcuchów SHA-256 dla wybranych zdarzeń. To tworzy dobrą bazę dla demonstratorów badawczych, narzędzi szkoleniowych i kontrolowanych symulacji miejskich. Nie jest jeszcze dowodem poprawności modeli domenowych ani gotowości do zastosowań regulowanych.

## Produkt i segmenty

| Segment | Propozycja wartości | Model wejścia na rynek |
|---|---|---|
| B2C / VR | Interaktywne laboratoria, światy 3D i bezpieczne eksperymenty edukacyjne | Freemium, abonament premium, licencje treści |
| B2B | Powtarzalne symulacje, demonstratory R&D i środowiska szkoleniowe | Licencja roczna, wdrożenie, płatne moduły |
| B2G / miasta | Cyfrowy twin i scenariusze kryzysowe z jawnie syntetycznymi założeniami | Pilotaż, licencja instytucjonalna, SLA i audyt |
| Ubezpieczenia | Analiza scenariuszy ryzyka, bez udawania prognozy rzeczywistej szkody | POC z danymi klienta, następnie umowa enterprise |

Najbezpieczniejsza kolejność komercjalizacji to: demonstrator B2C i szkoleniowy, pilotaż B2B, dopiero potem ograniczony pilotaż B2G. Sprzedaż systemu jako certyfikowanego narzędzia decyzyjnego wymaga osobnego audytu modeli, danych, bezpieczeństwa i odpowiedzialności prawnej.

## R&D i hipoteza wyceny

Orientacyjna hipoteza dla rozmów pre-seed/seed powinna być oparta na dowodach, nie na liczbie modułów. Wewnętrzny materiał może testować przedział **€1–3 mln pre-money dla pre-seed** przy działającym demonstratorze, zespole i pierwszych rozmowach pilotażowych, oraz **€3–8 mln pre-money dla seed** dopiero po potwierdzeniu użycia, retencji i płatnego POC. Są to zakresy orientacyjne do kalibracji z rynkiem, a nie rekomendacja finansowa.

Wartość R&D zwiększają: działający produkt, reproducibility pack, benchmarki z realną proweniencją, płatny pilotaż oraz ograniczona ekspozycja IP. Sam kod i liczba nazw silników nie wystarczają do uzasadnienia wyceny VC. Najbliższym dowodem wartości powinien być jeden mierzalny przypadek użycia z użytkownikiem zewnętrznym.

## Architektura 9D i IP

Warstwa core zawiera pakiety advanced, supreme, city-enterprise, molecular-engine, quantum-lab, mirror oraz genesis9d. UI zawiera laboratoria, renderery Matrix-Grade/Cinematic Matrix i klienta mirror. Frontend city jest adapterem staged; test reachability jawnie dokumentuje, że nie jest jeszcze podłączony do produkcyjnego ekranu.

V16 dodaje dwa moduły:

- **Interactive Entity Engine** — deterministyczne syntetyczne NPC historyczne, sesje dialogowe, bullet-time, disclaimer oraz append-only ledger dialogów.
- **Genealogical Tree Engine** — proceduralny DAG przodków, detekcja paradoksów, fingerprint grafu i ledger linków.

Determinizm opiera się na `mulberry32(seed)` i interfejsie `Clock`. Logika silników nie używa `Math.random()` ani `Date.now()`. SHA-256 zapewnia integralność fingerprintów i ledgerów, ale nie dowodzi prawdziwości danych wejściowych. Unikalne IP obejmuje organizację kodu, kontrakty danych, sposób etykietowania syntetyczności i integrację warstwy wizualnej; rejestracja praw IP wymaga odrębnej analizy prawnej.

## Dowody techniczne

- V16: **7/7 plików testowych, 47/47 testów PASS**.
- V16 lint: **PASS**.
- Build: **PASS**, z istniejącym ostrzeżeniem o dużych chunkach frontendowych.
- Manifest: **ALL_PACKAGE_FILES_PRESENT**.
- Desktop smoke: **33 trasy, 13 laboratoriów, zero błędów runtime**.
- Mobile smoke: **33 trasy, 13 laboratoriów, zero błędów runtime**.
- Pełny workspace nadal zawiera dwa niezależne problemy środowiskowe/istniejące: kruchą asercję OpenAlex oraz wcześniejszy test reachability city, naprawiony przez jawne udokumentowanie staged adapterów.

## Materiały wizualne

- [Dashboard Matrix](screenshots/matrix-dashboard.png)
- [Symulacja miasta 3D](screenshots/city-3d.png)
- [Laboratorium](screenshots/laboratory.png)
- [Panel diagnostyczny](screenshots/diagnostics.png)

## Integrity & Wiring Check

Manifest `genesis-packages.manifest.json` obejmuje pakiety V16 i wcześniejsze dostarczone zakresy. Barrell exports są obecne dla `genesis9d`, `advanced`, `supreme`, `city-enterprise`, `quantum-lab` oraz frontendowego `city`. Test reachability potwierdza, że nieudokumentowane moduły nie wiszą w frontendzie; staged city adaptery mają jawne uzasadnienie.

Wniosek: **integracja plikowa i eksportowa jest kompletna dla zakresu manifestu**. Wniosek nie oznacza, że każdy silnik jest używany przez produkcyjną trasę UI. To rozróżnienie pozostaje częścią Honest Mode.

## Code Protection Protocol

### Stan obecny

`.gitignore` wyklucza `node_modules`, `dist`, `.env`, logi, dane SQLite backendu i artefakty runtime. Przed dalszym udostępnianiem należy rozszerzyć ochronę o `.env.*` z wyjątkiem `.env.example`, typowe pliki kluczy oraz skanowanie sekretów w CI. Repozytorium i branch powinny pozostać prywatne.

Globalne nagłówki `Proprietary / All Rights Reserved` nie są jeszcze obecne we wszystkich plikach rdzenia. Nie należy deklarować ich jako wdrożonych bez osobnego, kontrolowanego przepływu licencyjnego.

### Checklista przed udostępnieniem inwestorom

- [ ] Prywatne repozytorium i wymuszone 2FA dla wszystkich kont.
- [ ] Skanowanie sekretów w pre-commit i CI; rotacja każdego przypadkowo ujawnionego klucza.
- [ ] Rozszerzenie `.gitignore` o `.env.*`, pliki kluczy i lokalne credentiale, z wyjątkiem bezpiecznego `.env.example`.
- [ ] Obfuskacja/minifikacja produkcyjnego WebGL/TypeScript oraz usunięcie map źródłowych z publicznego artefaktu, o ile nie są wymagane do debugowania.
- [ ] Nagłówki licencyjne `Proprietary / All Rights Reserved` w zatwierdzonym zakresie plików rdzenia.
- [ ] NDA przed przekazaniem kodu, danych, roadmapy lub materiałów technicznych.
- [ ] Demo inwestorskie z ograniczonym dostępem, telemetryką i możliwością szybkiego wyłączenia.
- [ ] Oddzielne dane demonstracyjne od danych klienta i brak sekretów w bundle frontendowym.

## Priorytet następnego cyklu

Najwyższy priorytet to jeden płatny lub bardzo konkretny POC z mierzalnym KPI. Technicznie powinien on obejmować benchmark reprodukowalności, raport ograniczeń modelu, skan sekretów, hardening artefaktu frontendowego oraz decyzję, czy city adapter ma zostać podłączony do produkcyjnego ekranu. Dopiero ten zestaw pozwoli przejść od **CODE-COMPLETE** do wiarygodnego **PRODUCTION-READY**.

## References

[1]: https://www.nist.gov/cyberframework "NIST Cybersecurity Framework"
[2]: https://owasp.org/www-project-top-ten/ "OWASP Top Ten Web Application Security Risks"
[3]: https://www.w3.org/TR/SRI/ "W3C Subresource Integrity"
