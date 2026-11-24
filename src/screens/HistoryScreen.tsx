import type { DaySummary } from "../../shared/types";
import { RowSkeleton } from "../components/ExercisePicker";
import { ChevronRight, Clock } from "../components/Icons";
import { api } from "../lib/api";
import { fromISO, monthLabel } from "../lib/dates";
import { useLoad } from "../lib/hooks";

export function HistoryScreen({ onOpenDay }: { onOpenDay: (date: string) => void }) {
  const { data: days, error, reload } = useLoad(api.history, []);

  const months: { label: string; days: DaySummary[] }[] = [];
  for (const day of days ?? []) {
    const label = monthLabel(day.date);
    const current = months[months.length - 1];
    if (current?.label === label) current.days.push(day);
    else months.push({ label, days: [day] });
  }

  return (
    <>
      <header className="topbar">
        <h1 className="title">History</h1>
      </header>
      <main className="screen">
        {error && (
          <div className="inline-error">
            {error} <button className="link-btn" onClick={reload}>Retry</button>
          </div>
        )}
        {!days && !error && <RowSkeleton rows={6} />}
        {days?.length === 0 && (
          <div className="empty">
            <div className="empty-icon"><Clock width={36} height={36} /></div>
            <h2>No workouts yet</h2>
            <p>Days you log sets on will show up here.</p>
          </div>
        )}
        {months.map((month) => (
          <section key={month.label}>
            <h3 className="section-label">{month.label}</h3>
            <ul className="list list-card">
              {month.days.map((day) => {
                const d = fromISO(day.date);
                return (
                  <li key={day.date}>
                    <button className="list-row" onClick={() => onOpenDay(day.date)}>
                      <span className="date-badge">
                        <span>{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                        <strong>{d.getDate()}</strong>
                      </span>
                      <span className="row-main">
                        <span className="row-title">{day.exercises.join(", ")}</span>
                        <span className="row-sub">
                          {day.exercises.length} exercise{day.exercises.length === 1 ? "" : "s"} · {day.sets} set
                          {day.sets === 1 ? "" : "s"}
                        </span>
                      </span>
                      <ChevronRight className="row-chevron" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}
