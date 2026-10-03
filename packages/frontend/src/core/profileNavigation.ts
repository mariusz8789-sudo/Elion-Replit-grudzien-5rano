/**
 * MENU WEDŁUG PROFILU KONTA — co widzi uczeń, student i nauczyciel.
 *
 * Właściciel: „różne panele dla studentów, dla naukowca, dla nauczyciela …
 * wtedy mniej by się pokazało … łatwiej ogarnąć”. Ten plik decyduje, które
 * pozycje menu głównego i które grupy/pozycje „Więcej” pokazać danemu profilowi.
 *
 * ŻEBY ZMIENIĆ, CO WIDZI PROFIL — edytuj tylko `PROFILE_MENU_TABLE` poniżej
 * (identyfikatory to pola `id` z `core/navigation.ts`).
 *
 * ZASADY:
 *  - Gość (niezalogowany), BADACZ i INSTYTUCJA widzą pełne menu, bez zmian.
 *  - To tylko menu. Trasy dalej istnieją: wpisany adres otwiera ekran, a ekran
 *    objęty bramką pokazuje istniejący komunikat „zablokowane dla profilu”.
 *  - Pozycja wymagająca zdolności, której profil nie ma (`ITEM_CAPABILITY`),
 *    znika z menu nawet wtedy, gdy ktoś dopisze ją do tabeli.
 *  - „Konto” i „Ustawienia” są zawsze widoczne.
 *
 * Czysta funkcja, zero I/O — testy w __tests__/profileNavigation.test.ts.
 */
import {
  MORE_SECTIONS,
  NAV_SECTIONS,
  PRIMARY_NAV_ITEMS,
  navVariants,
  type NavItem,
  type NavSection,
} from './navigation';
import { CAPABILITIES, canUseCapability, type AccountProfile, type Capability } from './accountProfiles';

/** Profile z uproszczonym menu. Pozostałe (i gość) dostają pełne menu. */
export type SimplifiedProfile = 'UCZEN' | 'STUDENT' | 'NAUCZYCIEL';

export interface ProfileMenuRule {
  /** Pozycje menu głównego (`NAV_SECTIONS`), w kolejności z navigation.ts. */
  readonly main: readonly string[];
  /** Pozycje z „Więcej” (`MORE_SECTIONS`); grupa bez żadnej widocznej pozycji znika. */
  readonly more: readonly string[];
  /** Czy pokazywać „inne widoki” (warianty) pod pozycją. */
  readonly showVariants: boolean;
  /** Czy pokazywać „Wszystkie możliwości” (#/more — pełny katalog). */
  readonly showOverview: boolean;
}

/** Zawsze widoczne w „Więcej”, dla każdego profilu. */
export const ALWAYS_VISIBLE: readonly string[] = ['account', 'settings'];

const UCZEN_MAIN = ['home', 'chat', 'human-biology-lab', 'scientific-worlds'] as const;
const UCZEN_MORE = ['glossary', 'dome-world', 'black-hole', 'universe', 'investor-demo', 'chemistry', 'virtual-bio'] as const;

const STUDENT_MAIN = [...UCZEN_MAIN, 'evidence', 'cms-open-data', 'reviewer', 'memory'] as const;
const STUDENT_MORE = [...UCZEN_MORE, 'physics', 'cern-complex', 'lab-fpv'] as const;

/**
 * TABELA MENU — jedyne miejsce, w którym profil → widoczne pozycje menu.
 * Nauczyciel ma zestaw studenta; jego zdolność „Widoki dla klasy i nauczania”
 * jest opisana na ekranie Konto, bo osobnego ekranu dla klasy jeszcze nie ma.
 */
export const PROFILE_MENU_TABLE: Readonly<Record<SimplifiedProfile, ProfileMenuRule>> = Object.freeze({
  UCZEN: { main: UCZEN_MAIN, more: UCZEN_MORE, showVariants: false, showOverview: false },
  STUDENT: { main: STUDENT_MAIN, more: STUDENT_MORE, showVariants: false, showOverview: false },
  NAUCZYCIEL: { main: STUDENT_MAIN, more: STUDENT_MORE, showVariants: false, showOverview: false },
});

/**
 * Pozycje menu, które wymagają zdolności z bramki profili (accountProfiles.mjs).
 * Profil bez tej zdolności nie widzi ich w uproszczonym menu.
 */
export const ITEM_CAPABILITY: Readonly<Record<string, Capability>> = Object.freeze({
  science: CAPABILITIES.DRUG_DISCOVERY,
  campaign: CAPABILITIES.DRUG_DISCOVERY,
  'gov-campaign': CAPABILITIES.DRUG_DISCOVERY,
  cde: CAPABILITIES.DRUG_DISCOVERY,
  pilot: CAPABILITIES.DRUG_DISCOVERY,
  dossier: CAPABILITIES.DRUG_DISCOVERY,
  precision: CAPABILITIES.DRUG_DISCOVERY,
  discover: CAPABILITIES.COMPUTE_RUN,
});

export function isSimplifiedProfile(profile: AccountProfile | null): profile is SimplifiedProfile {
  return profile !== null && Object.prototype.hasOwnProperty.call(PROFILE_MENU_TABLE, profile);
}

export interface ProfileMenu {
  /** true = menu uproszczone dla profilu; false = pełne menu (gość, badacz, instytucja). */
  readonly simplified: boolean;
  readonly main: readonly NavSection[];
  readonly more: readonly NavSection[];
  readonly showOverview: boolean;
  /** Warianty pozycji do pokazania (puste, gdy profil ich nie widzi). */
  readonly variants: (id: string) => readonly NavItem[];
}

const FULL_MENU: ProfileMenu = {
  simplified: false,
  main: NAV_SECTIONS,
  more: MORE_SECTIONS,
  showOverview: true,
  variants: navVariants,
};

/** Menu dla profilu (`null` = gość). */
export function menuForProfile(profile: AccountProfile | null): ProfileMenu {
  if (!isSimplifiedProfile(profile)) return FULL_MENU;
  const rule = PROFILE_MENU_TABLE[profile];
  const allowed = (item: NavItem): boolean => {
    const capability = ITEM_CAPABILITY[item.id];
    return capability === undefined || canUseCapability(profile, capability);
  };
  const mainIds = new Set(rule.main);
  const moreIds = new Set([...rule.more, ...ALWAYS_VISIBLE]);
  const filter = (sections: readonly NavSection[], ids: ReadonlySet<string>): NavSection[] =>
    sections
      .map((section) => ({ ...section, items: section.items.filter((item) => ids.has(item.id) && allowed(item)) }))
      .filter((section) => section.items.length > 0);
  return {
    simplified: true,
    main: filter(NAV_SECTIONS, mainIds),
    more: filter(MORE_SECTIONS, moreIds),
    showOverview: rule.showOverview,
    variants: rule.showVariants ? (id) => navVariants(id).filter(allowed) : () => [],
  };
}

/** Płaska lista identyfikatorów widocznych pozycji — do testów i podglądu. */
export function visibleMenuIds(profile: AccountProfile | null): { main: string[]; more: string[] } {
  const menu = menuForProfile(profile);
  return {
    main: menu.main.flatMap((section) => section.items.map((item) => item.id)),
    more: menu.more.flatMap((section) => section.items.map((item) => item.id)),
  };
}

/** How many places the mobile tab bar holds before More. */
export const TAB_BAR_PLACES = 4;

/**
 * The mobile tab bar for a menu: the primary places the profile can see, in
 * order, topped up with its next main places, so a pupil never gets a tab that
 * leads to a locked screen nor a half-empty bar.
 */
export function primaryForMenu(menu: ProfileMenu): readonly NavItem[] {
  const visible = menu.main.flatMap((section) => section.items).filter((item) => item.status !== 'planned');
  const ids = new Set(visible.map((item) => item.id));
  const picked: NavItem[] = PRIMARY_NAV_ITEMS.filter((item) => ids.has(item.id));
  for (const item of visible) {
    if (picked.length >= TAB_BAR_PLACES) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked.slice(0, TAB_BAR_PLACES);
}
