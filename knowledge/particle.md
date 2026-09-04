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
