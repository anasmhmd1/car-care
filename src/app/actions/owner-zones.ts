'use server';

import { revalidatePath } from 'next/cache';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';

interface CompoundInput {
  id?: string;
  compound: string;
  district?: string;
}

export async function saveZoneWithAreasAction(data: {
  zoneId?: string;
  branchId: string;
  name: string;
  description?: string;
  compounds: CompoundInput[];
}) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  const name = (data.name || '').trim();
  const description = (data.description || '').trim();

  if (!name) {
    return { error: 'اسم النطاق / الزون مطلوب.' };
  }
  if (!data.branchId) {
    return { error: 'معرف الفرع مطلوب.' };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      let zoneId = data.zoneId;

      if (zoneId) {
        // Update existing zone
        await tx.coverageZone.update({
          where: { id: zoneId },
          data: {
            name,
            description: description || null,
          },
        });
      } else {
        // Create new zone
        const newZone = await tx.coverageZone.create({
          data: {
            branchId: data.branchId,
            name,
            description: description || null,
          },
        });
        zoneId = newZone.id;
      }

      // Existing areas for this zone
      const existingAreas = await tx.coverageArea.findMany({
        where: { zoneId },
        select: { id: true, compound: true },
      });
      const existingAreaIds = new Set(existingAreas.map((a) => a.id));

      const submittedAreaIds = new Set<string>();

      // Upsert / create submitted compounds
      for (let i = 0; i < data.compounds.length; i++) {
        const item = data.compounds[i];
        const compoundName = (item.compound || '').trim();
        if (!compoundName) continue;

        if (item.id && existingAreaIds.has(item.id)) {
          submittedAreaIds.add(item.id);
          await tx.coverageArea.update({
            where: { id: item.id },
            data: {
              compound: compoundName,
              district: item.district || compoundName,
              city: name,
              governorate: 'الجيزة',
              priority: i + 1,
              active: true,
            },
          });
        } else {
          const newArea = await tx.coverageArea.create({
            data: {
              zoneId,
              compound: compoundName,
              district: item.district || compoundName,
              city: name,
              governorate: 'الجيزة',
              priority: i + 1,
              active: true,
            },
          });
          submittedAreaIds.add(newArea.id);
        }
      }

      // Delete areas that were removed (unless they have bookings, in which case deactivate them)
      for (const existing of existingAreas) {
        if (!submittedAreaIds.has(existing.id)) {
          const bookingCount = await tx.booking.count({ where: { coverageAreaId: existing.id } });
          if (bookingCount > 0) {
            await tx.coverageArea.update({
              where: { id: existing.id },
              data: { active: false },
            });
          } else {
            await tx.coverageArea.delete({ where: { id: existing.id } });
          }
        }
      }

      return { zoneId };
    });

    await logAudit({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: data.zoneId ? 'UPDATE_COVERAGE_ZONE' : 'CREATE_COVERAGE_ZONE',
      entityType: 'CoverageZone',
      entityId: result.zoneId,
      afterJson: { name, description, compoundsCount: data.compounds.length },
    });

    revalidatePath('/admin');
    revalidatePath('/admin/site');
    revalidatePath('/areas');
    revalidatePath('/services');

    return { success: true, message: `تم حفظ بيانات نطاق التغطية "${name}" والكمبوندات التابعة له بنجاح!` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'تعذر حفظ بيانات النطاق.' };
  }
}

export async function deleteZoneAction(zoneId: string) {
  const actor = await requireRole([UserRole.OWNER, UserRole.SYSTEM_SUPER_ADMIN]);
  if (!zoneId) return { error: 'معرف الزون مطلوب.' };

  try {
    const zone = await db.coverageZone.findUnique({
      where: { id: zoneId },
      include: {
        areas: {
          include: {
            _count: { select: { bookings: true } },
          },
        },
      },
    });

    if (!zone) return { error: 'نطاق التغطية غير موجود.' };

    const hasBookings = zone.areas.some((a) => a._count.bookings > 0);
    if (hasBookings) {
      return { error: 'لا يمكن حذف نطاق يحتوي على حجوزات مسجلة مسبقاً.' };
    }

    await db.$transaction(async (tx) => {
      await tx.coverageArea.deleteMany({ where: { zoneId } });
      await tx.teamZone.deleteMany({ where: { zoneId } });
      await tx.zoneTravelTime.deleteMany({
        where: { OR: [{ fromZoneId: zoneId }, { toZoneId: zoneId }] },
      });
      await tx.coverageZone.delete({ where: { id: zoneId } });
    });

    await logAudit({
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'DELETE_COVERAGE_ZONE',
      entityType: 'CoverageZone',
      entityId: zoneId,
      beforeJson: { name: zone.name },
    });

    revalidatePath('/admin');
    revalidatePath('/admin/site');
    revalidatePath('/areas');
    return { success: true, message: 'تم حذف الزون بنجاح.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'تعذر حذف الزون.' };
  }
}
