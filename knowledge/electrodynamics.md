# Elektrodynamika — katalog wiedzy

## Zakres
Równania Maxwella, fale elektromagnetyczne, siła Lorentza, promieniowanie —
teoria, która historycznie wymusiła szczególną teorię względności i, przez
katastrofę w podczerwieni, otworzyła drzwi do mechaniki kwantowej. Dziś bez
własnego laboratorium; fundament pod widma w Atom Lab i pole EM w Particle Lab.

## Modele i wzory

**Równania Maxwella (1861–1865, forma różniczkowa dzięki Heaviside'owi)** ★★★★★
∇·E = ρ/ε₀, ∇·B = 0, ∇×E = −∂B/∂t, ∇×B = μ₀J + μ₀ε₀∂E/∂t. Cztery równania
łączą elektryczność, magnetyzm i optykę w jedną teorię — jedno z największych
zjednoczeń w historii fizyki, wzorzec, do którego porównuje się później
Model Standardowy.

**Predykcja fal elektromagnetycznych** ★★★★★
Z samych stałych elektrycznych i magnetycznych (ε₀, μ₀, znanych z
eksperymentów elektrostatycznych) Maxwell obliczył prędkość fal EM:
c = 1/√(ε₀μ₀) — i ta liczba zgadzała się z niezależnie zmierzoną prędkością
światła. Wniosek Maxwella (1865): światło JEST falą elektromagnetyczną.
Potwierdzone eksperymentalnie przez Hertza (1887) — wygenerował i wykrył
fale radiowe w laboratorium, dokładnie tak, jak przewidywała teoria.

**Siła Lorentza** ★★★★★
F = q(E + v×B). Podstawa działania każdego akceleratora cząstek, silnika
elektrycznego, spektrometru masowego; identyczna zasada steruje torem
cząstek w Particle Lab.

**Promieniowanie i wektor Poyntinga** ★★★★★
S = E×B/μ₀ (gęstość strumienia energii); przyspieszany ładunek promieniuje
(wzór Larmora). To dlatego elektrony na klasycznej orbicie planetarnej wokół
jądra powinny w ~10⁻¹¹ s spaść na jądro, tracąc energię na promieniowanie —
klasyczna elektrodynamika PRZEWIDUJE, że atomy klasyczne nie mogą istnieć.
To jeden z dwóch pęknięć XIX-wiecznej fizyki (obok katastrofy w
nadfiolecie), które wymusiły mechanikę kwantową (patrz `atom.md`, `quantum.md`).

## Sprzeczne teorie / miejsca, gdzie klasyka pęka (nie spór — znana granica)

**Niezmienniczość Galileusza kontra równania Maxwella** ★★★★★ (rozstrzygnięte)
Równania Maxwella NIE są niezmiennicze względem transformacji Galileusza —
przewidują tę samą prędkość c we wszystkich układach inercjalnych, co jest
sprzeczne z klasycznym dodawaniem prędkości. Eksperyment Michelsona-Morleya
(1887) nie znalazł „eteru" tłumaczącego tę różnicę. Einstein rozwiązał to
w 1905 r. w pracy dosłownie zatytułowanej *Zur Elektrodynamik bewegter
Körper* („O elektrodynamice ciał w ruchu") — szczególna teoria względności
narodziła się z próby uratowania spójności elektrodynamiki, nie odwrotnie.

**Katastrofa w nadfiolecie** ★★★★★ (rozstrzygnięte przez kwantowanie)
Klasyczna elektrodynamika + fizyka statystyczna przewidują nieskończoną
energię promieniowania ciała doskonale czarnego przy krótkich falach —
sprzeczne z każdym pomiarem. Planck (1900) rozwiązał to zakładając, że
energia jest wymieniana kwantami E = hf — matematyczna sztuczka, która
okazała się fundamentem mechaniki kwantowej.

**Elektrodynamika kwantowa (QED)** ★★★★★
Pełne, kwantowe uogólnienie — najdokładniej zweryfikowana teoria w historii
nauki: anomalny moment magnetyczny elektronu zgadza się z eksperymentem do
~10 cyfr znaczących (Hanneke et al. 2008). Klasyczna elektrodynamika to
granica QED przy dużej liczbie fotonów — poprawna wszędzie tam, gdzie nie
liczy się kwantowanie pojedynczych fotonów (radio, silniki, MRI).

## Publikacje i książki
- Maxwell 1865, *Phil. Trans. R. Soc.* 155, 459 (*A Dynamical Theory of
  the Electromagnetic Field* — oryginalna praca)
- Hertz 1887 (eksperymentalne wykrycie fal EM, opisane pośmiertnie w
  *Electric Waves*, 1893, dostępne jako reprint)
- Michelson & Morley 1887, *Am. J. Sci.* 34, 333
- Einstein 1905, *Ann. Phys.* 322, 891 (*Zur Elektrodynamik bewegter Körper*)
- Planck 1900, *Verh. Dtsch. Phys. Ges.* 2, 237
- Hanneke, Fogwell, Gabrielse 2008, *PRL* 100, 120801 (QED, moment magnetyczny)
- Podręczniki: Griffiths *Introduction to Electrodynamics* (standard);
  OpenStax *University Physics* t. 2 (CC BY 4.0 — legalny korpus tekstowy)

## Ograniczenia implementacyjne
- Pełne pole EM 3D w czasie rzeczywistym na telefonie jest ciężkie —
  wizualizacje linii pola/fal 2D (jak istniejące demo interferencji w
  Quantum Lab) są właściwym poziomem uproszczenia, jawnie oznaczonym
- QED nie jest planowana do implementacji obliczeniowej — cytowana tylko
  jako kontekst historyczny/graniczny dla klasycznej elektrodynamiki

## Wnioski projektowe dla Genesis OS
1. Historia „równania Maxwella wymusiły Einsteina" to najsilniejszy most
   narracyjny między Space-Time Lab a resztą platformy — pokazuje, że STW
   nie spadła znikąd
2. Katastrofa w nadfiolecie + kwantowanie Plancka to naturalny prolog do
   Quantum Lab i Atom Lab — most historyczny, nie tylko formalny
3. Symulacja klasycznego atomu „spadającego" elektronu (10⁻¹¹ s do
   zapadnięcia) jako jawnie oznaczony model FAŁSZYWY — dydaktycznie mocny
   sposób pokazania, dlaczego potrzebna była mechanika kwantowa
