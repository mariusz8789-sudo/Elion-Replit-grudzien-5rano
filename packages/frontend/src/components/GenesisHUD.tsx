import { FormEvent, useState } from 'react';
import { useVoiceEngine } from '../core/guide/guideRuntime';

export function GenesisHUD({ routeLabel = 'GENESIS COMMAND CENTER', onPrompt }: { routeLabel?: string; onPrompt: (prompt: string) => void }): JSX.Element {
  const voice = useVoiceEngine();
  const [query, setQuery] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const prompt = query.trim();
    if (!prompt) return;
    onPrompt(prompt);
    setQuery('');
    voice.speak({ key: 'generative-command', lang: 'pl', text: `Generuję wizualizację dla polecenia: ${prompt}.` });
  };
  return (
    <form className="genesis-command-bar" onSubmit={submit} aria-label="AI text to simulation command prompt">
      <span className="genesis-command-mark" aria-hidden="true">⌁</span>
      <span className="genesis-route-label">{routeLabel}</span>
      <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Describe a simulation…" aria-label="Describe a simulation" />
      <span className="genesis-command-hint">ENTER ↵</span>
    </form>
  );
}
