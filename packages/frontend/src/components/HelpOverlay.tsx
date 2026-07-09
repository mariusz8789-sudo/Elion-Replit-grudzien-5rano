import { useRef } from 'react';
import { ShortcutsList } from './SettingsScreen';
import { useFocusTrap } from '../core/useFocusTrap';

/** Nakładka pomocy: pełna lista skrótów klawiszowych, wywoływana klawiszem „?". */
export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);

  return (
    <div className="overlay-backdrop" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Skróty klawiszowe"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>Skróty klawiszowe</h2>
        <ShortcutsList />
        <button className="chip-btn" onClick={onClose} autoFocus>Zamknij</button>
      </div>
    </div>
  );
}
