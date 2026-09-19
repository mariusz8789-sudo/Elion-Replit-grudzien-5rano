import type { ReactNode } from 'react';
import type { WorldEpistemicBadge, WorldObject } from './worldFirst.types';
import { EpistemicBadge } from './EpistemicBadge';

export interface ResearchDrawerProps {
  readonly open: boolean;
  readonly object: WorldObject | null;
  readonly title?: string;
  readonly badges?: readonly WorldEpistemicBadge[];
  readonly children?: ReactNode;
  readonly expanded?: boolean;
  readonly onExpand?: () => void;
  readonly onCollapse?: () => void;
  readonly onClose?: () => void;
  readonly className?: string;
}

export function ResearchDrawer({
  open,
  object,
  title,
  badges,
  children,
  expanded = false,
  onExpand,
  onCollapse,
  onClose,
  className = '',
}: ResearchDrawerProps) {
  if (!open) return null;

  const resolvedTitle = title ?? object?.researchTitle ?? object?.label ?? 'Research';
  const resolvedBadges = badges ?? object?.badges ?? [];

  return (
    <aside
      className={[
        'gx-world-research-drawer',
        expanded ? 'gx-world-research-drawer--expanded' : '',
        className,
      ].filter(Boolean).join(' ')}
      aria-label={`${resolvedTitle} research`}
      data-testid="gx-research-drawer"
    >
      <header className="gx-world-research-drawer__head">
        <div className="gx-world-research-drawer__title-group">
          <span className="gx-world-research-drawer__eyebrow">RESEARCH</span>
          <h2>{resolvedTitle}</h2>
          {object?.subtitle ? <p>{object.subtitle}</p> : null}
          {resolvedBadges.length ? (
            <div className="gx-world-research-drawer__badges">
              {resolvedBadges.map((badge) => (
                <EpistemicBadge key={`${badge.tone}:${badge.label}`} {...badge} compact />
              ))}
            </div>
          ) : null}
        </div>
        <div className="gx-world-research-drawer__actions">
          {expanded ? (
            <button type="button" className="gx-icon-button" aria-label="Collapse" onClick={onCollapse}>
              −
            </button>
          ) : (
            <button type="button" className="gx-icon-button" aria-label="Expand" onClick={onExpand}>
              ↗
            </button>
          )}
          <button type="button" className="gx-icon-button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
      </header>

      <div className="gx-world-research-drawer__body">{children}</div>
    </aside>
  );
}
