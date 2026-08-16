import { bookingStatusLabels, paymentStatusLabels, responsiblePartyLabels } from '@/lib/reports/labels';
import type { CountRow, ReportsResult } from '@/lib/reports/types';

type CsvValue = string | number | boolean | null | undefined;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function csv(rows: CsvValue[][]): string {
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}\r\n`;
}

function addCountRows(
  rows: CsvValue[][],
  title: string,
  values: CountRow[],
  labelFor: (row: CountRow) => string = (row) => row.label,
): void {
  rows.push([], [title], ['البند', 'العدد']);
  for (const row of values) rows.push([labelFor(row), row.count]);
}

export function reportToCsv(report: ReportsResult): string {
  const rows: CsvValue[][] = [
    ['تقرير بريق التشغيلي والمالي الكامل'],
    ['تم التوليد', report.generatedAt],
    ['من', report.filters.from],
    ['إلى', report.filters.to],
    ['معرف الفرع', report.filters.branchId],
    ['معرف الفريق', report.filters.teamId],
    ['معرف الخدمة', report.filters.serviceId],
    ['معرف المنطقة', report.filters.zoneId],
    ['حالة الحجز', report.filters.bookingStatus ? bookingStatusLabels[report.filters.bookingStatus] : 'الكل'],
    ['حالة الدفع', report.filters.paymentStatus ? paymentStatusLabels[report.filters.paymentStatus] : 'الكل'],
    [],
    ['ملخص الحجوزات'],
    ['إجمالي الحجوزات', report.bookings.total],
    ['المكتملة', report.bookings.completed],
    ['الملغاة', report.bookings.cancelled],
    ['معدل الإلغاء %', report.bookings.cancellationRate],
    ['العملاء ذوو الحجوزات الصالحة', report.bookings.uniqueCustomerCount],
    ['العملاء الذين أعادوا الحجز في الفترة', report.bookings.rebookedCustomerCount],
    ['معدل إعادة الحجز %', report.bookings.rebookingRate],
    ['المرفوضة', report.bookings.rejected],
    ['عدم حضور العميل', report.bookings.noShow],
    ['تعذر الدخول', report.bookings.accessDenied],
    [],
    ['الملخص المالي'],
    ['إجمالي المبيعات (الحجوزات والاشتراكات)', report.financial.totalGrossSales],
    ['مبيعات الحجوزات التعاقدية', report.financial.bookingGrossSales],
    ['مبيعات الاشتراكات', report.financial.subscriptionGrossSales],
    ['دفعات مسجلة ومتحقق منها - عدد', report.financial.verifiedPaymentCount],
    ['الإيراد المحصل فعليًا', report.financial.verifiedPaymentAmount],
    ['حجوزات مدفوعة جزئيًا', report.financial.partialBookingCount],
    ['المحصّل على الحجوزات الجزئية', report.financial.partialAmountPaid],
    ['المبلغ المستحق', report.financial.amountDue],
    ['الاستردادات - عدد', report.financial.refundCount],
    ['الاستردادات - قيمة', report.financial.refunds],
    ['صافي المحصّل بعد الاسترداد', report.financial.netCollected],
    ['صافي المحصّل للفترة السابقة المماثلة', report.financial.comparisonNetCollected],
    ['فارق المبيعات', report.financial.salesChangeAmount],
    ['نمو المبيعات %', report.financial.salesGrowthRate ?? 'لا توجد قاعدة مقارنة للفترة السابقة'],
    ['متوسط قيمة الحجز', report.financial.averageBookingValue],
    [],
    ['ملخص التشغيل'],
    ['استغلال طاقة الفرق %', report.operations.utilizationRate],
    ['الوظائف المسندة', report.operations.utilizedJobs],
    ['الطاقة المتاحة بالوظائف', report.operations.availableJobSlots],
    ['متوسط مدة الخدمة بالدقائق', report.operations.averageServiceDurationMinutes],
    ['عينة مدة الخدمة', report.operations.durationSampleCount],
    ['الوصول في الموعد %', report.operations.onTimeArrivalRate],
    ['الوصولات في الموعد', report.operations.onTimeArrivalCount],
    ['عينة الوصول', report.operations.arrivalSampleCount],
    ['متوسط التأخير بالدقائق', report.operations.averageDelayMinutes],
    ['الوصولات المتأخرة', report.operations.delayedArrivalCount],
    ['اكتمال قوائم الفحص %', report.operations.checklistCompletionRate],
    ['عناصر الفحص المكتملة', report.operations.checkedChecklistItems],
    ['إجمالي عناصر الفحص', report.operations.checklistItemCount],
    ['العودة للفريق من الجودة %', report.operations.qualityReturnRate],
    ['مرات العودة للفريق', report.operations.qualityReturnCount],
    ['مراجعات الجودة', report.operations.qualityReviewCount],
    ['معدل الشكاوى %', report.operations.complaintRate],
    ['حجوزات لها شكاوى', report.operations.bookingsWithComplaints],
    ['إجمالي الشكاوى', report.operations.complaintCount],
    ['أفضل موظف بالخدمات المكتملة', report.operations.topEmployee?.label ?? 'لا توجد بيانات'],
    ['عدد خدمات أفضل موظف', report.operations.topEmployee?.count ?? 0],
    [],
    ['ملخص الاشتراكات'],
    ['الاشتراكات النشطة حاليًا', report.subscriptions.active],
    ['الاشتراكات الجديدة', report.subscriptions.newSubscriptions],
    ['الاشتراكات المنتهية', report.subscriptions.expired],
    ['الزيارات المستهلكة', report.subscriptions.visitsConsumed],
    ['الزيارات المتبقية', report.subscriptions.visitsRemaining],
    ['الاشتراكات المفعلة يدويًا', report.subscriptions.activatedCount],
    ['قيمة الاشتراكات المفعلة', report.subscriptions.recordedRevenue],
    [],
    ['ملخص الإلغاءات وإعادة الجدولة'],
    ['طلبات الإلغاء', report.cancellations.totalRequests],
    ['إجمالي الاسترداد', report.cancellations.refundTotal],
    ['الحجوزات المعاد جدولتها', report.cancellations.rescheduledCount],
    [],
    ['ملخص تقييمات وصوت العملاء'],
    ['إجمالي التقييمات', report.customerRatings.totalCount],
    ['متوسط التقييم العام', report.customerRatings.averageScore],
    ['التقييمات المعتمدة للنشر', report.customerRatings.approvedCount],
  ];

  addCountRows(rows, 'تقييمات العملاء حسب النجوم', report.customerRatings.byScore);
  rows.push([], ['متوسط التقييم حسب الخدمة'], ['الخدمة', 'عدد التقييمات', 'متوسط التقييم']);
  for (const item of report.customerRatings.byService) {
    rows.push([item.label, item.count, item.bookingValue]);
  }
  rows.push([], ['متوسط التقييم حسب الفرع'], ['الفرع', 'عدد التقييمات', 'متوسط التقييم']);
  for (const item of report.customerRatings.byBranch) {
    rows.push([item.label, item.count, item.bookingValue]);
  }

  addCountRows(rows, 'الحجوزات حسب الحالة', report.bookings.byStatus, (row) => (
    bookingStatusLabels[row.id as keyof typeof bookingStatusLabels] ?? row.label
  ));

  for (const [title, values] of [
    ['الحجوزات حسب الخدمة', report.bookings.byService],
    ['الحجوزات حسب الفرع', report.bookings.byBranch],
    ['الحجوزات حسب المنطقة', report.bookings.byZone],
    ['الحجوزات حسب الفريق', report.bookings.byTeam],
  ] as const) {
    rows.push([], [title], ['البند', 'الحجوزات', 'قيمة الحجوزات', 'المحصّل على الحجوزات']);
    for (const value of values) {
      rows.push([value.label, value.count, value.bookingValue, value.collected]);
    }
  }

  for (const [title, values] of [
    ['الإيراد حسب الخدمة', report.financial.byService],
    ['الإيراد حسب الفرع', report.financial.byBranch],
    ['الإيراد حسب الفريق', report.financial.byTeam],
  ] as const) {
    rows.push([], [title], ['البند', 'عدد الدفعات', 'المبلغ']);
    for (const value of values) rows.push([value.label, value.count, value.amount]);
  }

  addCountRows(rows, 'الوظائف حسب الفريق', report.operations.jobsByTeam);
  addCountRows(rows, 'الوظائف حسب الموظف', report.operations.jobsByEmployee);
  rows.push([], ['نسب إتمام الفرق'], ['الفريق', 'المسند', 'المكتمل', 'نسبة الإتمام %']);
  for (const value of report.operations.teamCompletion) {
    rows.push([value.label, value.assigned, value.completed, value.completionRate]);
  }
  addCountRows(rows, 'أسباب الإلغاء', report.cancellations.byReason);
  addCountRows(rows, 'المسؤول عن الإلغاء', report.cancellations.byResponsibleParty, (row) => (
    responsiblePartyLabels[row.id] ?? row.label
  ));

  rows.push(
    [],
    ['تفاصيل الحجوزات الواقعة في الفترة'],
    [
      'رقم الحجز',
      'الموعد',
      'الفرع',
      'الخدمة',
      'المنطقة',
      'التجمع',
      'الفريق',
      'حالة الحجز',
      'حالة الدفع',
      'قيمة الحجز',
      'المدفوع',
      'المتبقي',
    ],
  );
  for (const booking of report.rows) {
    rows.push([
      booking.bookingNumber,
      booking.startAt,
      booking.branch,
      booking.service,
      booking.zone,
      booking.area,
      booking.team,
      bookingStatusLabels[booking.bookingStatus],
      paymentStatusLabels[booking.paymentStatus],
      booking.totalPrice,
      booking.amountPaid,
      booking.amountDue,
    ]);
  }

  return csv(rows);
}
