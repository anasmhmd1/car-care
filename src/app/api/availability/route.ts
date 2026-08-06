import { NextRequest, NextResponse } from 'next/server';
import { calculateAvailableSlots } from '@/lib/engine/availability';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getClientIP, logSecurityEvent } from '@/lib/security/security-events';
import { parseAvailabilityRequest } from '@/lib/validations/availability';

const AVAILABILITY_ENDPOINT_KEY = 'endpoint:availability';

export async function GET(req: NextRequest) {
  const clientIP = getClientIP(req.headers);
  let rateLimit;
  try {
    rateLimit = await checkRateLimit(`${AVAILABILITY_ENDPOINT_KEY}|ip:${clientIP}`, 'availability');
  } catch (error) {
    console.error('Availability rate-limit error:', error);
    return NextResponse.json(
      { error: 'تعذر التحقق من طلب المواعيد الآن. حاول مرة أخرى.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!rateLimit.allowed) {
    void logSecurityEvent({
      eventType: 'RATE_LIMIT_EXCEEDED',
      description: 'Availability lookup rate limit exceeded.',
      ipAddress: clientIP,
      metadata: { endpoint: 'availability', resetIn: rateLimit.resetIn },
    });
    return NextResponse.json(
      { error: 'تم تجاوز عدد طلبات المواعيد المسموح. حاول بعد قليل.' },
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(rateLimit.resetIn),
        },
      },
    );
  }

  const parsed = parseAvailabilityRequest(new URL(req.url).searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'بيانات طلب المواعيد غير صالحة.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { branchId, serviceId, coverageAreaId, vehicleSize, date, addonIds } = parsed.data;

  try {
    const slots = await calculateAvailableSlots({
      branchId,
      serviceId,
      vehicleSize,
      addonIds,
      coverageAreaId,
      dateStr: date,
    });
    return NextResponse.json({ slots }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Availability API error:', error);
    return NextResponse.json({ error: 'Failed to calculate available slots' }, { status: 500 });
  }
}
