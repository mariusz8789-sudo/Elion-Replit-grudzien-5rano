# Genesis Knowledge: Vaccine & Viral Discovery Lab

**Status:** `CAPABILITY_SEAM` — wiedza zweryfikowana ze źródeł pierwotnych; brak aktywnego solvera molecular docking/dynamics; dostępne: RDKit deskryptory, PySCF single-point.

**Zasada epistemiczna:** Każde twierdzenie nosi jawny status. Genesis nie generuje wyników biologicznych bez realnych danych i zwalidowanego solvera.

---

## 1. Platforma nanodysków wirusowych

**Źródło:** Rantalainen K. et al., *Nature Communications* 17, 2561 (2026-02-10). DOI: 10.1038/s41467-026-68985-1. Open Access CC BY 4.0.

### Co jest udowodnione `PUBLISHED_RESEARCH`

Transmembranowe glikoproteiny wirusów otoczkowych są celami przeciwciał neutralizujących i kluczowymi antygenami szczepionkowymi. Tradycyjne podejście polega na usunięciu domeny transmembranowej w celu uzyskania rozpuszczalnego ektodomenu, co może zniekształcać epitopy blisko błony. Platforma Scripps Research rozwiązuje ten problem przez osadzenie pełnodługościowych glikoprotein w lipidowych nanodyskach (MSP1D1 scaffold), które naśladują środowisko błony wirusowej.

Kluczowe wyniki opublikowane:

- Pomiar powinowactwa przeciwciał metodą SPR (Surface Plasmon Resonance) w trzech modalnościach.
- Sortowanie limfocytów B swoistych dla antygenu metodą FACS (fluorescence-activated cell sorting).
- Struktura cryo-EM kompleksu HIV Env gp151 MPER nanodisc z przeciwciałami 10E8, BG18 i VRC01 do rozdzielczości **3,5 Å** (EMDB: EMD-70470).
- Powinowactwo 10E8 do Env gp151 MPER ND wzrosło **70-krotnie** (250 nM → 3,6 nM) po usunięciu glikozylacji N88/N618/N625 i mutacji R696S.
- Off-rate zmniejszył się z 8,1×10⁻³ s⁻¹ do 3,5×10⁻⁴ s⁻¹.
- Platforma przetestowana dla glikoproteiny wirusa Ebola (EBOV GP Mayinga ND); przeciwciała EBOV-296 i 13C6 wiążą się z powinowactwem 46 nM i 16 nM.
- Czas przygotowania: ~5 dni (do 12 próbek jednocześnie); wcześniej kilka tygodni.

### Mechanizm `MECHANISTIC_FINDING`

Niektóre przeciwciała mogą neutralizować wirusa przez destabilizację białek potrzebnych do wejścia do komórki. Nanodyski ujawniają interakcje przy granicy błony, niewidoczne w rozpuszczalnych ektodomainach.

### Potencjalne zastosowania `POTENTIAL_APPLICATION`

Platforma może być stosowana dla innych wirusów z białkami zakotwiczonymi w błonie: grypa, SARS-CoV-2, RSV. Nie jest to potwierdzone zastosowanie — wymaga dalszej weryfikacji.

### Czego platforma NIE jest `PUBLISHED_LIMITATION`

Platforma nie jest szczepionką dla ludzi. Scripps: *"the platform isn't a vaccine itself"*.

---

## 2. Szczepionka HIV na makakach — apex Env

**Źródło:** Wyatt R. et al. (Guenaga J., Bale S. co-first), *Nature* (2026-04-29). DOI: 10.1038/s41586-026-10429-3.

### Co jest udowodnione `PRECLINICAL_PUBLISHED_RESEARCH`

Sekwencyjne szczepienie 6 makaków nanoparticles z HIV Env trimer (apex) wywołało tier-2 cross-neutralizing antibodies u wszystkich zwierząt. Jest to pierwszy przypadek, gdy samo szczepienie dało ten efekt u wszystkich zwierząt. Szczepionka nie jest gotowa do testów u ludzi.

---

## 3. Awidność nanoparticle — Science Translational Medicine

**Źródła:** Abbott R. et al. i Cottrell C. et al., *Science Translational Medicine* (2026-08-12). DOI: 10.1126/scitranslmed.aee5273 i 10.1126/scitranslmed.aee5425.

### Co jest udowodnione `PRECLINICAL_PUBLISHED_RESEARCH`

Wyższa awidność (powtarzalność punktów przyłączenia) nanoparticle prowadziła do trwalszej odpowiedzi immunologicznej u myszy. Powtarzalność miała większy wpływ niż samo powinowactwo. Efekt znikał przy zmniejszonej populacji konkurujących limfocytów B. Wyniki dotyczą modeli mysich.

---

## 4. Platforma HCV E1E2 — Nature Communications

**Źródło:** He L. et al. (Zhu J. senior), *Nature Communications* (2026-02-11). DOI: 10.1038/s41467-026-69418-9. Open Access CC BY 4.0.

### Co jest udowodnione `PUBLISHED_RESEARCH`

Opracowano stabilizowany, natywny heterodimer E1E2 HCV i osadzono go na SApNP (self-assembling protein nanoparticles). Kandydat szczepionki wywołał odpowiedź immunologiczną u myszy. Platforma SApNP stosowana wcześniej dla HIV, grypy, Eboli, Sudanu i Marburga.

---

## 5. Dane strukturalne dostępne publicznie

| Identyfikator | Opis | Dostępność |
|---|---|---|
| EMDB EMD-70470 | BG505 MD39.3 Env gp151 MPER nanodisc + 10E8/BG18/VRC01, 4,3 Å | Publiczny, FTP EBI (wwPDB) |
| PDB (powiązany z EMD-70470) | Model atomowy | Publiczny, RCSB |

---

## 6. Kontrakt przyszłego eksperymentu obliczeniowego Genesis

Schemat opisuje, co Genesis może uczciwie modelować obliczeniowo po dostarczeniu odpowiednich danych i runtime'ów.

```
WEJŚCIE (ze źródeł pierwotnych):
  antigen_sequence: sekwencja aminokwasów lub SMILES fragmentu MPER
  antibody_id: identyfikator (np. 10E8)
  membrane_context: "nanodisc" | "soluble_ectodomain"
  measurement_type: "SPR_KD" | "FACS_frequency" | "cryo-EM_resolution"

OBLICZENIE (wyłącznie z realnym solverem):
  → RDKit: deskryptory 2D fragmentu peptydowego (DOSTĘPNE)
  → PySCF: single-point energy małego fragmentu (DOSTĘPNE, ograniczone)
  → Molecular docking: ENGINE_NOT_AVAILABLE
  → Molecular dynamics: ENGINE_NOT_AVAILABLE
  → Strukturalne porównanie PDB: BACKEND_REAL_ENGINE (Biopython; pary 5GHW→4G6F i 5GHW→5WDF; RMSD Fab i MPER; provenance SHA-256; replay przez Evidence Pack)

BLOKERY:
  1. Molecular docking: wymaga AutoDock Vina, Rosetta lub AlphaFold.
  2. Molecular dynamics: wymaga OpenMM lub GROMACS.
  3. Strukturalne porównanie PDB: DOSTĖPNE dla zarejestrowanych par (patrz Knowledge Registry).
  4. Dane SPR/FACS: dane eksperymentalne — Genesis ich nie generuje obliczeniowo.
```

---

## 7. Otwarte pytania badawcze

1. Czy zwiększenie awidności nanoparticle daje podobny efekt u naczelnych co u myszy?
2. Które mutacje MPER poza R696S mogą dalej zwiększać dostępność epitopu 10E8?
3. Czy platforma nanodysków jest przenośna na RSV, MERS?
4. Jaki jest minimalny zestaw deskryptorów strukturalnych pozwalający przewidzieć awidność B-cell?

---

## Źródła

- Rantalainen K. et al., *Nat Commun* 17, 2561 (2026). DOI: 10.1038/s41467-026-68985-1
- Wyatt R. et al., *Nature* (2026-04-29). DOI: 10.1038/s41586-026-10429-3
- Abbott R. et al., *Sci Transl Med* (2026-08-12). DOI: 10.1126/scitranslmed.aee5273
- Cottrell C. et al., *Sci Transl Med* (2026-08-12). DOI: 10.1126/scitranslmed.aee5425
- He L. et al., *Nat Commun* (2026-02-11). DOI: 10.1038/s41467-026-69418-9
- EMDB EMD-70470: https://www.ebi.ac.uk/emdb/EMD-70470
