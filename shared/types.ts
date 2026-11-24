// Shapes exchanged between the Netlify Function API and the frontend.

export type Unit = "lb" | "kg";

export interface ExerciseRef {
  id: number;
  name: string;
}

export interface Exercise extends ExerciseRef {
  /** Most recent date (YYYY-MM-DD) this exercise was logged, or null if never. */
  lastDone: string | null;
  totalSets: number;
}

/** One logged set, as shown on a day's workout. */
export interface SetEntry {
  id: number;
  exerciseId: number;
  exerciseName: string;
  reps: number;
  weight: number;
  unit: Unit;
}

export interface SetInput {
  reps: number;
  weight: number;
  unit: Unit;
}

export interface NewSetInput extends SetInput {
  date: string;
  exerciseId: number;
}

export interface DaySummary {
  date: string;
  sets: number;
  exercises: string[];
  /** "Push · Alpha" when the day followed a routine workout. */
  plan: string | null;
}

// ---- routines ----------------------------------------------------------------

/** One exercise slot in a routine workout, with optional targets. */
export interface RoutineExercise {
  exerciseId: number;
  name: string;
  targetSets: number | null;
  targetReps: number | null;
}

export type RoutineExerciseInput = Omit<RoutineExercise, "name">;

/** A named workout inside a routine, e.g. Push > Alpha. */
export interface RoutineWorkout {
  id: number;
  routineId: number;
  routineName: string;
  name: string;
  exercises: RoutineExercise[];
}

/** A routine such as Push, Pull or Legs. */
export interface Routine {
  id: number;
  name: string;
  workouts: RoutineWorkout[];
}

/** Everything the Workout tab needs for one date. */
export interface Day {
  date: string;
  /** The routine workout this day follows, if one was chosen. */
  plan: RoutineWorkout | null;
  sets: SetEntry[];
}

/** All sets of one exercise on one day. */
export interface Session {
  date: string;
  sets: { id: number; reps: number; weight: number; unit: Unit }[];
}
