// Slot positions (what you fill on the roster) + player data positions (SP, RP used in data)
export type Position =
  | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF'
  | 'SP' | 'RP'              // player data positions (not draft slots)
  | 'SP1' | 'SP2' | 'SP3' | 'SP4' | 'SP5' | 'CL'; // draft slots

export const BATTER_POSITIONS: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
export const ROTATION_SLOTS:   Position[] = ['SP1', 'SP2', 'SP3', 'SP4', 'SP5'];
export const CORNER_OF:        Position[] = ['LF', 'RF'];
export const MIDDLE_IF:        Position[] = ['2B', 'SS'];

/** Which roster slots a player can fill based on their data position.
 *  SP players fill any rotation slot (SP1–SP5).
 *  RP players fill the closer slot (CL).
 *  Corner OF and middle IF can swap sides. */
export function eligibleSlots(playerPosition: Position): Position[] {
  if (playerPosition === 'SP' || ROTATION_SLOTS.includes(playerPosition)) return ROTATION_SLOTS;
  if (playerPosition === 'RP' || playerPosition === 'CL') return ['CL'];
  if (CORNER_OF.includes(playerPosition)) return CORNER_OF;
  if (MIDDLE_IF.includes(playerPosition)) return MIDDLE_IF;
  return [playerPosition];
}

// The 14 draft slots (in order)
export const POSITIONS: Position[] = [
  'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF',
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
  SP:  'Starting Pitcher',
  RP:  'Relief Pitcher',
  SP1: 'Ace',
  SP2: 'No. 2 Starter',
  SP3: 'No. 3 Starter',
  SP4: 'No. 4 Starter',
  SP5: 'No. 5 Starter',
  CL:  'Closer',
};

export interface BatterStats {
  gp: number;
  hr: number;
  rbi: number;
  avg: number;
  obp: number;
  slg: number;
  ops: number;
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
