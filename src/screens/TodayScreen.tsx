import { useMemo, useRef, useState, type TouchEvent } from "react";
import type { Day, ExerciseRef, RoutineExercise, RoutineWorkout, SetEntry, Unit } from "../../shared/types";
import { RowSkeleton } from "../components/ExercisePicker";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Layers, Plus, Trash } from "../components/Icons";
import { LogSheet, type LogTarget } from "../components/LogSheet";
import { RoutinePicker } from "../components/RoutinePicker";
import { Sheet } from "../components/Sheet";
import { api, errorMessage } from "../lib/api";
import { dayLabel, fromISO, shiftDate, todayISO } from "../lib/dates";
import { fmtWeight, haptic } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { toast } from "../lib/toast";

interface Props {
  date: string;
  onDateChange: (date: string) => void;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onOpenExercise: (exercise: ExerciseRef) => void;
  onGoToRoutines: () => void;
}

interface Group {
  exercise: ExerciseRef;
  sets: SetEntry[];
  /** Present when the exercise is part of the day's routine workout. */
  planned?: RoutineExercise;
}

/** Planned exercises first (in routine order, even with no sets yet), then anything else logged. */
function buildGroups(sets: SetEntry[], plan: RoutineWorkout | null): Group[] {
  const groups = new Map<number, Group>();
  for (const planned of plan?.exercises ?? []) {
    groups.set(planned.exerciseId, { exercise: { id: planned.exerciseId, name: planned.name }, sets: [], planned });
  }
  for (const set of sets) {
    const group = groups.get(set.exerciseId);
    if (group) group.sets.push(set);
    else groups.set(set.exerciseId, { exercise: { id: set.exerciseId, name: set.exerciseName }, sets: [set] });
  }
  return [...groups.values()];
}

const targetLabel = (p?: RoutineExercise) =>
  p && (p.targetSets || p.targetReps) ? `${p.targetSets ?? "?"} × ${p.targetReps ?? "?"}` : null;

export function TodayScreen({ date, onDateChange, unit, onUnitChange, onOpenExercise, onGoToRoutines }: Props) {
  const { data: day, setData: setDay, error, reload } = useLoad(() => api.day(date), [date]);
  const [target, setTarget] = useState<LogTarget | null>(null);
  const [sheetKey, setSheetKey] = useState(0);
  const [choosingPlan, setChoosingPlan] = useState(false);

  const sets = day?.sets ?? [];
  const plan = day?.plan ?? null;
  const groups = useMemo(() => buildGroups(sets, plan), [sets, plan]);
  const isToday = date === todayISO();

  const open = (t: LogTarget) => {
    setSheetKey((k) => k + 1);
    setTarget(t);
  };

  const updateSets = (fn: (sets: SetEntry[]) => SetEntry[]) =>
    setDay((prev: Day | null) => (prev ? { ...prev, sets: fn(prev.sets) } : prev));

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

  const plannedSets = plan?.exercises.reduce((n, e) => n + (e.targetSets ?? 0), 0) ?? 0;
  const doneTowardPlan = groups.reduce(
    (n, g) => n + (g.planned?.targetSets ? Math.min(g.sets.length, g.planned.targetSets) : 0),
    0,
  );

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

        {!day && !error && (
          <div className="skeleton-list">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        )}

        {day && (plan || sets.length > 0) && (
          <button className="plan-bar" onClick={() => setChoosingPlan(true)}>
            <span className="plan-bar-icon"><Layers width={20} height={20} /></span>
            <span className="plan-bar-text">
              <span className="plan-bar-label">{plan ? plan.routineName : "Freestyle"}</span>
              <span className="plan-bar-name">{plan ? plan.name : "No routine"}</span>
            </span>
            {plannedSets > 0 && (
              <span className="plan-bar-progress">
                {doneTowardPlan}/{plannedSets} sets
              </span>
            )}
            <ChevronDown className="row-chevron" />
          </button>
        )}

        {day && !plan && sets.length === 0 && (
          <StartPanel
            isToday={isToday}
            onGoToRoutines={onGoToRoutines}
            onStart={async (routineWorkoutId) => {
              if (routineWorkoutId === null) {
                open({ kind: "new" });
                return;
              }
              try {
                const chosen = await api.setDayPlan(date, routineWorkoutId);
                setDay((prev: Day | null) => (prev ? { ...prev, plan: chosen } : prev));
                haptic(15);
              } catch (e) {
                toast(errorMessage(e));
              }
            }}
          />
        )}

        {groups.map(({ exercise, sets: groupSets, planned }) => {
          const last = groupSets[groupSets.length - 1];
          const goal = targetLabel(planned);
          const complete = !!planned?.targetSets && groupSets.length >= planned.targetSets;
          return (
            <section key={exercise.id} className={complete ? "card card-done" : "card"}>
              <button className="card-head" onClick={() => onOpenExercise(exercise)}>
                <span className="card-head-main">
                  <h2>{exercise.name}</h2>
                  {(goal || planned) && (
                    <span className="card-sub">
                      {goal ? `Target ${goal}` : "In plan"}
                      {planned?.targetSets ? ` · ${groupSets.length}/${planned.targetSets} done` : ""}
                    </span>
                  )}
                  {!planned && plan && <span className="card-sub">Extra</span>}
                </span>
                {complete ? <Check className="row-check" /> : <ChevronRight className="row-chevron" />}
              </button>
              {groupSets.length > 0 && (
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
              )}
              <button
                className="add-set"
                onClick={() =>
                  open({
                    kind: "add",
                    exercise,
                    setNumber: groupSets.length + 1,
                    prefill: last ? { reps: last.reps, weight: last.weight, unit: last.unit } : undefined,
                    targetReps: planned?.targetReps,
                    targetSets: planned?.targetSets,
                  })
                }
              >
                <Plus width={18} height={18} /> {groupSets.length ? "Add set" : "Log first set"}
              </button>
            </section>
          );
        })}
      </main>

      {day && (plan || sets.length > 0) && (
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
            updateSets((list) =>
              list.some((s) => s.id === saved.id) ? list.map((s) => (s.id === saved.id ? saved : s)) : [...list, saved],
            )
          }
          onDeleted={(id) => updateSets((list) => list.filter((s) => s.id !== id))}
        />
      )}

      {choosingPlan && (
        <PlanSheet
          date={date}
          currentId={plan?.id ?? null}
          planLabel={plan ? `${plan.routineName} › ${plan.name}` : null}
          setCount={sets.length}
          onClose={() => setChoosingPlan(false)}
          onChosen={(chosen) => setDay((prev: Day | null) => (prev ? { ...prev, plan: chosen } : prev))}
          onCleared={() => setDay({ date, plan: null, sets: [] })}
        />
      )}
    </>
  );
}

/** Shown on an empty day: pick a routine workout or go freestyle. */
function StartPanel({
  isToday,
  onStart,
  onGoToRoutines,
}: {
  isToday: boolean;
  onStart: (routineWorkoutId: number | null) => Promise<void>;
  onGoToRoutines: () => void;
}) {
  const { data: routines, error, reload } = useLoad(api.routines, []);
  const [busy, setBusy] = useState(false);
  const hasWorkouts = routines?.some((r) => r.workouts.length > 0);

  return (
    <div className="start-panel">
      <div className="start-head">
        <h2>{isToday ? "What are you training today?" : "Nothing logged on this day"}</h2>
        <p>{isToday ? "Pick a workout from your routines, or freestyle it." : "Pick what you did to log it."}</p>
      </div>
      {error && (
        <div className="inline-error">
          {error} <button className="link-btn" onClick={reload}>Retry</button>
        </div>
      )}
      {!routines && !error && <RowSkeleton rows={3} />}
      {routines && (
        <RoutinePicker
          routines={routines}
          disabled={busy}
          freestyleLabel="Freestyle"
          onPick={async (id) => {
            setBusy(true);
            await onStart(id);
            setBusy(false);
          }}
        />
      )}
      {routines && !hasWorkouts && (
        <button className="hint-card" onClick={onGoToRoutines}>
          <Layers />
          <span>
            <strong>Set up routines</strong>
            <span>Create Push / Pull / Legs with workouts like Push › Alpha to start them here in one tap.</span>
          </span>
          <ChevronRight className="row-chevron" />
        </button>
      )}
    </div>
  );
}

/**
 * Switch which routine workout a day follows (logged sets are kept),
 * or delete the day's workout entirely.
 */
function PlanSheet({
  date,
  currentId,
  planLabel,
  setCount,
  onClose,
  onChosen,
  onCleared,
}: {
  date: string;
  currentId: number | null;
  planLabel: string | null;
  setCount: number;
  onClose: () => void;
  onChosen: (plan: RoutineWorkout | null) => void;
  onCleared: () => void;
}) {
  const { data: routines, error, reload } = useLoad(api.routines, []);
  const [busy, setBusy] = useState(false);

  const deleteDay = async () => {
    const what = planLabel ? `${planLabel}` : "this workout";
    const sets = setCount ? ` and all ${setCount} set${setCount === 1 ? "" : "s"} logged` : "";
    if (!confirm(`Delete ${what}${sets} on ${dayLabel(date)}? This can't be undone.`)) return;
    setBusy(true);
    try {
      await api.deleteDay(date);
      haptic(20);
      onCleared();
      onClose();
    } catch (e) {
      toast(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Sheet title="Workout plan" subtitle={dayLabel(date)} onClose={onClose}>
      {error && (
        <div className="inline-error">
          {error} <button className="link-btn" onClick={reload}>Retry</button>
        </div>
      )}
      {!routines && !error && <RowSkeleton rows={3} />}
      {routines && (
        <RoutinePicker
          routines={routines}
          currentId={currentId}
          disabled={busy}
          freestyleLabel="Freestyle (no routine)"
          onPick={async (id) => {
            if (id === currentId) return onClose();
            setBusy(true);
            try {
              onChosen(await api.setDayPlan(date, id));
              haptic(15);
              onClose();
            } catch (e) {
              toast(errorMessage(e));
              setBusy(false);
            }
          }}
        />
      )}
      <button className="btn btn-danger-text btn-wide delete-day" onClick={deleteDay} disabled={busy}>
        <Trash width={20} height={20} /> Delete this workout
      </button>
      <p className="delete-day-note">
        {setCount
          ? `Removes the plan and all ${setCount} set${setCount === 1 ? "" : "s"} logged on this day.`
          : "Removes the plan from this day."}
      </p>
    </Sheet>
  );
}
