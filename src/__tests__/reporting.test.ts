import { describe, expect, it } from 'vitest';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import { escapeCsvCell, reportToCsv } from '@/lib/reports/csv';
import {
  parseReportFilters,
  reportFiltersToSearchParams,
} from '@/lib/reports/filters';
import type { ReportsResult } from '@/lib/reports/types';

describe('report filters', () => {
  it('normalizes the date order and preserves valid dimensions and enums', () => {
    const filters = parseReportFilters({
      from: '2026-08-31',
      to: '2026-08-02',
      branch: ' branch-cairo ',
      team: 'team-alpha',
      service: 'service-premium',
      zone: 'zone-east',
      status: BookingStatus.CLOSED,
      payment: PaymentStatus.FULLY_PAID,
    });

    expect(filters).toEqual({
      from: '2026-08-02',
      to: '2026-08-31',
      branchId: 'branch-cairo',
      teamId: 'team-alpha',
      serviceId: 'service-premium',
      zoneId: 'zone-east',
      bookingStatus: BookingStatus.CLOSED,
      paymentStatus: PaymentStatus.FULLY_PAID,
    });
  });

  it('rejects impossible dates and unknown statuses without throwing', () => {
    const filters = parseReportFilters(
      { from: '2026-02-31', to: 'not-a-date', status: 'UNKNOWN', payment: 'UNKNOWN' },
      new Date('2026-08-15T10:00:00.000Z'),
    );

    expect(filters).toMatchObject({ from: '2026-08-01', to: '2026-08-15' });
    expect(filters.bookingStatus).toBeUndefined();
    expect(filters.paymentStatus).toBeUndefined();
  });

  it('round-trips the canonical filter query used by the page and CSV route', () => {
    const original = parseReportFilters({
      from: '2026-07-01',
      to: '2026-07-31',
      branch: 'branch-1',
      status: BookingStatus.CANCELLED,
    });
    const roundTrip = parseReportFilters(reportFiltersToSearchParams(original));

    expect(roundTrip).toEqual(original);
  });
});

describe('report CSV', () => {
  it('quotes separators and line breaks, doubles quotes, and neutralizes formulas', () => {
    expect(escapeCsvCell('فرع, القاهرة')).toBe('"فرع, القاهرة"');
    expect(escapeCsvCell('قال "تم"')).toBe('"قال ""تم"""');
    expect(escapeCsvCell('سطر\nثان')).toBe('"سطر\nثان"');
    expect(escapeCsvCell('=HYPERLINK("https://example.test")')).toBe(
      '"\'=HYPERLINK(""https://example.test"")"',
    );
    expect(escapeCsvCell(-25)).toBe('-25');
  });

  it('emits a UTF-8 BOM and every report section plus matching booking rows', () => {
    const report: ReportsResult = {
      generatedAt: '2026-08-15T10:00:00.000Z',
      filters: { from: '2026-08-01', to: '2026-08-15' },
      bookings: {
        total: 1,
        completed: 1,
        cancelled: 0,
        cancellationRate: 0,
        uniqueCustomerCount: 1,
        rebookedCustomerCount: 0,
        rebookingRate: 0,
        rejected: 0,
        noShow: 0,
        accessDenied: 0,
        byStatus: [{ id: BookingStatus.CLOSED, label: BookingStatus.CLOSED, count: 1 }],
        byService: [],
        byBranch: [],
        byZone: [],
        byTeam: [],
      },
      financial: {
        totalGrossSales: 500,
        bookingGrossSales: 500,
        subscriptionGrossSales: 0,
        verifiedPaymentCount: 1,
        verifiedPaymentAmount: 500,
        partialBookingCount: 0,
        partialAmountPaid: 0,
        amountDue: 0,
        refundCount: 0,
        refunds: 0,
        netCollected: 500,
        averageBookingValue: 500,
        comparisonNetCollected: 400,
        salesChangeAmount: 100,
        salesGrowthRate: 25,
        byService: [],
        byBranch: [],
        byTeam: [],
      },
      operations: {
        utilizationRate: 20,
        utilizedJobs: 1,
        availableJobSlots: 5,
        averageServiceDurationMinutes: 60,
        durationSampleCount: 1,
        onTimeArrivalRate: 100,
        onTimeArrivalCount: 1,
        arrivalSampleCount: 1,
        averageDelayMinutes: 0,
        delayedArrivalCount: 0,
        checklistCompletionRate: 100,
        checkedChecklistItems: 2,
        checklistItemCount: 2,
        qualityReturnRate: 0,
        qualityReturnCount: 0,
        qualityReviewCount: 1,
        complaintRate: 0,
        bookingsWithComplaints: 0,
        complaintCount: 0,
        jobsByTeam: [],
        jobsByEmployee: [],
        teamCompletion: [],
        topEmployee: null,
      },
      subscriptions: {
        active: 0,
        newSubscriptions: 0,
        expired: 0,
        visitsConsumed: 0,
        visitsRemaining: 0,
        recordedRevenue: 0,
        activatedCount: 0,
      },
      cancellations: {
        totalRequests: 0,
        refundTotal: 0,
        rescheduledCount: 0,
        byReason: [],
        byResponsibleParty: [],
      },
      customerRatings: {
        totalCount: 0,
        averageScore: 0,
        approvedCount: 0,
        byScore: [],
        byService: [],
        byBranch: [],
      },
      rows: [{
        bookingNumber: 'BQ-1',
        startAt: '2026-08-10T08:00:00.000Z',
        branch: 'القاهرة',
        service: 'غسيل, شامل',
        zone: 'شرق',
        area: 'التجمع',
        team: 'ألفا',
        bookingStatus: BookingStatus.CLOSED,
        paymentStatus: PaymentStatus.FULLY_PAID,
        totalPrice: 500,
        amountPaid: 500,
        amountDue: 0,
      }],
    };

    const output = reportToCsv(report);
    expect(output.charCodeAt(0)).toBe(0xfeff);
    expect(output).toContain('ملخص الحجوزات');
    expect(output).toContain('الملخص المالي');
    expect(output).toContain('ملخص التشغيل');
    expect(output).toContain('ملخص الاشتراكات');
    expect(output).toContain('ملخص الإلغاءات وإعادة الجدولة');
    expect(output).toContain('معدل الإلغاء %');
    expect(output).toContain('معدل إعادة الحجز %');
    expect(output).toContain('نمو المبيعات %');
    expect(output).toContain('نسب إتمام الفرق');
    expect(output).toContain('"غسيل, شامل"');
  });
});
