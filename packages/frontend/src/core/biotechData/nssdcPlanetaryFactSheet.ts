/**
 * Odczyt PRZYPIĘTEJ, surowej strony NASA NSSDCA Planetary Fact Sheet — druga
 * kotwica zewnętrzna (P2.3), niezależna od pierwszej (PubChem).
 *
 * Plik `nssdc-planetary-factsheet.html` jest DOSŁOWNĄ, niezmienioną treścią
 * pobraną raz przez realny fetch z GitHub Actions (`kepler-solar-system-pinned-artifact`
 * job, `scripts/fetch-kepler-solar-system-fixture.mjs`) — to środowisko sandboxa
 * ma zablokowany egress do `nssdc.gsfc.nasa.gov` (ten sam blok co udokumentowany
 * dla pierwszej próby keplerowskiej, `docs/P2_EVIDENCE.md`), ale runner GitHub
 * Actions nie ma takiego ograniczenia. Bajtowa identyczność zweryfikowana
 * niezależnie DWOMA metodami: SHA-256 wypisany przez sam skrypt fetchujący w
 * logu joba (`42bdc3f1dae470b85580c6ac66c353964a05d544ad2ac970a6b7d908337a6c3c`,
 * 14363 B) ORAZ osobny krok tego samego joba, który odczytuje zapisany plik z
 * dysku i liczy sumę PONOWNIE — obie się zgadzają. Ten plik trafił do repo
 * przez odtworzenie zawartości z `cat` w logu tego joba (bo URL artefaktu w
 * Azure Blob Storage jest zablokowany przez tę samą politykę proxy) i
 * zweryfikowanie WŁASNYM przeliczeniem SHA-256, które dało DOKŁADNIE ten sam
 * odcisk — czyli odzyskana treść jest bajtowo identyczna z tym, co runner
 * naprawdę pobrał z NASA, a nie czymś przepisanym ręcznie.
 */

export const NSSDC_PLANETARY_FACTSHEET_SOURCE_URL = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/';
// Data (nie pełny znacznik czasu) — zgodnie z konwencją pierwszej kotwicy
// (PUBCHEM_CID_2519_RETRIEVED_AT), sprawdzaną testem na format YYYY-MM-DD.
// Realny czas kroku CI, który pobrał tę stronę: 2026-09-12T19:25:30Z (job
// "Kepler anchor — pinned NASA NSSDCA Solar System fact sheet", run 34714125596).
export const NSSDC_PLANETARY_FACTSHEET_RETRIEVED_AT = '2026-09-12';
export const NSSDC_PLANETARY_FACTSHEET_RAW_SHA256 = '42bdc3f1dae470b85580c6ac66c353964a05d544ad2ac970a6b7d908337a6c3c';

/** Kolejność kolumn tabeli NASA — stała, nie wyprowadzana z niczego. */
const PLANET_ORDER = ['mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'] as const;
export type NssdcPlanetKey = (typeof PLANET_ORDER)[number];

export interface NssdcPlanetElements {
  readonly distanceFromSunMillionKm: number;
  readonly orbitalPeriodDays: number;
}

/**
 * Wyciąga 10 komórek wiersza tabeli, którego PIERWSZA komórka zawiera
 * `labelMarker` — bez parsera DOM, bo strona jest prostym, statycznym HTML-em
 * NASA sprzed dekad i jeden regexowy odczyt komórek `<td>` jest cały kontrakt,
 * jakiego to wymaga (ten sam poziom prostoty co reszta kotwic w tym pliku).
 */
function extractRowCells(html: string, labelMarker: string): readonly string[] | null {
  const labelIndex = html.indexOf(labelMarker);
  if (labelIndex === -1) return null;
  const rowEnd = html.indexOf('</tr>', labelIndex);
  if (rowEnd === -1) return null;
  const row = html.slice(labelIndex, rowEnd);
  const cells = [...row.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((match) => match[1]!.trim());
  return cells.length === PLANET_ORDER.length ? cells : null;
}

/**
 * Czyta „Distance from Sun" (10⁶ km) i „Orbital Period" (dni) dla każdej z 10
 * kolumn tabeli, dokładnie tak, jak są opublikowane — bez przeliczeń, bez
 * poprawek. Gwiazdka NASA przy Księżycu (`0.384*`, `27.3*` — odległość/okres
 * WOKÓŁ ZIEMI, nie wokół Słońca) jest usuwana jako znak, nigdy jako wartość:
 * ten wiersz i tak nie jest używany przez kotwicę (interesuje ją Mars).
 */
export function parseNssdcPlanetaryFactSheet(html: string): Partial<Record<NssdcPlanetKey, NssdcPlanetElements>> {
  const distanceRow = extractRowCells(html, 'Distance from Sun');
  const periodRow = extractRowCells(html, 'Orbital Period');
  if (distanceRow === null || periodRow === null) return {};

  const result: Partial<Record<NssdcPlanetKey, NssdcPlanetElements>> = {};
  PLANET_ORDER.forEach((planet, index) => {
    const distance = Number(distanceRow[index]?.replace(/[,*]/g, ''));
    const period = Number(periodRow[index]?.replace(/[,*]/g, ''));
    if (Number.isFinite(distance) && Number.isFinite(period)) {
      result[planet] = { distanceFromSunMillionKm: distance, orbitalPeriodDays: period };
    }
  });
  return result;
}
