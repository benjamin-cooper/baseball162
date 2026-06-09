/** Mulberry32 — fast, good-quality seeded PRNG. Returns values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle using the provided PRNG — returns a new array. */
export function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Convert "YYYY-MM-DD" → integer seed. */
export function dateToSeed(date: string): number {
  return parseInt(date.replace(/-/g, ''), 10);
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
