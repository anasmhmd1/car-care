'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import BareeqLogo from '@/components/BareeqLogo';
import SkipLink from '@/components/SkipLink';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <SkipLink />
      <main
        id="main-content"
        className="min-h-screen bg-[#080808] px-4 py-16 text-white flex items-center justify-center"
      >
        <section
          className="w-full max-w-lg rounded-3xl border border-[#cea355]/25 bg-[#141414] p-8 text-center shadow-2xl"
          aria-labelledby="error-title"
          aria-live="assertive"
        >
          <div className="flex justify-center">
            <BareeqLogo size="lg" />
          </div>
          <h1 id="error-title" className="mt-7 text-2xl font-black text-white text-balance">
            تعذر تحميل الصفحة
          </h1>
          <p className="mt-3 text-sm leading-7 text-neutral-400 text-pretty">
            تحقق من اتصالك ثم أعد المحاولة. إذا استمرت المشكلة، ارجع إلى الصفحة الرئيسية واختر وجهتك من جديد.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl gold-gradient px-6 py-3 text-sm font-bold text-[#080808] shadow-lg hover:brightness-110 active:scale-[0.98] transition-[filter,transform]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              إعادة المحاولة
            </button>
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-neutral-700 bg-[#080808] px-6 py-3 text-sm font-bold text-white hover:border-[#cea355] hover:text-[#edce8b] transition-[color,border-color]"
            >
              العودة إلى الرئيسية
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
