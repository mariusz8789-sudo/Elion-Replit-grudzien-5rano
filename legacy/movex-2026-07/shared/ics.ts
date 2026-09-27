// RFC 5545 ICS calendar generation - real, standards-compliant output (not a stub). This is
// the whole integration surface for Google Calendar / Outlook / Apple Calendar: all three
// support "subscribe to a calendar by URL", which needs nothing more than a stable .ics feed -
// no OAuth app registration or provider SDK required.

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function formatDateOnly(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

// Escapes text per RFC 5545 (section 3.3.11): backslash, semicolon, comma, and newlines.
function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// ICS lines must be folded at 75 octets - long SUMMARY/DESCRIPTION values would otherwise
// produce a technically-invalid file that some clients reject.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

export interface IcsTimeOffEvent {
  uid: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
}

export interface IcsAvailabilityBlock {
  uid: string;
  dayOfWeek: number; // 0=Sunday..6=Saturday
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  seedDate: Date; // any real calendar date to anchor the weekly RRULE
}

export function buildIcsCalendar(params: {
  calendarName: string;
  timeOffEvents: IcsTimeOffEvent[];
  availabilityBlocks: IcsAvailabilityBlock[];
}): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MoveX//Calendar & Scheduling//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(params.calendarName)}`,
  ];

  const now = formatDateUtc(new Date());

  for (const e of params.timeOffEvents) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@movex`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${formatDateOnly(e.startDate)}`,
      `DTEND;VALUE=DATE:${formatDateOnly(e.endDate)}`,
      foldLine(`SUMMARY:${escapeText(e.title)}`),
      ...(e.description ? [foldLine(`DESCRIPTION:${escapeText(e.description)}`)] : []),
      "END:VEVENT",
    );
  }

  for (const b of params.availabilityBlocks) {
    const [sh, sm] = b.startTime.split(":").map(Number);
    const [eh, em] = b.endTime.split(":").map(Number);
    // Anchor the RRULE on the next real occurrence of this weekday on/after seedDate, so the
    // first instance a subscribing calendar shows actually falls on the right day.
    const anchor = new Date(Date.UTC(b.seedDate.getUTCFullYear(), b.seedDate.getUTCMonth(), b.seedDate.getUTCDate()));
    const delta = (b.dayOfWeek - anchor.getUTCDay() + 7) % 7;
    anchor.setUTCDate(anchor.getUTCDate() + delta);
    const start = new Date(anchor);
    start.setUTCHours(sh, sm, 0, 0);
    const end = new Date(anchor);
    end.setUTCHours(eh, em, 0, 0);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${b.uid}@movex`,
      `DTSTAMP:${now}`,
      `DTSTART:${formatDateUtc(start)}`,
      `DTEND:${formatDateUtc(end)}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${DAY_CODES[b.dayOfWeek]}`,
      "SUMMARY:Available",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
