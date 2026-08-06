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
export const siteName = 'بريق | Bareeq';

interface PublicMetadataOptions {
  title: string;
  description: string;
  path: string;
}

export function createPublicMetadata({
  title,
  description,
  path,
}: PublicMetadataOptions): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      url: path,
      siteName,
      locale: 'ar_EG',
      type: 'website',
      images: [
        {
          url: '/logo.svg',
          width: 600,
          height: 600,
          alt: 'شعار بريق للعناية المتنقلة بالسيارات',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/logo.svg'],
    },
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
