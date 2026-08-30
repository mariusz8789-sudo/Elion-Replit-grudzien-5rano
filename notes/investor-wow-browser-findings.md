# Investor WOW — obserwacje przeglądarkowe

- Aplikacja działa na `http://127.0.0.1:8080`.
- Po wejściu na `#/drug?reference=caffeine&target=A1` pojawia się onboarding; po użyciu „Pomiń” trasa poprawnie renderuje `Drug Discovery`.
- Widok bez sesji wymaga logowania lub utworzenia konta. Dostępny jest globalny `Science Chat`.
- Na tym etapie nie wykonywano żadnej operacji destrukcyjnej, zakupu ani wysyłki danych.

Po utworzeniu konta testowego `Investor Demo` aplikacja przeszła do autoryzowanego widoku `Drug Discovery`. Workspace pokazuje, że nie ma jeszcze projektu z prawem zapisu; zaawansowany workflow ADMIN pozostaje ukryty. Manifest zdolności renderuje dostępne obliczenia oraz jawne blokady zewnętrznych silników. Nie użyto prywatnych danych ani prywatnego hasła.

Na stronie `#/projects` formularz projektu działa. Wpisano `Genesis Investor WOW Demo`; utworzenie projektu nie zostało jeszcze wysłane w tej notatce.

Projekt `Genesis Investor WOW Demo` został utworzony w autoryzowanej sesji; użytkownik `Investor Demo` ma rolę WŁAŚCICIEL. Projekt nadal ma wyłącznie automatyczną gałąź `main`; nie wykonywano operacji na main ani żadnego scalenia.

Science Chat został otwarty z autoryzowanego projektu. Wpisano jedno pytanie inwestora: „Znajdź naturalnych kandydatów dla receptora A1 i wykonaj dostępne analizy.” Pytanie nie zostało jeszcze wysłane.

Po przebudowaniu aplikacji autoryzowana sesja i projekt pozostały dostępne. Science Chat zachował poprzednią turę z `REFERENCE BLOCKED`; nowa próba z tym samym pytaniem została wpisana do formularza, ale nie wysłana przed tą obserwacją.

Po pełnym przeładowaniu bundle autoryzacja i projekt `Genesis Investor WOW Demo` zostały zachowane, a Science Chat wystartował bez poprzedniej historii blokady. To potwierdza, że wcześniejszy komunikat był stanem rozmowy, nie cache bundle.

Po świeżym otwarciu Science Chat pytanie inwestora zostało ponownie wpisane w nowy bundle i oczekuje na wysłanie. Sesja autoryzowana oraz projekt owner nadal działają.

Po drugim patchu wykonano pełne przeładowanie; projekt demo i autoryzowana sesja nadal są dostępne. Można powtórzyć czysty Science Chat bez poprzedniego stanu rozmowy.

Po restarcie serwera i pełnym przeładowaniu świeży bundle załadował się poprawnie; projekt demo oraz autoryzowana sesja pozostały dostępne.
