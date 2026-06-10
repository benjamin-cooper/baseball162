import { Player, Position, POSITIONS, eligibleSlots } from '@/types';
import { FRANCHISES, ERA_AVERAGES } from '@/lib/franchises';
import path from 'path';
import fs from 'fs';

let _cache: Player[] | null = null;

function loadPlayers(): Player[] {
  if (_cache) return _cache;
  const filePath = path.join(process.cwd(), 'data', 'players.json');
  if (!fs.existsSync(filePath)) {
    console.warn('players.json not found — run scripts/scrape.py first');
    return [];
  }
  _cache = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Player[];
  return _cache;
}

export function getPlayers(): Player[] {
  return loadPlayers();
}

export function getPlayerById(id: number): Player | undefined {
  return loadPlayers().find(p => p.id === id);
}

/** Which roster slots this player can fill (based on their data position) */
function playerEligibleSlots(p: Player): Position[] {
  const positions = (p.positions ?? [p.position]) as Position[];
  const slots = new Set<Position>();
  for (const pos of positions) {
    for (const s of eligibleSlots(pos)) slots.add(s);
  }
  return Array.from(slots);
}

function sortScore(p: Player): number {
  if ('era' in p.stats) {
    const era    = ERA_AVERAGES[p.decade] ?? ERA_AVERAGES['2010s'];
    const eraGain  = (era.era  - p.stats.era)  / era.era;
    const whipGain = (era.whip - p.stats.whip) / era.whip;
    return 50 + eraGain * 30 + whipGain * 20 + (p.stats.kper9 / 9) * 10;
  }
  const era = ERA_AVERAGES[p.decade] ?? ERA_AVERAGES['2010s'];
  return (p.stats.ops / era.ops) * 50;
}

/** All players from a franchise+decade that can fill at least one unfilled slot.
 *  draftedNames: lowercase player names already on the roster — excluded so the
 *  same real-world player can't be drafted twice from different decades. */
export function getPlayersForCombo(
  franchiseAbbr: string,
  decade: string,
  unfilled: Position[],
  draftedNames: Set<string> = new Set(),
): Player[] {
  return loadPlayers()
    .filter(p => {
      if (p.franchiseAbbr !== franchiseAbbr || p.decade !== decade) return false;
      if (draftedNames.has(p.name.toLowerCase())) return false;
      return playerEligibleSlots(p).some(s => unfilled.includes(s));
    })
    .sort((a, b) => sortScore(b) - sortScore(a));
}

export interface DraftSlotResult {
  franchiseAbbr: string;
  franchise: string;
  city: string;
  decade: string;
  spinCombos: { abbr: string; decade: string }[];
}

export interface RerollLock {
  franchiseAbbr?: string;
  decade?: string;
}

/** Every valid franchise×decade combo that has at least one player in the dataset. */
export function getAllValidCombos(): Omit<DraftSlotResult, 'spinCombos'>[] {
  const players = loadPlayers();
  const seen = new Map<string, Omit<DraftSlotResult, 'spinCombos'>>();
  for (const p of players) {
    const key = `${p.franchiseAbbr}-${p.decade}`;
    if (seen.has(key)) continue;
    const f = FRANCHISES.find(f => f.abbr === p.franchiseAbbr);
    if (!f) continue;
    seen.set(key, { franchiseAbbr: p.franchiseAbbr, franchise: p.franchise, city: f.city, decade: p.decade });
  }
  return Array.from(seen.values());
}

export function randomDraftSlot(
  usedCombos: string[],
  unfilledPositions: Position[],
  lock?: RerollLock,
  avoidFranchise?: string
): DraftSlotResult | null {
  const players = loadPlayers();

  const allValid = new Map<string, { franchiseAbbr: string; franchise: string; city: string; decade: string }>();

  for (const p of players) {
    const key = `${p.franchiseAbbr}-${p.decade}`;
    if (allValid.has(key)) continue;

    if (lock?.franchiseAbbr && p.franchiseAbbr !== lock.franchiseAbbr) continue;
    if (lock?.decade && p.decade !== lock.decade) continue;

    // Collect all players in this combo
    const comboPlayers = players.filter(
      q => q.franchiseAbbr === p.franchiseAbbr && q.decade === p.decade
    );

    // Check if any combo player can fill any unfilled slot
    const hasEligible = unfilledPositions.some(slotPos =>
      comboPlayers.some(q => playerEligibleSlots(q).includes(slotPos))
    );

    if (hasEligible) {
      const f = FRANCHISES.find(f => f.abbr === p.franchiseAbbr);
      allValid.set(key, {
        franchiseAbbr: p.franchiseAbbr,
        franchise: p.franchise,
        city: f?.city ?? '',
        decade: p.decade,
      });
    }
  }

  const available = Array.from(allValid.values()).filter(
    c => !usedCombos.includes(`${c.franchiseAbbr}-${c.decade}`)
  );
  if (available.length === 0) return null;

  const preferred = avoidFranchise
    ? available.filter(c => c.franchiseAbbr !== avoidFranchise)
    : available;
  const pool = preferred.length > 0 ? preferred : available;

  const picked = pool[Math.floor(Math.random() * pool.length)];
  const spinCombos = Array.from(allValid.values()).map(c => ({ abbr: c.franchiseAbbr, decade: c.decade }));

  return { ...picked, spinCombos };
}
