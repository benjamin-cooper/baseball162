'use client';

export type Difficulty = 'normal' | 'blind' | 'blackout';
export type DraftMode  = 'regular' | 'daily';

export interface GameRecord {
  date:          string;       // ISO date "2026-06-07"
  wins:          number;
  losses:        number;
  rating:        string;
  mode:          DraftMode;
  difficulty:    Difficulty;
  strengthScore: number;
  optimalWins?:  number;       // best possible W from same draft pools
}

const KEY = 'baseball162_history';

export function saveGame(record: GameRecord): void {
  if (typeof window === 'undefined') return;
  const history = loadHistory();
  history.unshift(record);
  if (history.length > 100) history.splice(100);
  try { localStorage.setItem(KEY, JSON.stringify(history)); } catch { /* quota */ }
}

export function loadHistory(): GameRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GameRecord[]) : [];
  } catch { return []; }
}

export function getBestRecord(): GameRecord | null {
  const h = loadHistory();
  if (!h.length) return null;
  return h.reduce((best, r) => r.wins > best.wins ? r : best);
}

export function getGamesPlayed(): number {
  return loadHistory().length;
}

export function deleteGame(index: number): void {
  if (typeof window === 'undefined') return;
  const history = loadHistory();
  history.splice(index, 1);
  try { localStorage.setItem(KEY, JSON.stringify(history)); } catch { /* quota */ }
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(KEY); } catch { /* quota */ }
}
