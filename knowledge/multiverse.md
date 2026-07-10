# Multiverse Lab — katalog wiedzy (całość: modele teoretyczne)

## Zakres
Fine-tuning stałych, alternatywne wszechświaty, interpretacja wielu światów.
To laboratorium z definicji operuje na poziomach ★–★★★ — jego wartość polega
na uczciwym pokazywaniu granicy wiedzy.

## Modele i skalowania

**Czułość fizyki na stałe (fine-tuning jako FAKT obliczeniowy)** ★★★★
To, że niewielkie zmiany stałych psują chemię/gwiazdy, jest wynikiem
rachunków, nie filozofią:
- siła silna +~9% → związany diproton → wybuchowe spalanie wodoru;
  −~9% → deuter niezwiązany → brak nukleosyntezy (progi wg literatury,
  rzędy wielkości)
- rezonans Hoyle'a (7,65 MeV w ¹²C) czuły na ~% — warunek syntezy węgla
- czas życia gwiazd ~ G⁻² (argument rzędu wielkości)
- Λ większa o rzędy wielkości → brak galaktyk (Weinberg 1987)

**WYJAŚNIENIA fine-tuningu (tu zaczyna się spór)** — wszystkie ★–★★:
- Multiwersum krajobrazowe (inflacja wieczna + krajobraz strun): różne
  „bąble" z różnymi stałymi + selekcja obserwacyjna ★★
- Głębsza teoria wyznaczy stałe jednoznacznie ★★
- Zasada antropiczna jako wyjaśnienie wystarczające — spór metodologiczny
  (czy to w ogóle nauka? Popper vs bayesianizm)
- Projekt/symulacja ★ — nietestowalne, odnotować i nie rozwijać

**Klasyfikacja Tegmarka (mapa pojęciowa)**: I — poza horyzontem (te same
prawa) ★★★; II — inne stałe (inflacja) ★★; III — wiele światów MK ★★;
IV — matematyczny ★.

**Interpretacja wielu światów (Everett 1957)** ★★
Identyczne przewidywania pomiarowe co inne interpretacje MK — patrz
quantum.md. Nie mylić poziomu III z II (częsty błąd popularyzacji —
w aplikacji rozdzielić wyraźnie).

## Publikacje i książki
- Barnes 2012, arXiv:1112.4647 — najlepszy naukowy przegląd fine-tuningu
- Tegmark 2003, arXiv:astro-ph/0302131 (klasyfikacja)
- Weinberg 1987, PRL 59, 2607 (antropiczne ograniczenie Λ)
- Hoyle 1954 (rezonans ¹²C); Everett 1957, Rev. Mod. Phys. 29, 454
- Rees, *Just Six Numbers* (popularne, rzetelne); Barrow & Tipler,
  *The Anthropic Cosmological Principle*

## Ograniczenia implementacyjne
- Nasze skalowania to rzędy wielkości — bez pełnych symulacji gwiazd
  dokładniej się nie da (i nikt inny też nie potrafi)
- Sprzężenia zmian stałych są nieliniowe — zmiana dwóch naraz nie jest sumą
  zmian pojedynczych; komunikować niepewność

## Wnioski projektowe dla Genesis OS
1. Rozdzielać twardo: obliczone konsekwencje zmian (★★★★) od wyjaśnień
   przez multiwersum (★★) — to serce uczciwości tego laba
2. Galeria nazwanych wszechświatów z audytem konsekwencji (zaimplementowane
   dwukrotnie: jako presety suwaków w eksperymencie bazowym, i jako
   „Multiverse Nexus" — 3D sala portali (Three.js, `Sim3D`), oryginalna
   metafora Genesis OS, NIE odwzorowanie żadnego filmu/serialu. Portale
   „lokalne" pokazują te same modele teoretyczne co suwaki; portale-tunele
   NAPRAWDĘ przenoszą do Universe Lab z obliczonymi wartościami Ω_Λ przez
   `core/scenarioBridge.ts` — ten sam most co ekran „Co by było, gdyby?")
3. Porównywarka A/B dwóch wszechświatów (Etap 2)
4. Poziomy Tegmarka jako interaktywna mapa pojęciowa — porządkuje myślenie
   użytkownika lepiej niż jakikolwiek tekst
5. Tesserakt (4D, zaimplementowane) — geometria, nie fizyka: obrót
   hipersześcianu w płaszczyźnie 4D i rzut do 3D, dokładna algebra liniowa,
   jawnie odróżniona od spekulacji o fizycznych dodatkowych wymiarach
   (teoria strun) — patrz `core/physics.ts` (`rotate4D`/`project4Dto3D`).
