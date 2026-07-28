import { DatabaseSync } from 'node:sqlite';

/**
 * Looking Glass — literature corpus store.
 *
 * A SEPARATE DATABASE FILE from the application store, deliberately. The corpus
 * is bulk-loaded, read-heavy and potentially enormous; application data is
 * transactional, small and precious. Keeping them apart means the corpus can be
 * rebuilt, replaced or shipped prebuilt without any risk to accounts, campaigns
 * or evidence records, and a corpus rebuild never takes a write lock on the app.
 *
 * CONCEPTS ARE MeSH DESCRIPTORS, NOT EXTRACTED ENTITIES. PubMed records carry
 * MeSH headings assigned by NLM indexers. Using them instead of running entity
 * extraction over abstracts removes an entire class of error: no mis-linked gene
 * symbols, no "p53" / "TP53" / "tumour protein p53" fragmentation, no model
 * inventing a relationship that the text did not state. The vocabulary is
 * curated by people whose job it is, and it is free.
 *
 * PROVENANCE IS STRUCTURAL. Every article carries `source`, and the only value
 * that may ever be rendered to a user as a citation is 'pubmed'. Test fixtures
 * use source='fixture' and identifiers that cannot be mistaken for a PMID
 * (they are not numeric). A fabricated citation displayed as real would break
 * the one rule this platform is built on, so the schema makes it detectable
 * rather than relying on discipline.
 */

const SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lg_articles (
  id           TEXT PRIMARY KEY,      -- PMID for real records; 'FIXTURE-…' for tests
  source       TEXT NOT NULL,         -- 'pubmed' | 'fixture'
  year         INTEGER,               -- publication year; NULL when unparseable
  title        TEXT,
  journal      TEXT,
  ingested_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lg_articles_year ON lg_articles(year);
CREATE INDEX IF NOT EXISTS idx_lg_articles_source ON lg_articles(source);

-- MeSH descriptors. The ui column is the NLM unique identifier (e.g. D016159).
CREATE TABLE IF NOT EXISTS lg_concepts (
  ui             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  -- Coarse class derived from the MeSH tree number, so the ABC search can be
  -- constrained to biologically sensible shapes (a drug→gene→disease chain is
  -- interesting; a "Humans → Male → Adult" chain is noise).
  semantic_type  TEXT NOT NULL,
  tree_numbers   TEXT,
  -- From the NLM descriptor record, NOT from article annotations. Needed because
  -- an article predating a descriptor's establishment proves NLM re-indexed it,
  -- which is how post-cut-off knowledge leaks into a "historical" corpus.
  date_established TEXT,
  date_created     TEXT,
  vocabulary_year  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_lg_concepts_established ON lg_concepts(date_established);
CREATE INDEX IF NOT EXISTS idx_lg_concepts_type ON lg_concepts(semantic_type);

CREATE TABLE IF NOT EXISTS lg_annotations (
  article_id  TEXT NOT NULL,
  concept_ui  TEXT NOT NULL,
  -- NLM marks a subset of headings as the article's MAJOR topics. Major-only
  -- co-occurrence is far less noisy than all-headings co-occurrence.
  is_major    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (article_id, concept_ui)
);
CREATE INDEX IF NOT EXISTS idx_lg_ann_concept ON lg_annotations(concept_ui);
CREATE INDEX IF NOT EXISTS idx_lg_ann_article ON lg_annotations(article_id);

-- Materialised co-occurrence. Rebuilt from annotations; never hand-edited.
-- (a_ui, b_ui) is stored canonically with a_ui < b_ui so each pair appears once.
CREATE TABLE IF NOT EXISTS lg_cooccurrence (
  a_ui        TEXT NOT NULL,
  b_ui        TEXT NOT NULL,
  articles    INTEGER NOT NULL,       -- how many articles mention both
  major_both  INTEGER NOT NULL,       -- ... with both as MAJOR topics
  first_year  INTEGER,
  last_year   INTEGER,
  PRIMARY KEY (a_ui, b_ui)
);
CREATE INDEX IF NOT EXISTS idx_lg_cooc_a ON lg_cooccurrence(a_ui, articles DESC);
CREATE INDEX IF NOT EXISTS idx_lg_cooc_b ON lg_cooccurrence(b_ui, articles DESC);

-- Per-concept document frequency, so association measures do not re-scan.
CREATE TABLE IF NOT EXISTS lg_concept_stats (
  concept_ui  TEXT PRIMARY KEY,
  articles    INTEGER NOT NULL,
  major       INTEGER NOT NULL,
  first_year  INTEGER,
  last_year   INTEGER
);

-- Bridge to the curated Genesis knowledge graph. One curated node may map to
-- several MeSH descriptors (e.g. "cellular senescence" spans more than one).
CREATE TABLE IF NOT EXISTS lg_node_map (
  genesis_node  TEXT NOT NULL,
  concept_ui    TEXT NOT NULL,
  -- Who asserted the mapping, so it can be reviewed like any other curation.
  mapped_by     TEXT NOT NULL,
  PRIMARY KEY (genesis_node, concept_ui)
);
CREATE INDEX IF NOT EXISTS idx_lg_map_concept ON lg_node_map(concept_ui);

-- What has been ingested, so a corpus can state its own coverage honestly.
CREATE TABLE IF NOT EXISTS lg_ingests (
  id          TEXT PRIMARY KEY,
  query       TEXT NOT NULL,
  requested   INTEGER NOT NULL,
  retrieved   INTEGER NOT NULL,
  from_year   INTEGER,
  to_year     INTEGER,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS lg_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/**
 * Coarse semantic class from a MeSH tree number. The full MeSH tree has 16 top
 * categories; the ABC search only needs to know which broad kind of thing a
 * concept is, so the mapping is deliberately blunt and stated in one place.
 */
export function semanticTypeFromTree(treeNumbers) {
  const trees = Array.isArray(treeNumbers) ? treeNumbers : String(treeNumbers ?? '').split(',');
  const first = (trees.find(Boolean) ?? '').trim();
  const head = first.charAt(0);
  switch (head) {
    case 'A': return 'anatomy';
    case 'B': return 'organism';
    case 'C': return 'disease';
    case 'D': return 'chemical';      // includes drugs, proteins and genes-as-substances
    case 'E': return 'technique';     // assays, procedures — useful for "missing experiment"
    case 'F': return 'psychology';
    case 'G': return 'process';       // physiological and cellular processes = the mechanisms
    case 'H': return 'discipline';
    case 'I': return 'social';
    case 'J': return 'technology';
    case 'L': return 'information';
    case 'M': return 'person';
    case 'N': return 'healthcare';
    case 'V': return 'publication-type';
    case 'Z': return 'geographic';
    default: return 'unclassified';
  }
}

/**
 * Concepts too general to carry information. "Humans" appears on a large
 * fraction of all biomedical records, so any co-occurrence involving it is an
 * artefact of indexing practice rather than a relationship. Excluded from the
 * ABC search by default; the list is exported so it can be argued with.
 */
export const STOP_CONCEPTS = new Set([
  'D006801', // Humans
  'D008297', // Male
  'D005260', // Female
  'D000818', // Animals
  'D051379', // Mice
  'D000328', // Adult
  'D008875', // Middle Aged
  'D000368', // Aged
  'D008722', // Methods
  'D000369', // Aged, 80 and over
  'D005544', // Follow-Up Studies
  'D011446', // Prospective Studies
  'D012189', // Retrospective Studies
]);

export function openCorpus(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  // Forward migration for corpora created before descriptor dates existed.
  for (const col of ['date_established TEXT', 'date_created TEXT', 'vocabulary_year INTEGER']) {
    try { db.exec(`ALTER TABLE lg_concepts ADD COLUMN ${col}`); } catch { /* already present */ }
  }
  db.prepare('INSERT INTO lg_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('schema_version', String(SCHEMA_VERSION));
  return db;
}

/* ------------------------------ ingestion ------------------------------ */

/**
 * Insert a batch of parsed articles. Idempotent on article id, so re-running an
 * ingest cannot double-count a paper into the co-occurrence statistics — which
 * would silently inflate every association measure downstream.
 */
export function ingestArticles(db, articles, { source = 'pubmed', now = Date.now() } = {}) {
  const insertArticle = db.prepare(
    `INSERT INTO lg_articles (id, source, year, title, journal, ingested_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET year = excluded.year, title = excluded.title, journal = excluded.journal`,
  );
  const insertConcept = db.prepare(
    `INSERT INTO lg_concepts (ui, name, semantic_type, tree_numbers) VALUES (?, ?, ?, ?)
     ON CONFLICT(ui) DO UPDATE SET name = excluded.name,
       semantic_type = CASE WHEN excluded.semantic_type != 'unclassified' THEN excluded.semantic_type ELSE lg_concepts.semantic_type END`,
  );
  const insertAnnotation = db.prepare(
    `INSERT INTO lg_annotations (article_id, concept_ui, is_major) VALUES (?, ?, ?)
     ON CONFLICT(article_id, concept_ui) DO UPDATE SET is_major = max(lg_annotations.is_major, excluded.is_major)`,
  );

  let inserted = 0;
  db.exec('BEGIN');
  try {
    for (const a of articles) {
      if (!a?.id) continue;
      insertArticle.run(String(a.id), source, a.year ?? null, a.title ?? null, a.journal ?? null, now);
      for (const c of a.concepts ?? []) {
        if (!c?.ui) continue;
        insertConcept.run(
          String(c.ui), String(c.name ?? c.ui),
          c.semanticType ?? semanticTypeFromTree(c.treeNumbers),
          Array.isArray(c.treeNumbers) ? c.treeNumbers.join(',') : (c.treeNumbers ?? null),
        );
        insertAnnotation.run(String(a.id), String(c.ui), c.isMajor ? 1 : 0);
      }
      inserted += 1;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return inserted;
}

export function recordIngest(db, { id, query, requested, retrieved, fromYear, toYear, startedAt, finishedAt }) {
  db.prepare(
    `INSERT INTO lg_ingests (id, query, requested, retrieved, from_year, to_year, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET retrieved = excluded.retrieved, finished_at = excluded.finished_at`,
  ).run(String(id), String(query), Number(requested), Number(retrieved), fromYear ?? null, toYear ?? null, Number(startedAt), finishedAt ?? null);
}

/* --------------------------- derived statistics --------------------------- */

/**
 * Rebuild concept statistics and the co-occurrence table.
 *
 * `throughYear` is the feature that makes retrospective validation possible: it
 * builds the corpus AS OF a year, so the engine can be asked what it would have
 * proposed from the literature available at that time. Without it, any claim
 * that the engine "would have found" a later discovery is untestable.
 *
 * `minSupport` prunes pairs seen in fewer than N articles. At scale this is not
 * an optimisation but a necessity — the number of distinct pairs grows roughly
 * with the square of concepts per article, and single-article pairs are almost
 * entirely indexing noise.
 */
export function rebuildStatistics(db, { throughYear = null, minSupport = 2, majorOnly = false } = {}) {
  const yearClause = throughYear ? 'AND (ar.year IS NOT NULL AND ar.year <= ?)' : '';
  const majorClause = majorOnly ? 'AND an.is_major = 1' : '';
  const params = throughYear ? [throughYear] : [];

  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM lg_concept_stats');
    db.exec('DELETE FROM lg_cooccurrence');

    db.prepare(`
      INSERT INTO lg_concept_stats (concept_ui, articles, major, first_year, last_year)
      SELECT an.concept_ui, COUNT(DISTINCT an.article_id),
             SUM(an.is_major), MIN(ar.year), MAX(ar.year)
      FROM lg_annotations an JOIN lg_articles ar ON ar.id = an.article_id
      WHERE 1 = 1 ${yearClause} ${majorClause}
      GROUP BY an.concept_ui
    `).run(...params);

    // Canonical ordering (a < b) so each unordered pair is stored exactly once.
    db.prepare(`
      INSERT INTO lg_cooccurrence (a_ui, b_ui, articles, major_both, first_year, last_year)
      SELECT x.concept_ui, y.concept_ui, COUNT(DISTINCT x.article_id),
             SUM(CASE WHEN x.is_major = 1 AND y.is_major = 1 THEN 1 ELSE 0 END),
             MIN(ar.year), MAX(ar.year)
      FROM lg_annotations x
      JOIN lg_annotations y ON y.article_id = x.article_id AND y.concept_ui > x.concept_ui
      JOIN lg_articles ar ON ar.id = x.article_id
      WHERE 1 = 1 ${yearClause} ${majorOnly ? 'AND x.is_major = 1 AND y.is_major = 1' : ''}
      GROUP BY x.concept_ui, y.concept_ui
      HAVING COUNT(DISTINCT x.article_id) >= ?
    `).run(...params, minSupport);

    db.prepare('INSERT INTO lg_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('stats_through_year', throughYear === null ? 'all' : String(throughYear));
    db.prepare('INSERT INTO lg_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('stats_min_support', String(minSupport));

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return corpusStats(db);
}

export function corpusStats(db) {
  const one = (sql, ...args) => db.prepare(sql).get(...args) ?? {};
  const articles = one('SELECT COUNT(*) AS n, MIN(year) AS lo, MAX(year) AS hi FROM lg_articles');
  const bySource = db.prepare('SELECT source, COUNT(*) AS n FROM lg_articles GROUP BY source').all();
  return {
    articles: articles.n ?? 0,
    yearRange: [articles.lo ?? null, articles.hi ?? null],
    bySource: Object.fromEntries(bySource.map((r) => [r.source, r.n])),
    concepts: one('SELECT COUNT(*) AS n FROM lg_concepts').n ?? 0,
    annotations: one('SELECT COUNT(*) AS n FROM lg_annotations').n ?? 0,
    pairs: one('SELECT COUNT(*) AS n FROM lg_cooccurrence').n ?? 0,
    statsThroughYear: one('SELECT value AS v FROM lg_meta WHERE key = ?', 'stats_through_year').v ?? null,
    minSupport: Number(one('SELECT value AS v FROM lg_meta WHERE key = ?', 'stats_min_support').v ?? 0),
  };
}

/* ------------------------------- accessors ------------------------------- */

export function getConcept(db, ui) {
  return db.prepare('SELECT * FROM lg_concepts WHERE ui = ?').get(String(ui)) ?? null;
}

export function findConcepts(db, term, limit = 20) {
  return db.prepare(
    `SELECT c.*, COALESCE(s.articles, 0) AS articles
     FROM lg_concepts c LEFT JOIN lg_concept_stats s ON s.concept_ui = c.ui
     WHERE c.name LIKE ? ORDER BY articles DESC LIMIT ?`,
  ).all(`%${term}%`, limit);
}

export function conceptStats(db, ui) {
  return db.prepare('SELECT * FROM lg_concept_stats WHERE concept_ui = ?').get(String(ui)) ?? null;
}

/** Articles annotated with BOTH concepts — the citations behind a co-occurrence. */
export function articlesFor(db, aUi, bUi, limit = 25) {
  return db.prepare(`
    SELECT ar.id, ar.source, ar.year, ar.title, ar.journal
    FROM lg_annotations x
    JOIN lg_annotations y ON y.article_id = x.article_id AND y.concept_ui = ?
    JOIN lg_articles ar ON ar.id = x.article_id
    WHERE x.concept_ui = ?
    ORDER BY ar.year DESC LIMIT ?
  `).all(String(bUi), String(aUi), limit);
}

/** Canonical pair lookup. Returns null when the pair was never observed together. */
export function cooccurrence(db, aUi, bUi) {
  const [a, b] = String(aUi) < String(bUi) ? [aUi, bUi] : [bUi, aUi];
  return db.prepare('SELECT * FROM lg_cooccurrence WHERE a_ui = ? AND b_ui = ?').get(String(a), String(b)) ?? null;
}

/** Every concept co-occurring with `ui`, strongest first. */
export function neighbours(db, ui, limit = 200) {
  return db.prepare(`
    SELECT CASE WHEN a_ui = ? THEN b_ui ELSE a_ui END AS other_ui, articles, major_both, first_year, last_year
    FROM lg_cooccurrence WHERE a_ui = ? OR b_ui = ?
    ORDER BY articles DESC LIMIT ?
  `).all(String(ui), String(ui), String(ui), limit);
}

/* ---------------------------- graph bridging ---------------------------- */

export function mapNode(db, genesisNode, conceptUi, mappedBy) {
  db.prepare(
    `INSERT INTO lg_node_map (genesis_node, concept_ui, mapped_by) VALUES (?, ?, ?)
     ON CONFLICT(genesis_node, concept_ui) DO UPDATE SET mapped_by = excluded.mapped_by`,
  ).run(String(genesisNode), String(conceptUi), String(mappedBy));
}

export function conceptsForNode(db, genesisNode) {
  return db.prepare(
    `SELECT m.concept_ui, c.name, c.semantic_type, COALESCE(s.articles, 0) AS articles, m.mapped_by
     FROM lg_node_map m
     LEFT JOIN lg_concepts c ON c.ui = m.concept_ui
     LEFT JOIN lg_concept_stats s ON s.concept_ui = m.concept_ui
     WHERE m.genesis_node = ?`,
  ).all(String(genesisNode));
}

export function nodesForConcept(db, conceptUi) {
  return db.prepare('SELECT genesis_node, mapped_by FROM lg_node_map WHERE concept_ui = ?').all(String(conceptUi));
}

/**
 * Citations are only ever rendered from records the platform actually retrieved.
 * Fixtures are stored with a non-numeric id and source='fixture' so that a test
 * corpus can never be presented as literature — the check is structural rather
 * than a convention someone has to remember.
 */
export function isCitable(article) {
  return article?.source === 'pubmed' && /^\d+$/.test(String(article.id ?? ''));
}
