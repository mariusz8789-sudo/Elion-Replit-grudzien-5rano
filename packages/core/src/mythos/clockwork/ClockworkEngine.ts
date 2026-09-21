/* Proprietary / All Rights Reserved - Genesis OS */
import { EvidenceLedger, stableStringify, sha256hex } from '../../knowledge/EvidenceLedger.js';
import type { AnalysisProvider } from '../KernelProviderRegistry.js';

/**
 * CLOCKWORK — statutory deadline monitoring for a Polish public office.
 *
 * The one thing a clerk cannot afford to get wrong is a date: KPA (the Code
 * of Administrative Procedure) and UDIP (the Public Information Access Act)
 * fix how long an office has, how days and months are counted, and what has
 * to be sent when a deadline cannot be met. This engine does that arithmetic
 * exactly, flags what is due and what is late, and drafts the notices — as
 * DRAFTS for a human to approve, never as decisions.
 *
 * Statutory basis carried on every output (`basis`):
 *   - KPA art. 35 §3: one month for a case needing explanatory proceedings,
 *     two months for a particularly complicated one, one month for an appeal.
 *   - KPA art. 36 §1: when the deadline cannot be met, the party must be told
 *     why and given a new date (draft: ZAWIADOMIENIE_ART_36).
 *   - KPA art. 37: the party may lodge a reminder (ponaglenie) for
 *     inactivity or excessive length (draft: ESKALACJA_ART_37).
 *   - KPA art. 57 §3/§4: a term in months ends on the day of the last month
 *     matching the start day (or the month's last day); a term ending on a
 *     Saturday or a public holiday ends on the next working day.
 *   - UDIP art. 13 ust. 1/2: 14 days for public information; if that is
 *     impossible, notify within 14 days with the reason and a date no later
 *     than two months from the request (draft: POWIADOMIENIE_ART_13).
 *
 * Honest mode: no wall clock (`today` is an input, the ledger gets a Clock),
 * no randomness, every assessment hashed and anchored in the EvidenceLedger,
 * every draft `requiresApproval: true`, and there is no send()/execute().
 * This is calendar arithmetic over statute text, not legal advice: the
 * office's lawyer owns the interpretation, the clerk owns the signature.
 */

export type CaseKind = 'KPA_STANDARD' | 'KPA_COMPLEX' | 'KPA_APPEAL' | 'FOI';
export type IsoDate = string; // YYYY-MM-DD

export interface CaseExtension { readonly newDeadline: IsoDate; readonly reason: string; readonly provenanceHash: string; }
export interface CaseRecord {
  readonly caseId: string;
  readonly kind: CaseKind;
  readonly receivedAt: IsoDate;
  readonly subject: string;
  readonly extensions?: readonly CaseExtension[];
  readonly closedAt?: IsoDate;
}

export interface Deadline { readonly date: IsoDate; readonly basis: string; readonly shiftedFrom: IsoDate | null; }
export type CaseStatus = 'CLOSED' | 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE';
export type DraftKind = 'ZAWIADOMIENIE_ART_36' | 'POWIADOMIENIE_ART_13' | 'ESKALACJA_ART_37';
export interface DraftDocument {
  readonly draftId: string;
  readonly kind: DraftKind;
  readonly caseId: string;
  readonly basis: string;
  readonly title: string;
  readonly body: string;
  readonly proposedNewDeadline: IsoDate | null;
  readonly status: 'DRAFT_FOR_HUMAN_APPROVAL';
  readonly requiresApproval: true;
  readonly provenanceHash: string;
  readonly ledgerRecordId: string;
}
export interface CaseAssessment {
  readonly caseId: string;
  readonly kind: CaseKind;
  readonly deadline: Deadline;
  readonly effectiveDeadline: IsoDate;
  readonly status: CaseStatus;
  readonly workingDaysLeft: number;
  readonly escalationLevel: 0 | 1 | 2;
  readonly drafts: readonly DraftDocument[];
  readonly ledgerRecordId: string;
  readonly assessmentHash: string;
}
export interface ClockworkReport {
  readonly today: IsoDate;
  readonly cases: readonly CaseAssessment[];
  readonly counts: Readonly<Record<CaseStatus, number>>;
  readonly reportHash: string;
  readonly label: 'DETERMINISTIC_CALENDAR_MODEL';
}
export interface ClockworkConfig {
  /** Working days before the deadline at which a case becomes DUE_SOON (default 5). */
  readonly dueSoonWorkingDays?: number;
  /** Extra public holidays (YYYY-MM-DD) on top of the statutory list, e.g. an office closure ordered by the head. */
  readonly extraHolidays?: readonly IsoDate[];
  readonly officeName?: string;
}

// ---------- calendar arithmetic (pure) ----------

const DAY_MS = 86_400_000;
export function parseIso(d: IsoDate): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error('BAD_ISO_DATE:' + d);
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (toIso(t) !== d) throw new Error('BAD_ISO_DATE:' + d);
  return t;
}
export function toIso(t: number): IsoDate { return new Date(t).toISOString().slice(0, 10); }
export const addDays = (d: IsoDate, n: number): IsoDate => toIso(parseIso(d) + n * DAY_MS);

/** KPA art. 57 §3: a term in months ends on the matching day of the last month, or on its last day when there is none. */
export function addMonths(d: IsoDate, n: number): IsoDate {
  const t = new Date(parseIso(d));
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + n, day = t.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toIso(Date.UTC(y, m, Math.min(day, lastDay)));
}

/** Easter Sunday (Gregorian, Meeus/Jones/Butcher). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return toIso(Date.UTC(year, month - 1, day));
}

/** Polish public holidays (ustawa z 18 stycznia 1951 r. o dniach wolnych od pracy, as amended; 24 December from 2025). */
export function polishPublicHolidays(year: number): readonly IsoDate[] {
  const easter = easterSunday(year);
  const fixed = ['01-01', '01-06', '05-01', '05-03', '08-15', '11-01', '11-11', '12-25', '12-26'].map((md) => `${year}-${md}`);
  if (year >= 2025) fixed.push(`${year}-12-24`);
  return [...fixed, easter, addDays(easter, 1), addDays(easter, 49), addDays(easter, 60)].sort();
}

export function isWorkingDay(d: IsoDate, extraHolidays: ReadonlySet<IsoDate>): boolean {
  const t = parseIso(d);
  const dow = new Date(t).getUTCDay(); // 0 Sunday, 6 Saturday
  if (dow === 0 || dow === 6) return false;
  const year = new Date(t).getUTCFullYear();
  return !polishPublicHolidays(year).includes(d) && !extraHolidays.has(d);
}

/** KPA art. 57 §4: a term ending on a Saturday or a public holiday ends on the next working day. */
export function shiftToWorkingDay(d: IsoDate, extraHolidays: ReadonlySet<IsoDate>): IsoDate {
  let cur = d;
  while (!isWorkingDay(cur, extraHolidays)) cur = addDays(cur, 1);
  return cur;
}

/** Working days strictly after `from` up to and including `to` (negative when `to` is before `from`). */
export function workingDaysBetween(from: IsoDate, to: IsoDate, extraHolidays: ReadonlySet<IsoDate>): number {
  const a = parseIso(from), b = parseIso(to);
  if (b < a) return -workingDaysBetween(to, from, extraHolidays);
  let n = 0;
  for (let t = a + DAY_MS; t <= b; t += DAY_MS) if (isWorkingDay(toIso(t), extraHolidays)) n++;
  return n;
}

export function statutoryDeadline(c: CaseRecord, extraHolidays: ReadonlySet<IsoDate>): Deadline {
  // KPA art. 57 §1: a term in days does not count the day of the triggering event; months per §3.
  let raw: IsoDate; let basis: string;
  switch (c.kind) {
    case 'KPA_STANDARD': raw = addMonths(c.receivedAt, 1); basis = 'KPA art. 35 §3 (1 miesiąc) + art. 57 §3'; break;
    case 'KPA_COMPLEX': raw = addMonths(c.receivedAt, 2); basis = 'KPA art. 35 §3 (sprawa szczególnie skomplikowana, 2 miesiące) + art. 57 §3'; break;
    case 'KPA_APPEAL': raw = addMonths(c.receivedAt, 1); basis = 'KPA art. 35 §3 (postępowanie odwoławcze, 1 miesiąc) + art. 57 §3'; break;
    case 'FOI': raw = addDays(c.receivedAt, 14); basis = 'UDIP art. 13 ust. 1 (14 dni) + KPA art. 57 §1'; break;
  }
  const shifted = shiftToWorkingDay(raw, extraHolidays);
  return { date: shifted, basis: shifted === raw ? basis : basis + ' + art. 57 §4 (przesunięcie na dzień roboczy)', shiftedFrom: shifted === raw ? null : raw };
}

// ---------- the engine ----------

const BASIS_36 = 'KPA art. 36 §1';
const BASIS_13 = 'UDIP art. 13 ust. 2';
const BASIS_37 = 'KPA art. 37';

export class ClockworkEngine {
  private readonly dueSoon: number;
  private readonly holidays: ReadonlySet<IsoDate>;
  private readonly office: string;
  constructor(private ledger: EvidenceLedger, cfg: ClockworkConfig = {}) {
    this.dueSoon = cfg.dueSoonWorkingDays ?? 5;
    this.holidays = new Set(cfg.extraHolidays ?? []);
    this.office = cfg.officeName ?? 'Organ';
  }

  /** Deterministic: the same cases and the same `today` give the same report and the same hashes. */
  assess(cases: readonly CaseRecord[], today: IsoDate): ClockworkReport {
    parseIso(today);
    const out: CaseAssessment[] = [];
    for (const c of [...cases].sort((a, b) => a.caseId.localeCompare(b.caseId))) out.push(this.assessOne(c, today));
    const counts: Record<CaseStatus, number> = { CLOSED: 0, ON_TRACK: 0, DUE_SOON: 0, OVERDUE: 0 };
    for (const a of out) counts[a.status]++;
    const reportHash = sha256hex(stableStringify({ today, hashes: out.map((a) => a.assessmentHash) }));
    return { today, cases: out, counts, reportHash, label: 'DETERMINISTIC_CALENDAR_MODEL' };
  }

  private assessOne(c: CaseRecord, today: IsoDate): CaseAssessment {
    const deadline = statutoryDeadline(c, this.holidays);
    const ext = c.extensions ?? [];
    for (const e of ext) parseIso(e.newDeadline);
    const effective = ext.length ? ext[ext.length - 1].newDeadline : deadline.date;
    const left = workingDaysBetween(today, effective, this.holidays);
    let status: CaseStatus;
    if (c.closedAt !== undefined) status = 'CLOSED';
    else if (parseIso(today) > parseIso(effective)) status = 'OVERDUE';
    else if (left <= this.dueSoon) status = 'DUE_SOON';
    else status = 'ON_TRACK';
    const escalationLevel: 0 | 1 | 2 = status === 'OVERDUE' ? 2 : status === 'DUE_SOON' ? 1 : 0;

    const computation = { caseId: c.caseId, kind: c.kind, receivedAt: c.receivedAt, deadline, effective, today, status, left };
    const assessmentHash = sha256hex(stableStringify(computation));
    const anchor = this.ledger.addRecord({
      sourceUrl: 'urn:genesis:clockwork:' + c.caseId,
      sourceTimestamp: today,
      claim: `CLOCKWORK ${c.caseId}: termin ${effective} (${deadline.basis}), stan na ${today}: ${status}`,
      claimType: 'conclusion',
      confidence: 1,
      provenance: { sourceKind: 'document', retrievedBy: 'clockwork-engine', independentSourceIds: [c.caseId] },
    }).record;

    const drafts: DraftDocument[] = [];
    if (status === 'DUE_SOON' && c.kind === 'FOI' && ext.length === 0) drafts.push(this.draft('POWIADOMIENIE_ART_13', c, today, effective, shiftToWorkingDay(addMonths(c.receivedAt, 2), this.holidays), assessmentHash));
    if (status === 'DUE_SOON' && c.kind !== 'FOI') drafts.push(this.draft('ZAWIADOMIENIE_ART_36', c, today, effective, null, assessmentHash));
    if (status === 'OVERDUE') drafts.push(this.draft('ESKALACJA_ART_37', c, today, effective, null, assessmentHash));

    return { caseId: c.caseId, kind: c.kind, deadline, effectiveDeadline: effective, status, workingDaysLeft: left, escalationLevel, drafts, ledgerRecordId: anchor.id, assessmentHash };
  }

  private draft(kind: DraftKind, c: CaseRecord, today: IsoDate, deadline: IsoDate, proposedNewDeadline: IsoDate | null, assessmentHash: string): DraftDocument {
    const basis = kind === 'ZAWIADOMIENIE_ART_36' ? BASIS_36 : kind === 'POWIADOMIENIE_ART_13' ? BASIS_13 : BASIS_37;
    const title = kind === 'ZAWIADOMIENIE_ART_36'
      ? `Zawiadomienie o niezałatwieniu sprawy ${c.caseId} w terminie (art. 36 §1 KPA)`
      : kind === 'POWIADOMIENIE_ART_13'
        ? `Powiadomienie o przedłużeniu terminu udostępnienia informacji publicznej ${c.caseId} (art. 13 ust. 2 UDIP)`
        : `Notatka eskalacyjna: sprawa ${c.caseId} po terminie (ryzyko ponaglenia, art. 37 KPA)`;
    const body = kind === 'ZAWIADOMIENIE_ART_36'
      ? [`${this.office}, ${today}.`, `Dotyczy: ${c.subject} (sprawa ${c.caseId}, wpływ ${c.receivedAt}).`,
        `Na podstawie art. 36 §1 KPA zawiadamiam, że sprawa nie zostanie załatwiona w terminie ${deadline}.`,
        'Przyczyna zwłoki: [DO UZUPEŁNIENIA PRZEZ REFERENTA].', 'Nowy termin załatwienia sprawy: [DO USTALENIA PRZEZ REFERENTA].',
        'Pouczenie: stronie służy prawo do wniesienia ponaglenia (art. 37 KPA).'].join('\n')
      : kind === 'POWIADOMIENIE_ART_13'
        ? [`${this.office}, ${today}.`, `Dotyczy: wniosek o udostępnienie informacji publicznej ${c.caseId} z dnia ${c.receivedAt}: ${c.subject}.`,
          `Na podstawie art. 13 ust. 2 UDIP powiadamiam, że informacja nie może zostać udostępniona w terminie ${deadline}.`,
          'Powód: [DO UZUPEŁNIENIA PRZEZ REFERENTA].', `Informacja zostanie udostępniona nie później niż ${proposedNewDeadline} (dwa miesiące od dnia złożenia wniosku).`].join('\n')
        : [`Sprawa ${c.caseId} (${c.subject}) jest po terminie ${deadline}; stan na ${today}.`,
          'Ryzyko: ponaglenie strony (art. 37 KPA) i odpowiedzialność za bezczynność lub przewlekłość.',
          'Proponowane działanie: natychmiastowe załatwienie sprawy albo zawiadomienie z art. 36 §1 KPA z nowym terminem. Decyzja: kierownik komórki.'].join('\n');
    const provenanceHash = sha256hex(stableStringify({ kind, caseId: c.caseId, today, deadline, proposedNewDeadline, assessmentHash, body }));
    const rec = this.ledger.addRecord({
      sourceUrl: 'urn:genesis:clockwork:draft:' + c.caseId + ':' + kind,
      sourceTimestamp: today,
      claim: `${title} — PROJEKT do zatwierdzenia przez człowieka; provenance ${provenanceHash.slice(0, 16)}`,
      claimType: 'hypothesis',
      confidence: 0.5,
      provenance: { sourceKind: 'document', retrievedBy: 'clockwork-engine', independentSourceIds: [c.caseId] },
    }).record;
    return { draftId: 'DR-' + provenanceHash.slice(0, 10).toUpperCase(), kind, caseId: c.caseId, basis, title, body, proposedNewDeadline, status: 'DRAFT_FOR_HUMAN_APPROVAL', requiresApproval: true, provenanceHash, ledgerRecordId: rec.id };
  }
}

export interface ClockworkRequest { readonly cases: readonly CaseRecord[]; readonly today: IsoDate; }

/** Registers CLOCKWORK with the single kernel as an analysis provider (capability `deadline-monitoring`). */
export function clockworkProvider(engine: ClockworkEngine): AnalysisProvider {
  return { providerId: 'clockwork', capabilities: ['deadline-monitoring'], analyze: (_ctx, req) => { const r = req as ClockworkRequest; return engine.assess(r.cases, r.today); } };
}
