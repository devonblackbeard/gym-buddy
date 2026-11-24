import { useMemo, useRef, useState, type TouchEvent } from "react";
import type { ExerciseRef, SetEntry, Unit } from "../../shared/types";
import { ChevronLeft, ChevronRight, Dumbbell, Plus } from "../components/Icons";
import { LogSheet, type LogTarget } from "../components/LogSheet";
import { api } from "../lib/api";
import { dayLabel, fromISO, shiftDate, todayISO } from "../lib/dates";
import { fmtWeight } from "../lib/format";
import { useLoad } from "../lib/hooks";

interface Props {
  date: string;
  onDateChange: (date: string) => void;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onOpenExercise: (exercise: ExerciseRef) => void;
}

interface Group {
  exercise: ExerciseRef;
  sets: SetEntry[];
}

function groupByExercise(sets: SetEntry[]): Group[] {
  const groups = new Map<number, Group>();
  for (const set of sets) {
    const group = groups.get(set.exerciseId);
    if (group) group.sets.push(set);
    else groups.set(set.exerciseId, { exercise: { id: set.exerciseId, name: set.exerciseName }, sets: [set] });
  }
  return [...groups.values()];
}

export function TodayScreen({ date, onDateChange, unit, onUnitChange, onOpenExercise }: Props) {
  const { data: sets, setData: setSets, error, reload } = useLoad(() => api.day(date), [date]);
  const [target, setTarget] = useState<LogTarget | null>(null);
  const [sheetKey, setSheetKey] = useState(0);
  const groups = useMemo(() => groupByExercise(sets ?? []), [sets]);

  const isToday = date === todayISO();
  const open = (t: LogTarget) => {
    setSheetKey((k) => k + 1);
    setTarget(t);
  };

  // Swipe left/right anywhere on the list to change day.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 50) return;
    if (dx > 0) onDateChange(shiftDate(date, -1));
    else if (!isToday) onDateChange(shiftDate(date, 1));
  };

  const totalSets = sets?.length ?? 0;

  return (
    <>
      <header className="topbar topbar-date">
        <button className="icon-btn" onClick={() => onDateChange(shiftDate(date, -1))} aria-label="Previous day">
          <ChevronLeft />
        </button>
        <label className="date-title">
          <span className="eyebrow">
            {fromISO(date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </span>
          <span className="title">{dayLabel(date)}</span>
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
            aria-label="Pick a date"
          />
        </label>
        <button
          className="icon-btn"
          onClick={() => onDateChange(shiftDate(date, 1))}
          disabled={isToday}
          aria-label="Next day"
        >
          <ChevronRight />
        </button>
      </header>

      <main className="screen" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {error && (
          <div className="inline-error">
            {error} <button className="link-btn" onClick={reload}>Retry</button>
          </div>
        )}

        {!sets && !error && (
          <div className="skeleton-list">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        )}

        {sets && groups.length === 0 && (
          <div className="empty">
            <div className="empty-icon"><Dumbbell width={36} height={36} /></div>
            <h2>{isToday ? "Ready when you are" : "Rest day"}</h2>
            <p>{isToday ? "Add your first exercise to start today's workout." : "Nothing was logged on this day."}</p>
            <button className="btn btn-primary" onClick={() => open({ kind: "new" })}>
              <Plus /> Add exercise
            </button>
          </div>
        )}

        {groups.length > 0 && (
          <>
            <p className="summary">
              {groups.length} exercise{groups.length === 1 ? "" : "s"} · {totalSets} set{totalSets === 1 ? "" : "s"}
            </p>
            {groups.map(({ exercise, sets: groupSets }) => {
              const last = groupSets[groupSets.length - 1];
              return (
                <section key={exercise.id} className="card">
                  <button className="card-head" onClick={() => onOpenExercise(exercise)}>
                    <h2>{exercise.name}</h2>
                    <ChevronRight className="row-chevron" />
                  </button>
                  <ol className="set-list">
                    {groupSets.map((s, i) => (
                      <li key={s.id}>
                        <button
                          className="set-row"
                          onClick={() => open({ kind: "edit", set: s, setNumber: i + 1 })}
                          aria-label={`Edit set ${i + 1}: ${fmtWeight(s.weight)} ${s.unit} for ${s.reps} reps`}
                        >
                          <span className="set-num">{i + 1}</span>
                          <span className="set-weight">
                            {fmtWeight(s.weight)}
                            <small>{s.unit}</small>
                          </span>
                          <span className="set-x">×</span>
                          <span className="set-reps">
                            {s.reps}
                            <small>reps</small>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                  <button
                    className="add-set"
                    onClick={() =>
                      open({
                        kind: "add",
                        exercise,
                        setNumber: groupSets.length + 1,
                        prefill: { reps: last.reps, weight: last.weight, unit: last.unit },
                      })
                    }
                  >
                    <Plus width={18} height={18} /> Add set
                  </button>
                </section>
              );
            })}
          </>
        )}
      </main>

      {groups.length > 0 && (
        <button className="fab" onClick={() => open({ kind: "new" })}>
          <Plus /> Exercise
        </button>
      )}

      {target && (
        <LogSheet
          key={sheetKey}
          target={target}
          date={date}
          unit={unit}
          onUnitChange={onUnitChange}
          onClose={() => setTarget(null)}
          setsLoggedFor={(id) => groups.find((g) => g.exercise.id === id)?.sets.length ?? 0}
          onSaved={(saved) =>
            setSets((prev) => {
              const list = prev ?? [];
              return list.some((s) => s.id === saved.id)
                ? list.map((s) => (s.id === saved.id ? saved : s))
                : [...list, saved];
            })
          }
          onDeleted={(id) => setSets((prev) => (prev ?? []).filter((s) => s.id !== id))}
        />
      )}
    </>
  );
}
