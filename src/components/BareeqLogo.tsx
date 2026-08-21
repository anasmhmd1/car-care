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
  variant = 'official',
}: LogoProps) {
  // Height sizing for crisp responsive scaling
  const heightClass = {
    xs: 'h-6 sm:h-7',
    sm: 'h-7 sm:h-8',
    md: 'h-9 sm:h-11',
    lg: 'h-12 sm:h-14',
    xl: 'h-16 sm:h-20',
    '2xl': 'h-24 sm:h-28',
    '3xl': 'h-32 sm:h-40',
  }[size];

  const logoSrc = variant === 'header' 
    ? '/images/bareeq_header_logo.svg' 
    : '/images/bareeq_official_logo.svg';

  return (
    <div
      className={`inline-flex items-center select-none group ${className}`}
      dir="ltr"
      role="img"
      aria-label="بريق | BAREEQ"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc}
        alt="بريق | BAREEQ"
        className={`${heightClass} w-auto object-contain transition-transform duration-300 group-hover:scale-103 drop-shadow-[0_2px_14px_rgba(206,163,85,0.35)]`}
        loading="eager"
      />
    </div>
  );
}

