// Coercing coach-style set/rep prescriptions into storable integers (NWE-120
// follow-up). The loosened program schema accepts what a real coach writes —
// "8-12", "AMRAP", "30-60 seconds hold", 3 — but routine_exercises columns are
// integers (target_sets int > 0, target_reps int > 0 nullable). These pure
// functions bridge the two: display keeps the rich string; storage gets a sane int.

/** Sets for storage: first integer found, clamped ≥1; fallback 3. */
export function parseSetCount(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.round(value));
  if (typeof value === 'string') {
    const match = value.match(/\d+/);
    if (match) return Math.max(1, parseInt(match[0], 10));
  }
  return 3;
}

/**
 * Reps for storage: the LOWER bound of a range ("8-12" → 8), a plain int, or null
 * for non-rep prescriptions (AMRAP, timed holds like "30-60 seconds", "max").
 * Null is correct — the column is nullable exactly for cardio/timed work.
 */
export function parseRepTarget(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.round(value);
    return n > 0 ? n : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    // Time-based or open-ended prescriptions have no rep target.
    if (/amrap|max|fail|second|sec\b|minute|min\b|hold/.test(trimmed)) return null;
    const match = trimmed.match(/\d+/);
    if (match) {
      const n = parseInt(match[0], 10);
      return n > 0 ? n : null;
    }
  }
  return null;
}
