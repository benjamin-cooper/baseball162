'use client';
import { useState, useCallback } from 'react';
import { Player, DraftedPlayer, Position, POSITIONS, TeamResult, eligibleSlots, isBatterStats, isPitcherStats } from '@/types';
import { FRANCHISE_MAP } from '@/lib/franchises';
import SlotMachine from './SlotMachine';
import PlayerCard from './PlayerCard';
import DiamondLayout from './DiamondLayout';
import ResultsScreen from './ResultsScreen';

// Many MLB team colors are very dark navies/blacks (e.g. Tigers #0C2340,
// Yankees #003087) — using them as-is for text/borders on this app's dark
// background is nearly illegible. Blending toward white keeps the team's hue
// recognizable while guaranteeing enough contrast to read comfortably.
const legible = (hex: string, towardWhitePct = 55) => `color-mix(in srgb, ${hex} ${100 - towardWhitePct}%, white)`;

type SpinCombo = { abbr: string; decade: string };

type GamePhase =
  | { type: 'spinning';       franchiseAbbr: string; city: string; decade: string; spinCombos: SpinCombo[] }
  | { type: 'picking-player'; franchiseAbbr: string; city: string; decade: string; players: Player[] }
  | { type: 'placing-player'; franchiseAbbr: string; city: string; decade: string; player: Player; slots: Position[] }
  | { type: 'results';        result: TeamResult };

type Roster  = Partial<Record<Position, DraftedPlayer>>;
type SortKey = 'score' | 'ops' | 'avg' | 'hr' | 'rbi' | 'era' | 'whip' | 'sv' | 'war' | 'err';

function sortPlayers(players: Player[], key: SortKey): Player[] {
  return [...players].sort((a, b) => {
    const sa = a.stats, sb = b.stats;
    const isP = (s: typeof sa): s is import('@/types').PitcherStats => 'era' in s;
    switch (key) {
      case 'ops':   return (isP(sb) ? 0 : sb.ops)  - (isP(sa) ? 0 : sa.ops);
      case 'avg':   return (isP(sb) ? 0 : sb.avg)  - (isP(sa) ? 0 : sa.avg);
      case 'hr':    return (isP(sb) ? 0 : sb.hr)   - (isP(sa) ? 0 : sa.hr);
      case 'rbi':   return (isP(sb) ? 0 : sb.rbi)  - (isP(sa) ? 0 : sa.rbi);
      case 'era':   return (isP(sa) ? sa.era : 99)  - (isP(sb) ? sb.era : 99); // lower is better
      case 'whip':  return (isP(sa) ? sa.whip : 99) - (isP(sb) ? sb.whip : 99);
      case 'sv':    return (isP(sb) ? sb.sv : 0)   - (isP(sa) ? sa.sv : 0);
      case 'war':   return sb.war - sa.war;
      case 'err':   return (isP(sa) ? 999 : (sa as import('@/types').BatterStats).errors) - (isP(sb) ? 999 : (sb as import('@/types').BatterStats).errors);
      default:      return b.strengthScore - a.strengthScore;
    }
  });
}

export default function DraftGame() {
  const [phase,           setPhase]           = useState<GamePhase | null>(null);
  const [roster,          setRoster]          = useState<Roster>({});
  const [usedCombos,      setUsedCombos]      = useState<string[]>([]);
  const [teamRerollUsed,  setTeamRerollUsed]  = useState(false);
  const [eraRerollUsed,   setEraRerollUsed]   = useState(false);
  const [rerolledCombos,  setRerolledCombos]  = useState<string[]>([]);
  const [lastFranchise,   setLastFranchise]   = useState<string | undefined>(undefined);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [filterPos,       setFilterPos]       = useState<Position | 'all'>('all');
  const [sortBy,          setSortBy]          = useState<SortKey>('score');

  const filled   = Object.keys(roster) as Position[];
  const unfilled = POSITIONS.filter(p => !filled.includes(p));

  async function startDraft() {
    setRoster({});
    setUsedCombos([]);
    setRerolledCombos([]);
    setTeamRerollUsed(false);
    setEraRerollUsed(false);
    setLastFranchise(undefined);
    setError(null);
    await spinNext([], POSITIONS, [], undefined);
  }

  async function spinNext(used: string[], remaining: Position[], rerolled: string[], avoid?: string) {
    setFilterPos('all');
    setSortBy('score');
    setLoading(true);
    try {
      const exclude    = [...used, ...rerolled];
      const avoidParam = avoid ? `&avoidFranchise=${avoid}` : '';
      const res = await fetch(`/api/draft-slot?used=${exclude.join(',')}&unfilled=${remaining.join(',')}${avoidParam}`);
      if (!res.ok) throw new Error('No slots available');
      const slot = await res.json();
      setPhase({ type: 'spinning', ...slot });
    } catch {
      setError('Something went wrong. Try again.');
      setPhase(null);
    } finally {
      setLoading(false);
    }
  }

  const handleSpinDone = useCallback(async () => {
    if (!phase || phase.type !== 'spinning') return;
    const { franchiseAbbr, city, decade } = phase;
    try {
      const res = await fetch(`/api/players?franchise=${franchiseAbbr}&decade=${decade}&unfilled=${unfilled.join(',')}`);
      const data = await res.json();
      setPhase({ type: 'picking-player', franchiseAbbr, city, decade, players: data.players ?? [] });
    } catch {
      setError('Failed to load players.');
      setPhase(null);
    }
  }, [phase, unfilled]);

  async function handleReroll(type: 'team' | 'era') {
    if (!phase || phase.type === 'results') return;
    if (type === 'team' && teamRerollUsed) return;
    if (type === 'era'  && eraRerollUsed)  return;

    setFilterPos('all');
    setSortBy('score');

    const combo = `${phase.franchiseAbbr}-${phase.decade}`;
    const newRerolled = [...rerolledCombos, combo];
    setRerolledCombos(newRerolled);
    if (type === 'team') setTeamRerollUsed(true);
    else                 setEraRerollUsed(true);

    const lock = type === 'team'
      ? `&lockDecade=${phase.decade}`
      : `&lockFranchise=${phase.franchiseAbbr}`;

    setLoading(true);
    try {
      const exclude = [...usedCombos, ...newRerolled];
      const avoid   = `&avoidFranchise=${phase.franchiseAbbr}`;
      const res = await fetch(
        `/api/draft-slot?used=${exclude.join(',')}&unfilled=${unfilled.join(',')}${lock}${avoid}`
      );
      if (!res.ok) throw new Error('No slots available');
      const slot = await res.json();
      setPhase({ type: 'spinning', ...slot });
    } catch {
      setError('No other options available for that reroll.');
      setPhase({ type: 'picking-player', ...phase as any });
    } finally {
      setLoading(false);
    }
  }

  function handlePickPlayer(player: Player) {
    if (!phase || phase.type !== 'picking-player') return;
    const allPositions = (player.positions ?? [player.position]) as Position[];
    const eligibleSet  = new Set<Position>();
    for (const pos of allPositions) {
      for (const s of eligibleSlots(pos as Position)) eligibleSet.add(s);
    }
    const slots = Array.from(eligibleSet).filter(s => unfilled.includes(s));
    setPhase({ type: 'placing-player', franchiseAbbr: phase.franchiseAbbr, city: phase.city, decade: phase.decade, player, slots });
  }

  async function handleBack() {
    if (!phase || phase.type !== 'placing-player') return;
    try {
      const res = await fetch(`/api/players?franchise=${phase.franchiseAbbr}&decade=${phase.decade}&unfilled=${unfilled.join(',')}`);
      const data = await res.json();
      setPhase({ type: 'picking-player', franchiseAbbr: phase.franchiseAbbr, city: phase.city, decade: phase.decade, players: data.players ?? [] });
    } catch {
      setError('Failed to reload players.');
    }
  }

  async function handlePlace(pos: Position) {
    if (!phase || phase.type !== 'placing-player') return;
    const { player, franchiseAbbr, decade } = phase;

    const drafted: DraftedPlayer = { ...player, slotPosition: pos };
    const newRoster: Roster      = { ...roster, [pos]: drafted };
    const newUsed                = [...usedCombos, `${franchiseAbbr}-${decade}`];
    const newUnfilled            = POSITIONS.filter(p => !(p in newRoster));

    setRoster(newRoster);
    setUsedCombos(newUsed);
    setLastFranchise(franchiseAbbr);

    if (newUnfilled.length === 0) {
      setLoading(true);
      try {
        const orderedPlayers = POSITIONS.map(p => newRoster[p]!);
        const res = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerIds: orderedPlayers.map(p => p.id) }),
        });
        const result: TeamResult = await res.json();
        result.players = orderedPlayers;
        setPhase({ type: 'results', result });
      } catch {
        setError('Simulation failed. Try again.');
        setPhase(null);
      } finally {
        setLoading(false);
      }
    } else {
      await spinNext(newUsed, newUnfilled, rerolledCombos, franchiseAbbr);
    }
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────

  if (!phase) {
    return (
      <div className="flex flex-col items-center gap-6 py-12">
        <p className="text-slate-400 text-center max-w-sm text-sm leading-relaxed">
          Each round, the slot machine picks a franchise and decade. Pick any player from that
          era, then place them on the diamond. One reroll per round.
          Can you build a team good enough to go 162-0?
        </p>
        <button
          onClick={startDraft}
          disabled={loading}
          className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-bold text-lg px-10 py-4 rounded-2xl transition-colors"
        >
          {loading ? 'Loading…' : 'Start Draft'}
        </button>
        {error && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={() => setError(null)} className="text-slate-500 text-xs hover:text-slate-300">Dismiss</button>
          </div>
        )}
      </div>
    );
  }

  if (phase.type === 'results') {
    return <ResultsScreen result={phase.result} onBuildAnother={startDraft} />;
  }

  const teamColor     = FRANCHISE_MAP.get(phase.franchiseAbbr)?.color ?? '#22c55e';
  const canRerollTeam = !teamRerollUsed;
  const canRerollEra  = !eraRerollUsed;

  return (
    <div className="w-full max-w-7xl mx-auto px-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_580px] gap-6 items-start">

        {/* LEFT */}
        <div className="flex flex-col gap-4 min-w-0">

          {phase.type === 'spinning' && (
            <SlotMachine
              franchiseAbbr={phase.franchiseAbbr}
              city={phase.city}
              decade={phase.decade}
              spinCombos={phase.spinCombos}
              onDone={handleSpinDone}
            />
          )}

          {phase.type === 'picking-player' && (() => {
            const availablePos = Array.from(new Set(phase.players.map(p => p.position as Position)));
            const hasBatters  = phase.players.some(p => isBatterStats(p.stats));
            const hasPitchers = phase.players.some(p => isPitcherStats(p.stats));

            const displayed = sortPlayers(
              filterPos === 'all' ? phase.players : phase.players.filter(p => p.position === filterPos),
              sortBy
            );

            const batterSorts: { key: SortKey; label: string }[] = [
              { key: 'score', label: 'Best'  },
              { key: 'war',   label: 'WAR'   },
              { key: 'ops',   label: 'OPS'   },
              { key: 'avg',   label: 'AVG'   },
              { key: 'hr',    label: 'HR'    },
              { key: 'rbi',   label: 'RBI'   },
              { key: 'err',   label: 'DEF'   },
            ];
            const pitcherSorts: { key: SortKey; label: string }[] = [
              { key: 'score', label: 'Best' },
              { key: 'war',   label: 'WAR'  },
              { key: 'era',   label: 'ERA'  },
              { key: 'whip',  label: 'WHIP' },
              { key: 'sv',    label: 'SV'   },
            ];
            const currentIsP = filterPos !== 'all' && (filterPos === 'SP' || filterPos === 'RP');
            const sortOptions = currentIsP ? pitcherSorts
              : !hasBatters ? pitcherSorts
              : batterSorts;

            return (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-white font-bold">{phase.franchiseAbbr}</span>
                    <span className="text-slate-500 mx-1.5">·</span>
                    <span className="text-white font-bold">{phase.decade}</span>
                    <span className="text-xs font-medium ml-2" style={{ color: legible(teamColor) }}>{phase.city}</span>
                  </div>
                  {(canRerollTeam || canRerollEra) && (
                    <div className="flex gap-2">
                      {canRerollTeam && (
                        <button onClick={() => handleReroll('team')} disabled={loading}
                          title="Keep this era, spin a new team"
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#e2e8f0' }}>
                          Team
                        </button>
                      )}
                      {canRerollEra && (
                        <button onClick={() => handleReroll('era')} disabled={loading}
                          title="Keep this team, spin a new era"
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#e2e8f0' }}>
                          Era
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {availablePos.length > 1 && (
                  <div className="flex gap-1.5 flex-wrap">
                    <FilterChip label="All" active={filterPos === 'all'} onClick={() => setFilterPos('all')} color={teamColor} />
                    {availablePos.map(pos => (
                      <FilterChip key={pos} label={pos} active={filterPos === pos} onClick={() => setFilterPos(pos)} color={teamColor} />
                    ))}
                  </div>
                )}

                <div className="flex gap-1.5 flex-wrap">
                  {sortOptions.map(({ key, label }) => (
                    <FilterChip key={key} label={label} active={sortBy === key} onClick={() => setSortBy(key)} color={teamColor} small />
                  ))}
                </div>

                {displayed.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-6">No players for this filter.</p>
                ) : (
                  displayed.map(player => (
                    <PlayerCard key={player.id} player={player} onClick={() => handlePickPlayer(player)} />
                  ))
                )}
              </div>
            );
          })()}

          {phase.type === 'placing-player' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <button onClick={handleBack} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
                  ← Back
                </button>
                <p className="text-slate-400 text-sm">
                  Place <span className="text-white font-semibold">{phase.player.name}</span> on the diamond →
                </p>
              </div>
              <PlayerCard player={phase.player} />
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-2">
              <div className="w-5 h-5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {/* RIGHT — diamond */}
        <div className="sticky top-6">
          <DiamondLayout
            roster={roster}
            eligibleSlots={phase.type === 'placing-player' ? phase.slots : []}
            teamColor={teamColor}
            onPlace={handlePlace}
          />
        </div>

      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick, color, small }: {
  label: string;
  active: boolean;
  onClick: () => void;
  color: string;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg font-semibold transition-all ${small ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'}`}
      style={active ? {
        backgroundColor: `${color}30`,
        color: legible(color),
        border: `1px solid ${legible(color, 35)}`,
      } : {
        backgroundColor: 'rgba(255,255,255,0.07)',
        color: '#cbd5e1',
        border: '1px solid rgba(255,255,255,0.15)',
      }}
    >
      {label}
    </button>
  );
}
