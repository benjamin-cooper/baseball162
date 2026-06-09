'use client';
import { useState, useCallback, useEffect } from 'react';
import { Player, DraftedPlayer, Position, POSITIONS, TeamResult, eligibleSlots, isBatterStats, isPitcherStats } from '@/types';
import { FRANCHISE_MAP } from '@/lib/franchises';
import { Difficulty, DraftMode, getBestRecord, saveGame, getGamesPlayed, loadHistory, deleteGame, clearHistory, GameRecord } from '@/lib/storage';
import { computeOptimal } from '@/lib/simulation';
import { todayDateString } from '@/lib/rng';
import SlotMachine from './SlotMachine';
import PlayerCard from './PlayerCard';
import DiamondLayout from './DiamondLayout';
import ResultsScreen from './ResultsScreen';

export type { Difficulty };
export type PickEntry = { franchiseAbbr: string; decade: string; available: Player[]; chosen: DraftedPlayer };

// Many MLB team colors are very dark navies/blacks (e.g. Tigers #0C2340,
// Yankees #003087) — using them as-is for text/borders on this app's dark
// background is nearly illegible. Blending toward white keeps the team's hue
// recognizable while guaranteeing enough contrast to read comfortably.
const legible = (hex: string, towardWhitePct = 55) => `color-mix(in srgb, ${hex} ${100 - towardWhitePct}%, white)`;

type SpinCombo = { abbr: string; decade: string };

type GamePhase =
  | { type: 'spinning';       franchiseAbbr: string; city: string; decade: string; spinCombos: SpinCombo[] }
  | { type: 'picking-player'; franchiseAbbr: string; city: string; decade: string; players: Player[] }
  | { type: 'placing-player'; franchiseAbbr: string; city: string; decade: string; player: Player; slots: Position[]; available: Player[] }
  | { type: 'results';        result: TeamResult; picksLog: PickEntry[] };

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
      // "BEST" — WAR is the standard sabermetric answer to "who was best over
      // a span of time," because (unlike a pure rate stat) it accumulates: a
      // long, consistently-good tenure outranks one spectacular short stint.
      default:      return sb.war - sa.war;
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
  const [search,          setSearch]          = useState('');
  const [difficulty,      setDifficulty]      = useState<Difficulty>('normal');
  const [draftMode,       setDraftMode]       = useState<DraftMode>('regular');
  const [dailyCombos,     setDailyCombos]     = useState<{franchiseAbbr:string;franchise:string;city:string;decade:string}[]>([]);
  const [picksLog,        setPicksLog]        = useState<PickEntry[]>([]);
  // Career stats (read once from localStorage on mount)
  const [bestRecord,      setBestRecord]      = useState<GameRecord | null>(null);
  const [gamesPlayed,     setGamesPlayed]     = useState(0);
  const [dailyRecord,     setDailyRecord]     = useState<GameRecord | null | undefined>(undefined);
  const [history,         setHistory]         = useState<GameRecord[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  useEffect(() => {
    refreshHistory();
  }, []);

  function refreshHistory() {
    const h = loadHistory();
    setHistory(h);
    setBestRecord(h.length ? h.reduce((best, r) => r.wins > best.wins ? r : best) : null);
    setGamesPlayed(h.length);
    const today = todayDateString();
    setDailyRecord(h.find(r => r.mode === 'daily' && r.date === today) ?? null);
  }

  function handleDeleteGame(index: number) {
    deleteGame(index);
    refreshHistory();
  }

  function handleClearHistory() {
    clearHistory();
    refreshHistory();
    setHistoryExpanded(false);
  }

  const filled   = Object.keys(roster) as Position[];
  const unfilled = POSITIONS.filter(p => !filled.includes(p));

  async function startDraft(modeOverride?: DraftMode, diffOverride?: Difficulty) {
    const effectiveMode = modeOverride ?? draftMode;
    const effectiveDiff = diffOverride ?? difficulty;
    if (modeOverride) setDraftMode(modeOverride);
    if (diffOverride) setDifficulty(diffOverride);

    setRoster({});
    setUsedCombos([]);
    setRerolledCombos([]);
    setTeamRerollUsed(false);
    setEraRerollUsed(false);
    setLastFranchise(undefined);
    setError(null);
    setPicksLog([]);

    if (effectiveMode === 'daily') {
      setLoading(true);
      try {
        const res = await fetch(`/api/daily-slots?date=${todayDateString()}`);
        const data = await res.json();
        setDailyCombos(data.combos ?? []);
        await spinNextDaily(data.combos ?? [], [], POSITIONS, []);
      } catch {
        setError('Could not load daily draft. Try again.');
      } finally {
        setLoading(false);
      }
    } else {
      setDailyCombos([]);
      await spinNext([], POSITIONS, [], undefined);
    }
  }

  /** Daily draft: advance through the pre-shuffled combo list, skipping used/ineligible. */
  async function spinNextDaily(
    combos: typeof dailyCombos,
    used: string[],
    remaining: Position[],
    rerolled: string[],
  ) {
    setFilterPos('all'); setSortBy('score'); setSearch('');
    setLoading(true);
    try {
      const exclude = [...used, ...rerolled];
      // Find first combo not yet used that can fill at least one remaining slot
      const pick = combos.find(c => {
        if (exclude.includes(`${c.franchiseAbbr}-${c.decade}`)) return false;
        return true; // eligibility checked server-side when fetching players
      });
      if (!pick) throw new Error('No combos left');
      // Build spinCombos from unused combos for the slot machine animation
      const spinCombos = combos
        .filter(c => !exclude.includes(`${c.franchiseAbbr}-${c.decade}`))
        .map(c => ({ abbr: c.franchiseAbbr, decade: c.decade }));
      setPhase({ type: 'spinning', franchiseAbbr: pick.franchiseAbbr, city: pick.city, decade: pick.decade, spinCombos });
    } catch {
      setError('No more daily combos available.');
      setPhase(null);
    } finally {
      setLoading(false);
    }
  }

  async function spinNext(used: string[], remaining: Position[], rerolled: string[], avoid?: string) {
    setFilterPos('all');
    setSortBy('score');
    setSearch('');
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
    setPhase({ type: 'placing-player', franchiseAbbr: phase.franchiseAbbr, city: phase.city, decade: phase.decade, player, slots, available: phase.players });
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

    // Log this pick
    const newPicksLog: PickEntry[] = phase.type === 'placing-player'
      ? [...picksLog, { franchiseAbbr, decade, available: phase.available, chosen: drafted }]
      : picksLog;
    setPicksLog(newPicksLog);
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
        // Save to career history
        // Compute optimal for this draft pool so we can store it with the record
        const optTeam = computeOptimal(newPicksLog);
        const filled = new Set(optTeam.map(p => p.slotPosition));
        const missingNonDH = POSITIONS.filter(p => p !== 'DH' && !filled.has(p));
        let optimalWins: number | undefined;
        if (missingNonDH.length === 0) {
          const { simulateSeason } = await import('@/lib/simulation');
          optimalWins = simulateSeason(optTeam).wins;
        }
        const rec: GameRecord = { date: todayDateString(), wins: result.wins, losses: result.losses, rating: result.rating, mode: draftMode, difficulty, strengthScore: result.strengthScore, optimalWins };
        saveGame(rec);
        refreshHistory();
        setPhase({ type: 'results', result, picksLog: newPicksLog });
      } catch {
        setError('Simulation failed. Try again.');
        setPhase(null);
      } finally {
        setLoading(false);
      }
    } else if (draftMode === 'daily') {
      await spinNextDaily(dailyCombos, newUsed, newUnfilled, rerolledCombos);
    } else {
      await spinNext(newUsed, newUnfilled, rerolledCombos, franchiseAbbr);
    }
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────

  if (!phase) {
    const DIFFICULTIES: { key: Difficulty; label: string; desc: string }[] = [
      { key: 'normal',   label: 'Normal',   desc: 'All stats visible'       },
      { key: 'blind',    label: 'Blind',    desc: 'Stats hidden, badges shown' },
      { key: 'blackout', label: 'Blackout', desc: 'Name & era only'         },
    ];
    return (
      <div className="flex flex-col items-center gap-7 pb-12 w-full max-w-sm mx-auto">
        <p className="text-[var(--ink-warm)]/55 text-center text-[15px] leading-relaxed">
          The slot machine picks a franchise and decade each round. Draft any player, place them on the diamond.
          Can you go 162-0?
        </p>

        {/* Career best + history */}
        {gamesPlayed > 0 && (
          <div className="w-full flex flex-col gap-1.5">
            {/* Summary row — click to expand history */}
            <button
              onClick={() => setHistoryExpanded(e => !e)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm transition-colors hover:bg-white/[0.06]"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <span className="text-[var(--ink-warm)]/40 text-xs uppercase tracking-widest">Best</span>
              {bestRecord && <span className="text-[var(--brass)] font-display tracking-wide">{bestRecord.wins}–{bestRecord.losses}</span>}
              <div className="flex items-center gap-2">
                <span className="text-[var(--ink-warm)]/30 text-xs">{gamesPlayed} game{gamesPlayed !== 1 ? 's' : ''}</span>
                <span className="text-[var(--ink-warm)]/30 text-[10px]">{historyExpanded ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* Expanded history list */}
            {historyExpanded && (
              <div className="w-full flex flex-col rounded-lg overflow-hidden"
                style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)' }}>
                {/* Header row */}
                <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/[0.06]">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--ink-warm)]/25">History</span>
                  <button
                    onClick={handleClearHistory}
                    className="text-[9px] font-bold uppercase tracking-wider text-red-400/40 hover:text-red-400/80 transition-colors px-1.5 py-0.5 rounded"
                  >
                    Clear all
                  </button>
                </div>
                {/* Game rows (newest first, cap at 50) */}
                {history.slice(0, 50).map((rec, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 px-3.5 py-2 border-b border-white/[0.04] last:border-0 group"
                  >
                    {/* Date */}
                    <span className="text-[var(--ink-warm)]/25 text-[10px] w-20 shrink-0">{rec.date}</span>
                    {/* W-L */}
                    <span className="font-display text-sm tracking-wide text-[var(--brass)]/80 w-14 shrink-0">{rec.wins}–{rec.losses}</span>
                    {/* Rating */}
                    <span className="text-[10px] text-[var(--ink-warm)]/40 flex-1 truncate">{rec.rating}</span>
                    {/* Mode / difficulty chips */}
                    <div className="flex gap-1 shrink-0">
                      {rec.mode === 'daily' && (
                        <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(216,160,74,0.12)', color: 'rgba(216,160,74,0.55)', border: '1px solid rgba(216,160,74,0.2)' }}>
                          Daily
                        </span>
                      )}
                      {rec.difficulty !== 'normal' && (
                        <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(238,220,160,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          {rec.difficulty}
                        </span>
                      )}
                    </div>
                    {/* Delete button */}
                    <button
                      onClick={() => handleDeleteGame(i)}
                      title="Delete this game"
                      className="text-[var(--ink-warm)]/15 hover:text-red-400/70 transition-colors text-base leading-none shrink-0 opacity-0 group-hover:opacity-100 px-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Daily draft — always visible; locked if already played today */}
        {dailyRecord !== undefined && (() => {
          const pastDailies = history.filter(r => r.mode === 'daily' && r.date !== todayDateString());
          const RATING_COLORS: Record<string, string> = {
            '162-0': '#ffffff', 'DYNASTY': '#fde047', 'ALL-TIME GREAT': '#34d399',
            'PENNANT WINNER': '#60a5fa', 'CONTENDER': '#22d3ee', 'PLAYOFF BOUND': '#2dd4bf',
            'WILD CARD': '#a3e635', 'BUBBLE': '#facc15', 'REBUILDING': '#fb923c', 'EXPANSION TEAM': '#f87171',
          };
          const fmtDate = (iso: string) => {
            const [, m, d] = iso.split('-');
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            return `${months[parseInt(m) - 1]} ${parseInt(d)}`;
          };
          return (
          <div className="w-full flex flex-col gap-1.5">
          {dailyRecord ? (
            // Already played today — show result, locked
            <div className="w-full flex items-center justify-between px-4 py-3 rounded-lg cursor-not-allowed select-none"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-2.5">
                <span className="text-[var(--ink-warm)]/25 text-base">📅</span>
                <div>
                  <div className="text-[var(--ink-warm)]/30 text-xs font-bold uppercase tracking-widest">Daily · {todayDateString()}</div>
                  <div className="text-[var(--ink-warm)]/20 text-[11px] mt-0.5">Already played</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[var(--ink-warm)]/30 font-display tracking-wide">{dailyRecord.wins}–{dailyRecord.losses}</div>
                <div className="text-[var(--ink-warm)]/20 text-[10px] uppercase tracking-wider">{dailyRecord.rating}</div>
              </div>
            </div>
          ) : (
            // Not played yet — active
            <button
              onClick={() => startDraft('daily')}
              disabled={loading}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all hover:brightness-110 disabled:opacity-50"
              style={{ background: 'rgba(216,160,74,0.08)', border: '1px solid rgba(216,160,74,0.3)' }}>
              <div className="flex items-center gap-2.5">
                <span className="text-base">📅</span>
                <div className="text-left">
                  <div className="text-[var(--brass)] text-xs font-bold uppercase tracking-widest">Daily Draft</div>
                  <div className="text-[var(--ink-warm)]/35 text-[11px] mt-0.5">Same draw for everyone · no rerolls</div>
                </div>
              </div>
              <span className="text-[var(--brass)]/60 text-sm font-bold">→</span>
            </button>
          )}

          {/* Past daily results */}
          {pastDailies.length > 0 && (
            <div className="w-full rounded-lg overflow-hidden"
              style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.18)' }}>
              {pastDailies.slice(0, 10).map((rec, i) => {
                const color = RATING_COLORS[rec.rating] ?? '#ffffff';
                return (
                  <div key={i} className="flex items-center gap-3 px-3.5 py-2 border-b border-white/[0.04] last:border-0">
                    <span className="text-[var(--ink-warm)]/25 text-[10px] w-12 shrink-0">{fmtDate(rec.date)}</span>
                    <span className="font-display text-sm tracking-wide w-14 shrink-0" style={{ color: `${color}99` }}>{rec.wins}–{rec.losses}</span>
                    <span className="text-[10px] flex-1 truncate" style={{ color: `${color}55` }}>{rec.rating}</span>
                    {rec.optimalWins != null && (
                      <span className="text-[9px] shrink-0 text-[var(--ink-warm)]/20">
                        best <span className="text-[var(--ink-warm)]/40">{rec.optimalWins}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </div>
          );
        })()}

        {/* Difficulty */}
        <div className="w-full flex flex-col gap-2">
          <label className="text-[var(--ink-warm)]/35 text-[10px] font-bold uppercase tracking-[0.2em]">Difficulty</label>
          <div className="flex flex-col gap-1.5">
            {DIFFICULTIES.map(d => (
              <button key={d.key} onClick={() => setDifficulty(d.key)}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-lg transition-all text-left"
                style={difficulty === d.key ? {
                  background: 'rgba(216,160,74,0.12)', border: '1px solid rgba(216,160,74,0.35)',
                } : {
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                }}>
                <span className="font-bold text-sm" style={{ color: difficulty === d.key ? '#d8a04a' : 'rgba(238,220,160,0.45)' }}>{d.label}</span>
                <span className="text-[11px] text-[var(--ink-warm)]/30">{d.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => startDraft()}
          disabled={loading}
          className="w-full font-display text-2xl tracking-[0.08em] px-14 py-4 rounded-full transition-all duration-200 disabled:opacity-50 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:brightness-95"
          style={{
            background: 'linear-gradient(180deg, #f0c976 0%, #d8a04a 55%, #b9822f 100%)',
            color: '#27200f',
            boxShadow: '0 1px 0 rgba(255,255,255,0.55) inset, 0 -4px 10px rgba(0,0,0,0.28) inset, 0 14px 34px rgba(216,160,74,0.3), 0 6px 16px rgba(0,0,0,0.45)',
          }}
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
    return <ResultsScreen result={phase.result} picksLog={phase.picksLog} difficulty={difficulty} draftMode={draftMode} onBuildAnother={startDraft} onStartRegular={(diff) => startDraft('regular', diff)} />;
  }

  const teamColor     = FRANCHISE_MAP.get(phase.franchiseAbbr)?.color ?? '#22c55e';
  const canRerollTeam = draftMode !== 'daily' && !teamRerollUsed;
  const canRerollEra  = draftMode !== 'daily' && !eraRerollUsed;

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

            const query = search.trim().toLowerCase();
            const displayed = sortPlayers(
              phase.players.filter(p =>
                (filterPos === 'all' || p.position === filterPos) &&
                (!query || p.name.toLowerCase().includes(query))
              ),
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
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-2xl tracking-[0.05em] text-white">{phase.franchiseAbbr}</span>
                    <span className="text-[var(--brass)]/50">⁄</span>
                    <span className="font-display text-2xl tracking-[0.05em] text-white">{phase.decade}</span>
                    <span className="text-xs font-medium" style={{ color: legible(teamColor) }}>{phase.city}</span>
                  </div>
                  {(canRerollTeam || canRerollEra) && (
                    <div className="flex gap-2">
                      {canRerollTeam && (
                        <button onClick={() => handleReroll('team')} disabled={loading}
                          title="Keep this era, spin a new team"
                          className="text-[11px] font-bold uppercase tracking-[0.12em] px-3 py-1.5 rounded-md transition-all disabled:opacity-40 hover:border-[var(--brass)]/50 hover:text-[var(--brass)]"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(238,243,236,0.65)' }}>
                          ↻ Team
                        </button>
                      )}
                      {canRerollEra && (
                        <button onClick={() => handleReroll('era')} disabled={loading}
                          title="Keep this team, spin a new era"
                          className="text-[11px] font-bold uppercase tracking-[0.12em] px-3 py-1.5 rounded-md transition-all disabled:opacity-40 hover:border-[var(--brass)]/50 hover:text-[var(--brass)]"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(238,243,236,0.65)' }}>
                          ↻ Era
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Search box */}
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 opacity-35 pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search players…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-8 pr-8 py-2 text-sm rounded-md bg-white/[0.05] border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-white/25"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 text-lg leading-none">×</button>
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
                  <p className="text-[var(--ink-warm)]/35 text-sm text-center py-6">No players for this filter.</p>
                ) : (
                  displayed.map(player => (
                    <PlayerCard key={player.id} player={player} difficulty={difficulty} onClick={() => handlePickPlayer(player)} />
                  ))
                )}
              </div>
            );
          })()}

          {phase.type === 'placing-player' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <button onClick={handleBack} className="text-[var(--ink-warm)]/35 hover:text-[var(--brass)] text-sm transition-colors">
                  ← Back
                </button>
                <p className="text-[var(--ink-warm)]/45 text-sm">
                  Place <span className="text-white font-semibold">{phase.player.name}</span> on the diamond →
                </p>
              </div>
              <PlayerCard player={phase.player} difficulty={difficulty} />
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-2">
              <div className="w-5 h-5 border-2 border-[var(--brass)] border-t-transparent rounded-full animate-spin" />
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
      className={`rounded-md font-bold uppercase tracking-[0.08em] transition-all ${small ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]'}`}
      style={active ? {
        backgroundColor: `${color}25`,
        color: legible(color),
        border: `1px solid ${legible(color, 35)}`,
        boxShadow: `0 0 0 1px ${color}12 inset`,
      } : {
        backgroundColor: 'rgba(255,255,255,0.04)',
        color: 'rgba(238,243,236,0.45)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {label}
    </button>
  );
}
