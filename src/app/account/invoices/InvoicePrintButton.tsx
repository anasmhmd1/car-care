'use client';

import { Printer } from 'lucide-react';

export default function InvoicePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#c9a227] px-5 text-sm font-black text-black transition hover:bg-[#e5c45a] focus:outline-none focus:ring-2 focus:ring-[#e5c45a] print:hidden"
    >
      <Printer className="size-4" aria-hidden="true" />
      طباعة أو حفظ PDF
    </button>
  );
}
