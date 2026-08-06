import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'إنشاء حساب',
  description: 'أنشئ حساب بريق لحجز خدمات العناية المتنقلة ومتابعتها.',
  alternates: { canonical: '/register' },
  robots: { index: false, follow: false },
};

export default function RegisterLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
