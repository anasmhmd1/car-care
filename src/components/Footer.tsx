import Link from 'next/link';
import BareeqLogo from '@/components/BareeqLogo';
import { getPublicSocialLinks, type SocialLinks } from '@/lib/social-links';

interface FooterProps {
  initialSocialLinks?: SocialLinks;
}

export default async function Footer({ initialSocialLinks }: FooterProps = {}) {
  const socialLinks = initialSocialLinks ?? (await getPublicSocialLinks());

  const facebookUrl = socialLinks.facebook?.trim();
  const tiktokUrl = socialLinks.tiktok?.trim();
  const instagramUrl = socialLinks.instagram?.trim();

  return (
    <footer className="bg-[#050505] border-t border-neutral-900 pt-16 pb-12 text-neutral-400 text-sm font-sans" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Main Footer Row: Brand on one side, Social icons & Pill buttons on the other */}
        <div className="flex flex-col lg:flex-row justify-between items-center gap-8 mb-14 text-center lg:text-start">
          
          {/* Brand Logo & Tagline */}
          <div className="space-y-3.5 max-w-xl flex flex-col items-center lg:items-start mx-auto lg:mx-0">
            <Link href="/" aria-label="كار كير — الصفحة الرئيسية" className="inline-block">
              <BareeqLogo size="lg" />
            </Link>
            <p className="text-neutral-400 leading-relaxed text-xs sm:text-sm font-medium space-y-1 text-center lg:text-start">
              <span className="block">كار كير — براند عناية متنقلة فاخرة بالسيارات</span>
              <span className="block">يصلك في المنزل أو العمل بأحدث المعدات</span>
              <span className="block">وبأفضل مواد العناية المخصصة لكل جزء.</span>
            </p>
          </div>

          {/* Right Side: Social Media Icons + Policy Pills */}
          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-end gap-6 shrink-0 mx-auto lg:mx-0">
            
            {/* Social Media Links */}
            <div className="flex items-center gap-3" aria-label="روابط التواصل الاجتماعي">
              {/* Facebook */}
              {facebookUrl ? (
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="صفحة بريق على فيسبوك"
                  title="فيسبوك - Facebook"
                  className="w-11 h-11 rounded-2xl border border-neutral-800/90 bg-[#101010] hover:bg-[#18150f] hover:border-[#cea355]/60 text-neutral-400 hover:text-[#edce8b] flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg hover:shadow-[#cea355]/10 active:scale-95 group"
                >
                  <svg
                    className="w-5 h-5 fill-current transition-transform duration-200 group-hover:scale-110"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
              ) : null}

              {/* TikTok */}
              {tiktokUrl ? (
                <a
                  href={tiktokUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="حساب بريق على تيك توك"
                  title="تيك توك - TikTok"
                  className="w-11 h-11 rounded-2xl border border-neutral-800/90 bg-[#101010] hover:bg-[#18150f] hover:border-[#cea355]/60 text-neutral-400 hover:text-[#edce8b] flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg hover:shadow-[#cea355]/10 active:scale-95 group"
                >
                  <svg
                    className="w-5 h-5 fill-current transition-transform duration-200 group-hover:scale-110"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                  </svg>
                </a>
              ) : null}

              {/* Instagram */}
              {instagramUrl ? (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="حساب بريق على انستجرام"
                  title="انستجرام - Instagram"
                  className="w-11 h-11 rounded-2xl border border-neutral-800/90 bg-[#101010] hover:bg-[#18150f] hover:border-[#cea355]/60 text-neutral-400 hover:text-[#edce8b] flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg hover:shadow-[#cea355]/10 active:scale-95 group"
                >
                  <svg
                    className="w-5 h-5 fill-current transition-transform duration-200 group-hover:scale-110"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>
              ) : null}
            </div>

            {/* Digitalio-Style Pill Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3.5">
              <Link
                href="/policies/terms"
                className="inline-flex items-center justify-center px-6 py-3 rounded-2xl border border-neutral-800 bg-[#101010] hover:bg-[#161616] hover:border-[#cea355]/50 text-xs font-bold text-neutral-300 hover:text-[#edce8b] transition-all shadow-lg active:scale-95"
              >
                شروط الاستخدام
              </Link>
              <Link
                href="/policies/privacy"
                className="inline-flex items-center justify-center px-6 py-3 rounded-2xl border border-neutral-800 bg-[#101010] hover:bg-[#161616] hover:border-[#cea355]/50 text-xs font-bold text-neutral-300 hover:text-[#edce8b] transition-all shadow-lg active:scale-95"
              >
                سياسة الخصوصية
              </Link>
            </div>

          </div>

        </div>

        {/* Bottom Copyright Bar */}
        <div className="border-t border-neutral-900/90 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-neutral-500 gap-4 text-center sm:text-start">
          <p>© {new Date().getFullYear()} CAR CARE (CAR CARE MOBILE AUTO CARE). ALL RIGHTS RESERVED.</p>
          <p className="flex items-center justify-center gap-2">
            <span>نظام تشغيل خاص ببراند كار كير</span>
            <span className="text-[#cea355]">•</span>
            <span translate="no">Premium Luxury Detailing</span>
          </p>
        </div>

      </div>
    </footer>
  );
}
