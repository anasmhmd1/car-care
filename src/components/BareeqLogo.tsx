import React from 'react';

interface LogoProps {
  className?: string;
  showText?: boolean;
  showTagline?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  variant?: 'official' | 'header' | 'gold' | 'white' | 'dark';
}

export default function BareeqLogo({
  className = '',
  size = 'md',
  variant = 'header',
}: LogoProps) {
  const sizeClasses = {
    xs: 'text-xs sm:text-sm tracking-[0.18em]',
    sm: 'text-sm sm:text-base tracking-[0.2em]',
    md: 'text-lg sm:text-xl md:text-2xl tracking-[0.22em]',
    lg: 'text-2xl sm:text-3xl tracking-[0.24em]',
    xl: 'text-3xl sm:text-4xl tracking-[0.26em]',
    '2xl': 'text-4xl sm:text-5xl tracking-[0.28em]',
    '3xl': 'text-5xl sm:text-6xl tracking-[0.3em]',
  }[size];

  const carColor =
    variant === 'gold'
      ? 'text-[#cea355]'
      : variant === 'dark'
      ? 'text-neutral-900'
      : 'text-white';

  const careColor =
    variant === 'white'
      ? 'text-white'
      : variant === 'dark'
      ? 'text-[#a67c33]'
      : 'text-[#cea355]';

  return (
    <div
      className={`inline-flex items-center select-none font-black uppercase font-sans transition-all duration-300 group ${sizeClasses} ${className}`}
      dir="ltr"
      role="img"
      aria-label="CAR CARE"
    >
      <span className={`${carColor} transition-colors duration-200 drop-shadow-[0_2px_8px_rgba(255,255,255,0.15)] group-hover:text-white`}>
        CAR
      </span>
      <span className={`${careColor} ml-1.5 sm:ml-2 transition-colors duration-200 drop-shadow-[0_2px_14px_rgba(206,163,85,0.45)] group-hover:brightness-110`}>
        CARE
      </span>
    </div>
  );
}
