import { describe, expect, it, vi } from 'vitest';
import { EmployeeMovementType } from '@prisma/client';
import { deductEmployeeMaterialsForCompletedBooking } from '@/lib/engine/inventory-consumption';

describe('Employee Inventory & Material Deduction Engine (خصم مخزون وعهدة الموظف تلقائياً)', () => {
  it('deducts configured service materials from the assigned employee on service completion', async () => {
    const SHAMPOO_ID = 'mat-shampoo-100';
    const TOWEL_ID = 'mat-towel-200';
    const EMPLOYEE_ID = 'emp-ahmed-01';
    const BOOKING_ID = 'booking-bq-123';

    const requirements = [
      { id: 'req-1', serviceId: 'srv-1', materialId: SHAMPOO_ID, quantity: 250, required: true },
      { id: 'req-2', serviceId: 'srv-1', materialId: TOWEL_ID, quantity: 2, required: true },
    ];

    const existingStockMap = new Map<string, number>([
      [`${EMPLOYEE_ID}_${SHAMPOO_ID}`, 5000],
      [`${EMPLOYEE_ID}_${TOWEL_ID}`, 20],
    ]);

    const createdMovements: Array<Record<string, unknown>> = [];

    const mockTx = {
      serviceMaterialRequirement: {
        findMany: vi.fn().mockResolvedValue(requirements),
      },
      employeeInventoryMovement: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          createdMovements.push(data);
          return Promise.resolve({ id: 'mov-' + createdMovements.length, ...data });
        }),
      },
      employeeMaterialStock: {
        upsert: vi.fn().mockImplementation(({ where, update }: { where: { employeeId_materialId: { employeeId: string; materialId: string } }; update: { quantityOnHand: { decrement?: number } } }) => {
          const key = `${where.employeeId_materialId.employeeId}_${where.employeeId_materialId.materialId}`;
          const current = existingStockMap.get(key) ?? 0;
          const newBalance = current - (update.quantityOnHand.decrement ?? 0);
          existingStockMap.set(key, newBalance);
          return Promise.resolve({
            id: 'stock-' + key,
            employeeId: where.employeeId_materialId.employeeId,
            materialId: where.employeeId_materialId.materialId,
            quantityOnHand: newBalance,
          });
        }),
      },
      branchMaterialStock: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    await deductEmployeeMaterialsForCompletedBooking(mockTx as unknown as Parameters<typeof deductEmployeeMaterialsForCompletedBooking>[0], {
      bookingId: BOOKING_ID,
      bookingNumber: 'BQ-2026-0012',
      serviceId: 'srv-1',
      serviceNameAr: 'غسيل جاف بريميوم',
      branchId: 'branch-1',
      assignedEmployeeId: EMPLOYEE_ID,
      assignedTeamMembers: [EMPLOYEE_ID],
      teamLeaderId: EMPLOYEE_ID,
      actorUserId: 'actor-mgr',
    });

    // Verify Shampoo deduction: 5000 - 250 = 4750
    expect(existingStockMap.get(`${EMPLOYEE_ID}_${SHAMPOO_ID}`)).toBe(4750);

    // Verify Towel deduction: 20 - 2 = 18
    expect(existingStockMap.get(`${EMPLOYEE_ID}_${TOWEL_ID}`)).toBe(18);

    // Verify Movement logs
    expect(createdMovements).toHaveLength(2);
    expect(createdMovements[0]).toMatchObject({
      bookingId: BOOKING_ID,
      type: EmployeeMovementType.CONSUMPTION_BY_BOOKING,
      quantityChange: -250,
      balanceAfter: 4750,
    });
    expect(createdMovements[1]).toMatchObject({
      bookingId: BOOKING_ID,
      type: EmployeeMovementType.CONSUMPTION_BY_BOOKING,
      quantityChange: -2,
      balanceAfter: 18,
    });
  });

  it('prevents duplicate deductions if already processed for the same booking (idempotency)', async () => {
    const mockTx = {
      serviceMaterialRequirement: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'req-1', serviceId: 'srv-1', materialId: 'mat-1', quantity: 100 },
        ]),
      },
      employeeInventoryMovement: {
        findFirst: vi.fn().mockResolvedValue({ id: 'existing-mov' }),
        create: vi.fn(),
      },
      employeeMaterialStock: {
        upsert: vi.fn(),
      },
      branchMaterialStock: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    await deductEmployeeMaterialsForCompletedBooking(mockTx as unknown as Parameters<typeof deductEmployeeMaterialsForCompletedBooking>[0], {
      bookingId: 'booking-dup',
      bookingNumber: 'BQ-2026-0099',
      serviceId: 'srv-1',
      serviceNameAr: 'غسيل جاف',
      branchId: 'branch-1',
      assignedEmployeeId: 'emp-1',
      assignedTeamMembers: ['emp-1'],
      teamLeaderId: 'emp-1',
      actorUserId: 'actor-1',
    });

    expect(mockTx.employeeMaterialStock.upsert).not.toHaveBeenCalled();
    expect(mockTx.employeeInventoryMovement.create).not.toHaveBeenCalled();
  });

  it('prioritizes deducting custody from the team leader and logs vehicle and team info', async () => {
    const LEADER_ID = 'leader-karim-01';
    const MEMBER_ID = 'member-ahmed-02';
    const POLISH_ID = 'mat-polish-300';
    const BOOKING_ID = 'booking-team-vehicle-456';

    const requirements = [
      {
        id: 'req-polish',
        serviceId: 'srv-polish',
        materialId: POLISH_ID,
        quantity: 0.25,
        required: true,
        material: { nameAr: 'شمع ملمع', unit: 'لتر' },
      },
    ];

    const stockMap = new Map<string, number>([
      [`${LEADER_ID}_${POLISH_ID}`, 5],
    ]);

    const createdMovements: Array<Record<string, unknown>> = [];

    const mockTx = {
      serviceMaterialRequirement: {
        findMany: vi.fn().mockResolvedValue(requirements),
      },
      employeeInventoryMovement: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          createdMovements.push(data);
          return Promise.resolve({ id: 'mov-' + createdMovements.length, ...data });
        }),
      },
      employeeMaterialStock: {
        upsert: vi.fn().mockImplementation(({ where, update }: { where: { employeeId_materialId: { employeeId: string; materialId: string } }; update: { quantityOnHand: { decrement?: number } } }) => {
          const key = `${where.employeeId_materialId.employeeId}_${where.employeeId_materialId.materialId}`;
          const current = stockMap.get(key) ?? 0;
          const newBalance = current - (update.quantityOnHand.decrement ?? 0);
          stockMap.set(key, newBalance);
          return Promise.resolve({
            id: 'stock-' + key,
            employeeId: where.employeeId_materialId.employeeId,
            materialId: where.employeeId_materialId.materialId,
            quantityOnHand: newBalance,
          });
        }),
      },
      branchMaterialStock: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };

    await deductEmployeeMaterialsForCompletedBooking(mockTx as unknown as Parameters<typeof deductEmployeeMaterialsForCompletedBooking>[0], {
      bookingId: BOOKING_ID,
      bookingNumber: 'BQ-2026-0888',
      serviceId: 'srv-polish',
      serviceNameAr: 'تلميع ساطع',
      branchId: 'branch-cairo',
      assignedEmployeeId: MEMBER_ID,
      assignedTeamMembers: [LEADER_ID, MEMBER_ID],
      teamLeaderId: LEADER_ID,
      teamName: 'فريق الصباح A',
      vehicleCode: 'VAN-01',
      vehiclePlateNumber: 'أ ب ج 123',
      actorUserId: 'actor-leader',
    });

    // Verify deduction occurred on the Team Leader's stock: 5 - 0.25 = 4.75
    expect(stockMap.get(`${LEADER_ID}_${POLISH_ID}`)).toBe(4.75);

    // Verify movement log contains vehicle and team context
    expect(createdMovements).toHaveLength(1);
    expect(createdMovements[0]).toMatchObject({
      bookingId: BOOKING_ID,
      type: EmployeeMovementType.CONSUMPTION_BY_BOOKING,
      quantityChange: -0.25,
      balanceAfter: 4.75,
    });
    expect(createdMovements[0].reason).toContain('سيارة VAN-01');
    expect(createdMovements[0].reason).toContain('فريق فريق الصباح A');
  });
});
