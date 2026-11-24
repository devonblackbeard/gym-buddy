import { useEffect, useRef, useState } from "react";
import type { ExerciseRef, SetEntry, SetInput, Unit } from "../../shared/types";
import { api, errorMessage } from "../lib/api";
import { agoLabel, dayLabel } from "../lib/dates";
import { defaultWeight, fmtWeight, haptic, weightStep } from "../lib/format";
import { toast } from "../lib/toast";
import { ExercisePicker } from "./ExercisePicker";
import { Trash } from "./Icons";
import { Sheet } from "./Sheet";
import { Stepper } from "./Stepper";

/** What the sheet was opened for. */
export type LogTarget =
  | { kind: "new" }
  | {
      kind: "add";
      exercise: ExerciseRef;
      setNumber: number;
      prefill?: SetInput;
      /** From the day's routine: target reps to start from, and how many sets are planned. */
      targetReps?: number | null;
      targetSets?: number | null;
    }
  | { kind: "edit"; set: SetEntry; setNumber: number };

interface Props {
  target: LogTarget;
  date: string;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onClose: () => void;
  onSaved: (set: SetEntry) => void;
  onDeleted: (id: number) => void;
  /** Number of sets already logged today for an exercise, to label the next set. */
  setsLoggedFor: (exerciseId: number) => number;
}

export function LogSheet({ target, date, unit, onUnitChange, onClose, onSaved, onDeleted, setsLoggedFor }: Props) {
  const [exercise, setExercise] = useState<ExerciseRef | null>(
    target.kind === "add"
      ? target.exercise
      : target.kind === "edit"
        ? { id: target.set.exerciseId, name: target.set.exerciseName }
        : null,
  );

  if (!exercise) {
    return (
      <Sheet title="Add exercise" onClose={onClose}>
        <ExercisePicker onPick={setExercise} />
      </Sheet>
    );
  }

  const setNumber = target.kind === "new" ? setsLoggedFor(exercise.id) + 1 : target.setNumber;
  const ofTarget = target.kind === "add" && target.targetSets ? ` of ${target.targetSets}` : "";
  return (
    <Sheet
      title={exercise.name}
      subtitle={`${target.kind === "edit" ? "Editing set" : "Set"} ${setNumber}${ofTarget} · ${dayLabel(date)}`}
      onClose={onClose}
    >
      <SetForm
        exercise={exercise}
        date={date}
        editing={target.kind === "edit" ? target.set : undefined}
        targetReps={target.kind === "add" ? (target.targetReps ?? undefined) : undefined}
        prefill={target.kind === "add" ? target.prefill : target.kind === "edit" ? target.set : undefined}
        unit={unit}
        onUnitChange={onUnitChange}
        onDone={(set) => {
          onSaved(set);
          onClose();
        }}
        onDeleted={(id) => {
          onDeleted(id);
          onClose();
        }}
      />
    </Sheet>
  );
}

interface FormProps {
  exercise: ExerciseRef;
  date: string;
  editing?: SetEntry;
  prefill?: SetInput;
  /** Routine target, used for reps when there's no prefill. */
  targetReps?: number;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onDone: (set: SetEntry) => void;
  onDeleted: (id: number) => void;
}

function SetForm({
  exercise,
  date,
  editing,
  prefill,
  targetReps,
  unit: preferredUnit,
  onUnitChange,
  onDone,
  onDeleted,
}: FormProps) {
  const [unit, setUnit] = useState<Unit>(prefill?.unit ?? preferredUnit);
  const [weight, setWeight] = useState(prefill?.weight ?? defaultWeight(preferredUnit));
  const [reps, setReps] = useState(prefill?.reps ?? targetReps ?? 8);
  const [busy, setBusy] = useState(false);
  const [lastTime, setLastTime] = useState<{ date: string; sets: SetInput[] } | null>(null);
  const touched = useRef(prefill !== undefined);

  // Show (and, for a fresh exercise, prefill from) the most recent earlier session.
  useEffect(() => {
    let cancelled = false;
    api
      .sessions(exercise.id)
      .then((sessions) => {
        if (cancelled) return;
        const previous = sessions.find((s) => s.date < date);
        if (!previous) return;
        setLastTime(previous);
        if (!touched.current) {
          const last = previous.sets[previous.sets.length - 1];
          setWeight(last.weight);
          setReps(targetReps ?? last.reps); // the routine's rep target wins over last time's reps
          setUnit(last.unit);
        }
      })
      .catch(() => {
        // "last time" is a nice-to-have; ignore failures
      });
    return () => {
      cancelled = true;
    };
  }, [exercise.id, date, targetReps]);

  const changeUnit = (next: Unit) => {
    touched.current = true;
    setUnit(next);
    onUnitChange(next);
  };

  const save = async () => {
    setBusy(true);
    try {
      const input = { reps, weight, unit };
      const set = editing
        ? await api.updateSet(editing.id, input)
        : await api.addSet({ ...input, date, exerciseId: exercise.id });
      haptic(20);
      onDone(set);
    } catch (e) {
      toast(errorMessage(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || !confirm("Delete this set?")) return;
    setBusy(true);
    try {
      await api.deleteSet(editing.id);
      onDeleted(editing.id);
    } catch (e) {
      toast(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="set-form">
      {lastTime && (
        <div className="last-time">
          <span className="last-time-label">Last time · {agoLabel(lastTime.date)}</span>
          <div className="last-time-sets">
            {lastTime.sets.map((s, i) => (
              <button
                key={i}
                type="button"
                className="mini-chip"
                onClick={() => {
                  touched.current = true;
                  setWeight(s.weight);
                  setReps(s.reps);
                  setUnit(s.unit);
                  haptic(8);
                }}
              >
                {fmtWeight(s.weight)}
                <small>{s.unit}</small> × {s.reps}
              </button>
            ))}
          </div>
        </div>
      )}

      <Stepper
        label="Weight"
        value={weight}
        step={weightStep(unit)}
        max={5000}
        onChange={(v) => {
          touched.current = true;
          setWeight(v);
        }}
      >
        <div className="unit-toggle" role="group" aria-label="Unit">
          {(["lb", "kg"] as const).map((u) => (
            <button
              key={u}
              type="button"
              className={u === unit ? "active" : ""}
              aria-pressed={u === unit}
              onClick={() => changeUnit(u)}
            >
              {u}
            </button>
          ))}
        </div>
      </Stepper>

      <Stepper
        label="Reps"
        value={reps}
        step={1}
        max={1000}
        integer
        onChange={(v) => {
          touched.current = true;
          setReps(v);
        }}
      >
        <span className="stepper-unit">reps</span>
      </Stepper>

      <div className="form-actions">
        {editing && (
          <button type="button" className="btn btn-danger-ghost" onClick={remove} disabled={busy} aria-label="Delete set">
            <Trash />
          </button>
        )}
        <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Log set"}
        </button>
      </div>
    </div>
  );
}
