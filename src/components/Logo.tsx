export default function Logo() {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* Baseball */}
      <div
        className="relative w-32 h-32 rounded-full flex items-center justify-center select-none"
        style={{
          background: 'radial-gradient(circle at 38% 32%, #1a3a1a, #0a1a0a)',
          border: '3px solid rgba(100,200,100,0.35)',
          boxShadow: '0 0 40px rgba(34,197,94,0.20), 0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        {/* Baseball stitch lines */}
        <div className="absolute inset-x-8 top-[20%] h-px" style={{ background: 'rgba(150,255,150,0.12)' }} />
        <div className="absolute inset-x-8 bottom-[20%] h-px" style={{ background: 'rgba(150,255,150,0.12)' }} />

        <div className="flex flex-col items-center gap-1">
          <span className="text-[1.85rem] font-black text-white tracking-tighter leading-none">162-0</span>
          <div className="h-px w-10 rounded-full" style={{ background: 'rgba(100,200,100,0.4)' }} />
          <span className="text-[9px] font-semibold tracking-[0.22em] uppercase" style={{ color: 'rgba(140,220,140,0.6)' }}>
            EST. 2025
          </span>
        </div>
      </div>
    </div>
  );
}
