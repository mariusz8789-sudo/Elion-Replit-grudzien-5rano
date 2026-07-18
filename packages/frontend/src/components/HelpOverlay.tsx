import { useRef } from 'react';
import { ShortcutsList } from './SettingsScreen';
import { useFocusTrap } from '../core/useFocusTrap';
import { useI18n } from '../core/i18n';

/** Nakładka pomocy: pełna lista skrótów klawiszowych, wywoływana klawiszem „?". */
export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);

  return (
    <div className="overlay-backdrop" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="overlay-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('ovl.help.title')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>{t('ovl.help.title')}</h2>
        <ShortcutsList />
        <button className="chip-btn" onClick={onClose} autoFocus>{t('ovl.close')}</button>
      </div>
    </div>
  );
}
