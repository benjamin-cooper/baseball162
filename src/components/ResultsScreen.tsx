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
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto px-4 py-8">
      <div className="text-slate-300 text-xs font-medium uppercase tracking-widest">
        Projected Record
      </div>

      <div className="flex items-center gap-3">
        <span className="text-8xl font-black text-white tabular-nums">{wins}</span>
        <span className="text-4xl text-slate-400 font-light">—</span>
        <span className="text-8xl font-black text-white tabular-nums">{losses}</span>
      </div>

      <div className="text-slate-400 text-sm tabular-nums">{winPct} win pct</div>

      <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${ratingBg}`}>
        <div className={`w-2 h-2 rounded-full ${ratingColor.replace('text-', 'bg-')}`} />
        <span className={`font-bold text-sm tracking-wider ${ratingColor}`}>{rating}</span>
      </div>

      <div className="flex gap-3 w-full">
        <button
          onClick={handleShare}
          className="flex-1 bg-green-700 hover:bg-green-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <ShareIcon />
          Share
        </button>
        <button
          onClick={onBuildAnother}
          className="flex-1 bg-slate-600 hover:bg-slate-500 text-white font-semibold py-3.5 rounded-xl transition-colors"
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

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
