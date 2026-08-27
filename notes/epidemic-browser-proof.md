## Browser proof — 2026-08-27

Science Chat na `http://localhost:5001/` przyjął `Zasymuluj epidemię z R0=5 przez 10 dni seed=12`. Preflight pokazał model `epidemic-city`, capability `REAL_ENGINE`, parametry `r0=5`, `horizonDays=10`, `seed=12`, route `live-world`, ograniczenie edukacyjnego modelu oraz `PROTOCOL_REQUIRED` / `VARIANT_REQUIRED`. Po kliknięciu potwierdzenia URL zmienił się na `#/hf-slice`, ale browser snapshot utracił dokument i nie dostarczył widoku; nie uznaję tego jeszcze za pełny UI proof. Kodowy kontrakt i test handoffu są zielone, więc trzeba odizolować problem lifecycle/lazy route/WebGL albo środowiska przeglądarki przed oznaczeniem Epidemic jako fully connected.

## Regression fix and smoke gate — 2026-08-27

Zidentyfikowany przez smoke błąd Universe collision wynikał z mnożenia kroku `dt` przez `speed` po wcześniejszym clampie. Finalny krok mógł przekroczyć kontrakt `0.03`. Naprawiono clamp po skalowaniu i dodano regresję przez istniejący `universeCollision.createSim()`.

Po poprawce: desktop smoke sprawdził 27 tras + 13 laboratoriów i 242 interakcje, `ZERO` błędów runtime. Mobile smoke sprawdził 27 tras + 13 laboratoriów i 238 interakcji, `ZERO` błędów runtime. Interaktywny Science Chat preflight Epidemic działa; po confirm route jest `#/hf-slice`, lecz bieżący browser snapshot traci dokument przed dostarczeniem screenshotu. Nie używam tego jako dowodu wizualnego; smoke potwierdza brak runtime errors na trasach.
