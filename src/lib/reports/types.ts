import type { BookingStatus, PaymentStatus } from '@prisma/client';
import type { ReportFilters } from '@/lib/reports/filters';

export interface CountValueRow {
  id: string;
  label: string;
  count: number;
  bookingValue: number;
  collected: number;
}

export interface CountRow {
  id: string;
  label: string;
  count: number;
}

export interface RevenueRow {
  id: string;
  label: string;
  count: number;
  amount: number;
}

/** A transparent operational completion measure for an assigned team. */
export interface CompletionRateRow {
  id: string;
  label: string;
  assigned: number;
  completed: number;
  completionRate: number;
}

export interface BookingReportRow {
  bookingNumber: string;
  startAt: string;
  branch: string;
  service: string;
  zone: string;
  area: string;
  team: string;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  totalPrice: number;
  amountPaid: number;
  amountDue: number;
}

export interface ReportsResult {
  generatedAt: string;
  filters: ReportFilters;
  bookings: {
    total: number;
    completed: number;
    cancelled: number;
    cancellationRate: number;
    uniqueCustomerCount: number;
    rebookedCustomerCount: number;
    rebookingRate: number;
    rejected: number;
    noShow: number;
    accessDenied: number;
    byStatus: CountRow[];
    byService: CountValueRow[];
    byBranch: CountValueRow[];
    byZone: CountValueRow[];
    byTeam: CountValueRow[];
  };
  financial: {
    totalGrossSales: number;
    bookingGrossSales: number;
    subscriptionGrossSales: number;
    verifiedPaymentCount: number;
    verifiedPaymentAmount: number;
    partialBookingCount: number;
    partialAmountPaid: number;
    amountDue: number;
    refundCount: number;
    refunds: number;
    netCollected: number;
    averageBookingValue: number;
    comparisonNetCollected: number;
    salesChangeAmount: number;
    /** Null means there was no positive prior-period base to compare against. */
    salesGrowthRate: number | null;
    byService: RevenueRow[];
    byBranch: RevenueRow[];
    byTeam: RevenueRow[];
  };
  operations: {
    utilizationRate: number;
    utilizedJobs: number;
    availableJobSlots: number;
    averageServiceDurationMinutes: number;
    durationSampleCount: number;
    onTimeArrivalRate: number;
    onTimeArrivalCount: number;
    arrivalSampleCount: number;
    averageDelayMinutes: number;
    delayedArrivalCount: number;
    checklistCompletionRate: number;
    checkedChecklistItems: number;
    checklistItemCount: number;
    qualityReturnRate: number;
    qualityReturnCount: number;
    qualityReviewCount: number;
    complaintRate: number;
    bookingsWithComplaints: number;
    complaintCount: number;
    jobsByTeam: CountRow[];
    jobsByEmployee: CountRow[];
    teamCompletion: CompletionRateRow[];
    topEmployee: CountRow | null;
  };
  subscriptions: {
    active: number;
    newSubscriptions: number;
    expired: number;
    visitsConsumed: number;
    visitsRemaining: number;
    recordedRevenue: number;
    activatedCount: number;
  };
  cancellations: {
    totalRequests: number;
    refundTotal: number;
    rescheduledCount: number;
    byReason: CountRow[];
    byResponsibleParty: CountRow[];
  };
  customerRatings: {
    totalCount: number;
    averageScore: number;
    approvedCount: number;
    byScore: CountRow[];
    byService: CountValueRow[];
    byBranch: CountValueRow[];
  };
  rows: BookingReportRow[];
}

export interface ReportFilterOptions {
  branches: Array<{ id: string; label: string }>;
  teams: Array<{ id: string; label: string; branchId: string }>;
  services: Array<{ id: string; label: string }>;
  zones: Array<{ id: string; label: string; branchId: string }>;
}
