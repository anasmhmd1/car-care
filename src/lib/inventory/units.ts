export type MaterialUnitCategory = 'VOLUME' | 'WEIGHT' | 'COUNT';

export interface MaterialSubUnitOption {
  value: string;
  labelAr: string;
  shortLabelAr: string;
  factorToBase: number; // e.g. 1 ml = 0.001 Liter, 1 gram = 0.001 Kg
  step: string;
  placeholder: string;
}

export interface MaterialUnitMeta {
  category: MaterialUnitCategory;
  baseUnit: string;
  options: MaterialSubUnitOption[];
  defaultSubUnit: string;
}

/**
 * Normalizes an Arabic or English unit string to identify whether it's
 * a liquid volume (L / ml), mass/weight (kg / g), or count/items.
 */
export function detectMaterialUnitMeta(rawUnit: string): MaterialUnitMeta {
  const norm = (rawUnit || '').trim().toLowerCase();

  // 1. Liquids & Volumes (لتر، ملليلتر، مل، L، ml، لترات)
  if (
    norm.includes('لتر') ||
    norm.includes('liter') ||
    norm.includes('litre') ||
    norm === 'l' ||
    norm === 'مل' ||
    norm === 'ml' ||
    norm.includes('ملل')
  ) {
    return {
      category: 'VOLUME',
      baseUnit: 'لتر',
      defaultSubUnit: 'ml',
      options: [
        {
          value: 'ml',
          labelAr: 'ملليلتر (مل)',
          shortLabelAr: 'مل',
          factorToBase: 0.001,
          step: '1',
          placeholder: 'مثال: 250',
        },
        {
          value: 'l',
          labelAr: 'لتر (L)',
          shortLabelAr: 'لتر',
          factorToBase: 1,
          step: '0.05',
          placeholder: 'مثال: 0.25',
        },
      ],
    };
  }

  // 2. Mass & Weights (كيلوجرام، كجم، كيلو، جرام، جم، kg، g)
  if (
    norm.includes('كيلو') ||
    norm.includes('كجم') ||
    norm.includes('kg') ||
    norm.includes('جرام') ||
    norm.includes('جم') ||
    norm === 'g' ||
    norm.includes('gram')
  ) {
    return {
      category: 'WEIGHT',
      baseUnit: 'كجم',
      defaultSubUnit: 'g',
      options: [
        {
          value: 'g',
          labelAr: 'جرام (جم)',
          shortLabelAr: 'جم',
          factorToBase: 0.001,
          step: '1',
          placeholder: 'مثال: 50',
        },
        {
          value: 'kg',
          labelAr: 'كيلوجرام (كجم)',
          shortLabelAr: 'كجم',
          factorToBase: 1,
          step: '0.05',
          placeholder: 'مثال: 0.05',
        },
      ],
    };
  }

  // 3. Discrete Count / Items (قطعة، عبوة، علبة، فوطة، حبة، بخاخ...)
  const fallbackUnit = (rawUnit || 'قطعة').trim();
  return {
    category: 'COUNT',
    baseUnit: fallbackUnit,
    defaultSubUnit: 'item',
    options: [
      {
        value: 'item',
        labelAr: fallbackUnit,
        shortLabelAr: fallbackUnit,
        factorToBase: 1,
        step: '1',
        placeholder: 'مثال: 1',
      },
    ],
  };
}

/**
 * Converts a sub-unit input quantity to the base unit quantity stored in the database.
 * Example: 250 with 'ml' (factor 0.001) -> 0.25 (liters)
 */
export function convertToDatabaseQuantity(
  inputValue: number,
  subUnitValue: string,
  rawUnit: string,
): number {
  if (!Number.isFinite(inputValue) || inputValue <= 0) return 0;
  const meta = detectMaterialUnitMeta(rawUnit);
  const option = meta.options.find((opt) => opt.value === subUnitValue) ?? meta.options[0];
  const calculated = inputValue * option.factorToBase;
  // Round to 6 decimal places to prevent floating point inaccuracies (e.g. 0.05000000000000001)
  return Math.round(calculated * 1_000_000) / 1_000_000;
}

/**
 * Resolves the best initial sub-unit and display value for an existing base database quantity.
 * Example: base 0.25 with baseUnit 'لتر' -> { subUnit: 'ml', displayValue: 250 }
 */
export function resolveDisplayQuantityFromDatabase(
  databaseQty: number,
  rawUnit: string,
): { subUnit: string; displayValue: number } {
  const meta = detectMaterialUnitMeta(rawUnit);
  if (!Number.isFinite(databaseQty) || databaseQty <= 0) {
    return { subUnit: meta.defaultSubUnit, displayValue: 1 };
  }

  if (meta.category === 'VOLUME') {
    // If it's less than 1 liter or has fractional milliliters, display as ml
    if (databaseQty < 1 || Number.isInteger(databaseQty * 1000) && databaseQty * 1000 % 1000 !== 0) {
      return {
        subUnit: 'ml',
        displayValue: Math.round(databaseQty * 1000 * 1000) / 1000,
      };
    }
    return { subUnit: 'l', displayValue: databaseQty };
  }

  if (meta.category === 'WEIGHT') {
    // If it's less than 1 kg, display as grams
    if (databaseQty < 1 || Number.isInteger(databaseQty * 1000) && databaseQty * 1000 % 1000 !== 0) {
      return {
        subUnit: 'g',
        displayValue: Math.round(databaseQty * 1000 * 1000) / 1000,
      };
    }
    return { subUnit: 'kg', displayValue: databaseQty };
  }

  return { subUnit: 'item', displayValue: databaseQty };
}

/**
 * Formats a material quantity for display across staff checklist, technicians, and audit logs.
 * Example: 0.25 L -> "250 مل (0.25 لتر)"
 * Example: 2 L -> "2 لتر"
 * Example: 0.05 kg -> "50 جم (0.05 كجم)"
 * Example: 1 قطعه -> "1 قطعة"
 */
export function formatMaterialQuantityWithUnit(
  baseQty: number,
  rawUnit: string,
): {
  primary: string;
  secondary?: string;
  fullDescription: string;
} {
  const meta = detectMaterialUnitMeta(rawUnit);
  const qty = Number(baseQty) || 0;

  if (meta.category === 'VOLUME') {
    if (qty < 1 && qty > 0) {
      const ml = Math.round(qty * 1000 * 100) / 100;
      return {
        primary: `${ml} مل`,
        secondary: `${qty} لتر`,
        fullDescription: `${ml} ملليلتر (${qty} لتر)`,
      };
    }
    return {
      primary: `${qty} لتر`,
      secondary: qty > 0 ? `${Math.round(qty * 1000)} مل` : undefined,
      fullDescription: `${qty} لتر`,
    };
  }

  if (meta.category === 'WEIGHT') {
    if (qty < 1 && qty > 0) {
      const grams = Math.round(qty * 1000 * 100) / 100;
      return {
        primary: `${grams} جم`,
        secondary: `${qty} كجم`,
        fullDescription: `${grams} جرام (${qty} كجم)`,
      };
    }
    return {
      primary: `${qty} كجم`,
      secondary: qty > 0 ? `${Math.round(qty * 1000)} جم` : undefined,
      fullDescription: `${qty} كجم`,
    };
  }

  return {
    primary: `${qty} ${meta.baseUnit}`,
    fullDescription: `${qty} ${meta.baseUnit}`,
  };
}
