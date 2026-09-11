import type { ReactNode } from 'react';
import { AccountPanel } from './AccountPanel';

/**
 * LOCKED SCREEN — the one sign-in gate shared by every screen that needs an
 * account (Drug Discovery, Campaign, Cloud Projects, …).
 *
 * Before this existed, each of those screens rendered its own heading, its
 * own paragraph and a full-width `<AccountPanel />` at the top of an
 * otherwise empty page — roughly 70% dead space, and four slightly
 * different-looking gates for one identical action. That is both halves of
 * what the redesign brief rejects: huge empty areas, and several screens
 * that look like several different applications.
 *
 * It is a PRESENTATION wrapper only. `AccountPanel` still owns every piece
 * of auth logic and remains the single implementation of sign-in; this adds
 * no second auth path, no second session store, and no new state.
 *
 * The `capabilities` list is what the screen actually unlocks, written by
 * the screen itself. It exists so a locked page still tells the user what
 * is behind the gate instead of being a blank wall — but it is a real
 * description of that screen's features, never a fabricated preview of
 * data the user does not have.
 */
export function LockedScreen({
  icon,
  title,
  lede,
  capabilities,
  note,
  children,
}: {
  icon: string;
  title: string;
  lede: string;
  capabilities: readonly string[];
  note?: ReactNode;
  children?: ReactNode;
}): JSX.Element {
  return (
    <main className="locked-screen" id="main-content" tabIndex={-1}>
      <div className="locked-inner">
        <section className="locked-pitch">
          <span className="locked-icon" aria-hidden="true">{icon}</span>
          <h1 className="locked-title">{title}</h1>
          <p className="locked-lede">{lede}</p>
          <ul className="locked-caps">
            {capabilities.map((capability) => (
              <li key={capability}><span aria-hidden="true">◆</span>{capability}</li>
            ))}
          </ul>
          {note && <p className="locked-note">{note}</p>}
          {children}
        </section>
        <section className="locked-auth" aria-label="Logowanie">
          <AccountPanel />
        </section>
      </div>
    </main>
  );
}

export default LockedScreen;
