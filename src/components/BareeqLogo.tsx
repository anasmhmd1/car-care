import React, { useId } from 'react';

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'gold' | 'white' | 'dark';
}

export default function BareeqLogo({ className = '', showText = true, size = 'md' }: LogoProps) {
  const gradientId = useId();

  const iconDimensions = {
    sm: 'w-10 h-10',
    md: 'w-14 h-14',
    lg: 'w-20 h-20',
    xl: 'w-28 h-28',
  }[size];

  const textSizes = {
    sm: 'text-2xl sm:text-3xl',
    md: 'text-[38px] sm:text-[46px]',
    lg: 'text-[54px] sm:text-[66px]',
    xl: 'text-[76px] sm:text-[92px]',
  }[size];

  return (
    <div
      className={`inline-flex items-center gap-3.5 group select-none ${className}`}
      dir="ltr"
      role="img"
      aria-label="بريق للعناية المتنقلة بالسيارات"
    >
      {/* Official Bareeq Luxury Emblem Icon (Asset 6.svg cropped & enlarged) */}
      <div className={`relative ${iconDimensions} rounded-2xl bg-gradient-to-br from-[#edce8b] via-[#cea355] to-[#b5883f] p-[2px] shadow-xl shadow-[#cea355]/30 transition-transform duration-300 group-hover:scale-105 shrink-0`} aria-hidden="true">
        <div className="w-full h-full rounded-[14px] bg-[#080808] flex items-center justify-center relative overflow-hidden p-1">
          {/* Ambient inner glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#edce8b]/20 via-transparent to-transparent pointer-events-none" />
          
          <svg viewBox="155 120 285 300" className="w-full h-full relative z-10 drop-shadow-[0_2px_8px_rgba(237,206,139,0.3)]" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id={gradientId} x1="203.51" y1="217.65" x2="533.26" y2="464.87" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#edce8b" />
                <stop offset="0.64" stopColor="#cea355" />
                <stop offset="1" stopColor="#b5883f" />
              </linearGradient>
            </defs>
            <path
              fill={`url(#${gradientId})`}
              d="M396.88,196.05,310.7,135.73l-.56-.37c-9.74-5.81-12.94-6-22.84-.46l-.26.15-86.14,60.6a31.92,31.92,0,0,0-16,27.2l-1.63,129.26a31.43,31.43,0,0,0,.95,7.71,33.45,33.45,0,0,0,2.57,6.85A41,41,0,0,0,195,378c5.62,4.21,11.62,8.48,18,12.75,7.16,4.79,10.82,8.52,17.88,11.33,8.19,3.27,12.31,2.53,13.52,2.28,6-1.24,9.87-5.67,11.19-7.35a32.24,32.24,0,0,0,5.14-9.91,15.08,15.08,0,0,1,2.27-5.19,11.54,11.54,0,0,1,3.57-3.37c1.88-1.08,3.48-1.11,9.17-1.11l7.6,0,23.43-.18c.44,0,1.09,0,1.87,0,2.29-.11,15.76-.95,26.19-11.13s11.3-23.67,11.6-29.09a51.56,51.56,0,0,0-4.85-24.56,41.34,41.34,0,0,0-9.45-12.07,51.62,51.62,0,0,1-16.18,10.45,22.33,22.33,0,0,1,5.59,4.05c8,7.95,8.43,20.87,5.34,29.83a23.23,23.23,0,0,1-5.45,9.28,23.67,23.67,0,0,1-11.07,6.07c-4,1.11-4.86.42-19.21.29-9.46-.09-12.51.07-12.51.07a62,62,0,0,0-11.07.43,19.81,19.81,0,0,0-7.1,2.47,25.9,25.9,0,0,0-4.17,3.27,27,27,0,0,0-2.21,2.37c-9,10.79-7.91,18.51-12.85,19.76-2.12.54-5.9-1.21-12.68-5.93-2.14-1.49-5.41-3.73-9.56-6.41-5-3-9.22-5.84-12.53-8.25-2.93-2.13-5.48-4.14-6.75-7.6a12.58,12.58,0,0,1-.75-4l-.6-18.71.27-21.42,1.23-93.39a16.9,16.9,0,0,1,8.63-14.46l.27-.15,87.09-58.57a7.69,7.69,0,0,1,3.76-.85,7.54,7.54,0,0,1,3.58,1.07l85.14,58.29.56.37a16.91,16.91,0,0,1,8.21,14.72l-1.69,132.08A16.91,16.91,0,0,1,386.78,370l-.28.15-41.59,25.12L337.54,400a22,22,0,0,0,6.81,4.06,22.87,22.87,0,0,0,13.51.59l9.42-6.37L394.39,382A32.65,32.65,0,0,0,406,371a29.31,29.31,0,0,0,4.42-15.22l1.69-132.09A31.93,31.93,0,0,0,396.88,196.05ZM262.67,279.18a4.77,4.77,0,0,0,4.74-4.68V253.92a3,3,0,0,0-3-2.93h-8.67a2.94,2.94,0,0,0-3,2.92v22.35a3,3,0,0,0,3,2.92Zm-18.26,17.74a10.21,10.21,0,0,0-.74,3.71c0,1.29.07,2.64.07,4v71.48h0c.08-.33.17-.66.26-1,0,0,.14-.49.29-1,2-6.19,8.11-11.3,8.11-11.3a29.67,29.67,0,0,1,8.46-4.93l.25-50.29h41.79a32.6,32.6,0,0,0,4.58-.11c11.19-1.08,18.72-7.89,20.63-9.61,11.85-10.71,12.73-26.34,13-31.27.23-4,1.22-20.63-10.66-33.12a39.14,39.14,0,0,0-13.2-9A37.17,37.17,0,0,0,303.38,222H235.14a13.24,13.24,0,0,0,.07,2,14.64,14.64,0,0,0,1.84,5.34,19.2,19.2,0,0,0,5.23,6.46,18.13,18.13,0,0,0,8.64,3.57H288c5.41,0,9.83,0,13,.08,5.12.34,6.75.83,7.85,1.23a22.34,22.34,0,0,1,8.53,5.78,21,21,0,0,1,3.2,4.31,19.75,19.75,0,0,1,1.41,3.23c3.61,10.55-.32,21.83-.32,21.83-1.21,3.48-2.09,6-4.49,8.54a23.08,23.08,0,0,1-14.32,6.77H263c-4.11,0-7.56.16-10.17.37-2.44.2-4,.41-5.58,1.57A9.23,9.23,0,0,0,244.41,296.92Z"
            />
          </svg>
        </div>
      </div>

      {/* Brand Typography */}
      {showText && (
        <div className="flex flex-col justify-center items-start text-left">
          <span className={`font-black ${textSizes} tracking-wider gold-gradient-text leading-none font-sans uppercase`} translate="no">
            BAREEQ
          </span>
        </div>
      )}
    </div>
  );
}
