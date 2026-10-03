import { capabilityDecision, capabilityOverview, profileLabel, type AccountProfile, type Capability } from '../core/accountProfiles';

/**
 * Stan „zablokowane dla Twojego profilu". Pokazywany zamiast obszaru, którego
 * profil konta nie obejmuje (tabela: packages/backend/src/accountProfiles.mjs).
 * Backend egzekwuje to samo — ten ekran mówi o tym zawczasu, prostym językiem,
 * zamiast pozwolić kliknąć i dostać błąd 403.
 */
export function ProfileLockedScreen({ icon, title, profile, capability }: {
  icon: string;
  title: string;
  profile: AccountProfile;
  capability: Capability;
}): JSX.Element {
  const decision = capabilityDecision(profile, capability);
  const open = capabilityOverview(profile).filter((c) => c.allowed);
  return (
    <main className="locked-screen" id="main-content" tabIndex={-1} data-testid="profile-locked">
      <div className="locked-inner profile-lock-inner">
        <section className="locked-pitch">
          <span className="locked-icon" aria-hidden="true">{icon}</span>
          <h1 className="locked-title">{title}</h1>
          <p className="profile-lock-badge"><span aria-hidden="true">🔒</span> Zablokowane dla profilu „{profileLabel(profile)}”</p>
          <p className="locked-lede" data-testid="profile-locked-reason">{decision.reason}</p>
          <p className="locked-note">
            Ten obszar uruchamia ciężkie obliczenia naukowe. Dla Twojego profilu otwarte są:{' '}
            {open.map((c) => c.label).join(', ')}.
          </p>
          <div className="profile-lock-actions">
            <a className="chip-btn primary" href="#/human-biology-lab">Otwórz Human Explorer</a>
            <a className="chip-btn" href="#/konto">Twoje konto</a>
          </div>
        </section>
      </div>
    </main>
  );
}

export default ProfileLockedScreen;
