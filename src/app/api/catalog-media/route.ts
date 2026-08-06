import { UserRole } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { deleteUploadedFile, processUpload } from '@/lib/upload';

export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || !actor.active || actor.deletedAt) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول.' }, { status: 401 });
  }
  if (actor.role !== UserRole.OWNER && actor.role !== UserRole.SYSTEM_SUPER_ADMIN) {
    return NextResponse.json({ error: 'غير مصرح برفع صور الكتالوج.' }, { status: 403 });
  }
  const rateLimit = await checkRateLimit(actor.id, 'catalog-media-upload');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'تم تجاوز عدد مرات الرفع. حاول بعد قليل.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.resetIn) } },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'اختر صورة صالحة.' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'الكتالوج يقبل صور JPG وPNG وWEBP فقط.' }, { status: 400 });
    }
    const uploaded = await processUpload(file, 'catalog-media');
    if ('error' in uploaded) {
      return NextResponse.json({ error: uploaded.error, code: uploaded.code }, { status: 400 });
    }
    const publicUrl = `/api/catalog-media/${uploaded.fileName}`;
    try {
      await db.auditLog.create({
        data: {
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'CATALOG_MEDIA_UPLOADED',
          entityType: 'CatalogMedia',
          entityId: uploaded.fileId,
          afterJson: { publicUrl, mimeType: uploaded.mimeType, sizeBytes: uploaded.sizeBytes },
        },
      });
    } catch (error) {
      await deleteUploadedFile('catalog-media', uploaded.fileName);
      throw error;
    }
    return NextResponse.json({
      success: true,
      url: publicUrl,
      mimeType: uploaded.mimeType,
      sizeBytes: uploaded.sizeBytes,
    });
  } catch (error) {
    console.error('Catalog media upload failed:', error);
    return NextResponse.json({ error: 'تعذر رفع صورة الكتالوج.' }, { status: 500 });
  }
}
