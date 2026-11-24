// All dates are local calendar days as "YYYY-MM-DD" strings.

export function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = () => toISO(new Date());

export function shiftDate(s: string, days: number): string {
  const d = fromISO(s);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/** "Today", "Yesterday", or e.g. "Mon, Nov 17". */
export function dayLabel(s: string): string {
  const today = todayISO();
  if (s === today) return "Today";
  if (s === shiftDate(today, -1)) return "Yesterday";
  const d = fromISO(s);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function longDate(s: string): string {
  return fromISO(s).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function monthLabel(s: string): string {
  return fromISO(s).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** "3 days ago" style label for a past date. */
export function agoLabel(s: string): string {
  const days = Math.round((fromISO(todayISO()).getTime() - fromISO(s).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return dayLabel(s);
}
