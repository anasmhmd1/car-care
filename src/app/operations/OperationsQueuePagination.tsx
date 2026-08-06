'use client';

import { useRouter } from 'next/navigation';
import {
  operationsQueuePageParam,
  type OperationsDashboardQueueKey,
  type OperationsQueueKey,
  type OperationsQueuePagination as QueuePagination,
} from './pagination';

interface OperationsQueuePaginationProps {
  queueKey: OperationsQueueKey;
  pagination: QueuePagination;
  dashboardTab?: OperationsDashboardQueueKey;
}

export default function OperationsQueuePagination({
  queueKey,
  pagination,
  dashboardTab,
}: OperationsQueuePaginationProps) {
  const router = useRouter();

  if (!pagination.hasPreviousPage && !pagination.hasNextPage) return null;

  function goToPage(page: number) {
    const params = new URLSearchParams(window.location.search);
    const pageParam = operationsQueuePageParam(queueKey);

    if (page <= 1) params.delete(pageParam);
    else params.set(pageParam, String(page));

    if (dashboardTab) params.set('dashboardTab', dashboardTab);

    const search = params.toString();
    router.push(search ? `/operations?${search}` : '/operations');
  }

  return (
    <nav aria-label="التنقل بين صفحات القائمة" className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-4 text-xs">
      <button
        type="button"
        onClick={() => goToPage(pagination.page - 1)}
        disabled={!pagination.hasPreviousPage}
        className="min-h-10 rounded-xl border border-neutral-700 px-4 font-bold text-neutral-200 transition hover:border-[#c9a227] hover:text-[#e5c45a] disabled:cursor-not-allowed disabled:opacity-40"
      >
        السابق
      </button>
      <span className="font-semibold text-neutral-400">صفحة {pagination.page}</span>
      <button
        type="button"
        onClick={() => goToPage(pagination.page + 1)}
        disabled={!pagination.hasNextPage}
        className="min-h-10 rounded-xl border border-[#c9a227]/50 px-4 font-bold text-[#e5c45a] transition hover:bg-[#c9a227]/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        التالي
      </button>
    </nav>
  );
}
