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
  // Navigation (AppShell): same stroke family as the command centre.
  home: <><path d="M4 11l8-6.5 8 6.5" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  sidebar: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M9.5 4.5v15" /></>,
  runs: <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" /></>,
  molecule: <><circle cx="6" cy="7" r="2.2" /><circle cx="18" cy="7" r="2.2" /><circle cx="12" cy="17" r="2.2" /><path d="M8 8.3l2.7 6.8M16 8.3l-2.7 6.8M8.2 7h7.6" /></>,
  memory: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
  verify: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.2l2.4 2.4 4.6-5" /></>,
  gauge: <><path d="M4.5 17a8 8 0 1 1 15 0" /><path d="M12 13l4-4" /><circle cx="12" cy="13" r="1.2" /></>,
  box: <><path d="M4 8l8-4 8 4v8l-8 4-8-4z" /><path d="M4 8l8 4 8-4M12 12v8" /></>,
  export: <><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 13v6h14v-6" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>,
  review: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="M14.5 14.5l5 5M8.3 10.6l1.6 1.6 2.9-3.2" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { readonly name: IconName; readonly className?: string }): React.ReactElement {
  return (
    <svg className={className ? `cc-i ${className}` : 'cc-i'} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
