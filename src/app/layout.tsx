import type { Metadata, Viewport } from 'next';
import { Alexandria, Tajawal } from 'next/font/google';
import { serializeJsonLd, siteUrl } from '@/lib/seo';
import './globals.css';

const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['300', '400', '500', '700', '800', '900'],
  variable: '--font-arabic',
});

const alexandria = Alexandria({
  subsets: ['arabic'],
  weight: ['600', '700', '800', '900'],
  variable: '--font-display',
});

const description =
  'خدمة عناية وتفصيل متنقلة بالسيارات في الشيخ زايد والمناطق المحيطة، مع حجز منظم وصور توثيقية قبل التنفيذ وبعده.';

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: 'بريق',
  title: {
    default: 'بريق | عناية متنقلة بالسيارات',
    template: '%s | بريق',
  },
  description,
  keywords: ['غسيل سيارات متنقل', 'الشيخ زايد', 'تفصيل سيارات', 'بريق', 'Bareeq', 'عناية بالسيارات', 'سوديك', 'بيفرلي هيلز'],
  icons: {
    icon: '/logo.svg',
    shortcut: '/logo.svg',
    apple: '/logo.svg',
  },
  openGraph: {
    title: 'بريق | عناية متنقلة بالسيارات',
    description,
    url: '/',
    siteName: 'بريق Bareeq',
    images: [
      {
        url: '/logo.svg',
        width: 600,
        height: 600,
        alt: 'شعار بريق للعناية المتنقلة بالسيارات',
      },
    ],
    locale: 'ar_EG',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'بريق | عناية متنقلة بالسيارات',
    description,
    images: ['/logo.svg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark',
  themeColor: '#080808',
};

const localBusinessJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': `${siteUrl.origin}/#business`,
  name: 'بريق للعناية المتنقلة بالسيارات',
  alternateName: 'Bareeq Mobile Car Care',
  url: siteUrl.origin,
  logo: new URL('/logo.svg', siteUrl).toString(),
  image: new URL('/logo.svg', siteUrl).toString(),
  priceRange: '$$',
  areaServed: [
    { '@type': 'City', name: 'الشيخ زايد' },
    { '@type': 'Place', name: 'سوديك والمناطق المحيطة' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${alexandria.variable}`}>
      <body className="antialiased min-h-screen bg-[#080808] text-white flex flex-col font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(localBusinessJsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
