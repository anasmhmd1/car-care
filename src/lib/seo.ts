import type { Metadata } from 'next';

const fallbackSiteUrl = 'https://carcare.com';

function resolveSiteUrl() {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || fallbackSiteUrl);
  } catch {
    return new URL(fallbackSiteUrl);
  }
}

export const siteUrl = resolveSiteUrl();
export const siteName = 'CAR CARE';

interface PublicMetadataOptions {
  title?: string;
  description: string;
  path: string;
}

export function createPublicMetadata({
  title = 'CAR CARE',
  description,
  path,
}: PublicMetadataOptions): Metadata {
  const brandTitle = title === 'CAR CARE' ? 'CAR CARE | كار كير' : `${title} | CAR CARE`;
  return {
    title: brandTitle,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: brandTitle,
      description,
      url: path,
      siteName,
      locale: 'ar_EG',
      type: 'website',
      images: [
        {
          url: '/images/car_care_official_logo.png',
          width: 1200,
          height: 630,
          alt: 'CAR CARE',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: brandTitle,
      description,
      images: ['/images/car_care_official_logo.png'],
    },
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
