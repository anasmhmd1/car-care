import BareeqLogo from '@/components/BareeqLogo';

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="جارٍ تجهيز الصفحة"
      className="min-h-screen bg-[#080808] px-4 py-16 text-white flex items-center justify-center"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="w-full max-w-sm rounded-3xl border border-[#cea355]/25 bg-[#141414] p-8 text-center shadow-2xl">
        <BareeqLogo size="lg" />
        <div className="mt-8 space-y-3" aria-hidden="true">
          <div className="h-3 w-3/4 mx-auto rounded-full bg-neutral-800 animate-pulse" />
          <div className="h-3 w-1/2 mx-auto rounded-full bg-neutral-800 animate-pulse" />
        </div>
        <p className="mt-6 text-sm font-semibold text-[#edce8b]">جاري تجهيز الصفحة…</p>
      </div>
    </div>
  );
}
