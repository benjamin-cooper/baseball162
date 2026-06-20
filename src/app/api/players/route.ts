import { NextRequest, NextResponse } from 'next/server';
import { getPlayersForCombo } from '@/lib/players';
import { Position, POSITIONS } from '@/types';

// GET /api/players?franchise=NYY&decade=1990s&unfilled=C,1B,SP
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const franchiseAbbr = searchParams.get('franchise') ?? '';
  const decade        = searchParams.get('decade')    ?? '';
  const draftedParam  = searchParams.get('drafted')   ?? '';
  // Names are pipe-separated to avoid conflicts with URL commas; lowercased for comparison
  const draftedNames  = draftedParam
    ? new Set(draftedParam.split('|').map(n => n.toLowerCase()))
    : new Set<string>();

  if (!franchiseAbbr || !decade) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  // Return the full player pool (minus already-drafted names) — no unfilled
  // filtering here. The client filters for display; computeOptimal needs the
  // full pool so it can assign players to whichever slots its greedy pass needs.
  const players = getPlayersForCombo(franchiseAbbr, decade, [...POSITIONS], draftedNames);
  return NextResponse.json({ players });
}
