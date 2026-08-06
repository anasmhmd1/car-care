import { UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { readUploadedFile } from '@/lib/upload';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileName: string }> },
) {
  const { fileName } = await params;
  if (!/^[a-zA-Z0-9_.-]+$/.test(fileName)) {
    return NextResponse.json({ error: 'مسار الصورة غير صالح.' }, { status: 400 });
  }
  const exactUrl = `/api/catalog-media/${fileName}`;
  const services = await db.service.findMany({
    where: { active: true },
    select: { coverImage: true, galleryImages: true },
  });
  const referenced = services.some((service) =>
    service.coverImage === exactUrl ||
    (isStringArray(service.galleryImages) && service.galleryImages.includes(exactUrl)),
  );
  if (!referenced) {
    const actor = await getCurrentUser();
    if (!actor || (actor.role !== UserRole.OWNER && actor.role !== UserRole.SYSTEM_SUPER_ADMIN)) {
      return NextResponse.json({ error: 'الصورة غير موجودة.' }, { status: 404 });
    }
  }

  const file = await readUploadedFile('catalog-media', fileName);
  if (!file || !file.mimeType.startsWith('image/')) {
    return NextResponse.json({ error: 'الصورة غير موجودة.' }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.buffer.length),
      'Cache-Control': referenced ? 'public, max-age=31536000, immutable' : 'private, no-store',
      'Content-Disposition': `inline; filename="${fileName}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
