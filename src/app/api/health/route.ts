import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStorageAdapter } from '@/lib/storage/adapter';

export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

/**
 * Readiness probe used by the container orchestrator. Unlike the public home
 * page, this endpoint must fail when the application cannot reach PostgreSQL.
 */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;

    const storageDriver = process.env.STORAGE_DRIVER?.trim().toLowerCase() || 'local';
    const isServerless = Boolean(
      process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT,
    );
    if (
      process.env.NODE_ENV === 'production' &&
      isServerless &&
      storageDriver === 'local'
    ) {
      throw new Error('Persistent object storage is required for serverless production uploads.');
    }
    // Validate driver names and required Supabase credentials without writing.
    getStorageAdapter();

    return NextResponse.json({ status: 'ok' }, { headers: noStoreHeaders });
  } catch {
    return NextResponse.json(
      { status: 'unhealthy' },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
