'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

const fallbackImage = '/images/service-care.svg';

interface PublicImageProps {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
  quality?: number;
  unoptimized?: boolean;
}

function getInitialSource(src: string) {
  if (!src) {
    return fallbackImage;
  }

  return src;
}

export default function PublicImage({
  src,
  alt,
  sizes,
  className,
  priority = false,
  quality,
  unoptimized,
}: PublicImageProps) {
  const [resolvedSource, setResolvedSource] = useState(() => getInitialSource(src));

  useEffect(() => {
    setResolvedSource(getInitialSource(src));
  }, [src]);

  const isInternalMedia = typeof resolvedSource === 'string' && resolvedSource.startsWith('/api/');
  const shouldBeUnoptimized = unoptimized ?? isInternalMedia;

  return (
    <Image
      src={resolvedSource}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      quality={quality}
      unoptimized={shouldBeUnoptimized}
      className={className}
      onError={() => {
        if (resolvedSource !== fallbackImage) {
          setResolvedSource(fallbackImage);
        }
      }}
    />
  );
}
