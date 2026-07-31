# Mechanika klasyczna — katalog wiedzy

## Zakres
Prawa Newtona, grawitacja powszechna, zasady zachowania, mechanika
analityczna (Lagrange/Hamilton), problem N ciał i chaos deterministyczny.
Fundament pod orbity w Universe Lab i mechanikę Civilization Lab — dziś
używany przez te laboratoria bez własnego katalogu; ten plik to nadrabia.

## Modele i wzory

**Trzy zasady dynamiki Newtona (1687)** ★★★★★
F = ma jako definicja siły przy stałej masie; zasada akcji-reakcji.
Dokładne w reżimie v≪c i skalach makroskopowych — nie „przybliżenie", tylko
granica niskoenergetyczna teorii relatywistycznej i kwantowej (patrz niżej).

**Powszechne prawo ciążenia** ★★★★★
F = Gm₁m₂/r². Wyprowadza wszystkie trzy prawa Keplera dla problemu dwóch
ciał w sposób analityczny (elipsa, prawo pól, T² ∝ a³). Potwierdzenie
predykcyjne, nie tylko opisowe: Halley przewidział powrót komety w 1758 r.
(zmarł 1742, nie dożył); Le Verrier obliczył pozycję nieznanej planety z
zaburzeń orbity Urana — Neptun znaleziony w 1846 r. tej samej nocy, w
przewidzianym miejscu, w Obserwatorium Berlińskim (Galle).

**Zasady zachowania** ★★★★★
Energia, pęd, moment pędu — konsekwencje symetrii czasu, przestrzeni i
obrotu (twierdzenie Noether 1918, ★★★★★ jako aparat matematyczny łączący
symetrie z zachowaniem). To one, nie same siły, są dziś standardowym
językiem mechaniki.

**Mechanika analityczna — Lagrange/Hamilton** ★★★★★
Równania Eulera-Lagrange'a d/dt(∂L/∂q̇) − ∂L/∂q = 0 są matematycznie
równoważne prawom Newtona, ale uogólniają się wprost na relatywistykę i
mechanikę kwantową (formalizm Hamiltona → równanie Schrödingera przez
kwantowanie kanoniczne). To dlatego fizyka teoretyczna mówi tym językiem,
nie językiem sił.

**Problem N ciał i chaos** ★★★★★ (jako wynik matematyczny)
Dla N=2 istnieje pełne rozwiązanie analityczne (elipsa). Dla N≥3 — brak
ogólnego rozwiązania w postaci zamkniętej (Poincaré 1890, praca o nagrodę
króla Oskara II dla problemu trzech ciał) — to właśnie tam Poincaré odkrył
czułą zależność od warunków początkowych, korzeń współczesnej teorii
chaosu, dekady przed Lorenzem (1963). Układ Słoneczny jest chaotyczny w
horyzoncie ~5–10 mln lat (Laskar 1989) — przewidywalny krótkoterminowo,
nie nieskończenie.

## Ograniczenia teorii (nie sporne — znane granice stosowalności)
- **v ~ c**: potrzebna szczególna teoria względności (patrz
  `spacetime-einstein.md`) — mechanika klasyczna jest jej granicą v≪c
- **Skala atomowa**: potrzebna mechanika kwantowa — klasyczna trajektoria
  cząstki traci sens poniżej długości fali de Broglie'a
- **Pola bardzo silnej grawitacji**: potrzebna OTW (precesja peryhelium
  Merkurego — 43″/wiek reszty po odjęciu zaburzeń od innych planet —
  klasyka daje zero, OTW daje dokładnie tyle, ile zmierzono; Einstein 1915)
- To nie są „błędy" Newtona — to precyzyjnie wyznaczone granice, w których
  teoria pozostaje dokładna do dziś (trajektorie sond kosmicznych liczy się
  klasycznie + poprawki relatywistyczne, nie pełną OTW)

## Publikacje i książki
- Newton, *Philosophiæ Naturalis Principia Mathematica*, 1687 (oryginał;
  czytać o historii, nie kopiować tekstu)
- Le Verrier 1846, *Comptes Rendus* 23 (odkrycie Neptuna z rachunku)
- Poincaré 1890, *Acta Mathematica* 13 (problem trzech ciał, korzeń chaosu)
- Laskar 1989, *Nature* 338, 237 (chaos w Układzie Słonecznym)
- Noether 1918, *Nachr. Ges. Wiss. Göttingen* (twierdzenie o symetriach)
- Podręczniki: Goldstein, Poole, Safko *Classical Mechanics* (standard
  dla Lagrange'a/Hamiltona); Taylor *Classical Mechanics* (przystępniejszy)

## Ograniczenia implementacyjne
- Problem N ciał na telefonie: całkowanie symplektyczne (leapfrog/Verlet)
  zachowuje energię długoterminowo znacznie lepiej niż naiwny Euler —
  krytyczne dla wizualnie stabilnych orbit w symulacjach trwających minuty
- Chaos oznacza, że dokładność numeryczna ogranicza horyzont wiarygodności
  trajektorii — do zakomunikowania w nocie modelu przy N≥3 ciałach

## Wnioski projektowe dla Genesis OS
1. To już domyślny silnik orbit w Universe Lab (zderzenia galaktyk) i
   Civilization Lab — ten plik formalizuje źródła, których dotąd brakowało
2. Historia Neptuna (przewidywanie z rachunku, nie z obserwacji) to gotowa
   narracja Discovery Log: „obliczyłeś nieznaną masę z zaburzeń orbity"
3. Wizualizacja chaosu trzech ciał (czuła zależność od warunków
   początkowych — dwie niemal identyczne symulacje rozjeżdżające się w
   czasie) to naturalne rozszerzenie istniejącego N-ciałowego kodu
