import { NextRequest, NextResponse } from 'next/server';
import { getAllValidCombos } from '@/lib/players';
import { mulberry32, seededShuffle, dateToSeed, todayDateString } from '@/lib/rng';

/**
 * GET /api/daily-slots?date=2026-06-07
 * Returns a seeded-shuffle of all valid franchise×decade combos for the given
 * date (defaults to today). The client works through them in order, skipping any
 * combo that can't fill a remaining slot. This guarantees everyone on the same
 * date sees the same draft draw.
 */
export async function GET(req: NextRequest) {
  const date  = req.nextUrl.searchParams.get('date') ?? todayDateString();
  const seed  = dateToSeed(date);
  const rand  = mulberry32(seed);
  const combos = getAllValidCombos();
  const shuffled = seededShuffle(combos, rand);
  return NextResponse.json({ date, combos: shuffled });
}
