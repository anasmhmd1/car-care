import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createMaterialRequirementsSnapshot,
  readMaterialRequirementsSnapshot,
  resolveBookingMaterialRequirements,
  type BookingMaterialRequirementSnapshot,
} from '@/lib/booking/material-requirements-snapshot';

const originalRequirements = [
  {
    materialId: 'material-shampoo',
    quantity: 2,
    required: true,
    notes: 'استخدمه مع ماء بارد.',
    material: {
      nameAr: 'شامبو متعادل',
      unit: 'لتر',
      sku: 'BRQ-SHAMPOO-PH',
      active: true,
    },
  },
  {
    materialId: 'material-towel',
    quantity: 1,
    required: false,
    notes: null,
    material: {
      nameAr: 'فوطة مايكروفايبر',
      unit: 'قطعة',
      sku: 'BRQ-MICROFIBER',
      active: false,
    },
  },
] as const;

const expectedSnapshot: BookingMaterialRequirementSnapshot[] = [
  {
    id: 'material-shampoo',
    nameAr: 'شامبو متعادل',
    unit: 'لتر',
    quantity: 2,
    required: true,
    notes: 'استخدمه مع ماء بارد.',
  },
  {
    id: 'material-towel',
    nameAr: 'فوطة مايكروفايبر',
    unit: 'قطعة',
    quantity: 1,
    required: false,
    notes: null,
  },
];

describe('booking material requirements snapshot', () => {
  it('stores only the immutable execution contract fields', () => {
    const snapshot = createMaterialRequirementsSnapshot(originalRequirements);

    expect(snapshot).toEqual(expectedSnapshot);
    expect(Object.keys(snapshot[0] as Record<string, unknown>).sort()).toEqual([
      'id',
      'nameAr',
      'notes',
      'quantity',
      'required',
      'unit',
    ]);
    expect(snapshot).not.toContainEqual(expect.objectContaining({ sku: expect.anything() }));
    expect(snapshot).not.toContainEqual(expect.objectContaining({ active: expect.anything() }));
  });

  it('keeps the booked requirements after the live service configuration changes', () => {
    const bookedServiceSnapshot = {
      nameAr: 'عناية خارجية',
      materials: createMaterialRequirementsSnapshot(originalRequirements),
    };
    const laterLiveRequirements: BookingMaterialRequirementSnapshot[] = [{
      id: 'material-new-polish',
      nameAr: 'ملمع جديد',
      unit: 'عبوة',
      quantity: 9,
      required: true,
      notes: 'لا يجب أن يظهر في الحجز القديم.',
    }];

    expect(readMaterialRequirementsSnapshot(bookedServiceSnapshot)).toEqual(expectedSnapshot);
    expect(resolveBookingMaterialRequirements(
      bookedServiceSnapshot,
      laterLiveRequirements,
    )).toEqual(expectedSnapshot);
  });

  it('uses a valid empty snapshot but safely falls back for legacy or corrupt bookings', () => {
    const liveRequirements = expectedSnapshot.slice(0, 1);

    expect(resolveBookingMaterialRequirements(
      { nameAr: 'خدمة بلا مواد', materials: [] },
      liveRequirements,
    )).toEqual([]);
    expect(readMaterialRequirementsSnapshot({ nameAr: 'حجز قديم' })).toBeNull();
    expect(resolveBookingMaterialRequirements({ nameAr: 'حجز قديم' }, liveRequirements)).toEqual(liveRequirements);
    expect(readMaterialRequirementsSnapshot({
      materials: [{ ...expectedSnapshot[0], id: 'not a valid id' }],
    })).toBeNull();
  });

  it('uses the snapshot in booking creation, staff display, and the server-side start guard', () => {
    const bookingAction = readFileSync(path.join(process.cwd(), 'src/app/actions/booking.ts'), 'utf8');
    const staffPage = readFileSync(path.join(process.cwd(), 'src/app/staff/page.tsx'), 'utf8');
    const technicianAction = readFileSync(path.join(process.cwd(), 'src/app/actions/technician.ts'), 'utf8');

    expect(bookingAction).toContain('materials: createMaterialRequirementsSnapshot(service.materialRequirements)');
    expect(staffPage).toContain('readMaterialRequirementsSnapshot(booking.serviceSnapshot)');
    expect(staffPage).toContain('legacyServiceIds');
    expect(technicianAction).toContain('readMaterialRequirementsSnapshot(booking.serviceSnapshot)');
    expect(technicianAction).toContain('resolveBookingMaterialRequirements(');
  });
});
