'use client';
import { useEffect, useRef, useState } from 'react';
import { FRANCHISE_MAP } from '@/lib/franchises';

interface SpinCombo { abbr: string; decade: string; }

interface Props {
  franchiseAbbr: string;
  city: string;
  decade: string;
  spinCombos: SpinCombo[];
  onDone: () => void;
}

export default function SlotMachine({ franchiseAbbr, city, decade, spinCombos, onDone }: Props) {
  const [displayAbbr,   setDisplayAbbr]   = useState(spinCombos[0]?.abbr   ?? franchiseAbbr);
  const [displayDecade, setDisplayDecade] = useState(spinCombos[0]?.decade ?? decade);
  const [spinning,      setSpinning]      = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const teamColor = FRANCHISE_MAP.get(franchiseAbbr)?.color ?? '#22c55e';

  useEffect(() => {
    setSpinning(true);
    const combos = spinCombos.length > 0 ? spinCombos : [{ abbr: franchiseAbbr, decade }];
    let tick = 0;
    const totalTicks = 28;

    intervalRef.current = setInterval(() => {
      tick++;
      const progress = tick / totalTicks;

      if (progress > 0.75) {
        const validDecades = combos.filter(c => c.abbr === franchiseAbbr).map(c => c.decade);
        const pool = validDecades.length > 0 ? validDecades : [decade];
        setDisplayAbbr(franchiseAbbr);
        setDisplayDecade(pool[Math.floor(Math.random() * pool.length)]);
      } else {
        const c = combos[Math.floor(Math.random() * combos.length)];
        setDisplayAbbr(c.abbr);
        setDisplayDecade(c.decade);
      }

      if (tick >= totalTicks) {
        clearInterval(intervalRef.current!);
        setDisplayAbbr(franchiseAbbr);
        setDisplayDecade(decade);
        setSpinning(false);
        setTimeout(onDone, 400);
      }
    }, 100);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [franchiseAbbr, decade, spinCombos, onDone]);

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <div className="text-[var(--ink-warm)]/35 text-[11px] font-bold uppercase tracking-[0.3em]">
        On the clock
      </div>

      <div className="flex items-center gap-3">
        <div
          className="relative px-7 py-5 min-w-[140px] text-center transition-all duration-300 overflow-hidden"
          style={{
            borderRadius: '0.5rem',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
            border: `1px solid ${spinning ? 'rgba(255,255,255,0.12)' : legibleBorder(teamColor)}`,
            boxShadow: spinning
              ? 'inset 0 1px 0 rgba(255,255,255,0.05)'
              : `0 0 0 1px ${teamColor}30 inset, 0 0 32px ${teamColor}40, inset 0 1px 0 rgba(255,255,255,0.08)`,
          }}
        >
          {/* corner rivets — scoreboard-panel detail */}
          <Rivet pos="tl" /><Rivet pos="tr" /><Rivet pos="bl" /><Rivet pos="br" />
          <div className={`font-display text-4xl tracking-[0.06em] transition-all duration-150 ${spinning ? 'text-white/40 blur-[0.5px]' : 'text-white'}`}>
            {displayAbbr}
          </div>
          {!spinning && (
            <div className="text-[10px] mt-1.5 font-bold uppercase tracking-[0.2em]" style={{ color: legibleBorder(teamColor) }}>
              {city}
            </div>
          )}
        </div>

        <div className="text-[var(--ink-warm)]/20 font-display text-2xl">⁄</div>

        <div
          className="relative px-7 py-5 min-w-[112px] text-center transition-all duration-300 overflow-hidden"
          style={{
            borderRadius: '0.5rem',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
            border: `1px solid ${spinning ? 'rgba(255,255,255,0.12)' : legibleBorder(teamColor)}`,
            boxShadow: spinning
              ? 'inset 0 1px 0 rgba(255,255,255,0.05)'
              : `0 0 0 1px ${teamColor}30 inset, 0 0 32px ${teamColor}40, inset 0 1px 0 rgba(255,255,255,0.08)`,
          }}
        >
          <Rivet pos="tl" /><Rivet pos="tr" /><Rivet pos="bl" /><Rivet pos="br" />
          <div className={`font-display text-4xl tracking-[0.06em] transition-all duration-150 ${spinning ? 'text-white/40 blur-[0.5px]' : 'text-white'}`}>
            {displayDecade}
          </div>
        </div>
      </div>

      {spinning && (
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ backgroundColor: 'var(--brass)', animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Same dark-team-color legibility problem as elsewhere — lighten before use as
// a border/label color against the dark scoreboard panel.
function legibleBorder(hex: string) {
  return `color-mix(in srgb, ${hex} 55%, white)`;
}

function Rivet({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const place: Record<string, string> = {
    tl: 'top-1.5 left-1.5', tr: 'top-1.5 right-1.5',
    bl: 'bottom-1.5 left-1.5', br: 'bottom-1.5 right-1.5',
  };
  return <div className={`absolute ${place[pos]} w-[3px] h-[3px] rounded-full bg-white/10`} />;
}
