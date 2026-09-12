# SOLAR_MIND_MASTER_REPORT.md
STATUS NADRZĘDNY: RESEARCH ONLY / NOT RUN. Żaden wniosek tego raportu nie został uruchomiony.
Żadne twierdzenie nie jest OBSERVATION pochodzącą z Genesis; symulacje oznaczone SIMULATION/MODEL.

## 1. Executive Summary
Słońce obserwowane ciągle od 2010 (SDO/HMI magnetogramy LOS 45 s / produkt 720 s ~1"; HMI vector;
AIA 10 kanałów EUV/UV 3–20 MK). Otwarte problemy: dynamo, grzanie korony, przyspieszanie wiatru,
trigger flar/CME. Genesis nie buduje solvera — buduje orkiestrację: hipotezy→predykcje→kontrafakty→
dane→falsyfikacja→belief revision→next question, z pełną proweniencją i replay. Nic tu nie twierdzi,
że Genesis coś odkrył; raport definiuje, co Genesis MOŻE przetestować i sfalsyfikować.

## 2. Solar Knowledge Map (tagi)
A Interior: core pp-chain T~1.5e7 K [ESTABLISHED_MODEL]; neutrina potwierdzają pp [FACT, verify refs];
radiative zone do ~0.71 R☉ [ESTABLISHED_MODEL]; helioseismologia inwersje c(r) [FACT, verify];
convection zone + convection conundrum [OBSERVATION+UNKNOWN]; tachocline shear [MEASUREMENT, verify].
B Photosphere: sunspots, granulacja, flux tubes, Doppler flows (HMI), active regions [OBSERVATION/MEASUREMENT].
C Chromosphere: AIA 304/1600/1700; grzanie chromosfery częściowo UNKNOWN.
D Transition Region: ostry gradient T; AIA 304/171 [ESTABLISHED_MODEL istnienie; UNKNOWN lokalnie].
E Corona: loops, holes, prominence, topologia; problem grzania: Klimchuk "all heating impulsive";
PSP "confirmed source but others may exist"; odbite fale w holes; ESA: nie wiadomo czy turbulencja
wystarcza; hipoteza pyłu 2026 kontestowana [OBSERVATION gorąca korona + UNKNOWN mechanizm + MODELE].
F Solar Wind: szybki z holes, wolny ze streamerów/interchange; switchbacks OBSERVATION, pochodzenie UNKNOWN.
G Magnetic Field: dynamo BL vs mean-field vs 3D-MHD; cykl ~11 lat / magnetyczny ~22 lat [ESTABLISHED_MODEL];
rotacja różnicowa [FACT]; meridional circulation multi-vs-single UNKNOWN; polar precursor.

## 3. Open Problems Q1–Q15 (question | evidence | accepted | competing | unknown | observables | falsifier | datasets)
Q1 dynamo | cykl 11/22, polar precursor | BL | mean-field α; 3D-MHD | lokalizacja α | HMI polar B, helio |
 odtworzenie cyklu bez BL | SDO/JSOC, WSO[verify]
Q2 origin magnetic structures | vector B | flux emergence z tachocline | local dynamo | skala źródła |
 HMI vector, emergence stats | emergence bez głębokiego źródła | HMI, HEK
Q3 coronal heating | korona 1–20 MK | nanoflare/impulsive | fale Alfvéna; pył | dominujący mechanizm |
 AIA DEM, EIS | DEM zgodny ze steady | AIA, PSP
Q4 wind acceleration | szybki wiatr z holes | turbulencja/fale | interchange | czy turbulencja wystarcza |
 PSP in-situ + remote | deficyt budżetu | PSP[verify]
Q5 flare triggering | prekursory confined | tether-cutting | breakout; kink | uniwersalny trigger |
 AIA ribbons, HMI shear | erupcje bez prekursorów | HEK, SDO
Q6 CME initiation | flux rope twist | torus instability | breakout; flux cancellation | próg | NLFFF decay index |
 erupcje przy n<1 | HMI+HEK
Q7 particle acceleration | SEP | termination shock | reconnection region | lokalizacja | radio/EOVSA[verify] |
 lokalizacja poza szokiem | HEK, GOES
Q8 reconnection | flux evolution | Sweet-Parker→Petschek | plasmoid | rate w naturze | ribbon kinematics |
 rate poza 0.01–0.1 M_A | AIA, HMI
Q9 flux emergence | emergence stats | buoyant tubes | convective pumping | głębokość | HMI Doppler+vector |
 emergence niezgodny z buoyancy | HMI, HEK
Q10 sunspot formation | umbra/penumbra B | convective collapse | MHD instability | mechanizm penumbry |
 HMI vector high-res | brak zgodności | HMI/SO-PHI
Q11 AR evolution | decay rates | diffusion+emerge | helicity injection | predykcyjność | HMI time series |
 model bez emergence wystarcza | HMI
Q12 cycle prediction | predykcje disagree | polar precursor | dynamo-based; ML | horyzont | SSN, polar B |
 out-of-sample fail cycle 26 | SILSO[verify]
Q13 extreme events | Carrington 1859 | Poisson ~1/100 lat [INFERENCE] | clustered | górny ogon | paleo[verify] |
 nowe paleo zmienia rate | ice cores[verify]
Q14 heliospheric propagation | drag-based | MHD heliosfery | empirical drag | arrival ±h | coronagraph+in-situ |
 błędy >±10h | CDAW/OMNI[verify]
Q15 Sun–Earth coupling | CME→geomagnetic | Bz-south | flux-rope orientation | forecasting limits |
 DSCOVR+Kp[verify] | geoeffective przy Bz-north | SWPC[verify]

## 4. Observation Matrix (observable|instrument|channel|spatial|temporal|meaning|uncertainty|source|provenance|hypotheses)
B_LOS|HMI|magnetogram|~1"|45 s/720 s|B·n|szum+projekcja|JSOC|series+version+query|H001,H009,H031
B_vector|HMI|SARP/vector|~1"|720 s/12 min|pełne B|180° ambiguity|JSOC|+disamb ver|H021,H027,H031
v_LOS|HMI|dopplergram|~1"|36–45 s|prędkość LOS|oscylacje/EIT|JSOC/SVS|jw.|H003,H017,H050
continuum|HMI|6173 Å|~1"|45 s|granulacja/sunspots|granulation noise|JSOC|jw.|H010,H017
~6–10 MK|AIA|94 Å Fe XVIII|~1"|12 s|gorąca plazma flarowa|calib drift|JSOC|jw.|H011,H028
~10 MK|AIA|131 Å|~1"|12 s|fazy flary|multi-thermal|JSOC|jw.|H025,H026
~0.6–1 MK|AIA|171 Å Fe IX|~1"|12 s|loops, holes|stray light|JSOC|jw.|H012,H014,H042
~1.2–1.6 MK|AIA|193 Å|~1"|12 s|AR, CME low-corona|blend Fe XXIV|JSOC|jw.|H032,H014
~1.6–2 MK|AIA|211 Å|~1"|12 s|AR korony|DEM degeneracy|JSOC|jw.|H011,H020
~0.05 MK|AIA|304 Å He II|~1"|12 s|filaments, ribbons|opacity|JSOC|jw.|H026,H009
~2.5 MK|AIA|335 Å|~1"|12 s|gorące AR|jw.|JSOC|jw.|H011,H020
UV|AIA|1600/1700 Å|~1"|24 s|photosphere/UV network|—|JSOC|jw.|H026
WL|AIA|4500 Å|~1"|24 s|photosphere ref|—|JSOC|jw.|H017
events|HEK|catalogs|feature|near-RT|event ontology VOEvent|algorithm bias|HEK API|catalog ver+query|H023,H030,E18

## 5. Dataset Catalog
HMI LOS|JSOC/helio.data|FITS export/sunpy|45 s/720 s,1"|B_LOS|Q1,Q2,Q9|series,version,TAI,query
HMI vector|JSOC|FITS|720 s|B vector,shear,helicity|Q5,Q6,Q8|+disamb ver
HMI Doppler|JSOC/SVS|FITS|36–45 s|v_LOS|Q1,Q9|jw.
AIA 10 kanałów|JSOC; AWS ML 2010–2020 512×512 6-min|FITS/level-1|12–24 s|EUV/UV|Q3,Q5,Q14|+calib ver
HEK|LMSAL API|JSON/VOEvent,sunpy|near-RT|flare/AR/filament|Q5,Q6,Q13|catalog+alg ver
GOES via HEK|HEK|JSON|event|flare class/time|Q5,Q7|HEK ver
JSOC export|Hess Webber 2016; pyCHIPS|HTTP|—|wszystko SDO|ingestion|export hash
JSOC availability|dane po 2023.12.23 od 2025-02-03|—|—|—|gap planning|gap window
SVS|NASA SVS|media|36 s|edukacja/QA|demo nie evidence|SVS id
PSP/SolO/DSCOVR/OMNI/GONG/SILSO|różne|[ACCESS-VERIFY]|—|in-situ,geomag,helio,SSN|Q4,Q12–15|per-mission
Licencje: JSOC policy [C1-VERIFY przed publikacją]; HEK public API; AWS dataset = derived (SYNTHETIC-adjacent,
nie zastępuje level-1 do falsyfikacji).

## 6. Hypothesis Library H001–H050 (ID|hipoteza|falsyfikator|tag|RUN STATUS)
H001 polar precursor: amplituda N+1 ∝ polar B w min|cycle 26 poza przedziałem|ESTABLISHED_MODEL|NOT RUN
H002 BL SFT dominuje nad mean-field α|3D-MHD odtwarza cykl bez BL|HYPOTHESIS|NOT RUN
H003 meridional speed ustawia okres cyklu|dekorelacja flow↔okres|HYPOTHESIS|NOT RUN
H004 ścinanie tachokliny konieczne dla toroidalnej|dynamo bez tachocline shear z cyklem|MODEL_ASSUMPTION|NOT RUN
H005 grand minima = stochastyczne fluktuacje BL|fluktuacje niewystarczające|HYPOTHESIS|NOT RUN
H006 asymetria hemisferyczna ze słabego sprzężenia|asymetria poza coupled-model|HYPOTHESIS|NOT RUN
H007 cycle 25 slightly stronger than 24|SSN max poza przedziałem|PREDICTION|NOT RUN
H008 profil rotacji stabilny w cyklu poza near-surface shear|duża zmienność głęboka|MEASUREMENT|NOT RUN
H009 timing reversalu z sekwencji kasacji pola|reversal przed decayem|HYPOTHESIS|NOT RUN
H010 predictability ≤ ~1 cykl (chaos)|skillful 2-cycle predictions|HYPOTHESIS|NOT RUN
H011 nanoflare dominuje w AR (DEM slope)|DEM steady-compatible|HYPOTHESIS|NOT RUN
H012 fale Alfvéna dominują w holes/fast wind|deficyt bilansu|HYPOTHESIS|NOT RUN
H013 grzanie przez rekoneksję w braided field|gładkie pola w heated loops|HYPOTHESIS|NOT RUN
H014 T ↔ expansion factor|dekorelacja AIA-DEM vs PFSS|MODEL_ASSUMPTION|NOT RUN
H015 odbite fale grzeją holes|in-situ vs remote DEM mismatch|HYPOTHESIS|NOT RUN
H016 pył kosmiczny kontrybuuje|budżet niewystarczający|HYPOTHESIS(kontest.)|NOT RUN
H017 frakcja grzania footpoints ustawia scale heights|density vs heating mismatch|HYPOTHESIS|NOT RUN
H018 all heating impulsive (QS DEM)|steady DEM match w QS|HYPOTHESIS|NOT RUN
H019 kaskada turbulentna wystarcza do wiatru|deficyt PSP|UNKNOWN→test|NOT RUN
H020 heating ∝ B^a L^b, a≈1–1.5|a poza zakresem|MODEL_ASSUMPTION|NOT RUN
H021 onset flary wymaga rope twist>kink|flary bez rope|HYPOTHESIS|NOT RUN
H022 breakout poprzedza erupcję|erupcje bez breakout signatures|HYPOTHESIS|NOT RUN
H023 confined flares = episodic reconnection budujący rope|brak nadmiaru prekursorów|HYPOTHESIS|NOT RUN
H024 tether-cutting tworzy rope w single arcade|kinematyka ribbon niezgodna|HYPOTHESIS|NOT RUN
H025 reconnection rate M_A~0.01–0.1 uniwersalny|rate poza zakresem|MODEL_ASSUMPTION|NOT RUN
H026 ribbon separation mapuje E-field|mismatch z inferred E|HYPOTHESIS|NOT RUN
H027 helicity conservation ustawia twist rope|budżet helicity niezgodny|ESTABLISHED_MODEL|NOT RUN
H028 przyspieszanie cząstek na termination shock|lokalizacja w reconnect region|HYPOTHESIS|NOT RUN
H029 krytyczny shear angle dla produktywności|liczne high-shear non-productive|HYPOTHESIS|NOT RUN
H030 sympathetic flaring przez shared channel|timing zgodny z random|HYPOTHESIS|NOT RUN
H031 torus n>~1.5 konieczny|erupcje przy n<1 / non-eruption n>1.5|HYPOTHESIS|NOT RUN
H032 prędkość początkowa CME z reconnect acceleration <2R☉|systematyczny mismatch kinematyki|HYPOTHESIS|NOT RUN
H033 geoeffectiveness wymaga southward Bz|geoeffective przy sustained northward|ESTABLISHED_MODEL|NOT RUN
H034 drag-based arrival ±10h|>±10h systematycznie|MODEL|NOT RUN
H035 SEP onset ↔ shock height|brak korelacji|HYPOTHESIS|NOT RUN
H036 Forbush ∝ magnetic flux CME|brak korelacji|HYPOTHESIS|NOT RUN
H037 HCS crossings modulują SEP|brak zależności|HYPOTHESIS|NOT RUN
H038 Carrington recurrence ~1/100 lat|nowe paleo poza CI|INFERENCE|NOT RUN
H039 fast wind wyłącznie z open-flux holes|fast wind spoza holes|ESTABLISHED_MODEL|NOT RUN
H040 switchbacks z interchange reconnection|właściwości ≠ modele|HYPOTHESIS|NOT RUN
H041 FIP fractionation na footpoints|fractionation w loop-top|HYPOTHESIS|NOT RUN
H042 wind speed antykoreluje z expansion factor|brak antykorelacji|MODEL|NOT RUN
H043 spektrum turbulencji steepens na gyroscale|brak breaków|ESTABLISHED|NOT RUN
H044 wiatr minimum bimodalny, zanika w max|bimodalność w max|OBSERVATION|NOT RUN
H045 sound-speed ↔ SSM 0.2% poza spodem CZ|odchylenie inwersji|FACT-based|NOT RUN
H046 convection conundrum = brak magnetic braking|hydro symulacje wystarczą|HYPOTHESIS|NOT RUN
H047 neutrina potwierdzają pp-chain|deficyt (hist. rozwiązane oscylacjami)|FACT|NOT RUN
H048 tachocline <0.05 R☉ stała w cyklu|grubsza warstwa|MEASUREMENT|NOT RUN
H049 meridional multi-cellular|single-cell robust|UNKNOWN|NOT RUN
H050 near-surface shear moduluje emergence z lag ~6 mies.|brak lag/korelacji|HYPOTHESIS|NOT RUN

## 7. Competing Models (problem|A|B|C|UNKNOWN|separating experiment)
dynamo|BL|mean-field α|3D-MHD|proces w tachocline|E4+ensemble cycle-26
coronal heating|nanoflare|Alfvén/DC|pył|udział per struktura|E5+E6
CME initiation|breakout|tether-cutting|flux cancellation/ideal|uniwersalność|E1+E7
flare triggering|confined-flare chain|single threshold torus|stochastic onset|predykcyjność|E3+E8
wind acceleration|turbulence cascade|interchange/nanoflares|reflected waves|proporcje|E13+E14
cycle 25/26|dynamo-based|precursor/polar|ML/statistical|spread metod|E19
Zasada: ≥2 aktywne modele + UNKNOWN; pytanie systemu: "jaki eksperyment najbardziej rozdziela?"

## 8. Experiments E1–E22 (3 flagowe pełne)
E1 FLAGSHIP magnetic topology necessity: Q czy topologia (sheared core+overlying arcade/rope) konieczna
 dla erupcji; H021,H022,H031; baseline realny AR HMI vector→NLFFF (n,twist,free energy); counterfactual
 redukcja shear/twist poniżej progu→re-ekstrapolacja→kryterium torus/kink?; observable spełnienie kryterium
 + realny outcome HEK; prediction counterfactual bez topologii⇒brak kryterium; falsification erupcje przy
 modelowym n<1 w tolerancji⇒H031 osłabiona; dataset HMI vector+HEK; simulation zewnętrzny NLFFF adapter
 (SIMULATION nie OBSERVATION); failure modes 180° ambiguity, jakość boundary, force-free assumption, HEK bias;
 replay dataset version+query+preprocessing+solver version+seed+input/output fingerprint+verdict.
E2 FLAGSHIP shear/flux emergence necessity: Q czy nowy emergence konieczny do ewolucji AR; baseline oś czasu
 emergence (HMI vector+Doppler) vs ewolucja AR (HEK); counterfactual model bez emergence (diffusion+shear);
 observable unsigned flux, shear angle, helicity injection; prediction counterfactual rozjeżdża się poza
 tolerancję jeśli emergence konieczny; falsification counterfactual w tolerancji⇒"emergence konieczny" osłabione;
 dataset HMI series+HEK AR; simulation SFT adapter; failure modes kalibracja, projekcja, HEK bias; replay jw.
E3 FLAGSHIP flare/CME precursor skill: Q czy prekursor (confined-flare chain, ribbon kinematics, decay index)
 poprawia predykcję vs baseline klimatologiczny; H023,H025,H029,H031; baseline GOES/HEK climatology P(erupcja|AR);
 counterfactual predyktor bez prekursora; observable proper scoring Brier/ROC-AUC/Heidke out-of-sample;
 prediction prekursor dodaje skill>próg; falsification brak poprawy⇒H023 NOT SUPPORTED jako predyktor;
 dataset HEK flare/CME+SDO; simulation nie wymaga (statystyka) + opcjonalnie MHD ensemble; failure modes label
 noise HEK, gap JSOC post-2023.12.23, look-ahead bias (ścisły temporal split); replay wersjonowane katalogi+
 zamrożony split+seed.
E4 polar precursor cycle 26|H001,H007|HMI polar+SILSO regresja|poza CI
E5 DEM slope nanoflare vs steady|H011,H018|AIA multi-DEM|DEM steady-compatible
E6 wave budget holes|H012,H015|AIA171+Doppler+PSP[verify]|deficyt
E7 breakout vs tether-cutting|H022,H024|ribbon/reconnect flux+AIA|kinematyka niezgodna z oboma→UNKNOWN
E8 torus threshold stats|H031|NLFFF n+HEK|erupcje przy n<1
E9 ribbon→E-field mapping|H026|AIA1600/304+HMI|mismatch
E10 helicity–twist consistency|H027|HMI vector|budżet niezgodny
E11 CME arrival drag|H034|coronagraph+in-situ[verify]|>±10h
E12 Bz-south geoeffectiveness|H033|DSCOVR+Kp[verify]|geoeffective northward
E13 switchback origin|H040|PSP|właściwości≠interchange
E14 expansion factor vs wind|H042|PFSS(HMI)+OMNI[verify]|brak antykorelacji
E15 convection conundrum limits|H046|GONG/HMI[verify]|zgodność z symulacjami
E16 meridional cells|H049|time-distance[verify]|single-cell robust
E17 emergence vs near-surface shear|H050|HMI Doppler+HEK|brak korelacji
E18 sympathetic flaring timing|H030|HEK|zgodne z random
E19 cycle-25 amplitude interval|H007|SILSO vs predykcje|poza przedziałem
E20 dust heating budget|H016|model+dust[verify]|budżet ujemny
E21 universal reconnection rate|H025|HMI inflows+AIA|M_A poza 0.01–0.1
E22 FIP location|H041|composition[verify]|fractionation w loop-top
Wszystkie werdykty dozwolone: NOT SUPPORTED / INCONCLUSIVE / FALSIFIED / SUPPORTED WITHIN MODEL.

## 9. Solar Twin Architecture (bez nowego solvera)
Rozszerza istniejący kontrakt Solar Twin v2.1: P0 SolverAdapter dla zewnętrznych solverów (PFSS/NLFFF, SFT;
MHD opcjonalnie, licencje/compute [C1-VERIFY]); groundingLevel (PROCEDURAL 0.5 / UNGROUNDED 0.25 / MODEL_ESTIMATE;
wagi z istniejącego groundingWeight [C1-VERIFY]); osie groundingLevel ⊥ epistemicStatus; replay: kanoniczny
ReplayVerdict nietykany + domenowy TwinReplayStatus MATCH|WITHIN_TOLERANCE|DRIFT|BLOCKED|NOT_REPRODUCIBLE;
kotwica: realne dane SDO/HEK jako OBSERVATION-class evidence przez istniejącą warstwę; twin SIMULATION-only
nigdy samodzielnie SUPPORTED (gate domenowy); konflikty cross-source przez istniejący mechanizm po audycie mcre.

## 10. Evidence/Reproducibility Architecture
Workflow: SDO/JSOC/HEK observation→raw artifact(series,version,TAI,query)→provenance(instrument,calib ver,
export hash)→normalization(units,frame,disamb ver)→observable extraction(DEM,ribbon kinematics,decay index,
flux stats)→hypothesis test(H-ID,baseline,counterfactual,tolerance)→evidence assessment(status OBSERVATION-
derived vs SIMULATION-derived; contribution weighting)→falsification/support/inconclusive→scientific memory.
Reproducibility record: dataset,version,query,preprocessing,parameters,code,environment,seed,model,experiment,
result,fingerprint(canonicalJson+istniejący hash),evidence id,previousFingerprint(chain). Certyfikacja: istniejący
mechanizm podpisów/fingerprintów [C1-VERIFY]; nie tworzyć drugiego.

## 11. Scientific Memory Model
Łańcuch: Observation→Event(HEK)→Feature→Hypothesis(H-ID)→Model(A/B/C/UNKNOWN)→Prediction→Experiment(E-ID)→
Evidence→Falsification verdict→Updated Belief→Next Question. Powrót po miesiącach: nowe evidence dla H-X
triggeruje re-assessment przez istniejący belief-revision; ConfidenceUpdate z provenance; zmiana rankingu
modeli⇒generator next-question proponuje eksperyment rozdzielający. Przykład komunikatu: "Nowe dane HEK/SDO
zmieniają ocenę modelu A dla Q6: belief 0.62→0.48; proponowany eksperyment: E8". Nigdy "Genesis discovered".

## 12. Next Best Experiment Contract
INPUT currentKnowledge{hypotheses[bbelief,status],models[support],evidence[],contradictions[],dataGaps[]} +
candidateExperiments[]{experimentId,targets,separatesModels,expectedInformationGain,falsifiability,costClass,
feasibility,requiredData,riskClass} + stoppingThreshold,cycle,campaignId. SCORING: priority=infoGain×
modelSeparationBonus+falsifiability×0.2−riskPenalty−costPenalty; bonus=1.3 jeśli separatesModels. OUTPUT
status NEXT_EXPERIMENT_JUSTIFIED|NO_JUSTIFIED_NEXT_QUESTION|INSUFFICIENT_EVIDENCE|VALIDATION_REQUIRED +
bestExperiment,runnerUp,priorities,decisionBasis{whyThis,uncertaintyReduced,modelsDiscriminated,
resultThatWouldChangeConclusion,whyBetterThanStopping,whyNothingElseBetter}. Brak kandydatów/priority<próg⇒STOP;
SIMULATION-only⇒VALIDATION_REQUIRED; zero "AI magic".

## 13. Cross-Domain (TRANSFERRED|SOURCE|TARGET|JUSTIFICATION|ASSUMPTIONS|TESTABLE CONSEQUENCE)
Disruption prediction|plasma physics|flare/CME onset|kryteria stabilności MHD|podobieństwo kryteriów|wspólne
proxy critical gradient poprawia skill E3; Lab reconnection (MRX)|lab plasma|rate H025|kontrolowany pomiar|
skalowalność bezwymiarowa|rate przenosi się do SDO; SOC/avalanches|nonlinear dyn|flare statistics|power-law|
universality|slope predicts small-event rates; Proper scoring/EVT|statistics|extreme events|ogony rozkładów|
stacjonarność(słaba)|return-level CI z paleo; Surrogate models|AI-for-science|MHD emulacja|koszt solverów|
fidelity bounds|emulator within tolerance vs solver; Turbulent cascade|fluid dyn|coronal/wind heating|MHD
turbulence|anizotropia|spectral slopes↔heating rate; Asteroseismology|stellar phys|helioseismology|wspólne
inwersje|skala/rotacja|techniki przenaszalne; Coupled DA|climate|Sun–Earth coupling|wieloskalowy coupling|
jakość obserwacji obu końców|joint state estimation poprawia forecast; Geodynamo|geophysics|dynamo|MHD dynamos|
Rossby/Prandtl|wspólne scaling laws. Każdy transfer = TRANSFERRED_HYPOTHESIS z disclaimerem, nigdy FACT.

## 14. Contradiction Map (konflikt|A|B|klasyfikacja|rozstrzygnięcie bez średniej)
Grzanie korony|nanoflare all-impulsive|fale/PSP confirmed-but-others|model conflict|E5/E6 per struktura;
Cycle 25|dynamo-based|metody disagree|methodological spread|E19 out-of-sample, NIE uśredniać;
CME trigger|breakout|tether-cutting; confined-flare|competing, mogą koegzystować per-event|E1/E7 per-event;
DEM vs spektroskopia|AIA DEM warm loops|EIS temperatury|measurement/model (multi-thermal)|joint fit z uncertainty;
Pył vs budżet|nowy mechanizm|brak potwierdzenia|UNTESTED|E20, tag HYPOTHESIS nie ESTABLISHED;
HEK catalogs|automated|manual|provenance conflict (alg bias)|versioning w provenance, nie mieszać wersji.

## 15. Top 10 Genesis Solar Discovery Opportunities (Known|Unknown|Genesis hypothesis|Prediction|Experiment|Value)
1 uniwersalność triggera CME|kandydaci|czy jeden warunek konieczny|wszystkie erupcje spełniają n>1|E1+E8|wysoka
2 skill prekursora confined-flare|korelacje opisowe|wartość predykcyjna out-of-sample|skill>baseline|E3|space-weather
3 DEM-based heating mapping|—|frakcje mechanizmów|per-pixel klasyfikacja|E5/E6|Q3
4 emergence-vs-decay necessity|—|konieczność emergence per AR|counterfactual w/poza tolerancją|E2|Q2/Q9
5 ribbon-kinematics↔rate universality|—|stałość M_A|rate w/zakres|E9/E21|Q8
6 cycle-26 polar precursor out-of-sample|metoda|czy utrzyma skill|predykcja vs realizacja|E4|Q12
7 sympathetic-flaring coupling network|—|coupling realny vs random|timing stats|E18|Q5/Q11
8 switchback-origin discriminator|—|interchange vs turbulence|właściwości|E13|Q4
9 convection-conundrum bounds|—|skala rozjazdu|inwersje vs symulacje|E15|Q1/dynamo
10 extreme-event tail re-estimation|Carrington+paleo|górny ogon|rate z nowych danych|Q13|risk modelling
Każde: "Genesis could test…", nigdy "Genesis discovered…".

## 16. Risks
Data gaps/licencje (JSOC policy, okno braków post-2023.12.23); catalog bias HEK (algorytmiczny)→versioning;
degeneracja modeli (DEM multi-thermal, NLFFF assumptions, 180° ambiguity); compute (MHD ensemble drogie,
twin tylko adaptery); epistemic contamination (symulacja jako obserwacja)→gate'y i tagi; over-claiming forecastów
(nauka nie daje deterministycznej predykcji flar; raportujemy skill z CI); cycle-phase bias (archiwum=cykle 24–25).

## 17. What Genesis can do NOW
Ingest HMI/AIA przez JSOC/sunpy; query HEK; zbudować bibliotekę H001–H050+modele §7; uruchomić E4/E5/E9/E17/E18/
E19/E21 (statystyczne, bez MHD); pełna proweniencja+fingerprinty+replay istniejącą infrastrukturą [C1-VERIFY];
wizualizacja POZA tym taskiem (reuse wzorca epistemic-badge kiedyś).

## 18. What requires future research
NLFFF/MHD twin orchestration (adaptery+licencje+compute); E1–E3 w pełnej wersji (solvery+walidacja);
multi-mission fusion (PSP/SolO/in-situ); real-time forecasting; domknięcie Q3/Q4/Q13.

## 19. What is impossible/unsupported today
Deterministyczna predykcja czasu flary; gwarantowany forecast Carrington-class z użytecznym lead time;
"Genesis discovers new physics" jako claim; konwersja SIMULATION→OBSERVATION; predykcja cyklu >1–2 cykle
z potwierdzonym skillem (H010 sugeruje limit).

## 20. Roadmap
6 mies.: ingestion pipeline (JSOC/HEK)+hypothesis library+E4/E5/E9/E17/E18/E19/E21+contradiction map;
deliverable reproducible baseline "current evidence status per Q1–Q15".
12 mies.: Solar Twin P0–P2 (adaptery NLFFF/SFT)+E1/E2/E7+replay evidence chain; pierwsze pre-registered null results.
24 mies.: E3 skill out-of-sample+multi-mission+public "Solar Falsification Atlas"; decision point cycle-26.

## Final Self-Audit
VERIFIED(uruchomione): NIC. SOURCE-SUPPORTED: parametry HMI/AIA, dostęp JSOC, HEK, mission facts, heating,
dynamo/cycle, CME/flare (źródła z sesji). INFERENCE: dobór hipotez, scoring, klasyfikacje konfliktów.
MODEL ASSUMPTION: progi (n>1.5, M_A 0.01–0.1, ±10h, B^a L^b). UNKNOWN: mechanizm grzania, przyspieszanie wiatru,
uniwersalny trigger, ogon extreme, predictability. NOT TESTED: wszystkie E1–E22; żadna hipoteza bez evidence
assessment w Genesis. CLAUDE SHOULD IMPLEMENT: ingestion adapter, rejestr H/E w istniejącej hypothesis-loop,
scoring w istniejącym selektorze, twin przez istniejący kontrakt v2.1. NEVER AS FACT: SIMULATION jako OBSERVATION;
forecast jako gwarancja; H016/H038 jako ustalone; "Genesis discovered".
Readiness (szczerze): KNOWLEDGE 72 · DATA 55 · HYPOTHESIS 70 · EXPERIMENT 50 · FALSIFICATION 60 · REPLAY 45 ·
AUTONOMOUS DISCOVERY 20.
