import { NextRequest, NextResponse } from 'next/server';
import { getPlayersForCombo } from '@/lib/players';
import { Position, POSITIONS } from '@/types';

// GET /api/players?franchise=NYY&decade=1990s&unfilled=C,1B,SP
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const franchiseAbbr = searchParams.get('franchise') ?? '';
  const decade        = searchParams.get('decade')    ?? '';
  const unfilledParam = searchParams.get('unfilled')  ?? '';
  const draftedParam  = searchParams.get('drafted')   ?? '';
  const unfilled      = unfilledParam ? (unfilledParam.split(',') as Position[]) : [...POSITIONS];
  // Names are pipe-separated to avoid conflicts with URL commas; lowercased for comparison
  const draftedNames  = draftedParam
    ? new Set(draftedParam.split('|').map(n => n.toLowerCase()))
    : new Set<string>();

  if (!franchiseAbbr || !decade) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  const players = getPlayersForCombo(franchiseAbbr, decade, unfilled, draftedNames);
  return NextResponse.json({ players });
}
