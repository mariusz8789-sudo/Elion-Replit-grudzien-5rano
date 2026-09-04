/**
 * Słowniczek pojęć — skondensowany z katalogów `knowledge/*.md` (baza
 * projektowa platformy). Definicje są własnymi streszczeniami, nie
 * kopiami źródeł — patrz RESEARCH.md w sprawie zasad cytowania.
 */

export interface GlossaryTerm {
  term: string;
  labId: string;
  definition: string;
}

export const GLOSSARY: GlossaryTerm[] = [
  { term: 'Czynnik Lorentza (γ)', labId: 'spacetime', definition: 'γ = 1/√(1−v²/c²) — o ile razy wolniej płynie czas i o ile kurczy się długość w układzie poruszającym się z prędkością v.' },
  { term: 'Dylatacja czasu', labId: 'spacetime', definition: 'Zegar w ruchu tyka wolniej niż zegar w spoczynku — potwierdzone m.in. przez GPS i miony kosmiczne.' },
  { term: 'Stożek świetlny', labId: 'spacetime', definition: 'Granica zdarzeń, na które dane zdarzenie może wpłynąć (przyszłość) lub które mogły na nie wpłynąć (przeszłość) — wyznaczona przez prędkość światła.' },
  { term: 'Promień Schwarzschilda', labId: 'einstein', definition: 'r_s = 2GM/c² — promień horyzontu zdarzeń nierotującej czarnej dziury o masie M.' },
  { term: 'Sfera fotonowa', labId: 'einstein', definition: 'Promień 1,5 r_s, poniżej którego światło nie może uciec z czarnej dziury po orbicie kołowej.' },
  { term: 'Soczewkowanie grawitacyjne', labId: 'einstein', definition: 'Ugięcie światła przez masę zgodnie z ogólną teorią względności — pierwszy eksperymentalny dowód OTW (1919).' },
  { term: 'Metryka Kerra', labId: 'einstein', definition: 'Opis czasoprzestrzeni wokół rotującej czarnej dziury, uwzględniający „ciągnięcie" przestrzeni (frame-dragging).' },
  { term: 'Most Einsteina–Rosena', labId: 'einstein', definition: 'Model teoretyczny (nie potwierdzony obserwacyjnie) łączący dwa odległe punkty czasoprzestrzeni przez wnętrze czarnej dziury.' },
  { term: 'Superpozycja', labId: 'quantum', definition: 'Stan kwantowy będący jednoczesną kombinacją kilku możliwych wyników — nie „niewiedzą", lecz w pełni określonym stanem fizycznym.' },
  { term: 'Splątanie kwantowe', labId: 'quantum', definition: 'Korelacja między cząstkami silniejsza niż dopuszcza jakakolwiek teoria lokalnych ukrytych zmiennych (łamanie nierówności Bella).' },
  { term: 'Nierówność Bella (CHSH)', labId: 'quantum', definition: 'Test odróżniający mechanikę kwantową (|S| do 2√2) od klasycznego „zdroworozsądkowego" realizmu lokalnego (|S| ≤ 2).' },
  { term: 'Tunelowanie kwantowe', labId: 'quantum', definition: 'Niezerowe prawdopodobieństwo przejścia cząstki przez barierę energetyczną, której klasycznie nie mogłaby pokonać.' },
  { term: 'Dekoherencja', labId: 'quantum', definition: 'Utrata koherencji kwantowej przez niekontrolowane oddziaływanie z otoczeniem — czyni makroświat pozornie klasycznym.' },
  { term: 'Sfera Blocha', labId: 'quantum', definition: 'Geometryczna reprezentacja stanu pojedynczego kubitu jako punktu na powierzchni kuli.' },
  { term: 'Liczba atomowa (Z)', labId: 'atom', definition: 'Liczba protonów w jądrze — jednoznacznie definiuje pierwiastek chemiczny.' },
  { term: 'Orbital atomowy', labId: 'atom', definition: 'Chmura prawdopodobieństwa |ψ|² opisująca, gdzie można znaleźć elektron — nie tor ruchu jak w modelu Bohra.' },
  { term: 'Reguła Aufbau', labId: 'atom', definition: 'Heurystyka kolejności zapełniania powłok elektronowych — ma udokumentowane wyjątki (np. chrom, miedź).' },
  { term: 'Okres półtrwania (T½)', labId: 'nuclear', definition: 'Czas, po którym rozpadnie się statystycznie połowa danej próbki jąder promieniotwórczych.' },
  { term: 'Masa krytyczna', labId: 'nuclear', definition: 'Najmniejsza ilość materiału rozszczepialnego, przy której reakcja łańcuchowa się podtrzymuje (k=1).' },
  { term: 'Kryterium Lawsona', labId: 'nuclear', definition: 'Warunek zapłonu fuzji: iloczyn gęstości, temperatury i czasu utrzymania plazmy musi przekroczyć próg.' },
  { term: 'Model Standardowy', labId: 'particle', definition: 'Obecnie najlepiej potwierdzona teoria cząstek elementarnych: kwarki, leptony, bozony cechowania i bozon Higgsa.' },
  { term: 'Masa niezmiennicza', labId: 'particle', definition: 'Wielkość M²c⁴=(ΣE)²−(Σpc)² licząca z energii i pędów produktów rozpadu — sposób, w jaki naprawdę odkrywa się nowe cząstki.' },
  { term: 'Stała kosmologiczna (Ω_Λ)', labId: 'universe', definition: 'Udział ciemnej energii w gęstości energii Wszechświata — odpowiada za przyspieszającą ekspansję.' },
  { term: 'Prawo Hubble\'a', labId: 'universe', definition: 'Odległe galaktyki oddalają się z prędkością proporcjonalną do odległości: v = H₀·d.' },
  { term: 'Napięcie Hubble\'a', labId: 'universe', definition: 'Nierozstrzygnięta rozbieżność (~5σ) między lokalnym a wczesnym (CMB) pomiarem stałej Hubble\'a — aktywny problem badawczy.' },
  { term: 'Fine-tuning stałych fizycznych', labId: 'multiverse', definition: 'Obserwacja, że niewielkie zmiany stałych fizycznych uniemożliwiłyby chemię i życie — wyjaśnienia (w tym multiwersum) pozostają hipotezami.' },
  { term: 'Skala Kardaszewa', labId: 'civilization', definition: 'Klasyfikacja cywilizacji wg poboru mocy: Typ I (planeta), Typ II (gwiazda), Typ III (galaktyka). Ludzkość: K≈0,73.' },
  { term: 'Paradoks Fermiego', labId: 'civilization', definition: '„Gdzie oni są?" — pytanie o brak obserwowalnych śladów zaawansowanych cywilizacji pozaziemskich mimo sprzyjających rachunków czasowych.' },
  { term: 'Rój Dysona', labId: 'civilization', definition: 'Hipotetyczny zbiór konstrukcji otaczających gwiazdę w celu przechwycenia jej energii — sygnatura poszukiwana jako nadwyżka podczerwieni.' },
];
