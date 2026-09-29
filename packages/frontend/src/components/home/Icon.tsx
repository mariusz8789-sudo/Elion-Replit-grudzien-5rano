import type React from 'react';

/** Line icons of the command centre (24×24, stroke = currentColor). */
const PATHS = {
  pill: <><rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-35 12 12)" /><path d="M9.5 8.5l5 7" /></>,
  body: <><circle cx="12" cy="4.5" r="2" /><path d="M12 7v7M7 9.5h10M12 14l-3.5 7M12 14l3.5 7" /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  replay: <><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /><path d="M10 9.5l5 2.5-5 2.5z" /></>,
  flask: <><path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7.5 15h9" /></>,
  atom: <><circle cx="12" cy="12" r="1.6" /><ellipse cx="12" cy="12" rx="9" ry="3.6" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" /></>,
  console: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M12 15h5" /></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>,
  hash: <path d="M9 3L7 21M17 3l-2 18M4 8.5h16M3.5 15.5h16" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { readonly name: IconName; readonly className?: string }): React.ReactElement {
  return (
    <svg className={className ? `cc-i ${className}` : 'cc-i'} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
