# Visual proof session notes

Date: 2026-08-27

## Observed current LIVE frontend

The app rendered at `http://127.0.0.1:5002/` after onboarding. The Command Center is a real page with the visible title `Infrastruktura przyszłej nauki`, counts for 13 laboratories, 55 Fabric models, and 2 worlds, buttons for `Uruchom eksperyment` and `Otwórz żywy świat`, and a Science Chat button.

The onboarding initially blocked the dashboard. Clicking `Pomiń` exposed the dashboard. Science Chat opened as a real panel over the Command Center and displayed the six-stage rail: Pytanie, Hipoteza, Eksperyment, Symulacja, Analiza, Odkrycie. It showed the current state `brak otwartej symulacji`, deterministic suggestions including Earthquake, Minkowski, Schwarzschild radius, geodesics, c-Slider, particle energy, stellar scaling, tesseract, galaxy collision, and rotation curve, plus a text input and `Wyślij` button.

## Honesty observations

The dashboard explicitly states that experiments use real equations and that hypotheses are not presented as facts. The Science Chat intro describes confirmation before execution and provenance/Evidence/Replay for the Earthquake path. No screenshot from this session should claim that a model has run until the confirmation flow has actually been executed.

## Proof-pack implication

The current visual proof must explicitly separate: (1) Command Center exists, (2) Science Chat exists and exposes the connected routes, and (3) each simulation result is only claimed after a real confirmed run. The onboarding is a real blocking state and must be handled in the proof script by setting the completed local-storage key or clicking `Pomiń`.

## High-fidelity route check

Direct navigation to `#/hf-slice` rendered the real High-Fidelity Street Slice shell, controls (CITY, DISTRICT, STREET, HOSPITAL, AGENT DIAG, PAUZA, RESET, HEATMAPA, SHOWCASE), model metadata (`MODEL LIVE`, 260 real agents, day 0), SEIRD legend, event panel, LOD/asset/PBR panels, and Science Chat. The page displayed `WebGL nie uruchomił sceny na tym urządzeniu` in the current browser environment, so this session cannot claim a working WebGL visual. This is a PARTIAL proof only; a headed/SwiftShader run should be attempted before classifying the renderer itself as blocked.
