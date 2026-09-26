/* Proprietary / All Rights Reserved - Genesis OS */
// Chemistry Live Lab (Playwright, real Chromium, production server): the learner flow through the
// real menu, a COMPUTATIONAL_LIVE run against the real backend model `chemistry-arrhenius`, the
// governed refusals, and the mobile layout contract.
import { test, expect, type Page } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
});

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
}

/** Chemistry lives in the ONE main Laboratory: the research-mode entry opens it at the titration station. */
async function openFromMenu(page: Page): Promise<void> {
  await page.goto('/#/');
  const more = page.locator('.shell-nav-more');
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  await page.getByRole('button', { name: /Chemia — stanowisko miareczkowania/ }).first().click();
  await expect(page.getByTestId('chem-live-lab')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('chem-live-lab')).toHaveAttribute('data-embedded', 'true');
  expect(page.url()).toContain('#/scientific-worlds?station=st-titration');
}

/** Direct entry: the Laboratory's chemistry panel, opened from the lab's own chemistry chip. */
async function openChemistryPanel(page: Page): Promise<void> {
  await page.goto('/#/scientific-worlds');
    await openLabDetails(page);
  await page.getByTestId('sw-chemistry-toggle').click();
  await expect(page.getByTestId('chem-live-lab')).toBeVisible({ timeout: 60_000 });
}

const currentStageKind = (page: Page) => page.locator('[data-state="current"]').getAttribute('data-kind');


/** The lab shows the world by default; the panels (evidence, status, readouts) live behind one control. */
async function openLabDetails(page: import('@playwright/test').Page): Promise<void> {
  const details = page.getByTestId('sw-details');
  await details.waitFor({ state: 'visible', timeout: 120_000 });
  if ((await details.getAttribute('aria-expanded')) !== 'true') await details.click();
}

test.describe('Chemistry Live Lab', () => {
  // Chemistry now lives inside the WebGL Laboratory; in headless software-GL a frame takes ~1 s, so every
  // actionability check is slow. Same budget convention as mainLaboratoryProduct / scientific-worlds.
  test.setTimeout(600_000);
  test('menu → element → titration → live stages → observation → equation → three levels → replay', async ({ page }) => {
    const errors = collectErrors(page);
    await openFromMenu(page);

    // Choose an element from the canonical 118-element table.
    await expect(page.getByTestId('chem-periodic-table').locator('button')).toHaveCount(118);
    await page.getByTestId('chem-element-Fe').click();
    const card = page.getByTestId('chem-element-card');
    await expect(card).toContainText('Żelazo');
    await expect(card).toContainText('Z = 26');
    await expect(card).toContainText('okres 4, grupa 8');

    // Choose a supported experiment and see its plan and safety class.
    await page.getByTestId('chem-experiment-acid-base-titration').click();
    await expect(page.getByTestId('chem-plan-status')).toHaveAttribute('data-status', 'READY');
    await expect(page.getByTestId('chem-safety-class')).toHaveText('CLASSROOM_SAFE_MODEL');

    // Start: the educational label is always on screen.
    await page.getByTestId('chem-start').click();
    // One execution path: the same titration also runs at the Laboratory's titration station.
    await expect(page.getByTestId('sw-transcript')).toContainText('Uruchom Stanowisko miareczkowania', { timeout: 60_000 });
    await expect(page.getByTestId('chem-epistemic-label')).toHaveText(/EDUCATIONAL PROCEDURE MODEL — NOT PHYSICAL LAB TELEMETRY/);
    await expect(page.getByTestId('chem-stage-question')).toContainText('pH');

    // Watch the steps advance: pause autoplay, then step manually.
    await page.getByTestId('chem-play').click();
    for (let i = 0; i < 5; i++) await page.getByTestId('chem-next').click();
    await expect.poll(() => currentStageKind(page)).toBe('STEP');
    await expect(page.getByTestId('chem-visual-canvas')).toBeVisible();
    await expect(page.getByTestId('chem-observation')).toContainText('pH (obliczone przez model)');
    await expect(page.getByTestId('chem-observation')).toContainText('obliczone przez model');
    await expect(page.getByTestId('chem-equation')).toContainText('NaOH');
    await expect(page.getByTestId('chem-stage-safety')).toContainText('NO_PHYSICAL_ACTUATION');

    // Complete the experiment.
    await page.getByTestId('chem-finish').click();
    await expect.poll(() => currentStageKind(page)).toBe('LEARNING_CHECK');
    await expect(page.getByTestId('chem-result-summary')).toContainText('Vₑq = 25 mL');

    // SCHOOL → UNIVERSITY → RESEARCH: same result, different depth.
    const presentation = page.getByTestId('chem-presentation');
    await expect(page.getByTestId('chem-section-what-to-notice')).toBeVisible();
    const hash = await presentation.getAttribute('data-content-hash');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    await page.getByTestId('chem-quiz-titration-half-1').check();
    await expect(page.getByTestId('chem-quiz-feedback-titration-half')).toContainText('Dobrze');

    await page.getByTestId('chem-level-UNIVERSITY').click();
    await expect(presentation).toHaveAttribute('data-level', 'UNIVERSITY');
    await expect(page.getByTestId('chem-section-equation')).toBeVisible();
    await expect(page.getByTestId('chem-section-limitations')).toBeVisible();
    await expect(presentation).toHaveAttribute('data-content-hash', hash!);

    await page.getByTestId('chem-level-RESEARCH').click();
    await expect(page.getByTestId('chem-section-fingerprints')).toContainText(hash!);
    await expect(page.getByTestId('chem-section-model')).toContainText('runTitrationScenario');
    await expect(presentation).toHaveAttribute('data-content-hash', hash!);
    await expect(page.getByTestId('chem-evidence')).toContainText('EDUCATIONAL_MODEL_NOT_EVIDENCE');

    await page.getByTestId('chem-replay').click();
    await expect(page.getByTestId('chem-replay-status')).toHaveAttribute('data-status', 'MATCH');

    // The Fe card launches the element-structure lesson from the same catalog.
    await page.getByTestId('chem-element-Fe').click();
    await page.getByTestId('chem-element-structure').click();
    await page.getByTestId('chem-start').click();
    await page.getByTestId('chem-finish').click();
    await expect(page.getByTestId('chem-result-summary')).toContainText('Fe (Z = 26)');

    expect(errors).toEqual([]);
  });

  test('governed boundaries: unsupported reaction and hazardous substance are refused', async ({ page }) => {
    const errors = collectErrors(page);
    await openChemistryPanel(page);

    await page.getByTestId('chem-prompt-input').fill('Fe + S → ?');
    await page.getByTestId('chem-prompt-submit').click();
    await expect(page.getByTestId('chem-prompt-result')).toContainText('UNSUPPORTED_REACTION_MODEL');

    await page.getByTestId('chem-prompt-input').fill('Pokaż polarność wiązania Na-Cl.');
    await page.getByTestId('chem-prompt-submit').click();
    await expect(page.getByTestId('chem-param-elementA')).toHaveValue('Na');
    await expect(page.getByTestId('chem-param-elementB')).toHaveValue('Cl');

    await page.getByTestId('chem-experiment-acid-base-titration').click();
    await page.getByTestId('chem-param-acid').selectOption('hcn');
    await expect(page.getByTestId('chem-plan-status')).toHaveAttribute('data-status', 'BLOCKED_HAZARDOUS');
    await expect(page.getByTestId('chem-start')).toBeDisabled();
    await expect(page.getByTestId('chem-concept-only')).toContainText('HCN');

    await page.getByTestId('chem-param-acid').selectOption('formic');
    await expect(page.getByTestId('chem-plan-status')).toHaveAttribute('data-status', 'REQUIRES_TEACHER_REVIEW');
    await page.getByTestId('chem-teacher-approve').check();
    await expect(page.getByTestId('chem-plan-status')).toHaveAttribute('data-status', 'READY');
    await expect(page.getByTestId('chem-safety-class')).toHaveText('TEACHER_REVIEW');
    await page.getByTestId('chem-teacher-approve').uncheck();
    await expect(page.getByTestId('chem-plan-status')).toHaveAttribute('data-status', 'REQUIRES_TEACHER_REVIEW');
    expect(errors).toEqual([]);
  });

  test('COMPUTATIONAL_LIVE: Arrhenius runs on the real backend model and replays to MATCH', async ({ page }) => {
    const errors = collectErrors(page);
    const fabricCalls: string[] = [];
    page.on('request', (request) => { if (request.url().endsWith('/api/compute/fabric/run')) fabricCalls.push(request.postData() ?? ''); });
    await openChemistryPanel(page);

    await page.getByTestId('chem-prompt-input').fill('Pokaż, jak temperatura wpływa na szybkość reakcji.');
    await page.getByTestId('chem-prompt-submit').click();
    await expect(page.getByTestId('chem-plan-status')).toHaveAttribute('data-status', 'READY');
    await page.getByTestId('chem-start').click();

    const feed = page.getByTestId('chem-exec-events');
    await expect(feed.locator('[data-event-type="EXECUTION_COMPLETED"]')).toHaveCount(1, { timeout: 30_000 });
    await expect(feed.locator('[data-event-type="ENGINE_OUTPUT_AVAILABLE"]')).toHaveCount(3);
    expect(fabricCalls).toHaveLength(3);
    for (const body of fabricCalls) expect(JSON.parse(body)).toMatchObject({ modelId: 'chemistry-arrhenius', domainId: 'chemistry' });
    await expect(page.getByTestId('chem-epistemic-label')).toContainText('COMPUTATIONAL_LIVE');
    await expect(page.getByTestId('chem-observation')).toContainText('wynik silnika backendu');
    await expect(page.getByTestId('chem-result-summary')).toContainText('k(T+10)/k(T)');

    await page.getByTestId('chem-level-RESEARCH').click();
    await expect(page.getByTestId('chem-section-executions')).toContainText('chemistry-arrhenius@1.0.0');
    await expect(page.getByTestId('chem-evidence')).toContainText('EPHEMERAL_RUN_NOT_PERSISTED');
    await page.getByTestId('chem-replay').click();
    await expect(page.getByTestId('chem-replay-status')).toHaveAttribute('data-status', 'MATCH');
    expect(errors).toEqual([]);
  });

  test('mobile: the lab stays inside the viewport and a lesson completes', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openChemistryPanel(page);
    await expect(page.getByTestId('mobile-navigation')).toBeVisible();

    const inside = async () => {
      const m = await page.evaluate(() => ({ vw: window.innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      expect(m.doc, JSON.stringify(m)).toBeLessThanOrEqual(m.vw + 1);
      expect(m.body, JSON.stringify(m)).toBeLessThanOrEqual(m.vw + 1);
    };
    await inside();

    await page.getByTestId('chem-experiment-vsepr-geometry').click();
    await page.getByTestId('chem-start').click();
    await page.getByTestId('chem-finish').click();
    await expect(page.getByTestId('chem-result-summary')).toContainText('CH₄');
    await page.getByTestId('chem-start').scrollIntoViewIfNeeded();
    await inside();
    await page.getByTestId('chem-element-Og').scrollIntoViewIfNeeded();
    await page.getByTestId('chem-element-Og').click();
    await expect(page.getByTestId('chem-element-card')).toContainText('Z = 118');
    await inside();
    expect(errors).toEqual([]);
  });
});
