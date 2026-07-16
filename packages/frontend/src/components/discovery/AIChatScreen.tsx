/**
 * AIChatScreen (V6 flagship) — the AI Discovery Workspace. Conversation history +
 * pinned chats (localStorage), markdown/table/code rendering, prompt suggestions,
 * a provenance panel, follow-up actions, and a future-ready model selector.
 *
 * HONESTY: answers only ever come from a real backend `/api/ask` response. With no
 * model key configured the workspace shows a persistent "Asystent AI niedostępny"
 * state and records unavailable turns — it NEVER fabricates AI output.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { DiscoveryShell, Panel, StatusPill } from './DiscoveryShell';
import { Markdown } from './Markdown';
import { Icon } from '../Icon';
import {
  type Conversation, type ChatMessage, loadConversations, saveConversations, createConversation,
  sortConversations, deriveTitle, askDiscovery, newId, PROMPT_SUGGESTIONS,
} from '../../core/aiChat';

const MODELS = [
  { id: 'auto', label: 'Auto (serwer)', available: true },
  { id: 'opus', label: 'Claude Opus 4.8', available: false },
  { id: 'sonnet', label: 'Claude Sonnet 5', available: false },
];

export function AIChatScreen() {
  const [convs, setConvs] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(() => loadConversations()[0]?.id ?? null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [aiStatus, setAiStatus] = useState<'unknown' | 'ready' | 'unavailable'>('unknown');
  const threadRef = useRef<HTMLDivElement>(null);

  const persist = (next: Conversation[]) => { setConvs(next); saveConversations(next); };
  const ordered = useMemo(() => sortConversations(convs), [convs]);
  const active = convs.find((c) => c.id === activeId) ?? null;

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }); }, [active?.messages.length, sending]);

  const startNew = () => { const c = createConversation(); persist([c, ...convs]); setActiveId(c.id); };
  const removeConv = (id: string) => { const next = convs.filter((c) => c.id !== id); persist(next); if (activeId === id) setActiveId(next[0]?.id ?? null); };
  const togglePin = (id: string) => persist(convs.map((c) => c.id === id ? { ...c, pinned: !c.pinned } : c));

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || sending) return;
    let conv = active;
    let list = convs;
    if (!conv) { conv = createConversation(); list = [conv, ...convs]; setActiveId(conv.id); }
    const userMsg: ChatMessage = { id: newId('m'), role: 'user', content: q, at: Date.now() };
    const withUser = list.map((c) => c.id === conv!.id ? { ...c, title: c.messages.length === 0 ? deriveTitle(q) : c.title, messages: [...c.messages, userMsg], updatedAt: Date.now() } : c);
    persist(withUser); setInput(''); setSending(true);

    const reply = await askDiscovery(q);
    const asstMsg: ChatMessage = reply.ok
      ? { id: newId('m'), role: 'assistant', content: reply.answer, at: Date.now(), status: 'ok', provenance: 'Odpowiedź modelu ugruntowana na bazie wiedzy Genesis (backend /api/ask).' }
      : { id: newId('m'), role: 'assistant', content: reply.message, at: Date.now(), status: reply.kind === 'unavailable' ? 'unavailable' : 'error' };
    setAiStatus(reply.ok ? 'ready' : (reply.kind === 'unavailable' ? 'unavailable' : 'unknown'));
    // `withUser` is the freshest state (single-threaded; no mutation happened during await).
    persist(withUser.map((c) => c.id === conv!.id ? { ...c, messages: [...c.messages, asstMsg], updatedAt: Date.now() } : c));
    setSending(false);
  };

  const lastAssistant = active?.messages.slice().reverse().find((m) => m.role === 'assistant');

  return (
    <DiscoveryShell active="#/ai-chat" title="AI Discovery Chat" subtitle="Asystent naukowy ugruntowany na bazie wiedzy Genesis — nigdy nie zmyśla"
      actions={aiStatus === 'unavailable'
        ? <StatusPill kind="blocked">Asystent AI niedostępny</StatusPill>
        : <StatusPill kind="info">grounded · honest</StatusPill>}>
      <div className="chat-layout">
        {/* History rail */}
        <aside className="chat-rail">
          <button className="ds-btn ds-btn-primary chat-new" onClick={startNew}><Icon name="spark" size={15} /> Nowa rozmowa</button>
          <div className="chat-list">
            {ordered.length === 0 ? <p className="ds-note" style={{ padding: '0.5rem' }}>Brak rozmów. Rozpocznij nową.</p> : null}
            {ordered.map((c) => (
              <div key={c.id} className={`chat-item${c.id === activeId ? ' active' : ''}`}>
                <button className="chat-item-main" onClick={() => setActiveId(c.id)}>
                  <Icon name={c.pinned ? 'spark' : 'book'} size={14} />
                  <span className="chat-item-title">{c.title}</span>
                </button>
                <button className="chat-item-act" title={c.pinned ? 'Odepnij' : 'Przypnij'} onClick={() => togglePin(c.id)}><Icon name={c.pinned ? 'check' : 'target'} size={13} /></button>
                <button className="chat-item-act" title="Usuń" onClick={() => removeConv(c.id)}><Icon name="block" size={13} /></button>
              </div>
            ))}
          </div>
          <div className="chat-model">
            <label className="ds-note">Model (future-ready)</label>
            <select defaultValue="auto">
              {MODELS.map((m) => <option key={m.id} value={m.id} disabled={!m.available}>{m.label}{m.available ? '' : ' — wkrótce'}</option>)}
            </select>
          </div>
        </aside>

        {/* Thread */}
        <div className="chat-main">
          <div className="chat-thread" ref={threadRef}>
            {!active || active.messages.length === 0 ? (
              <div className="chat-welcome">
                <span className="chat-welcome-icon"><Icon name="brain" size={30} /></span>
                <h3>Asystent Genesis Discovery</h3>
                <p className="ds-note">Zadaj pytanie o pipeline odkrywczy, ADMET, dokowanie, Truth Engine lub prowieniencję. Odpowiedzi są ugruntowane na realnej bazie wiedzy — a gdy model nie jest skonfigurowany, powiemy to wprost.</p>
                <div className="chat-suggest">
                  {PROMPT_SUGGESTIONS.map((s) => <button key={s} className="ds-chip" onClick={() => send(s)}>{s}</button>)}
                </div>
              </div>
            ) : active.messages.map((m) => (
              <div key={m.id} className={`chat-msg chat-msg-${m.role}`}>
                <span className="chat-avatar">{m.role === 'user' ? <Icon name="target" size={16} /> : <Icon name="brain" size={16} />}</span>
                <div className="chat-bubble">
                  {m.role === 'assistant' && m.status === 'unavailable' ? (
                    <div className="chat-unavailable"><Icon name="block" size={16} /><div><strong>Asystent AI niedostępny</strong><p className="ds-note">{m.content}</p></div></div>
                  ) : m.role === 'assistant' ? <Markdown source={m.content} /> : <p className="md-p">{m.content}</p>}
                </div>
              </div>
            ))}
            {sending ? <div className="chat-msg chat-msg-assistant"><span className="chat-avatar"><Icon name="brain" size={16} /></span><div className="chat-bubble"><span className="chat-typing"><i /><i /><i /></span></div></div> : null}
          </div>

          {/* Follow-ups + provenance */}
          {lastAssistant && lastAssistant.status === 'ok' ? (
            <div className="chat-followups">
              {['Rozwiń', 'Podaj źródła', 'Uprość'].map((f) => <button key={f} className="ds-chip" onClick={() => send(`${f}: ${active?.title}`)}>{f}</button>)}
            </div>
          ) : null}

          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Zapytaj o naukę Genesis…" rows={1}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
            <button type="submit" className="ds-btn ds-btn-primary" disabled={sending || !input.trim()}><Icon name="spark" size={16} /></button>
          </form>
        </div>

        {/* Provenance panel */}
        <aside className="chat-prov">
          <Panel title="Panel prowieniencji" icon="shield">
            {lastAssistant?.provenance ? (
              <><p className="ds-para">{lastAssistant.provenance}</p><StatusPill kind="ok">grounded</StatusPill></>
            ) : (
              <p className="ds-note">Prowieniencja pojawi się po pierwszej odpowiedzi asystenta. Genesis nigdy nie podaje odpowiedzi bez źródła — a gdy model jest niedostępny, mówi to wprost.</p>
            )}
            <hr className="chat-hr" />
            <h5 className="ds-sub-h">Kontrakt uczciwości</h5>
            <ul className="ds-ul">
              <li>Brak klucza modelu → jawny status „niedostępny".</li>
              <li>Odpowiedzi ugruntowane na bazie wiedzy Genesis.</li>
              <li>Żadne wyniki naukowe nie są zmyślane.</li>
            </ul>
          </Panel>
        </aside>
      </div>
    </DiscoveryShell>
  );
}
