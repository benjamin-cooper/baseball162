import { NextRequest, NextResponse } from 'next/server';
import { getPlayerById, getPlayersForCombo } from '@/lib/players';
import { simulateSeason, computeOptimal } from '@/lib/simulation';
import { DraftedPlayer, Position, POSITIONS } from '@/types';

interface PickLogInput {
  franchiseAbbr: string;
  decade: string;
  draftedBefore: string[]; // names of players chosen in prior rounds
}

// POST /api/simulate
// body: {
//   playerIds: number[],          // 15 players in POSITIONS order
//   picksLog?: PickLogInput[],    // per-round draft state for optimal computation
// }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const ids: number[] = body.playerIds ?? [];

  if (ids.length !== 15) {
    return NextResponse.json({ error: 'Exactly 15 players required' }, { status: 400 });
  }

  const players: DraftedPlayer[] = ids.map((id, i) => {
    const p = getPlayerById(id);
    if (!p) return null;
    return { ...p, slotPosition: POSITIONS[i] as Position };
  }).filter(Boolean) as DraftedPlayer[];

  if (players.length !== 15) {
    return NextResponse.json({ error: 'One or more players not found' }, { status: 404 });
  }

  const result = simulateSeason(players);

  // Compute optimal server-side so the client doesn't run the expensive DP.
  let optimalResult = null;
  const picksLogRaw: PickLogInput[] = body.picksLog ?? [];
  if (picksLogRaw.length === 15) {
    const picksLog = picksLogRaw.map(e => {
      const draftedNames = new Set(e.draftedBefore.map(n => n.toLowerCase()));
      return {
        franchiseAbbr: e.franchiseAbbr,
        decade: e.decade,
        available: getPlayersForCombo(e.franchiseAbbr, e.decade, [...POSITIONS], draftedNames),
        chosen: {} as DraftedPlayer, // not used by computeOptimal
      };
    });

    const optTeam = computeOptimal(picksLog);
    const filled = new Set(optTeam.map(p => p.slotPosition));
    const missingNonDH = POSITIONS.filter(p => p !== 'DH' && !filled.has(p));
    if (missingNonDH.length === 0) {
      optimalResult = simulateSeason(optTeam, true);
    }
  }

  return NextResponse.json({ ...result, optimalResult });
}
