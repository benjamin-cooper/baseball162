'use client';
import { Position, DraftedPlayer, ROTATION_SLOTS } from '@/types';
import { FRANCHISE_MAP } from '@/lib/franchises';

interface Props {
  roster: Partial<Record<Position, DraftedPlayer>>;
  eligibleSlots: Position[];
  teamColor: string;
  onPlace: (pos: Position) => void;
}

const ROTATION: { pos: Position; label: string }[] = [
  { pos: 'SP1', label: 'Ace' },
  { pos: 'SP2', label: '#2 Starter' },
  { pos: 'SP3', label: '#3 Starter' },
  { pos: 'SP4', label: '#4 Starter' },
  { pos: 'SP5', label: '#5 Starter' },
  { pos: 'CL',  label: 'Closer' },
];

// ── Field geometry ──────────────────────────────────────────────────────────
// One coordinate map drives EVERYTHING — both where each slot sits (left/top
// %) and where the SVG draws the base-path diamond. Same numbers, two
// consumers: they cannot drift apart. The container is fixed at a 4∶3 aspect
// ratio specifically because the four infield points below are spaced
// (±18, ±24) apart — at 4∶3 that turns into a true 45°-rotated square, i.e.
// an actual baseball diamond, not an approximation.
const FIELD_ASPECT = 4 / 3; // width / height

const FIELD_POSITIONS: { pos: Position; label: string; x: number; y: number }[] = [
  { pos: 'LF', label: 'Left Field',   x: 13, y: 16 },
  { pos: 'CF', label: 'Center Field', x: 50, y: 12 },
  { pos: 'RF', label: 'Right Field',  x: 87, y: 16 },
  { pos: 'SS', label: 'Shortstop',    x: 23, y: 38 },
  // Diamond: each leg from the infield center (50, 60) is (±15, ±20) — that's
  // a 4∶3 ratio, matching FIELD_ASPECT, so it renders as a true rotated
  // square (real diamond) — just sized a bit smaller than before, freeing
  // headroom above 2B for the outfield row to sit without overlap/clipping.
  { pos: '2B', label: 'Second Base',  x: 50, y: 40 },
  { pos: '3B', label: 'Third Base',   x: 35, y: 60 },
  { pos: '1B', label: 'First Base',   x: 65, y: 60 },
  { pos: 'C',  label: 'Catcher',      x: 50, y: 80 },
  // DH sits in the "dugout" — same row as the catcher, far right corner.
  { pos: 'DH', label: 'DH',           x: 87, y: 80 },
];

const pt = (pos: Position) => FIELD_POSITIONS.find(f => f.pos === pos)!;
// 2B → 1B → Home → 3B → close. Each leg is (±15, ±20) in %, which — at the
// FIELD_ASPECT (4∶3) above — is the same physical distance in every
// direction, so this is a true rhombus (square rotated 45°) for any screen size.
const DIAMOND_PTS = (['2B', '1B', 'C', '3B'] as Position[]).map(pt);
const MOUND_PT = { x: 50, y: 60 }; // average of the four diamond corners — true infield center

export default function DiamondLayout({ roster, eligibleSlots, teamColor, onPlace }: Props) {
  return (
    <div className="w-full flex flex-col gap-5">
      {/* ── FIELD ─────────────────────────────────────────────────────── */}
      <div
        className="relative w-full rounded-[2rem] overflow-hidden"
        style={{
          aspectRatio: `${FIELD_ASPECT}`,
          background:
            'radial-gradient(120% 90% at 50% 105%, #1f5c2e 0%, #15431f 38%, #0c2814 72%, #081a0d 100%)',
          border: '1px solid rgba(134,239,172,0.28)',
          boxShadow:
            'inset 0 0 100px rgba(34,197,94,0.14), inset 0 0 2px rgba(255,255,255,0.15), 0 12px 40px rgba(0,0,0,0.45)',
        }}
      >
        {/* Mowed-grass stripes */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'repeating-linear-gradient(115deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 40px, transparent 40px, transparent 80px)',
          }}
        />
        {/* Outfield grass glow */}
        <div
          className="absolute pointer-events-none rounded-[50%]"
          style={{
            left: '0%', top: '-45%', width: '100%', height: '110%',
            background: 'radial-gradient(ellipse at 50% 100%, rgba(34,197,94,0.18) 0%, transparent 62%)',
          }}
        />

        {/* Diamond + dirt + mound — drawn from the exact same x/y numbers
            the slots below are placed at, so the shape always passes
            precisely through 2B / 1B / Home / 3B */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <radialGradient id="dirtFade" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(176,131,88,0.32)" />
              <stop offset="60%" stopColor="rgba(176,131,88,0.15)" />
              <stop offset="100%" stopColor="rgba(176,131,88,0)" />
            </radialGradient>
          </defs>
          <polygon points={DIAMOND_PTS.map(p => `${p.x},${p.y}`).join(' ')} fill="url(#dirtFade)" />
          <polygon
            points={DIAMOND_PTS.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="0.55" strokeLinejoin="round"
          />
          {/* Foul lines from home plate through 1B / 3B and out to the corners */}
          <line x1={pt('C').x} y1={pt('C').y} x2={pt('1B').x + (pt('1B').x - pt('C').x) * 1.6} y2={pt('1B').y + (pt('1B').y - pt('C').y) * 1.6}
                stroke="rgba(255,255,255,0.28)" strokeWidth="0.4" />
          <line x1={pt('C').x} y1={pt('C').y} x2={pt('3B').x + (pt('3B').x - pt('C').x) * 1.6} y2={pt('3B').y + (pt('3B').y - pt('C').y) * 1.6}
                stroke="rgba(255,255,255,0.28)" strokeWidth="0.4" />
          <circle cx={MOUND_PT.x} cy={MOUND_PT.y} r="2.4" fill="rgba(199,154,107,0.55)" stroke="rgba(255,255,255,0.35)" strokeWidth="0.3" />
          <circle cx={pt('C').x} cy={pt('C').y} r="1.6" fill="rgba(255,255,255,0.55)" />
        </svg>

        {/* Slots — positioned with the SAME x/y numbers as the polygon above */}
        {FIELD_POSITIONS.map(({ pos, label, x, y }) => (
          <div
            key={pos}
            className="absolute"
            style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
          >
            <DiamondSlot
              pos={pos} label={label} player={roster[pos]}
              isEligible={eligibleSlots.includes(pos)} teamColor={teamColor}
              onPlace={() => eligibleSlots.includes(pos) && onPlace(pos)}
            />
          </div>
        ))}
      </div>

      {/* ── ROTATION ──────────────────────────────────────────────────── */}
      <div className="w-full min-w-0 flex flex-col">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-emerald-300/80 text-[11px] font-bold uppercase tracking-[0.25em] whitespace-nowrap">
            Pitching Rotation
          </span>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(134,239,172,0.35), transparent)' }} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {ROTATION.map(({ pos, label }) => (
            <DiamondSlot
              key={pos}
              pos={pos} label={label} player={roster[pos]}
              isEligible={eligibleSlots.includes(pos)} teamColor={teamColor}
              onPlace={() => eligibleSlots.includes(pos) && onPlace(pos)}
              row
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Shared sizing — identical in every state and every context, so the avatar /
// position label / sub-label are always the same size as one another.
const AV_SIZE   = 'w-9 h-9 sm:w-10 sm:h-10';
const LABEL_TXT = 'text-[10px] sm:text-[11px]';
const SUB_TXT   = 'text-[8px] sm:text-[9px]';
const CARD_W    = 'w-[62px] sm:w-[72px] md:w-[80px]';

function DiamondSlot({
  pos, label, player, isEligible, teamColor, onPlace, row,
}: {
  pos: Position;
  label: string;
  player?: DraftedPlayer;
  isEligible: boolean;
  teamColor: string;
  onPlace: () => void;
  /** Render as a horizontal list row (used for the rotation panel) instead of a compact field card. */
  row?: boolean;
}) {
  const isPitcher = ROTATION_SLOTS.includes(pos) || pos === 'CL';
  const playerColor = player ? (FRANCHISE_MAP.get(player.franchiseAbbr)?.color ?? '#22c55e') : teamColor;

  const sizing  = row ? 'w-full' : CARD_W;
  const shellBase = `${sizing} rounded-xl flex items-center transition-all duration-200 ${
    row ? 'flex-row gap-2.5 px-2.5 py-2 text-left' : 'flex-col justify-center gap-1 px-1 py-1.5 text-center'
  }`;
  const avatarBase = `${AV_SIZE} shrink-0 rounded-lg flex items-center justify-center font-black shadow-lg ring-2 ring-white/20`;
  const textWrap = row ? 'min-w-0 flex-1 text-left' : 'min-w-0 w-full text-center';

  if (player) {
    const first = player.name.split(' ').slice(0, -1).join(' ');
    const last  = player.name.split(' ').slice(-1)[0];
    return (
      <div
        className={`${shellBase} backdrop-blur-sm`}
        style={{
          border: `1.5px solid ${playerColor}`,
          background: `linear-gradient(160deg, ${playerColor}33 0%, rgba(20,30,20,0.6) 60%)`,
          boxShadow: `0 0 22px ${playerColor}55, 0 4px 14px rgba(0,0,0,0.35)`,
        }}
      >
        <div className={`${avatarBase} text-white text-sm`} style={{ backgroundColor: playerColor }}>
          {player.initials}
        </div>
        <div className={textWrap}>
          <div className={`text-white ${LABEL_TXT} font-bold leading-tight truncate`}>{first || last}</div>
          <div className={`text-white/60 ${SUB_TXT} leading-tight truncate`}>{first ? last : label}</div>
        </div>
      </div>
    );
  }

  if (isEligible) {
    return (
      <button
        onClick={onPlace}
        className={`group ${shellBase} border-2 border-dashed border-emerald-300/70 hover:border-white
                   hover:scale-[1.05] active:scale-95 animate-[pulse_2.4s_ease-in-out_infinite]`}
        style={{
          backgroundColor: 'rgba(134,239,172,0.12)',
          boxShadow: `0 0 22px ${teamColor}66, inset 0 0 16px rgba(134,239,172,0.1)`,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.18)';
          e.currentTarget.style.boxShadow = `0 0 34px ${teamColor}aa, inset 0 0 20px rgba(255,255,255,0.14)`;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.backgroundColor = 'rgba(134,239,172,0.12)';
          e.currentTarget.style.boxShadow = `0 0 22px ${teamColor}66, inset 0 0 16px rgba(134,239,172,0.1)`;
        }}
      >
        <div className={`${avatarBase} text-white font-light text-lg bg-white/15 group-hover:bg-white/25 transition-colors`}>
          +
        </div>
        <div className={textWrap}>
          <div className={`text-white ${LABEL_TXT} font-bold leading-tight truncate`}>{pos}</div>
          <div className={`text-emerald-200/70 ${SUB_TXT} leading-tight truncate`}>{label}</div>
        </div>
      </button>
    );
  }

  return (
    <div className={`${shellBase} border border-white/15 bg-black/30 backdrop-blur-[2px] ${isPitcher ? '' : ''}`}>
      <div className={`${avatarBase} bg-white/10`} />
      <div className={textWrap}>
        <div className={`text-slate-300 ${LABEL_TXT} font-bold leading-tight truncate`}>{pos}</div>
        <div className={`text-slate-500 ${SUB_TXT} leading-tight truncate`}>{label}</div>
      </div>
    </div>
  );
}
