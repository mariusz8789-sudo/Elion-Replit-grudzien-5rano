# Atom Lab — katalog wiedzy

## Zakres
Struktura atomu, orbitale, konfiguracje elektronowe, izotopy, widma,
właściwości 118 pierwiastków.

## Modele i wzory

**Atom wodoru — rozwiązanie analityczne** ★★★★★
E_n = −13,6 eV/n²; ψ_nlm = R_nl(r)·Y_lm(θ,φ). Jedyny atom rozwiązany
dokładnie. Orbitale do wizualizacji: |ψ|² z jawnych wzorów (1s…4f) —
tanie obliczeniowo, w pełni naukowe.

**Wzór Rydberga / widma** ★★★★★
1/λ = R(1/n₁²−1/n₂²); serie Lymana (UV), Balmera (widzialne), Paschena (IR).
Widma pierwiastków wieloelektronowych: dane pomiarowe NIST ASD, nie obliczenia.

**Konfiguracje elektronowe** ★★★★★ (dane), reguła Aufbau ★★★★ (heurystyka)
Aufbau (Madelung) zawodzi dla: Cr, Cu, Nb, Mo, Ru, Rh, Pd, Ag, Pt, Au, La,
Ce, Gd, Ac, Th, Pa, U, Np, Cm, Lr — utrzymywać tabelę wyjątków wg NIST.
Etap 0 używa czystego Aufbau z notą — do poprawienia.

**Model Bohra** — historyczny; poprawny dla poziomów energii wodoru,
błędny jako obraz ruchu. Zawsze z etykietą „model edukacyjny".

## Sprzeczne teorie / otwarte spory
Struktura atomowa to fizyka zamknięta (QED przetestowana do 10⁻¹²).
Jedyny dydaktyczny „spór" to wybór wizualizacji: orbitale jako chmury |ψ|²
(poprawne) vs orbity Bohra (intuicyjne, mylące). Decyzja projektowa:
pokazywać oba z jawnym oznaczeniem statusu.

## Publikacje i książki
- Griffiths, *Introduction to QM*, rozdz. 4 (wodór)
- NIST Atomic Spectra Database + CODATA 2022 (domena publiczna) — kanoniczne
  dane linii, energii jonizacji, konfiguracji
- IUPAC — masy atomowe

## Ograniczenia implementacyjne
- Z ≥ 2: brak rozwiązań analitycznych (Hartree–Fock/DFT poza mobile) →
  pokazujemy dane zmierzone NIST i mówimy to wprost
- Orbitale 3D: chmura punktów próbkowana z |ψ|² (WebGL points) lub przekroje
  2D na Canvas — oba wykonalne od zaraz dla wodoru
- Pełne właściwości 118 pierwiastków = pakiet danych ~100 kB (dopuszczalny)

## Wnioski projektowe dla Genesis OS
1. Orbitale wodoru z prawdziwego |ψ|² — najtańszy „prawdziwa nauka na
   telefonie" w całej aplikacji
2. Widma emisyjne z danych NIST: wybierz pierwiastek → jego realne linie
3. Tabela wyjątków konfiguracji przed jakąkolwiek rozbudową chemii
