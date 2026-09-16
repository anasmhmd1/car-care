import type { Metadata, Viewport } from 'next';
import { Alexandria, Tajawal } from 'next/font/google';
import { serializeJsonLd, siteUrl } from '@/lib/seo';
import FloatingContactWidget from '@/components/FloatingContactWidget';
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

const description = 'CAR CARE Premium Mobile Auto Care — official website.';

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: 'كار كير | CAR CARE',
  title: {
    default: 'كار كير | CAR CARE',
    template: '%s | كار كير CAR CARE',
  },
  description,
  keywords: ['غسيل سيارات متنقل', 'غسيل جاف', 'تفصيل سيارات', 'كار كير', 'Car Care', 'عناية بالسيارات', 'تلميع سيارات'],
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  openGraph: {
    title: 'CAR CARE',
    description,
    url: '/',
    siteName: 'CAR CARE',
    images: [
      {
        url: '/images/car_care_official_logo.png',
        width: 1200,
        height: 630,
        alt: 'CAR CARE',
      },
    ],
    locale: 'ar_EG',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CAR CARE',
    description,
    images: ['/images/car_care_official_logo.png'],
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
  name: 'كار كير للعناية المتنقلة بالسيارات',
  alternateName: 'Car Care Mobile Auto Care',
  url: siteUrl.origin,
  logo: new URL('/logo.svg', siteUrl).toString(),
  image: new URL('/logo.svg', siteUrl).toString(),
  priceRange: '$$',
  areaServed: { '@type': 'AdministrativeArea', name: 'مناطق التغطية والخدمة' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} ${alexandria.variable}`}>
      <body className="antialiased min-h-screen bg-[#080808] text-white flex flex-col font-sans relative">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(localBusinessJsonLd) }}
        />
        {children}
        <FloatingContactWidget />
      </body>
    </html>
  );
}
