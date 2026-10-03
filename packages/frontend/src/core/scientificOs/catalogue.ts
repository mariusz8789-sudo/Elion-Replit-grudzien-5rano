/**
 * MORE · SCIENTIFIC OS — the one catalogue of everything Genesis can do beyond
 * the dashboard, in the eight groups the owner approved on 29 Sep 2026.
 *
 * SOURCE: the closed capability audit
 * (`/mnt/project-files/audyt-repo/genesis-audyt-mozliwosci-2026-09-29.md`,
 * main 006a5a69). Every row records the AUDIT STATE the audit found, and the
 * label a user sees is DERIVED from that state by `labelOf` below — it is never
 * typed in per row, so a status cannot be guessed or flattered.
 *
 * Engines are never products here: a row is a task or a capability a person
 * recognises ("Molecular dynamics"), `what` says what a person gets in plain
 * words, and the engine name lives only in `engine`, shown under Technical
 * details (`customerFacingEngineNames.test.tsx`). Rows reach their screen through what already exists: a
 * route, the Ask field with the command filled in, or nothing (engine only,
 * listed so the system is not understated). There is no new router.
 *
 * Not in the catalogue at all (owner's rule, audit §11 and §13): City
 * Enterprise, speculative solvers, CICADA, OMNICORE / 9D / Supreme, GNINA as a
 * dependency, the self-driving lab and the legacy archive.
 */

/** What the audit established about a capability. Nothing is production-verified or externally validated yet (audit §0). */
export type AuditState =
  /** Runs on a real engine or real data and has a screen. */
  | 'LIVE'
  /** Runs, but a piece is missing (unreviewed weights, a section inside another screen, a run still in progress). */
  | 'LIVE_INCOMPLETE'
  /** A real backend engine reachable only by asking for it. */
  | 'ASK_ONLY'
  /** Code and tests, no screen. */
  | 'ENGINE_ONLY'
  /** Synthetic, toy or uncalibrated data: a demonstration, not evidence. */
  | 'SYNTHETIC'
  /** A frozen acceptance gate was not passed. */
  | 'GATE_FAILED'
  /** Ready, but a required key does not exist yet. */
  | 'KEY_MISSING'
  /** No code. */
  | 'NO_CODE';

export type UiLabel = 'AVAILABLE' | 'PARTIAL' | 'DEMO' | 'BLOCKED' | 'PLANNED';

export type EvidenceLevel = 'CODE TESTED' | 'UI REACHABLE' | 'PRODUCTION VERIFIED' | 'EXTERNALLY VALIDATED' | 'NOT BUILT';

const LABEL: Record<AuditState, UiLabel> = {
  LIVE: 'AVAILABLE',
  LIVE_INCOMPLETE: 'PARTIAL',
  ASK_ONLY: 'PARTIAL',
  ENGINE_ONLY: 'PARTIAL',
  SYNTHETIC: 'DEMO',
  GATE_FAILED: 'BLOCKED',
  KEY_MISSING: 'BLOCKED',
  NO_CODE: 'PLANNED',
};

/** The only way a user-facing label is produced. */
export function labelOf(state: AuditState): UiLabel {
  return LABEL[state];
}

/** The evidence ladder level that follows from the audit state. */
export function levelOf(cap: Capability): EvidenceLevel {
  if (cap.state === 'NO_CODE') return 'NOT BUILT';
  return cap.hash !== undefined ? 'UI REACHABLE' : 'CODE TESTED';
}

export const LABEL_ORDER: readonly UiLabel[] = ['AVAILABLE', 'PARTIAL', 'DEMO', 'BLOCKED', 'PLANNED'];

export const LABEL_MEANING: Record<UiLabel, string> = {
  AVAILABLE: 'Runs on a real engine or real data',
  PARTIAL: 'Works, a piece is missing',
  DEMO: 'Synthetic or uncalibrated',
  BLOCKED: 'Gate failed or key missing',
  PLANNED: 'Not built yet',
};

export interface Capability {
  readonly id: string;
  readonly name: string;
  /** One plain line: what a person gets. */
  readonly what: string;
  readonly state: AuditState;
  /** An existing route. */
  readonly hash?: string;
  /** A command for the one Ask field, routed by the existing Experiment Fabric. */
  readonly ask?: string;
  /** Shown instead of an action when there is no screen. */
  readonly note?: string;
  /** Where the evidence lives (repo path, record, test). */
  readonly source: string;
  /** The exact engine behind it: shown only under Technical details, never in `name` or `what`. */
  readonly engine?: string;
}

export type GroupIcon = 'pill' | 'replay' | 'shield' | 'atom' | 'grid' | 'flask' | 'cpu';

export interface CapabilityGroup {
  readonly id: string;
  readonly name: string;
  readonly icon: GroupIcon;
  readonly line: string;
  /** Government only: the owner's honest split, by capability id. */
  readonly subgroups?: readonly { readonly label: string; readonly ids: readonly string[] }[];
  readonly items: readonly Capability[];
}

export const SCIENTIFIC_OS: readonly CapabilityGroup[] = [
  {
    id: 'ls', name: 'Life Sciences', icon: 'pill', line: 'Drug discovery, chemistry and human biology',
    items: [
      { id: 'drug', name: 'Drug Discovery', what: 'Docking campaign: molecular analysis, then interaction modeling, with reasons and a discovery graph; commercial property & safety estimates await licence review', engine: 'RDKit, AutoDock Vina (Meeko preparation)', state: 'LIVE_INCOMPLETE', hash: '#/drug', source: 'backend/src/campaign/*, docs/evidence/astex-*' },
      { id: 'falsification', name: 'Self-falsification', what: '13 probes on imatinib in ABL1 with positive and negative controls', state: 'LIVE', hash: '#/reviewer', source: 'docs/evidence/finalist-falsification-2026-09-27.json' },
      { id: 'retrosynthesis', name: 'Retrosynthesis', what: 'How a chemist would make it: a planned route for imatinib, Replay MATCH', engine: 'AiZynthFinder', state: 'LIVE_INCOMPLETE', hash: '#/reviewer', source: 'docs/evidence/imatinib-retrosynthesis-2026-09-27.json' },
      { id: 'admet', name: 'Property & safety (ADMET)', engine: 'ADMET-AI', what: '52 TDC endpoint estimates; commercial execution is blocked pending weights and training-data licence review', state: 'LIVE_INCOMPLETE', hash: '#/drug', source: 'backend/src/compute/admetResearchRunExecutor.mjs' },
      { id: 'openmm', name: 'Molecular dynamics', what: 'How the protein 1VII moves in water (AMBER14 force field, implicit solvent)', engine: 'OpenMM', state: 'ASK_ONLY', ask: 'Uruchom dynamikę molekularną białka 1VII', source: 'core/experimentFabric/router.ts (biology-openmm-md-1vii-reference)' },
      { id: 'pyscf', name: 'Quantum chemistry', what: 'Hartree–Fock energy of H₂, also computed in CI', engine: 'PySCF', state: 'ASK_ONLY', ask: 'Policz energię Hartree-Fock RHF dla H2', source: 'core/experimentFabric/router.ts (quantum-chemistry-pyscf-h2-rhf)' },
      { id: 'biopython', name: 'Antibody structure', what: 'RMSD of the HIV antibody 10E8 / MPER; PDB files must be supplied', engine: 'Biopython', state: 'ASK_ONLY', ask: 'Porównaj RMSD struktur PDB HIV 10E8 5GHW i 4G6F', source: 'core/experimentFabric/router.ts (biology-hiv-10e8-pdb-structural-comparison)' },
      { id: 'depmap', name: 'Cancer and ageing genetics', what: 'DepMap 24Q2 CRISPR senescence panel p53 / p21 / p16 / RB; data supplied externally', state: 'ASK_ONLY', ask: 'Uruchom panel DepMap CRISPR p53/p21/p16/RB', source: 'core/experimentFabric/router.ts (biology-depmap-crispr-senescence-panel)' },
      { id: 'ingestion', name: 'Live data pull', what: 'PDB, ChEMBL, UniProt and ClinicalTrials.gov, each response hashed', state: 'LIVE', hash: '#/reviewer', source: 'backend/src/scientificIngestion.mjs' },
      { id: 'human-explorer', name: 'Human Explorer', what: 'Body → organ → tissue → cell on the BodyParts3D atlas (CC BY 4.0)', state: 'LIVE', hash: '#/human-biology-lab', source: 'public/assets/bodyparts3d/full' },
      { id: 'molecule', name: 'Molecule World and chemistry lab', what: '3D molecules, titration and reactions', engine: 'RDKit', state: 'LIVE', hash: '#/molecule', source: 'components/MoleculeLabScreen.tsx' },
      { id: 'run8', name: 'Unseen docking benchmark', what: '308 PoseBusters complexes, pre-registered, running on the research machine', state: 'LIVE_INCOMPLETE', note: 'Result appears when the run finishes', source: 'prereg 47c7239f (research branch)' },
      { id: 'glp1r', name: 'GLP-1R activity model', what: 'Frozen gate not passed (MAE 1.01 against 1.0); kept as a negative result', state: 'GATE_FAILED', hash: '#/reviewer', source: 'backend/src/campaign/glp1rQsar*.mjs' },
      { id: 'virtual-bio', name: 'Virtual Bio', what: 'Cell, PBPK, receptor and antibiotic-resistance teaching models', state: 'SYNTHETIC', hash: '#/virtual-bio', source: 'core/virtualBio/models.ts' },
      { id: 'dicom', name: 'DICOM / NIfTI readers', what: 'Medical image readers with checksum and licence gate; no dataset', state: 'ENGINE_ONLY', note: 'Engine only, no screen', source: 'core/medicalData/*' },
    ],
  },
  {
    id: 'ev', name: 'Evidence & Verification', icon: 'replay', line: 'Every result carries its data, hashes and a replay',
    items: [
      { id: 'reviewer', name: 'Reviewer Room', what: 'Tamper challenge, input check, benchmark and negative results', state: 'LIVE', hash: '#/reviewer', source: 'core/reviewer/*' },
      { id: 'replay', name: 'Evidence & Replay', what: 'Replay verdicts MATCH / DRIFT and the integrity envelope', state: 'LIVE', hash: '#/evidence', source: 'backend/src/campaign/verify.mjs' },
      { id: 'provenance', name: 'Provenance', what: 'Input, output and environment hashes of every Science Run, under Technical details', state: 'LIVE', hash: '#/memory', source: 'ScientificResultInspector, ScientificOutcomePanel' },
      { id: 'memory', name: 'Scientific Memory', what: 'Pre-registration in a hash chain; refuses a pre-registration made after the result', state: 'LIVE', hash: '#/memory', source: 'backend/src/experimentMemory.mjs' },
      { id: 'csrn', name: 'Signed certificates (CSRN)', what: 'ECDSA P-256 signing is built; the signing key is not generated, so signatures are empty', state: 'KEY_MISSING', hash: '#/reviewer', source: 'packages/csrn, docs/keys' },
      { id: 'ro-crate', name: 'RO-Crate export', what: 'FAIR JSON-LD evidence pack of a run', state: 'LIVE', hash: '#/pilot', source: 'evidencePackRoCrate.ts' },
      { id: 'tournament', name: 'Model tournament', what: 'Models compete on the same question; the system can answer “we don’t know”', state: 'LIVE', hash: '#/conflict', source: 'ModelTournamentPanel.tsx' },
      { id: 'audit-register', name: 'Audit register', what: 'Cryptographic log of decisions (D-121)', state: 'LIVE', hash: '#/research-console', source: 'core/audit/*' },
      { id: 'knowledge', name: 'Knowledge sources', what: 'Propose-only ledger; a human approves each source', state: 'LIVE', hash: '#/knowledge-sources', source: 'knowledge/EvidenceLedger.ts' },
      { id: 'self-audit', name: 'Self-audit', what: 'What Genesis knows, where it contradicts itself, and its gaps', state: 'LIVE', hash: '#/meta-cognition', source: 'MetaCognitionScreen.tsx' },
      { id: 'proof-ladder', name: 'Proof Ladder and Discovery Certificate', what: 'P0–P10 scale of how close a result is to a discovery', state: 'ENGINE_ONLY', note: 'Method, no screen yet', source: 'core/agent/proofLadder.ts' },
      { id: 'conformal', name: 'Blind tests and calibrated uncertainty', what: 'BlindDataset freeze token, conformal prediction, DiscoveryBench', state: 'ENGINE_ONLY', note: 'Method, no screen yet', source: 'core/agent/conformalPrediction.ts, core/benchmark/*' },
      { id: 'integrity', name: 'Integrity modules', what: 'Watchdogs, metric claims, audit chain and supply-chain checks', state: 'ENGINE_ONLY', note: 'Not wired to the server yet', source: 'backend/src/security/*' },
    ],
  },
  {
    id: 'gov', name: 'Government & Public Sector', icon: 'shield', line: 'Visible and honest: nothing here is government-ready yet',
    subgroups: [
      { label: 'Closest to pilot', ids: ['clockwork', 'd063', 'gov-drug'] },
      { label: 'Method / showcase', ids: ['protection', 'preparedness', 'crisis', 'policy', 'looking-glass'] },
      { label: 'Demo only', ids: ['cyber', 'earthquake'] },
      { label: 'Planned', ids: ['sovereign'] },
    ],
    items: [
      { id: 'clockwork', name: 'CLOCKWORK', what: 'Statutory deadlines (KPA, UDIP), drafts and two-person approval; data stays in the browser', state: 'LIVE', hash: '#/clockwork', source: 'mythos/clockwork/ClockworkEngine.ts' },
      { id: 'd063', name: 'Claim audit and trigger certificate', what: 'Checks a claim against the real SURPASS-2 trial (D-063)', state: 'LIVE', hash: '#/research-console?panel=gov', source: 'core/govServices/*' },
      { id: 'gov-drug', name: 'Government Drug Discovery', what: 'Full campaign on 2,671 ChEMBL molecules; weights not expert-reviewed', state: 'LIVE_INCOMPLETE', hash: '#/gov-campaign', source: 'GovDrugCampaignScreen, ChEMBL + ClinicalTrials.gov pinned' },
      { id: 'protection', name: 'Protection priority', what: 'Who to protect first; the model is not calibrated', state: 'SYNTHETIC', hash: '#/protection-priority', source: 'core/discovery/protectionPriority.ts' },
      { id: 'preparedness', name: 'Preparedness questions', what: 'Answers four modelled questions and refuses the rest', state: 'SYNTHETIC', hash: '#/pilot', source: 'preparednessQuestions.ts' },
      { id: 'crisis', name: 'World and crisis simulations', what: 'Epidemic city, flood, wildfire, infrastructure cascade', state: 'SYNTHETIC', hash: '#/scientific-city', source: 'core/worldModel/**' },
      { id: 'policy', name: 'Policy evaluation', what: 'Causal inference (DiD, ITS, synthetic control) and Environmental Detective; never run on real data', state: 'ENGINE_ONLY', note: 'Engine only, needs a real run', source: 'core/agent/causalInference.ts' },
      { id: 'looking-glass', name: 'Looking Glass', what: 'Civil-protection scenarios with a written weapons boundary', state: 'LIVE', hash: '#/looking-glass', source: 'core/lookingGlass/scenarioResolution.ts' },
      { id: 'cyber', name: 'Cyber', what: 'Incident investigation on a toy target application', state: 'SYNTHETIC', hash: '#/cyber', source: 'cyberReasoningKernel.ts' },
      { id: 'earthquake', name: 'Earthquake', what: 'Synthetic ground motion; not a calibrated model, not a forecast', state: 'SYNTHETIC', hash: '#/city3d', source: 'core/hazard/earthquake/*' },
      { id: 'sovereign', name: 'Sovereign', what: 'Institutional profile', state: 'NO_CODE', note: 'Not built', source: 'navigation.ts (planned)' },
    ],
  },
  {
    id: 'phys', name: 'Physics, Quantum & CERN', icon: 'atom', line: 'Real CERN data plus physics models',
    items: [
      { id: 'cms', name: 'CMS Open Data', what: '10,000 real Z→μμ events (CMS, 2011), analysed offline', state: 'LIVE', hash: '#/physics/cms-z', source: 'compute/cms-zmumu/Zmumu.csv' },
      { id: 'cern-complex', name: 'CERN Complex', what: 'Hall, tunnel and detector with a model collider', state: 'LIVE', hash: '#/cern-complex', source: 'CernComplexView.tsx' },
      { id: 'qe4', name: 'Rényi entropy (QE4)', what: 'Real Brydges data, pre-registered', state: 'LIVE', hash: '#/evidence', source: 'core/biotechData/qe4-brydges/*' },
      { id: 'nuclear', name: 'Nuclear masses', what: 'SEMF model against AME2020 measurements', state: 'LIVE', hash: '#/lab/nuclear', source: 'core/observation/nuclearAme2020.ts' },
      { id: 'pymeep', name: 'Photonics', what: 'Maxwell FDTD simulation: Fresnel transmission and a perfect conductor', engine: 'PyMeep', state: 'ASK_ONLY', ask: 'Uruchom symulację FDTD: transmisja Fresnela na granicy dielektrycznej', source: 'core/experimentFabric/router.ts (electrodynamics-maxwell-fdtd)' },
      { id: 'quantum', name: 'Quantum', what: 'Bloch sphere, CHSH, teleportation, tunnelling, entanglement', state: 'LIVE', hash: '#/lab/quantum', source: 'core/quantum/*' },
      { id: 'spacetime', name: 'Spacetime and black holes', what: 'Geodesics, Schwarzschild, Kerr, gravitational chirp', state: 'LIVE', hash: '#/lab/spacetime', source: 'labs/experiments/einstein-*' },
      { id: 'universe', name: 'Universe and three bodies', what: 'Kepler with a NASA anchor, Hubble tension, three-body integrator', state: 'LIVE', hash: '#/lab/universe', source: 'nssdcPlanetaryFactSheet.ts' },
      { id: 'particle', name: 'Particle Lab', what: 'Discover a particle on synthetic events', state: 'SYNTHETIC', hash: '#/lab/particle', source: 'labs/experiments/particle-invmass.ts' },
    ],
  },
  {
    id: 'world', name: 'World & Digital Twin', icon: 'grid', line: 'Deterministic world model with replay. Scenarios, not forecasts',
    items: [
      { id: 'world-director', name: 'World Director', what: 'Text description → 3D world', state: 'SYNTHETIC', hash: '#/world-director', source: 'genesisWorldDirector.ts' },
      { id: 'scientific-city', name: 'Scientific City', what: 'Rain → pump → hospital water → generator cascade', state: 'SYNTHETIC', hash: '#/scientific-city', source: 'genesisScientificCity4.ts' },
      { id: 'world-engine', name: 'World Engine', what: 'Flood, wildfire and landslide on synthetic terrain', state: 'SYNTHETIC', hash: '#/genesis-world', source: 'worldModel/domains/*' },
      { id: 'city', name: 'City and epidemic', what: 'SEIR, hospitals and traffic in 3D', state: 'SYNTHETIC', hash: '#/city3d', source: 'core/simulation/*' },
      { id: 'what-if', name: 'Counterfactuals', what: 'What-If and Decision Explorer: branch at the decision moment', state: 'LIVE', hash: '#/what-if', source: 'worldModel/decision/decisionSupport.ts' },
      { id: 'temporal', name: 'Temporal', what: 'Procedural historical scenes', state: 'SYNTHETIC', hash: '#/world-director?mode=temporal', source: 'core/temporalCinematic/*' },
      { id: 'hazard', name: 'Hazard solvers', what: 'Drought, seismic, weather and traffic models with tests', state: 'ENGINE_ONLY', note: 'Engine only, no screen', source: 'worldModel/domains/{drought,seismic*,weather}.ts' },
      { id: 'prebuild', name: 'Machine Pre-Build', what: 'What to measure before you build a machine', state: 'LIVE', hash: '#/prebuild', source: 'core/engineeringGraph/*' },
    ],
  },
  {
    id: 'edu', name: 'Education', icon: 'flask', line: 'Labs and explainers. No classes or quizzes yet',
    items: [
      { id: 'labs', name: 'Laboratory', what: 'Plug-in labs: quantum, spacetime, nuclear, chemistry, biology and more', state: 'LIVE', hash: '#/scientific-worlds', source: 'labs/index.ts' },
      { id: 'prevention', name: 'Prevention Lab', what: 'School health: smoking, vaping, alcohol, cannabis', state: 'LIVE', hash: '#/human-biology-lab?simulation=prevention-lab', source: 'preventionLabCatalog.ts' },
      { id: 'human-lab', name: 'Human Lab instruments', what: 'Neuro, histology, imaging, central dogma, biosafety', state: 'LIVE', hash: '#/human-biology-lab', source: 'core/scientificWorlds/humanLab/*' },
      { id: 'glossary', name: 'Glossary', what: 'Plain definitions of the terms Genesis uses', state: 'LIVE', hash: '#/glossary', source: 'data/glossary.ts' },
      { id: 'tour', name: 'Tour', what: 'Voice guide with captions', state: 'LIVE', hash: '#/tour', source: 'core/guide/*' },
      { id: 'dome', name: 'Dome vs globe', what: 'Falsification on cited measurements', state: 'LIVE', hash: '#/dome-world', source: 'core/agent/domeWorld/*' },
      { id: 'modes', name: 'Learn / Study / Research mode', what: 'The same result at three depths of explanation', state: 'NO_CODE', note: 'Not built', source: 'wireframe only' },
    ],
  },
  {
    id: 'plat', name: 'Platform & Infrastructure', icon: 'cpu', line: 'What everything runs on',
    items: [
      { id: 'accounts', name: 'Accounts, database, backups', what: 'scrypt sign-in, hashed sessions, SQLite, backup and restore', state: 'LIVE', hash: '#/settings', source: 'backend/src/*' },
      { id: 'toolchain', name: 'Compute toolchain', what: 'Scientific engines, each checked against a reference case', state: 'LIVE', hash: '#/', source: 'GET /api/compute/toolchain' },
      { id: 'workers', name: 'Remote workers', what: 'Four worker images with an integrity check; never deployed', state: 'ENGINE_ONLY', note: 'Not deployed', source: 'workers/*/Dockerfile' },
      { id: 'fabric', name: 'Experiment Fabric', what: 'The model registry behind Ask and the labs', state: 'LIVE', hash: '#/scientific-worlds', source: 'core/experimentFabric/*' },
      { id: 'science-chat', name: 'Science Chat', what: 'Deterministic routing of a question to a model; no LLM in the loop', state: 'LIVE', ask: '', source: 'core/scienceChat/resolveCommand.ts' },
    ],
  },
];

/** Showcases: they exist and are reachable, but they are experiments, not evidence. */
export const SHOWCASE: readonly Capability[] = [
  { id: 'matrix', name: 'Matrix system map', what: 'Every run and how it connects', state: 'SYNTHETIC', hash: '#/matrix-map', source: 'GenesisMatrixHub.tsx' },
  { id: 'mirror', name: 'Mirror', what: 'Synthetic skeleton, no camera', state: 'SYNTHETIC', hash: '#/mirror', source: 'core/mirror/*' },
  { id: 'myths', name: 'Myths & Theories', what: 'Speculative spacetime sandbox', state: 'SYNTHETIC', hash: '#/myths-theories', source: 'MythsTheories*' },
  { id: 'sim-world', name: 'Sim World', what: 'Free-play simulation world', state: 'SYNTHETIC', hash: '#/sim-world', source: 'SimWorld*' },
];

/** The five groups the dashboard strip shows, in the owner's order. */
export const DASHBOARD_STRIP: readonly string[] = ['ls', 'gov', 'phys', 'world', 'edu'];

export function groupById(id: string): CapabilityGroup | undefined {
  return SCIENTIFIC_OS.find((g) => g.id === id);
}

/** Label counts of one group, from the audit states. */
export function labelCounts(group: CapabilityGroup): Record<UiLabel, number> {
  const counts: Record<UiLabel, number> = { AVAILABLE: 0, PARTIAL: 0, DEMO: 0, BLOCKED: 0, PLANNED: 0 };
  for (const item of group.items) counts[labelOf(item.state)] += 1;
  return counts;
}
