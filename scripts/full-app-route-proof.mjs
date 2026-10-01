/**
 * Current-HEAD route inventory smoke for Genesis.
 *
 * Discovers literal product routes from the canonical navigation model and
 * App router, adds every parameterized laboratory route, and opens each route
 * at desktop and mobile widths. This is runtime proof, not a screenshot beauty
 * benchmark: it rejects blank screens, React error boundaries, page errors,
 * console errors and document-level horizontal overflow.
 *
 * Usage:
 *   node scripts/full-app-route-proof.mjs
 *   E2E_BASE=http://127.0.0.1:8080 node scripts/full-app-route-proof.mjs
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8080';
const OUT = process.env.FULL_APP_PROOF_OUT ?? 'artifacts/full-app-route-proof';
const NAVIGATION_PATH = 'packages/frontend/src/core/navigation.ts';
const APP_PATH = 'packages/frontend/src/App.tsx';
const LABS = ['universe', 'spacetime', 'einstein', 'quantum', 'atom', 'nuclear', 'particle', 'chemistry', 'multiverse', 'civilization', 'biology', 'mathematics', 'discovery'];
const VIEWPORTS = [
  { mode: 'desktop', width: 1440, height: 900 },
  { mode: 'mobile', width: 390, height: 844 },
];
const SCREENSHOT_ROUTES = new Set(['#/', '#/drug', '#/human-biology-lab', '#/scientific-worlds', '#/research-console', '#/evidence', '#/more']);
const executablePath = process.env.CHROMIUM_PATH
  ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(existsSync);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function literalRoutes(source) {
  const routes = [];
  for (const match of source.matchAll(/['"](#\/[^'"$]*)['"]/g)) {
    const route = match[1].trim();
    if (route && !route.endsWith('?')) routes.push(route);
  }
  return routes;
}

function stableRouteName(route) {
  return route.replace(/^#\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
}

const navigationSource = readFileSync(NAVIGATION_PATH, 'utf8');
const appSource = readFileSync(APP_PATH, 'utf8');
const routes = [...new Set([
  '#/',
  ...literalRoutes(navigationSource),
  ...literalRoutes(appSource),
  ...LABS.map((lab) => `#/lab/${lab}`),
])].sort();

mkdirSync(OUT, { recursive: true });
const testedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const report = {
  schemaVersion: 'genesis.full-app-route-proof@1',
  testedCommit,
  testedAt: new Date().toISOString(),
  base: BASE,
  sourceHashes: {
    [NAVIGATION_PATH]: sha256(navigationSource),
    [APP_PATH]: sha256(appSource),
  },
  routeCount: routes.length,
  routes,
  viewports: VIEWPORTS,
  cases: [],
  screenshotHashes: {},
  failures: [],
};

const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
report.browser = browser.version();

try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.mode === 'mobile',
      hasTouch: viewport.mode === 'mobile',
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() => {
      localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
    });

    for (const route of routes) {
      const page = await context.newPage();
      const errors = [];
      const httpBoundaries = [];
      page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
          errors.push(`console.error:${message.text()}`);
        }
      });
      page.on('requestfailed', (request) => {
        errors.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? 'UNKNOWN'}`);
      });
      page.on('response', (response) => {
        const status = response.status();
        if (status < 400) return;
        const url = response.url();
        const resourceType = response.request().resourceType();
        if (status >= 500 || (!url.includes('/api/') && status === 404)) {
          errors.push(`http:${status}:${resourceType}:${url}`);
        } else {
          httpBoundaries.push({ status, resourceType, url });
        }
      });
      try {
        const response = await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForTimeout(route.includes('human-biology') || route.includes('scientific-worlds') ? 1_200 : 350);
        const state = await page.evaluate(() => ({
          bodyTextLength: document.body.innerText.trim().length,
          rootChildren: document.querySelector('#root')?.children.length ?? 0,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          errorBoundary: /Coś poszło nie tak|Something went wrong/i.test(document.body.innerText),
        }));
        if (!response || response.status() >= 500) errors.push(`http:${response?.status() ?? 'NO_RESPONSE'}`);
        if (state.rootChildren === 0 || state.bodyTextLength < 20) errors.push('blank_or_missing_root');
        if (state.errorBoundary) errors.push('react_error_boundary');
        if (state.documentWidth > state.viewportWidth + 2) {
          errors.push(`horizontal_overflow:${state.documentWidth}>${state.viewportWidth}`);
        }

        let screenshot = null;
        if (SCREENSHOT_ROUTES.has(route)) {
          screenshot = path.join(OUT, `${viewport.mode}-${stableRouteName(route)}.png`);
          const bytes = await page.screenshot({ path: screenshot, timeout: 60_000 });
          report.screenshotHashes[screenshot.replaceAll('\\', '/')] = sha256(bytes);
        }
        const record = { ...viewport, route, finalUrl: page.url(), screenshot, ...state, httpBoundaries, errors };
        report.cases.push(record);
        for (const error of errors) report.failures.push({ mode: viewport.mode, route, error });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        report.cases.push({ ...viewport, route, httpBoundaries, errors: [...errors, `exception:${message}`] });
        report.failures.push({ mode: viewport.mode, route, error: `exception:${message}` });
      } finally {
        await page.close();
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

report.caseCount = report.cases.length;
report.status = report.failures.length === 0 ? 'PASS' : 'FAIL';
const reportJson = `${JSON.stringify(report, null, 2)}\n`;
const reportPath = path.join(OUT, 'report.json');
writeFileSync(reportPath, reportJson);
writeFileSync(path.join(OUT, 'report.sha256'), `${sha256(reportJson)}  report.json\n`);

process.stdout.write(`${JSON.stringify({
  status: report.status,
  testedCommit,
  routes: report.routeCount,
  cases: report.caseCount,
  screenshots: Object.keys(report.screenshotHashes).length,
  failures: report.failures.length,
  report: reportPath.replaceAll('\\', '/'),
}, null, 2)}\n`);

if (report.failures.length > 0) process.exitCode = 2;
