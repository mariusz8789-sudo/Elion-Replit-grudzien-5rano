# Science Chat browser proof notes

- Local Genesis root rendered successfully at http://localhost:5001/ after onboarding.
- Science Chat opened from Command Center and displayed the new Earthquake suggestion.
- Request `Uruchom trzęsienie ziemi magnitude=5.4 depth=12 km` produced a READY_FOR_CONFIRMATION plan with model `earthquake-scenario`, engine `genesis-earthquake-command-center@1.0.0`, route `live-world`, and explicit `structural damage = NOT_MODELED`.
- First confirmation hit `PROVENANCE_CONFLICT` because the pre-patch implementation reused a fixed scenario ID in the browser's immutable local store.
- Code was patched to append `Date.now()` to the hazard scenario label while keeping Fabric result fingerprint deterministic. A full-page reload is required before re-running confirmation.
- Root rendered again after patch; no browser console errors were observed.

## Follow-up

- Full reload loaded the patched bundle; a fresh plan still displayed correctly.
- Confirming the plan moved the browser session to an empty/about:blank viewport instead of rendering `#/city3d`; console showed no exception beyond React DevTools info.
- App route parser explicitly supports `#/city3d`, and City3D has an ErrorBoundary plus WebGL fallback. Further isolation is required before calling this browser proof green.
