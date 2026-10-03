import { LABORATORY_MODES, type LaboratoryModeId } from '../core/laboratoryModes';

export function LaboratoryModeBar({ active, variant = 'bar' }: { readonly active: LaboratoryModeId; readonly variant?: 'bar' | 'select' }): JSX.Element {
  if (variant === 'select') {
    return (
      <label className="lab-mode-select">
        <span className="lab-mode-select-label">Laboratorium</span>
        <select data-testid="lab-mode-select" value={active} onChange={(event) => {
          const next = LABORATORY_MODES.find((mode) => mode.id === event.target.value);
          if (next) window.location.hash = next.hash;
        }}>
          {LABORATORY_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
        </select>
      </label>
    );
  }
  return (
    <nav className="lab-mode-bar" aria-label="Tryby Laboratorium Genesis" data-testid="lab-mode-bar">
      {LABORATORY_MODES.map((mode) => (
        <a key={mode.id} href={mode.hash} className={`lab-mode-link${mode.id === active ? ' is-active' : ''}`} aria-current={mode.id === active ? 'page' : undefined}>{mode.label}</a>
      ))}
    </nav>
  );
}
