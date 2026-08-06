import {
  DATABASE_ID_MAX_LENGTH,
  DATABASE_ID_PATTERN,
} from '@/lib/validations/database-id';
import type { Prisma } from '@prisma/client';

/**
 * Immutable material data captured inside Booking.serviceSnapshot.materials.
 * This deliberately contains no SKU, stock, active flag, or other mutable
 * catalog data: staff need only the material identity and execution contract
 * that applied when the customer placed the booking.
 */
export interface BookingMaterialRequirementSnapshot {
  id: string;
  nameAr: string;
  unit: string;
  quantity: number;
  required: boolean;
  notes: string | null;
}

export interface ServiceMaterialRequirementSnapshotSource {
  materialId: string;
  quantity: number;
  required: boolean;
  notes: string | null;
  material: {
    nameAr: string;
    unit: string;
  };
}

const MAX_REQUIREMENTS = 200;
const MAX_MATERIAL_NAME_LENGTH = 140;
const MAX_UNIT_LENGTH = 40;
const MAX_NOTES_LENGTH = 1_000;
const MAX_QUANTITY = 1_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= DATABASE_ID_MAX_LENGTH
    && DATABASE_ID_PATTERN.test(value);
}

function isValidText(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= maximumLength;
}

function parseMaterialRequirement(value: unknown): BookingMaterialRequirementSnapshot | null {
  if (!isRecord(value)) return null;
  if (!isValidId(value.id)) return null;
  if (!isValidText(value.nameAr, MAX_MATERIAL_NAME_LENGTH)) return null;
  if (!isValidText(value.unit, MAX_UNIT_LENGTH)) return null;
  if (
    typeof value.quantity !== 'number'
    || !Number.isInteger(value.quantity)
    || value.quantity < 1
    || value.quantity > MAX_QUANTITY
  ) {
    return null;
  }
  if (typeof value.required !== 'boolean') return null;
  if (
    value.notes !== null
    && (typeof value.notes !== 'string' || value.notes.length > MAX_NOTES_LENGTH)
  ) {
    return null;
  }

  return {
    id: value.id,
    nameAr: value.nameAr,
    unit: value.unit,
    quantity: value.quantity,
    required: value.required,
    notes: value.notes,
  };
}

/**
 * Produces the only material fields allowed into the persisted booking
 * snapshot. The source comes from the service configuration within the same
 * booking transaction.
 */
export function createMaterialRequirementsSnapshot(
  requirements: readonly ServiceMaterialRequirementSnapshotSource[],
): Prisma.InputJsonArray {
  return requirements.map((requirement): Prisma.InputJsonObject => ({
    id: requirement.materialId,
    nameAr: requirement.material.nameAr,
    unit: requirement.material.unit,
    quantity: requirement.quantity,
    required: requirement.required,
    notes: requirement.notes,
  }));
}

/**
 * Returns null, rather than an empty array, when the booking predates the
 * snapshot feature or contains corrupt data. An explicit empty `materials`
 * array is a valid immutable snapshot for a service with no materials.
 */
export function readMaterialRequirementsSnapshot(
  serviceSnapshot: unknown,
): BookingMaterialRequirementSnapshot[] | null {
  if (!isRecord(serviceSnapshot) || !Array.isArray(serviceSnapshot.materials)) {
    return null;
  }
  if (serviceSnapshot.materials.length > MAX_REQUIREMENTS) return null;

  const materialIds = new Set<string>();
  const requirements: BookingMaterialRequirementSnapshot[] = [];
  for (const item of serviceSnapshot.materials) {
    const requirement = parseMaterialRequirement(item);
    if (!requirement || materialIds.has(requirement.id)) return null;
    materialIds.add(requirement.id);
    requirements.push(requirement);
  }
  return requirements;
}

/**
 * New bookings always use their immutable snapshot. Only historical bookings
 * that have no valid snapshot read the live service configuration.
 */
export function resolveBookingMaterialRequirements(
  serviceSnapshot: unknown,
  legacyRequirements: readonly BookingMaterialRequirementSnapshot[],
): BookingMaterialRequirementSnapshot[] {
  return readMaterialRequirementsSnapshot(serviceSnapshot) ?? [...legacyRequirements];
}
