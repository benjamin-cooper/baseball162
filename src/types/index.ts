// Slot positions (what you fill on the roster) + player data positions (SP, RP/CL/SU used in data)
export type Position =
  | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH'
  | 'SP' | 'RP' | 'CL' | 'SU'          // player data positions (not draft slots)
  | 'SP1' | 'SP2' | 'SP3' | 'SP4' | 'SP5' | 'CL'; // draft slots

export const BATTER_POSITIONS: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
export const ROTATION_SLOTS:   Position[] = ['SP1', 'SP2', 'SP3', 'SP4', 'SP5'];
export const CORNER_OF:        Position[] = ['LF', 'RF'];
export const MIDDLE_IF:        Position[] = ['2B', 'SS'];

/** Which roster slots a player can fill based on their data position.
 *  SP → any rotation slot (SP1–SP5).
 *  CL → closer slot only.
 *  SU → setup slot only.
 *  RP (legacy) → CL or SU (backward-compat for old player data).
 *  Corner OF and middle IF can swap sides.
 *  DH only DH; 1B can slide to DH as fallback. */
export function eligibleSlots(playerPosition: Position): Position[] {
  if (playerPosition === 'SP' || ROTATION_SLOTS.includes(playerPosition)) return ROTATION_SLOTS;
  if (playerPosition === 'CL') return ['CL'];
  if (playerPosition === 'SU') return [];  // no SU slot
  if (playerPosition === 'RP') return [];  // BBRef generic tag; use p.position (CL/SU/SP) for real eligibility
  if (CORNER_OF.includes(playerPosition)) return CORNER_OF;
  if (MIDDLE_IF.includes(playerPosition)) return MIDDLE_IF;
  if (playerPosition === 'DH') return ['DH'];
  if (playerPosition === '1B') return ['1B', 'DH'];
  return [playerPosition];
}

// The 15 draft slots (in order)
export const POSITIONS: Position[] = [
  'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH',
  'SP1', 'SP2', 'SP3', 'SP4', 'SP5', 'CL',
];

export const POSITION_LABELS: Record<Position, string> = {
  C:   'Catcher',
  '1B':'First Base',
  '2B':'Second Base',
  '3B':'Third Base',
  SS:  'Shortstop',
  LF:  'Left Field',
  CF:  'Center Field',
  RF:  'Right Field',
  DH:  'Designated Hitter',
  SP:  'Starting Pitcher',
  RP:  'Relief Pitcher',
  CL:  'Closer',
  SU:  'Set Up',
  SP1: 'Ace',
  SP2: 'No. 2 Starter',
  SP3: 'No. 3 Starter',
  SP4: 'No. 4 Starter',
  SP5: 'No. 5 Starter',
};

export interface BatterStats {
  gp: number;
  hr: number;
  rbi: number;
  avg: number;
  obp: number;
  slg: number;
  ops: number;
  sb?: number;   // decade-total stolen bases (added by add_sb.py; absent = 0)
  war: number;
  errors: number;
  fieldingPct: number;
}

export interface PitcherStats {
  g: number;
  gs: number;
  w: number;
  era: number;
  whip: number;
  kper9: number;
  sv: number;
  ip: number;
  war: number;
}

export type PlayerStats = BatterStats | PitcherStats;

export function isBatterStats(stats: PlayerStats): stats is BatterStats {
  return 'ops' in stats;
}

export function isPitcherStats(stats: PlayerStats): stats is PitcherStats {
  return 'era' in stats;
}

export interface PlayerAwards {
  hof?: boolean;
  mvp_wins?: number;
  cy_young_wins?: number;
  roy?: boolean;
  allstar?: number;
  gold_gloves?: number;
  silver_sluggers?: number;
}

export interface Player {
  id: number;
  name: string;
  initials: string;
  position: Position;
  positions: Position[];
  franchise: string;
  franchiseAbbr: string;
  decade: string;
  stats: PlayerStats;
  strengthScore: number;
  awards?: PlayerAwards;
  awardsBonus?: number;
}

export interface DraftedPlayer extends Player {
  slotPosition: Position;
}

export interface TeamResult {
  players: DraftedPlayer[];
  wins: number;
  losses: number;
  rating: string;
  strengthScore: number;
}
