import { useState } from "react";
import type { Routine } from "../../shared/types";
import { AccountButton } from "../components/Account";
import { RowSkeleton } from "../components/ExercisePicker";
import { ChevronRight, Layers, Pencil, Plus } from "../components/Icons";
import { NameSheet } from "../components/NameSheet";
import { api } from "../lib/api";
import { useLoad } from "../lib/hooks";

const ROUTINE_SUGGESTIONS = ["Push", "Pull", "Legs", "Upper", "Lower", "Full Body"];
const WORKOUT_SUGGESTIONS = ["Alpha", "Beta", "Heavy", "Light", "A", "B"];

type SheetState =
  | { kind: "new-routine" }
  | { kind: "edit-routine"; routine: Routine }
  | { kind: "new-workout"; routine: Routine };

export function RoutinesScreen({ onOpenWorkout }: { onOpenWorkout: (routineWorkoutId: number) => void }) {
  const { data: routines, setData: setRoutines, error, reload } = useLoad(api.routines, []);
  const [sheet, setSheet] = useState<SheetState | null>(null);

  const taken = (names: string[], suggestions: string[]) =>
    suggestions.filter((s) => !names.some((n) => n.toLowerCase() === s.toLowerCase()));

  return (
    <>
      <header className="topbar">
        <h1 className="title">Routines</h1>
        <AccountButton />
      </header>

      <main className="screen">
        {error && (
          <div className="inline-error">
            {error} <button className="link-btn" onClick={reload}>Retry</button>
          </div>
        )}
        {!routines && !error && <RowSkeleton rows={4} />}

        {routines?.length === 0 && (
          <div className="empty">
            <div className="empty-icon"><Layers width={36} height={36} /></div>
            <h2>Build your split</h2>
            <p>Create routines like Push, Pull and Legs</p>
            <button className="btn btn-primary" onClick={() => setSheet({ kind: "new-routine" })}>
              <Plus /> New routine
            </button>
          </div>
        )}

        {routines?.map((routine) => (
          <section key={routine.id} className="card">
            <button className="card-head" onClick={() => setSheet({ kind: "edit-routine", routine })}>
              <h2>{routine.name}</h2>
              <Pencil className="row-chevron" width={18} height={18} />
            </button>
            <ul className="list">
              {routine.workouts.map((w) => (
                <li key={w.id}>
                  <button className="list-row" onClick={() => onOpenWorkout(w.id)}>
                    <span className="row-main">
                      <span className="row-title">{w.name}</span>
                      <span className="row-sub">
                        {w.exercises.length
                          ? `${w.exercises.length} exercise${w.exercises.length === 1 ? "" : "s"} · ${w.exercises
                              .map((e) => e.name)
                              .join(", ")}`
                          : "No exercises yet"}
                      </span>
                    </span>
                    <ChevronRight className="row-chevron" />
                  </button>
                </li>
              ))}
            </ul>
            <button className="add-set" onClick={() => setSheet({ kind: "new-workout", routine })}>
              <Plus width={18} height={18} /> Add workout
            </button>
          </section>
        ))}
      </main>

      {routines && routines.length > 0 && (
        <button className="fab" onClick={() => setSheet({ kind: "new-routine" })}>
          <Plus /> Routine
        </button>
      )}

      {sheet?.kind === "new-routine" && (
        <NameSheet
          title="New routine"
          label="Routine name"
          placeholder="e.g. Push"
          submitLabel="Create routine"
          suggestions={taken(routines?.map((r) => r.name) ?? [], ROUTINE_SUGGESTIONS)}
          onClose={() => setSheet(null)}
          onSubmit={async (name) => {
            const routine = await api.createRoutine(name);
            setRoutines((prev) => [...(prev ?? []), routine]);
          }}
        />
      )}

      {sheet?.kind === "edit-routine" && (
        <NameSheet
          title="Edit routine"
          label="Routine name"
          initial={sheet.routine.name}
          submitLabel="Save"
          onClose={() => setSheet(null)}
          onSubmit={async (name) => {
            await api.renameRoutine(sheet.routine.id, name);
            reload();
          }}
          deleteLabel="Delete routine"
          onDelete={async () => {
            const count = sheet.routine.workouts.length;
            const message = count
              ? `Delete ${sheet.routine.name} and its ${count} workout${count === 1 ? "" : "s"}? Logged sets are kept.`
              : `Delete ${sheet.routine.name}?`;
            if (!confirm(message)) return false;
            await api.deleteRoutine(sheet.routine.id);
            setRoutines((prev) => (prev ?? []).filter((r) => r.id !== sheet.routine.id));
            return true;
          }}
        />
      )}

      {sheet?.kind === "new-workout" && (
        <NameSheet
          title="New workout"
          subtitle={sheet.routine.name}
          label="Workout name"
          placeholder="e.g. Alpha"
          submitLabel="Create & add exercises"
          suggestions={taken(sheet.routine.workouts.map((w) => w.name), WORKOUT_SUGGESTIONS)}
          onClose={() => setSheet(null)}
          onSubmit={async (name) => {
            const workout = await api.createRoutineWorkout(sheet.routine.id, name);
            onOpenWorkout(workout.id);
          }}
        />
      )}
    </>
  );
}
