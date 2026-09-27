import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChemistryLiveLabScreen } from '../components/ChemistryLiveLabScreen';
import { MORE_SECTIONS, NAV_ITEMS } from '../core/navigation';
import { CHEMISTRY_EDUCATION_EXPERIMENTS } from '../core/chemistryEducation';

/** The Chemistry Live Lab is the chemistry panel of the ONE main Laboratory, not a page of its own. */
describe('Chemistry Live Lab panel', () => {
  it('is reached through the research-mode chemistry entry, which opens the main Laboratory at the titration station', () => {
    const item = NAV_ITEMS.find((i) => i.id === 'chemistry');
    expect(item?.hash).toBe('#/scientific-worlds?station=st-titration');
    expect(MORE_SECTIONS.find((s) => s.id === 'more-chemistry')?.items.map((i) => i.id)).toContain('chemistry');
    expect(NAV_ITEMS.some((i) => i.hash === '#/chemistry-live-lab')).toBe(false);
  });

  it('embedded, it renders as a Laboratory panel (section, close button) instead of a page', () => {
    const html = renderToStaticMarkup(<ChemistryLiveLabScreen embedded onClose={() => undefined} />);
    expect(html).toContain('data-embedded="true"');
    expect(html.startsWith('<section')).toBe(true);
    expect(html).toContain('data-testid="chem-close"');
    expect(html.match(/data-testid="chem-element-[A-Z][a-z]?"/g)).toHaveLength(118);
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
