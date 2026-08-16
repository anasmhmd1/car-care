import React from 'react';

interface LogoProps {
  className?: string;
  showText?: boolean;
  showTagline?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'gold' | 'white' | 'dark';
}

export default function BareeqLogo({
  className = '',
  size = 'md',
}: LogoProps) {
  // Height sizing for responsive scaling of the new 300x66 horizontal transparent logo
  const heightClass = {
    sm: 'h-7 sm:h-8',
    md: 'h-9 sm:h-11',
    lg: 'h-12 sm:h-14',
    xl: 'h-16 sm:h-20',
  }[size];

  return (
    <div
      className={`inline-flex items-center select-none group ${className}`}
      dir="ltr"
      role="img"
      aria-label="بريق | BAREEQ"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/bareeq_official_logo.png"
        alt="بريق | BAREEQ"
        className={`${heightClass} w-auto object-contain transition-transform duration-300 group-hover:scale-103 drop-shadow-[0_2px_10px_rgba(206,163,85,0.3)]`}
        loading="eager"
      />
    </div>
  );
}
