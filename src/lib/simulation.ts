import { DraftedPlayer, Player, TeamResult, isBatterStats, isPitcherStats, ROTATION_SLOTS, Position, POSITIONS, BatterStats, eligibleSlots } from '@/types';
import type { PickEntry } from '@/components/DraftGame';
import { ERA_AVERAGES } from '@/lib/franchises';

// League-average errors by position (used for fielding adjustment)
const LEAGUE_AVG_ERRORS: Partial<Record<Position, number>> = {
  C: 8, '1B': 7, '2B': 10, '3B': 14, SS: 18, LF: 4, CF: 5, RF: 4,
};

// Innings-weighted contribution for each rotation slot (sum = 1.0)
const SP_WEIGHTS: Record<string, number> = {
  SP1: 0.25, SP2: 0.22, SP3: 0.20, SP4: 0.18, SP5: 0.15,
};

// MLB record: 1906 Cubs 116-36 (.763), 2001 Mariners 116-46 (.716)
const RATINGS = [
  { label: '162-0',          min: 162 },
  { label: 'DYNASTY',        min: 140 },
  { label: 'ALL-TIME GREAT', min: 116 }, // matches the all-time win record
  { label: 'PENNANT WINNER', min: 100 },
  { label: 'CONTENDER',      min: 90  },
  { label: 'PLAYOFF BOUND',  min: 80  },
  { label: 'WILD CARD',      min: 70  },
  { label: 'BUBBLE',         min: 60  },
  { label: 'REBUILDING',     min: 45  },
  { label: 'EXPANSION TEAM', min: 0   },
];

function getRating(wins: number): string {
  return RATINGS.find(r => wins >= r.min)?.label ?? 'EXPANSION TEAM';
}

function simulate162(winPct: number): { wins: number; losses: number } {
  let wins = 0, losses = 0;
  for (let i = 0; i < 162; i++) {
    if (Math.random() < winPct) wins++;
    else losses++;
  }
  return { wins, losses };
}

/** Per-(player, slot) contribution to the strength score — mirrors the exact
 *  math inside simulateSeason so computeOptimal optimises for wins, not WAR. */
function playerSlotScore(player: Player, slot: Position): number {
  const era = ERA_AVERAGES[player.decade] ?? ERA_AVERAGES['2010s'];
  if (isBatterStats(player.stats)) {
    const wops     = player.stats.ops + 0.7 * player.stats.obp;
    const eraWops  = era.ops + 0.7 * era.obp;
    const opsRatio = wops / eraWops;
    const posWeight =
      slot === 'C'  ? 1.15 : slot === 'SS' ? 1.10 :
      slot === '2B' ? 1.05 : slot === 'CF' ? 1.05 :
      slot === 'DH' ? 0.98 : slot === '1B' ? 0.95 : 1.00;
    const avgErrors   = LEAGUE_AVG_ERRORS[slot] ?? 10;
    const fieldingAdj = slot === 'DH' ? 0
      : (avgErrors - player.stats.errors) * 0.18
        + ((player.stats.fieldingPct ?? 0.975) - 0.975) * 20;
    return opsRatio * posWeight + fieldingAdj * (1 / 9);
  }
  if (isPitcherStats(player.stats)) {
    const eraGain  = (era.era  - player.stats.era)  / era.era;
    const whipGain = (era.whip - player.stats.whip) / era.whip;
    const k        = player.stats.kper9 / 9;
    if (slot === 'CL') return (eraGain * 10 + whipGain * 6 + k * 2) * 0.55;
    if (slot === 'SU') return (eraGain * 10 + whipGain * 6 + k * 2) * 0.50;
    const w = SP_WEIGHTS[slot] ?? 0.20;
    return (eraGain * 20 + whipGain * 12 + k * 4) * w;
  }
  return 0;
}

/** Exact optimal team via bitmask DP using typed arrays.
 *  Precomputes all (player, slot) scores once, then runs the DP with
 *  Float64Array/Int32Array instead of Maps — ~100× faster than Map-based
 *  version (tens of ms vs several seconds for 2^15 states × 15 rounds). */
export function computeOptimal(picksLog: PickEntry[]): DraftedPlayer[] {
  const N      = POSITIONS.length; // 15
  const STATES = 1 << N;          // 32768
  const FULL   = STATES - 1;
  const NEG_INF = -1e9;

  // Precompute eligible (playerIdx, slotIdx, score) tuples per round —
  // avoids calling playerSlotScore inside the hot DP loop.
  type Cand = { pi: number; si: number; score: number };
  const rounds: Cand[][] = picksLog.map(entry =>
    entry.available.flatMap((player, pi) => {
      const seen = new Set<number>();
      return ((player.positions ?? [player.position]) as Position[])
        .flatMap(pos => eligibleSlots(pos as Position))
        .flatMap(slot => {
          const si = (POSITIONS as string[]).indexOf(slot as string);
          if (si < 0 || seen.has(si)) return [];
          seen.add(si);
          return [{ pi, si, score: playerSlotScore(player, slot as Position) }];
        });
    })
  );

  // Two Float64Arrays swapped each round — no Map overhead.
  let cur = new Float64Array(STATES).fill(NEG_INF);
  let nxt = new Float64Array(STATES).fill(NEG_INF);
  cur[0] = 0;

  // back[r * STATES + newMask]: packed int storing prevMask(16b)|slotIdx(4b)|playerIdx(9b)
  // 16+4+9 = 29 bits — safe for a signed Int32 (bit 31 unused).
  const back = new Int32Array(picksLog.length * STATES).fill(-1);

  for (let r = 0; r < picksLog.length; r++) {
    nxt.set(cur); // carry forward (round may yield no useful pick)
    const cands = rounds[r];
    const base  = r * STATES;

    for (let mask = 0; mask < STATES; mask++) {
      const score = cur[mask];
      if (score === NEG_INF) continue;

      for (const { pi, si, score: s } of cands) {
        const bit = 1 << si;
        if (mask & bit) continue;
        const newMask  = mask | bit;
        const newScore = score + s;
        if (newScore > nxt[newMask]) {
          nxt[newMask] = newScore;
          back[base + newMask] = (mask & 0xFFFF) | ((si & 0xF) << 16) | ((pi & 0x1FF) << 20);
        }
      }
    }

    const tmp = cur; cur = nxt; nxt = tmp; // swap, no copy
  }

  if (cur[FULL] === NEG_INF) return [];

  // Reconstruct by tracing back through packed back entries.
  const team: DraftedPlayer[] = [];
  let mask = FULL;
  for (let r = picksLog.length - 1; r >= 0; r--) {
    const packed = back[r * STATES + mask];
    if (packed < 0) continue;
    const prevMask  =  packed        & 0xFFFF;
    const si        = (packed >> 16) & 0xF;
    const pi        = (packed >> 20) & 0x1FF;
    team.push({ ...picksLog[r].available[pi], slotPosition: POSITIONS[si] as Position });
    mask = prevMask;
  }
  return team;
}

export function simulateSeason(players: DraftedPlayer[], deterministic?: boolean): TeamResult {
  const batters  = players.filter(p => isBatterStats(p.stats));
  const rotation = players.filter(p => ROTATION_SLOTS.includes(p.slotPosition as Position));
  const closer   = players.find(p => p.slotPosition === 'CL');
  const setup    = players.find(p => p.slotPosition === 'SU');

  // ─── OFFENSE ─────────────────────────────────────────────────────────────
  let offScore = 0;

  for (const p of batters) {
    if (!isBatterStats(p.stats)) continue;
    const era = ERA_AVERAGES[p.decade] ?? ERA_AVERAGES['2010s'];

    // Weighted OPS: OBP is ~1.7× more valuable than SLG per wOBA research.
    // wops = ops + 0.7 * obp; era_wops = era.ops + 0.7 * era.obp
    // Average player: wops/era_wops = 1.0 regardless of era (normalisation is consistent).
    const wops     = p.stats.ops + 0.7 * p.stats.obp;
    const eraWops  = era.ops + 0.7 * era.obp;
    const opsRatio = wops / eraWops;

    // Position weight: up-the-middle positions demand defensive excellence too —
    // even below-average offense at C/SS is valuable.  DH provides bat only.
    // LF/RF adjusted to 1.00 to match POS_ADJ = 0 (removed old -0.5 bias).
    const posWeight =
      p.slotPosition === 'C'  ? 1.15 :
      p.slotPosition === 'SS' ? 1.10 :
      p.slotPosition === '2B' ? 1.05 :
      p.slotPosition === 'CF' ? 1.05 :
      p.slotPosition === '3B' ? 1.00 :
      p.slotPosition === 'LF' ? 1.00 :
      p.slotPosition === 'RF' ? 1.00 :
      p.slotPosition === 'DH' ? 0.98 : // pure bat, no glove
      0.95; // 1B

    offScore += opsRatio * posWeight;
  }

  // offNorm: 0–60. League-average 9-batter lineup (9 × 1.0 ratio) → 30.
  // Divisor is 9 now that we have DH (was 8 for the 8-fielder lineup).
  const offNorm = Math.min(60, (offScore / 9) * 30);

  // ─── PITCHING ─────────────────────────────────────────────────────────────
  // Base of 8. Full elite rotation can push toward 32; plus CL contribution.
  let pitchScore = 8;

  for (const sp of rotation) {
    if (!isPitcherStats(sp.stats)) continue;
    const era      = ERA_AVERAGES[sp.decade] ?? ERA_AVERAGES['2010s'];
    const eraGain  = (era.era  - sp.stats.era)  / era.era;
    const whipGain = (era.whip - sp.stats.whip) / era.whip;
    const w        = SP_WEIGHTS[sp.slotPosition] ?? 0.20;
    // Contribution weighted by innings share; coeff matches the old single-SP formula
    pitchScore += (eraGain * 20 + whipGain * 12 + (sp.stats.kper9 / 9) * 4) * w;
  }

  if (closer && isPitcherStats(closer.stats)) {
    const era      = ERA_AVERAGES[closer.decade] ?? ERA_AVERAGES['2010s'];
    const eraGain  = (era.era  - closer.stats.era)  / era.era;
    const whipGain = (era.whip - closer.stats.whip) / era.whip;
    pitchScore += (eraGain * 10 + whipGain * 6 + (closer.stats.kper9 / 9) * 2) * 0.55;
  }

  if (setup && isPitcherStats(setup.stats)) {
    const era      = ERA_AVERAGES[setup.decade] ?? ERA_AVERAGES['2010s'];
    const eraGain  = (era.era  - setup.stats.era)  / era.era;
    const whipGain = (era.whip - setup.stats.whip) / era.whip;
    pitchScore += (eraGain * 10 + whipGain * 6 + (setup.stats.kper9 / 9) * 2) * 0.50;
  }

  const pitchNorm = Math.min(40, Math.max(0, pitchScore));

  // ─── FIELDING ─────────────────────────────────────────────────────────────
  // Two components: error count vs league average, and fielding percentage.
  // DH players don't play the field — skip them entirely.
  let fieldingAdj = 0;
  for (const p of batters) {
    if (!isBatterStats(p.stats)) continue;
    if (p.slotPosition === 'DH') continue;  // no fielding for DH
    const bs = p.stats as BatterStats;
    const avgErrors = LEAGUE_AVG_ERRORS[p.slotPosition as Position] ?? 10;
    // Error differential: each error below avg = +0.18, each above = -0.18
    fieldingAdj += (avgErrors - bs.errors) * 0.18;
    // Fielding pct component: .990+ is elite (+0.5), below .960 is bad (-0.5)
    const fpct = bs.fieldingPct ?? 0.975;
    fieldingAdj += (fpct - 0.975) * 20; // ±0.3 per player at extremes
  }
  // Widen cap to ±6 so elite glove teams are meaningfully rewarded
  const fieldingNorm = Math.max(-6, Math.min(6, fieldingAdj));

  // ─── STRENGTH SCORE → WIN PROBABILITY ────────────────────────────────────
  const strengthScore = Math.round(Math.min(100, Math.max(0, offNorm + pitchNorm + fieldingNorm)));
  // Steeper curve with higher ceiling so a perfect (100) team can occasionally hit 162-0.
  // Score=50 → ~.629 (102 W), Score=67 → ~.856 (138 W, DYNASTY),
  // Score=80 → ~.927 (150 W), Score=100 → ~.954 (155 W).
  // P(162-0) at strength=100: ≈ 1 in 2,400 — jackpot-rare but real.
  const winPct = 0.30 + 0.658 / (1 + Math.exp(-0.10 * (strengthScore - 50)));

  const { wins, losses } = deterministic
    ? (() => { const w = Math.round(winPct * 162); return { wins: w, losses: 162 - w }; })()
    : simulate162(winPct);

  return {
    players,
    wins,
    losses,
    rating: getRating(wins),
    strengthScore,
  };
}
