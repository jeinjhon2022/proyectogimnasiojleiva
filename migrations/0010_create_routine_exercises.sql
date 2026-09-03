-- Ejercicios dentro de una rutina, con orden. "position" en vez de "order"
-- (palabra reservada en SQL); "distance_meters" en vez de "distance" (unidad explícita).
CREATE TABLE routine_exercises (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL REFERENCES routines (id),
  exercise_id TEXT NOT NULL REFERENCES exercises (id),
  position INTEGER NOT NULL CHECK (position >= 0),
  sets INTEGER CHECK (sets IS NULL OR sets > 0),
  reps INTEGER CHECK (reps IS NULL OR reps > 0),
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  distance_meters REAL CHECK (distance_meters IS NULL OR distance_meters > 0),
  rest_seconds INTEGER CHECK (rest_seconds IS NULL OR rest_seconds >= 0),
  notes TEXT
);

CREATE INDEX idx_routine_exercises_routine_id ON routine_exercises (routine_id, position);
