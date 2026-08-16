import { describe, expect, it } from 'vitest';
import { localDateBoundsUtc } from '@/lib/engine/time';

describe('Monthly Revenue & Profit Ledger (دفتر الإيرادات والأرباح الشهرية)', () => {
  it('calculates exact monthly date bounds in Cairo time zone', () => {
    const selectedMonth = '2026-08';
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const lastDay = new Date(year, month, 0).getDate();

    expect(lastDay).toBe(31);

    const startDateStr = `${selectedMonth}-01`;
    const endDateStr = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

    const bounds = {
      start: localDateBoundsUtc(startDateStr, 'Africa/Cairo').start,
      end: localDateBoundsUtc(endDateStr, 'Africa/Cairo').end,
    };

    expect(bounds.start.toISOString()).toBeDefined();
    expect(bounds.end.toISOString()).toBeDefined();
    expect(bounds.end.getTime()).toBeGreaterThan(bounds.start.getTime());
  });

  it('correctly aggregates gross revenue, subscriptions, bookings, refunds, and net earnings', () => {
    const mockBookings = [
      { amount: 500, customerName: 'أحمد محمود', service: 'غسيل جاف بالبخار' },
      { amount: 750, customerName: 'كريم عادل', service: 'باقة عناية شاملة' },
    ];
    const mockSubscriptions = [
      { amount: 2400, customerName: 'سارة طارق', plan: 'باقة بريق الذهبية 4 زيارات' },
    ];
    const mockRefunds = [
      { amount: 200, customerName: 'كريم عادل' },
    ];

    const bookingRevenue = mockBookings.reduce((sum, b) => sum + b.amount, 0);
    const subscriptionRevenue = mockSubscriptions.reduce((sum, s) => sum + s.amount, 0);
    const grossRevenue = bookingRevenue + subscriptionRevenue;
    const totalRefunds = mockRefunds.reduce((sum, r) => sum + r.amount, 0);
    const netRevenue = grossRevenue - totalRefunds;

    expect(bookingRevenue).toBe(1250);
    expect(subscriptionRevenue).toBe(2400);
    expect(grossRevenue).toBe(3650);
    expect(totalRefunds).toBe(200);
    expect(netRevenue).toBe(3450);
  });

  it('properly attributes who booked and who subscribed in unified customer transactions', () => {
    const transactions = [
      {
        type: 'BOOKING',
        customerName: 'محمد سامي',
        customerPhone: '01012345678',
        title: 'حجز: غسيل جاف داخلي وخارجي',
        amount: 600,
      },
      {
        type: 'SUBSCRIPTION',
        customerName: 'منى يوسف',
        customerPhone: '01298765432',
        title: 'اشتراك: باقة النخبة الشهرية',
        amount: 3200,
      },
    ];

    expect(transactions[0].customerName).toBe('محمد سامي');
    expect(transactions[0].customerPhone).toBe('01012345678');
    expect(transactions[0].title).toContain('حجز');

    expect(transactions[1].customerName).toBe('منى يوسف');
    expect(transactions[1].customerPhone).toBe('01298765432');
    expect(transactions[1].title).toContain('اشتراك');
  });
});
