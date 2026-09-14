import type { SourceConfig } from './contracts';

/**
 * SOURCE REGISTRY — configuration only. Each entry names a real, public
 * external source this repo's other modules already read from or could
 * read from (CMS Open Data backs the existing `/api/physics/cms-z` route;
 * ClinicalTrials.gov/DailyMed/ChEMBL back A1-A3 and the GDD campaigns;
 * OpenAlex is the literature-novelty adapter's target; NOAA/FAERS are
 * public government datasets). Adding an entry here wires NOTHING — no
 * `ConnectorPort` implementation is attached, so nothing here can produce a
 * fake successful ingest. A real ingest requires a real port passed in by
 * the caller (see `store.ts::EvidenceConnectorStore.ingest`).
 *
 * `hashPolicy` is deliberately mixed across entries — this registry is what
 * exercises `replay()`'s per-source policy lookup (see `contracts.ts`'s
 * header for why that must not be hardcoded).
 */
export const REGISTRY: readonly SourceConfig[] = [
  { sourceId: 'CMS_OPEN_DATA_5208', name: 'CMS Open Data — Run2011A DoubleMu (dataset 5208)', url: 'https://opendata.cern.ch/record/5208', hashPolicy: 'sha256', category: 'PHYSICS' },
  { sourceId: 'CTGOV_API_V2', name: 'ClinicalTrials.gov API v2', url: 'https://clinicaltrials.gov/api/v2/studies', hashPolicy: 'sha256', category: 'CLINICAL_TRIALS' },
  { sourceId: 'DAILYMED_SPL', name: 'DailyMed Structured Product Labeling', url: 'https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json', hashPolicy: 'fnv1a-canonical', category: 'REGULATORY_LABEL' },
  { sourceId: 'OPENALEX_WORKS', name: 'OpenAlex Works API', url: 'https://api.openalex.org/works', hashPolicy: 'fnv1a-canonical', category: 'LITERATURE' },
  { sourceId: 'NOAA_CO2_MLO', name: 'NOAA GML — Mauna Loa CO2', url: 'https://gml.noaa.gov/ccgg/trends/data.html', hashPolicy: 'sha256', category: 'CLIMATE' },
  { sourceId: 'FAERS_INDEX', name: 'FDA FAERS Quarterly Data Index', url: 'https://fis.fda.gov/extensions/FPD-QDE-FAERS/FPD-QDE-FAERS.html', hashPolicy: 'fnv1a-canonical', category: 'POST_MARKETING' },
  { sourceId: 'CHEMBL_MOL', name: 'ChEMBL Molecule API', url: 'https://www.ebi.ac.uk/chembl/api/data/molecule', hashPolicy: 'sha256', category: 'CHEMISTRY' },
];
