import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type {
  ScreenPoint,
  WorldDefinition,
  WorldObject,
  WorldToolbarItem,
} from './worldFirst.types';
import { ContextualPopup } from './ContextualPopup';
import { ResearchDrawer } from './ResearchDrawer';
import { EpistemicBadge } from './EpistemicBadge';

export interface WorldViewShellProps {
  readonly world: WorldDefinition;
  readonly children: ReactNode;
  readonly selectedObject?: WorldObject | null;
  readonly selectedAnchor?: ScreenPoint | null;
  readonly onClearSelection?: () => void;
  readonly onObjectAction?: (object: WorldObject, actionId: string) => void;
  readonly researchContent?: ReactNode | ((object: WorldObject | null) => ReactNode);
  readonly topToolbar?: readonly WorldToolbarItem[];
  readonly initialDrawerOpen?: boolean;
  readonly className?: string;
  readonly renderWorldStatus?: ReactNode;
}

function focusableToolbar(items: readonly WorldToolbarItem[]): WorldToolbarItem[] {
  return items.filter((item) => !item.disabled && item.onActivate);
}

export function WorldViewShell({
  world,
  children,
  selectedObject = null,
  selectedAnchor = null,
  onClearSelection,
  onObjectAction,
  researchContent,
  topToolbar,
  initialDrawerOpen = false,
  className = '',
  renderWorldStatus,
}: WorldViewShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(initialDrawerOpen);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setDrawerOpen(Boolean(initialDrawerOpen && selectedObject));
  }, [initialDrawerOpen, selectedObject?.id]);

  useEffect(() => {
    if (!selectedObject) {
      setDrawerOpen(false);
      setExpanded(false);
    }
  }, [selectedObject]);

  const toolbar = useMemo(
    () => topToolbar ?? world.globalToolbar ?? [],
    [topToolbar, world.globalToolbar],
  );

  const onContextAction = useCallback((actionId: string) => {
    if (!selectedObject) return;
    if (actionId === 'research' || selectedObject.actions?.find((a) => a.id === actionId)?.kind === 'research') {
      setDrawerOpen(true);
      setExpanded(false);
    }
    onObjectAction?.(selectedObject, actionId);
  }, [onObjectAction, selectedObject]);

  const closeAll = useCallback(() => {
    setDrawerOpen(false);
    setExpanded(false);
    onClearSelection?.();
  }, [onClearSelection]);

  const onShellKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (expanded) {
        setExpanded(false);
        return;
      }
      if (drawerOpen) {
        closeAll();
        return;
      }
      if (selectedObject) {
        onClearSelection?.();
      }
    }
  }, [closeAll, drawerOpen, expanded, onClearSelection, selectedObject]);

  const researchNode = typeof researchContent === 'function'
    ? researchContent(selectedObject)
    : researchContent;

  const minimalToolbar = focusableToolbar(toolbar);

  return (
    <div
      className={[
        'gx-world-first-shell',
        drawerOpen ? 'gx-world-first-shell--drawer-open' : '',
        expanded ? 'gx-world-first-shell--research-expanded' : '',
        className,
      ].filter(Boolean).join(' ')}
      onKeyDown={onShellKeyDown}
      data-world-id={world.identity.id}
      data-state={drawerOpen ? 'research' : 'world'}
    >
      <main className="gx-world-first-shell__stage">
        <div className="gx-world-first-shell__scene">{children}</div>

        <div className="gx-world-first-shell__identity" aria-label="World identity">
          {world.identity.glyph ? (
            <span className="gx-world-first-shell__glyph" aria-hidden="true">
              {world.identity.glyph}
            </span>
          ) : null}
          <div>
            {world.identity.domain ? (
              <span className="gx-world-first-shell__domain">{world.identity.domain}</span>
            ) : null}
            <strong>{world.identity.title}</strong>
          </div>
        </div>

        <div className="gx-world-first-shell__status">
          {world.defaultBadge ? <EpistemicBadge {...world.defaultBadge} compact /> : null}
          {renderWorldStatus}
        </div>

        <nav className="gx-world-first-shell__toolbar" aria-label="World tools">
          {minimalToolbar.map((item) => (
            <button
              type="button"
              key={item.id}
              className="gx-world-first-shell__toolbar-button"
              aria-label={item.ariaLabel ?? item.label}
              title={item.label}
              onClick={item.onActivate}
            >
              {item.icon ?? <span aria-hidden="true">•</span>}
              <span className="gx-world-first-shell__toolbar-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="gx-world-first-shell__selected-object" aria-live="polite">
          {selectedObject && !drawerOpen ? (
            <span>
              <strong>{selectedObject.label}</strong>
              {selectedObject.subtitle ? ` — ${selectedObject.subtitle}` : ''}
            </span>
          ) : null}
        </div>

        <ContextualPopup
          object={selectedObject}
          anchor={selectedAnchor}
          open={Boolean(selectedObject && selectedAnchor && !drawerOpen)}
          onClose={onClearSelection}
          onAction={onContextAction}
        />
      </main>

      <ResearchDrawer
        open={drawerOpen && Boolean(selectedObject)}
        object={selectedObject}
        expanded={expanded}
        onExpand={() => setExpanded(true)}
        onCollapse={() => setExpanded(false)}
        onClose={closeAll}
      >
        {researchNode ?? (
          <div className="gx-world-research-empty">
            <p>No research view supplied for this object yet.</p>
          </div>
        )}
      </ResearchDrawer>
    </div>
  );
}
