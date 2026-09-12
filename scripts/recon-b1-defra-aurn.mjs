/**
 * B1 (ULEZ->NO2 adjudication) — Phase 0 RECON, run on a GitHub Actions
 * runner (ordinary internet access; the local sandbox's egress to
 * uk-air.defra.gov.uk is confirmed blocked — same 403 CONNECT pattern as
 * zenodo.org/nist.gov/CMS Open Data before it).
 *
 * This does NOT freeze anything. It only discovers: (a) what CSV download
 * links actually exist on each site's "flat_files" index page, (b) the
 * site's own metadata (siting description, network, dates of operation,
 * coordinates) from its site-info page. Both are printed with QE4/CMS-style
 * markers for job-log read-back, so the real fetch plan (Phase 3 freeze) is
 * built from what DEFRA ACTUALLY serves, not guessed from search-engine
 * snippets.
 */

const SITES = [
  { code: 'MY1', label: 'London Marylebone Road (roadside, treated)' },
  { code: 'MAN3', label: 'Manchester Piccadilly (control)' },
  { code: 'LED6', label: 'Leeds Headingley Kerbside (control)' },
  { code: 'SHBR', label: 'Sheffield Barnsley Road (control)' },
];

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'genesis-os-research (recon, non-automated single fetch)' } });
  const body = await res.text();
  return { status: res.status, body };
}

function extractLinks(html) {
  const hrefs = [...html.matchAll(/href="([^"]+)"/gi)].map((m) => m[1]);
  return [...new Set(hrefs)].filter((h) => /\.csv|\.zip|flat_files|data_and_statistics/i.test(h));
}

for (const site of SITES) {
  console.log(`\n=== B1-RECON BEGIN ${site.code} (${site.label}) ===`);

  const flatFilesUrl = `https://uk-air.defra.gov.uk/data/flat_files?site_id=${site.code}`;
  try {
    const { status, body } = await fetchText(flatFilesUrl);
    console.log(`B1-RECON FLATFILES-STATUS ${site.code} ${status}`);
    const links = extractLinks(body);
    console.log(`B1-RECON FLATFILES-LINK-COUNT ${site.code} ${links.length}`);
    for (const link of links) console.log(`B1-RECON FLATFILES-LINK ${site.code} ${link}`);
  } catch (error) {
    console.log(`B1-RECON FLATFILES-ERROR ${site.code} ${String(error)}`);
  }

  const siteInfoUrl = `https://uk-air.defra.gov.uk/networks/site-info?site_id=${site.code}`;
  try {
    const { status, body } = await fetchText(siteInfoUrl);
    console.log(`B1-RECON SITEINFO-STATUS ${site.code} ${status}`);
    // Print the body itself (trimmed of script/style noise) for later text-based extraction of siting description/coords/dates.
    const cleaned = body
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    console.log(`B1-RECON SITEINFO-BODY-BEGIN ${site.code}`);
    console.log(cleaned.slice(0, 4000));
    console.log(`B1-RECON SITEINFO-BODY-END ${site.code}`);
  } catch (error) {
    console.log(`B1-RECON SITEINFO-ERROR ${site.code} ${String(error)}`);
  }

  console.log(`=== B1-RECON END ${site.code} ===`);
}
