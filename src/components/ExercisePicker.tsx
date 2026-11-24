import { useMemo, useState } from "react";
import type { Exercise, ExerciseRef } from "../../shared/types";
import { api, errorMessage } from "../lib/api";
import { agoLabel } from "../lib/dates";
import { useLoad } from "../lib/hooks";
import { toast } from "../lib/toast";
import { ChevronRight, Plus, Search } from "./Icons";

const SUGGESTIONS = [
  "Bench Press",
  "Squat",
  "Deadlift",
  "Overhead Press",
  "Barbell Row",
  "Pull-up",
  "Lat Pulldown",
  "Incline Dumbbell Press",
  "Romanian Deadlift",
  "Leg Press",
  "Bicep Curl",
  "Tricep Pushdown",
  "Lateral Raise",
  "Calf Raise",
];

interface Props {
  onPick: (exercise: ExerciseRef) => void;
}

/** Search existing exercises, or create one by typing its name. */
export function ExercisePicker({ onPick }: Props) {
  const { data: exercises, error, reload } = useLoad(api.exercises, []);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (exercises ?? []).filter((e) => e.name.toLowerCase().includes(q)),
    [exercises, q],
  );
  const exact = (exercises ?? []).some((e) => e.name.toLowerCase() === q);
  const suggestions = useMemo(() => {
    const taken = new Set((exercises ?? []).map((e) => e.name.toLowerCase()));
    return SUGGESTIONS.filter((s) => !taken.has(s.toLowerCase()) && s.toLowerCase().includes(q));
  }, [exercises, q]);

  const create = async (name: string) => {
    if (creating) return;
    setCreating(true);
    try {
      const exercise = await api.createExercise(name);
      onPick(exercise);
    } catch (e) {
      toast(errorMessage(e));
      setCreating(false);
    }
  };

  return (
    <div className="picker">
      <label className="search">
        <Search />
        <input
          type="search"
          placeholder="Search or add exercise"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterKeyHint="go"
          autoCapitalize="words"
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !q) return;
            const hit = matches.find((m) => m.name.toLowerCase() === q) ?? matches[0];
            if (hit && (exact || matches.length === 1)) onPick(hit);
            else create(query.trim());
          }}
        />
      </label>

      {q && !exact && (
        <button className="list-row create-row" onClick={() => create(query.trim())} disabled={creating}>
          <span className="row-icon accent"><Plus /></span>
          <span className="row-main">
            <span className="row-title">Create “{query.trim()}”</span>
          </span>
        </button>
      )}

      {error && (
        <div className="inline-error">
          {error} <button className="link-btn" onClick={reload}>Retry</button>
        </div>
      )}

      {!exercises && !error && <RowSkeleton />}

      {matches.length > 0 && (
        <ul className="list">
          {matches.map((e) => (
            <li key={e.id}>
              <ExerciseRow exercise={e} onClick={() => onPick(e)} />
            </li>
          ))}
        </ul>
      )}

      {exercises && suggestions.length > 0 && (
        <>
          <h3 className="section-label">Suggestions</h3>
          <div className="chips">
            {suggestions.map((s) => (
              <button key={s} className="chip" onClick={() => create(s)} disabled={creating}>
                <Plus width={16} height={16} /> {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ExerciseRow({ exercise, onClick }: { exercise: Exercise; onClick: () => void }) {
  return (
    <button className="list-row" onClick={onClick}>
      <span className="row-main">
        <span className="row-title">{exercise.name}</span>
        <span className="row-sub">
          {exercise.lastDone
            ? `${agoLabel(exercise.lastDone)} · ${exercise.totalSets} sets total`
            : "Not logged yet"}
        </span>
      </span>
      <ChevronRight className="row-chevron" />
    </button>
  );
}

export function RowSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  );
}
