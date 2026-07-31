#!/usr/bin/env node
/**
 * Genesis OS — pobieranie realnych danych naukowych.
 *
 * Ten skrypt NIE MÓGŁ zostać uruchomiony ani przetestowany podczas jego
 * napisania: środowisko sesji deweloperskiej ma politykę sieciową, która
 * blokuje opendata.cern.ch, ssd.jpl.nasa.gov, gea.esac.esa.int i
 * api.nasa.gov na poziomie bramki (403 "policy denial", potwierdzone przez
 * `curl -sS "$HTTPS_PROXY/__agentproxy/status"` — nie jest to błąd tego
 * skryptu ani chwilowa awaria). Uruchom go z sieci bez takiej blokady
 * (Twój komputer, Replit) — wtedy powinien zadziałać, ale przy każdym
 * źródle są zaznaczone elementy do zweryfikowania (dokładny endpoint,
 * kolumny), bo nie dało się ich sprawdzić na żywo.
 *
 * Użycie:
 *   node scripts/fetch-real-data.mjs cern      # dimuon (Particle Lab)
 *   node scripts/fetch-real-data.mjs jpl       # efemerydy planet (NASA JPL Horizons)
 *   node scripts/fetch-real-data.mjs gaia      # katalog gwiazd (ESA Gaia)
 *   node scripts/fetch-real-data.mjs all       # wszystkie po kolei
 *
 * Każde źródło pisze plik w src/data/, który architektura DataSource
 * (packages/frontend/src/core/dataSource.ts) automatycznie wykryje przy
 * następnym buildzie — zero zmian w kodzie aplikacji.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../packages/frontend/src/data');

function log(msg) {
  console.log(`[fetch-real-data] ${msg}`);
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/* ------------------------------------------------------------------ */
/* CERN Open Data — masy niezmiennicze pary mionów (Particle Lab)     */
/* ------------------------------------------------------------------ */
/**
 * Cel: packages/frontend/src/labs/experiments/particle-invmass.ts czyta
 * src/data/dimuon-real.ts automatycznie (import.meta.glob), rejestrowane
 * przez core/dataSource.ts jako źródło 'particle.dimuon-masses'.
 *
 * DO ZWERYFIKOWANIA (nie mogłem sprawdzić na żywo): dokładny numer rekordu
 * i URL pliku CSV mogły się zmienić od czasu ostatniej aktualizacji tego
 * skryptu. Wejdź na https://opendata.cern.ch i wyszukaj "dimuon" — CMS ma
 * kilka udostępnionych podzbiorów (np. z warsztatów CERN Open Data), z
 * kolumną masy niezmienniczej (zwykle nazwaną "M" lub "mass"). Podmień
 * CERN_CSV_URL i CERN_MASS_COLUMN poniżej, jeśli się nie zgadzają.
 */
const CERN_CSV_URL =
  'https://opendata.cern.ch/record/545/files/Dimuon_DoubleMu.csv';
const CERN_MASS_COLUMN = 'M';

async function fetchCernDimuon() {
  log('CERN Open Data: pobieranie CSV dimionów…');
  const csv = await fetchText(CERN_CSV_URL);
  const [headerLine, ...rows] = csv.trim().split('\n');
  const cols = headerLine.split(',').map((c) => c.trim());
  const massIdx = cols.indexOf(CERN_MASS_COLUMN);
  if (massIdx === -1) {
    throw new Error(
      `Kolumna "${CERN_MASS_COLUMN}" nie znaleziona w nagłówku CSV: ${cols.join(', ')}. ` +
        'Zaktualizuj CERN_MASS_COLUMN w tym skrypcie.',
    );
  }
  const masses = rows
    .map((r) => Number(r.split(',')[massIdx]))
    .filter((m) => Number.isFinite(m) && m > 0);

  if (masses.length < 100) {
    throw new Error(`Podejrzanie mało wierszy (${masses.length}) — sprawdź URL/kolumnę przed zapisem.`);
  }

  const out = `/**\n * Realne masy niezmiennicze par mionów — CERN Open Data (CC0).\n * Źródło: ${CERN_CSV_URL}\n * Wygenerowane przez scripts/fetch-real-data.mjs — nie edytować ręcznie.\n */\nexport const REAL_DIMUON_MASSES: number[] = ${JSON.stringify(masses)};\n`;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, 'dimuon-real.ts'), out);
  log(`Zapisano ${masses.length} realnych mas do src/data/dimuon-real.ts`);
}

/* ------------------------------------------------------------------ */
/* NASA JPL Horizons — elementy orbitalne planet                      */
/* ------------------------------------------------------------------ */
/**
 * Cel: dziś ŻADEN lab nie konsumuje tego pliku — to świadoma decyzja
 * (patrz RAPORT sesji): dodanie prawdziwego panelu "Układ Słoneczny" to
 * osobna decyzja produktowa (który lab? nowy lab?), nie coś do wymuszenia
 * przy okazji tego skryptu. Ten fetcher przygotowuje dane pod tę przyszłą
 * funkcję, żeby nie blokować jej na pobieranie w przyszłości.
 *
 * DO ZWERYFIKOWANIA: dokładne parametry API Horizons (nazwy pól JSON w
 * odpowiedzi) — dokumentacja: https://ssd-api.jpl.nasa.gov/doc/horizons.html.
 * Poniżej używam trybu ELEMENTS (elementy orbitalne), heliocentrycznie.
 */
const JPL_BODIES = [
  { id: '199', name: 'Merkury' },
  { id: '299', name: 'Wenus' },
  { id: '399', name: 'Ziemia' },
  { id: '499', name: 'Mars' },
  { id: '599', name: 'Jowisz' },
  { id: '699', name: 'Saturn' },
  { id: '799', name: 'Uran' },
  { id: '899', name: 'Neptun' },
];

async function fetchJplHorizons() {
  log('NASA JPL Horizons: pobieranie elementów orbitalnych planet…');
  const today = new Date().toISOString().slice(0, 10);
  const results = [];
  for (const body of JPL_BODIES) {
    const url =
      'https://ssd.jpl.nasa.gov/api/horizons.api?format=json' +
      `&COMMAND='${body.id}'&OBJ_DATA=NO&MAKE_EPHEM=YES&EPHEM_TYPE=ELEMENTS` +
      `&CENTER='500@10'&START_TIME='${today}'&STOP_TIME='${today}'&STEP_SIZE='1d'`;
    try {
      const data = await fetchJson(url);
      results.push({ id: body.id, name: body.name, raw: data.result });
      log(`  ${body.name}: OK`);
    } catch (err) {
      log(`  ${body.name}: BŁĄD — ${err.message} (pomijam, reszta kontynuuje)`);
    }
  }
  if (results.length === 0) {
    throw new Error('Żadna planeta nie została pobrana — sprawdź endpoint/parametry API.');
  }
  const out = `/**\n * Surowe odpowiedzi NASA JPL Horizons (elementy orbitalne, tekst).\n * Parsowanie do liczb zostawione konsumentowi — format Horizons to blok\n * tekstowy, nie czysty JSON danych (patrz pole \`raw\`).\n * Wygenerowane przez scripts/fetch-real-data.mjs — nie edytować ręcznie.\n */\nexport const JPL_HORIZONS_ELEMENTS = ${JSON.stringify(results, null, 2)};\n`;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, 'solar-system-real.ts'), out);
  log(`Zapisano ${results.length}/${JPL_BODIES.length} planet do src/data/solar-system-real.ts`);
}

/* ------------------------------------------------------------------ */
/* ESA Gaia — katalog najjaśniejszych/najbliższych gwiazd             */
/* ------------------------------------------------------------------ */
/**
 * Cel: jak przy JPL — dziś brak konsumenta w aplikacji (przyszły panel
 * "prawdziwe niebo" w Universe/Civilization Lab). Zapytanie ADQL poniżej
 * pobiera 200 gwiazd o największej paralaksie (czyli najbliższych Słońcu)
 * z Gaia DR3 — sensowny, mały, edukacyjnie ciekawy podzbiór zamiast całego
 * katalogu (>1 mld gwiazd, zdecydowanie za dużo na telefon).
 *
 * DO ZWERYFIKOWANIA: nazwa tabeli `gaiadr3.gaia_source` i URL TAP mogą się
 * zmienić przy kolejnych data release'ach Gaia — sprawdź
 * https://www.cosmos.esa.int/web/gaia-users/archive przed uruchomieniem.
 */
const GAIA_TAP_URL = 'https://gea.esac.esa.int/tap-server/tap/sync';
const GAIA_ADQL =
  'SELECT TOP 200 source_id, ra, dec, parallax, phot_g_mean_mag, bp_rp ' +
  'FROM gaiadr3.gaia_source ' +
  'WHERE parallax > 20 AND parallax_over_error > 10 ' +
  'ORDER BY parallax DESC';

async function fetchGaiaStars() {
  log('ESA Gaia: pobieranie katalogu najbliższych gwiazd…');
  const url = `${GAIA_TAP_URL}?REQUEST=doQuery&LANG=ADQL&FORMAT=json&QUERY=${encodeURIComponent(GAIA_ADQL)}`;
  const data = await fetchJson(url);
  const rows = data.data ?? [];
  if (rows.length === 0) {
    throw new Error('Zapytanie ADQL nie zwróciło wierszy — sprawdź nazwę tabeli/URL TAP.');
  }
  const stars = rows.map(([sourceId, ra, dec, parallax, mag, bpRp]) => ({
    sourceId,
    ra,
    dec,
    parallaxMas: parallax,
    distanceLy: parallax > 0 ? Math.round((3261.56 / parallax) * 100) / 100 : null, // 1000/parallax[mas] = pc; ×3.2616 = ly
    magnitude: mag,
    colorIndex: bpRp,
  }));
  const out = `/**\n * Realny katalog najbliższych gwiazd — ESA Gaia DR3 (CC BY-SA 3.0 IGO).\n * Zapytanie ADQL: ${GAIA_ADQL.replace(/\n/g, ' ')}\n * Wygenerowane przez scripts/fetch-real-data.mjs — nie edytować ręcznie.\n */\nexport const GAIA_NEARBY_STARS = ${JSON.stringify(stars, null, 2)};\n`;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, 'gaia-stars-real.ts'), out);
  log(`Zapisano ${stars.length} gwiazd do src/data/gaia-stars-real.ts`);
}

/* ------------------------------------------------------------------ */

const TASKS = { cern: fetchCernDimuon, jpl: fetchJplHorizons, gaia: fetchGaiaStars };
const target = process.argv[2];

if (!target || !['cern', 'jpl', 'gaia', 'all'].includes(target)) {
  console.log('Użycie: node scripts/fetch-real-data.mjs <cern|jpl|gaia|all>');
  process.exit(1);
}

const toRun = target === 'all' ? Object.keys(TASKS) : [target];
let failures = 0;
for (const name of toRun) {
  try {
    await TASKS[name]();
  } catch (err) {
    failures++;
    console.error(`[fetch-real-data] ${name} nie powiódł się: ${err.message}`);
  }
}
if (failures > 0) {
  console.error(`\n${failures}/${toRun.length} źródeł nie powiodło się. Zobacz komentarze "DO ZWERYFIKOWANIA" w tym pliku.`);
  process.exit(1);
}
log('Gotowe. Przebuduj aplikację (npm run build) — DataSource wykryje nowe pliki automatycznie.');
