'use client';
import { Player, DraftedPlayer, PlayerStats, isBatterStats, isPitcherStats } from '@/types';
import { FRANCHISE_MAP } from '@/lib/franchises';

interface Props {
  player: Player | DraftedPlayer;
  onClick?: () => void;
  compact?: boolean;
}

const POSITION_COLORS: Record<string, string> = {
  C:   'bg-amber-600',
  '1B':'bg-blue-600',
  '2B':'bg-cyan-600',
  '3B':'bg-indigo-600',
  SS:  'bg-violet-600',
  LF:  'bg-green-600',
  CF:  'bg-emerald-600',
  RF:  'bg-teal-600',
  SP:  'bg-red-600',
  SP1: 'bg-red-600',
  SP2: 'bg-red-500',
  SP3: 'bg-red-500',
  SP4: 'bg-orange-600',
  SP5: 'bg-orange-600',
  RP:  'bg-rose-600',
  CL:  'bg-rose-600',
};

function isDrafted(p: Player | DraftedPlayer): p is DraftedPlayer {
  return 'slotPosition' in p;
}

export default function PlayerCard({ player, onClick, compact }: Props) {
  const franchise   = FRANCHISE_MAP.get(player.franchiseAbbr);
  const accentColor = franchise?.color ?? '#22c55e';

  const slotPos    = isDrafted(player) ? player.slotPosition : player.position;
  const naturalPos = player.position;
  // Show slot label if different from natural (e.g. SP1/SP → just show slot)
  const posLabel = (slotPos === naturalPos || naturalPos === 'SP' || naturalPos === 'RP')
    ? slotPos : `${slotPos}/${naturalPos}`;
  const posColor   = POSITION_COLORS[slotPos] ?? 'bg-gray-600';

  return (
    <div
      onClick={onClick}
      className={`
        group relative flex items-center gap-4 rounded-lg pl-5 pr-4 py-3.5 transition-all
        border border-white/[0.06] bg-gradient-to-r from-white/[0.05] to-white/[0.02]
        ${onClick ? 'cursor-pointer hover:from-white/[0.09] hover:to-white/[0.04] hover:border-white/[0.12]' : 'cursor-default'}
      `}
    >
      {/* Scorecard accent rail — franchise-colored, brightens on hover */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg transition-all group-hover:w-1"
        style={{ backgroundColor: accentColor, boxShadow: onClick ? `0 0 12px ${accentColor}80` : 'none' }}
      />

      <div className={`${posColor} rounded-md w-12 h-12 flex flex-col items-center justify-center flex-shrink-0 ring-1 ring-white/10`}>
        <span className="font-display text-white text-base leading-none tracking-wide">{player.initials}</span>
        <span className="text-white/70 text-[8px] font-bold mt-1 leading-none uppercase tracking-wider">{posLabel}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-white font-semibold text-[15px] truncate">{player.name}</div>
        <div className="text-[var(--ink-warm)]/40 text-xs mt-0.5 font-stat tracking-wide">{player.franchiseAbbr} · {player.decade}</div>
      </div>

      {!compact && <StatsBlock stats={player.stats} />}
      {compact && <CompactStat stats={player.stats} />}
    </div>
  );
}

function CompactStat({ stats }: { stats: PlayerStats }) {
  if (isPitcherStats(stats)) {
    return (
      <div className="flex items-center gap-2 text-xs font-stat">
        <span className="text-[var(--ink-warm)]/50">{stats.era.toFixed(2)} <i className="not-italic text-[var(--ink-warm)]/30">ERA</i></span>
        <span className="text-[var(--ink-warm)]/20">·</span>
        <span className="text-[var(--ink-warm)]/50">{stats.whip.toFixed(2)} <i className="not-italic text-[var(--ink-warm)]/30">WHIP</i></span>
        <span className="text-[var(--ink-warm)]/20">·</span>
        <span className={stats.war >= 5 ? 'text-emerald-400' : 'text-[var(--ink-warm)]/50'}>{stats.war.toFixed(1)} <i className="not-italic text-[var(--ink-warm)]/30">WAR</i></span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs font-stat">
      <span className="text-[var(--ink-warm)]/50">{stats.hr} <i className="not-italic text-[var(--ink-warm)]/30">HR</i></span>
      <span className="text-[var(--ink-warm)]/20">·</span>
      <span className="text-[var(--ink-warm)]/50">{stats.ops.toFixed(3)} <i className="not-italic text-[var(--ink-warm)]/30">OPS</i></span>
      <span className="text-[var(--ink-warm)]/20">·</span>
      <span className={stats.war >= 5 ? 'text-emerald-400' : 'text-[var(--ink-warm)]/50'}>{stats.war.toFixed(1)} <i className="not-italic text-[var(--ink-warm)]/30">WAR</i></span>
    </div>
  );
}

function StatsBlock({ stats }: { stats: PlayerStats }) {
  if (isPitcherStats(stats)) {
    return (
      <div className="flex gap-3 flex-shrink-0">
        {stats.gs > 0 ? <Stat label="W"   value={stats.w} /> : <Stat label="SV" value={stats.sv} />}
        <Stat label="ERA"  value={stats.era.toFixed(2)}  highlight={stats.era < 3.00 ? 'pos' : undefined} />
        <Stat label="WHIP" value={stats.whip.toFixed(2)} highlight={stats.whip < 1.10 ? 'pos' : undefined} />
        <Stat label="K/9"  value={stats.kper9.toFixed(1)} />
        <Stat label="WAR"  value={stats.war.toFixed(1)}   highlight={stats.war >= 5 ? 'pos' : stats.war < 0 ? 'neg' : undefined} />
      </div>
    );
  }
  return (
    <div className="flex gap-3 flex-shrink-0">
      <Stat label="AVG" value={`.${Math.round(stats.avg * 1000).toString().padStart(3, '0')}`} highlight={stats.avg >= 0.300 ? 'pos' : undefined} />
      <Stat label="HR"  value={stats.hr} />
      <Stat label="OPS" value={stats.ops.toFixed(3)} highlight={stats.ops >= 0.900 ? 'pos' : undefined} />
      <Stat label="E"   value={stats.errors} highlight={stats.errors <= 5 ? 'pos' : stats.errors >= 22 ? 'neg' : undefined} />
      <Stat label="WAR" value={stats.war.toFixed(1)} highlight={stats.war >= 5 ? 'pos' : stats.war < 0 ? 'neg' : undefined} />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: 'pos' | 'neg' }) {
  const valueColor = highlight === 'pos' ? 'text-emerald-400' : highlight === 'neg' ? 'text-red-400' : 'text-white';
  return (
    <div className="text-center min-w-[2.5rem]">
      <div className={`${valueColor} font-stat font-bold text-sm`}>{value}</div>
      <div className="text-[var(--ink-warm)]/30 text-[9px] font-bold uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
