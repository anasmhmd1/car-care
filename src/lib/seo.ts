import type { Metadata } from 'next';

const fallbackSiteUrl = 'https://bareeq.com';

function resolveSiteUrl() {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || fallbackSiteUrl);
  } catch {
    return new URL(fallbackSiteUrl);
  }
}

export const siteUrl = resolveSiteUrl();
export const siteName = 'BAREEQ';

interface PublicMetadataOptions {
  title?: string;
  description: string;
  path: string;
}

export function createPublicMetadata({
  title = 'BAREEQ',
  description,
  path,
}: PublicMetadataOptions): Metadata {
  const brandTitle = title === 'BAREEQ' ? 'BAREEQ' : `${title} | BAREEQ`;
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
          url: '/images/bareeq_official_logo.png',
          width: 1200,
          height: 630,
          alt: 'BAREEQ',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: brandTitle,
      description,
      images: ['/images/bareeq_official_logo.png'],
    },
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
