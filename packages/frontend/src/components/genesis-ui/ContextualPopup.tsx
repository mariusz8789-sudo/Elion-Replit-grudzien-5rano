import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { ScreenPoint, WorldObject } from './worldFirst.types';
import { EpistemicBadge } from './EpistemicBadge';

export interface ContextualPopupProps {
  readonly object: WorldObject | null;
  readonly anchor: ScreenPoint | null;
  readonly open?: boolean;
  readonly onClose?: () => void;
  readonly onAction?: (actionId: string) => void;
  readonly primaryActionId?: string;
  readonly extra?: ReactNode;
}

/** How far the popup must stay from every viewport edge, in px — matches the CSS's own 16px gutter. */
const EDGE_MARGIN = 16;

/**
 * Genesis smart-UI audit finding (D-133): the candidate popup centred itself on `anchor` and sat
 * ABOVE it unconditionally (`transform: translate(-50%, calc(-100% - 12px))`). An object near the
 * top of frame — the brain on the standing twin, an atom near the rim of a small molecule — pushed
 * the popup off-screen, clipped by the stage's own `overflow: hidden`. This computes a CLAMPED
 * position instead: centred on the anchor when there is room, and flipped below it when there is
 * not, always kept `EDGE_MARGIN` inside the viewport. It measures the popup itself (`useLayoutEffect`
 * + `getBoundingClientRect`) rather than guessing a fixed size, so it stays correct as content
 * (badges, action count) changes the popup's real footprint.
 */
function useClampedPosition(anchor: ScreenPoint | null, open: boolean): { left: number; top: number; ready: boolean; ref: RefObject<HTMLElement | null> } {
  const ref = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; ready: boolean }>({ left: 0, top: 0, ready: false });

  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) { setPos((p) => (p.ready ? { ...p, ready: false } : p)); return; }
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = rect.width || 320;
    const h = rect.height || 160;
    const above = anchor.y - h - 12;
    // Flip below the anchor when there isn't room above; the arrow-less card reads fine either way.
    const top = above >= EDGE_MARGIN ? above : Math.min(anchor.y + 12, vh - h - EDGE_MARGIN);
    const left = Math.min(Math.max(anchor.x - w / 2, EDGE_MARGIN), vw - w - EDGE_MARGIN);
    setPos({ left, top: Math.max(top, EDGE_MARGIN), ready: true });
  }, [anchor, open]);

  return { ...pos, ready: pos.ready, ref };
}

export function ContextualPopup({
  object,
  anchor,
  open = true,
  onClose,
  onAction,
  primaryActionId,
  extra,
}: ContextualPopupProps) {
  const isOpen = Boolean(object && anchor && open);
  const { left, top, ready, ref } = useClampedPosition(anchor, isOpen);

  if (!object || !anchor || !open) return null;

  const actions = object.actions ?? [];
  const primary = primaryActionId
    ? actions.find((action) => action.id === primaryActionId)
    : actions.find((action) => action.kind === 'research') ?? actions[0];

  const secondary = actions.filter((action) => action.id !== primary?.id).slice(0, 4);

  return (
    <section
      ref={ref as never}
      className="gx-contextual-popup"
      style={{ left: `${left}px`, top: `${top}px`, transform: 'none', visibility: ready ? 'visible' : 'hidden' }}
      role="group"
      aria-label={`${object.label} controls`}
      data-testid="gx-contextual-popup"
    >
      <div className="gx-contextual-popup__head">
        <div className="gx-contextual-popup__identity">
          <strong>{object.label}</strong>
          {object.subtitle ? <span>{object.subtitle}</span> : null}
        </div>
        <button
          type="button"
          className="gx-icon-button"
          aria-label="Zamknij"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {object.badges?.length ? (
        <div className="gx-contextual-popup__badges">
          {object.badges.map((badge) => (
            <EpistemicBadge key={`${object.id}:${badge.label}`} {...badge} compact />
          ))}
        </div>
      ) : null}

      {extra ? <div className="gx-contextual-popup__extra">{extra}</div> : null}

      <div className="gx-contextual-popup__actions">
        {secondary.map((action) => (
          <button
            key={action.id}
            type="button"
            className="gx-compact-button"
            disabled={action.disabled}
            onClick={() => onAction?.(action.id)}
          >
            <span>{action.label}</span>
            {action.shortcut ? <kbd>{action.shortcut}</kbd> : null}
          </button>
        ))}
        {primary ? (
          <button
            type="button"
            className="gx-compact-button gx-compact-button--primary"
            disabled={primary.disabled}
            onClick={() => onAction?.(primary.id)}
          >
            {primary.label}
          </button>
        ) : null}
      </div>
    </section>
  );
}
