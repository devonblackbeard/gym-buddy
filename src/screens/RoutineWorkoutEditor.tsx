import { useEffect, useRef, useState } from "react";
import type { RoutineExercise, RoutineWorkout } from "../../shared/types";
import { ExercisePicker, RowSkeleton } from "../components/ExercisePicker";
import { ChevronDown, ChevronLeft, ChevronUp, Close, Minus, Pencil, Plus } from "../components/Icons";
import { NameSheet } from "../components/NameSheet";
import { Sheet } from "../components/Sheet";
import { api, errorMessage } from "../lib/api";
import { haptic } from "../lib/format";
import { useBackToClose, useLoad } from "../lib/hooks";
import { toast } from "../lib/toast";

interface Props {
  routineWorkoutId: number;
  onClose: () => void;
  /** Start this workout today, then show it on the Workout tab. */
  onStart: () => Promise<void>;
}

/** Full-screen page for building one routine workout, e.g. Push › Alpha. Changes save automatically. */
export function RoutineWorkoutEditor({ routineWorkoutId, onClose, onStart }: Props) {
  useBackToClose(onClose);
  const { data: workout, setData: setWorkout, error, reload } = useLoad(
    () => api.routineWorkout(routineWorkoutId),
    [routineWorkoutId],
  );
  const [sheet, setSheet] = useState<"add" | "rename" | null>(null);
  const [starting, setStarting] = useState(false);

  // Debounced save of the exercise list so tapping steppers doesn't fire a request per tap.
  const pending = useRef<RoutineExercise[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flush = async () => {
    clearTimeout(timer.current);
    const list = pending.current;
    if (!list) return;
    pending.current = null;
    try {
      await api.updateRoutineWorkout(routineWorkoutId, {
        exercises: list.map(({ exerciseId, targetSets, targetReps }) => ({ exerciseId, targetSets, targetReps })),
      });
    } catch (e) {
      toast(errorMessage(e));
      reload();
    }
  };

  useEffect(() => () => void flush(), []); // save anything pending when the page closes

  const update = (exercises: RoutineExercise[], immediate = false) => {
    setWorkout((prev) => (prev ? { ...prev, exercises } : prev));
    pending.current = exercises;
    clearTimeout(timer.current);
    if (immediate) void flush();
    else timer.current = setTimeout(flush, 600);
  };

  const exercises = workout?.exercises ?? [];

  const move = (index: number, dir: -1 | 1) => {
    const next = [...exercises];
    [next[index], next[index + dir]] = [next[index + dir], next[index]];
    haptic(8);
    update(next, true);
  };

  const patch = (index: number, changes: Partial<RoutineExercise>) =>
    update(exercises.map((e, i) => (i === index ? { ...e, ...changes } : e)));

  const start = async () => {
    setStarting(true);
    try {
      await flush();
      await onStart();
    } catch (e) {
      toast(errorMessage(e));
      setStarting(false);
    }
  };

  return (
    <div className="page" role="dialog" aria-label={workout ? `${workout.routineName} ${workout.name}` : "Workout"}>
      <header className="topbar topbar-nav">
        <button className="icon-btn" onClick={onClose} aria-label="Back">
          <ChevronLeft />
        </button>
        <button className="page-title" onClick={() => workout && setSheet("rename")} disabled={!workout}>
          <span className="eyebrow">{workout?.routineName ?? " "}</span>
          <span className="title title-sm">
            {workout?.name ?? ""} {workout && <Pencil width={16} height={16} className="title-pencil" />}
          </span>
        </button>
        <span className="icon-btn-spacer" />
      </header>

      <main className="screen editor-screen">
        {error && (
          <div className="inline-error">
            {error} <button className="link-btn" onClick={reload}>Retry</button>
          </div>
        )}
        {!workout && !error && <RowSkeleton rows={3} />}

        {workout && exercises.length === 0 && (
          <div className="empty compact">
            <h2>Add exercises</h2>
            <p>Pick the exercises for {workout.routineName} › {workout.name}, in the order you do them.</p>
          </div>
        )}

        <ol className="plan-list">
          {exercises.map((e, i) => (
            <li key={e.exerciseId} className="card plan-item">
              <div className="plan-item-head">
                <span className="set-num">{i + 1}</span>
                <h2>{e.name}</h2>
                <div className="plan-item-actions">
                  <button className="mini-icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${e.name} up`}>
                    <ChevronUp />
                  </button>
                  <button
                    className="mini-icon"
                    onClick={() => move(i, 1)}
                    disabled={i === exercises.length - 1}
                    aria-label={`Move ${e.name} down`}
                  >
                    <ChevronDown />
                  </button>
                  <button
                    className="mini-icon danger"
                    onClick={() => update(exercises.filter((_, j) => j !== i), true)}
                    aria-label={`Remove ${e.name}`}
                  >
                    <Close />
                  </button>
                </div>
              </div>
              <div className="targets">
                <MiniStepper
                  label="Sets"
                  value={e.targetSets}
                  fallback={3}
                  max={20}
                  onChange={(v) => patch(i, { targetSets: v })}
                />
                <span className="targets-x">×</span>
                <MiniStepper
                  label="Reps"
                  value={e.targetReps}
                  fallback={10}
                  max={100}
                  onChange={(v) => patch(i, { targetReps: v })}
                />
              </div>
            </li>
          ))}
        </ol>

        {workout && (
          <button className="btn btn-secondary btn-wide" onClick={() => setSheet("add")}>
            <Plus /> Add exercise
          </button>
        )}
      </main>

      {workout && exercises.length > 0 && (
        <div className="page-footer">
          <button className="btn btn-primary btn-wide" onClick={start} disabled={starting}>
            {starting ? "Starting…" : "Start this workout today"}
          </button>
        </div>
      )}

      {sheet === "add" && workout && (
        <Sheet title="Add exercise" subtitle={`${workout.routineName} › ${workout.name}`} onClose={() => setSheet(null)}>
          <ExercisePicker
            onPick={(picked) => {
              if (exercises.some((e) => e.exerciseId === picked.id)) {
                toast(`${picked.name} is already in this workout`, "info");
                return;
              }
              update([...exercises, { exerciseId: picked.id, name: picked.name, targetSets: 3, targetReps: 10 }], true);
              setSheet(null);
            }}
          />
        </Sheet>
      )}

      {sheet === "rename" && workout && (
        <NameSheet
          title="Edit workout"
          subtitle={workout.routineName}
          label="Workout name"
          initial={workout.name}
          submitLabel="Save"
          onClose={() => setSheet(null)}
          onSubmit={async (name) => {
            const updated = await api.updateRoutineWorkout(workout.id, { name });
            setWorkout((prev: RoutineWorkout | null) => (prev ? { ...prev, name: updated.name } : prev));
          }}
          deleteLabel="Delete workout"
          onDelete={async () => {
            if (!confirm(`Delete ${workout.routineName} › ${workout.name}? Logged sets are kept.`)) return false;
            pending.current = null;
            await api.deleteRoutineWorkout(workout.id);
            onClose();
            return true;
          }}
        />
      )}
    </div>
  );
}

interface MiniStepperProps {
  label: string;
  value: number | null;
  fallback: number;
  max: number;
  onChange: (value: number | null) => void;
}

/** Compact −/+ for an optional target. Below 1 clears the target ("—"). */
function MiniStepper({ label, value, fallback, max, onChange }: MiniStepperProps) {
  return (
    <div className="mini-stepper">
      <span className="mini-stepper-label">{label}</span>
      <div className="mini-stepper-row">
        <button
          className="mini-icon"
          onClick={() => {
            haptic(6);
            onChange(value === null || value <= 1 ? null : value - 1);
          }}
          disabled={value === null}
          aria-label={`Fewer ${label.toLowerCase()}`}
        >
          <Minus />
        </button>
        <span className="mini-stepper-value" aria-live="polite">{value ?? "—"}</span>
        <button
          className="mini-icon"
          onClick={() => {
            haptic(6);
            onChange(value === null ? fallback : Math.min(max, value + 1));
          }}
          aria-label={`More ${label.toLowerCase()}`}
        >
          <Plus />
        </button>
      </div>
    </div>
  );
}
