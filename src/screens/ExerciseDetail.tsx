import { useState } from "react";
import type { ExerciseRef, Session } from "../../shared/types";
import { RowSkeleton } from "../components/ExercisePicker";
import { ChevronLeft, ChevronRight, Trash, Trophy } from "../components/Icons";
import { api, errorMessage } from "../lib/api";
import { agoLabel, dayLabel } from "../lib/dates";
import { fmtWeight } from "../lib/format";
import { useBackToClose, useLoad } from "../lib/hooks";
import { toast } from "../lib/toast";

const KG_PER_LB = 0.45359237;

/** Heaviest set, comparing across units, ties broken by reps. */
function bestSet(sessions: Session[]) {
  let best: (Session["sets"][number] & { date: string; kg: number }) | null = null;
  for (const session of sessions) {
    for (const set of session.sets) {
      const kg = set.unit === "kg" ? set.weight : set.weight * KG_PER_LB;
      if (!best || kg > best.kg || (kg === best.kg && set.reps > best.reps)) {
        best = { ...set, date: session.date, kg };
      }
    }
  }
  return best;
}

interface Props {
  exercise: ExerciseRef;
  onClose: () => void;
  onOpenDay: (date: string) => void;
  onDeleted: () => void;
}

/** Full-screen page pushed over the tabs: progress for one exercise. */
export function ExerciseDetail({ exercise, onClose, onOpenDay, onDeleted }: Props) {
  useBackToClose(onClose);
  const { data: sessions, error, reload } = useLoad(() => api.sessions(exercise.id), [exercise.id]);
  const [deleting, setDeleting] = useState(false);

  const best = sessions ? bestSet(sessions) : null;
  const totalSets = sessions?.reduce((n, s) => n + s.sets.length, 0) ?? 0;

  const remove = async () => {
    const warning = totalSets
      ? `Delete ${exercise.name} and all ${totalSets} logged sets? This can't be undone.`
      : `Delete ${exercise.name}?`;
    if (!confirm(warning)) return;
    setDeleting(true);
    try {
      await api.deleteExercise(exercise.id);
      onDeleted();
    } catch (e) {
      toast(errorMessage(e));
      setDeleting(false);
    }
  };

  return (
    <div className="page" role="dialog" aria-label={exercise.name}>
      <header className="topbar topbar-nav">
        <button className="icon-btn" onClick={onClose} aria-label="Back">
          <ChevronLeft />
        </button>
        <h1 className="title title-sm">{exercise.name}</h1>
        <button className="icon-btn danger" onClick={remove} disabled={deleting} aria-label="Delete exercise">
          <Trash />
        </button>
      </header>
      <main className="screen">
        {error && (
          <div className="inline-error">
            {error} <button className="link-btn" onClick={reload}>Retry</button>
          </div>
        )}
        {!sessions && !error && <RowSkeleton />}
        {sessions && (
          <div className="stats">
            <div className="stat">
              <span className="stat-value">{sessions.length}</span>
              <span className="stat-label">Sessions</span>
            </div>
            <div className="stat">
              <span className="stat-value">{totalSets}</span>
              <span className="stat-label">Sets</span>
            </div>
            <div className="stat">
              <span className="stat-value">{sessions[0] ? agoLabel(sessions[0].date) : "—"}</span>
              <span className="stat-label">Last done</span>
            </div>
          </div>
        )}
        {best && (
          <div className="best">
            <Trophy />
            <div>
              <span className="best-label">Heaviest set</span>
              <span className="best-value">
                {fmtWeight(best.weight)} {best.unit} × {best.reps}
              </span>
            </div>
            <span className="best-date">{dayLabel(best.date)}</span>
          </div>
        )}
        {sessions?.length === 0 && (
          <div className="empty">
            <h2>No sets yet</h2>
            <p>Log this exercise from the Today tab and its history will show up here.</p>
          </div>
        )}
        {sessions && sessions.length > 0 && <h3 className="section-label">Sessions</h3>}
        <ul className="list list-card">
          {sessions?.map((session) => (
            <li key={session.date}>
              <button className="list-row session-row" onClick={() => onOpenDay(session.date)}>
                <span className="row-main">
                  <span className="row-title">{dayLabel(session.date)}</span>
                  <span className="session-sets">
                    {session.sets.map((s) => (
                      <span key={s.id} className="mini-chip static">
                        {fmtWeight(s.weight)}
                        <small>{s.unit}</small> × {s.reps}
                      </span>
                    ))}
                  </span>
                </span>
                <ChevronRight className="row-chevron" />
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
