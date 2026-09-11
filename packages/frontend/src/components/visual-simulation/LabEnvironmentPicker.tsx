import {
  environmentFidelityFloor,
  getLabEnvironment,
  LAB_ENVIRONMENT_IDS,
  type LabEnvironment,
  type LabEnvironmentStatus,
} from '../../core/agent/particleAtomicLabEnvironments';
import { getReactionChannel } from '../../core/worldModel/domains/particlePhysics';

/**
 * PARTICLE & ATOMIC PHYSICS LABORATORY — the environments, shown to a user.
 *
 * `particleAtomicLabEnvironments.ts` has been the honest answer to "how do you
 * move from a CERN/LHC-like setting to a Collider, Nuclear, Atomic, Plasma or
 * Custom lab without growing a second engine" — an environment is a NAME FOR A
 * CONFIGURATION, pointing at a lever catalogue that already exists. Until now
 * that table had no surface: only a test read it. This is that surface, and it
 * is deliberately small.
 *
 * Three rules it follows, and they are the whole design:
 *
 *  1. **A NOT_BUILT environment is never offered as a laboratory.** It is
 *     listed, below a separate heading, with the reason it does not exist and
 *     no way to enter it. Listing it keeps the roadmap visible; separating it
 *     keeps the list from being a brochure.
 *  2. **Entering an environment is not a new mechanism.** The button switches
 *     the catalogue the EXISTING Discovery panel is pointed at — the same
 *     `<select id="wd-catalog">` a user could have used by hand. No second
 *     loop, no second state machine, no second screen.
 *  3. **Each row states its own fidelity floor**, computed from its channels as
 *     the WEAKEST of them, so one exact channel cannot speak for a simplified
 *     one sitting beside it.
 */

const STATUS_LABEL: Record<LabEnvironmentStatus, string> = {
  RUNNABLE: 'RUNNABLE',
  CHANNELS_ONLY: 'CHANNELS ONLY',
  NOT_BUILT: 'NOT BUILT',
};

const STATUS_MEANING: Record<LabEnvironmentStatus, string> = {
  RUNNABLE: 'A real lever catalogue is wired, so the Discovery Loop can run a real search here and write a real Evidence Bundle.',
  CHANNELS_ONLY: 'The reaction channels are real, executable and tested, but no apparatus is wired — a final state can be computed, an experiment cannot be run.',
  NOT_BUILT: 'Reserved and empty. Nothing behind this name exists yet.',
};

export interface LabEnvironmentPickerProps {
  /** The catalogue the Discovery panel is currently pointed at. */
  catalogId: string;
  /** Points the EXISTING panel at another catalogue. Never starts a run itself. */
  onSelectCatalog: (catalogId: string) => void;
  disabled?: boolean;
}

/** Every catalogue any environment can run — used to decide whether to show this at all. */
export function labEnvironmentCatalogIds(): readonly string[] {
  const ids = LAB_ENVIRONMENT_IDS.map((id) => getLabEnvironment(id).discoveryCatalogId).filter(
    (id): id is string => id !== null,
  );
  return [...new Set(ids)];
}

/** True when the panel is sitting on a world that belongs to this laboratory. */
export function isLabEnvironmentCatalog(catalogId: string): boolean {
  return labEnvironmentCatalogIds().includes(catalogId);
}

function channelSummary(env: LabEnvironment): string {
  const names = env.channelIds
    .map((id) => getReactionChannel(id)?.name)
    .filter((n): n is string => Boolean(n));
  return names.length === 0 ? 'No channels' : names.join(' · ');
}

export function LabEnvironmentPicker({ catalogId, onSelectCatalog, disabled = false }: LabEnvironmentPickerProps) {
  if (!isLabEnvironmentCatalog(catalogId)) return null;

  const all = LAB_ENVIRONMENT_IDS.map(getLabEnvironment);
  const offered = all.filter((e) => e.status !== 'NOT_BUILT');
  const unavailable = all.filter((e) => e.status === 'NOT_BUILT');

  return (
    <section className="wd-section lab-env" data-testid="lab-environments">
      <h4>Particle &amp; Atomic Physics Laboratory</h4>
      <p className="gsc-caption">
        Virtual CERN is one environment here, not the boundary. An environment is a set of reaction
        channels plus the apparatus a search runs on — switching one points the panel above at
        another world, it does not start a second engine.
      </p>

      <ul className="lab-env-list">
        {offered.map((env) => {
          const floor = environmentFidelityFloor(env.environmentId);
          const active = env.discoveryCatalogId !== null && env.discoveryCatalogId === catalogId;
          return (
            <li
              key={env.environmentId}
              className={`lab-env-item lab-env-${env.status}${active ? ' lab-env-active' : ''}`}
              data-testid={`lab-env-${env.environmentId}`}
            >
              <div className="lab-env-head">
                <span className="lab-env-name">{env.label}</span>
                <span className={`gx-matrix-badge lab-env-status lab-env-status-${env.status}`}>
                  {STATUS_LABEL[env.status]}
                </span>
              </div>
              <p className="gsc-caption lab-env-meaning">{STATUS_MEANING[env.status]}</p>
              <p className="gsc-caption lab-env-note">{env.epistemicNote}</p>
              <p className="gsc-caption lab-env-channels">
                Channels: {channelSummary(env)}
                {floor !== null && <> · fidelity floor <code>{floor}</code></>}
              </p>
              {env.status === 'RUNNABLE' && env.discoveryCatalogId !== null && (
                <button
                  type="button"
                  className="chip-btn"
                  disabled={disabled || active}
                  onClick={() => onSelectCatalog(env.discoveryCatalogId!)}
                  data-testid={`lab-env-enter-${env.environmentId}`}
                >
                  {active ? 'Loaded — this world is selected above' : 'Enter this environment →'}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {unavailable.length > 0 && (
        <div className="lab-env-unavailable" data-testid="lab-environments-unavailable">
          <h5>Not available</h5>
          <p className="gsc-caption">
            Named so the roadmap is visible, and listed here rather than above so nothing implies they
            can be entered. There is no way in, because there is nothing behind them.
          </p>
          <ul className="lab-env-list">
            {unavailable.map((env) => (
              <li
                key={env.environmentId}
                className={`lab-env-item lab-env-${env.status}`}
                data-testid={`lab-env-${env.environmentId}`}
              >
                <div className="lab-env-head">
                  <span className="lab-env-name">{env.label}</span>
                  <span className={`gx-matrix-badge lab-env-status lab-env-status-${env.status}`}>
                    {STATUS_LABEL[env.status]}
                  </span>
                </div>
                <p className="gsc-caption lab-env-note">{env.epistemicNote}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
