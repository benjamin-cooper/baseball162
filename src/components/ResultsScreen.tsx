'use client';
import { TeamResult } from '@/types';
import PlayerCard from './PlayerCard';

interface Props {
  result: TeamResult;
  onBuildAnother: () => void;
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

export default function ResultsScreen({ result, onBuildAnother }: Props) {
  const { wins, losses, rating, players } = result;
  const ratingColor = RATING_COLORS[rating] ?? 'text-white';
  const ratingBg    = RATING_BG[rating]    ?? 'bg-white/10';

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

  const winPct = wins > 0 ? (wins / (wins + losses)).toFixed(3) : '.000';

  return (
    <div className="flex flex-col items-center gap-7 w-full max-w-2xl mx-auto px-4 py-8">
      <div className="text-[var(--ink-warm)]/35 text-[11px] font-bold uppercase tracking-[0.3em]">
        Projected Record
      </div>

      {/* Scoreboard-style readout: dark recessed panel, brass digits, subtle
          glow — reads like an actual stadium board rather than plain type. */}
      <div
        className="relative flex items-center gap-5 px-12 py-7 rounded-lg"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.5))',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.03)',
        }}
      >
        <Rivet pos="tl" /><Rivet pos="tr" /><Rivet pos="bl" /><Rivet pos="br" />
        <span className="font-display text-7xl sm:text-8xl tracking-wide text-[var(--brass)]" style={{ textShadow: '0 0 28px rgba(216,160,74,0.45)' }}>{wins}</span>
        <span className="text-3xl text-white/15 font-display">–</span>
        <span className="font-display text-7xl sm:text-8xl tracking-wide text-white/85">{losses}</span>
      </div>

      <div className="font-stat text-[var(--ink-warm)]/40 text-sm">{winPct} <span className="text-[var(--ink-warm)]/25">win pct</span></div>

      <div className={`flex items-center gap-2.5 px-4 py-2 rounded-full ${ratingBg}`}>
        <div className={`w-1.5 h-1.5 rounded-full ${ratingColor.replace('text-', 'bg-')}`} />
        <span className={`font-display text-base tracking-[0.12em] ${ratingColor}`}>{rating}</span>
      </div>

      <div className="flex gap-3 w-full">
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
          onClick={onBuildAnother}
          className="flex-1 font-display text-lg tracking-[0.06em] py-3.5 rounded-lg transition-all hover:-translate-y-0.5 text-[var(--ink-warm)]/75 hover:text-white"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          Build Another
        </button>
      </div>

      <div className="w-full flex flex-col gap-2">
        {players.map(player => (
          <PlayerCard key={player.id} player={player} compact />
        ))}
      </div>
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

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
