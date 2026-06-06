'use client';
import { Position, DraftedPlayer, ROTATION_SLOTS } from '@/types';
import { FRANCHISE_MAP } from '@/lib/franchises';

interface Props {
  roster: Partial<Record<Position, DraftedPlayer>>;
  eligibleSlots: Position[];
  teamColor: string;
  onPlace: (pos: Position) => void;
}

export default function DiamondLayout({ roster, eligibleSlots, teamColor, onPlace }: Props) {
  function slot(pos: Position, label: string) {
    return (
      <DiamondSlot pos={pos} label={label} player={roster[pos]}
        isEligible={eligibleSlots.includes(pos)} teamColor={teamColor}
        onPlace={() => eligibleSlots.includes(pos) && onPlace(pos)} />
    );
  }

  return (
    <div className="w-full">
      <div
        className="relative rounded-3xl px-3 py-4 flex flex-col gap-3"
        style={{
          background: 'linear-gradient(180deg, #0d2e0d 0%, #0a2010 60%, #0a1a0a 100%)',
          border: '1px solid rgba(100,200,100,0.2)',
          boxShadow: 'inset 0 0 60px rgba(34,197,94,0.06)',
        }}
      >
        {/* ── OUTFIELD ──────────────────────────────────────── */}
        {/* 5-col grid: LF _ CF _ RF */}
        <div className="grid grid-cols-5 gap-1.5">
          {slot('LF', 'LF')}
          <div />
          {slot('CF', 'CF')}
          <div />
          {slot('RF', 'RF')}
        </div>

        {/* ── INFIELD ───────────────────────────────────────── */}
        {/* SS (between 3B and 2B), 2B (between SS and 1B) */}
        <div className="grid grid-cols-5 gap-1.5">
          <div />
          {slot('SS', 'SS')}
          <div />
          {slot('2B', '2B')}
          <div />
        </div>

        {/* 3B on left corner, 1B on right corner */}
        <div className="grid grid-cols-5 gap-1.5">
          {slot('3B', '3B')}
          <div />
          <div />
          <div />
          {slot('1B', '1B')}
        </div>

        {/* Catcher at home plate, centered */}
        <div className="grid grid-cols-5 gap-1.5">
          <div />
          <div />
          {slot('C', 'C')}
          <div />
          <div />
        </div>

        {/* ── PITCHING STAFF ────────────────────────────────── */}
        <div
          className="mt-1 pt-3 flex flex-col gap-2"
          style={{ borderTop: '1px solid rgba(100,200,100,0.15)' }}
        >
          <div className="text-slate-500 text-[9px] font-semibold uppercase tracking-widest text-center">
            Rotation
          </div>

          {/* SP1 SP2 SP3 */}
          <div className="grid grid-cols-3 gap-1.5">
            {slot('SP1', 'Ace')}
            {slot('SP2', '#2')}
            {slot('SP3', '#3')}
          </div>

          {/* SP4 SP5 CL */}
          <div className="grid grid-cols-3 gap-1.5">
            {slot('SP4', '#4')}
            {slot('SP5', '#5')}
            <div className="relative">
              <div
                className="absolute -top-1 left-0 right-0 h-px mx-3"
                style={{ background: 'rgba(100,200,100,0.12)' }}
              />
              {slot('CL', 'CL')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiamondSlot({
  pos, label, player, isEligible, teamColor, onPlace,
}: {
  pos: Position;
  label: string;
  player?: DraftedPlayer;
  isEligible: boolean;
  teamColor: string;
  onPlace: () => void;
}) {
  const isPitcher = ROTATION_SLOTS.includes(pos) || pos === 'CL';
  const playerColor = player ? (FRANCHISE_MAP.get(player.franchiseAbbr)?.color ?? '#22c55e') : teamColor;

  // Slightly smaller slots for pitchers since there are 6 of them
  const padY  = isPitcher ? 'py-2.5' : 'py-3';
  const avSz  = isPitcher ? 'w-9 h-9' : 'w-10 h-10';
  const nameS = isPitcher ? 'text-[10px]' : 'text-[11px]';

  if (player) {
    return (
      <div
        className={`rounded-2xl ${padY} px-1.5 text-center`}
        style={{ border: `1px solid ${playerColor}`, background: 'rgba(255,255,255,0.08)' }}
      >
        <div
          className={`${avSz} rounded-xl mx-auto mb-1.5 flex items-center justify-center text-white font-black text-xs shadow-lg`}
          style={{ backgroundColor: playerColor }}
        >
          {player.initials}
        </div>
        <div className={`text-white ${nameS} font-bold leading-tight truncate px-0.5`}>
          {player.name.split(' ').slice(0, -1).join(' ') || player.name}
        </div>
        <div className="text-white/55 text-[9px] leading-tight truncate px-0.5">
          {player.name.split(' ').slice(-1)[0]}
        </div>
      </div>
    );
  }

  if (isEligible) {
    return (
      <button
        onClick={onPlace}
        className={`rounded-2xl ${padY} px-1.5 text-center border-2 border-dashed
                   transition-all duration-150 hover:scale-105 active:scale-95 w-full
                   border-slate-400/60 hover:border-white/80`}
        style={{ backgroundColor: 'rgba(255,255,255,0.05)', boxShadow: `0 0 14px ${teamColor}40` }}
        onMouseEnter={e => {
          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.10)';
          e.currentTarget.style.boxShadow = `0 0 22px ${teamColor}70`;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
          e.currentTarget.style.boxShadow = `0 0 14px ${teamColor}40`;
        }}
      >
        <div className={`${avSz} rounded-xl mx-auto mb-1 flex items-center justify-center text-xl font-light text-white/70 bg-white/10`}>
          +
        </div>
        <div className={`${nameS} font-bold text-white/80`}>{pos}</div>
        <div className="text-slate-500 text-[9px]">{label}</div>
      </button>
    );
  }

  return (
    <div className={`rounded-2xl ${padY} px-1.5 text-center border border-white/10 opacity-35`}>
      <div className={`${avSz} rounded-xl mx-auto mb-1 bg-white/10`} />
      <div className={`text-slate-400 ${nameS} font-bold`}>{pos}</div>
      <div className="text-slate-600 text-[9px]">{label}</div>
    </div>
  );
}
