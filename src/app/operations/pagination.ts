export const OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE = 25;
export const OPERATIONS_CASE_QUEUE_PAGE_SIZE = 20;

const MAX_OPERATIONS_QUEUE_PAGE = 10_000;

export type OperationsDashboardQueueKey =
  | 'bookings_queue'
  | 'proofs'
  | 'review'
  | 'unassigned'
  | 'bookings'
  | 'past_due'
  | 'terminal';

export type OperationsCaseQueueKey =
  | 'cancellations'
  | 'reschedules'
  | 'quality'
  | 'complaints'
  | 'refunds';

export type OperationsQueueKey = OperationsDashboardQueueKey | OperationsCaseQueueKey;

export interface OperationsQueuePagination {
  page: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface OperationsQueueWindow extends OperationsQueuePagination {
  skip: number;
  take: number;
}

export function operationsQueuePageParam(key: OperationsQueueKey) {
  return `${key}Page`;
}

export function parseOperationsQueuePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number(rawValue);

  if (!Number.isSafeInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_OPERATIONS_QUEUE_PAGE);
}

/**
 * Requests one extra record so the UI can safely expose a next-page control
 * without sending a separate count query for every operations queue.
 */
export function operationsQueueWindow(
  value: string | string[] | undefined,
  pageSize: number,
): OperationsQueueWindow {
  const page = parseOperationsQueuePage(value);

  return {
    page,
    hasPreviousPage: page > 1,
    hasNextPage: false,
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
  };
}

export function pageOperationsQueue<T>(
  records: T[],
  window: OperationsQueueWindow,
  pageSize: number,
) {
  return {
    records: records.slice(0, pageSize),
    pagination: {
      page: window.page,
      hasPreviousPage: window.hasPreviousPage,
      hasNextPage: records.length > pageSize,
    } satisfies OperationsQueuePagination,
  };
}
