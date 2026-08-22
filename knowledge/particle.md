# Particle Lab — katalog wiedzy

## Zakres
Model Standardowy, kinematyka zderzeń, detektory, dane LHC.

## Modele i wzory

**Model Standardowy** ★★★★★ (w zakresie przetestowanym)
6 kwarków, 6 leptonów, 4 bozony cechowania + Higgs (125,25 GeV, PDG).
Wszystkie przewidziane cząstki znalezione. Dane: PDG (cytować).

**Kinematyka relatywistyczna** ★★★★★
Masa niezmiennicza: M²c⁴ = (ΣE)² − |Σp⃗|²c² — fundament odkryć: piki w
histogramie M = cząstki (J/ψ 3,10 GeV; Υ 9,46; Z 91,19).
Krzywizna toru: p_T[GeV] ≈ 0,3·B[T]·r[m]; rezonanse: kształt Breita–Wignera.

**Uwięzienie koloru / dżety** ★★★★★ (zjawisko), obliczenia trudne
Kwarki i gluony nigdy swobodne; hadronizacja → dżety. Pełna QCD
nieperturbacyjna — poza zasięgiem; wizualizacje dżetów zawsze stylizowane.

## Sprzeczne teorie / otwarte spory
- Co poza Modelem Standardowym? ★★★ że COŚ jest (masy neutrin, DM, asymetria
  barionowa nie mieszczą się w MS); ★★ każda konkretna propozycja (SUSY —
  brak sygnatur w LHC; aksjony; leptokwarki)
- Anomalia (g−2) mionu ★★★ — pomiar Fermilab vs teoria: spór przeniósł się
  do obliczeń hadronowych (dwie metody teoretyczne dają różne wyniki);
  status obserwować przed modułem „anomalie"
- Naturalność/hierarchia ★★ — problem estetyczny czy realny? Aktywna debata

## Publikacje i książki
- PDG *Review of Particle Physics* (pdg.lbl.gov, wolny dostęp) — kanon danych
- ATLAS i CMS 2012, Phys. Lett. B 716 (odkrycie Higgsa, open access)
- Griffiths *Introduction to Elementary Particles*; Thomson *Modern Particle
  Physics*

## Dane — strategiczne dla tego laba
**CERN Open Data (opendata.cern.ch) — CC0, wolno komercyjnie.**
Edukacyjne CSV z realnymi dimionami CMS → histogram mas niezmienniczych
z realnymi pikami J/ψ, Υ, Z. „Odkryj bozon Z z prawdziwych danych LHC
na swoim telefonie" — killer feature, w pełni legalna. Do czasu spakowania
realnych danych: generator syntetyczny (Breit–Wigner + tło) z uczciwą etykietą.

## Ograniczenia implementacyjne
- Pełny detektor (Geant4) i QCD — nie na mobile; krotności/typy w naszych
  zderzeniach są ilustracyjne, dopóki nie wejdą realne dane
- Realne CSV CMS: pakiet 1–5 MB — do rozważenia lazy-download w Etapie 2

## Wnioski projektowe dla Genesis OS
1. Histogram masy niezmienniczej z wyłaniającymi się pikami — najważniejsza
   rozbudowa tego laba: uczy, JAK naprawdę odkrywa się cząstki
2. Interaktywna mapa MS z danymi PDG
3. Docelowo realne dane CERN (CC0) zamiast syntetycznych — przewaga
   wiarygodności nie do podrobienia

## Virtual CERN Foundation — fidelity-first

### Zweryfikowane fakty o kompleksie CERN (źródła oficjalne, 2026-08-22)

CERN weszło w **Long Shutdown 3** 29 czerwca 2026 r. Wiązki LHC nie krążą;
modernizacja HL-LHC trwa do ok. 2030. Analizy danych Run 1–3 są kontynuowane.

Łańcuch protonowy: **Linac4 → PSB → PS → SPS → LHC**. Kompleks obsługuje
także ISOLDE/MEDICIS, AD, n_TOF, East Area, North Area, AWAKE i eksperymenty
LHC. Virtual CERN musi modelować topologię łańcucha, nie tylko pierścień LHC.

LHC: obwód 26 659 m, głębokość ~100 m, 1232 dipoli, 392 kwadrupoli,
temperatura dipoli 1,9 K, cztery główne punkty kolizji: ATLAS, CMS, ALICE, LHCb.

Źródła: home.cern/science/accelerators/the-accelerator-complex/,
home.cern/science/accelerators/large-hadron-collider/,
home.cern/cern-bids-farewell-to-the-lhc-and-enters-long-shutdown-3/

### Dostępne dane i granice fidelity

**CERN Open Data Portal** (opendata.cern.ch): metadata i datasets — CC0;
oprogramowanie — GPL-3.0 lub inna wskazana licencja. Każdy rekord ma DOI.
Dane Level 2 (uproszczone CSV) i Level 3 (zrekonstruowane AOD) są dostępne;
Level 4 (raw + pełna rekonstrukcja) wymaga dedykowanego środowiska CMSSW.

**Pierwszy dostępny dataset — CMS Z→μμ 2011 (rekord 5208, CC0):**
- 10 000 wyselekcjonowanych zdarzeń z dwiema kandydaturami mionowymi
- Format CSV, 947,8 KiB, zmienne: Run, Event, pt, eta, phi, Q, dxy, iso
- SHA-256: 7782778f8417d2c732f4a64efcbfceb6192c97c3bcfd21c0cf1322d38ed965d1
- Kontrolne statystyki (obliczone 2026-08-22 przez read-only audit):
  - rowCount: 10 000, eventCount: 10 000
  - masa niezmiennicza (dimuon): min 60,0 GeV, max 120,0 GeV
  - mediana: 90,3 GeV, mean: 88,0 GeV
  - okno 80–100 GeV: 8 259 zdarzeń (pik Z ≈ 91,19 GeV)
- Dane są edukacyjne i NIE nadają się do pełnej analizy fizycznej;
  selekcja jest z góry ustalona przez autorów rekordu

### Granice fidelity — co jest dostępne, co nie

| Element | Status |
|---|---|
| Topologia łańcucha akceleratorów (Linac4→LHC) | KNOWLEDGE_ONLY — dane oficjalne |
| Geometria LHC (obwód, głębokość, liczba magnesów) | KNOWLEDGE_ONLY — dane oficjalne |
| Panoramy 360° (CERN Public) | Wymagają audytu licencji przed użyciem assetów |
| Statystyki invariant mass Z→μμ (CSV CC0) | BACKEND_REAL_ENGINE — dostępne |
| Pełna rekonstrukcja detektora (CMSSW/Geant4) | ENGINE_NOT_AVAILABLE — wymaga CMSSW runtime |
| Symulacja akceleratora (MAD-X, SixTrack) | ENGINE_NOT_AVAILABLE — wymaga zewnętrznych runtime'ów |
| Geometria 3D detektora (GeoModel/ATLAS) | ENGINE_NOT_AVAILABLE — wymaga GeoModel toolkit |
| Analiza H→ZZ→4ℓ (record 5500) | ENGINE_NOT_AVAILABLE — wymaga legacy ROOT/CMSSW VM |

### Zasada Virtual CERN

Genesis nie deklaruje capability, której nie posiada. Każdy wynik musi nieść
jawne źródło, SHA-256 datasetu, ograniczenie selekcji i status epistemiczny.
Nie tworzy się fikcyjnej geometrii CERN ani syntetycznych danych HEP.
