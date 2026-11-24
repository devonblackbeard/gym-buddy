import type { Routine } from "../../shared/types";
import { Check, ChevronRight, Shuffle } from "./Icons";

interface Props {
  routines: Routine[];
  currentId?: number | null;
  onPick: (routineWorkoutId: number | null) => void;
  disabled?: boolean;
  /** Label for the "no routine" option. */
  freestyleLabel?: string;
}

/** Routines grouped with their workouts, plus a "freestyle" option. */
export function RoutinePicker({ routines, currentId, onPick, disabled, freestyleLabel = "Freestyle" }: Props) {
  const withWorkouts = routines.filter((r) => r.workouts.length > 0);

  return (
    <div className="routine-picker">
      {withWorkouts.map((routine) => (
        <section key={routine.id}>
          <h3 className="section-label">{routine.name}</h3>
          <ul className="list list-card">
            {routine.workouts.map((w) => (
              <li key={w.id}>
                <button className="list-row" onClick={() => onPick(w.id)} disabled={disabled}>
                  <span className="row-main">
                    <span className="row-title">{w.name}</span>
                    <span className="row-sub">
                      {w.exercises.length
                        ? w.exercises.map((e) => e.name).join(", ")
                        : "No exercises yet"}
                    </span>
                  </span>
                  {currentId === w.id ? <Check className="row-check" /> : <ChevronRight className="row-chevron" />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <ul className="list list-card freestyle">
        <li>
          <button className="list-row" onClick={() => onPick(null)} disabled={disabled}>
            <span className="row-icon accent"><Shuffle /></span>
            <span className="row-main">
              <span className="row-title">{freestyleLabel}</span>
              <span className="row-sub">No routine, add exercises as you go</span>
            </span>
            {currentId === null && <Check className="row-check" />}
          </button>
        </li>
      </ul>
    </div>
  );
}
