# Mathematics Lab — katalog wiedzy

## Zakres
Bezpieczna piaskownica równań: algebra (wykresy, pierwiastki), rachunek
różniczkowy i całkowy (pochodne symboliczne, całki numeryczne), równania
różniczkowe zwyczajne (pole kierunkowe + rozwiązanie numeryczne RK4).

## Modele i wzory

**Bezpieczny parser wyrażeń (zaimplementowane)** ★★★★★
Zero `eval()`/`Function()` w całym łańcuchu — świadoma decyzja
architektoniczna, nie przeoczenie. Tokenizer → parser rekurencyjnego
zstępowania (recursive descent, standardowa technika informatyczna) →
drzewo AST → ewaluator z jawną białą listą dozwolonych funkcji
(`core/mathExpr.ts::FUNCTIONS`) i stałych (`CONSTANTS`). Wejście
użytkownika NIGDY nie dotyka silnika JavaScript jako kod — to zwykłe
dane strukturalne, tak samo bezpieczne jak liczba wpisana do suwaka.
Wspiera niejawne mnożenie ("2x", "2sin(x)", "(x+1)(x-1)") zgodnie ze
standardową notacją matematyczną, z poprawną kolejnością działań
(potęgowanie prawostronnie łączne: 2^3^2=2^(3^2); minus unarny wiąże
słabiej niż potęgowanie: -2^2=-4, nie 4).

**Różniczkowanie symboliczne (zaimplementowane)** ★★★★★
DOKŁADNE (nie numeryczne przybliżenie) zastosowanie standardowych reguł
rachunku różniczkowego: reguła sumy/różnicy, reguła iloczynu
(fg)′=f′g+fg′, reguła ilorazu (f/g)′=(f′g−fg′)/g², reguła potęgowa
(uⁿ)′=n·u^(n−1)·u′, reguła łańcuchowa dla funkcji elementarnych
(sin, cos, tan, exp, ln, sqrt, funkcje odwrotne trygonometryczne i
hiperboliczne), różniczkowanie logarytmiczne dla ogólnego przypadku
f(x)^g(x) (obie strony zależne od zmiennej). Zweryfikowane przed
napisaniem testów formalnych: (1) przeciw znanym dokładnym pochodnym
(x², x³, sin, iloczyn, iloraz, złożenie, x^x), (2) niezależną kontrolą
różnicy centralnej — pochodna symboliczna porównana z numeryczną
pochodną ORYGINALNEJ funkcji dla 5 różnych wyrażeń w wielu punktach.
Krok po kroku: `differentiateWithSteps` generuje listę zastosowanych
reguł z opisem słownym, w kolejności post-order (najpierw podwyrażenia,
potem reguła łącząca je w całość — dokładnie jak liczy się pochodną
ręcznie).

**Całkowanie numeryczne — metoda Simpsona (zaimplementowane)** ★★★★★
Złożona kwadratura Simpsona (`simpsonIntegral`), dokładna dla
wielomianów stopnia ≤3, standardowa metoda numeryczna. Świadomie NIE
próbuje się całkowania symbolicznego — w ogólności nie ma ono
rozwiązania w postaci zamkniętej (np. e^(−x²) nie ma elementarnej
funkcji pierwotnej) — to jawnie nazwane w interfejsie, nie ukryte pod
pozornie dokładnym wynikiem. Zweryfikowane przeciw znanym całkom:
∫₀¹x²dx=1/3, ∫₀^πsin(x)dx=2.

**Szukanie pierwiastków (zaimplementowane)** ★★★★
Próbkowanie + bisekcja dla każdej wykrytej zmiany znaku. Ograniczenie
udokumentowane wprost w interfejsie: metoda NIE wykrywa pierwiastków
parzystej krotności (styczne dotknięcie osi X bez zmiany znaku, np.
x² ma podwójny pierwiastek w x=0, ale ta metoda może go przeoczyć przy
niesprzyjającym próbkowaniu) — świadome ograniczenie prostej metody, nie
ukryty błąd.

**Równania różniczkowe — RK4 (zaimplementowane)** ★★★★★
`stepOdeRK4`/`solveOde`: metoda Rungego–Kutty 4. rzędu — TA SAMA metoda
numeryczna używana w całym Genesis OS (atraktor Lorenza, problem trzech
ciał, geodezyjne Schwarzschilda/Kerra), tu zastosowana do ogólnego
dy/dx=f(x,y). Zweryfikowane przeciw trzem znanym rozwiązaniom
analitycznym: dy/dx=y (wzrost wykładniczy, y=e^x), dy/dx=−y (rozpad,
y=e^−x), dy/dx=2x (y=x²). Pole kierunkowe (siatka krótkich odcinków
pokazujących lokalne nachylenie) to standardowa, podręcznikowa
wizualizacja jakościowego zachowania równania NIEZALEŻNIE od konkretnego
warunku początkowego — pokazywana zawsze razem z jednym konkretnym
rozwiązaniem (scałkowanym z podanego punktu startowego), żeby uczciwie
odróżnić "ogólne zachowanie" od "ten jeden przypadek".

## Ograniczenia implementacyjne
- Różniczkowanie obsługuje tylko funkcje jednoargumentowe z ustaloną
  listą reguł (`SINGLE_ARG_DERIVATIVES`) — nieznana funkcja w wyrażeniu
  do zróżniczkowania rzuca czytelny błąd zamiast milczącej niepoprawnej
  odpowiedzi
- Całkowanie symboliczne świadomie NIE zaimplementowane (nierozstrzygalne
  w ogólności w sensie "zawsze istnieje elementarna funkcja pierwotna")
- Równania różniczkowe: tylko pierwszego rzędu, jedna zmienna zależna
  (dy/dx=f(x,y)) — układy równań i rzędy wyższe pozostają backlogiem
- Zakres wykresu ograniczony do rozsądnych wartości x (skończona
  precyzja zmiennoprzecinkowa przy bardzo dużych/małych zakresach)

## Wnioski projektowe dla Genesis OS
1. Bezpieczeństwo przez konstrukcję (brak eval) to ten sam standard co
   `core/customExperiment.ts` — dowolny tekst użytkownika, zero nowej
   powierzchni ataku
2. Rozróżnienie "dokładne symbolicznie" (pochodna) vs "numeryczne"
   (całka, RK4) to dosłownie ta sama zasada uczciwości naukowej, która
   rządzi resztą platformy — tu zastosowana do samej matematyki, nie do
   fizyki
3. Pole kierunkowe + rozwiązanie RK4 to most koncepcyjny do reszty
   Genesis OS: to DOKŁADNIE ta metoda numeryczna, którą user widział już
   w atraktorze Lorenza i geodezyjnych czarnych dziur — matematyka
   "goła", bez fizycznego kontekstu, ale ten sam warsztat
