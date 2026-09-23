import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChemistryLiveLabScreen } from '../components/ChemistryLiveLabScreen';
import { MORE_SECTIONS, NAV_ITEMS } from '../core/navigation';
import { CHEMISTRY_EDUCATION_EXPERIMENTS } from '../core/chemistryEducation';

/** The Chemistry Live Lab is a reachable product screen, not an isolated demo page. */
describe('Chemistry Live Lab screen', () => {
  it('is in the existing navigation under "Nauka i eksploracja"', () => {
    const item = NAV_ITEMS.find((i) => i.id === 'chemistry-live-lab');
    expect(item?.hash).toBe('#/chemistry-live-lab');
    expect(MORE_SECTIONS.find((s) => s.id === 'more-learning')?.items.map((i) => i.id)).toContain('chemistry-live-lab');
  });

  it('renders the 118-element table, the governed catalog, the three levels and a READY default plan', () => {
    const html = renderToStaticMarkup(<ChemistryLiveLabScreen />);
    expect(html.match(/data-testid="chem-element-[A-Z][a-z]?"/g)).toHaveLength(118);
    for (const t of CHEMISTRY_EDUCATION_EXPERIMENTS) expect(html).toContain(`data-testid="chem-experiment-${t.experimentId}"`);
    for (const level of ['SCHOOL', 'UNIVERSITY', 'RESEARCH']) expect(html).toContain(`data-testid="chem-level-${level}"`);
    expect(html).toContain('data-status="READY"');
    expect(html).toContain('EDUCATIONAL_PROCEDURE_MODEL');
    expect(html).toContain('COMPUTATIONAL_LIVE');
  });
});
