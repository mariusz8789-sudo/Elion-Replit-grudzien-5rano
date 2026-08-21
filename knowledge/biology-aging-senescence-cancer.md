# Genesis Bio — Aging, Senescence & Cancer Discovery Lab

## Zakres i granica zastosowania

Ten katalog opisuje **biologię starzenia komórkowego, senescencję oraz ich relację z nowotworami** jako obszar research support. Nie jest to model pacjenta, system diagnostyczny, rekomendacja terapii ani dowód skuteczności interwencji u ludzi.

> Genesis może porządkować dowody, projektować odtwarzalne pytania badawcze i wskazywać brakujące dane. Nie może zmienić obserwacji in vitro, wyniku zwierzęcego ani korelacji w skuteczność kliniczną.

## Statusy epistemiczne

| Status | Znaczenie w Genesis |
|---|---|
| `FACT_PEER_REVIEWED` | Ustalenie poparte literaturą naukową, lecz nie automatycznie reguła dla każdego typu komórki lub człowieka. |
| `PRECLINICAL` | Wynik komórkowy, organoidowy lub zwierzęcy. Nie wolno prezentować go jako korzyści klinicznej. |
| `CLINICAL_EVIDENCE` | Wynik z badań ludzi o określonym projekcie, populacji i punkcie końcowym. Wymaga osobnego źródła, protokołu oraz oceny jakości. |
| `CORRELATION` | Związek obserwacyjny bez ustalonej przyczynowości. |
| `MECHANISTIC_HYPOTHESIS` | Biologicznie uzasadniona hipoteza wymagająca testu. |
| `OPEN_PROBLEM` | Pytanie, dla którego brakuje odpowiednich danych albo uzgodnionego modelu. |
| `SPECULATIVE` | Konstrukcja teoretyczna lub scenariusz bez potwierdzenia. |
| `NEGATIVE_RESULT` | Wynik niepotwierdzający hipotezy, z zachowaniem warunków, modelu i ograniczeń. |

## Co wiemy

### Senescencja komórkowa — `FACT_PEER_REVIEWED`

Senescencja jest trwałym lub długotrwałym zatrzymaniem cyklu komórkowego, wywoływanym między innymi uszkodzeniem DNA, dysfunkcją telomerów, stresem oksydacyjnym, aktywacją onkogenów i stresem organelli. Szlaki p53/p21 oraz p16INK4a/RB są ważne dla zatrzymania proliferacji, ale żaden marker samodzielnie nie stanowi uniwersalnego dowodu senescencji. Stan należy oceniać wielomarkerowo i zależnie od typu komórki oraz kontekstu. [1] [2]

### SASP — `FACT_PEER_REVIEWED`

Senescence-associated secretory phenotype obejmuje zależne od kontekstu cytokiny, chemokiny, czynniki wzrostu i proteazy. SASP może uczestniczyć w naprawie tkanek oraz usuwaniu uszkodzonych komórek, lecz długotrwałe utrzymywanie się tego stanu może sprzyjać zapaleniu i dysfunkcji mikrośrodowiska. Nie istnieje jeden stały skład SASP wspólny dla wszystkich komórek senescentnych. [2] [3]

### Starzenie jest wielowymiarowe — `FACT_PEER_REVIEWED`

Genomic instability, telomere attrition, zmiany epigenetyczne, utrata proteostazy, dysfunkcja mitochondriów, senescencja, wyczerpanie komórek macierzystych oraz zmieniona komunikacja międzykomórkowa są współzależnymi osiami starzenia. Pojedynczy odczyt, w tym pojedynczy zegar epigenetyczny lub marker p16, nie jest równoznaczny z całościowym „odmłodzeniem”. [1]

### Senescencja a nowotwór — `FACT_PEER_REVIEWED` + `OPEN_PROBLEM`

Senescencja ogranicza proliferację uszkodzonych komórek i może działać jako bariera przeciwnowotworowa. W innych warunkach uporczywe komórki senescentne oraz część czynników SASP mogą wspierać stan zapalny, przebudowę mikrośrodowiska, plastyczność i progresję guza. Wynik zależy od typu komórki, tkanki, czasu trwania, odporności oraz kontekstu leczenia. Z tego powodu strategia „usuń wszystkie stare komórki” jest naukowo nieuzasadnionym uproszczeniem. [2] [3]

## Co jest obiecujące, ale przedkliniczne

| Obszar | Status | Uczciwa interpretacja |
|---|---|---|
| Senolityki | `PRECLINICAL` / ograniczone `CLINICAL_EVIDENCE` zależne od wskazania | Związki próbujące selektywnie usuwać część komórek senescentnych są badane. Selektywność, bezpieczeństwo, dawka, tkanka docelowa i wartość kliniczna wymagają dalszej walidacji. [2] [4] |
| Senomorfiki | `PRECLINICAL` | Modulacja SASP może ograniczać wybrane skutki sekretoryjne bez zabijania komórek, ale nie jest uniwersalnym rozwiązaniem. [2] |
| Częściowe przeprogramowanie OSK/OSKM | `PRECLINICAL` | Modele komórkowe i zwierzęce wskazują możliwość zmiany części markerów wieku oraz funkcji tkanki. Wyniki zależą od protokołu, tkanki i modelu; translacja do człowieka nie została potwierdzona. [1] [3] |

## Ryzyka i ograniczenia translacji

Czynniki reprogramowania mogą kolidować z utrzymaniem tożsamości komórkowej i kontrolą proliferacji; pełne lub źle kontrolowane przeprogramowanie wiązało się w modelach z dysplazją oraz tworzeniem teratomów. Pomiary zegarów epigenetycznych mogą być zależne od tkanki i wybranego zegara. Dla senolityków pozostają otwarte pytania o biomarkery selekcji, heterogenność komórek senescentnych, bezpieczeństwo, dostarczanie i wynik kliniczny. [1] [2] [4]

## Co Genesis może robić dziś

1. Przyjmować i wersjonować publikacje, protokoły oraz zdeidentyfikowane dane poprzez istniejący Knowledge Ingestion.
2. Budować hipotezę z jawnymi statusami wiedzy i kryterium falsyfikacji poprzez Scientific Discovery Layer.
3. Tworzyć Evidence Pack: źródła, model, wersję, parametry, dane, seed, ostrzeżenia i provenance.
4. Oceniać **jakość udokumentowanych dowodów** kandydatów według transparentnej rubryki, nie przewidywać skuteczności biologicznej.

## Czego Genesis nie uruchamia bez danych i solvera

- modeli ekspresji genów, proteomiki, epigenomiki, single-cell, mikrośrodowiska guza ani odpowiedzi na lek;
- dockingu, molecular dynamics, QSAR, OpenMM, PySCF lub pełnej chemii kwantowej;
- modelu populacji komórek zdrowych/senescentnych/nowotworowych z parametrami udającymi pomiar biologiczny;
- rekomendacji leczenia albo wyboru terapeutycznego dla osoby.

Dla tych przypadków właściwy status to `DATA_REQUIRED` lub `ENGINE_NOT_AVAILABLE`, z wymaganiem źródła, licencji, wersji, jakości, zakresu populacji, prywatności oraz walidacji eksperckiej.

## Wymagany przyszły eksperyment

```
question → sources → mechanistic hypothesis → predeclared protocol
→ approved dataset / validated solver → baseline + controls + replication
→ uncertainty + anomaly review → evidence pack → human expert review
```

## Źródła

[1]: https://pmc.ncbi.nlm.nih.gov/articles/PMC10861195/ "Paine et al., Partial cellular reprogramming: A deep dive into an emerging rejuvenation technology, Aging Cell (2023)"
[2]: https://pmc.ncbi.nlm.nih.gov/articles/PMC11567261/ "Zheng et al., Targeting Cellular Senescence in Aging and Age-Related Diseases, Aging and Disease (2024)"
[3]: https://pmc.ncbi.nlm.nih.gov/articles/PMC12066513/ "Ding et al., The interplay of cellular senescence and reprogramming shapes the biological landscape of aging and cancer, Frontiers in Cell and Developmental Biology (2025)"
[4]: https://pmc.ncbi.nlm.nih.gov/articles/PMC12456441/ "Alum et al., Targeting Cellular Senescence for Healthy Aging: Advances in Senolytics and Senomorphics, Drug Design, Development and Therapy (2025)"
