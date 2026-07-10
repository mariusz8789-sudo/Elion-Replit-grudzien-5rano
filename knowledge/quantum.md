# Quantum Lab — katalog wiedzy

## Zakres
Superpozycja, interferencja, pomiar, splątanie, tunelowanie, kubity, bramki,
dekoherencja, teleportacja.

## Modele i wzory

**Interferencja dwuszczelinowa** ★★★★★
I(θ) ∝ cos²(πd sinθ/λ)·sinc²(πa sinθ/λ). Pojedyncze elektrony: Tonomura 1989;
cząsteczki >25 kDa: Fein 2019. Etap 0 losuje trafienia z dokładnego |ψ|².

**Równanie Schrödingera 1D — split-step Fourier (plan Etapu 1)** ★★★★★
ψ(t+dt) = F⁻¹[e^{−iħk²dt/2m}·F[e^{−iV dt/ħ}ψ]]. Siatka 1024–4096 punktów
działa w 60 fps na telefonie (FFT w JS/WASM). Odblokowuje: tunelowanie,
rozpraszanie na barierze, stany związane.

**Kubity i bramki (jednokubitowe zaimplementowane)** ★★★★★
|ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩ (sfera Blocha). Macierze H, X, Y, Z,
S, T — dokładne, zaimplementowane w `quantum-bloch.ts` z prawdziwym
diagramem obwodu (sekwencja zastosowanych bramek, konwencja IBM Quantum
Composer) i testami unitarności. CNOT: bramka DWUKUBITOWA, wymaga wektora
stanu 4-wymiarowego (nie pojedynczej sfery Blocha) — NIE zaimplementowana,
świadomie w backlogu. Symulacja pełnego stanu do ~10 kubitów trywialna
(wektor 2ⁿ); teleportacja = 3 kubity — oba pozostają backlogiem.

**Nierówności Bella / CHSH** ★★★★★
Lokalny realizm: S ≤ 2; MK: S ≤ 2√2 ≈ 2,83; korelacja E(a,b) = −cos(a−b).
Testy bez luk: 2015 (Delft, Wiedeń, NIST); Nobel 2022.

**Dekoherencja** ★★★★
Utrata koherencji przez splątanie z otoczeniem wyjaśnia, czemu makroświat
wygląda klasycznie. Nie rozwiązuje sama problemu pomiaru (patrz spory).

## Sprzeczne teorie / otwarte spory

**Interpretacje MK — wszystkie dają identyczne przewidywania pomiarowe:**
- Kopenhaska/operacyjna ★★★★ jako praktyka („licz i przewiduj") — domyślny
  język aplikacji
- Wielu światów (Everett 1957) ★★ — bez kolapsu; cena: mnożenie gałęzi;
  opisana w Multiverse Lab
- Fala pilotująca (de Broglie–Bohm) ★★ — trajektorie istnieją, ale nielokalne
- Obiektywny kolaps (GRW/Penrose) ★★ — jedyna FALSYFIKOWALNA klasa
  (przewiduje odstępstwa dla dużych mas — eksperymenty trwają)
- QBism ★★ — funkcja falowa jako stan wiedzy agenta

Stanowisko aplikacji: uczymy formalizmu (bezsporny), interpretacje
prezentujemy jako oznaczoną mapę sporu — to jedyne uczciwe podejście
i zarazem ciekawsze niż dogmat.

**Granica kwantowo-klasyczna** ★★★
Czy istnieje maksymalny rozmiar superpozycji? Dekoherencja tłumaczy praktykę,
ale eksperymenty z coraz większymi obiektami (nanocząstki w pułapkach,
projekt MAQRO) testują, czy nie ma nowej fizyki. Otwarte.

## Publikacje i książki
- Tonomura et al. 1989, Am. J. Phys. 57, 117 (nasz wzorzec z Etapu 0)
- Aspect et al. 1982, PRL 49, 1804; Hensen et al. 2015, Nature 526 (Bell bez luk)
- Bouwmeester et al. 1997, Nature 390, 575 (teleportacja)
- Fein et al. 2019, Nature Physics 15, 1242 (interferencja 25 kDa)
- Zurek 2003, Rev. Mod. Phys. 75, 715 (dekoherencja — przegląd)
- Podręczniki: Griffiths *Introduction to QM*; Nielsen & Chuang (informacja
  kwantowa); Feynman Lectures III — czytać online, nie kopiować
- Wzorce open source: Qiskit Textbook (dydaktyka bramek), QuTiP (dynamika)

## Ograniczenia implementacyjne
- Pełna symulacja stanu: 2ⁿ amplitud → praktyczny sufit ~20 kubitów na
  telefonie; dla dydaktyki wystarczy 2–5
- Split-step 2D możliwy w niskiej rozdzielczości; 3D — nie na mobile
- „Pomiar" w aplikacji = próbkowanie rozkładu — opisać w nocie modelu

## Wnioski projektowe dla Genesis OS
1. Tunelujący pakiet falowy 1D na żywo — realna fizyka obliczana na
   urządzeniu, unikat na mobile; priorytet nr 1 Etapu 1
2. Gra CHSH („pokonaj lokalny realizm") — dydaktyka Bella przez porażkę gracza
3. Teleportacja krok po kroku na 3 kubitach — pełna, dokładna symulacja
4. Mapa interpretacji MK jako pierwszy moduł „nauka się spiera"
