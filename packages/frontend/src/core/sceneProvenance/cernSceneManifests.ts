import type { SceneManifest } from './sceneBasis';

/**
 * The CERN world's scenes: what is published measurement, what is CMS's own
 * reconstruction, what Genesis computes and what is only drawn.
 *
 * Mariusz (3 Oct 2026): "Keep strict separation between published measured
 * data, reconstruction, computed model, simulation. Every real-data view must
 * point to provenance/source. Do not present simulation as CERN measurement."
 *
 * The hall, the tunnel and the detector room are COMPUTED_MODEL: their
 * collisions come from a toy Monte Carlo, never from LHC. Only the CMS Open
 * Data screen is MEASURED_DATA, and it says which step is whose.
 */

const TOY_MC = 'Zderzenia proton–proton z modelu toy Monte Carlo Genesis (TOY_MC_MODEL), nie z PYTHIA/Geant4 i nie z LHC';
const NOT_LHC = 'Żadne zdarzenie w tej scenie nie pochodzi z detektora CMS ani z LHC';
const HELIX = 'Tor cząstki naładowanej w polu solenoidu: R = p_T / (0,3·B)';

export const CERN_SCENE_MANIFESTS: readonly SceneManifest[] = [
  {
    sceneId: 'world:cern-complex',
    basis: 'COMPUTED_MODEL',
    reliability: 'WELL_SUPPORTED_MODEL',
    measuredDataRefs: [],
    modelRefs: [TOY_MC, HELIX, 'Mikro czarna dziura: promień Schwarzschilda, temperatura i czas życia Hawkinga', 'Kryształy: oszacowania empiryczne (EMPIRICAL_ESTIMATE_MODEL), nie DFT'],
    assumptions: ['√s = 13 TeV jest parametrem modelu, nie stanem prawdziwego akceleratora'],
    speculativeElements: ['Mikro czarna dziura w 4D wymaga energii Plancka (HYPOTHESIS)', 'Scenariusz ADD przy energiach TeV nie ma dowodów (SPECULATIVE)'],
    visualizationOnlyElements: ['Hala, szyba, tunel i pierścień: wizualizacja, nie plan CERN', 'Wiązki, błyski i poświata', 'Soczewkowanie i dysk wokół horyzontu'],
    simulationLimits: [NOT_LHC, 'Przekroje czynne i hadronizacja znormalizowane orientacyjnie, nie z precyzją PDG'],
    theoryLimits: ['Promieniowanie Hawkinga nie zostało zaobserwowane'],
  },
  {
    sceneId: 'world:cern-detector',
    basis: 'COMPUTED_MODEL',
    reliability: 'WELL_SUPPORTED_MODEL',
    measuredDataRefs: [],
    modelRefs: [TOY_MC, HELIX],
    assumptions: ['Pole 3,8 T jak w solenoidzie CMS'],
    speculativeElements: [],
    visualizationOnlyElements: ['Warstwy detektora i ich proporcje', 'Kolory torów i trafień w kalorymetrze'],
    simulationLimits: [NOT_LHC, 'Brak symulacji detektora (Geant4), triggera i rekonstrukcji'],
    theoryLimits: [],
  },
  {
    sceneId: 'physics:cms-z',
    basis: 'MEASURED_DATA',
    reliability: 'ESTABLISHED_SCIENCE',
    measuredDataRefs: ['CMS Open Data, rekord 5208 (pary mionów, 2011), opendata.cern.ch, plik sprawdzony sumą sha256'],
    modelRefs: ['Masa niezmiennicza pary mionów liczona przez Genesis z opublikowanych czterowektorów'],
    assumptions: ['Pędy mionów to rekonstrukcja wykonana przez CMS z sygnałów detektora, nie surowe odczyty', 'Próbka edukacyjna wstępnie wyselekcjonowana przez CMS'],
    speculativeElements: [],
    visualizationOnlyElements: ['Kolory słupków histogramu'],
    simulationLimits: ['To statystyka opisowa na próbce edukacyjnej, nie pełna analiza fizyczna: bez poprawek akceptacji, wydajności i tła'],
    theoryLimits: [],
  },
];
