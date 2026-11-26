import type { ExerciseRef } from "../../shared/types";
import { AccountButton } from "../components/Account";
import { ExercisePicker } from "../components/ExercisePicker";

export function ExercisesScreen({ onOpenExercise }: { onOpenExercise: (exercise: ExerciseRef) => void }) {
  return (
    <>
      <header className="topbar">
        <h1 className="title">Exercises</h1>
        <AccountButton />
      </header>
      <main className="screen">
        <ExercisePicker onPick={onOpenExercise} />
      </main>
    </>
  );
}
