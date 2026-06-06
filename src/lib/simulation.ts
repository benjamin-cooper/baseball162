import { DraftedPlayer, TeamResult, isBatterStats, isPitcherStats, ROTATION_SLOTS, Position, BatterStats } from '@/types';
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

export function simulateSeason(players: DraftedPlayer[]): TeamResult {
  const batters  = players.filter(p => isBatterStats(p.stats));
  const rotation = players.filter(p => ROTATION_SLOTS.includes(p.slotPosition as Position));
  const closer   = players.find(p => p.slotPosition === 'CL');

  // ─── OFFENSE ─────────────────────────────────────────────────────────────
  let offScore = 0;

  for (const p of batters) {
    if (!isBatterStats(p.stats)) continue;
    const era      = ERA_AVERAGES[p.decade] ?? ERA_AVERAGES['2010s'];
    const opsRatio = p.stats.ops / era.ops;

    // Premium for up-the-middle positions (defense harder to replace offensively)
    const posWeight =
      p.slotPosition === 'C'  ? 1.15 :
      p.slotPosition === 'SS' ? 1.10 :
      p.slotPosition === '2B' ? 1.05 :
      p.slotPosition === 'CF' ? 1.05 :
      p.slotPosition === '3B' ? 1.00 :
      0.95; // 1B, LF, RF

    offScore += opsRatio * posWeight;
  }

  // offNorm: 0–60. League-average lineup (8 × 1.0 ratio) → 30.
  const offNorm = Math.min(60, (offScore / 8) * 30);

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
    // Closers pitch ~65 IP (≈4.4% of 1458 total innings) — smaller but high-leverage
    pitchScore += (eraGain * 10 + whipGain * 6 + (closer.stats.kper9 / 9) * 2) * 0.55;
  }

  const pitchNorm = Math.min(40, Math.max(0, pitchScore));

  // ─── FIELDING ─────────────────────────────────────────────────────────────
  let fieldingAdj = 0;
  for (const p of batters) {
    if (!isBatterStats(p.stats)) continue;
    const avgErrors = LEAGUE_AVG_ERRORS[p.slotPosition as Position] ?? 10;
    // Each error below average = +0.15 pts; each error above = -0.15 pts
    fieldingAdj += (avgErrors - (p.stats as BatterStats).errors) * 0.15;
  }
  const fieldingNorm = Math.max(-4, Math.min(4, fieldingAdj));

  // ─── STRENGTH SCORE → WIN PROBABILITY ────────────────────────────────────
  const strengthScore = Math.round(Math.min(100, Math.max(0, offNorm + pitchNorm + fieldingNorm)));
  // Score=50 → ~.500, Score=85 → ~.700+, Score=100 → ~.800+
  const winPct = 0.30 + 0.55 / (1 + Math.exp(-0.08 * (strengthScore - 50)));

  const { wins, losses } = simulate162(winPct);

  return {
    players,
    wins,
    losses,
    rating: getRating(wins),
    strengthScore,
  };
}
