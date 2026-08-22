import { z } from 'zod';
import { databaseIdSchema } from '@/lib/validations/database-id';

export type CatalogMaterialRequirementsPayload =
  | { success: true; data: unknown[] }
  | { success: false; error: string };

/**
 * Material requirements are a replacement set: a deliberate empty array clears
 * the set, but a missing or corrupt form field must never be treated as one.
 */
export function parseCatalogMaterialRequirementsPayload(value: unknown): CatalogMaterialRequirementsPayload {
  if (typeof value !== 'string') {
    return { success: false, error: 'بيانات مواد الخدمة مطلوبة. أعد تحميل الصفحة ثم حاول مرة أخرى.' };
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return { success: false, error: 'بيانات مواد الخدمة غير صالحة. أعد تحميل الصفحة ثم حاول مرة أخرى.' };
    }
    return { success: true, data: parsed };
  } catch {
    return { success: false, error: 'بيانات مواد الخدمة غير صالحة. أعد تحميل الصفحة ثم حاول مرة أخرى.' };
  }
}

/**
 * A deactivated material may remain on a service that already required it, so
 * historical configuration can be edited safely. It may never be newly added.
 */
export function canUseServiceMaterialRequirement(
  material: { id: string; active: boolean },
  existingMaterialIds: ReadonlySet<string>,
) {
  return material.active || existingMaterialIds.has(material.id);
}

/**
 * The material configuration is intentionally independent from a database row
 * identifier. Product editing replaces the current service configuration as a
 * single, validated set rather than exposing stale requirement IDs to the UI.
 */
export const catalogMaterialRequirementSchema = z.object({
  materialId: databaseIdSchema,
  quantity: z.coerce.number()
    .positive('الكمية المطلوبة يجب أن تكون أكبر من صفر.')
    .max(1_000_000, 'الكمية المطلوبة أكبر من الحد المسموح.'),
  required: z.boolean(),
  notes: z.string().trim().max(1_000, 'ملاحظات المادة أطول من الحد المسموح.').nullable().optional(),
});

export const catalogMaterialRequirementsSchema = z
  .array(catalogMaterialRequirementSchema)
  .max(200, 'لا يمكن ربط أكثر من 200 مادة بالخدمة.')
  .superRefine((requirements, context) => {
    const materialIds = new Set<string>();

    for (const [index, requirement] of requirements.entries()) {
      if (materialIds.has(requirement.materialId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'materialId'],
          message: 'لا يمكن إضافة المادة نفسها أكثر من مرة للخدمة.',
        });
      }
      materialIds.add(requirement.materialId);
    }
  });

export type CatalogMaterialRequirementInput = z.infer<typeof catalogMaterialRequirementSchema>;
