import { describe, expect, it } from 'vitest';
import {
  detectMaterialUnitMeta,
  convertToDatabaseQuantity,
  resolveDisplayQuantityFromDatabase,
  formatMaterialQuantityWithUnit,
} from '@/lib/inventory/units';
import {
  catalogMaterialRequirementSchema,
  catalogMaterialRequirementsSchema,
} from '@/lib/validations/catalog-materials';

describe('Material Unit Conversion & Formatting Engine', () => {
  describe('detectMaterialUnitMeta', () => {
    it('detects liquids / volume units accurately', () => {
      const meta1 = detectMaterialUnitMeta('لتر');
      expect(meta1.category).toBe('VOLUME');
      expect(meta1.baseUnit).toBe('لتر');
      expect(meta1.options).toHaveLength(2);
      expect(meta1.options.map((o) => o.value)).toEqual(['ml', 'l']);

      const meta2 = detectMaterialUnitMeta('مل');
      expect(meta2.category).toBe('VOLUME');

      const meta3 = detectMaterialUnitMeta('Liter');
      expect(meta3.category).toBe('VOLUME');
    });

    it('detects weights / mass units accurately', () => {
      const meta1 = detectMaterialUnitMeta('كيلوجرام');
      expect(meta1.category).toBe('WEIGHT');
      expect(meta1.baseUnit).toBe('كجم');
      expect(meta1.options).toHaveLength(2);
      expect(meta1.options.map((o) => o.value)).toEqual(['g', 'kg']);

      const meta2 = detectMaterialUnitMeta('كجم');
      expect(meta2.category).toBe('WEIGHT');

      const meta3 = detectMaterialUnitMeta('جرام');
      expect(meta3.category).toBe('WEIGHT');

      const meta4 = detectMaterialUnitMeta('kg');
      expect(meta4.category).toBe('WEIGHT');
    });

    it('detects discrete items / count units accurately', () => {
      const meta1 = detectMaterialUnitMeta('قطعة');
      expect(meta1.category).toBe('COUNT');
      expect(meta1.baseUnit).toBe('قطعة');
      expect(meta1.options).toHaveLength(1);
      expect(meta1.options[0].value).toBe('item');

      const meta2 = detectMaterialUnitMeta('فوطة مايكروفايبر');
      expect(meta2.category).toBe('COUNT');
      expect(meta2.baseUnit).toBe('فوطة مايكروفايبر');
    });
  });

  describe('convertToDatabaseQuantity', () => {
    it('converts milliliters to liters with high precision', () => {
      expect(convertToDatabaseQuantity(250, 'ml', 'لتر')).toBe(0.25);
      expect(convertToDatabaseQuantity(500, 'ml', 'لتر')).toBe(0.5);
      expect(convertToDatabaseQuantity(1000, 'ml', 'لتر')).toBe(1);
      expect(convertToDatabaseQuantity(1.5, 'l', 'لتر')).toBe(1.5);
    });

    it('converts grams to kilograms with high precision', () => {
      expect(convertToDatabaseQuantity(50, 'g', 'كجم')).toBe(0.05);
      expect(convertToDatabaseQuantity(250, 'g', 'كجم')).toBe(0.25);
      expect(convertToDatabaseQuantity(1000, 'g', 'كجم')).toBe(1);
      expect(convertToDatabaseQuantity(2, 'kg', 'كجم')).toBe(2);
    });

    it('converts discrete count units 1:1', () => {
      expect(convertToDatabaseQuantity(3, 'item', 'قطعة')).toBe(3);
    });
  });

  describe('resolveDisplayQuantityFromDatabase', () => {
    it('resolves fractional liters to milliliters for human editing', () => {
      const resolved = resolveDisplayQuantityFromDatabase(0.25, 'لتر');
      expect(resolved.subUnit).toBe('ml');
      expect(resolved.displayValue).toBe(250);

      const resolvedWhole = resolveDisplayQuantityFromDatabase(2, 'لتر');
      expect(resolvedWhole.subUnit).toBe('l');
      expect(resolvedWhole.displayValue).toBe(2);
    });

    it('resolves fractional kilograms to grams for human editing', () => {
      const resolved = resolveDisplayQuantityFromDatabase(0.05, 'كجم');
      expect(resolved.subUnit).toBe('g');
      expect(resolved.displayValue).toBe(50);

      const resolvedWhole = resolveDisplayQuantityFromDatabase(3, 'كجم');
      expect(resolvedWhole.subUnit).toBe('kg');
      expect(resolvedWhole.displayValue).toBe(3);
    });

    it('resolves discrete items as-is', () => {
      const resolved = resolveDisplayQuantityFromDatabase(2, 'قطعة');
      expect(resolved.subUnit).toBe('item');
      expect(resolved.displayValue).toBe(2);
    });
  });

  describe('formatMaterialQuantityWithUnit', () => {
    it('formats liquid consumption with friendly milliliters description', () => {
      const formatted = formatMaterialQuantityWithUnit(0.25, 'لتر');
      expect(formatted.primary).toBe('250 مل');
      expect(formatted.fullDescription).toBe('250 ملليلتر (0.25 لتر)');

      const formattedWhole = formatMaterialQuantityWithUnit(2, 'لتر');
      expect(formattedWhole.primary).toBe('2 لتر');
      expect(formattedWhole.fullDescription).toBe('2 لتر');
    });

    it('formats weight consumption with friendly grams description', () => {
      const formatted = formatMaterialQuantityWithUnit(0.05, 'كجم');
      expect(formatted.primary).toBe('50 جم');
      expect(formatted.fullDescription).toBe('50 جرام (0.05 كجم)');
    });

    it('formats discrete count items', () => {
      const formatted = formatMaterialQuantityWithUnit(2, 'قطعة');
      expect(formatted.primary).toBe('2 قطعة');
      expect(formatted.fullDescription).toBe('2 قطعة');
    });
  });

  describe('Zod Validation with Decimal Quantities', () => {
    const validId = 'clh0000000000000000000001';

    it('accepts fractional positive decimal quantities for liters and kg', () => {
      const requirement = {
        materialId: validId,
        quantity: 0.25,
        required: true,
        notes: '250 مل صابون سائل',
      };

      const result = catalogMaterialRequirementSchema.safeParse(requirement);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe(0.25);
      }
    });

    it('accepts list of requirements with fractional quantities', () => {
      const requirements = [
        {
          materialId: 'clh0000000000000000000001',
          quantity: 0.25,
          required: true,
          notes: 'صابون مركز',
        },
        {
          materialId: 'clh0000000000000000000002',
          quantity: 0.05,
          required: false,
          notes: 'شمع ملمع',
        },
        {
          materialId: 'clh0000000000000000000003',
          quantity: 2,
          required: true,
          notes: 'فوط مايكروفايبر',
        },
      ];

      const result = catalogMaterialRequirementsSchema.safeParse(requirements);
      expect(result.success).toBe(true);
    });

    it('rejects zero or negative quantities', () => {
      const zeroReq = {
        materialId: validId,
        quantity: 0,
        required: true,
      };
      expect(catalogMaterialRequirementSchema.safeParse(zeroReq).success).toBe(false);

      const negReq = {
        materialId: validId,
        quantity: -0.5,
        required: true,
      };
      expect(catalogMaterialRequirementSchema.safeParse(negReq).success).toBe(false);
    });
  });
});
