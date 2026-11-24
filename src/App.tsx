import { useEffect, useState } from "react";
import type { ExerciseRef } from "../shared/types";
import { Clock, Dumbbell, Layers, List } from "./components/Icons";
import { api } from "./lib/api";
import { todayISO } from "./lib/dates";
import { useUnit } from "./lib/hooks";
import { onToast, type ToastMessage } from "./lib/toast";
import { ExerciseDetail } from "./screens/ExerciseDetail";
import { ExercisesScreen } from "./screens/ExercisesScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { RoutinesScreen } from "./screens/RoutinesScreen";
import { RoutineWorkoutEditor } from "./screens/RoutineWorkoutEditor";
import { TodayScreen } from "./screens/TodayScreen";

type Tab = "today" | "routines" | "history" | "exercises";

const TABS: { id: Tab; label: string; Icon: typeof Dumbbell }[] = [
  { id: "today", label: "Workout", Icon: Dumbbell },
  { id: "routines", label: "Routines", Icon: Layers },
  { id: "history", label: "History", Icon: Clock },
  { id: "exercises", label: "Exercises", Icon: List },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [date, setDate] = useState(todayISO);
  const [unit, setUnit] = useUnit();
  const [detail, setDetail] = useState<ExerciseRef | null>(null);
  const [editingWorkoutId, setEditingWorkoutId] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);

  const openDay = (d: string) => {
    setDetail(null);
    setDate(d);
    setTab("today");
  };

  const selectTab = (next: Tab) => {
    // Tapping Workout while already there jumps back to today.
    if (next === "today" && tab === "today") setDate(todayISO());
    setTab(next);
  };

  return (
    <div className="app">
      <div className="view" key={`${tab}-${refresh}`}>
        {tab === "today" && (
          <TodayScreen
            date={date}
            onDateChange={setDate}
            unit={unit}
            onUnitChange={setUnit}
            onOpenExercise={setDetail}
            onGoToRoutines={() => setTab("routines")}
          />
        )}
        {tab === "routines" && <RoutinesScreen onOpenWorkout={setEditingWorkoutId} />}
        {tab === "history" && <HistoryScreen onOpenDay={openDay} />}
        {tab === "exercises" && <ExercisesScreen onOpenExercise={setDetail} />}
      </div>

      <nav className="tabbar" aria-label="Main">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={id === tab ? "tab active" : "tab"}
            onClick={() => selectTab(id)}
            aria-current={id === tab ? "page" : undefined}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {editingWorkoutId !== null && (
        <RoutineWorkoutEditor
          key={editingWorkoutId}
          routineWorkoutId={editingWorkoutId}
          onClose={() => {
            setEditingWorkoutId(null);
            setRefresh((r) => r + 1); // routine list may have changed
          }}
          onStart={async () => {
            const today = todayISO();
            await api.setDayPlan(today, editingWorkoutId);
            setEditingWorkoutId(null);
            setDate(today);
            setTab("today");
            setRefresh((r) => r + 1);
          }}
        />
      )}

      {detail && (
        <ExerciseDetail
          key={detail.id}
          exercise={detail}
          onClose={() => setDetail(null)}
          onOpenDay={openDay}
          onDeleted={() => {
            setDetail(null);
            setRefresh((r) => r + 1);
          }}
        />
      )}

      <Toaster />
    </div>
  );
}

function Toaster() {
  const [message, setMessage] = useState<(ToastMessage & { id: number }) | null>(null);

  useEffect(() => onToast((m) => setMessage({ ...m, id: Date.now() })), []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;
  return (
    <div key={message.id} className={`toast toast-${message.tone}`} role="status" onClick={() => setMessage(null)}>
      {message.text}
    </div>
  );
}
