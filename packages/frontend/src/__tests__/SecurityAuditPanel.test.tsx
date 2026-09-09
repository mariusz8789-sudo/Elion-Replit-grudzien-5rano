import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SecurityAuditPanel } from '../components/SecurityAuditPanel';

describe('SecurityAuditPanel — logged-out boundary', () => {
  it('never offers to run an audit before login (no fabricated results, no button)', () => {
    const markup = renderToStaticMarkup(<SecurityAuditPanel />);

    expect(markup).toContain('wymaga zalogowania');
    expect(markup).not.toContain('Uruchom audyt zależności');
    expect(markup).not.toContain('SUSPECTED');
  });
});
