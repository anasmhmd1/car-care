'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Phone, MessageCircle, X, ChevronLeft } from 'lucide-react';
import { phoneHref, whatsappHref } from '@/lib/contact-links';

interface FloatingContactWidgetProps {
  initialPhone?: string | null;
  initialWhatsapp?: string | null;
}

export default function FloatingContactWidget({
  initialPhone = null,
  initialWhatsapp = null,
}: FloatingContactWidgetProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [phone, setPhone] = useState<string | null>(initialPhone);
  const [whatsapp, setWhatsapp] = useState<string | null>(initialWhatsapp);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Do not render floating contact widget on internal admin and operational screens
  const isInternalAdminRoute =
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/system-admin') ||
    pathname?.startsWith('/operations') ||
    pathname?.startsWith('/staff');

  // Fetch latest public contact dynamically from API in case owner updated it
  useEffect(() => {
    if (isInternalAdminRoute) return;
    let isMounted = true;
    async function fetchContact() {
      try {
        const res = await fetch('/api/public/contact', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            if (data.phone) setPhone(data.phone);
            if (data.whatsapp) setWhatsapp(data.whatsapp);
          }
        }
      } catch {
        // Fallback to initial props
      }
    }
    fetchContact();
    return () => {
      isMounted = false;
    };
  }, [isInternalAdminRoute]);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (isInternalAdminRoute) {
    return null;
  }

  const activePhone = phone || '01000000000';
  const activeWhatsapp = whatsapp || activePhone;

  return (
    <div
      ref={widgetRef}
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-1.5 sm:gap-2.5 pointer-events-auto"
      style={{ left: 'auto', right: '1rem' }}
      aria-label="خيارات التواصل المباشر"
    >
      {/* Main Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 sm:gap-3 px-3.5 py-2 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl backdrop-blur-xl transition-all duration-300 shadow-xl active:scale-95 cursor-pointer ${
          isOpen
            ? 'bg-[#18140c]/95 border border-[#cea355] text-[#edce8b] shadow-[#cea355]/20'
            : 'bg-[#18140c]/90 hover:bg-[#251f12] border border-[#cea355]/50 hover:border-[#cea355] text-white shadow-[#cea355]/15'
        }`}
        aria-expanded={isOpen}
        aria-label="زر تواصل معنا"
      >
        <span className="relative flex items-center justify-center">
          {isOpen ? (
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#edce8b] transition-transform duration-200" />
          ) : (
            <>
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#edce8b]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="absolute -top-1 -end-1 w-2 h-2 rounded-full bg-[#cea355] animate-pulse" />
            </>
          )}
        </span>
        <span className="text-xs sm:text-sm font-bold tracking-wide text-white group-hover:text-[#edce8b] transition-colors">
          تواصل مع الدعم
        </span>
      </button>

      {/* Sub Buttons (Stacked directly below/above in Digitalio style with warm Brand Gold/Orange Identity) */}
      {isOpen && (
        <div className="flex flex-col items-end gap-1.5 sm:gap-2 w-full animate-in fade-in slide-in-from-top-2 duration-200">
          
          {/* WhatsApp Pill Button */}
          <a
            href={whatsappHref(activeWhatsapp, 'مرحباً، أود الاستفسار عن خدمات بريق للعناية بالسيارات')}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2.5 sm:gap-4 px-3 py-2 sm:px-4 sm:py-3 rounded-xl sm:rounded-2xl bg-[#18140c]/90 hover:bg-[#251f12] backdrop-blur-xl border border-[#cea355]/40 hover:border-[#cea355] text-white transition-all duration-200 shadow-lg shadow-[#cea355]/10 group w-full min-w-[155px] sm:min-w-[200px] active:scale-98"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-[#cea355]/20 border border-[#cea355]/40 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform text-[#edce8b]">
                <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#edce8b]" />
              </div>
              <div className="flex flex-col text-right">
                <span className="text-xs sm:text-sm font-bold text-white group-hover:text-[#edce8b] transition-colors">
                  محادثة واتساب
                </span>
              </div>
            </div>
            <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#cea355] group-hover:text-white group-hover:-translate-x-0.5 transition-all" />
          </a>

          {/* Phone Call Pill Button */}
          <a
            href={phoneHref(activePhone)}
            className="flex items-center justify-between gap-2.5 sm:gap-4 px-3 py-2 sm:px-4 sm:py-3 rounded-xl sm:rounded-2xl bg-[#18140c]/90 hover:bg-[#251f12] backdrop-blur-xl border border-[#cea355]/40 hover:border-[#cea355] text-white transition-all duration-200 shadow-lg shadow-[#cea355]/10 group w-full min-w-[155px] sm:min-w-[200px] active:scale-98"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-[#cea355]/20 border border-[#cea355]/40 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform text-[#edce8b]">
                <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#edce8b]" />
              </div>
              <div className="flex flex-col text-right">
                <span className="text-xs sm:text-sm font-bold text-white group-hover:text-[#edce8b] transition-colors">
                  اتصال هاتفي مباشر
                </span>
              </div>
            </div>
            <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#cea355] group-hover:text-white group-hover:-translate-x-0.5 transition-all" />
          </a>

        </div>
      )}
    </div>
  );
}
