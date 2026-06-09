import { NextRequest, NextResponse } from 'next/server';
import { getPlayerById } from '@/lib/players';
import { simulateSeason } from '@/lib/simulation';
import { DraftedPlayer, Position, POSITIONS } from '@/types';

// POST /api/simulate  body: { playerIds: number[] }  (15 players in POSITIONS order)
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
  return NextResponse.json(result);
}
