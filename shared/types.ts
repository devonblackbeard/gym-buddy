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
}

/** All sets of one exercise on one day. */
export interface Session {
  date: string;
  sets: { id: number; reps: number; weight: number; unit: Unit }[];
}

/** Total steps for one day, as synced from Apple Health. */
export interface StepDay {
  date: string;
  steps: number;
}
