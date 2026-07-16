import { describe, it, expect } from "vitest";
import { buildIcsCalendar } from "./ics";

describe("buildIcsCalendar", () => {
  it("produces a valid VCALENDAR wrapper with the calendar name", () => {
    const ics = buildIcsCalendar({ calendarName: "Dave's Calendar", timeOffEvents: [], availabilityBlocks: [] });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("X-WR-CALNAME:Dave's Calendar");
  });

  it("renders a time-off event as an all-day VEVENT with the right UID and dates", () => {
    const ics = buildIcsCalendar({
      calendarName: "Test",
      timeOffEvents: [{
        uid: "timeoff-123",
        title: "Vacation",
        startDate: new Date(Date.UTC(2026, 6, 20)),
        endDate: new Date(Date.UTC(2026, 6, 25)),
      }],
      availabilityBlocks: [],
    });
    expect(ics).toContain("UID:timeoff-123@movex");
    expect(ics).toContain("SUMMARY:Vacation");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260720");
    expect(ics).toContain("DTEND;VALUE=DATE:20260725");
  });

  it("renders a weekly availability block with a matching RRULE weekday", () => {
    const ics = buildIcsCalendar({
      calendarName: "Test",
      timeOffEvents: [],
      availabilityBlocks: [{
        uid: "avail-1",
        dayOfWeek: 3, // Wednesday
        startTime: "09:00",
        endTime: "17:00",
        seedDate: new Date(Date.UTC(2026, 0, 1)), // Thursday
      }],
    });
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=WE");
    expect(ics).toContain("SUMMARY:Available");
  });

  it("escapes special characters and folds long lines to stay under 76 octets per line", () => {
    const longTitle = "A".repeat(100);
    const ics = buildIcsCalendar({
      calendarName: "Test",
      timeOffEvents: [{
        uid: "e1",
        title: `Comma, semicolon; ${longTitle}`,
        startDate: new Date(Date.UTC(2026, 0, 1)),
        endDate: new Date(Date.UTC(2026, 0, 2)),
      }],
      availabilityBlocks: [],
    });
    expect(ics).toContain("Comma\\, semicolon\\;");
    const summaryLines = ics.split("\r\n").filter((l) => l.startsWith("SUMMARY") || l.startsWith(" "));
    for (const line of ics.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
    expect(summaryLines.length).toBeGreaterThan(1);
  });
});
