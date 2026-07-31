# Termodynamika i fizyka statystyczna — katalog wiedzy

## Zakres
Cztery zasady termodynamiki, mechanika statystyczna (most między pojedynczą
cząstką a układem makroskopowym), entropia czarnych dziur, strzałka czasu.
Fundament pod bilanse energii w Nuclear Lab i entropijne aspekty czarnych
dziur w Einstein Lab; dziś bez własnego katalogu.

## Modele i wzory

**Cztery zasady termodynamiki** ★★★★★
Zerowa (przechodniość równowagi termicznej definiuje temperaturę); pierwsza
(ΔU = Q − W, zachowanie energii z ciepłem); druga (entropia izolowanego
układu nie maleje, ΔS ≥ 0); trzecia (S → 0 przy T → 0 K, zera bezwzględnego
nie da się osiągnąć skończoną liczbą kroków). Bez wyjątków eksperymentalnych
od XIX w.; podstawa każdego silnika, chłodziarki, elektrowni.

**Mechanika statystyczna — most mikro-makro** ★★★★★
S = k_B ln Ω (Boltzmann, entropia jako logarytm liczby mikrostanów
odpowiadających makrostanowi). Rozkład Boltzmanna P ∝ e^{−E/k_BT}. To
dosłownie ten sam aparat matematyczny, którego Nuclear Lab używa pośrednio
przy gęstości poziomów jądrowych i tempie reakcji termojądrowych.

**Sprawność Carnota** ★★★★★
η_max = 1 − T_zimne/T_gorące — górna granica sprawności DOWOLNEGO silnika
cieplnego, wynik czysto termodynamiczny, niezależny od konstrukcji. Żaden
silnik rzeczywisty jej nie przekracza — to nie inżynieryjne ograniczenie,
tylko konsekwencja drugiej zasady.

**Entropia i strzałka czasu** ★★★★ (mechanizm) / ★★★ (dlaczego akurat taki
stan początkowy)
Druga zasada tłumaczy, czemu czas „płynie" w jedną stronę mikroskopowo
odwracalnych praw (Boltzmann, H-twierdzenie, 1872). Ale WYMAGA niskiej
entropii początkowej Wszechświata jako założenia — czemu Wielki Wybuch
zaczął się w stanie tak nisko-entropijnym, to wciąż otwarte pytanie
kosmologiczne (Penrose, *Cycles of Time*, 2010 — hipoteza, nie konsensus).

**Termodynamika czarnych dziur** ★★★ (silnie umotywowana, częściowo
potwierdzona)
Entropia Bekensteina-Hawkinga S = k_B c³A/(4Gℏ) — entropia proporcjonalna
do POLA POWIERZCHNI horyzontu, nie objętości (korzeń zasady holograficznej).
Temperatura Hawkinga T = ℏc³/(8πGMk_B) — im mniejsza czarna dziura, tym
gorętsza. Powiązanie z `spacetime-einstein.md`: promieniowanie Hawkinga
samo jest ★★★ (przewidywanie teoretyczne, niezmierzone bezpośrednio dla
astrofizycznych czarnych dziur — zbyt zimne), ale analogi akustyczne
(„dźwiękowe czarne dziury" w kondensatach Bosego-Einsteina) zmierzyły
analogiczne promieniowanie w laboratorium (Steinhauer 2016) — mocne
pośrednie wsparcie mechanizmu.

## Sprzeczne teorie / otwarte spory

**Problem strzałki czasu — dlaczego niska entropia na początku?** ★★★
Nie ma dziś konsensusu: inflacja kosmiczna, warunek brzegowy Hartle'a-Hawkinga
(★★, funkcja falowa Wszechświata bez brzegu), czy głębsza symetria —
wszystkie ★–★★. Zdanie szczere: obserwujemy niską entropię początkową jako
fakt, nie mamy zgody co do przyczyny.

**Śmierć cieplna kontra cykliczny Wszechświat** ★★–★★★
Ekstrapolacja drugiej zasady na cały Wszechświat (maksimum entropii, „śmierć
cieplna") zależy od modelu kosmologicznego na bardzo długich skalach czasu —
otwarte, spekulatywne poza rzędem ~10¹⁰⁰ lat.

## Publikacje i książki
- Boltzmann 1872 (H-twierdzenie); Clausius 1865 (sformułowanie entropii)
- Bekenstein 1973, *Phys. Rev. D* 7, 2333; Hawking 1975, *Commun. Math.
  Phys.* 43, 199 (promieniowanie Hawkinga)
- Steinhauer 2016, *Nature Physics* 12, 959 (analogowe promieniowanie
  Hawkinga w kondensacie BEC — pomiar laboratoryjny)
- Penrose 2010, *Cycles of Time* (popularna, ale autor to laureat Nobla
  2020 — jawnie oznaczyć jako jego hipotezę, nie konsensus)
- Podręczniki: Schroeder *An Introduction to Thermal Physics* (świetny
  balans mikro/makro); OpenStax *University Physics* t. 2 (CC BY 4.0)

## Ograniczenia implementacyjne
- Pełna symulacja statystyczna (miliony cząstek) zbyt ciężka na telefon —
  wizualizacje typu „gaz w pudełku" używają rzędu 10²–10³ cząstek jako
  reprezentacji poglądowej, jawnie oznaczonej jako model uproszczony
- Entropia czarnej dziury i promieniowanie Hawkinga to liczby do pokazania
  (wzór, rząd wielkości), nie animacja mikrostanów — nie da się tego
  poglądowo zwizualizować bez wprowadzania w błąd

## Wnioski projektowe dla Genesis OS
1. Sprawność Carnota jako uniwersalny, twardy fakt — dobry kontrapunkt dla
   „perpetuum mobile" w edukacyjnej narracji (czemu nie da się przekroczyć)
2. Entropia Bekensteina-Hawkinga to naturalne rozszerzenie Einstein Lab —
   liczba do pokazania przy istniejącej symulacji czarnej dziury, nie nowy lab
3. Strzałka czasu i pytanie o niską entropię początkową Wszechświata to
   materiał dla Multiverse Lab (kolejny przykład głębokiej niepewności
   pokazanej uczciwie, zamiast udawanej pewności)
