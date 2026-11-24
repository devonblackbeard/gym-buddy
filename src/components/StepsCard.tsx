// Shows the day's step total from Apple Health; see docs/apple-health-steps.md for setup.
import { api } from "../lib/api";
import { fromISO, shiftDate } from "../lib/dates";
import { useLoad } from "../lib/hooks";
import { Footprints } from "./Icons";

const DAYS = 7;

/** Steps for `date` (synced from Apple Health) with a bar for each of the 7 days ending on it. */
export function StepsCard({ date }: { date: string }) {
  const from = shiftDate(date, -(DAYS - 1));
  const { data } = useLoad(() => api.steps(from, date), [date]);

  // Steps are secondary to the workout: show nothing while loading, on error,
  // or when no steps have ever been synced for this week.
  if (!data || data.length === 0) return null;

  const byDate = new Map(data.map((d) => [d.date, d.steps]));
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = shiftDate(from, i);
    return { date: d, steps: byDate.get(d) ?? 0 };
  });
  const max = Math.max(...days.map((d) => d.steps), 1);
  const today = byDate.get(date);

  return (
    <section className="card steps-card" aria-label="Steps from Apple Health">
      <div className="steps-head">
        <Footprints className="steps-icon" />
        <div>
          <div className="steps-count">{today === undefined ? "—" : today.toLocaleString()}</div>
          <div className="steps-label">steps</div>
        </div>
      </div>
      <ol className="steps-bars" aria-hidden="true">
        {days.map((d) => (
          <li key={d.date} className={d.date === date ? "current" : undefined}>
            <span className="track">
              <span className="bar" style={{ height: `${Math.max((d.steps / max) * 100, d.steps ? 6 : 0)}%` }} />
            </span>
            <span className="day">{fromISO(d.date).toLocaleDateString(undefined, { weekday: "narrow" })}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
