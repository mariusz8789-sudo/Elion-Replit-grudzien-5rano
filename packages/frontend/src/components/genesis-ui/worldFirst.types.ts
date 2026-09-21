/**
 * Genesis World-First UI contracts.
 * Candidate integration layer: map these types onto existing Genesis world contracts.
 */
import type { CSSProperties, ReactNode } from 'react';

export type WorldId =
  | 'home'
  | 'biology'
  | 'physics'
  | 'cern'
  | 'cosmos'
  | 'molecular'
  | 'hyperscope'
  | (string & {});

export type EpistemicTone =
  | 'real'
  | 'dataset'
  | 'model'
  | 'schematic'
  | 'simulated'
  | 'reconstructed'
  | 'hypothesis'
  | 'unknown'
  | 'blocked';

export interface WorldIdentity {
  readonly id: WorldId;
  readonly title: string;
  readonly domain?: string;
  readonly glyph?: string;
  readonly accent?: string;
}

export interface WorldEpistemicBadge {
  readonly label: string;
  readonly tone: EpistemicTone;
  readonly detail?: string;
}

export type ContextActionKind = 'inspect' | 'command' | 'research' | 'custom';

export interface WorldObjectAction {
  readonly id: string;
  readonly label: string;
  readonly kind: ContextActionKind;
  readonly disabled?: boolean;
  readonly shortcut?: string;
}

export interface WorldObject {
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
  readonly category?: string;
  readonly badges?: readonly WorldEpistemicBadge[];
  readonly actions?: readonly WorldObjectAction[];
  readonly researchTitle?: string;
  readonly style?: CSSProperties;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface WorldDefinition {
  readonly identity: WorldIdentity;
  readonly defaultBadge?: WorldEpistemicBadge;
  readonly defaultObjects?: readonly WorldObject[];
  readonly globalToolbar?: readonly WorldToolbarItem[];
}

export interface WorldToolbarItem {
  readonly id: string;
  readonly label: string;
  readonly ariaLabel?: string;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
  readonly onActivate?: () => void;
}
