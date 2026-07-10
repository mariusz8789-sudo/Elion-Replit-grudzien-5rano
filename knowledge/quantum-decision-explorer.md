# Quantum Decision Explorer — katalog wiedzy

## Zakres i status — PRZECZYTAJ PRZED KAŻDĄ ODPOWIEDZIĄ
To narzędzie NARRACYJNE/REFLEKSYJNE, wizualnie inspirowane fizyką (galaktyka,
gwiazdy, odgałęzienia), ale NIE jest modelem fizycznym, nie przewiduje
przyszłości i nie odtwarza rzeczywistości. Nie ma związku z interpretacją
wielu światów (Everett) — Multiverse Lab osobno i poprawnie odróżnia tamten
temat jako hipotezę fizyczną (★★ na skali potwierdzenia). Tutaj nie ma
żadnej skali potwierdzenia do cytowania, bo nie ma żadnego twierdzenia
naukowego do zweryfikowania — to notatnik decyzji użytkownika z ładną
wizualizacją, nic więcej.

**Zasada dla Narratora AI**: nigdy nie sugeruj, że aplikacja "wie", co by
się stało, gdyby użytkownik wybrał inaczej. Nigdy nie używaj języka
przepowiadania ("Twoja alternatywna ścieżka pokazuje, że..."). Zawsze
traktuj "gałęzie" jako to, czym są: własne przemyślenia użytkownika o tym,
"co by było, gdyby", zapisane przez niego samego — nie wynik obliczeń.

## Co to narzędzie faktycznie robi
- Użytkownik zapisuje własne, subiektywne decyzje życiowe (tytuł, opis,
  rok, "waga" 1-10, do 4 alternatywnych ścieżek jako wolny tekst)
- Wizualizacja: każda decyzja to gwiazda w spirali (kąt złoty/phyllotaxis —
  ta sama, prawdziwa technika geometryczna, którą rośliny rozkładają
  liście i którą Civilization Lab już wykorzystuje do węzłów sieci
  energetycznej — to jedyny "naukowy" element tutaj: geometria rozkładu
  punktów, NIE twierdzenie o naturze decyzji czy rzeczywistości)
- Suwak przesuwa, która decyzja jest aktywna; aktywna gwiazda pokazuje
  swoje odgałęzienia (tekst wpisany przez użytkownika, wizualizowany jako
  świecące ścieżki)
- Wszystko lokalnie (localStorage), zero backendu, zero konta, zero
  wysyłania danych osobistych gdziekolwiek

## Dlaczego to NIE jest fizyka (mimo estetyki)
- Prawdziwa interpretacja wielu światów (Everett, 1957) dotyczy formalizmu
  mechaniki kwantowej — dekoherencji, superpozycji, pomiaru. Nie ma nic
  wspólnego z ludzkimi decyzjami życiowymi w sensie fizycznym
- Nie istnieje żaden zweryfikowany mechanizm, przez który "alternatywna
  wersja" osoby istniałaby fizycznie w innej gałęzi czasoprzestrzeni jako
  skutek decyzji o karierze czy związku
- Estetyka (galaktyka, gwiazdy, poświata) jest METAFORĄ wybraną dla
  atrakcyjności wizualnej — dokładnie tak samo jak inne stylizowane
  wizualizacje w Genesis OS (np. symboliczny model powłokowy atomu w Atom
  Lab), tylko tu metafora nie ma nawet warstwy ilościowej fizyki pod spodem

## Ograniczenia implementacyjne
- Dane są w 100% subiektywne i wpisywane ręcznie — aplikacja nie ocenia,
  nie waliduje sensowności ani nie "analizuje" treści decyzji
- Brak jakiegokolwiek algorytmu przewidującego, "co by było" — puste pole
  na przemyślenia użytkownika, nie generator scenariuszy

## Wnioski projektowe dla Genesis OS
1. Stały, niedomykalny baner z disclaimerem w UI (nie tylko w tym pliku)
   — użytkownik musi go widzieć zawsze, nie tylko przy pierwszym wejściu
2. To narzędzie NIE powinno nigdy dostać `ConfirmationLevel` ani
   `HonestyLevel` sugerującego stopień naukowego poparcia — bo nie ma tu
   żadnego twierdzenia do ocenienia
3. Jeśli w przyszłości dodać AI sugerujące nowe "gałęzie" na podstawie
   opisu decyzji — jasno oznaczyć jako kreatywną sugestię, nigdy jako
   przewidywanie czy analizę
