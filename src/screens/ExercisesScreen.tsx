import type { ExerciseRef } from "../../shared/types";
import { ExercisePicker } from "../components/ExercisePicker";

export function ExercisesScreen({ onOpenExercise }: { onOpenExercise: (exercise: ExerciseRef) => void }) {
  return (
    <>
      <header className="topbar">
        <h1 className="title">Exercises</h1>
      </header>
      <main className="screen">
        <ExercisePicker onPick={onOpenExercise} />
      </main>
    </>
  );
}
