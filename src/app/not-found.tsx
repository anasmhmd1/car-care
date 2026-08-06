import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import BareeqLogo from '@/components/BareeqLogo';
import SkipLink from '@/components/SkipLink';

export const metadata: Metadata = {
  title: 'الصفحة غير موجودة',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <>
      <SkipLink />
      <main
        id="main-content"
        className="min-h-screen bg-[#080808] text-white flex items-center justify-center px-4 py-16 text-center"
      >
        <section className="w-full max-w-lg rounded-3xl border border-[#cea355]/25 bg-[#141414] p-7 sm:p-10 shadow-2xl" aria-labelledby="not-found-title">
          <div className="flex justify-center">
            <BareeqLogo size="lg" />
          </div>

          <div className="mx-auto mt-7 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#cea355]/30 bg-[#cea355]/10 text-[#edce8b]">
            <SearchX className="h-8 w-8" aria-hidden="true" />
          </div>

          <p className="mt-5 font-mono text-sm font-bold tracking-[0.28em] text-[#cea355]" aria-hidden="true">
            404
          </p>
          <h1 id="not-found-title" className="mt-2 text-2xl sm:text-3xl font-black text-white">
            الصفحة غير موجودة
          </h1>

          <p className="mt-3 text-sm leading-7 text-neutral-400">
            قد يكون الرابط قديمًا أو غير صحيح. ارجع إلى الرئيسية أو تصفح الخدمات المتاحة حاليًا.
          </p>

          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-xl gold-gradient px-6 py-3 text-sm font-bold text-[#080808] shadow-lg hover:brightness-110 active:scale-[0.98] transition-[filter,transform]"
            >
              العودة إلى الرئيسية
            </Link>
            <Link
              href="/services"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-neutral-700 bg-[#080808] px-6 py-3 text-sm font-bold text-white hover:border-[#cea355] hover:text-[#edce8b] transition-[color,border-color]"
            >
              تصفح الخدمات
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
