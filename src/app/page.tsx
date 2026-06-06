import Logo from '@/components/Logo';
import DraftGame from '@/components/DraftGame';

export default function Home() {
  return (
    <main className="min-h-screen text-[var(--ink-warm)]">
      <div className="w-full mx-auto px-4 py-10 flex flex-col items-center gap-6">
        <Logo />
        <h1 className="font-display text-[2.1rem] sm:text-[2.4rem] tracking-[0.03em] text-white">
          Can you go <span className="text-[var(--brass)]">162-0</span>?
        </h1>
        <DraftGame />
      </div>
    </main>
  );
}
