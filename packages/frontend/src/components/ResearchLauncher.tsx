import { useState } from 'react';
import { epistemicBadge, resolvedResearchTopics, type ResolvedLaunch } from '../core/researchLauncher';

/**
 * RESEARCH LAUNCHER — the empty state of the one Science Chat. Five research
 * topics; opening one shows its runnable actions, each of which either opens an
 * existing screen or sends an existing command to this same chat. Genesis has
 * no generative model here, so nothing on it promises an AI answer.
 */
export function ResearchLauncher({ onNavigate, onCommand }: {
  onNavigate: (hash: string) => void;
  onCommand: (command: string) => void;
}): JSX.Element {
  const topics = resolvedResearchTopics();
  const [openId, setOpenId] = useState<string | null>(null);
  const run = (action: ResolvedLaunch): void => {
    if (action.chatCommand) onCommand(action.chatCommand);
    else if (action.hash) onNavigate(action.hash);
  };
  return (
    <section className="research-launcher" aria-label="Research Launcher">
      <h2>What do you want to do?</h2>
      <p>Choose a research task. Genesis routes it to a real model, engine or verified screen.</p>
      <ul className="rl-topics">
        {topics.map(({ topic, actions }) => {
          const open = openId === topic.id;
          return (
            <li key={topic.id} className={`rl-topic${open ? ' is-open' : ''}`}>
              <button type="button" className="rl-topic-head" aria-expanded={open} onClick={() => setOpenId(open ? null : topic.id)}>
                <span aria-hidden="true">{topic.icon}</span>
                <strong>{topic.label}</strong>
                <span className="rl-chevron" aria-hidden="true">{open ? '−' : '+'}</span>
              </button>
              {open && (
                <div className="rl-actions">
                  {actions.map((action) => {
                    const badge = epistemicBadge(action.epistemicLabel);
                    return (
                      <button key={action.label} type="button" className="rl-action" onClick={() => run(action)}>
                        <span>{action.label}</span>
                        {badge && <small>{badge}{action.readiness === 'PARTIAL' ? ' · PARTIAL' : ''}</small>}
                        <span aria-hidden="true">→</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
