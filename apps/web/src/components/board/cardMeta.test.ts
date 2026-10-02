import { describe, expect, it } from "vite-plus/test";

import { dueDateTone, formatDueDate, slaStatus } from "./cardMeta";

const thursday = new Date(2026, 9, 1, 17, 0);

describe("dueDateTone", () => {
  it("flags overdue work red and work due today or tomorrow amber", () => {
    expect(dueDateTone("2026-09-30", thursday, false)).toBe("danger");
    expect(dueDateTone("2026-10-01", thursday, false)).toBe("warning");
    expect(dueDateTone("2026-10-02", thursday, false)).toBe("warning");
    expect(dueDateTone("2026-10-03", thursday, false)).toBe("muted");
  });

  it("never alarms on finished work", () => {
    expect(dueDateTone("2026-09-01", thursday, true)).toBe("muted");
  });

  it("formats the calendar date without shifting it across time zones", () => {
    expect(formatDueDate("2026-10-02", "en-US")).toBe("Oct 2");
  });
});

describe("slaStatus", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");

  it("counts down in hours under two days and in days beyond", () => {
    expect(slaStatus("2026-10-01T17:30:00.000Z", null, now)).toEqual({
      label: "SLA 6h",
      tone: "muted",
    });
    expect(slaStatus("2026-10-05T12:00:00.000Z", null, now)).toEqual({
      label: "SLA 4d",
      tone: "muted",
    });
  });

  it("turns amber at Linear's high-risk mark and red once breached", () => {
    expect(slaStatus("2026-10-02T12:00:00.000Z", "2026-10-01T06:00:00.000Z", now).tone).toBe(
      "warning",
    );
    expect(slaStatus("2026-10-01T11:59:00.000Z", null, now)).toEqual({
      label: "SLA breached",
      tone: "danger",
    });
  });
});
