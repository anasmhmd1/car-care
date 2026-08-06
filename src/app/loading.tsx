import BareeqLogo from '@/components/BareeqLogo';

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="جارٍ تجهيز الصفحة"
      className="fixed inset-0 z-50 bg-[#050505] flex flex-col items-center justify-center text-white transition-opacity duration-300"
      aria-busy="true"
      aria-live="polite"
    >
      {/* Top Gold Animated Loading Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 gold-gradient animate-pulse z-50" />

      <div className="flex flex-col items-center justify-center space-y-4 p-6 text-center">
        <BareeqLogo size="md" />
        <div className="flex items-center gap-2 pt-2">
          <div className="w-2 h-2 rounded-full bg-[#cea355] animate-ping" />
          <span className="text-xs font-bold text-[#edce8b] tracking-wider uppercase">جاري التحميل...</span>
        </div>
      </div>
    </div>
  );
}
