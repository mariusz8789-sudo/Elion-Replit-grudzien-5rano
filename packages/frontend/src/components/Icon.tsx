/**
 * Icon — a small, dependency-free inline-SVG icon set (V5 design system).
 *
 * Why hand-rolled: the app ships fully offline (PWA) with a strict no-CDN
 * policy, so an external icon font/library is out. These are original 24×24
 * stroke paths (1.6px), inheriting `currentColor` so they tint from the
 * surrounding text colour like real icon systems (SF Symbols / Lucide style).
 * Tree-shaken: only imported names land in the bundle.
 */
import type { CSSProperties } from 'react';

export type IconName =
  | 'settings' | 'flask' | 'dna' | 'atom' | 'molecule' | 'graph' | 'cpu' | 'chart'
  | 'shield' | 'book' | 'rocket' | 'brain' | 'users' | 'lock' | 'back' | 'search'
  | 'memory' | 'briefcase' | 'clock' | 'target' | 'check' | 'alert' | 'block' | 'spark' | 'upload';

/** Path/child markup per icon, drawn inside a shared 24×24 stroke frame. */
const PATHS: Record<IconName, JSX.Element> = {
  settings: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" /></>,
  flask: <><path d="M9 3h6M10 3v6.2L5.2 18a2 2 0 0 0 1.8 3h10a2 2 0 0 0 1.8-3L14 9.2V3" /><path d="M7.5 15h9" /></>,
  dna: <><path d="M6 3c0 6 12 6 12 12M18 3c0 6-12 6-12 12M6 21c0-2 12-2 12 0M6 3c0-2 12-2 12 0M7.5 6.5h9M8.5 9h7M8.5 15h7M7.5 17.5h9" /></>,
  atom: <><circle cx="12" cy="12" r="1.6" /><ellipse cx="12" cy="12" rx="10" ry="4.4" /><ellipse cx="12" cy="12" rx="10" ry="4.4" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="10" ry="4.4" transform="rotate(120 12 12)" /></>,
  molecule: <><circle cx="6" cy="7" r="2.4" /><circle cx="18" cy="8" r="2.4" /><circle cx="12" cy="17" r="2.4" /><path d="M7.9 8.6l2.4 6.6M16.4 9.6l-3 5.6M8.2 6.4l7.6 1" /></>,
  graph: <><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="7" r="2.2" /><circle cx="7" cy="18" r="2.2" /><circle cx="17" cy="17" r="2.2" /><path d="M8 6.6l8 .4M7.2 8l-.4 8M8.1 17.2l7-.4M16.6 9l-8.4 7" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9.5" y="9.5" width="5" height="5" rx="1" /><path d="M9 3v2.5M15 3v2.5M9 18.5V21M15 18.5V21M3 9h2.5M18.5 9H21M3 15h2.5M18.5 15H21" /></>,
  chart: <><path d="M4 4v16h16" /><path d="M7.5 15l3-4 3 2.5 4-6.5" /></>,
  shield: <><path d="M12 2.6l7 2.8v5.4c0 4.6-3 8.2-7 10.6-4-2.4-7-6-7-10.6V5.4z" /><path d="M9 12l2 2 4-4" /></>,
  book: <><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" /><path d="M5 19.5A1.5 1.5 0 0 1 6.5 18H19v3H6.5A1.5 1.5 0 0 1 5 19.5z" /></>,
  rocket: <><path d="M12 3c3.5 2 5 5.5 5 9l-2.5 2.5h-5L7 12c0-3.5 1.5-7 5-9z" /><circle cx="12" cy="9.5" r="1.6" /><path d="M9.5 14.5L7 18M14.5 14.5L17 18M10 17.5c-1 1.5-1 3.5-1 3.5s2 0 3.5-1" /></>,
  brain: <><path d="M9.5 4A2.5 2.5 0 0 0 7 6.5 2.5 2.5 0 0 0 5 9a2.5 2.5 0 0 0 .6 1.6A2.6 2.6 0 0 0 5 12.5 2.5 2.5 0 0 0 7.2 15c.1 1.6 1.3 2.6 2.8 2.6.9 0 1.5-.3 1.5-1V5c0-.7-.9-1-2-1z" /><path d="M14.5 4A2.5 2.5 0 0 1 17 6.5 2.5 2.5 0 0 1 19 9a2.5 2.5 0 0 1-.6 1.6A2.6 2.6 0 0 1 19 12.5 2.5 2.5 0 0 1 16.8 15c-.1 1.6-1.3 2.6-2.8 2.6-.9 0-1.5-.3-1.5-1V5c0-.7.9-1 2-1z" /></>,
  users: <><circle cx="9" cy="8" r="2.8" /><path d="M4 19a5 5 0 0 1 10 0" /><path d="M15 5.4a2.8 2.8 0 0 1 0 5.2M17 19a5 5 0 0 0-3-4.6" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /><circle cx="12" cy="15" r="1.2" /></>,
  back: <><path d="M15 5l-7 7 7 7" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></>,
  memory: <><rect x="4" y="7" width="16" height="10" rx="2" /><path d="M8 7V4M12 7V4M16 7V4M8 20v-3M12 20v-3M16 20v-3M8.5 11h7M8.5 13.5h7" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3 12h18" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.8" /></>,
  check: <><path d="M4.5 12.5l5 5 10-11" /></>,
  alert: <><path d="M12 3.5L21 19H3z" /><path d="M12 9.5v4M12 16.2v.2" /></>,
  block: <><circle cx="12" cy="12" r="8.5" /><path d="M6.5 6.5l11 11" /></>,
  spark: <><path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z" /></>,
  upload: <><path d="M12 16V4M8 8l4-4 4 4" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>,
};

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function Icon({ name, size = 20, strokeWidth = 1.6, className, style, title }: IconProps) {
  const child = PATHS[name];
  if (!child) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {child}
    </svg>
  );
}
