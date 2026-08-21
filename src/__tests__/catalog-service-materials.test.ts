import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogMaterialRequirementsSchema } from '@/lib/validations/catalog-materials';

const SHAMPOO_ID = '11111111-1111-4111-8111-111111111111';
const CLOTH_ID = '22222222-2222-4222-8222-222222222222';

describe('catalog service material requirements', () => {
  it('keeps an existing service-material configuration intact across a form round-trip', () => {
    const existingRequirements = [
      { materialId: SHAMPOO_ID, quantity: 2, required: true, notes: 'استخدم العبوة المخصصة للسيارات الداكنة.' },
      { materialId: CLOTH_ID, quantity: 4, required: false, notes: null },
    ];

    const parsed = catalogMaterialRequirementsSchema.parse(JSON.parse(JSON.stringify(existingRequirements)));

    expect(parsed).toEqual(existingRequirements);
  });

  it('coerces valid quantities and rejects duplicate, zero, or malformed material requirements', () => {
    expect(catalogMaterialRequirementsSchema.parse([
      { materialId: SHAMPOO_ID, quantity: '3', required: true, notes: '  اختبار  ' },
    ])).toEqual([
      { materialId: SHAMPOO_ID, quantity: 3, required: true, notes: 'اختبار' },
    ]);

    for (const invalidRequirements of [
      [
        { materialId: SHAMPOO_ID, quantity: 1, required: true },
        { materialId: SHAMPOO_ID, quantity: 2, required: false },
      ],
      [{ materialId: SHAMPOO_ID, quantity: 0, required: true }],
      [{ materialId: '../../not-a-material', quantity: 1, required: true }],
    ]) {
      expect(catalogMaterialRequirementsSchema.safeParse(invalidRequirements).success).toBe(false);
    }
  });

  it('saves requirements through the same product transaction and sends them from ProductEditor', () => {
    const catalogAction = readFileSync(resolve(process.cwd(), 'src/app/actions/catalog.ts'), 'utf8');
    const catalogEditor = readFileSync(resolve(process.cwd(), 'src/app/admin/site/ServicesManager.tsx'), 'utf8');

    expect(catalogAction).toContain('parseCatalogMaterialRequirementsPayload(');
    expect(catalogAction).toContain("formData.get('materialRequirements')");
    expect(catalogAction).toContain('materialRequirements: materialRequirementsPayload.data');
    expect(catalogAction).toContain('tx.serviceMaterialRequirement.deleteMany({ where: { serviceId: service.id } })');
    expect(catalogAction).toContain('tx.serviceMaterialRequirement.createMany({');
    expect(catalogEditor).toContain("data.set('materialRequirements', JSON.stringify(materialRequirements))");
    expect(catalogEditor).toContain('مواد ومستلزمات التنفيذ');
  });
});
