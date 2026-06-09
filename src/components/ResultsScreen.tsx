'use client';
import { useState, useMemo } from 'react';
import { TeamResult, DraftedPlayer, Position, POSITIONS } from '@/types';
import { FRANCHISE_MAP } from '@/lib/franchises';
import { simulateSeason, computeOptimal } from '@/lib/simulation';
import { Difficulty, DraftMode } from '@/lib/storage';
import type { PickEntry } from './DraftGame';
import PlayerCard from './PlayerCard';
import DiamondLayout from './DiamondLayout';

interface Props {
  result: TeamResult;
  picksLog: PickEntry[];
  difficulty: Difficulty;
  draftMode: DraftMode;
  onBuildAnother: () => void;
  onStartRegular: (difficulty: Difficulty) => void;
}

const RATING_COLORS: Record<string, string> = {
  '162-0':          'text-white',
  'DYNASTY':        'text-yellow-300',
  'ALL-TIME GREAT': 'text-emerald-400',
  'PENNANT WINNER': 'text-blue-400',
  'CONTENDER':      'text-cyan-400',
  'PLAYOFF BOUND':  'text-teal-400',
  'WILD CARD':      'text-lime-400',
  'BUBBLE':         'text-yellow-400',
  'REBUILDING':     'text-orange-400',
  'EXPANSION TEAM': 'text-red-400',
};

const RATING_BG: Record<string, string> = {
  '162-0':          'bg-white/15',
  'DYNASTY':        'bg-yellow-300/10',
  'ALL-TIME GREAT': 'bg-emerald-400/10',
  'PENNANT WINNER': 'bg-blue-400/10',
  'CONTENDER':      'bg-cyan-400/10',
  'PLAYOFF BOUND':  'bg-teal-400/10',
  'WILD CARD':      'bg-lime-400/10',
  'BUBBLE':         'bg-yellow-400/10',
  'REBUILDING':     'bg-orange-400/10',
  'EXPANSION TEAM': 'bg-red-400/10',
};

const DIFFICULTIES: { key: Difficulty; label: string }[] = [
  { key: 'normal',   label: 'Normal'   },
  { key: 'blind',    label: 'Blind'    },
  { key: 'blackout', label: 'Blackout' },
];

export default function ResultsScreen({ result, picksLog, difficulty, draftMode, onBuildAnother, onStartRegular }: Props) {
  const [nextDiff, setNextDiff] = useState<Difficulty>(difficulty);
  const { wins, losses, rating, players } = result;
  const ratingColor = RATING_COLORS[rating] ?? 'text-white';
  const ratingBg    = RATING_BG[rating]    ?? 'bg-white/10';
  const [view, setView] = useState<'diamond' | 'list'>('diamond');

  // Build roster map for DiamondLayout (read-only — no eligible slots)
  const roster = Object.fromEntries(players.map(p => [p.slotPosition, p])) as Parameters<typeof DiamondLayout>[0]['roster'];
  const teamColor = FRANCHISE_MAP.get(players[0]?.franchiseAbbr ?? '')?.color ?? '#22c55e';

  // Optimal team simulation (memoised — only computed once)
  const optimalResult = useMemo(() => {
    if (!picksLog.length) return null;
    const optTeam = computeOptimal(picksLog);
    // DH is hard to fill greedily (1B players prefer 1B slot).
    // Show result as long as every non-DH slot is filled.
    const filled = new Set(optTeam.map(p => p.slotPosition));
    const missingNonDH = POSITIONS.filter(p => p !== 'DH' && !filled.has(p));
    if (missingNonDH.length > 0) return null;
    return simulateSeason(optTeam);
  }, [picksLog]);

  // Best / worst picks by WAR relative to position average
  const { bestPick, worstPick } = useMemo(() => {
    if (!picksLog.length) return { bestPick: null, worstPick: null };
    let best: PickEntry | null = null, worst: PickEntry | null = null;
    for (const entry of picksLog) {
      const avgWar = entry.available.reduce((s, p) => s + p.stats.war, 0) / (entry.available.length || 1);
      const delta = entry.chosen.stats.war - avgWar;
      if (!best  || delta > (best.chosen.stats.war  - entry.available.reduce((s,p)=>s+p.stats.war,0)/(entry.available.length||1))) best = entry;
      if (!worst || delta < (worst.chosen.stats.war - entry.available.reduce((s,p)=>s+p.stats.war,0)/(entry.available.length||1))) worst = entry;
    }
    return { bestPick: best, worstPick: worst };
  }, [picksLog]);

  function handleShare() {
    const teamStr = players.map(p => `${p.slotPosition}: ${p.name} (${p.franchiseAbbr} ${p.decade})`).join('\n');
    const url = typeof window !== 'undefined' ? window.location.origin : 'https://baseball162-0.vercel.app';
    const pct = wins > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0';
    const text = `My baseball 162-0 team went ${wins}-${losses} (${pct}%) — ${rating}!\n\n${teamStr}\n\n${url}`;
    if (navigator.share) {
      navigator.share({ title: 'Baseball 162-0', text });
    } else {
      navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard!'));
    }
  }

  function handleDownloadImage() {
    const canvas = document.createElement('canvas');
    const W = 720, H = 1020;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Background
    ctx.fillStyle = '#0d1a10';
    ctx.fillRect(0, 0, W, H);

    // Subtle vignette
    const vg = ctx.createRadialGradient(W/2, H/2, H*0.2, W/2, H/2, H*0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // Top label
    ctx.fillStyle = 'rgba(238,220,160,0.38)';
    ctx.font = '500 13px system-ui, sans-serif';
    ctx.letterSpacing = '0.25em';
    ctx.textAlign = 'center';
    ctx.fillText('PROJECTED RECORD', W/2, 60);
    ctx.letterSpacing = '0';

    // Score
    ctx.textAlign = 'left';
    ctx.font = `bold 110px Georgia, serif`;
    ctx.fillStyle = '#d8a04a';
    const wStr = String(wins), lStr = String(losses);
    const wW = ctx.measureText(wStr).width;
    const dashW = ctx.measureText('–').width;
    const lW = ctx.measureText(lStr).width;
    const totalW = wW + 28 + dashW + 28 + lW;
    let cx = (W - totalW) / 2;
    ctx.shadowColor = 'rgba(216,160,74,0.4)'; ctx.shadowBlur = 30;
    ctx.fillText(wStr, cx, 165); cx += wW + 14;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillText('–', cx, 165); cx += dashW + 14;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText(lStr, cx, 165);

    // Rating pill
    const ratingColorMap: Record<string, string> = {
      '162-0': '#ffffff', 'DYNASTY': '#fde047', 'ALL-TIME GREAT': '#34d399',
      'PENNANT WINNER': '#60a5fa', 'CONTENDER': '#22d3ee', 'PLAYOFF BOUND': '#2dd4bf',
      'WILD CARD': '#a3e635', 'BUBBLE': '#facc15', 'REBUILDING': '#fb923c', 'EXPANSION TEAM': '#f87171',
    };
    const rColor = ratingColorMap[rating] ?? '#ffffff';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const rW = ctx.measureText(rating).width + 40;
    const rX = (W - rW) / 2, rY = 185;
    ctx.fillStyle = rColor + '18';
    ctx.beginPath(); ctx.roundRect(rX, rY, rW, 34, 17); ctx.fill();
    ctx.strokeStyle = rColor + '55'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(rX, rY, rW, 34, 17); ctx.stroke();
    ctx.fillStyle = rColor;
    ctx.fillText(rating, W/2, rY + 22);

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(40, 244); ctx.lineTo(W - 40, 244); ctx.stroke();

    // Player rows (15 players now with DH slot)
    const rowH = 46, startY = 264;
    const FRANCHISE_COLORS: Record<string, string> = {};
    players.forEach(p => { FRANCHISE_COLORS[p.franchiseAbbr] = p.franchiseAbbr; });

    players.forEach((p, i) => {
      const y = startY + i * rowH;
      const isP = 'era' in p.stats;

      // Row background alternate
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(36, y - 2, W - 72, rowH - 2);
      }

      // Position badge
      ctx.fillStyle = isP ? '#7f1d1d' : '#14532d';
      ctx.beginPath(); ctx.roundRect(40, y + 10, 36, 22, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.slotPosition.replace(/[0-9]/g, '').slice(0,3) || p.slotPosition, 58, y + 25);

      // Name
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(p.name, 86, y + 20);

      // Franchise · Decade
      ctx.fillStyle = 'rgba(238,220,160,0.4)';
      ctx.font = '400 11px system-ui, sans-serif';
      ctx.fillText(`${p.franchiseAbbr} · ${p.decade}`, 86, y + 36);

      // WAR
      const war = p.stats.war.toFixed(1);
      ctx.textAlign = 'right';
      ctx.fillStyle = p.stats.war >= 30 ? '#34d399' : 'rgba(255,255,255,0.55)';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(war, W - 52, y + 20);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '400 10px system-ui, sans-serif';
      ctx.fillText('WAR', W - 52, y + 34);
    });

    // Footer
    ctx.fillStyle = 'rgba(238,220,160,0.25)';
    ctx.font = '400 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('baseball-162-0.vercel.app', W/2, H - 28);

    // Download
    const link = document.createElement('a');
    link.download = `baseball-162-0-${wins}-${losses}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  const winPct = wins > 0 ? (wins / (wins + losses)).toFixed(3) : '.000';

  return (
    <div className="flex flex-col items-center gap-7 w-full max-w-2xl mx-auto px-4 py-8">
      <div className="text-[var(--ink-warm)]/35 text-[11px] font-bold uppercase tracking-[0.3em]">
        Projected Record
      </div>

      {/* Scoreboard-style readout: dark recessed panel, brass digits, subtle
          glow — reads like an actual stadium board rather than plain type. */}
      <div
        className="relative flex items-center gap-4 sm:gap-5 px-6 sm:px-12 py-5 sm:py-7 rounded-lg"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.5))',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.03)',
        }}
      >
        <Rivet pos="tl" /><Rivet pos="tr" /><Rivet pos="bl" /><Rivet pos="br" />
        <span className="font-display text-6xl sm:text-7xl lg:text-8xl tracking-wide text-[var(--brass)]" style={{ textShadow: '0 0 28px rgba(216,160,74,0.45)' }}>{wins}</span>
        <span className="text-2xl sm:text-3xl text-white/15 font-display">–</span>
        <span className="font-display text-6xl sm:text-7xl lg:text-8xl tracking-wide text-white/85">{losses}</span>
      </div>

      <div className="font-stat text-[var(--ink-warm)]/40 text-sm">{winPct} <span className="text-[var(--ink-warm)]/25">win pct</span></div>

      <div className={`flex items-center gap-2.5 px-4 py-2 rounded-full ${ratingBg}`}>
        <div className={`w-1.5 h-1.5 rounded-full ${ratingColor.replace('text-', 'bg-')}`} />
        <span className={`font-display text-base tracking-[0.12em] ${ratingColor}`}>{rating}</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <div className="flex gap-3 sm:contents">
        <button
          onClick={handleShare}
          className="flex-1 font-display text-lg tracking-[0.06em] py-3.5 rounded-lg flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 hover:brightness-110"
          style={{
            background: 'linear-gradient(180deg, #f0c976 0%, #d8a04a 55%, #b9822f 100%)',
            color: '#27200f',
            boxShadow: '0 1px 0 rgba(255,255,255,0.5) inset, 0 8px 22px rgba(216,160,74,0.28)',
          }}
        >
          <ShareIcon />
          Share
        </button>
        <button
          onClick={handleDownloadImage}
          title="Download as image"
          className="font-display text-lg tracking-[0.06em] px-4 py-3.5 rounded-lg transition-all hover:-translate-y-0.5 text-[var(--ink-warm)]/75 hover:text-white flex items-center gap-2"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <ImageIcon />
        </button>
        </div>
        {draftMode !== 'daily' && (
          <button
            onClick={onBuildAnother}
            className="flex-1 font-display text-lg tracking-[0.06em] py-3.5 rounded-lg transition-all hover:-translate-y-0.5 text-[var(--ink-warm)]/75 hover:text-white"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            Build Another
          </button>
        )}
      </div>

      {/* After a Daily game: offer difficulty picker + jump into a regular draft */}
      {draftMode === 'daily' && (
        <div className="w-full flex flex-col gap-2">
          <div className="flex gap-2">
            {DIFFICULTIES.map(d => (
              <button key={d.key} onClick={() => setNextDiff(d.key)}
                className="flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                style={nextDiff === d.key ? {
                  background: 'rgba(216,160,74,0.15)', color: '#d8a04a',
                  border: '1px solid rgba(216,160,74,0.4)',
                } : {
                  background: 'rgba(255,255,255,0.04)', color: 'rgba(238,220,160,0.35)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                {d.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => onStartRegular(nextDiff)}
            className="w-full font-display text-lg tracking-[0.06em] py-3.5 rounded-lg transition-all hover:-translate-y-0.5 text-[var(--ink-warm)]/75 hover:text-white"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            🎰 Regular Draft
          </button>
        </div>
      )}

      {/* Post-game breakdown */}
      {optimalResult && (
        <div className="w-full rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.25)' }}>
          <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/[0.06]">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ink-warm)]/35">Best Possible</span>
            <span className={`font-display text-lg tracking-wide ${optimalResult.wins > wins ? 'text-emerald-400' : 'text-[var(--ink-warm)]/50'}`}>
              {optimalResult.wins}–{optimalResult.losses}
              {optimalResult.wins > wins && <span className="text-xs ml-1.5 text-emerald-400/70">+{optimalResult.wins - wins} W</span>}
            </span>
          </div>
          {(bestPick || worstPick) && (
            <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
              {bestPick && (
                <div className="px-3.5 py-2.5">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-400/50 mb-1">Best Pick</div>
                  <div className="text-white text-[13px] font-semibold truncate">{bestPick.chosen.name}</div>
                  <div className="text-[var(--ink-warm)]/35 text-[10px]">{bestPick.franchiseAbbr} · {bestPick.decade} · {bestPick.chosen.stats.war.toFixed(1)} WAR</div>
                </div>
              )}
              {worstPick && (
                <div className="px-3.5 py-2.5">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-red-400/50 mb-1">Weakest Pick</div>
                  <div className="text-white text-[13px] font-semibold truncate">{worstPick.chosen.name}</div>
                  <div className="text-[var(--ink-warm)]/35 text-[10px]">{worstPick.franchiseAbbr} · {worstPick.decade} · {worstPick.chosen.stats.war.toFixed(1)} WAR</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* View toggle */}
      <div className="flex rounded-lg overflow-hidden border border-white/10 self-center">
        <button
          onClick={() => setView('diamond')}
          className={`px-5 py-2 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 ${
            view === 'diamond'
              ? 'bg-white/12 text-white'
              : 'text-white/35 hover:text-white/60'
          }`}
        >
          <DiamondIcon /> Diamond
        </button>
        <div className="w-px bg-white/10" />
        <button
          onClick={() => setView('list')}
          className={`px-5 py-2 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 ${
            view === 'list'
              ? 'bg-white/12 text-white'
              : 'text-white/35 hover:text-white/60'
          }`}
        >
          <ListIcon /> Roster
        </button>
      </div>

      {view === 'diamond' ? (
        <div className="w-full overflow-y-auto">
          <DiamondLayout
            roster={roster}
            eligibleSlots={[]}
            teamColor={teamColor}
            onPlace={() => {}}
          />
        </div>
      ) : (
        <div className="w-full flex flex-col gap-2">
          {players.map(player => (
            <PlayerCard key={player.id} player={player} compact difficulty={difficulty} />
          ))}
        </div>
      )}
    </div>
  );
}

function Rivet({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const place: Record<string, string> = {
    tl: 'top-2 left-2', tr: 'top-2 right-2',
    bl: 'bottom-2 left-2', br: 'bottom-2 right-2',
  };
  return <div className={`absolute ${place[pos]} w-1 h-1 rounded-full bg-white/10`} />;
}

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}

function DiamondIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="1" transform="rotate(45 12 12)" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
