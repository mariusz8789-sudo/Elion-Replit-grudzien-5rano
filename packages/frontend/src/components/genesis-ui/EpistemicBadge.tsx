import type { ReactNode } from 'react';
import type { EpistemicTone, WorldEpistemicBadge } from './worldFirst.types';

const toneClass: Record<EpistemicTone, string> = {
  real: 'gx-world-badge--real',
  dataset: 'gx-world-badge--dataset',
  model: 'gx-world-badge--model',
  schematic: 'gx-world-badge--schematic',
  simulated: 'gx-world-badge--simulated',
  reconstructed: 'gx-world-badge--reconstructed',
  hypothesis: 'gx-world-badge--hypothesis',
  unknown: 'gx-world-badge--unknown',
  blocked: 'gx-world-badge--blocked',
};

export interface EpistemicBadgeProps extends WorldEpistemicBadge {
  readonly compact?: boolean;
  readonly icon?: ReactNode;
  readonly className?: string;
}

export function EpistemicBadge({
  label,
  tone,
  detail,
  compact = false,
  icon,
  className = '',
}: EpistemicBadgeProps) {
  const classes = [
    'gx-world-badge',
    toneClass[tone],
    compact ? 'gx-world-badge--compact' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} title={detail ?? label} data-epistemic={tone}>
      {icon ? <span className="gx-world-badge__icon" aria-hidden="true">{icon}</span> : null}
      <span className="gx-world-badge__label">{label}</span>
    </span>
  );
}
