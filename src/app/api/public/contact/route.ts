import { NextResponse } from 'next/server';
import { getPublicBranchContact } from '@/lib/public-contact';
import { getPublicSocialLinks } from '@/lib/social-links';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [branch, socialLinks] = await Promise.all([
      getPublicBranchContact(),
      getPublicSocialLinks(),
    ]);

    return NextResponse.json({
      phone: branch?.phone ?? null,
      whatsapp: branch?.whatsapp ?? null,
      socialLinks,
    });
  } catch (error) {
    console.error('Failed to fetch public branch contact:', error);
    return NextResponse.json({ phone: null, whatsapp: null, socialLinks: null }, { status: 500 });
  }
}
