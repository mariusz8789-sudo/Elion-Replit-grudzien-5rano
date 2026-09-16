import type { GuideAction } from '../../core/guide/narrationModel';
import { playAchievement, playNarratorEvent, playSimStart } from '../../core/sound';

/**
 * VOICE → ACTION → VISUAL (D-119): the DOM side of a beat. Every action only
 * highlights, scrolls, types an example or opens gates whose `held` state the
 * run already recorded (the CSS class reads the existing `gu-gated-held`
 * marker; a failed gate is never animated open). Nothing here changes state
 * of the science; typing the example dispatches a real input event so React
 * sees it exactly as a person's keystrokes.
 */

const SPOTLIGHT = 'guide-spotlight';
let spotlit: Element | null = null;

export function clearSpotlight(): void {
  if (spotlit !== null) { spotlit.classList.remove(SPOTLIGHT); spotlit = null; }
  for (const el of document.querySelectorAll(`.${SPOTLIGHT}`)) el.classList.remove(SPOTLIGHT);
}

function spotlight(selector: string): Element | null {
  clearSpotlight();
  const el = document.querySelector(selector);
  if (el === null) return null;
  el.classList.add(SPOTLIGHT);
  spotlit = el;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  return el;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Sets a React-controlled input/textarea value the way a person's typing would. */
export function setReactValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter !== undefined) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

let typing: number | null = null;

/** Types the example character by character (animated caret), then leaves the field focused for the person to edit. */
export function typeExample(selector: string, text: string, onDone?: () => void): void {
  const el = spotlight(selector);
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) { onDone?.(); return; }
  if (typing !== null) window.clearInterval(typing);
  el.focus();
  el.classList.add('guide-typing');
  if (prefersReducedMotion()) { setReactValue(el, text); el.classList.remove('guide-typing'); onDone?.(); return; }
  let i = 0;
  setReactValue(el, '');
  typing = window.setInterval(() => {
    i += 3;
    setReactValue(el, text.slice(0, i));
    if (i >= text.length) { if (typing !== null) window.clearInterval(typing); typing = null; el.classList.remove('guide-typing'); onDone?.(); }
  }, 18);
}

/** Opens, one after another, only the gates the run recorded as HELD; a failed gate stays shut. Returns how many opened. */
export function openGates(): number {
  const gates = [...document.querySelectorAll('.gu-gated-gate')];
  let opened = 0;
  gates.forEach((g, i) => {
    g.classList.remove('guide-gate-open', 'guide-gate-shut');
    const held = g.classList.contains('gu-gated-held');
    window.setTimeout(() => {
      g.classList.add(held ? 'guide-gate-open' : 'guide-gate-shut');
      if (held) playSimStart();
    }, 350 + i * 900);
    if (held) opened++;
  });
  const end = document.querySelector('.gu-gated-end');
  if (end !== null) window.setTimeout(() => { end.classList.add('guide-gate-end'); if (opened === gates.length && gates.length > 0) playAchievement(); }, 350 + gates.length * 900);
  spotlight('[data-testid="winner-gate-diagram"]');
  return opened;
}

export function performGuideAction(action: GuideAction, opts: { readonly onTyped?: () => void } = {}): void {
  switch (action.kind) {
    case 'none': clearSpotlight(); return;
    case 'spotlight': spotlight(action.selector); return;
    case 'scroll': spotlight(action.selector); return;
    case 'type-example': typeExample(action.selector, action.text, opts.onTyped); return;
    case 'open-gates': openGates(); return;
    case 'navigate': window.location.hash = action.hash; return;
    default: return;
  }
}

export function playBeatSound(kind: 'stage' | 'gate' | 'winner' | 'none'): void {
  if (kind === 'stage') playNarratorEvent();
  else if (kind === 'winner') playAchievement();
  // 'gate' sounds are played per gate by openGates(); 'none' is silent.
}
