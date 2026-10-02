export type MetaTone = "muted" | "warning" | "danger";

const MS_PER_HOUR = 3_600_000;

/** A local `YYYY-MM-DD`, the format Linear uses for due dates. */
export function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Overdue open work is red, work due today or tomorrow is amber; finished work never alarms. */
export function dueDateTone(dueDate: string, now: Date, completed: boolean): MetaTone {
  if (completed) return "muted";
  const today = localDateKey(now);
  if (dueDate < today) return "danger";
  const tomorrow = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  return dueDate <= tomorrow ? "warning" : "muted";
}

export function formatDueDate(dueDate: string, locale?: string): string {
  const [year, month, day] = dueDate.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(
    new Date(year!, month! - 1, day!),
  );
}

/** Linear's SLA as a chip: time left until it breaches, amber once Linear calls it high risk. */
export function slaStatus(
  breachesAt: string,
  highRiskAt: string | null,
  now: Date,
): { readonly label: string; readonly tone: MetaTone } {
  const left = Date.parse(breachesAt) - now.getTime();
  if (left <= 0) return { label: "SLA breached", tone: "danger" };
  const hours = Math.ceil(left / MS_PER_HOUR);
  const label = hours < 48 ? `SLA ${hours}h` : `SLA ${Math.ceil(hours / 24)}d`;
  const risky = highRiskAt !== null && now.getTime() >= Date.parse(highRiskAt);
  return { label, tone: risky ? "warning" : "muted" };
}
