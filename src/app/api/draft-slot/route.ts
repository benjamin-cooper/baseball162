import { NextRequest, NextResponse } from 'next/server';
import { randomDraftSlot, RerollLock } from '@/lib/players';
import { Position, POSITIONS } from '@/types';

// GET /api/draft-slot?used=NYY-1990s&unfilled=C,1B,SP
// GET /api/draft-slot?used=...&unfilled=...&lockFranchise=NYY  (reroll era)
// GET /api/draft-slot?used=...&unfilled=...&lockDecade=1990s   (reroll team)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const usedParam      = searchParams.get('used')           ?? '';
  const unfilledParam  = searchParams.get('unfilled')       ?? '';
  const lockFranchise  = searchParams.get('lockFranchise')  ?? undefined;
  const lockDecade     = searchParams.get('lockDecade')     ?? undefined;
  const avoidFranchise = searchParams.get('avoidFranchise') ?? undefined;

  const used     = usedParam     ? usedParam.split(',')              : [];
  const unfilled = unfilledParam ? (unfilledParam.split(',') as Position[]) : [...POSITIONS];

  const lock: RerollLock | undefined =
    lockFranchise ? { franchiseAbbr: lockFranchise } :
    lockDecade    ? { decade: lockDecade }            :
    undefined;

  const slot = randomDraftSlot(used, unfilled, lock, avoidFranchise);
  if (!slot) {
    return NextResponse.json({ error: 'No available slots' }, { status: 404 });
  }

  return NextResponse.json(slot);
}
