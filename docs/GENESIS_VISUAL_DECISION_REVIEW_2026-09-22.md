# Genesis — decyzja wizualna po porównaniu z wcześniejszymi zdjęciami

22 września 2026. Audyt i rekomendacje, bez zakupu, pobierania nowych assetów, integracji ani migracji silnika. Poprzednie zmiany implementacyjne pozostają lokalne. Bez commit/push/merge/deploy.

## Co już było

Użytkownik ma rację: pełny ubrany człowiek, komora, platforma, manipulatory i hala biologiczna występowały na wcześniejszych zdjęciach. Naprawa loadera poprawia niezawodność ich pokazywania; nie jest dostarczeniem nowej grafiki. `before-body.png` i `after-body.png` pokazują tę samą bazę. Ostatnie zmiany dotyczą kadru, refleksów i panelu, nie szczegółowej anatomii.

Starszy szeroki kadr lepiej eksponuje manipulatory i głębię laboratorium. Należy zachować szeroki widok pomieszczenia oraz osobny, skupiony widok Human Explorer. Jeden kadr nie powinien równocześnie pełnić obu zadań.

Referencje użytkownika przedstawiają docelowy wygląd. Nie są dowodem, że identyczne modele, anatomia lub funkcje działały w repo. Zdjęcia faktycznej aplikacji i obrazy koncepcyjne oceniono oddzielnie.

## Zakres obejrzanych światów

Oceniono dostarczone zdjęcia rzeczywistej aplikacji i referencji oraz lokalne rendery: `before-body`, `after-body`, `macro-organ`, `macro-tissue`, `macro-cell`, `macro-organelle`, `macro-molecule`, `human-mobile`, `materials-compute`, `street`, dashboard. Obejrzano również historyczne `artifacts/screenshots/city3d-{street,district,city}-final.png`; ich nazwa „final” nie oznacza nowego wykonania dzisiaj.

Repo ma dziesięć pozycji w `WorldsHubScreen.tsx`: Agent w laboratorium, Human Biology Lab, Miasto epidemiologiczne, Wirtualne laboratorium, Molecule World, Discovery Hall, Scientific City, Virtual Cell Lab, World Engine i Discovery Timeline. Dodatkowe trasy obejmują m.in. Collider, Quantum FPV, CERN, HF Slice i Temporal Cinematic. Stacje neuro, histologii, obrazowania i compute są także częściami istniejącej hali biology, nie automatycznie osobnymi, kompletnymi światami.

Nie ma aktualnych screenshotów każdego z tych ekranów w przekazanym zestawie. W szczególności nie przypisujemy oceny świeżego renderu Scientific City, Discovery Hall/Timeline, całemu World Engine ani wszystkim trasom kwantowym/kosmologicznym. Inventaryzacja kodu nie zastępuje oględzin. Wcześniejszego HF Street Slice nie należy utożsamiać z prostszą ulicą Temporal Cinematic.

## Ranking według wpływu na demo inwestorskie

Ocena jest osądem projektowym, nie zmierzonym wynikiem badania inwestorów. Czasy to szacunki pracy doświadczonego wykonawcy/technical artist, 1 dzień = około 8 godzin; bez oczekiwania na licencje i bez walidacji medycznej.

| Priorytet i obszar | CURRENT — co widać | FREE IMPROVEMENT — istniejący kod i darmowe zasoby | PAID IMPROVEMENT — sens wydatku | Szacowany czas | Ryzyko licencji |
| --- | --- | --- | --- | --- | --- |
| 1. Human Explorer / narządy | Ubrana postać zewnętrzna; serce jako elipsoida; brak widocznej szczegółowej anatomii układów | Rozdzielić widok zewnętrzny i anatomiczny, powiększać wybrany narząd; pilot kilku narządów BodyParts3D, własne materiały i mapowanie atlasu | Jeden zestaw rozpoznawalnych narządów za 69 USD wskazany niżej, używany w Explorerze i stanowiskach biology/imaging | Kod kadru/UI: 1–2 dni; pilot darmowej anatomii: 3–5 dni; płatny pilot: 2–4 dni, pełne wpięcie zestawu: 5–10 dni | BodyParts3D: CC BY 4.0, atrybucja i konkretna wersja. Płatny: prawa do webowej dystrybucji wymagają wyjaśnienia |
| 2. Kompozycja, czytelność i mikroświat | Wiele drobnych przycisków, duży panel; komórka/molekuła konkurują z postacią; biała głowa w ghost; dolna część ciała zasłonięta na mobile | Duży osobny viewport obserwacji, zwijane sterowanie, poprawa ghost, dedykowany kadr mikro; błony i organella rozwijać proceduralnie | Asset nie naprawi layoutu ani kompozycji; anatomia nie zastąpi tekstur histologicznych | 2–4 dni na wybraną ścieżkę demo | Własny kod: brak nowej licencji assetowej; obrazy histologiczne osobno ze źródłem |
| 3. Osobisty holograficzny naukowiec | Istnieją postacie i głos/narracja, ale nie zweryfikowano kompletnego rozmawiającego hologramu | Obecny GLB, shader hologramu, spojrzenie, gesty, usta zsynchronizowane z istniejącym głosem; wspólny ScienceChat i stan agenta | Nie kupować kolejnej postaci przed wykorzystaniem obecnego riggu i mimiki | 3–5 dni demonstrator; 7–12 dni dopracowanie interakcji, przerwań i mobile | Obecny zatwierdzony asset; sprawdzić każdą dodatkową animację/ubranie i usługę głosu |
| 4. Materiały/compute z generatora | Trzy proste stanowiska w pustym, słabo skomponowanym pomieszczeniu; puste monitory | Ponownie użyć istniejącego kitu hali: obudowy, bevel, krzesła, przewody, etykiety, światła stanowisk; CC0 PBR i aparatura | Całe kolejne laboratorium nie jest pierwszym zakupem; najpierw spójność istniejącego kitu | 2–4 dni na jeden pokój | CC0 dla zweryfikowanych zasobów; nie każdy darmowy model ma CC0 |
| 5. Istniejące laboratoria biology/fizyki i widoki molekularne | Hala i aparatura mają użyteczny charakter; problemem pozostaje nadmiar połysku, nierówna gęstość detalu, UI i zbliżenia | Zachować komorę/manipulatory; szeroki kadr hali, lepsza hierarchia materiałów, lokalne światło, szkło, darmowe rekwizyty; molekuły nadal z danych | Wskazany zestaw narządów poprawi biology/neuro/imaging tylko w swoim zakresie; nie uzasadnia wymiany całego wnętrza | 1–3 dni na reprezentatywną halę; 1–2 dni widok molekularny | Poly Haven/ambientCG CC0; nie przenosić licencji na cudze rekwizyty |
| 6. Miasto / HF Slice / Temporal | Historyczny City3D jest czytelną stylizowaną symulacją, HF Slice ma bogatszy uliczny kadr; aktualny temporal street jest monotonny i zamglony | Wspólna paleta, kadrowanie, ekspozycja i gęstość obiektów; istniejące fasady/latarnie, proceduralne detale, CC0 materiały | Anatomia tu nie pomoże. Płatny pakiet miasta ma mały zwrot dla obecnego demo biologicznego | 2–5 dni na wycinek, nie całe miasto | Licencje aktualnych i dodanych modeli; dane GIS osobno |
| 7. Dashboard | Matrix i treść istnieją; ekran jest tekstowy i gęsty, nie taki jak plansza Matter z referencji | Typografia, hierarchia kart, jeden punkt wejścia, Matrix wyłącznie jako tło; miniatury z prawdziwego runtime | Brak uzasadnienia dla płatnej tapety/UI kitu | 0,5–2 dni | Własny kod i własne rendery; nie używać marketplace preview jako produktu |

Darmowy koszt assetu nie oznacza zerowego kosztu przygotowania. W szczególności BodyParts3D nie jest gotowym, polakierowanym modelem PBR pod przeglądarkę. Źródłowa geometria wymaga kontroli skali, uproszczenia, nazw/semantyki oraz materiałów.

[Poly Haven](https://polyhaven.com/license) i [ambientCG](https://docs.ambientcg.com/license/) dopuszczają komercyjne użycie swoich zasobów CC0. [Aktualna licencja oficjalnego archiwum BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html) to CC BY 4.0: ta bezpłatna anatomia wymaga atrybucji, nie jest CC0. Dawnych kopii z inną licencją nie wolno oznaczać nową licencją bez ustalenia pochodzenia.

## Jeden płatny kandydat poniżej 100 USD

**Wybór do dalszej oceny: [Internal organs — anatomical model with 4K textures, Motionblur / farkas-denesgergo](https://www.cgtrader.com/3d-models/character/human-anatomy/internal-organs-anatomical-model-with-4k-textures), 69 USD według strony produktu.** Cena katalogowa sprawdzona 22.09.2026, nie oferta checkout; podatki/kurs mogą zmienić koszt końcowy. Nie oparto decyzji na promocyjnych kartach z inną ceną.

Produkt deklaruje narządy klatki piersiowej i jamy brzusznej, tekstury 4K, FBX/OBJ, około 121 tys. polygonów; FBX ma 6,03 MB, paczka tekstur 74,4 MB. To dane sprzedawcy, nie pomiar pobranego modelu. FBX ma kontrolę techniczną CGTrader, która nie jest certyfikacją anatomii. Nie ma dowodu kompletnego szkieletu, mięśni, nerwów, mózgu, riggu twarzy ani gotowych LOD. Nie jest to pełny człowiek z referencji.

Moim zdaniem daje największy uzasadniony przyrost spośród przejrzanych kandydatów: wymienia najbardziej widoczne uproszczenie — kształty narządów — i może być ponownie używany w Human Explorer, biology, obrazowaniu i wyjaśnieniach naukowca. Zachowuje obecną zewnętrzną postać i halę. Nie poprawia automatycznie miast, dashboardu ani molekuł; nie istnieje jeden tani asset, który naprawia wszystkie te kategorie.

Przewaga nad proceduralnymi bryłami: gotowy kształt i powierzchnia narządów. Przewaga nad BodyParts3D jest potencjalnie w czasie przygotowania wizualnego, nie w dowiedzionej wartości naukowej. Wariant darmowy ma lepiej określone źródło anatomii i prostsze prawa redystrybucji po spełnieniu atrybucji.

Przed ewentualnym zakupem: potwierdzić oddzielne meshe i nazwy narządów, semantykę prawe/lewe, skale, przekroje, kanały PBR, prawa do klienta webowego i źródła anatomii. Konwersja FBX→GLB, redukcja tekstur, LOD i mapowanie do obecnego atlasu są pracą integracyjną. Kompresja GLB nie jest zabezpieczeniem prawnym.

**Status: CANDIDATE / LEGAL_REVIEW_REQUIRED, nie APPROVED.** „Royalty Free” nie oznacza dowolnego udostępnienia pliku źródłowego. Publiczny URL GLB w obecnym modelu dostarczania wymaga pogodzenia z warunkami ochrony przed wyodrębnieniem: [CGTrader, definicja 8 i §21A.3–6](https://www.cgtrader.com/pages/terms-and-conditions). Zakaz AI training nie jest automatycznie zakazem rozmowy z agentem w scenie. [Aktualna informacja CGTrader](https://help.cgtrader.com/hc/en-us/articles/46191349842705-Can-my-models-still-be-licensed-for-AI-training) wskazuje, że standardowe zakupy od 15 maja 2026 nie obejmują praw do treningu AI. Nie skontaktowano się ze sprzedawcą.

Tańszy [pack organów AI-assisted](https://www.cgtrader.com/3d-models/science/medical/anatomy-organs-pack) nie zastępuje weryfikacji pochodzenia i anatomii. [Pełna anatomia 3D4SCI](https://www.cgtrader.com/3d-models/science/medical/complete-human-anatomy) za 129 USD jest poza limitem. [Pełny model CGstep](https://superhivemarket.com/products/male-full-body-anatomy-3d-model-skin-skeleton-muscles-viscera-vascular-system-blender) za 59 USD ma szerszą deklarację układów, ale brak dostatecznych informacji o liczbie części, geometrii i eksporcie; same tagi Rigged/Animated nie uzasadniają przewagi nad sprawdzalnym, mniejszym zestawem. [Fabowy pełny model bez riggu](https://www.fab.com/listings/1712a727-627e-42df-8ef8-a9d48890a98d?lang=en) ma niewidoczną w odczycie cenę oraz „Allows usage with AI: No”, więc nie spełnia obecnie warunku potwierdzonego zakupu poniżej 100 USD do Genesis; znaczenie warunku AI wymaga oceny tekstu konkretnej licencji.

## Osobisty naukowiec — konkretny zasób już w repo

Odczyt JSON bieżącego `public/assets/genesis-hf/characters/mpfb-lod0.glb` potwierdził 8 meshy, 1 skin i 66 morph targets na głównym meshu. Są m.in. `jawOpen`, mruganie oraz visemy `PP`, `FF`, `aa`, `E`, `O`. Tablica animacji jest pusta. Zatem twarz ma podstawę do mówienia, ale nie ma gotowego zestawu animowanych gestów w tym pliku.

Do wykorzystania: `humanTwinAsset.ts`, `biologyLabKit.ts`, `characterRig.ts`, wspólny `guideRuntime`/`voiceEngine`, ScienceChat i dotychczasowy runtime agenta. Aktualny loader zapisuje tylko pierwszy morph o danej nazwie; zsynchronizowanie ust, zębów i języka wymaga uwzględnienia wszystkich odpowiednich meshy. Proceduralne gesty istniejącej postaci nie podłączą się automatycznie do innego riggu.

Docelowe zachowanie: naukowiec pojawia się obok stanowiska na polecenie użytkownika, patrzy na rozmówcę, słucha, mówi i wskazuje obiekt aktualnego eksperymentu. Ma widoczne stany słuchania/myślenia/mówienia, napisy i przycisk zatrzymania. Jego wypowiedź pochodzi z tego samego agenta i wyników; hologram jest prezentacją. Może towarzyszyć użytkownikowi w różnych światach bez drugiego WorldGraph i drugiego renderera. Dashboard nadal zachowuje Matrix bez postaci w samej warstwie tła; naukowiec byłby świadomie otwieranym elementem interfejsu.

Pierwszy prototyp nie wymaga zakupu postaci. Dobra synchronizacja fonemów zależy od danych czasowych głosu; sam stan SPEAKING pozwala jedynie na uproszczoną animację. Rozpoznawanie mowy, naturalne przerwania i jakość głosu to oddzielna integracja, nie cecha kupionego mesha. [MakeHuman/MPFB udostępnia core assets jako CC0](https://static.makehumancommunity.org/about/license.html); dodatki społeczności trzeba sprawdzać osobno.

## Jedna scena Unreal — czy warto

**Tak jako ograniczony test porównawczy, obecnie nie jako uzasadnienie migracji Genesis.** Najbardziej prawdopodobna korzyść to oświetlenie pośrednie, odbicia, cienie oraz twarz/animacja przewodnika. Unreal nie zamieni elipsoidy w prawdziwy model serca i nie naprawi czytelności panelu. [Dokumentacja Lumen](https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-performance-guide-for-unreal-engine) opisuje koszt i skalowanie GI/odbicia — nie daje gwarancji wydajności na tym komputerze.

Szacunek: **2–4 dni** na jedną scenę porównawczą z istniejącymi modelami i trzema identycznymi kamerami; **5–10 dni łącznie** na interaktywny demonstrator ze sterowaniem obiektem, przewodnikiem i połączeniem do istniejących danych. Przygotowanie środowiska i ograniczenia GPU mogą to wydłużyć. Próba odczytu GPU przez system została odmówiona, więc nie deklarujemy modelu karty ani przewidywanego FPS tego PC.

Test powinien mieć dwa rozdzielone porównania: (A) te same assety/kamera — ocena silnika; (B) lepszy asset — ocena zawartości. Zmiana jednocześnie silnika i wszystkich modeli nie pozwoli ustalić, za co płacimy. POC ma odczytywać snapshoty/zdarzenia Genesis przez adapter, bez tworzenia alternatywnego modelu naukowego, ledgeru czy solvera. TypeScriptowej aplikacji i jej interakcji nie przenosi się do Unreal jednym eksportem GLB.

Warunki dalszej decyzji: wyraźnie lepszy obraz w ślepym porównaniu z najlepszą dopracowaną obecną sceną, zachowanie wyboru narządów/przekrojów/provenance, co najmniej 30 FPS w 1080p na określonym urządzeniu, zmierzone opóźnienie i realny koszt dostarczania. To proponowane kryteria, nie uzyskane wyniki.

[Pixel Streaming](https://dev.epicgames.com/documentation/unreal-engine/pixel-streaming-in-unreal-engine) renderuje aplikację na komputerze/serwerze i przesyła obraz oraz dźwięk przez WebRTC. Wariant przeglądarkowy wprowadza więc hosting GPU, połączenia i opóźnienie; nie jest bezkosztowym zastępstwem obecnego WebGL. [Licencja Unreal](https://www.unrealengine.com/license) zależy od sposobu dystrybucji i przychodów; nie zakładamy, że Genesis zawsze będzie bezpłatny licencyjnie.

MetaHuman może być osobnym późniejszym testem jakości przewodnika: [aktualna strona licencji](https://www.metahuman.com/license) dopuszcza inne silniki, więc sama chęć użycia postaci MetaHuman nie wymusza migracji całości. [MetaHuman Animator](https://dev.epicgames.com/documentation/metahuman/audio-driven-animation) ma animację twarzy z audio, lecz kompatybilność eksportu, wydajność i ograniczenia AI należy ocenić dla konkretnej wersji i zastosowania.

Decyzja na dziś: zachować istniejące dobre laboratoria i modele molekularne; największy wysiłek skierować na anatomię oraz kompozycję Human Explorer; przewodnika najpierw oprzeć na obecnym modelu. Kandydat za 69 USD pozostaje do weryfikacji praw i zawartości. Niczego nie zakupiono ani nie zintegrowano.
