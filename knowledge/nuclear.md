# Nuclear Lab — katalog wiedzy

## Zakres
Rozpady, łańcuchy, rozszczepienie, fuzja, reaktory, tokamak, mapa nuklidów.

## Modele i wzory

**Prawo rozpadu** ★★★★★
N(t) = N₀·2^(−t/T½); A = λN; łańcuchy — równania Batemana (analityczne,
tanie). Losowość pojedynczego jądra jest fundamentalna (nie „ukryta
niewiedza") — potwierdzone przez łamanie nierówności Bella w analogicznych
układach.

**Energia wiązania — SEMF (Weizsäcker), zaimplementowane** ★★★★ (model), dane ★★★★★
B = a_V·A − a_S·A^⅔ − a_C·Z(Z−1)/A^⅓ − a_A·(A−2Z)²/A ± δ·A^{−½};
(a_V≈15,8; a_S≈17,8; a_C≈0,71; a_A≈23,7; δ≈11,2 MeV).
Wyjaśnia dolinę stabilności i dlaczego rozszczepienie (A>56) i fuzja (A<56)
uwalniają energię. Dokładne masy: AME2020/NNDC. Wzór policzony dokładnie tak
jak wyżej w `core/physics.ts` (`semfBindingEnergy`/`semfBindingPerNucleon`/
`semfStabilityGradient`) i wyrenderowany jako ciągła "mapa nuklidów" (Nuclear
Lab → Mapa nuklidów) — tło to model SEMF, nałożone kropki to ~55 realnie
zmierzonych izotopów (NNDC, `data/nuclides.ts`), wyraźnie odróżnione w UI.

**Rozszczepienie i krytyczność** ★★★★★ (fizyka), nasz model dydaktyczny
U-235 + n → ~200 MeV + 2,4 n (średnio). Mnożnik k: <1 wygasa, =1 stabilny,
>1 lawina. Pręty kontrolne = pochłanianie neutronów. Prawdziwa neutronika
to Monte Carlo (OpenMC) — nie na telefon; nasz k-model jest jakościowy.

**Fuzja / tokamak** ★★★★★ (fizyka), inżynieria w toku
D+T → ⁴He (3,5 MeV) + n (14,1 MeV); maksimum przekroju ~64 keV.
Kryterium Lawsona (zapłon): n·τ_E·T ≳ 3×10²¹ keV·s/m³.
ITER (parametry publiczne): cel Q≥10. NIF 2022: zapłon inercyjny Q>1.

## Sprzeczne teorie / otwarte spory
- Wyspa stabilności superciężkich (Z≈114–126) ★★★ — przewidywana przez
  modele powłokowe; dotychczasowe superciężkie żyją ms–s; spór o położenie
  i „wysokość" wyspy
- Zimna fuzja ★ — niezreplikowana (Fleischmann–Pons 1989); wspominać
  wyłącznie jako przykład, jak nauka odrzuca twierdzenia bez replikacji

## Publikacje i książki
- Krane, *Introductory Nuclear Physics* (podstawa)
- NNDC NuDat 3 (Brookhaven, domena publiczna) — T½, mody, energie ~3400
  nuklidów; AME2020 — masy
- Lawson 1957, Proc. Phys. Soc. B 70 (kryterium); publiczne dane ITER/NIF

## Ograniczenia implementacyjne
- Mapa nuklidów (zaimplementowane): pełna tablica ~3400 nuklidów NNDC NIE
  została wpisana ręcznie (ryzyko błędu bez możliwości pobrania na żywo —
  patrz README „Znane ograniczenia"). Zamiast tego: ciągłe tło z SEMF
  (model, wszędzie policzalny) + ~55 ręcznie zweryfikowanych, prawdziwych
  izotopów jako nakładka. Uczciwy kompromis: mniej punktów danych, zero
  fabrykacji.
- Reakcja łańcuchowa: symulacja cząsteczkowa neutronów w siatce — tania,
  ale k liczyć z liczników zdarzeń, nie z teorii transportu
- Tokamak: bilans 0-wymiarowy (moc fuzji vs straty) — uczciwy jako model,
  bez MHD

## Wnioski projektowe dla Genesis OS
1. Reakcja łańcuchowa z prętami kontrolnymi — najlepszy interaktyw tego laba
   (suwak k, moment krytyczności namacalny)
2. Kalkulator Lawsona z suwakami n, τ, T i pytaniem „czy zapłon?" — unikat
3. Mapa nuklidów N–Z (zaimplementowane) — „układ okresowy 2.0", model SEMF +
   realne izotopy NNDC, most koncepcyjny do Atom Lab (tam: powłoki
   elektronowe: tu: powłoki nukleonowe/liczby magiczne)
