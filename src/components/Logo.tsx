export default function Logo() {
  return (
    <div className="flex items-center gap-4 select-none">
      {/* Baseball — a clean leather-toned sphere with a genuine curved-seam
          stitch pattern. No text inside: letting the ball just be a ball
          (rather than a label crossed by stitch lines) reads far better,
          and pairs with the wordmark beside it like a real team crest. */}
      <div
        className="relative w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full flex-shrink-0 overflow-hidden"
        style={{
          background: 'radial-gradient(circle at 36% 30%, #f4ecd8 0%, #d8c9a8 22%, #8a7a5c 60%, #4a4030 100%)',
          boxShadow: '0 0 0 1px rgba(244,236,216,0.25), 0 0 36px rgba(216,160,74,0.16), 0 8px 26px rgba(0,0,0,0.5), inset 0 -12px 26px rgba(0,0,0,0.35)',
        }}
      >
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" fill="none">
          <path d="M 18 12 C 34 34, 34 66, 18 88" stroke="#b6362a" strokeWidth="1.6" opacity="0.6" />
          <path d="M 82 12 C 66 34, 66 66, 82 88" stroke="#b6362a" strokeWidth="1.6" opacity="0.6" />
          {[20, 30, 40, 50, 60, 70, 80].map(t => {
            const y = t;
            const lx = 18 + Math.sin((t - 12) / 76 * Math.PI) * 16;
            const rx = 82 - Math.sin((t - 12) / 76 * Math.PI) * 16;
            return (
              <g key={t} stroke="#b6362a" strokeWidth="1.1" opacity="0.55">
                <line x1={lx - 3} y1={y - 2.4} x2={lx + 3} y2={y + 2.4} />
                <line x1={rx - 3} y1={y - 2.4} x2={rx + 3} y2={y + 2.4} />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Wordmark — sits beside the ball instead of crammed inside it, so
          both the icon and the type can actually breathe and read clearly. */}
      <div className="flex flex-col items-start gap-1">
        <span className="font-display text-[2rem] sm:text-[2.3rem] leading-none tracking-[0.05em] text-white">
          162-0
        </span>
        <span className="text-[10px] font-bold tracking-[0.32em] uppercase text-[var(--brass)]/70">
          Est. 2026
        </span>
      </div>
    </div>
  );
}
