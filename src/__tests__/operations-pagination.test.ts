import { describe, expect, it } from 'vitest';
import {
  OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE,
  operationsQueuePageParam,
  operationsQueueWindow,
  pageOperationsQueue,
  parseOperationsQueuePage,
} from '../app/operations/pagination';

describe('operations queue pagination', () => {
  it('normalizes malformed or excessive page values before they reach Prisma', () => {
    expect(parseOperationsQueuePage(undefined)).toBe(1);
    expect(parseOperationsQueuePage('0')).toBe(1);
    expect(parseOperationsQueuePage('-2')).toBe(1);
    expect(parseOperationsQueuePage('not-a-page')).toBe(1);
    expect(parseOperationsQueuePage(['3', 'ignored'])).toBe(3);
    expect(parseOperationsQueuePage('999999')).toBe(10_000);
  });

  it('uses an extra row to expose a next page without a count query', () => {
    const window = operationsQueueWindow('2', OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE);
    const rows = Array.from(
      { length: OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE + 1 },
      (_value, index) => index + 1,
    );

    expect(window).toMatchObject({
      page: 2,
      skip: OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE,
      take: OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE + 1,
      hasPreviousPage: true,
    });
    expect(pageOperationsQueue(rows, window, OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE)).toEqual({
      records: rows.slice(0, OPERATIONS_PRIMARY_QUEUE_PAGE_SIZE),
      pagination: {
        page: 2,
        hasPreviousPage: true,
        hasNextPage: true,
      },
    });
  });

  it('generates correct query param names for all dashboard queues including merged and past due', () => {
    expect(operationsQueuePageParam('bookings_queue')).toBe('bookings_queuePage');
    expect(operationsQueuePageParam('past_due')).toBe('past_duePage');
    expect(operationsQueuePageParam('proofs')).toBe('proofsPage');
    expect(operationsQueuePageParam('review')).toBe('reviewPage');
    expect(operationsQueuePageParam('unassigned')).toBe('unassignedPage');
  });
});
