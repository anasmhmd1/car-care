'use client';

import { useState, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PublicImage from '@/components/PublicImage';

interface ServiceImageGalleryProps {
  images: string[];
  serviceName: string;
}

export default function ServiceImageGallery({ images, serviceName }: ServiceImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const cleanImages = images.filter((img) => typeof img === 'string' && img.length > 0);
  const total = cleanImages.length || 1;
  const currentImage = cleanImages[currentIndex] || cleanImages[0] || '/images/bareeq_exterior_care.png';

  const nextImage = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % total);
  }, [total]);

  const prevImage = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') {
        // In RTL, right arrow goes to previous/next appropriately
        nextImage();
      } else if (e.key === 'ArrowLeft') {
        prevImage();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextImage, prevImage]);

  return (
    <div className="relative aspect-[16/9] sm:aspect-[21/9] w-full overflow-hidden rounded-3xl border border-white/10 bg-[#121210] shadow-2xl group select-none">
      {/* Current Image */}
      <PublicImage
        key={currentImage}
        src={currentImage}
        alt={`${serviceName} — صورة ${currentIndex + 1}`}
        sizes="(min-width: 1024px) 1000px, 100vw"
        priority
        className="w-full h-full object-cover transition-opacity duration-300"
      />

      {/* Subtle Gradient Overlays for controls readability */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

      {/* Navigation Arrows (Shown when more than 1 image) */}
      {total > 1 && (
        <>
          {/* Right Arrow (RTL Previous / Next) */}
          <button
            type="button"
            onClick={prevImage}
            aria-label="الصورة السابقة"
            className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 flex size-10 sm:size-12 items-center justify-center rounded-full bg-black/60 hover:bg-[#d4af37] text-white hover:text-black border border-white/20 hover:border-[#d4af37] backdrop-blur-md transition-all shadow-xl active:scale-90 opacity-90 sm:opacity-75 sm:group-hover:opacity-100 focus-visible:opacity-100 outline-none"
          >
            <ChevronRight className="size-5 sm:size-6" />
          </button>

          {/* Left Arrow (RTL Next) */}
          <button
            type="button"
            onClick={nextImage}
            aria-label="الصورة التالية"
            className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 flex size-10 sm:size-12 items-center justify-center rounded-full bg-black/60 hover:bg-[#d4af37] text-white hover:text-black border border-white/20 hover:border-[#d4af37] backdrop-blur-md transition-all shadow-xl active:scale-90 opacity-90 sm:opacity-75 sm:group-hover:opacity-100 focus-visible:opacity-100 outline-none"
          >
            <ChevronLeft className="size-5 sm:size-6" />
          </button>

          {/* Bottom Dot Indicators & Counter Badge */}
          <div className="absolute bottom-4 inset-x-0 flex items-center justify-between px-5 pointer-events-none">
            {/* Dots */}
            <div className="flex items-center gap-1.5 pointer-events-auto bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
              {cleanImages.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  aria-label={`الانتقال إلى صورة ${idx + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    idx === currentIndex
                      ? 'w-6 bg-[#d4af37]'
                      : 'w-2 bg-white/40 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>

            {/* Counter Badge */}
            <span className="text-[11px] font-bold text-white/90 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 font-mono" dir="ltr">
              {currentIndex + 1} / {total}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
