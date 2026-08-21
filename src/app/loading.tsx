import BareeqLogo from '@/components/BareeqLogo';

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="fixed inset-0 z-50 bg-[#050505] flex flex-col items-center justify-center text-white transition-opacity duration-300"
      aria-busy="true"
      aria-live="polite"
    >
      {/* Top Gold Animated Loading Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 gold-gradient animate-pulse z-50" />

      <div className="flex flex-col items-center justify-center space-y-6 p-6 text-center animate-pulse">
        <div className="relative flex items-center justify-center">
          <div className="absolute -inset-8 bg-[#cea355]/20 rounded-full blur-3xl pointer-events-none" />
          <BareeqLogo size="2xl" className="relative drop-shadow-[0_0_30px_rgba(206,163,85,0.45)]" />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#cea355] animate-ping" />
          <span dir="ltr" className="text-xs font-black text-[#edce8b] tracking-widest uppercase">Loading...</span>
        </div>
      </div>
    </div>
  );
}
