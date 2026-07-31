/**
 * Icon (V5 design system) — rendered to static SVG markup (no DOM/jsdom needed).
 * Asserts: valid names render an inheriting <svg>, unknown names render nothing,
 * accessibility (aria-hidden vs role=img+title), and size/stroke props apply.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon, type IconName } from '../components/Icon';

const NAMES: IconName[] = [
  'settings', 'flask', 'dna', 'atom', 'molecule', 'graph', 'cpu', 'chart', 'shield',
  'book', 'rocket', 'brain', 'users', 'lock', 'back', 'search', 'memory', 'briefcase',
  'clock', 'target', 'check', 'alert', 'block', 'spark',
];

describe('Icon', () => {
  it('renders every named icon as an SVG inheriting currentColor', () => {
    for (const name of NAMES) {
      const html = renderToStaticMarkup(createElement(Icon, { name }));
      expect(html, name).toContain('<svg');
      expect(html, name).toContain('stroke="currentColor"');
      expect(html, name).toContain('viewBox="0 0 24 24"');
    }
  });

  it('is decorative by default (aria-hidden, no title)', () => {
    const html = renderToStaticMarkup(createElement(Icon, { name: 'flask' }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('<title>');
  });

  it('becomes a labelled image when a title is provided', () => {
    const html = renderToStaticMarkup(createElement(Icon, { name: 'shield', title: 'Truth Engine' }));
    expect(html).toContain('role="img"');
    expect(html).toContain('<title>Truth Engine</title>');
    expect(html).not.toContain('aria-hidden');
  });

  it('applies size and stroke width', () => {
    const html = renderToStaticMarkup(createElement(Icon, { name: 'cpu', size: 32, strokeWidth: 2 }));
    expect(html).toContain('width="32"');
    expect(html).toContain('height="32"');
    expect(html).toContain('stroke-width="2"');
  });

  it('renders nothing for an unknown name', () => {
    // @ts-expect-error intentional invalid name
    const html = renderToStaticMarkup(createElement(Icon, { name: 'not-a-real-icon' }));
    expect(html).toBe('');
  });
});
