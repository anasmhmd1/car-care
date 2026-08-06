import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canUseServiceMaterialRequirement,
  parseCatalogMaterialRequirementsPayload,
} from '@/lib/validations/catalog-materials';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('@/lib/auth/session', () => ({
  requireRole: mocks.requireRole,
}));

vi.mock('@/lib/db', () => ({
  db: {
    $transaction: mocks.transaction,
  },
}));

import { saveServiceProductAction } from '@/app/actions/catalog';
import { saveServiceMaterialRequirementAction } from '@/app/actions/operations-resources';

const SERVICE_ID = '11111111-1111-4111-8111-111111111111';
const ACTIVE_MATERIAL_ID = '22222222-2222-4222-8222-222222222222';
const INACTIVE_MATERIAL_ID = '33333333-3333-4333-8333-333333333333';
const REQUIREMENT_ID = '44444444-4444-4444-8444-444444444444';

function serviceMaterialRequirementForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set('serviceId', SERVICE_ID);
  formData.set('materialId', ACTIVE_MATERIAL_ID);
  formData.set('quantity', '2');
  formData.set('required', 'true');
  for (const [key, value] of Object.entries(overrides)) formData.set(key, value);
  return formData;
}

function transactionWithMaterial({
  before = null,
  material = { id: ACTIVE_MATERIAL_ID, active: true },
}: {
  before?: {
    id: string;
    serviceId: string;
    materialId: string;
    quantity: number;
    required: boolean;
    notes: string | null;
  } | null;
  material?: { id: string; active: boolean };
}) {
  return {
    serviceMaterialRequirement: {
      findUnique: vi.fn().mockResolvedValue(before),
      create: vi.fn().mockResolvedValue({ id: REQUIREMENT_ID, serviceId: SERVICE_ID }),
      update: vi.fn().mockResolvedValue({ id: REQUIREMENT_ID, serviceId: SERVICE_ID }),
    },
    service: {
      findUnique: vi.fn().mockResolvedValue({ id: SERVICE_ID }),
    },
    material: {
      findUnique: vi.fn().mockResolvedValue(material),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };
}

describe('catalog material payload integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ id: 'owner-1', role: UserRole.OWNER });
  });

  it.each([
    ['a missing field', null],
    ['malformed JSON', '{not-json'],
    ['a JSON object instead of an array', '{}'],
  ])('rejects %s instead of treating it as an empty replacement set', async (_label, payload) => {
    const parsed = parseCatalogMaterialRequirementsPayload(payload);
    expect(parsed.success).toBe(false);

    const formData = new FormData();
    if (typeof payload === 'string') formData.set('materialRequirements', payload);
    const result = await saveServiceProductAction(formData);
    expect(result.error).toContain('مواد الخدمة');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('keeps an explicit empty array as the intentional clear-materials command', () => {
    expect(parseCatalogMaterialRequirementsPayload('[]')).toEqual({ success: true, data: [] });
  });

  it('uses the same inactive-material rule for bulk and legacy service editing', () => {
    const inactiveMaterial = { id: INACTIVE_MATERIAL_ID, active: false };

    expect(canUseServiceMaterialRequirement(inactiveMaterial, new Set())).toBe(false);
    expect(canUseServiceMaterialRequirement(inactiveMaterial, new Set([INACTIVE_MATERIAL_ID]))).toBe(true);
    expect(canUseServiceMaterialRequirement({ id: ACTIVE_MATERIAL_ID, active: true }, new Set())).toBe(true);
  });

  it('rejects a new inactive material from the legacy Operations Resources action', async () => {
    const tx = transactionWithMaterial({
      material: { id: INACTIVE_MATERIAL_ID, active: false },
    });
    mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));

    const result = await saveServiceMaterialRequirementAction(serviceMaterialRequirementForm({
      materialId: INACTIVE_MATERIAL_ID,
    }));

    expect(result).toEqual({ error: 'لا يمكن إضافة مادة موقوفة إلى الخدمة.' });
    expect(tx.serviceMaterialRequirement.create).not.toHaveBeenCalled();
    expect(tx.serviceMaterialRequirement.update).not.toHaveBeenCalled();
  });

  it('allows an existing requirement to retain its own inactive material', async () => {
    const before = {
      id: REQUIREMENT_ID,
      serviceId: SERVICE_ID,
      materialId: INACTIVE_MATERIAL_ID,
      quantity: 1,
      required: true,
      notes: null,
    };
    const tx = transactionWithMaterial({
      before,
      material: { id: INACTIVE_MATERIAL_ID, active: false },
    });
    mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));

    const result = await saveServiceMaterialRequirementAction(serviceMaterialRequirementForm({
      requirementId: REQUIREMENT_ID,
      materialId: INACTIVE_MATERIAL_ID,
    }));

    expect(result.success).toBe(true);
    expect(tx.serviceMaterialRequirement.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: REQUIREMENT_ID },
      data: expect.objectContaining({ materialId: INACTIVE_MATERIAL_ID }),
    }));
  });

  it('does not let an existing requirement be switched to a different inactive material', async () => {
    const tx = transactionWithMaterial({
      before: {
        id: REQUIREMENT_ID,
        serviceId: SERVICE_ID,
        materialId: ACTIVE_MATERIAL_ID,
        quantity: 1,
        required: true,
        notes: null,
      },
      material: { id: INACTIVE_MATERIAL_ID, active: false },
    });
    mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));

    const result = await saveServiceMaterialRequirementAction(serviceMaterialRequirementForm({
      requirementId: REQUIREMENT_ID,
      materialId: INACTIVE_MATERIAL_ID,
    }));

    expect(result).toEqual({ error: 'لا يمكن إضافة مادة موقوفة إلى الخدمة.' });
    expect(tx.serviceMaterialRequirement.update).not.toHaveBeenCalled();
  });
});
